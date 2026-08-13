import type { Snapshot } from './types';

const TAB_GROUP_ID_NONE = -1;
const TAB_EDIT_RETRY_LIMIT = 10;
const TAB_EDIT_RETRY_DELAY_MS = 150;
const ORDER_PASS_LIMIT = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Chrome rejects tab mutations while the user is dragging a tab or a tab
// strip animation is in flight ("Tabs cannot be edited right now").  Retry
// briefly instead of aborting the restore halfway through.
async function withTabEditRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (
        attempt >= TAB_EDIT_RETRY_LIMIT ||
        !(err instanceof Error) ||
        !/cannot be edited/i.test(err.message)
      ) {
        throw err;
      }
      await sleep(TAB_EDIT_RETRY_DELAY_MS);
    }
  }
}

export interface GroupSnapshot {
  groupTitle: string;
  urls: string[];
}

function isCapturable(url: string | undefined): url is string {
  if (!url) return false;
  // Skip new-tab and the like which carry no useful URL.
  if (
    /^(chrome|edge|about):/i.test(url) &&
    url !== 'chrome://newtab/' &&
    url !== 'edge://newtab/'
  ) {
    return false;
  }
  if (url === 'about:blank') return false;
  return true;
}

/**
 * Capture the current state of a tab group in the given window as a snapshot.
 * Returns null when no group with that title exists in the window.
 */
export async function captureGroup(
  windowId: number,
  groupTitle: string,
): Promise<GroupSnapshot | null> {
  const groups = await chrome.tabGroups.query({ windowId, title: groupTitle });
  // If multiple groups share a title in the same window, take the first.
  const group = groups[0];
  if (!group) return null;
  const tabs = await chrome.tabs.query({ windowId, groupId: group.id });
  tabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const urls = tabs.map((t) => t.url).filter(isCapturable);
  return { groupTitle: group.title ?? groupTitle, urls };
}

/**
 * Restore a snapshot into the current window.  Reuses tabs whose URL already
 * appears in the snapshot, creates new tabs for missing URLs, and closes tabs
 * whose URL is not in the snapshot.  Tabs end up in the same order as the
 * snapshot, verified and re-applied until the tab strip actually matches.
 *
 * If a tab group with the snapshot's title already exists in the target
 * window, it is reused.  Otherwise the snapshot is materialised as a new
 * group in the target window.
 */
export async function restoreSnapshot(snapshot: Snapshot, targetWindowId: number): Promise<void> {
  if (snapshot.urls.length === 0) return;

  // Find an existing group with the snapshot title, preferring the target window.
  const candidates = await chrome.tabGroups.query({ title: snapshot.groupTitle });
  let existing = candidates.find((g) => g.windowId === targetWindowId) ?? candidates[0] ?? null;

  // If the existing group is in another window, bring it over as a whole.
  // chrome.tabGroups.move keeps the group id and its internal tab order,
  // whereas moving the tabs individually would ungroup them mid-flight.
  if (existing && existing.windowId !== targetWindowId) {
    const existingId = existing.id;
    try {
      existing =
        (await withTabEditRetry(() =>
          chrome.tabGroups.move(existingId, { windowId: targetWindowId, index: -1 }),
        )) ?? null;
    } catch {
      // Browsers that cannot move a group across windows: move the tabs
      // (which ungroups them) and regroup them under a fresh group.
      const existingTabs = (await chrome.tabs.query({ groupId: existingId })).sort(
        (a, b) => (a.index ?? 0) - (b.index ?? 0),
      );
      const ids = existingTabs.map((t) => t.id).filter((n): n is number => typeof n === 'number');
      existing = null;
      if (ids.length > 0) {
        await withTabEditRetry(() =>
          chrome.tabs.move(ids, { windowId: targetWindowId, index: -1 }),
        );
        const regroupedId = await withTabEditRetry(() =>
          chrome.tabs.group({
            createProperties: { windowId: targetWindowId },
            tabIds: ids as [number, ...number[]],
          }),
        );
        await chrome.tabGroups.update(regroupedId, { title: snapshot.groupTitle });
        existing = await chrome.tabGroups.get(regroupedId);
      }
    }
  }

  let groupId: number = existing?.id ?? TAB_GROUP_ID_NONE;

  // Index the group's current tabs by URL so snapshot URLs can reuse them.
  // A tab that is still loading exposes its destination only through
  // pendingUrl, so index both; usedTabIds below keeps a tab that matched
  // under both keys from being claimed twice.
  const presentByUrl = new Map<string, number[]>();
  const currentTabIds: number[] = [];
  if (groupId !== TAB_GROUP_ID_NONE) {
    const currentTabs = await chrome.tabs.query({ groupId });
    currentTabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const addPresent = (url: string | undefined, id: number): void => {
      if (!url) return;
      const list = presentByUrl.get(url);
      if (list) list.push(id);
      else presentByUrl.set(url, [id]);
    };
    for (const t of currentTabs) {
      if (t.id == null) continue;
      currentTabIds.push(t.id);
      addPresent(t.url, t.id);
      if (t.pendingUrl !== t.url) addPresent(t.pendingUrl, t.id);
    }
  }

  // Walk the snapshot in order: reuse a present tab, or create a new tab and
  // group it immediately.  Grouping each new tab as it is created keeps
  // Chrome from leaving the new tab outside the group and keeps the router's
  // orphan handling from rerouting it.
  const usedTabIds = new Set<number>();
  const orderedTabIds: number[] = [];
  for (const url of snapshot.urls) {
    const reuse = presentByUrl.get(url);
    let reusedId: number | undefined;
    while (reuse && reuse.length > 0) {
      const id = reuse.shift()!;
      if (!usedTabIds.has(id)) {
        reusedId = id;
        break;
      }
    }
    if (reusedId != null) {
      usedTabIds.add(reusedId);
      orderedTabIds.push(reusedId);
      continue;
    }
    const created = await chrome.tabs.create({
      windowId: targetWindowId,
      url,
      active: false,
    });
    const createdId = created.id;
    if (createdId == null) continue;
    if (groupId === TAB_GROUP_ID_NONE) {
      groupId = await withTabEditRetry(() =>
        chrome.tabs.group({
          createProperties: { windowId: targetWindowId },
          tabIds: [createdId],
        }),
      );
      await chrome.tabGroups.update(groupId, { title: snapshot.groupTitle });
    } else {
      const knownGroupId = groupId;
      await withTabEditRetry(() =>
        chrome.tabs.group({ groupId: knownGroupId, tabIds: [createdId] }),
      );
    }
    usedTabIds.add(createdId);
    orderedTabIds.push(createdId);
  }

  // Close any tabs that were in the group but are not part of the snapshot.
  const leftover = currentTabIds.filter((id) => !usedTabIds.has(id));
  if (leftover.length > 0) await withTabEditRetry(() => chrome.tabs.remove(leftover));

  if (orderedTabIds.length > 0 && groupId !== TAB_GROUP_ID_NONE) {
    await enforceGroupOrder(groupId, orderedTabIds, targetWindowId);
  }
}

/**
 * Reorder the group's tabs to match orderedTabIds, verifying the result and
 * retrying until it converges.  A single fire-and-forget pass is not enough:
 * chrome.tabs.move can eject a tab at a group boundary, and folding it back
 * in with chrome.tabs.group appends it at the group's tail, so each pass
 * re-checks membership and order before touching anything.
 */
async function enforceGroupOrder(
  groupId: number,
  orderedTabIds: number[],
  windowId: number,
): Promise<void> {
  for (let pass = 0; pass < ORDER_PASS_LIMIT; pass++) {
    // Drop tabs closed since the restore started.
    const aliveIds = new Set((await chrome.tabs.query({ windowId })).map((t) => t.id));
    const desired = orderedTabIds.filter((id) => aliveIds.has(id));
    if (desired.length === 0) return;

    // Fold ejected tabs back into the group.  Only strays are passed to
    // chrome.tabs.group: regrouping already-grouped tabs can shuffle them.
    const grouped = new Set((await chrome.tabs.query({ groupId })).map((t) => t.id));
    const strays = desired.filter((id) => !grouped.has(id));
    if (strays.length > 0) {
      await withTabEditRetry(() =>
        chrome.tabs.group({ groupId, tabIds: strays as [number, ...number[]] }),
      );
    }

    const current = (await chrome.tabs.query({ groupId })).sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );
    if (desired.every((id, i) => current[i]?.id === id)) return;
    const baseIndex = current[0]?.index ?? 0;

    // Fix slots left to right: the tab for slot i always sits at or right of
    // its target, so each move only pulls it leftward and never disturbs the
    // slots already fixed.
    for (const [i, tabId] of desired.entries()) {
      await withTabEditRetry(() => chrome.tabs.move(tabId, { windowId, index: baseIndex + i }));
    }
  }
  console.warn('[TabSquad] tab order did not fully converge after restore');
}

/**
 * List tab groups in a given window (or all windows when windowId is omitted),
 * for the options UI's "Save tab group" picker.
 */
export async function listGroups(windowId?: number): Promise<chrome.tabGroups.TabGroup[]> {
  const query: chrome.tabGroups.QueryInfo = {};
  if (windowId != null) query.windowId = windowId;
  return chrome.tabGroups.query(query);
}
