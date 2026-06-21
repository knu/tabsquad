import { Snapshot } from './types';

const TAB_GROUP_ID_NONE = -1;

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
  if (groups.length === 0) return null;
  // If multiple groups share a title in the same window, take the first.
  const group = groups[0];
  const tabs = await chrome.tabs.query({ windowId, groupId: group.id });
  tabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const urls = tabs.map((t) => t.url).filter(isCapturable);
  return { groupTitle: group.title ?? groupTitle, urls };
}

/**
 * Restore a snapshot into the current window.  Reuses tabs whose URL already
 * appears in the snapshot, creates new tabs for missing URLs, and closes tabs
 * whose URL is not in the snapshot.  Tabs end up in the same order as the
 * snapshot.
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

  // If the existing group is in another window, move all its tabs to the
  // target window first.  After the move, requery the group id in the target
  // window so we operate on a stable id.
  if (existing && existing.windowId !== targetWindowId) {
    const existingTabs = await chrome.tabs.query({ groupId: existing.id });
    const ids = existingTabs.map((t) => t.id).filter((n): n is number => typeof n === 'number');
    if (ids.length > 0) {
      await chrome.tabs.move(ids, { windowId: targetWindowId, index: -1 });
    }
    const moved = await chrome.tabGroups.query({
      title: snapshot.groupTitle,
      windowId: targetWindowId,
    });
    existing = moved[0] ?? null;
  }

  let groupId: number = existing?.id ?? TAB_GROUP_ID_NONE;

  // Map of url -> array of tabIds currently in the group, oldest first.
  const presentByUrl = new Map<string, number[]>();
  if (groupId !== TAB_GROUP_ID_NONE) {
    const currentTabs = await chrome.tabs.query({ groupId });
    currentTabs.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const t of currentTabs) {
      if (t.id == null || !t.url) continue;
      const list = presentByUrl.get(t.url);
      if (list) list.push(t.id);
      else presentByUrl.set(t.url, [t.id]);
    }
  }

  // Walk the snapshot in order: reuse a present tab, or create a new tab and
  // group it immediately.  Grouping each new tab as it is created keeps
  // Chrome from leaving the new tab outside the group.
  const orderedTabIds: number[] = [];
  for (const url of snapshot.urls) {
    const reuse = presentByUrl.get(url);
    if (reuse && reuse.length > 0) {
      orderedTabIds.push(reuse.shift()!);
      continue;
    }
    const created = await chrome.tabs.create({
      windowId: targetWindowId,
      url,
      active: false,
    });
    if (created.id == null) continue;
    if (groupId === TAB_GROUP_ID_NONE) {
      groupId = await chrome.tabs.group({
        createProperties: { windowId: targetWindowId },
        tabIds: [created.id],
      });
      await chrome.tabGroups.update(groupId, { title: snapshot.groupTitle });
    } else {
      await chrome.tabs.group({ groupId, tabIds: [created.id] });
    }
    orderedTabIds.push(created.id);
  }

  // Close any tabs that were in the group but are not part of the snapshot.
  const leftover: number[] = [];
  for (const ids of presentByUrl.values()) leftover.push(...ids);
  if (leftover.length > 0) await chrome.tabs.remove(leftover);

  // Reorder the surviving / created tabs to match the snapshot order.
  // We move each tab one at a time to its final position relative to the
  // window: a single chrome.tabs.move with an array can leave tabs outside
  // the group on some Chromium builds (notably Edge).  After moving, fold
  // any stragglers back into the group with chrome.tabs.group, which is a
  // no-op for tabs that are already in the group.
  if (orderedTabIds.length > 0 && groupId !== TAB_GROUP_ID_NONE) {
    const headTab = (await chrome.tabs.query({ groupId })).sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    )[0];
    const baseIndex = headTab?.index ?? -1;
    for (let i = 0; i < orderedTabIds.length; i += 1) {
      const targetIndex = baseIndex >= 0 ? baseIndex + i : -1;
      await chrome.tabs.move(orderedTabIds[i], {
        windowId: targetWindowId,
        index: targetIndex,
      });
    }
    // orderedTabIds is non-empty here (guarded above), which satisfies the
    // [number, ...number[]] tuple type chrome.tabs.group now expects.
    await chrome.tabs.group({
      groupId,
      tabIds: orderedTabIds as [number, ...number[]],
    });
  }
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
