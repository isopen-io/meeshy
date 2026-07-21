# Iteration 210i — `ProfileView` stats card VoiceOver grouping + hint

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Branch**: `claude/laughing-thompson-dj6dd5`
**Base**: `main` HEAD `0acec4f7c`
**File**: `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift` (+ source-level test)

## Surface
`ProfileView.statsSection` — the "Statistiques" card on the user's profile. Three
`statCard`s (messages / conversations / friend-requests, each a big value + a small
noun) sit inside a single `Button` whose tap opens the detailed-stats screen
(`showStats = true`).

## Defect (WCAG 1.3.1 / 4.1.2 — P0 in `ACCESSIBILITY_AUDIT.md:316`)
The `Button` wraps the three cards with **no accessibility grouping**. VoiceOver
auto-aggregates the six `Text` descendants into a jumbled run of context-light
fragments, and — worse — nothing tells the user the card is interactive: it looks
like a static stat display, but tapping it navigates to a detail screen. There was
**no `.accessibilityHint`**, so the primary affordance of the card was undiscoverable
to VoiceOver users.

## Fix
Collapse the button into one coherent element:

- `.accessibilityElement(children: .ignore)` — stops the fragment run.
- `.accessibilityLabel(statsAccessibilityLabel)` — a computed label that frames the
  values with the section title and pairs each value with its noun:
  `"Statistiques: {N} messages, {M} conversations, {K} demandes d'amis"`. Reuses the
  **existing** catalog keys `profile.section.stats`, `profile.stats.messages`,
  `.conversations`, `.friends` → **0 new key for the label**.
- `.accessibilityHint(…)` — one **inline** key `profile.stats.a11y.hint`
  ("Ouvre les statistiques détaillées", extracted at build like its siblings, **0
  `.xcstrings` edit**) announcing the navigation.

The `Button` element keeps its native `.isButton` trait (`.ignore` replaces the
children representation, not the button role).

## Scope
- **1 code file** (`ProfileView.swift`): +18 lines (helper + 3 modifiers).
- **1 test file** (`ProfileViewStatsAccessibilityTests.swift`): source-level guard
  mirroring `CallsTabAccessibilityTests` / `ContactsListTabAccessibilityTests`.
- **0 logic / 0 network / 0 layout / 0 visual change.** The visible stat cards are
  untouched; only the button's accessibility representation changes.
- **1 inline i18n key** (`profile.stats.a11y.hint`), 0 `.xcstrings` edit; label reuses
  4 existing keys.
- iOS 16 floor → all APIs need no availability guard.

## Verification
- `ProfileView.swift` is in **zero** open PRs (`search_pull_requests … ProfileView` →
  0). The audit-flagged sibling P0s on this file (avatar PhotosPicker `:262`) are left
  for a future single-behaviour iteration.
- iOS build not runnable under Linux (no Xcode/Swift toolchain) → gate = CI `iOS Tests`.

## Completion
Resolved. **⚠️ Do not re-flag** the `ProfileView` stats card for fragment grouping /
missing action hint (solved 210i).

### Track for 211i+
`ProfileView` avatar PhotosPicker (crayon) icon-only button without label
(`ACCESSIBILITY_AUDIT.md:315`, same file — distinct behaviour). Verify swarm collision
via `list_pull_requests` first.
