# Iteration-190i — i18n + VoiceOver button trait for `SyncPill`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) — connection/sync status pill
**Files touched:**
- `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift` (1 Swift file, 0 logic, 0 visual)
- `apps/ios/Meeshy/Localizable.xcstrings` (+2 keys × 5 locales)

## Component

`SyncPill` is the single inline capsule mounted at the top of every
`NavigationStack` content view (via `.safeAreaInset(edge: .top)` on
`RootView` / `iPadRootView`). Its orchestrator `ConnectionBanner` feeds it a
rotating list of `SyncPillEntry` covering every signal worth surfacing:
connection state (`Hors ligne` / `En ligne` / `Reconnexion` /
`Synchronisation`) and each pending offline-outbox item (`Envoi d'audio`,
`Envoi d'image`, …). Entries whose `source != nil` are **tappable** — a tap
routes to the conversation / post / story where the operation is happening.

The pill was already **mostly polished**: it uses `MeeshyFont.relative(...)`
(Dynamic Type sound), collapses to `EmptyView` when idle, and already declares
`.accessibilityElement(children: .ignore)` + `.accessibilityLabel` +
`.accessibilityHint`. The `entry.label` values are localized upstream in
`ConversationBanner` / `SyncPillLabels`. Two gaps remained.

## Findings

### 1. Two hardcoded French strings (i18n violation)

Both accessibility strings rendered by the pill were literal French, never
routed through the string catalog — so VoiceOver read French to every user
regardless of device language:

- **Tap hint** (l.163): `"Touchez pour ouvrir l'emplacement de l'opération."`
- **Multi-signal summary** (l.230): `"\(entries.count) signaux. Actif : \(entry.label)."`
  — the `.accessibilityLabel` value when more than one signal is queued.

This breaks the project's "avoid hardcoded strings" localization rule (every
user-facing string via `String(localized:)`), and is the last remaining
non-localized surface on the app's most globally-mounted chrome element.

### 2. Missing `.isButton` trait on the tappable pill (VoiceOver semantics)

When `visibleEntry?.source != nil` the capsule is an actionable control — a
tap navigates via `onTap(source)`, and the hint already promises
*"Touchez pour ouvrir…"*. Yet the element carried no `.isButton` trait, so
VoiceOver announced it as **static text**: the promised action was
undiscoverable through the rotor and the element read as non-interactive.
When `source == nil` (pure status rows: offline / reconnecting / syncing) the
tap only advances the rotation manually — not a user-facing action — so no
button trait is appropriate there.

## Fix

One Swift file, additive only:

1. **Localize the tap hint** — wrap l.163 in
   `String(localized: "sync-pill.a11y.tap-hint", defaultValue: "Touchez pour ouvrir l'emplacement de l'opération.", bundle: .main)`.
2. **Localize the summary** — wrap l.230 in
   `String(localized: "sync-pill.a11y.summary", defaultValue: "\(entries.count) signaux. Actif : \(entry.label).", bundle: .main)`
   (count → `%1$lld`, active label → `%2$@`).
3. **Add the button trait conditionally** —
   `.accessibilityAddTraits(visibleEntry?.source != nil ? [.isButton] : [])`,
   gated on the exact same `source != nil` predicate that already governs the
   hint and the tap routing. Status-only rows stay trait-free.

Two new catalog keys (`sync-pill.a11y.tap-hint`, `sync-pill.a11y.summary`)
added across all 5 locales (de / en / es / fr / pt-BR), source language `fr`,
inserted without reformatting the rest of the catalog (0 deletions).

## Impact

- **0 logic change** — the `source != nil` predicate already existed for the
  hint and routing; the button trait reuses it verbatim.
- **0 visual change** — pure accessibility/localization metadata.
- **0 SDK change** — `SyncPill` is an app-side component.
- **0 new test** — the existing `SyncPill*Tests` cover the rotator / label
  derivation / view-model; none reference `accessibilityText` or the hint, so
  no behavior test regresses and none is required for additive a11y metadata.

## Verification

- `Localizable.xcstrings` re-parsed as valid JSON after edit; 2 `sync-pill`
  keys present, `sourceLanguage` unchanged (`fr`).
- No local Xcode toolchain (Linux CI environment) → compile + `iOS Tests` gate
  verified by CI. Changes are additive SwiftUI modifiers + catalog entries,
  matching the established a11y-iteration risk profile.

## Status: RESOLVED

`SyncPill` VoiceOver + i18n **soldé** : both accessibility strings localized
(5 locales), tappable pill now carries `.isButton` when it navigates. Do not
re-flag — Dynamic Type was already sound (`MeeshyFont.relative`), the label
values are localized upstream, and status-only rows correctly stay trait-free.
