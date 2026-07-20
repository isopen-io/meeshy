# Iteration-186i — VoiceOver active-pellet state + close-button label for `MessageMoreSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — exploration-grid selected state + icon-only close button
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift` (1 file, 0 logic, 0 visual, 0 new i18n key)
**Test added:** `apps/ios/MeeshyTests/Unit/Views/MessageMoreSheetAccessibilityTests.swift` (source-level guard, mirrors `CallsTabAccessibilityTests`)

## Component

`MessageMoreSheet` is the « Plus… » sheet reached from a message's long-press
menu (`MessageOverlayMenu` → swipe-up « Plus… »). It renders a Liquid-Glass
grid of colored **pellets** grouped into sections (Actions / Infos & Prisme /
Modération). Tapping an *exploration* pellet (`language`, `views`, `reactions`,
`transcription`, `sentiment`, `history`, `report`) toggles an **inline
exploration panel** open beneath the grid (reusing the `MessageDetail` views);
tapping a one-shot *action* pellet (`reply`, `forward`, `thread`,
`deleteMedia`) fires immediately. The open exploration panel carries a header
with an icon-only close button that collapses it.

The pellet builder already had `.accessibilityLabel(labelText(item))` (added in
a prior pass to suppress the "glyph + text" double read). The rest of the sheet
is fully localized (`String(localized:defaultValue:)` throughout) and uses only
semantic fonts (`.caption2`/`.callout`/`.footnote`/`.subheadline`) — Dynamic
Type and i18n were already sound. The entire remaining gap was VoiceOver.

## Findings

Two genuine VoiceOver gaps, both matching defect classes already resolved
elsewhere in this codebase:

1. **Open pellet state signalled by color only (WCAG 1.4.1).** When an
   exploration pellet is expanded, `isActive == (selectedItem == item &&
   isExploration(item))` drives three *purely visual* changes and nothing else:
   circle fill opacity (`0.35`/`0.40` vs `0.15`/`0.25`, lines 135–140), stroke
   color + width (`0.5` opacity / `1.5`pt vs `0.2` / `0.5`pt, lines 177–179),
   and label tint (`isActive ? color : theme.textSecondary`, line 190). The
   pellet `Button` carried **no `.accessibilityAddTraits(.isSelected)`**, so a
   VoiceOver user sweeping the grid heard every pellet read identically — the
   currently expanded pellet was indistinguishable from the collapsed ones.
   Same "state by color only" gap fixed on selectable rows in 149i / 155i /
   163i / 177i / 178i.

2. **Icon-only close button with no label.** The inline header's close button
   (line ~252) is `Image(systemName: "xmark.circle.fill")` with
   `.buttonStyle(.plain)` and **no `.accessibilityLabel`**. VoiceOver falls
   back to reading the raw SF Symbol name ("xmark circle fill") instead of an
   intelligible action.

## Fix

Minimal, additive, scoped to the two sites — no layout / color / logic change:

- **Pellet:** `.accessibilityAddTraits(isActive ? [.isSelected] : [])` on the
  pellet `Button`, right after the existing `.accessibilityLabel`. The expanded
  exploration pellet is now announced as "selected" (localized by iOS, **0 new
  key**). The one-shot action pellets never become `isActive` (guarded by
  `&& isExploration(item)`), so they correctly never receive the trait.
- **Close button:** `.accessibilityLabel(String(localized: "common.close",
  defaultValue: "Fermer", bundle: .main))` — reuses the **SSOT `common.close`
  key** already used across the app (camera/emoji/media close buttons), **0 new
  key**.

No `.accessibilityElement(children: .combine)` was added: SwiftUI `Button`s
already aggregate their label subtree into a single element with `.isButton`,
so the pellet reads one clean stop ("Langue, selected, button").

## Rationale

`MessageMoreSheet` is a high-traffic surface — it is the entry point to
translation exploration (the Prisme Linguistique), reactions, transcription,
edit history and reporting. A VoiceOver user must be able to tell which
exploration panel is currently open (to know whether a second tap will open or
close it) and must be able to dismiss that panel. Both were previously
impossible by ear. The fix exposes the state and the action semantically
without touching the Indigo identity, layout, animation, or any product logic.

## Verification

- **Static review:** `.accessibilityAddTraits(cond ? [.isSelected] : [])`,
  `.accessibilityLabel(_:)`, and `String(localized:defaultValue:bundle:)` are
  standard SwiftUI iOS 16.0+ APIs with heavy precedent in this file and repo
  (CallsTab chip, 155i/177i selectable rows). App floor is iOS 16.0 → no
  availability guard needed.
- **No visual/logic change:** only accessibility modifiers added; the pellet
  grid, inline exploration, haptics, confirmation dialog and all callbacks are
  untouched.
- **Guard test:** `MessageMoreSheetAccessibilityTests` reads the source and
  asserts (1) the `pellet(_:)` builder adds `.accessibilityAddTraits` driven by
  `isActive`, and (2) the close button near `xmark.circle.fill` carries an
  `.accessibilityLabel` bound to `common.close`. Non-`@MainActor` `XCTestCase`
  (matches the test target's non-MainActor isolation and sibling
  `CallsTabAccessibilityTests`). Auto-included by CI `xcodegen generate`
  (MeeshyTests globs `MeeshyTests/**`).
- **CI gate:** `iOS Tests` (macOS runner) — build + run happens in CI (this is
  a Linux container). Confirm `iOS Tests` green on the PR before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `BrandSignature.swift:43` — `.accessibilityLabel(Text("Meeshy version … Made
  with love by Services CEO."))` is a hardcoded English literal while the
  visible credit uses `String(localized: "splash.madeWithLove")`; i18n fix.
- `MessageViewsDetailView.swift` (`sendAttemptsCard`, lines ~293–347) —
  hardcoded French display literals (`"Historique d'envoi"`, `"1ère
  tentative"`, `"Tentative \(n)"`) out of pattern with the rest of the file.
- `MessageDetailSheet.swift` views filter chip (line ~898) + reaction filter
  capsule (line ~1587) — color-only selection, no `.isSelected` trait (large
  file, higher review cost).

**Status: RESOLVED for `MessageMoreSheet` VoiceOver active-pellet state + close-button label.**
