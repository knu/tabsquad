import { colorForGroupTitle } from '../../lib/colors';
import { isUrlPatternValid } from '../../lib/match';
import {
  ACTION_LABELS,
  Action,
  ActionKind,
  DEFAULT_RULE_SOURCE_SCOPE,
  Rule,
  RULE_SOURCE_SCOPE_LABELS,
  RuleSourceScope,
} from '../../lib/types';

interface Props {
  rule: Rule;
  knownGroups: chrome.tabGroups.TabGroup[];
  defaultTemplate: string;
  isFirst: boolean;
  isLast: boolean;
  extraAction?: { label: string; onClick: () => void };
  onChange: (patch: Partial<Rule>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const ACTION_ORDER: ActionKind[] = [
  'default',
  'dismiss',
  'groupTail',
  'windowTail',
  'nextWindowTail',
  'targetGroup',
];

const SCOPE_ORDER: RuleSourceScope[] = ['inGroup', 'inWindowAsOrphan', 'inWindow'];

export function RuleEditor({
  rule,
  knownGroups,
  defaultTemplate,
  isFirst,
  isLast,
  extraAction,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
  const onActionKind = (kind: ActionKind) => {
    onChange({ action: defaultActionFor(kind, rule.action) });
  };

  const urlPattern = rule.urlPattern ?? '';
  const urlPatternValid = isUrlPatternValid(urlPattern);

  const groupTitles = dedupe(knownGroups.map((g) => g.title ?? '').filter(Boolean));
  const groupTitleColor = colorForGroupTitle(rule.groupTitle, knownGroups);
  const groupTitleStyle = groupTitleColor ? { background: groupTitleColor } : undefined;
  const destinationColor =
    rule.action.kind === 'targetGroup'
      ? colorForGroupTitle(rule.action.groupTitle, knownGroups)
      : undefined;
  const destinationStyle = destinationColor ? { background: destinationColor } : undefined;

  return (
    <div className={`rule${rule.enabled ? '' : ' disabled'}`}>
      <div className="rule-grid">
        <div className="cell cell--inline">
          <label className="rule-active">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
            />
            Active
          </label>
        </div>
        <div className="cell cell--inline cell--right">
          <div className="row-actions">
            {extraAction && (
              <button onClick={extraAction.onClick} title={extraAction.label}>
                {extraAction.label}
              </button>
            )}
            <button onClick={onMoveUp} disabled={isFirst} title="Move up">
              ↑
            </button>
            <button onClick={onMoveDown} disabled={isLast} title="Move down">
              ↓
            </button>
            <button className="danger" onClick={onRemove} title="Delete rule">
              ✕
            </button>
          </div>
        </div>

        <div className="cell">
          <label htmlFor={`group-title-${rule.id}`}>Tab Group</label>
          <input
            id={`group-title-${rule.id}`}
            type="text"
            className={groupTitleColor ? 'has-color' : undefined}
            placeholder="Tab group title (e.g. Work, Slack)"
            value={rule.groupTitle}
            list={`group-titles-${rule.id}`}
            style={groupTitleStyle}
            onChange={(e) => onChange({ groupTitle: e.target.value })}
          />
          <datalist id={`group-titles-${rule.id}`}>
            {groupTitles.map((title) => (
              <option key={title} value={title} />
            ))}
          </datalist>
          <label htmlFor={`scope-${rule.id}`}>Apply when source tab is</label>
          <select
            id={`scope-${rule.id}`}
            value={rule.scope ?? DEFAULT_RULE_SOURCE_SCOPE}
            onChange={(e) => onChange({ scope: e.target.value as RuleSourceScope })}
          >
            {SCOPE_ORDER.map((s) => (
              <option key={s} value={s}>
                {RULE_SOURCE_SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
          <p className="help">
            The new tab is opened in the same window as the source tab. An orphan is a tab not in
            any group.
          </p>
        </div>
        <div className="cell">
          <label htmlFor={`url-pattern-${rule.id}`}>URL pattern (regex)</label>
          <input
            id={`url-pattern-${rule.id}`}
            type="text"
            className="url-input"
            value={urlPattern}
            placeholder="^https?://(www\.)?example\.com/"
            aria-invalid={!urlPatternValid}
            onChange={(e) => onChange({ urlPattern: e.target.value || undefined })}
          />
          <p className="help">
            Case-insensitive. Leave empty to match every link.
            {!urlPatternValid && (
              <>
                {' '}
                <span className="error">Invalid regex — this rule will be skipped.</span>
              </>
            )}
          </p>
          <label htmlFor={`url-transform-${rule.id}`}>Rewrite URL (optional)</label>
          <input
            id={`url-transform-${rule.id}`}
            type="text"
            className="template-input"
            value={rule.urlTransform ?? ''}
            placeholder={defaultTemplate}
            onChange={(e) => onChange({ urlTransform: e.target.value || undefined })}
          />
          <p className="help">
            Placeholders: <code>{'{url}'}</code>, <code>{'{urlencoded}'}</code>,{' '}
            <code>{'{host}'}</code>, <code>{'{path}'}</code>, <code>{'{search}'}</code>,{' '}
            <code>{'{hash}'}</code>. Non-browser schemes (e.g. <code>hammerspoon://</code>) hand the
            URL to an OS handler and close the tab; browser-handled schemes navigate the tab and
            then the action below runs against the new URL.
          </p>
        </div>

        <div className="cell">
          <label htmlFor={`action-${rule.id}`}>Action</label>
          <select
            id={`action-${rule.id}`}
            value={rule.action.kind}
            onChange={(e) => onActionKind(e.target.value as ActionKind)}
          >
            {ACTION_ORDER.map((k) => (
              <option key={k} value={k}>
                {ACTION_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="cell">
          {rule.action.kind === 'targetGroup' && (
            <>
              <label htmlFor={`target-title-${rule.id}`}>Destination tab group</label>
              <input
                id={`target-title-${rule.id}`}
                type="text"
                className={destinationColor ? 'has-color' : undefined}
                placeholder="Group title (e.g. Outside)"
                list={`target-titles-${rule.id}`}
                value={rule.action.groupTitle}
                style={destinationStyle}
                onChange={(e) =>
                  onChange({ action: { kind: 'targetGroup', groupTitle: e.target.value } })
                }
              />
              <datalist id={`target-titles-${rule.id}`}>
                {groupTitles.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
              <p className="help">
                Existing group with this title is preferred (current window first); created in the
                current window if none exists.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function defaultActionFor(kind: ActionKind, prev: Action): Action {
  switch (kind) {
    case 'default':
      return { kind: 'default' };
    case 'dismiss':
      return { kind: 'dismiss' };
    case 'groupTail':
      return { kind: 'groupTail' };
    case 'windowTail':
      return { kind: 'windowTail' };
    case 'nextWindowTail':
      return { kind: 'nextWindowTail' };
    case 'targetGroup':
      return {
        kind: 'targetGroup',
        groupTitle: prev.kind === 'targetGroup' ? prev.groupTitle : '',
      };
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
