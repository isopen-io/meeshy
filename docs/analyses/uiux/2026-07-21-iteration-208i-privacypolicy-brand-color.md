# Iteration-208i — Brand-color token consolidation for `PrivacyPolicyView`

**Date**: 2026-07-21
**Track**: iOS UI/UX (suffix `i`)
**Scope**: `apps/ios/Meeshy/Features/Main/Views/PrivacyPolicyView.swift` (1 file)
**Type**: Design-system consolidation — 0 logic / 0 visual change / 0 i18n / 0 test

## Context

This closes the explicitly-flagged follow-up from **194i**
(`TermsOfServiceView` brand-color consolidation). That analysis named the
remaining sibling directly:

> "Using the **named token** rather than the literal `"6366F1"` (as
> `PrivacyPolicyView` **still does**) follows the design-system SSOT and the
> most recent precedents (180i / 186i both migrated to
> `MeeshyColors.brandPrimaryHex`)."

`PrivacyPolicyView` and `TermsOfServiceView` are near-identical twins (same
header, same segmented language picker, same numbered `policySection` /
`termsSection` cards). After 194i, the Terms twin declares:

```swift
private let accentColor = MeeshyColors.brandPrimaryHex
```

…while the Privacy twin still declared a **hardcoded string literal**:

```swift
private let accentColor = "6366F1"
```

## Defect

A magic hex literal (`"6366F1"`) duplicated the single source of truth
`MeeshyColors.brandPrimaryHex` (`MeeshyUI/Theme/MeeshyColors.swift:38`, value
`"6366F1"` = indigo500). This violates the `apps/ios/CLAUDE.md` rule
*"New code MUST use the Indigo scale or semantic names"* and the Instant-App
**Single Source of Truth** principle. The literal is consumed at three tint
sites in the view (`Color(hex: accentColor)`, `theme.surfaceGradient(tint:)`,
`theme.border(tint:)`), so a future brand-hue change would silently skip this
screen.

## Fix

```diff
-    private let accentColor = "6366F1"
+    private let accentColor = MeeshyColors.brandPrimaryHex
```

- **0 visual change**: `brandPrimaryHex` is the exact same string `"6366F1"`
  (indigo500). Byte-identical render.
- **0 logic / 0 i18n / 0 test**: `MeeshyUI` is already imported (line 4);
  no behavior, string, or catalog touched. No test references the view.
- **Twin parity**: `PrivacyPolicyView` and `TermsOfServiceView` now share the
  identical `accentColor` declaration and design-system treatment.

## Verification

- `MeeshyColors.brandPrimaryHex` is `public static` in `MeeshyUI` and already
  consumed at 30+ call sites (incl. the 180i / 186i / 194i migrations).
- Grep confirms `"6366F1"` no longer appears as a literal in the file.
- No open iOS PR touches `PrivacyPolicyView` (last modified by base commit
  `64f943d`; the swarm never individually audited it).
- Gate = CI `iOS Tests`.

## Status

**Resolved.** The 180i → 186i → 194i brand-color sibling chain for the two
legal-document screens is now fully closed — both `TermsOfServiceView` and
`PrivacyPolicyView` reference `MeeshyColors.brandPrimaryHex`. Remaining legacy
sibling from the 180i chain (per 194i analysis): `AboutView`
(`accentColor = "45B7D1"` cyan) — deferred to a future dedicated iteration.

**⚠️ Do not re-flag** `PrivacyPolicyView` accent-color token (solved 208i).
