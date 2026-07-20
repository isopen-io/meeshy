# Iteration-179i — Indigo brand alignment + VoiceOver structure for `MediaDownloadSettingsView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Design System (brand color) + Accessibility (VoiceOver headings / decorative glyphs) + Dynamic Type robustness
**File touched:** `apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift` (1 file, 0 logic, 0 new key, 0 new test)

## Component

`MediaDownloadSettingsView` is the settings screen where the user chooses, per
media type (Images / Audio / Audio translations / Video), *when* Meeshy
auto-downloads that media (`AutoDownloadPolicy`: always / wifi+good cellular /
wifi only / never). Each media type is a titled section with a leading
category glyph; each policy is a selectable `Button` row that shows a trailing
`checkmark` when armed. The screen was already **100 % localized** (10
`String(localized:defaultValue:)` call sites) and every policy row already
carried an `.accessibilityLabel` + `.isSelected` trait (line 160–161).

Two defect classes remained: (1) **off-brand hardcoded hex colors**, and
(2) **VoiceOver-structure drift** in the two private helpers, which are
byte-for-byte copies of `SupportView`'s `sectionHeader`/`fieldIcon` **with the
accessibility modifiers dropped**.

## Findings

### 1. Off-brand accent + category colors (design-system doctrine)

The screen defined `private let accentColor = "E67E22"` (an **orange** hex) and
used it for the back button, the info-tile glyph, **and the selected-policy
`checkmark`** (line 152). The brand-selection cue — the single strongest
"which option is active" signal on the screen — was therefore rendered in
orange, not the Indigo brand color. Both `apps/ios/CLAUDE.md` and
`packages/MeeshySDK/CLAUDE.md` mandate: *"New code MUST use the Indigo scale or
semantic names."*

Two of the four category pickers already used correct tokens
(`MeeshyColors.brandPrimaryHex` for Images, `indigo600Hex` for Audio), while
the other two used raw off-brand hexes: **`"F39C12"`** (orange, Audio
translations) and **`"E74C3C"`** (red, Video). Half indigo, half not — a design
inconsistency, not an intentional per-type palette. The two neutral-gray info
section literals `"6B7280"` matched the semantic token `neutral500Hex` exactly
but were inlined as raw strings.

### 2. VoiceOver: section header not a heading + decorative glyph exposed

`sectionHeader(title:icon:color:)` had **no `.accessibilityElement(children:
.combine)`** and **no `.accessibilityAddTraits(.isHeader)`**. VoiceOver read the
section glyph as a stray, meaningless element and never announced the section
("Images", "Audio", …) as a heading — so a VoiceOver user could not navigate by
heading. The screen's own top nav title already uses `.isHeader` (line 56), and
the reference sibling `SupportView.sectionHeader` (SupportView.swift:142–155)
carries both modifiers. This helper was a copy that dropped them.

### 3. VoiceOver + Dynamic Type: `fieldIcon` badge glyph

`fieldIcon(_:color:)` had **no `.accessibilityHidden(true)`** on its decorative
badge glyph (the adjacent row label already carries the meaning), and used
**`.font(MeeshyFont.relative(14, …))`** — a Dynamic-Type-scaling font pinned
inside a **fixed 28×28 frame**. At accessibility text sizes the glyph bursts the
badge. `SupportView.fieldIcon` (SupportView.swift:166–179) documents this exact
case (doctrine 74i/86i/91i): a glyph in a fixed badge uses fixed
`.system(size:)` and is `.accessibilityHidden(true)`. Again, this helper was a
copy that dropped the fix.

## Fix

Minimal, doctrine-aligned, 1 file, 0 logic:

- `accentColor` → `MeeshyColors.brandPrimaryHex` (indigo500). Back button, info
  glyph, and the selected-policy checkmark are now the Indigo brand color.
- Audio-translations color `"F39C12"` → `MeeshyColors.indigo400Hex`; Video color
  `"E74C3C"` → `MeeshyColors.brandDeepHex` (indigo700). The four sections now
  read as a coherent Indigo spread (indigo500 / indigo600 / indigo400 /
  indigo700) instead of two indigo + orange + red.
- The two `"6B7280"` info-section literals → `MeeshyColors.neutral500Hex`
  (identical value, now a semantic token — 0 visual change).
- `sectionHeader`: added `.accessibilityElement(children: .combine)` +
  `.accessibilityAddTraits(.isHeader)` — exact mirror of `SupportView`.
- `fieldIcon`: switched the badge glyph to `.font(.system(size: 14,
  weight: .medium))`, added `.accessibilityHidden(true)`, and carried the
  established doctrine comment — exact mirror of `SupportView`.

## Rationale

This screen is a copy-drift case: its two helpers were forked from
`SupportView` and lost their accessibility + Dynamic-Type treatment, and its
accent color predates the Indigo migration. Re-converging on the sibling's
already-audited pattern (rather than inventing anything) restores the brand
identity for the primary selection cue, makes the four media sections
navigable by VoiceOver heading, silences decorative glyph noise, and keeps the
badge glyph from clipping at large Dynamic Type — with zero change to layout,
copy, logic, or the selection behavior.

## Verification

- **Static review:** `.accessibilityElement(children: .combine)`,
  `.accessibilityAddTraits(.isHeader)`, `.accessibilityHidden(true)`, and
  `.font(.system(size:weight:))` are standard SwiftUI iOS 16.0+ APIs already
  used verbatim in the sibling `SupportView`. App floor is iOS 16.0 — no
  availability guard needed. All new color references resolve to existing
  `MeeshyColors` public string tokens (`brandPrimaryHex`, `indigo400Hex`,
  `brandDeepHex`, `neutral500Hex` — MeeshyColors.swift lines 38/70/39/68).
- **No test references:** no file under `apps/ios/MeeshyTests` references
  `MediaDownloadSettingsView` → 0 test contention.
- **No raw hex remains:** `grep -nE '"[0-9A-Fa-f]{6}"'` over the file → 0 hits.
- **Contention:** no open iOS PR touches this file.
- **Build:** iOS compile cannot run in this Linux environment (no Xcode); the
  gate is CI `iOS Tests` (which runs `xcodegen generate` + `build-for-testing`).
  Change is a pure View-body edit with no new symbols.

## Completion

All identified issues for `MediaDownloadSettingsView` are resolved:
- ✅ Off-brand `accentColor` (orange) → Indigo brand token (drives the
  selection checkmark).
- ✅ Off-brand category hexes (orange / red) → Indigo scale tokens.
- ✅ Neutral literals → `neutral500Hex` semantic token.
- ✅ Section headers announced as VoiceOver headings, decorative glyph merged.
- ✅ Badge glyph decorative-hidden + fixed-size (Dynamic Type safe).

Do not re-open this file for these classes. Dynamic Type on the scaling text
(`MeeshyFont.relative`) and i18n were already complete before this iteration.
