# Iteration 180i — Affiliate pair: brand-color consolidation

**Date**: 2026-07-20
**Scope**: iOS only — `AffiliateView` + `AffiliateCreateView` (Parrainage / referral links)
**Type**: Design-system / brand-color consolidation
**Branch**: `claude/laughing-thompson-k9l43k`

## Context

179i (MediaDownloadSettingsView) closed with an explicit "Future Considerations"
pointer: a family of Settings-adjacent screens each carry a self-contained
off-brand `accentColor` hex constant, and `AffiliateCreateView` + `AffiliateView`
share the **same** emerald green `2ECC71` — flagged to "migrate the pair together".
This iteration executes that migration.

## Deficits

The Meeshy brand is a single Indigo scale (`#6366F1` → `#4338CA`, see
`apps/ios/CLAUDE.md` § Brand Identity). Every hardcoded off-brand hue is a
"avoid fixed colors" / brand-coherence violation.

1. **Off-brand emerald accent (both files)** — `private let accentColor = "2ECC71"`
   (Flat-UI emerald green). This one constant drives the entire screen accent:
   - `AffiliateCreateView`: toolbar Cancel (l.38), both TextField tint + border
     (l.58/61, l.77/80), primary Create button fill (l.118-119).
   - `AffiliateView`: back button (l.45), create `+` button (l.64), the 3 stat
     cards' icon + value + surface tint (l.93-135), section header icon + label
     (l.147/151), token-row surfaces (l.172-175), empty-state hero + surface
     (l.189-208), token-row copy button (l.243).
   Green reads as "success/online" in Meeshy's semantic palette — using it as the
   *primary* accent of a whole screen fights the design language.

2. **Semantic `success` green misused for a neutral action (`AffiliateView`)** —
   the token-row **Share** icon (l.267) was `MeeshyColors.success`, sitting between
   a **Copy** button (accent) and a **Delete** button (`error` red). Sharing is
   neither a success nor a destructive state; it is a neutral secondary action,
   exactly like Copy. The green was a semantic-token misuse and made the row read
   as a three-colour rainbow (accent / green / red).

## Fix

- `accentColor = "2ECC71"` → `MeeshyColors.brandPrimaryHex` (`"6366F1"`, indigo500)
  in **both** files. `brandPrimaryHex` is the exact same `String` shape (6-char, no
  `#`) already consumed by `Color(hex:)` and `ThemeManager.surfaceGradient(tint:)` /
  `.border(tint:)`, so this is a type-identical swap with zero call-site changes.
- `AffiliateView` Share icon `MeeshyColors.success` → `Color(hex: accentColor)`
  (now indigo) — Copy and Share become one coherent secondary-action colour,
  `error` red stays reserved for Delete, `success` green stays reserved for the
  signups stat (l.228) where it is semantically correct.

`MeeshyColors` is already referenced in both files (`.error`, `.success`), so no
new import. No logic path, no i18n key, no test touched.

## Non-goals (deliberately out of scope)

- The empty-state hero `Image("link").font(.system(size: 36))` (l.188) stays fixed:
  documented ≥36pt decorative-hero doctrine (74i/86i/89i), already
  `.accessibilityHidden(true)`.
- The manual `UIActivityViewController` share path (l.248-263) — a `ShareLink`
  migration candidate, but a distinct concern (HIG, not colour); deferred.
- `AffiliateCreateView` transient error `Text` (l.86) is read on focus but not
  actively announced; a live-region announcement would touch the `catch` logic —
  deferred to a dedicated a11y pass.

## Verification

No Swift toolchain in this Linux environment → static review. Every edit swaps a
hex `String` literal / semantic `Color` for an existing `MeeshyColors` constant of
the identical type; grep confirms no `2ECC71` (or other off-brand hex) remains in
either file. No test references either view; no open PR touches the files
(`search_pull_requests … Affiliate` → 0). CI **iOS Tests** is the gate.

## Status: RESOLVED

Off-brand emerald eradicated from the Affiliate pair; Share icon re-aligned to the
accent. Sibling screens still carrying legacy off-brand accents (later iterations):
`DataStorageView` (`E67E22` + `EF4444`), `TermsOfServiceView` (`45B7D1` cyan).
