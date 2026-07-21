# Iteration 210i — Share Extension `ContactRow` VoiceOver selectable-row semantics

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Branch**: `claude/laughing-thompson-g3s7uq`
**Base**: `main` HEAD `22465a5`
**File**: `apps/ios/MeeshyShareExtension/ShareViewController.swift`

## Surface
`ContactRow` — one row of the contact list inside the **Share Extension** ("Share to
Meeshy" sheet). Each row visually shows: a gradient avatar (image or initials), the contact
name, an optional status line, and — **only when selected** — a trailing
`checkmark.circle.fill` plus a faint blue row background. The row is made tappable by an
`.onTapGesture` applied at the call site (`ShareContentView`, l.336-340) that sets
`selectedContactId`.

The Share Extension is an `app-extension` target of the iOS app (`project.yml`,
recâblé 2026-06-24) — in scope for the iOS UI/UX track. It is deliberately self-contained
(system frameworks + App Group only, no `MeeshyUI` dependency), which is why it had never
been swept by the main-app accessibility passes.

## Defect (WCAG 1.4.1 Use of Color / 4.1.2 Name, Role, Value)
The selection state of a contact row was conveyed to sighted users by **two visual signals
only** — the trailing checkmark glyph and the blue background tint — with **no
accessibility semantics whatsoever**:

1. **No `.isSelected` trait** → VoiceOver gave a selected row and an unselected row the
   *identical* announcement. A VoiceOver user picking a recipient could not tell which
   contact (if any) was currently selected (WCAG 1.4.1 — color/glyph as the sole channel).
2. **No `.isButton` trait / not an accessibility element** → the row is actionable
   (tapping selects the contact) but VoiceOver did not present it as a button; its children
   (avatar, name, status) were exposed as separate, non-actionable elements.
3. **Decorative sub-elements read literally** → the avatar's initials `Text` and the
   `checkmark.circle.fill` glyph would be spoken as content ("JD … checkmark circle fill"),
   adding noise and — for the checkmark — duplicating the selection signal the `.isSelected`
   trait should carry.

This is the exact pattern the swarm has resolved across the main app
(149i/155i/163i/176i/177i/178i/186i/192i/195i/203i …): selection must never be color-only;
it must expose `.isSelected` to VoiceOver.

## Fix
Purely-additive VoiceOver instrumentation on `ContactRow` (0 visual / 0 logic / 0 layout):

- **Avatar `ZStack` → `.accessibilityHidden(true)`** — decorative; the name carries the
  contact's identity, so the initials/gradient are noise for VoiceOver (precedent 90i:
  decorative hero glyphs stay visible but hidden from a11y).
- **`checkmark.circle.fill` → `.accessibilityHidden(true)`** — redundant with the
  `.isSelected` trait added below; prevents the glyph being read as literal content.
- **Row (outer `HStack`) → `.accessibilityElement(children: .combine)`** — merges name +
  status into a single element with a clean label (avatar + checkmark now excluded).
- **`.accessibilityAddTraits(.isButton)`** — the row *is* a tap target (selects the
  contact); VoiceOver now presents it as a button and activates the call-site
  `.onTapGesture` on double-tap.
- **`.accessibilityAddTraits(isSelected ? [.isSelected] : [])`** — the currently-selected
  recipient is now announced "… selected".

Net VoiceOver output: **"{name}, {status}, button"** (unselected) →
**"{name}, {status}, selected, button"** (selected).

- **Zero new i18n keys**; **0 visual change**; **0 logic/network change**. VoiceOver layer
  only. The existing `Color.blue` tint and checkmark are untouched (still shown to sighted
  users).

## Verification
- No Swift toolchain on the Linux execution host → verified by inspection + strict parity
  with the `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` idiom already used
  throughout the main app.
- The Share Extension is embedded by the `Meeshy` app scheme, so CI `iOS Tests`
  (`xcodegen generate` → `build-for-testing`) **compiles this target** — a syntax/semantic
  error here fails CI. No dedicated unit-test target hosts the extension's internal
  `ContactRow`, so no source-level guard test was added (adding one would require wiring a
  `@testable import MeeshyShareExtension`, out of scope for a pure-a11y modifier change).
- Gate = CI `iOS Tests`.

## Status
✅ Resolved. Do not re-flag `ContactRow`'s selected-state accessibility — it now exposes
`.isButton` + `.isSelected` and hides its decorative avatar/checkmark from VoiceOver.

### Remaining / adjacent (defer, 1/iteration, collision-check first)
The same file carries two **separate, unrelated** concerns intentionally left out of this
single-concern a11y iteration:

- **Brand color** — the extension hardcodes system `Color.blue` / `.purple` (avatar
  gradient l.485, checkmark l.522, Send button l.366, row tint l.528) instead of the Meeshy
  Indigo scale. It deliberately avoids the `MeeshyUI` dependency, so a fix means defining a
  local indigo constant; a future brand-consistency iteration.
- **i18n** — `Button("Cancel")` (l.350), `Button("Send")` (l.359), and
  `.navigationTitle("Share to Meeshy")` (l.373) are hardcoded English while a sibling label
  (`share.searchContacts`, l.326) is already `String(localized:)` — the extension's
  localization is partial. A future i18n iteration should localize the three hold-outs
  (English `defaultValue`, matching the extension's own convention).
