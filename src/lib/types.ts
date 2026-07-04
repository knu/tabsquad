export type ActionKind =
  'default' | 'dismiss' | 'groupTail' | 'windowTail' | 'nextWindowTail' | 'targetGroup';

export interface BaseAction {
  kind: ActionKind;
}

export interface DefaultAction extends BaseAction {
  kind: 'default';
}

export interface DismissAction extends BaseAction {
  kind: 'dismiss';
}

export interface GroupTailAction extends BaseAction {
  kind: 'groupTail';
}

export interface WindowTailAction extends BaseAction {
  kind: 'windowTail';
}

export interface NextWindowTailAction extends BaseAction {
  kind: 'nextWindowTail';
}

export interface TargetGroupAction extends BaseAction {
  kind: 'targetGroup';
  groupTitle: string;
}

export type Action =
  | DefaultAction
  | DismissAction
  | GroupTailAction
  | WindowTailAction
  | NextWindowTailAction
  | TargetGroupAction;

// Legacy action shape kept for storage/import normalization.  Rules
// loaded with this shape are rewritten into { urlTransform, action:
// DefaultAction } before reaching the rest of the app.
export interface LegacyRewriteAction {
  kind: 'rewrite';
  template: string;
}

export type RuleSourceScope = 'inGroup' | 'inWindowAsOrphan' | 'inWindow';

export const DEFAULT_RULE_SOURCE_SCOPE: RuleSourceScope = 'inGroup';

export const RULE_SOURCE_SCOPE_LABELS: Record<RuleSourceScope, string> = {
  inGroup: 'In the group',
  inWindowAsOrphan: 'As an orphan',
  inWindow: 'In the group or as an orphan',
};

export interface Rule {
  id: string;
  enabled: boolean;
  groupTitle: string;
  urlPattern?: string;
  scope?: RuleSourceScope;
  // Optional URL template applied before `action` runs.  When the
  // rewritten URL is handed off to an OS scheme handler the tab is
  // closed; when it stays in the browser, `action` then operates on
  // the rewritten URL.
  urlTransform?: string;
  action: Action;
}

export interface Snapshot {
  id: string;
  groupTitle: string;
  urls: string[];
  updatedAt: number;
}

export interface Settings {
  version: 1;
  syncedRules: Rule[];
  localRules: Rule[];
  snapshots: Snapshot[];
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  syncedRules: [],
  localRules: [],
  snapshots: [],
};

export const ACTION_LABELS: Record<ActionKind, string> = {
  default: 'Default (do nothing)',
  dismiss: 'Dismiss (close immediately)',
  groupTail: "Move to the same group's tail",
  windowTail: 'Move to the window tail',
  nextWindowTail: 'Move to the next window tail',
  targetGroup: 'Move to a named tab group',
};
