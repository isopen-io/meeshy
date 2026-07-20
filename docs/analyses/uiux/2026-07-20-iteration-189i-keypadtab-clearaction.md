# Iteration-189i — VoiceOver: expose the Keypad delete-all action + disambiguate the delete label

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver custom action + hint) — People-hub Keypad tab input bar
**File touched:** `apps/ios/Meeshy/Features/Contacts/KeypadTab.swift` (1 file, 0 logic, 0 test, 0 catalog edit)

## Component

`KeypadTab` is the **Keypad** tab of the People hub (`ContactsHubView`): a dial
pad that finds a person by phone number or name. Its `inputBar` renders the
current `input` in a centred `TextField` plus a trailing delete `Button`
(`delete.left.fill`) that appears once the field is non-empty. That single
button carries **two** distinct actions:

1. **Tap** → `viewModel.deleteLast()` — removes the last character.
2. **Long-press (0.4 s)** → `viewModel.clear()` — wipes the whole field.

## Finding

The long-press "clear all" action was bound exclusively through a
`.simultaneousGesture(LongPressGesture(...))`:

```swift
Button {
    viewModel.deleteLast()          // tap → delete one
    HapticFeedback.light()
} label: { Image(systemName: "delete.left.fill") … }
.accessibilityLabel("Effacer")
.simultaneousGesture(
    LongPressGesture(minimumDuration: 0.4).onEnded { _ in
        viewModel.clear()           // long-press → clear all
        HapticFeedback.medium()
    }
)
```

Two accessibility defects — both flagged as the explicit 181i follow-up
("`KeypadTab.inputBar` — the delete `Button` clears the whole field via a
`LongPressGesture`, an action **unreachable** under VoiceOver"):

1. **Clear-all is unreachable under VoiceOver.** A raw `LongPressGesture`
   attached via `.simultaneousGesture` is **not** surfaced in VoiceOver's
   actions rotor — VoiceOver only exposes a control's primary action and any
   `.accessibilityAction(named:)` entries. A VoiceOver user could delete
   characters one double-tap at a time but had **no way** to clear a long
   mistyped number/name in one gesture. (The Apple-native equivalent — the
   clear button inside a search field — is always a single reachable action;
   here the bulk action was hidden entirely.)
2. **The `"Effacer"` label is ambiguous.** With two behaviours behind one
   glyph and a bare "Effacer" ("Delete") label, VoiceOver gave no signal that
   the primary activation removes only the **last** character (versus the
   whole field). Relying on the icon alone violates "never rely only on a
   visual/gesture affordance to convey an action."

## Fix

Expose the bulk action through the accessibility tree and clarify the primary
one, without altering the visual layout or the sighted long-press:

- **`.accessibilityAction(named: "Tout effacer")`** → `viewModel.clear()` +
  `HapticFeedback.medium()` — the exact body of the long-press handler. The
  clear-all action is now a first-class, discoverable VoiceOver custom action
  (actions rotor / "actions available" announcement), mirroring the shipped
  `FloatingCallPillView` (171) and `BubbleCallNoticeView` (79) pattern of
  routing a gesture-only action through `.accessibilityAction(named:)`.
- **`.accessibilityHint("Efface le dernier caractère")`** on the button so
  VoiceOver announces that the primary double-tap deletes a single character —
  disambiguating it from the newly-exposed "Tout effacer" action.
- The `.simultaneousGesture(LongPressGesture...)` is **kept unchanged** so the
  sighted long-press-to-clear affordance is untouched; the two paths now share
  the same effect from either input modality.

Result: VoiceOver now reads "Effacer, button" (hint: "Efface le dernier
caractère") with an available custom action "Tout effacer" — the clear-all
capability is reachable for the first time under VoiceOver.

## Rationale

Correcting a mistyped phone number or name is the Keypad tab's core loop; the
bulk-clear shortcut must not be gated behind a gesture VoiceOver cannot perform.
The two new modifiers are purely additive to the accessibility tree — the icon,
sizing, haptics, tap/long-press behaviour, and Indigo identity are all
unchanged, so there is **0 visual change** at any Dynamic Type size.

## Verification

- **Static review:** `.accessibilityAction(named:)`, `.accessibilityHint`,
  `Text(String(localized:defaultValue:bundle:))` are standard SwiftUI iOS 16.0+
  APIs (app floor iOS 16.0 — no availability guard). The custom-action pattern
  is copied from the merged `FloatingCallPillView` / `BubbleCallNoticeView`.
- **No logic change:** `deleteLast()`, `clear()`, and both haptic calls are
  invoked exactly as before; the new action reuses `viewModel.clear()` +
  `HapticFeedback.medium()` verbatim from the existing long-press handler.
- **No new catalog entry:** both strings use inline
  `String(localized:defaultValue:)`, consistent with every other string in this
  file (0 `.xcstrings` edits). New keys: `keypad.delete.a11y.hint`,
  `keypad.clear.a11y`.
- **No test churn:** no test references `KeypadTab` (the only repo hit is a
  comment in `CallStarterTests.swift`); `KeypadViewModel.clear()`/`deleteLast()`
  are already covered by `KeypadViewModelTests`.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `KeypadTab.keyButton` — each dial key is labeled with its digit only; the
  associated letters (`ABC`, `DEF`…) are dropped from the VoiceOver label.
  Acceptable today (keys append the digit, not letters) but worth a deliberate
  decision if T9 name entry is ever added (carried over from 181i).
- `KeypadTab.inputBar` `TextField` — centred large `MeeshyFont.relative(26)`
  scales with Dynamic Type (good); confirm long inputs remain legible / do not
  clip the trailing delete button at the largest accessibility sizes.

**Status: RESOLVED for `KeypadTab` clear-all VoiceOver reachability + delete-label disambiguation (181i follow-up).**
