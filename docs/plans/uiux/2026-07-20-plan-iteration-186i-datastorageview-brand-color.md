# Plan — Iteration 186i — DataStorageView brand-color consolidation

**Base**: `main` HEAD `64f943d` (post-182i merge #2133, post-179i merge #2119)
**Branch**: `claude/laughing-thompson-0lonrh`
**Files**: `DataStorageView.swift` (1 file, iOS only)

## Goal
Remove the off-brand carrot-orange `E67E22` accent + the raw `EF4444` / `6B7280`
hexes from the Stockage screen, per the 180i "siblings restants" pointer
(PR #2142). Align every color to an existing `MeeshyColors` token.

## Steps
1. [x] Confirm no open PR touches `DataStorageView` (`search_pull_requests` → 0).
2. [x] `accentColor = "E67E22"` → `MeeshyColors.brandPrimaryHex`.
3. [x] `fieldIcon("trash.fill", color: "EF4444")` → `color: MeeshyColors.errorHex`
       (icon now matches its label's `MeeshyColors.error`).
4. [x] Both `"6B7280"` → `MeeshyColors.neutral500Hex` (value-identical token).
5. [x] Grep-verify no residual raw 6-hex literal; confirm `import MeeshyUI` present.
6. [x] Analysis + plan docs; update `branch-tracking.md` (186i on top).
7. [ ] Commit, push, open PR. Gate = CI **iOS Tests**.

## Risk
Minimal: four type-identical `String` swaps to pre-existing tokens, zero logic,
zero call-site changes, zero i18n keys, no test references the view. The only
pixel change is the trash icon's red shifting `EF4444`→`F87171` to match its own
label — a consistency improvement, not a regression.

## Deferred (next iterations)
- `TermsOfServiceView` (`45B7D1` cyan; bilingual legal dict is a separate i18n pass).
