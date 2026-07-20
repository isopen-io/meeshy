# Iteration 186i — DataStorageView: brand-color consolidation

**Date**: 2026-07-20
**Scope**: iOS only — `DataStorageView` (Réglages → Stockage / media cache management)
**Type**: Design-system / brand-color consolidation (raw-hex → token)
**Branch**: `claude/laughing-thompson-0lonrh`

## Context

180i (Affiliate pair, PR #2142) closed with an explicit "siblings restants"
pointer, naming two Settings-adjacent screens that still carry self-contained
off-brand `accentColor` hex constants: `DataStorageView` (`E67E22` + `EF4444`)
and `TermsOfServiceView` (`45B7D1` cyan). This iteration executes the
`DataStorageView` half of that pointer.

## Deficits

The Meeshy brand is a single Indigo scale (`#6366F1` → `#4338CA`, see
`apps/ios/CLAUDE.md` § Brand Identity), and the design-system rule is explicit:
*"New code MUST use the Indigo scale or semantic names, not raw hex."* Every
hardcoded off-brand / raw hex is a "avoid fixed colors" brand-coherence
violation. `DataStorageView` had three:

1. **Off-brand carrot-orange accent** — `private let accentColor = "E67E22"`
   (Flat-UI carrot). This one constant drives the entire screen accent:
   back button (l.50), the "Cache media" section header icon + label (l.88),
   the `folder.fill` field icon (l.92), and the cache-section surface tint +
   border (l.115 → `sectionBackground`). Orange belongs to no Meeshy token; it
   is a pure off-brand hue, exactly like the `2ECC71` emerald eradicated from
   the Affiliate pair in 180i.

2. **Raw red on the destructive `trash.fill` icon** — `fieldIcon("trash.fill",
   color: "EF4444")` (l.130). `#EF4444` is Tailwind red-500, but the **label
   right next to it** already uses the semantic token `MeeshyColors.error`
   (`#F87171`, l.134). So the destructive row rendered a **two-red mismatch**:
   the icon a slightly-different red from its own caption. This is both a raw
   hex and a genuine visual inconsistency inside a single control.

3. **Raw neutral-gray for the "Actions" section** — `"6B7280"` used twice
   (section-header icon + label, l.123; section surface tint, l.147). `#6B7280`
   is Tailwind gray-500 — and it happens to be the **exact value** of the
   existing design-system token `MeeshyColors.neutral500Hex`. So this was a raw
   hex duplicating a token that already exists, purely by literal.

## Fix

Three type-identical `String` swaps to existing `MeeshyColors` tokens (all of
the identical 6-char, no-`#` shape already consumed by `Color(hex:)` /
`ThemeManager.surfaceGradient(tint:)` / `.border(tint:)`), so zero call-site
changes:

- `accentColor = "E67E22"` → `MeeshyColors.brandPrimaryHex` (`"6366F1"`,
  indigo500) — same target the Affiliate pair migrated to in 180i, keeping the
  Settings-adjacent screens visually coherent.
- `fieldIcon("trash.fill", color: "EF4444")` → `color: MeeshyColors.errorHex`
  (`"F87171"`) — the trash **icon** now matches its **label**'s
  `MeeshyColors.error`; the destructive row reads as one coherent red.
- both `"6B7280"` → `MeeshyColors.neutral500Hex` — value-identical token swap,
  zero visual change, removes the last two raw hexes from the file.

`MeeshyColors` was already referenced in the file (`.error`, l.134) and
`import MeeshyUI` is already present (l.4) → no new import. No logic path, no
i18n key, no test touched.

## Non-goals (deliberately out of scope)

- `TermsOfServiceView` (`45B7D1` cyan) — the second half of the 180i pointer;
  its bilingual legal-copy dictionary makes it a distinct i18n-adjacent pass,
  deferred to a dedicated iteration.
- The `sectionBackground` / `fieldIcon` / `sectionHeader` helper signatures
  (opaque `color: String`) are left intact — they are correctly agnostic
  primitives; only the *values* passed to them were off-brand.

## Verification

No Swift toolchain in this Linux environment → static review. Every edit swaps
a raw hex `String` literal for an existing `MeeshyColors.*Hex` constant of the
identical type; `grep '"[0-9A-Fa-f]\{6\}"'` over the file confirms **zero** raw
6-hex literals remain. No test references the view
(`grep -rl DataStorageView MeeshyTests` → 0). No open PR touches the file
(`search_pull_requests … DataStorageView` → 0). CI **iOS Tests** is the gate.

## Status: RESOLVED

Off-brand carrot-orange eradicated from `DataStorageView`; the destructive
trash icon re-aligned to its label's semantic `error` red; the two raw
neutral-gray literals folded into `MeeshyColors.neutral500Hex`. The file now
carries zero raw hex. Remaining legacy sibling from the 180i pointer:
`TermsOfServiceView` (`45B7D1` cyan).
