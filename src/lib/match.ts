import { DEFAULT_RULE_SOURCE_SCOPE, type Rule } from './types';

const TAB_GROUP_ID_NONE = -1;

const regexCache = new Map<string, RegExp | null>();

function compileUrlPattern(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!;
  let compiled: RegExp | null;
  try {
    compiled = new RegExp(pattern, 'i');
  } catch {
    compiled = null;
  }
  regexCache.set(pattern, compiled);
  return compiled;
}

export function isUrlPatternValid(pattern: string): boolean {
  if (!pattern) return true;
  return compileUrlPattern(pattern) !== null;
}

export interface MatchContext {
  url: string;
  sourceGroup: chrome.tabGroups.TabGroup | null;
  sameWindowGroups: chrome.tabGroups.TabGroup[];
}

export interface MatchedRule {
  rule: Rule;
  ruleGroup: chrome.tabGroups.TabGroup | null;
}

export function findMatchingRule(rules: Rule[], ctx: MatchContext): MatchedRule | undefined {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.groupTitle) continue;

    const scope = rule.scope ?? DEFAULT_RULE_SOURCE_SCOPE;
    const sourceInGroup =
      ctx.sourceGroup != null && (ctx.sourceGroup.title ?? '') === rule.groupTitle;
    const sameWindowGroup =
      ctx.sameWindowGroups.find((g) => (g.title ?? '') === rule.groupTitle) ?? null;
    const sourceOutsideAnyGroup = ctx.sourceGroup == null;
    const sourceInWindowOutsideGroup = sourceOutsideAnyGroup && sameWindowGroup != null;

    let scopeMatches = false;
    let ruleGroup: chrome.tabGroups.TabGroup | null = null;
    switch (scope) {
      case 'inGroup':
        scopeMatches = sourceInGroup;
        ruleGroup = ctx.sourceGroup;
        break;
      case 'inWindowAsOrphan':
        scopeMatches = sourceInWindowOutsideGroup;
        ruleGroup = sameWindowGroup;
        break;
      case 'inWindow':
        if (sourceInGroup) {
          scopeMatches = true;
          ruleGroup = ctx.sourceGroup;
        } else if (sourceInWindowOutsideGroup) {
          scopeMatches = true;
          ruleGroup = sameWindowGroup;
        }
        break;
    }
    if (!scopeMatches) continue;

    if (rule.urlPattern) {
      const re = compileUrlPattern(rule.urlPattern);
      if (!re) continue;
      if (!re.test(ctx.url)) continue;
    }

    return { rule, ruleGroup };
  }
  return undefined;
}

export { TAB_GROUP_ID_NONE };
