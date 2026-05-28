# TabSquad

> Keep tab groups organized.

A Chromium-based browser extension that does two things for native tab
groups:

1. **Routing**: intercept new tabs spawned from inside a tab group and
   send them somewhere else -- another tab group, another window, or
   out of the browser entirely via a custom URL scheme handler.
2. **Saved groups**: snapshot the URLs of a tab group and restore them
   later, reusing tabs that still point at the same URL.

The intended use case is to recreate, with native tab groups, the
kind of service isolation that all-in-one messenger apps (Ferdium,
Rambox, Franz, ...) provide: keep dedicated tabs (Slack, GitHub,
your CRM) together as a "squad", route every link they spawn
elsewhere, and reload the whole squad on demand.

## What TabSquad does not do

A dedicated all-in-one messenger app does more than just hold tabs
together.  TabSquad is just a browser extension, so a handful of those
features are out of reach -- here is what it does not do and what to
use instead:

- **Confirm before closing a tab.**  TabSquad cannot reliably gate
  every close: `beforeunload` only fires for tabs the user has
  interacted with, the dialog text is browser-controlled, and
  session-restored tabs are not covered.  Capture the squad as a
  saved group beforehand so you can restore it if it disappears, or
  fall back to the browser's Cmd/Ctrl+Shift+T to reopen the last
  closed tab.
- **Keep tabs always loaded.**  TabSquad does nothing to stop the
  browser from discarding a sleeping tab.  Use the browser's
  memory-saver / sleeping-tabs settings and add per-site "always
  keep this site active" exceptions there.
- **Per-group storage / sessions.**  All tabs share the same
  cookies, logins, and extensions of the current browser profile.
  If you need a fully separate identity for a squad, use a separate
  browser profile (or container) for it.
- **Dedicated taskbar icon or unread-count badge.**  TabSquad shows
  one toolbar icon for itself, not one per group.  For OS-level
  presence per service, the dedicated messenger apps still win.

## Status

Early development. Not yet published to any extension store.

## Features

### Routing rules

- Catches every new tab opened in the same window as a tab group --
  links clicked inside the group (`webNavigation.onCreatedNavigationTarget`)
  *and* tabs that appear in the window from elsewhere, such as
  bookmarks, the address bar, or external apps handing a URL to the
  browser (`tabs.onCreated` + `webNavigation.onCommitted`).
- Tabs sitting inside an unrelated tab group are never disturbed,
  so other groups in the same window keep their normal behaviour.
- Each rule has a **scope** that picks which of those tabs to act on:
  - **In the group** -- the source tab is inside the rule's group.
  - **As an orphan** -- the source tab is in the same window but is
    not part of any group.
  - **In the group or as an orphan** -- both of the above.
- Each rule has an optional **Rewrite URL** template that runs
  *before* the action.  If the rewritten URL targets a custom scheme
  (e.g. `hammerspoon://`) it is handed off to the OS handler and the
  tab is closed; if it stays an in-browser URL the tab navigates to
  it and the action below then operates on the new URL.
- Per-rule action chosen from:
  1. **Default** -- do nothing more (useful when the URL rewrite alone
     is the whole point of the rule).
  2. **Dismiss** -- close the tab immediately.  Focus returns to the
     source tab when one is known.
  3. **Move to the same group's tail** -- keep the tab in the source
     group but push it to the end.
  4. **Move to the window's tail** -- eject the tab from the group and
     pin it to the end of the current window.
  5. **Move to the next window's tail** -- push the tab into a
     different normal window. Creates one if none exists.
  6. **Move to a named tab group** -- find an existing group by title
     (current window first, then others), or create one in the current
     window.
- Rules are matched by tab group title and an optional URL regex
  (case-insensitive).  Navigations to the browser's own settings
  pages (`chrome://`, `edge://`, `about:`) and extension pages
  (`chrome-extension://`, `moz-extension://`) are always skipped.

### Saved groups

- Pick a tab group in the current window and click **Save** to record
  its URLs as a snapshot. Saving with the same group title overwrites
  the previous snapshot.
- Each snapshot can be expanded to edit, reorder, or remove individual
  URLs.
- **Restore** rebuilds the group in the current window using a
  diff-style update: tabs whose URL already matches a snapshot entry
  are kept; missing URLs are opened as new tabs; tabs not in the
  snapshot are closed.
- **Re-save** overwrites the snapshot from the group's current state.

### Storage

Settings are stored in `chrome.storage.sync` (with `chrome.storage.local`
as a fallback) and can be exported and imported as JSON.

### Open settings from the toolbar

Clicking the extension's toolbar icon opens TabSquad's options UI
as a popup.  The same page is also reachable as the regular
"Extension options" entry in the browser's extension manager.

## Permissions

| Permission      | Purpose                                       |
| --------------- | --------------------------------------------- |
| `tabs`          | Read tab URLs and create / move / close tabs. |
| `tabGroups`     | Read and update tab group titles.             |
| `webNavigation` | Catch new tabs created from links.            |
| `storage`       | Persist rules and saved groups.               |
| `history`       | Remove TabSquad's own handoff page from history after it fires an external scheme handler. |

No host permissions are requested. All URL matching and rewriting
happens inside the extension.

## Develop

```sh
pnpm install
pnpm dev          # Chrome
pnpm dev:edge
pnpm build        # Chrome
pnpm build:edge
pnpm zip
```

WXT generates the manifest and bundles entrypoints. See
`wxt.config.ts` for manifest details.

## URL handler recipes

When using the **Rewrite URL** step, you'll typically point the
template at a custom scheme handled outside the browser. Examples:

### Hammerspoon (macOS)

```lua
-- ~/.hammerspoon/init.lua
-- TabSquad (running in Chrome) sends links here to open them in Edge.
hs.urlevent.bind("open-in-edge", function(_, params)
  local url = params and params.url
  if not url or url == "" then return end
  hs.task.new("/usr/bin/open", nil, { "-g", "-a", "Microsoft Edge", url }):start()
end)

-- Reverse direction: TabSquad in Edge -> Chrome.
hs.urlevent.bind("open-in-chrome", function(_, params)
  local url = params and params.url
  if not url or url == "" then return end
  hs.task.new("/usr/bin/open", nil, { "-g", "-a", "Google Chrome", url }):start()
end)
```

Default URL templates pre-filled by TabSquad:

- Running in Chrome: `hammerspoon://open-in-edge?url={urlencoded}`
- Running in Edge: `hammerspoon://open-in-chrome?url={urlencoded}`

### Choosy / Finicky

If Choosy or Finicky is your default browser, you can use the raw
`{url}` template -- they will dispatch based on their own rules.

## License

[MIT](LICENSE) (c) 2026 Akinori Musha
