# Iteration 194i — TermsOfServiceView: brand-color consolidation

**Date:** 2026-07-20
**Scope:** iOS only — `TermsOfServiceView` (Réglages → Conditions d'utilisation)
**Type:** Design-system / brand-color consolidation
**Branch:** `claude/laughing-thompson-qk04t7`
**File touched:** `apps/ios/Meeshy/Features/Main/Views/TermsOfServiceView.swift` (1 file, 1 line, 0 logic, 0 i18n, 0 test)

## Context

This closes the last item of the "siblings restants" pointer chain started at
**180i** (#2142, Affiliate pair) and continued at **186i** (#2154,
`DataStorageView`): a family of Settings-adjacent screens each carried a
self-contained off-brand `accentColor` hex constant. #2154 migrated
`DataStorageView` and explicitly named the remaining sibling —
`TermsOfServiceView` (`45B7D1` cyan) — as "deferred to a dedicated iteration".
This iteration executes that migration.

## Deficit

The Meeshy brand is a single Indigo scale (`#6366F1` → `#4338CA`, see
`apps/ios/CLAUDE.md` § Brand Identity). Every hardcoded off-brand hue is a
"avoid fixed colors" / brand-coherence violation.

- **Off-brand cyan accent** — `private let accentColor = "45B7D1"` (Flat-UI
  "picton blue" cyan). This one constant drives the entire screen accent:
  - the header **Back** button (`chevron.left` + "Retour", l.84),
  - each numbered section's `\(number).circle.fill` **icon** (l.154),
  - each section card's **surface tint** (`theme.surfaceGradient(tint:)`, l.171)
    and **border tint** (`theme.border(tint:)`, l.174).

  Cyan has no role in the Meeshy palette; the screen read as an off-brand
  turquoise document. Its **direct sibling** `PrivacyPolicyView` — the same
  legal-document layout (header + segmented FR/EN picker + numbered sections) —
  had already been migrated to brand indigo (`accentColor = "6366F1"`), so the
  two legal screens were visually inconsistent with each other.

## Fix

`accentColor = "45B7D1"` → `MeeshyColors.brandPrimaryHex` (`"6366F1"`, indigo500).

- `brandPrimaryHex` (`MeeshyUI/Theme/MeeshyColors.swift:38`) is the exact same
  `String` shape (6-char, no `#`) already consumed by `Color(hex:)` and
  `ThemeManager.surfaceGradient(tint:)` / `.border(tint:)`, so this is a
  type-identical swap with **zero** call-site changes.
- Using the **named token** rather than the literal `"6366F1"` (as
  `PrivacyPolicyView` still does) follows the design-system SSOT and the most
  recent precedents (180i / 186i both migrated to `MeeshyColors.brandPrimaryHex`),
  eliminating the magic hex entirely rather than swapping one literal for another.
- `import MeeshyUI` (l.4) and `MeeshyColors` are already present/used in the file
  (`MeeshyFont` throughout) → no new import, no other change.

`grep '"[0-9A-Fa-f]{6}"'` over the file confirms **zero** raw hex remains: the
`accentColor` constant was its only colour literal.

## Non-goals (deliberately out of scope)

- **The bilingual legal-copy dictionary** (`sections: ["fr": …, "en": …]`,
  l.16-57) is **untouched**. #2154 flagged `TermsOfServiceView` as
  "i18n-adjacent" because of this dictionary, but the `accentColor` swap is a
  pure colour change fully independent of the copy — no string is added, moved
  or localized here. The dictionary→String-Catalog migration remains a distinct,
  larger i18n concern for a future dedicated pass.
- **`AboutView`** also carries `accentColor = "45B7D1"` **and** a second
  off-brand accent (gold `F8B500` for its "Features" section). Migrating only its
  cyan constant would leave an awkward indigo+gold half-state; its deliberate
  per-section multi-hue scheme is a more opinionated design question that
  deserves its own analysis. Deferred, not folded into this single-purpose
  colour swap.
- Fonts are already 100 % `MeeshyFont.relative(...)` (Dynamic Type OK), the
  header title already carries `.isHeader`, section cards already
  `.accessibilityElement(children: .combine)`, and every control is already
  localized — so there is no VoiceOver / Dynamic Type / i18n work to do here.

## Verification status

- **Compile:** no Swift toolchain on this Linux host (iOS compiles on macOS CI).
  The change swaps one hex `String` literal for an existing `MeeshyColors` `String`
  constant of identical type and value-class; `MeeshyColors.brandPrimaryHex` is
  already consumed at 30+ sites and by the 180i / 186i sibling migrations.
  Gate = CI **iOS Tests**.
- **Tests:** none added — a view-only colour-constant swap with no new logic. No
  test references `TermsOfServiceView` (`grep -rl TermsOfServiceView MeeshyTests`
  → 0).
- **Collision:** `search_pull_requests … TermsOfServiceView OR AboutView OR legal`
  → only #2154 (DataStorageView), which does not touch this file and defers it.
  No open PR touches `TermsOfServiceView`.

## Status: RESOLVED

Off-brand cyan `45B7D1` eradicated from `TermsOfServiceView`; the two legal
screens (`TermsOfServiceView` + `PrivacyPolicyView`) now share the brand indigo
accent, with `TermsOfServiceView` using the design-system token directly.
Remaining legacy sibling from the 180i chain: `AboutView` (`45B7D1` cyan +
`F8B500` gold multi-hue scheme — dedicated analysis).
