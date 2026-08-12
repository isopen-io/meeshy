# Plan — Iteration 194i — TermsOfServiceView brand-color consolidation

**Base:** `main` HEAD (`a598cbe`, post-193i #2170 merge)
**Branch:** `claude/laughing-thompson-qk04t7`
**File:** `apps/ios/Meeshy/Features/Main/Views/TermsOfServiceView.swift` (1 file, iOS only)

## Goal

Remove the off-brand cyan `45B7D1` accent from the Terms-of-Service legal screen,
aligning it with its already-migrated sibling `PrivacyPolicyView` and completing
the 180i → 186i "siblings restants" chain (#2154 explicitly deferred this file).

## Steps

1. [x] Confirm merged/in-flight iteration numbers; pick **194i** (> merged 193i, > highest-open 191i).
2. [x] Confirm no open PR touches `TermsOfServiceView` (`search_pull_requests` → only #2154 DataStorageView, which defers it).
3. [x] Confirm `MeeshyColors.brandPrimaryHex == "6366F1"` and `import MeeshyUI` present.
4. [x] `TermsOfServiceView`: `accentColor = "45B7D1"` → `MeeshyColors.brandPrimaryHex`.
5. [x] Grep-verify zero residual raw hex in the file.
6. [x] Analysis + plan docs; update `branch-tracking.md` (194i pointer on top).
7. [ ] Commit, push, open PR. Gate = CI **iOS Tests**.

## Risk

Minimal: a type-identical `String` swap to a pre-existing design-system token,
zero logic, zero call-site changes, zero i18n keys, no test references the view.

## Deferred (next iterations)

- `AboutView` (`45B7D1` cyan **+** `F8B500` gold per-section multi-hue — needs its
  own design analysis, not a mechanical swap).
- `TermsOfServiceView` bilingual legal dictionary → String Catalog (distinct i18n pass).
