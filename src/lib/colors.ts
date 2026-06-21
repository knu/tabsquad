// Chromium tab group colors mapped to CSS values that roughly match the
// browser UI.  The exact palette differs by browser; these are eyeballed.
const GROUP_COLOR_CSS: Record<`${chrome.tabGroups.Color}`, string> = {
  grey: '#8a8a8e',
  blue: '#3b82f6',
  red: '#ef4444',
  yellow: '#eab308',
  green: '#10b981',
  pink: '#ec4899',
  purple: '#a855f7',
  cyan: '#06b6d4',
  orange: '#f97316',
};

export function colorForGroupTitle(
  title: string,
  knownGroups: chrome.tabGroups.TabGroup[],
): string | undefined {
  if (!title) return undefined;
  const match = knownGroups.find((g) => (g.title ?? '') === title);
  if (!match) return undefined;
  return GROUP_COLOR_CSS[match.color];
}
