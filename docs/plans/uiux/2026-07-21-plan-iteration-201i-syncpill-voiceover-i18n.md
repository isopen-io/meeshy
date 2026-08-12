# Plan — Iteration-201i — `SyncPill` VoiceOver i18n

**Base**: `main` HEAD `3ec4d1c`
**Working branch**: `claude/laughing-thompson-9gi21m`
**Scope**: iOS only — single component + string catalogue

## Goal

Localize the two remaining hardcoded French VoiceOver literals in `SyncPill`,
bringing the component to full i18n parity with the rest of the app.

## Steps

1. [x] Confirm `SyncPill` is untouched by any open PR and has no prior analysis.
2. [x] Wrap `.accessibilityHint` literal in `String(localized:)` → key
   `sync.pill.a11y.openLocation.hint`.
3. [x] Wrap `accessibilityText` multi-signal literal in `String(localized:)` →
   key `sync.pill.a11y.multiple` with positional `%1$lld` / `%2$@`.
4. [x] Insert both keys into `Localizable.xcstrings` (de/en/es/fr/pt-BR),
   alphabetically between `swipe.unpin` and `tab.conversations`, no reflow.
5. [x] Validate catalogue JSON + diff (additions only).
6. [x] Update `branch-tracking.md` + write analysis doc.
7. [ ] Commit, push, open PR — gate = CI `iOS Tests`.

## Constraints honoured

- No business/logic/network/layout change; a11y strings only.
- Source-language (`fr`) parity: `defaultValue` = original French text.
- No SDK change (app-scoped component).
- Zero reflow of existing catalogue keys.

## Risk

- Minimal. `String(localized:defaultValue:bundle:)` with interpolated
  `defaultValue` is an established pattern in this codebase; positional
  placeholders mirror `story.mine.row.a11y`.
- Not locally buildable (Linux host) — relies on CI iOS Tests.
