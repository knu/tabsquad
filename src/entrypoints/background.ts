import { defineBackground } from 'wxt/utils/define-background';
import { findMatchingRule } from '../lib/match';
import { applyUrlTransform, dispatch } from '../lib/router';
import { loadSettings, onSettingsChanged } from '../lib/storage';
import { DEFAULT_SETTINGS, Settings } from '../lib/types';

const TAB_GROUP_ID_NONE = -1;
const RECENTLY_DISPATCHED_TTL_MS = 5_000;
const ORPHAN_TTL_MS = 30_000;
const STARTUP_QUIET_MS = 5_000;
const QUIET_WINDOW_TTL_MS = 10_000;

const EXCLUDED_URL_PREFIXES = [
  'chrome://',
  'edge://',
  'about:',
  'chrome-extension://',
  'moz-extension://',
];

function isExcludedUrl(url: string): boolean {
  return EXCLUDED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export default defineBackground(() => {
  let cachedSettings: Settings = DEFAULT_SETTINGS;
  const recentlyDispatchedTabs = new Map<number, number>();
  const orphanTabs = new Map<number, number>();
  const quietWindows = new Map<number, number>();
  const startupAt = Date.now();

  const refreshSettings = async (): Promise<void> => {
    cachedSettings = await loadSettings();
  };

  const rememberDispatch = (tabId: number): void => {
    recentlyDispatchedTabs.set(tabId, Date.now());
    if (recentlyDispatchedTabs.size > 100) {
      const cutoff = Date.now() - RECENTLY_DISPATCHED_TTL_MS;
      for (const [id, ts] of recentlyDispatchedTabs) {
        if (ts < cutoff) recentlyDispatchedTabs.delete(id);
      }
    }
  };

  const wasRecentlyDispatched = (tabId: number): boolean => {
    const ts = recentlyDispatchedTabs.get(tabId);
    if (ts == null) return false;
    if (Date.now() - ts > RECENTLY_DISPATCHED_TTL_MS) {
      recentlyDispatchedTabs.delete(tabId);
      return false;
    }
    return true;
  };

  const rememberOrphan = (tabId: number): void => {
    orphanTabs.set(tabId, Date.now());
    if (orphanTabs.size > 200) {
      const cutoff = Date.now() - ORPHAN_TTL_MS;
      for (const [id, ts] of orphanTabs) {
        if (ts < cutoff) orphanTabs.delete(id);
      }
    }
  };

  const consumeOrphan = (tabId: number): boolean => {
    const ts = orphanTabs.get(tabId);
    if (ts == null) return false;
    orphanTabs.delete(tabId);
    return Date.now() - ts <= ORPHAN_TTL_MS;
  };

  const handleFromSourceTab = async (
    details: chrome.webNavigation.WebNavigationSourceCallbackDetails,
  ): Promise<void> => {
    if (isExcludedUrl(details.url)) return;
    if (wasRecentlyDispatched(details.tabId)) return;

    let sourceTab: chrome.tabs.Tab;
    try {
      sourceTab = await chrome.tabs.get(details.sourceTabId);
    } catch {
      return;
    }
    const sourceGroupId = sourceTab.groupId ?? TAB_GROUP_ID_NONE;

    let sourceGroup: chrome.tabGroups.TabGroup | null = null;
    if (sourceGroupId !== TAB_GROUP_ID_NONE) {
      try {
        sourceGroup = await chrome.tabGroups.get(sourceGroupId);
      } catch {
        sourceGroup = null;
      }
    }

    let sameWindowGroups: chrome.tabGroups.TabGroup[] = [];
    try {
      sameWindowGroups = await chrome.tabGroups.query({ windowId: sourceTab.windowId });
    } catch {
      sameWindowGroups = sourceGroup ? [sourceGroup] : [];
    }

    const matched = findMatchingRule(
      [...cachedSettings.localRules, ...cachedSettings.syncedRules],
      {
        url: details.url,
        sourceGroup,
        sameWindowGroups,
      },
    );
    if (!matched) return;

    rememberDispatch(details.tabId);

    const ctx = {
      tabId: details.tabId,
      url: details.url,
      sourceTabId: details.sourceTabId,
      sourceWindowId: sourceTab.windowId,
      sourceGroupId,
      ruleGroupId: matched.ruleGroup?.id ?? TAB_GROUP_ID_NONE,
    };
    const transformed = await applyUrlTransform(matched.rule, ctx);
    if (transformed.consumed) {
      handoffRestoreTargets.set(details.tabId, details.sourceTabId);
      return;
    }
    await dispatch(matched.rule, { ...ctx, url: transformed.url });
  };

  const handleOrphanCommit = async (
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
  ): Promise<void> => {
    if (details.frameId !== 0) return;
    if (isExcludedUrl(details.url)) return;
    // auto_toplevel covers new-tab pages, session restore, and other
    // navigations the user did not actively request, none of which
    // should be re-routed.
    if (details.transitionType === 'auto_toplevel') return;
    if (wasRecentlyDispatched(details.tabId)) return;
    if (!consumeOrphan(details.tabId)) return;

    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(details.tabId);
    } catch {
      return;
    }
    const groupId = tab.groupId ?? TAB_GROUP_ID_NONE;
    if (groupId !== TAB_GROUP_ID_NONE) return;

    let sameWindowGroups: chrome.tabGroups.TabGroup[] = [];
    try {
      sameWindowGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
    } catch {
      sameWindowGroups = [];
    }
    if (sameWindowGroups.length === 0) return;

    const matched = findMatchingRule(
      [...cachedSettings.localRules, ...cachedSettings.syncedRules],
      {
        url: details.url,
        sourceGroup: null,
        sameWindowGroups,
      },
    );
    if (!matched) return;

    rememberDispatch(details.tabId);

    const ctx = {
      tabId: details.tabId,
      url: details.url,
      // Treat the opener (the tab the user was on) as the source so
      // dismiss/handoff can restore focus there.  Fall back to the
      // orphan tab itself when there is no opener.
      sourceTabId: tab.openerTabId ?? details.tabId,
      sourceWindowId: tab.windowId,
      sourceGroupId: TAB_GROUP_ID_NONE,
      ruleGroupId: matched.ruleGroup?.id ?? TAB_GROUP_ID_NONE,
    };
    const transformed = await applyUrlTransform(matched.rule, ctx);
    if (transformed.consumed) {
      handoffRestoreTargets.set(details.tabId, ctx.sourceTabId);
      return;
    }
    await dispatch(matched.rule, { ...ctx, url: transformed.url });
  };

  void refreshSettings();
  onSettingsChanged((next) => {
    cachedSettings = next;
  });

  chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    void handleFromSourceTab(details);
  });

  const isQuietWindow = (windowId: number): boolean => {
    const ts = quietWindows.get(windowId);
    if (ts == null) return false;
    if (Date.now() - ts > QUIET_WINDOW_TTL_MS) {
      quietWindows.delete(windowId);
      return false;
    }
    return true;
  };

  chrome.windows.onCreated.addListener((win) => {
    if (win.id == null) return;
    if (Date.now() - startupAt < STARTUP_QUIET_MS) {
      quietWindows.set(win.id, Date.now());
    }
  });

  const handoffUrlPrefix = chrome.runtime.getURL('handoff.html');
  // handoff tab id -> the tab we should refocus once the handoff tab is closed.
  const handoffRestoreTargets = new Map<number, number>();

  const closeHandoffTab = async (handoffTabId: number): Promise<void> => {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(handoffTabId);
    } catch {
      return;
    }
    const tabUrl = tab.url ?? tab.pendingUrl ?? '';
    if (!tabUrl.startsWith(handoffUrlPrefix)) return;
    const restoreTabId = handoffRestoreTargets.get(handoffTabId);
    handoffRestoreTargets.delete(handoffTabId);
    // Activate the restore target *before* removing the handoff tab
    // so Chrome's default "focus the neighbor on close" behavior does
    // not steal focus onto the freshly-spawned external tab.
    if (restoreTabId != null) {
      try {
        await chrome.tabs.update(restoreTabId, { active: true });
      } catch {
        // restore target may be closed — ignore
      }
    }
    try {
      await chrome.tabs.remove(handoffTabId);
    } catch {
      // already gone — ignore
    }
    try {
      await chrome.history.deleteUrl({ url: tabUrl });
    } catch {
      // history entry may not exist yet — ignore
    }
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.kind === 'closeHandoffTab' && typeof msg.tabId === 'number') {
      void closeHandoffTab(msg.tabId);
    }
  });

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id == null) return;
    if (isQuietWindow(tab.windowId)) return;
    if ((tab.groupId ?? TAB_GROUP_ID_NONE) !== TAB_GROUP_ID_NONE) return;
    rememberOrphan(tab.id);
  });

  chrome.webNavigation.onCommitted.addListener((details) => {
    void handleOrphanCommit(details);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    orphanTabs.delete(tabId);
    handoffRestoreTargets.delete(tabId);
  });

  chrome.runtime.onInstalled.addListener(() => {
    void refreshSettings();
  });

  chrome.runtime.onStartup.addListener(() => {
    void refreshSettings();
  });
});
