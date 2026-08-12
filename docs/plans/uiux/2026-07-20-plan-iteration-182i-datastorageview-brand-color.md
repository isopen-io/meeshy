# Plan — Iteration 182i — DataStorageView brand-color consolidation

**Base**: `main` HEAD (post-180i #2142)
**Branch**: `claude/laughing-thompson-k9l43k`
**File**: `DataStorageView.swift` (1 file, iOS only)

## Goal
Remove the off-brand orange `E67E22` accent and raw red/gray literals from the
media-storage Settings screen, per the 179i/180i "Future Considerations" pointer.

## Steps
1. [x] Confirm no open PR touches the file (`search_pull_requests … DataStorage` → 0).
2. [x] `accentColor = "E67E22"` → `MeeshyColors.brandPrimaryHex`.
3. [x] `fieldIcon("trash.fill", color: "EF4444")` → `MeeshyColors.errorHex` (match label).
4. [x] Both `"6B7280"` → `MeeshyColors.neutral500Hex` (exact hex, zero visual change).
5. [x] Grep-verify no residual off-brand hex; `MeeshyColors` already imported.
6. [x] Analysis + plan docs; update `branch-tracking.md` (182i on top, 180i merged).
7. [ ] Commit, push, open PR. Gate = CI **iOS Tests**.

## Risk
Minimal: type-identical `String` swaps, zero logic, zero call-site changes, zero
i18n keys, no test references the view.

## Deferred (next iterations)
- `TermsOfServiceView` (`45B7D1` cyan; bilingual legal dict = separate i18n pass).
