# Iteration 210i — `ConversationEncryptionDetailSheet` VoiceOver status row

**Date:** 2026-07-21
**Track:** iOS (suffix `i`)
**Branch:** `claude/laughing-thompson-o7l1vz`
**Base:** `main` HEAD `22465a5` (PR #2214)
**Scope:** 1 production file + 1 new source-level guard test. 0 logic / 0 network / 0 layout / 0 visual change / 0 new i18n key.

## Problem

`ConversationEncryptionDetailSheet.activeStateSections` renders an "Encryption
enabled" status row inside a `Form` `Section`:

```swift
HStack {
    Image(systemName: "lock.fill").foregroundColor(.secondary)
    Text("Encryption enabled")          // conversation.encryption.detail.toggleEnabled
    Spacer()
    Toggle("", isOn: .constant(true))
        .disabled(true)
        .labelsHidden()
}
```

The `Toggle` is a **read-only status indicator** — the backend enforces
encryption immutability, so it is permanently `on` and `.disabled(true)`. But:

- The toggle has an **empty label** + `.labelsHidden()` + **no
  `.accessibilityLabel`**. VoiceOver announced it as an unlabeled
  "on, dimmed, switch" with zero context.
- The adjacent `Text("Encryption enabled")` is a **separate** HStack element,
  not associated with the toggle, so it did not serve as the toggle's label.
- The entire file contained **no accessibility modifiers** (verified: only
  `.labelsHidden()` matched `accessibility*`). This niche encryption detail
  sheet was missed by the a11y swarm entirely. No `#Preview` in the file.

This violates the app HIG rule "every interactive element MUST have an
`.accessibilityLabel`" and, more importantly, leaves a security-relevant status
opaque to VoiceOver users.

## Decision

The disabled toggle is **redundant** with the visible "Encryption enabled"
label — it merely reinforces the fact visually. The correct native treatment of
a read-only status row is therefore to expose it as **one combined VoiceOver
element** rather than to give the toggle its own (duplicating) label:

```swift
HStack {
    Image(systemName: "lock.fill")
        .foregroundColor(.secondary)
        .accessibilityHidden(true)          // decorative glyph
    Text("Encryption enabled")
    Spacer()
    Toggle("", isOn: .constant(true)).disabled(true).labelsHidden()
}
.accessibilityElement(children: .combine)   // one coherent element
```

VoiceOver now reads a single "Encryption enabled" element; the disabled toggle
no longer surfaces as a context-free "dimmed switch". The decorative lock glyph
is hidden so it adds no stray "lock" announcement.

### Why combine, not the `DataExportView` label-only convention

`DataExportView.swift:228` labels an **interactive** hidden toggle with
`.accessibilityLabel(title)`. That pattern double-reads when a separate visible
`Text` sits beside the toggle. Here the toggle is **non-interactive** (disabled,
immutable), so `.accessibilityElement(children: .combine)` — the pattern proven
in `ActiveSessionsView` (168i) for informational rows — is both simpler and
strictly better: one stop, no duplication, no new localization key. The
`.disabled(true)` trait still yields VoiceOver's "dimmed" cue, signalling
immutability (further explained by the existing section footer).

## Verification

- **Guard test:** `ConversationEncryptionDetailSheetAccessibilityTests`
  (mirror of `ActiveSessionsViewAccessibilityTests`) asserts the row combines
  into one element and hides the decorative `lock.fill` glyph.
- **CI gate:** `iOS Tests` (macOS runner — local env is Linux, no Xcode).
- **Collision:** file carried zero a11y modifiers and appears in no observed
  in-flight swarm PR; very low collision risk.

## Remaining / follow-ups (not addressed here)

- `InviteFriendsSheet.swift:417` `Stepper` (max-uses) lacks
  `.accessibilityLabel`/`.accessibilityValue` — but the file is a11y-"hot"
  (7 existing annotations), so verify swarm collision before touching.
- `CreateShareLinkView.swift:276` `Stepper` (max-uses) — same pattern, milder
  (reads "N utilisations" but no descriptive control label).
- `ConversationPreferencesTab.swift:436` `Toggle("", isOn:)` — verify whether the
  row helper supplies `.accessibilityLabel`.

## Completion

- [x] Combined the "Encryption enabled" status row into one VoiceOver element.
- [x] Hid the decorative `lock.fill` glyph.
- [x] Added mirror source-level guard test.
- [x] 0 new i18n keys, 0 logic/layout/visual change.
