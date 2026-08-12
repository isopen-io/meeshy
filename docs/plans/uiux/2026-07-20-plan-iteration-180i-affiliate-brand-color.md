# Plan — Iteration 180i — Affiliate pair brand-color consolidation

**Base**: `main` HEAD (post-179i merge #2125, post-181i merge #2130)
**Branch**: `claude/laughing-thompson-k9l43k`
**Files**: `AffiliateView.swift`, `AffiliateCreateView.swift` (2 files, iOS only)

## Goal
Remove the off-brand emerald `2ECC71` accent from the referral-links pair and
align a misused semantic `success` green, per the 179i "migrate the pair together"
pointer.

## Steps
1. [x] Confirm no open PR touches either Affiliate file (`search_pull_requests`).
2. [x] `AffiliateCreateView`: `accentColor = "2ECC71"` → `MeeshyColors.brandPrimaryHex`.
3. [x] `AffiliateView`: `accentColor = "2ECC71"` → `MeeshyColors.brandPrimaryHex`.
4. [x] `AffiliateView`: Share icon `MeeshyColors.success` → `Color(hex: accentColor)`.
5. [x] Grep-verify no residual off-brand hex; confirm `MeeshyColors` already imported.
6. [x] Analysis + plan docs; update `branch-tracking.md` (180i on top, mark 179i merged).
7. [ ] Commit, push, open PR. Gate = CI **iOS Tests**.

## Risk
Minimal: type-identical `String`/`Color` swaps, zero logic, zero call-site changes,
zero i18n keys, no test references either view.

## Deferred (next iterations)
- `DataStorageView` (`E67E22` + raw `EF4444`).
- `TermsOfServiceView` (`45B7D1` cyan; bilingual legal dict is a separate i18n pass).
- Affiliate manual `UIActivityViewController` → `ShareLink` (HIG, distinct concern).
