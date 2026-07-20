# Iteration 194i — TermsOfServiceView: brand-color consolidation

**Date**: 2026-07-20
**Scope**: iOS only — `TermsOfServiceView` (Réglages → Conditions d'utilisation)
**Type**: Design-system / brand-color consolidation (raw-hex → token)
**Branch**: `claude/laughing-thompson-0lonrh`

## Context

Closes the second (and final) half of the "siblings restants" pointer left by
iteration 180i (Affiliate pair, #2142) and re-stated by 186i
(`DataStorageView`, #2154): the Settings-adjacent screens each carried a
self-contained off-brand `accentColor` hex constant. 186i handled
`DataStorageView`; this iteration handles `TermsOfServiceView`, the last one
named in that pointer.

## Deficit

The Meeshy brand is a single Indigo scale (`#6366F1` → `#4338CA`, see
`apps/ios/CLAUDE.md` § Brand Identity), and the design-system rule is explicit:
*"New code MUST use the Indigo scale or semantic names, not raw hex."*

`TermsOfServiceView` drove its entire screen accent from one off-brand literal:

- `private let accentColor = "45B7D1"` (l.14) — Flat-UI "river blue" cyan. It
  feeds `Color(hex:)` / `ThemeManager.surfaceGradient(tint:)` / `.border(tint:)`
  at: the back button (l.84), each numbered section's `N.circle.fill` icon
  (l.154), and every section card's surface fill + border (l.171-174). Cyan is
  not a Meeshy token — it is a pure off-brand hue, exactly like the `2ECC71`
  emerald (180i) and `E67E22` carrot (186i) already eradicated from the sibling
  screens.

## Fix

One type-identical `String` swap to the existing token (same 6-char, no-`#`
shape already consumed by every call site), so zero call-site change:

- `accentColor = "45B7D1"` → `MeeshyColors.brandPrimaryHex` (`"6366F1"`,
  indigo500) — the identical target `DataStorageView` (186i) and the Affiliate
  pair (180i) migrated to, so the whole Settings-adjacent family now shares one
  coherent indigo accent.

`import MeeshyUI` is already present (l.4), which vends `MeeshyColors` → no new
import. No logic path, no i18n key, no test touched.

## Non-goals (deliberately out of scope)

- The in-file bilingual `sections` dictionary (French + English legal copy,
  l.16-57) is **not** an app-string localization gap — it is a deliberate
  bilingual legal document with its own in-screen `.segmented` language picker
  (l.128-135). Migrating that legal corpus to `.xcstrings` is a distinct
  legal/i18n concern (the 180i pointer explicitly flagged it as "dict légal
  bilingue = pass i18n dédié") and is left untouched here. This iteration is
  strictly the color swap.
- The `termsSection` helper signature (opaque `color`-via-`accentColor`) is
  correct as an agnostic primitive; only the *value* was off-brand.

## Verification

No Swift toolchain in this Linux environment → static review. The single edit
swaps a raw hex `String` literal for an existing `MeeshyColors.brandPrimaryHex`
of the identical type; `grep '"[0-9A-Fa-f]\{6\}"'` over the file confirms
**zero** raw 6-hex literals remain. No test references the view
(`grep -rl TermsOfServiceView MeeshyTests` → 0). No open PR touches the file
(`search_pull_requests … TermsOfServiceView` → 0). CI **iOS Tests** is the gate.

## Status: RESOLVED

Off-brand cyan eradicated from `TermsOfServiceView`; the file now carries zero
raw hex. This closes the 180i "siblings restants" pointer in full — the
Settings-adjacent trio (`AffiliateView`/`AffiliateCreateView`,
`DataStorageView`, `TermsOfServiceView`) now all share `brandPrimaryHex`.
