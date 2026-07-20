# Plan — Iteration-179i — VoiceOver dismiss label for `VideoFullscreenPlayer`

**Date:** 2026-07-20 · **Scope:** iOS only · **Type:** a11y + i18n (reuse existing key)

## Objective

Give the fullscreen video composer-preview's only exit control an accessible,
localized name, using the app-wide `common.close` convention. Zero visual,
logic, or new-key change.

## Target

`apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift`
→ `VideoFullscreenPlayer.body` → top-left dismiss `Button { dismiss() }`.

## Steps

1. [x] Restart working branch from latest `origin/main` (`claude/laughing-thompson-wj4mu5`).
2. [x] Confirm no open PR touches `VideoLegacySupport.swift` (`list_pull_requests`).
3. [x] Confirm the reused key + call shape (`common.close`, `defaultValue: "Fermer"`)
       against the ~15 existing close-button sites.
4. [x] Add `.accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))`
       on the dismiss `Button`.
5. [x] Leave the `.system(size: 28)` glyph frozen (decorative control chrome over
       fullscreen video — Dynamic Type freeze doctrine 82i/162i).
6. [x] Write analysis + plan docs (179i).
7. [x] Commit, push, update `branch-tracking.md` pointer.

## Constraints

- 1 file, 0 logic, 0 visual, 0 new i18n key (0 xcstrings), 0 new test.
- Reuse only — no new component, no layout change, no Indigo-palette touch.
- Gate = CI `iOS Tests` (macOS runner; build/VoiceOver validated in CI).

## Non-goals (deferred)

- `CrashReportSheet` (178i #2105 in flight).
- `PeopleDiscoveryView` / `DiscoveryTab` i18n + selected-state (next candidate).
- `ContactFilter` / `RequestFilter` raw-value i18n.
