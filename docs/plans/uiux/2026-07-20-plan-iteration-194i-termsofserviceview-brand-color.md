# Plan — Iteration 194i — TermsOfServiceView brand-color consolidation

**Base**: `main` HEAD `995ed53` (post-186i merge #2154)
**Branch**: `claude/laughing-thompson-0lonrh`
**Files**: `TermsOfServiceView.swift` (1 file, iOS only)

## Goal
Remove the off-brand cyan `45B7D1` accent from the Conditions d'utilisation
screen — the last sibling named in the 180i "siblings restants" pointer —
replacing it with the `MeeshyColors.brandPrimaryHex` token.

## Steps
1. [x] Confirm no open PR touches `TermsOfServiceView` (`search_pull_requests` → 0).
2. [x] `accentColor = "45B7D1"` → `MeeshyColors.brandPrimaryHex`.
3. [x] Grep-verify no residual raw 6-hex literal; confirm `import MeeshyUI` present.
4. [x] Analysis + plan docs; update `branch-tracking.md` (194i on top, mark 186i merged).
5. [ ] Commit, push, open PR. Gate = CI **iOS Tests**.

## Risk
Minimal: one type-identical `String` swap to a pre-existing token, zero logic,
zero call-site change, zero i18n key, no test references the view. The accent
shifts cyan → indigo (intended brand alignment).

## Out of scope
- The bilingual `sections` legal dictionary (fr/en in-file document + segmented
  picker) — a separate legal/i18n pass, per the 180i pointer. Not touched.

## Backlog note
This closes the 180i "siblings restants" pointer in full. The Settings-adjacent
accent trio now uniformly uses `brandPrimaryHex`.
