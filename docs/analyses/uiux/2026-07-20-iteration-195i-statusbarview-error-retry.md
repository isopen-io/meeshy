# Iteration-195i — VoiceOver-reachable retry for `StatusBarView` error indicator

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + HIG (native `Button` for a retry affordance)
**File touched:** `apps/ios/Meeshy/Features/Main/Views/StatusBarView.swift` (1 file, 0 logic change, 1 new inline i18n key, 0 SDK change, 0 new test)

## Component

`StatusBarView` is the horizontal, scrollable strip of mood/status pills shown at
the top of the conversation surface (`StatusViewModel`-driven). It renders:

- **My status / Add** pill (`myStatusPill` / `addStatusPill`) — proper `Button`s,
  each with `.accessibilityLabel` + `.accessibilityHint`.
- **Other users' status** pills (`statusPill`) — proper `Button`s, labelled.
- An **error/retry indicator** shown only when `viewModel.error != nil` **and**
  no statuses have loaded (`statuses.isEmpty`) — a glass card reading
  « Erreur de chargement ». Tapping it re-runs `viewModel.loadStatuses()`.

## Finding

Every pill in the strip is a first-class `Button`, **except** the error/retry
indicator, which was built from a bare `.onTapGesture` on a `glassCard`:

1. **Retry was unreachable via VoiceOver.** `.onTapGesture` creates **no**
   accessibility action, so a VoiceOver user had **no way to trigger the retry**
   — a WCAG 2.1.1 (Keyboard/programmatic operability) failure. The only way to
   recover from a status-load error was a precise sighted tap.
2. **No `.isButton` trait.** The element carried `.accessibilityElement(children:
   .combine)` but no button trait, so even if focused it announced only
   « Erreur de chargement » with nothing signalling it was actionable.
3. **No hint.** Nothing told the user that activating the element retries — the
   sibling pills all carry a hint, so this was also an inconsistency.
4. **No haptic.** The sibling interactive pills all fire `HapticFeedback.light()`
   on tap; the retry gave no tactile confirmation.

## Fix (idiome 189i `KeypadTab` / 191i `StatusBubbleOverlay` — a bare tap → real control)

Converted the indicator from a `glassCard` + `.onTapGesture` into a **native
`Button`** — the HIG-native shape for a retry affordance — so the `.isButton`
trait and double-tap activation come for free:

- The `Button` action fires `HapticFeedback.light()` (parity with the other
  pills) then `Task { await viewModel.loadStatuses() }` — identical behaviour to
  the previous tap, no logic change.
- The visual label is unchanged (same warning glyph — kept `.accessibilityHidden(true)`
  — + « Erreur de chargement » text + `glassCard(cornerRadius: 20)`); the
  explicit `.foregroundColor`/`.foregroundStyle` on the children mean the
  `Button` wrapper does **not** alter the rendering, so it stays pixel-identical
  and consistent with the sibling pills (which use the same structure).
- `.accessibilityLabel` = « Erreur de chargement » (the state).
- `.accessibilityHint` = « Touchez pour réessayer » (**1 new inline i18n key**:
  `status.bar.load_error.retry_hint`) — mirrors the promise the sighted tap
  already made.

### Why native `Button` over patching `.onTapGesture` + `.accessibilityAddTraits`

A `Button` is the correct HIG primitive for "tap to retry": it gets the trait,
the activation, focus, and press feedback natively, and it makes the error
indicator structurally identical to the three sibling pills in the same strip
(reduced special-casing, one consistent interaction model across the row).

## Verification status

- **Compile / tests:** not runnable in this Linux environment (iOS builds on the
  macOS CI). The change is a declarative SwiftUI wrapper swap
  (`glassCard`+`.onTapGesture` → `Button` with the same closure body and label);
  `HapticFeedback.light()` and `viewModel.loadStatuses()` are already used in
  this file (sibling pills) and by the previous tap respectively — no new symbol.
- **No new test:** pure declarative a11y/HIG modifier change with no extractable
  branching logic (same precedent as 191i `StatusBubbleOverlay`, 189i `KeypadTab`).
- **i18n:** 1 new inline key via `String(localized:defaultValue:bundle:.main)` —
  the codebase's established pattern (keys are extracted by Xcode at build; the
  `.xcstrings` catalog is not hand-maintained for these).

## Remaining improvements (out of scope for this iteration)

- `StatusBarView`'s `.popover(item:)` presentation could be audited for VoiceOver
  focus handling on iPhone (popover → sheet adaptation), a separate concern.
- The horizontal strip has no VoiceOver container label / grouping heading; a
  future iteration could add `.accessibilityElement(children: .contain)` +
  a strip-level label (« Statuts ») if user testing shows navigation friction.
