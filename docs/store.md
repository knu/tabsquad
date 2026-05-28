# Chrome Web Store listing copy

Source for the texts that go into the Chrome Web Store dashboard for
TabSquad.  Copy each section into the corresponding field when filing
or updating the listing.

## Item name

TabSquad

## Summary (max 132 characters)

Route links spawned from or alongside a tab group to another
window, group, or external handler -- and snapshot whole groups.

(125 characters; tweak only if Chrome rejects.)

## Category

Workflow & Planning.

## Language

English (en).

## Detailed description

TabSquad turns a Chromium tab group into a "squad" of tabs that stay
together, and gives you control over what happens to the links those
tabs spawn.

Routing rules

For each tab group title, choose what happens when a new tab is
opened from a link click, middle click, Cmd/Ctrl+click, window.open,
or even from an external app handing a URL to your browser.

A rule optionally rewrites the URL through a template first.  When
the rewritten URL is a custom scheme (e.g. hammerspoon://) it is
handed off to the OS handler and the tab is closed; when it stays
an in-browser URL the tab navigates to it and then the action
below applies to the new URL.

Then choose an action:

- Do nothing (the browser default).
- Dismiss the tab (close it immediately).
- Move the tab to the same group's tail.
- Move the tab to the current window's tail, outside the group.
- Move the tab to a different normal window (creates one if there
  is none).
- Move the tab into a named target tab group, creating it if needed.

Each rule also picks when it applies, based on where the source
tab sits:

- In the group (the original behavior).
- As an orphan -- a tab in the same window that does not belong
  to any group, e.g. one freshly opened by an external app.
- In the group or as an orphan.

Tabs sitting inside an unrelated group are never disturbed.

Rules are matched by tab group title plus an optional URL regex.
The matching engine evaluates local-only rules first so a
machine-specific rule can override a synced one.  Navigations to
the browser's own settings pages (chrome://, edge://, about:) and
extension pages (chrome-extension://, moz-extension://) are skipped
so they stay in the window where you opened them.

Saved groups

Capture the URLs of a tab group as a snapshot, edit them, and
restore them later.  Restore does a diff-style update: tabs whose
URL still matches stay in place, missing URLs open as new tabs, and
tabs that are no longer in the snapshot are closed.  Snapshots
travel with your browser profile sync.

Privacy

TabSquad does not run a server, does not collect analytics, and
does not request any host permissions, so it cannot read the
content of pages you visit.  All your settings live inside the
browser's extension storage.

Configuration

Click the toolbar icon to open TabSquad's options UI as a popup.
The same page is also reachable as the regular "Extension options"
entry in the browser's extension manager.  Routing rules and
saved groups can be exported and imported as JSON.

## Single purpose

TabSquad routes new tabs opened from inside a tab group or alongside
one, and lets the user snapshot and restore the URLs of a tab group.

## Permission justifications

| Permission      | Why TabSquad needs it                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tabs`          | Read a tab's URL and tab group membership; create, move, close tabs to enact the chosen routing action and to restore a saved group. |
| `tabGroups`     | Read a tab group's title to match rules and snapshots, and update group titles when restoring a saved group into a new group.        |
| `webNavigation` | Detect new tabs created from a link click or `window.open` so TabSquad can apply a routing rule to the freshly-opened tab.           |
| `storage`       | Persist the user's routing rules and saved-group snapshots in the browser's own extension storage.                                   |
| `history`       | Delete TabSquad's own internal handoff page from the browser history after it has fired an external scheme handler, so it does not clutter the history view or the "recently closed tabs" list.  TabSquad does not read or modify any other entries. |

No host permissions are requested.  TabSquad never reads page contents.

## Data usage declaration

Use the following answers when filling out the privacy practices form
in the dashboard:

- Does this item collect or use personally identifiable information? -- **No**.
- Does this item collect or use health information? -- **No**.
- Does this item collect or use financial and payment information? -- **No**.
- Does this item collect or use authentication information? -- **No**.
- Does this item collect or use personal communications? -- **No**.
- Does this item collect or use location? -- **No**.
- Does this item collect or use web history? -- **No**.  (TabSquad
  inspects a new tab's URL in memory to apply the matching rule, but
  never logs, transmits, or persists browsing history.)
- Does this item collect or use user activity? -- **No**.
- Does this item collect or use website content? -- **No**.

Certifications:

- I do not use or transfer user data for purposes that are unrelated
  to my item's single purpose. -- certify.
- I do not use or transfer user data to determine creditworthiness or
  for lending purposes. -- certify.
- I do not sell user data to third parties as outlined in the Limited
  Use policy. -- certify.

## Privacy policy URL

https://github.com/knu/tabsquad/blob/main/docs/privacy.md

## Homepage / support URL

https://github.com/knu/tabsquad

Issues are tracked at https://github.com/knu/tabsquad/issues.

## Screenshots

`docs/screenshot.png` is the canonical hero image:

- a Synced routing rule for the "Home" tab group that rewrites
  links matching `^https?://(www\.)?example\.com/` into a
  `hammerspoon://open-in-alt-browser?url={urlencoded}` template, and
- the same "Home" group expanded inside Saved groups, listing five
  representative URLs (Gmail, iCloud Mail, Facebook Messages,
  Instagram Direct, Discord).

Both major features are visible in one frame, so a single
screenshot is enough for the initial submission.  The dashboard
accepts 1280x800 or 640x400 PNG/JPEG; the current PNG is roughly
square, so before upload pad it to 1280x800 (preferred) on a white
or light-grey background rather than stretching the screenshot.

Capture an extra screenshot per feature later if Chrome's editorial
team or reviewers request more variety.

## Promotional images

Skip until Google requests them.  When needed:

- Small tile 440x280.
- Marquee 1400x560 (only for featured items).
