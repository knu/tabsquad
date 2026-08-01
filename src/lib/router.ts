import { applyTemplate } from './template';
import type { Action, Rule } from './types';

const TAB_GROUP_ID_NONE = -1;

// URL schemes the browser can render itself.  Anything outside this
// list is treated as a hand-off to an OS scheme handler, after which
// the source tab is closed.
const BROWSER_HANDLED_SCHEME_RE = /^(https?|chrome-extension|moz-extension|chrome|edge|about):/i;

interface DispatchContext {
  tabId: number;
  url: string;
  sourceTabId: number;
  sourceWindowId: number;
  sourceGroupId: number;
  ruleGroupId: number;
}

export interface TransformResult {
  // The URL the tab now points at (the rewritten one, or the original
  // when the rule has no urlTransform / the transform was a no-op).
  url: string;
  // True when the rewritten URL has been handed off to an OS handler
  // and the tab has been closed.  Callers should skip the rule's
  // follow-up action in that case.
  consumed: boolean;
}

// Apply the rule's optional urlTransform to the navigation.  If the
// rewrite targets a non-browser scheme, route the tab through the
// handoff page so window.open fires the system handler reliably and
// the background script can close the handoff tab once the child tab
// appears.  Otherwise the tab is navigated directly to the new URL
// and the caller can keep going with the rule's action.
export async function applyUrlTransform(
  rule: Rule,
  ctx: DispatchContext,
): Promise<TransformResult> {
  if (!rule.urlTransform) return { url: ctx.url, consumed: false };
  const next = applyTemplate(rule.urlTransform, ctx.url);
  if (!next || next === ctx.url) return { url: ctx.url, consumed: false };
  if (!BROWSER_HANDLED_SCHEME_RE.test(next)) {
    const handoff = chrome.runtime.getURL(`handoff.html?url=${encodeURIComponent(next)}`);
    await chrome.tabs.update(ctx.tabId, { url: handoff });
    return { url: next, consumed: true };
  }
  await chrome.tabs.update(ctx.tabId, { url: next });
  return { url: next, consumed: false };
}

export async function dispatch(rule: Rule, ctx: DispatchContext): Promise<void> {
  const { action } = rule;
  try {
    switch (action.kind) {
      case 'default':
        return;
      case 'dismiss':
        await runDismiss(ctx);
        return;
      case 'groupTail':
        await runGroupTail(ctx);
        return;
      case 'windowTail':
        await runWindowTail(ctx);
        return;
      case 'nextWindowTail':
        await runNextWindowTail(ctx);
        return;
      case 'targetGroup':
        await runTargetGroup(action.groupTitle, ctx);
        return;
      default: {
        const _exhaustive: never = action;
        void _exhaustive;
      }
    }
  } catch (err) {
    console.warn('[TabSquad] action failed; leaving tab in default state', err);
  }
}

async function runDismiss(ctx: DispatchContext): Promise<void> {
  // Restore focus to the source tab before removing the dismissed tab
  // so the browser's "focus the neighbor on close" behavior doesn't
  // jump to whichever tab happens to be next to it.
  if (ctx.sourceTabId !== ctx.tabId) {
    try {
      await chrome.tabs.update(ctx.sourceTabId, { active: true });
    } catch {
      // source tab may be gone — ignore
    }
  }
  try {
    await chrome.tabs.remove(ctx.tabId);
  } catch {
    // already gone — ignore
  }
}

async function runGroupTail(ctx: DispatchContext): Promise<void> {
  const groupId = ctx.sourceGroupId !== TAB_GROUP_ID_NONE ? ctx.sourceGroupId : ctx.ruleGroupId;
  if (groupId === TAB_GROUP_ID_NONE) return;
  await chrome.tabs.move(ctx.tabId, { index: -1 });
  await chrome.tabs.group({
    groupId,
    tabIds: [ctx.tabId],
  });
}

async function runWindowTail(ctx: DispatchContext): Promise<void> {
  await safeUngroup(ctx.tabId);
  await chrome.tabs.move(ctx.tabId, { windowId: ctx.sourceWindowId, index: -1 });
}

async function runNextWindowTail(ctx: DispatchContext): Promise<void> {
  const targetWindowId = await pickNextNormalWindow(ctx.sourceWindowId);
  if (targetWindowId === undefined) {
    const created = await chrome.windows.create({ tabId: ctx.tabId, focused: true });
    if (created?.id != null) await safeUngroup(ctx.tabId);
    return;
  }
  await safeUngroup(ctx.tabId);
  await chrome.tabs.move(ctx.tabId, { windowId: targetWindowId, index: -1 });
  await chrome.tabs.update(ctx.tabId, { active: true });
  await chrome.windows.update(targetWindowId, { focused: true });
}

async function runTargetGroup(title: string, ctx: DispatchContext): Promise<void> {
  const groups = await chrome.tabGroups.query({ title });

  // Prefer a group already in the source window.
  const sameWindow = groups.find((g) => g.windowId === ctx.sourceWindowId);
  const target = sameWindow ?? groups[0];

  if (target) {
    if (target.windowId !== ctx.sourceWindowId) {
      await safeUngroup(ctx.tabId);
      await chrome.tabs.move(ctx.tabId, { windowId: target.windowId, index: -1 });
    }
    await chrome.tabs.group({ groupId: target.id, tabIds: [ctx.tabId] });
    return;
  }

  // Create a new group in the source window.
  await safeUngroup(ctx.tabId);
  await chrome.tabs.move(ctx.tabId, { windowId: ctx.sourceWindowId, index: -1 });
  const newGroupId = await chrome.tabs.group({
    createProperties: { windowId: ctx.sourceWindowId },
    tabIds: [ctx.tabId],
  });
  await chrome.tabGroups.update(newGroupId, { title });
}

async function safeUngroup(tabId: number): Promise<void> {
  try {
    await chrome.tabs.ungroup([tabId]);
  } catch {
    // already ungrouped or transient — ignore
  }
}

async function pickNextNormalWindow(currentWindowId: number): Promise<number | undefined> {
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const normals = windows.filter((w) => w.id != null && w.type === 'normal');
  if (normals.length < 2) return undefined;
  const idx = normals.findIndex((w) => w.id === currentWindowId);
  if (idx === -1) return normals[0]?.id ?? undefined;
  const next = normals[(idx + 1) % normals.length];
  return next?.id ?? undefined;
}

export type { Action };
