# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
While on `0.x.y`, the minor version bumps for new features and the patch
version bumps for fixes; once `1.0.0` ships we will revisit and likely
adopt strict [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.4.0] - 2026-05-28

### Added

- Show the options UI as a toolbar popup
- Add a "Dismiss" action that closes the routed tab

## [0.3.1] - 2026-05-15

### Fixed

- Stop the handoff page from lingering in browser history

## [0.3.0] - 2026-05-14

### Changed

- Split URL rewriting out of the action so rules can do both
- Hand external-scheme rewrites off through a dedicated tab page

### Fixed

- Stop leaving stray tabs after a rewrite to an external scheme

## [0.2.0] - 2026-05-13

### Added

- Add "+ Add URL" button to saved groups

### Changed

- Route orphan tabs and add source-scope condition to rules
- Use git-cliff for GitHub Release notes

## [0.1.0] - 2026-05-11

### Added

- Add saved groups to capture and restore tab groups
- Show tab group color on rule inputs and saved-group pills
- Add toolbar icon

### Changed

- Split routing rules into local-only and synced

