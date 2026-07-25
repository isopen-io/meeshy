# Iteration 182i — DataStorageView: brand-color consolidation

**Date**: 2026-07-20
**Scope**: iOS only — `DataStorageView` (Settings → Stockage / media cache)
**Type**: Design-system / brand-color consolidation
**Branch**: `claude/laughing-thompson-k9l43k`

## Context

Continuation of the Settings brand-palette consolidation track (179i
MediaDownloadSettingsView #2125, 180i Affiliate pair #2142). `DataStorageView` was
flagged in both iterations' "Future Considerations" as still carrying legacy
off-brand raw hex (`E67E22` orange + raw `EF4444` red).

## Deficits

The Meeshy brand is a single Indigo scale (`#6366F1` → `#4338CA`). Raw hex literals
that duplicate an existing token, or an off-brand hue used as a screen accent, are
"avoid fixed colors" / brand-coherence violations.

1. **Off-brand orange accent** — `private let accentColor = "E67E22"` (carrot
   orange) drives the whole screen accent: header Back button (l.50), the "Cache
   media" section header (l.88), the folder field-icon (l.92), and the cache
   section surface tint (l.115). Every other Settings screen's accent is indigo500
   (back button + selection) — this one fought the pattern.

2. **Destructive icon / label colour mismatch** — the "Vider le cache" row paints
   its `trash.fill` icon `"EF4444"` (Tailwind red-500) while the adjacent label
   uses `MeeshyColors.error` (`F87171`, red-400). The icon and its own label were
   **literally two different reds** — a semantic-token bypass and a visible
   inconsistency in a destructive control.

3. **Raw neutral gray duplicating a token (×2)** — the "Actions" section header
   (l.123) and its button surface tint (l.147) hardcode `"6B7280"`, the exact hex
   of `MeeshyColors.neutral500Hex`.

## Fix

- `accentColor = "E67E22"` → `MeeshyColors.brandPrimaryHex` (`"6366F1"`, indigo500)
  — aligns the screen accent with every other Settings screen (matches 179i/180i).
- `fieldIcon("trash.fill", color: "EF4444")` → `color: MeeshyColors.errorHex`
  (`"F87171"`) — the destructive icon now matches its own `MeeshyColors.error`
  label, one coherent red for the whole "clear cache" control.
- Both `"6B7280"` occurrences → `MeeshyColors.neutral500Hex` — **exact same hex,
  zero visual change**, pure tokenization. The Actions section stays deliberately
  neutral-gray (distinct from the indigo cache section) — the intent is preserved,
  only the literal is replaced by its token.

All swaps are `String` → `String` (hex → existing `MeeshyColors` hex constant) fed
to `Color(hex:)` / `ThemeManager.surfaceGradient/border(tint:)`. `MeeshyColors` is
already imported (`import MeeshyUI`, l.4; `.error` used l.134). No logic path, no
i18n key, no test touched.

## Verification

No Swift toolchain in this Linux environment → static review. Grep confirms no raw
off-brand hex remains. No test references the view; no open PR touches the file
(`search_pull_requests … DataStorage` → 0). CI **iOS Tests** is the gate.

## Status: RESOLVED

Off-brand orange eradicated, destructive control unified on the semantic error red,
neutral grays tokenized. Sibling screen still carrying a legacy accent (later
iteration): `TermsOfServiceView` (`45B7D1` cyan; its bilingual legal-copy dict is a
separate i18n concern).
