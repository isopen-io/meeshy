# Plan — Iteration-208i — `PrivacyPolicyView` brand-color token

**Base**: `main` HEAD `22465a5` (Merge PR #2214)
**Working branch**: `claude/laughing-thompson-c3ngz4`
**Type**: Design-system consolidation (1 file, 0 logic / 0 visual / 0 i18n / 0 test)

## Goal

Replace the hardcoded accent-color string literal in `PrivacyPolicyView` with
the shared brand token `MeeshyColors.brandPrimaryHex`, closing the follow-up
explicitly named in the 194i analysis and bringing the Privacy twin to parity
with `TermsOfServiceView`.

## Steps

1. [x] Sync `claude/laughing-thompson-c3ngz4` to latest `origin/main` (`22465a5`).
2. [x] Confirm `MeeshyColors.brandPrimaryHex == "6366F1"` (byte-identical, zero
       visual change).
3. [x] Confirm the follow-up was explicitly flagged by 194i and that no open PR
       touches `PrivacyPolicyView`.
4. [x] Edit `PrivacyPolicyView.swift`:
       `private let accentColor = "6366F1"` → `MeeshyColors.brandPrimaryHex`.
5. [x] Write analysis + plan docs.
6. [ ] Commit and push to the working branch.

## Risk

Minimal. `MeeshyUI` already imported; token is a `public static let` of the
exact same value consumed at 30+ sites. No logic, string, or visual change.

## Verification

- Gate = CI `iOS Tests` (compile + snapshot parity).
- Grep: `"6366F1"` literal absent from `PrivacyPolicyView.swift` after edit.
