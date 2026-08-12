# Plan — Iteration-195i (iOS)

**Date:** 2026-07-20
**Branch:** `claude/laughing-thompson-xnsbok` (from `main` HEAD `be4a52c`)
**Scope:** iOS only — Localization (i18n) × Accessibility (VoiceOver)
**Target:** `apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`
**Number:** 195i chosen strictly `>` highest in-flight (194i `LinksHubView`);
`list_pull_requests` (open) shows no PR touching `BrandSignature`; 0
branch-tracking iteration row; 0 existing test.

## Problem

`BrandSignature` (version + credit footer, shared splash + login) gave its
VoiceOver group a **hardcoded English `Text` literal** as `.accessibilityLabel`
— untranslated for blind users on every non-English locale, while the visible
credit (`splash.madeWithLove`) is localized in 5 languages. Xcode had also
auto-extracted the literal into `Localizable.xcstrings` as a phantom
untranslated key.

## Steps

1. [x] Sync working branch from latest `main` (`be4a52c`); reset the branch
   (prior sm8w8b/186i commits belong to a separate PR).
2. [x] Confirm no collision: highest in-flight PR = 194i; no open PR touches
   `BrandSignature`; parse `list_pull_requests` for iteration numbers → 195i free.
3. [x] Replace the English `Text(...)` label with
   `String(localized: "brand.signature.accessibilityLabel", defaultValue: …, bundle: .main)`
   (mirror `story.mine.row.a11y`).
4. [x] Catalog: add `brand.signature.accessibilityLabel` (de/en/es/fr/pt-BR,
   `extractionState: manual`) via surgical text edit; remove orphaned literal key.
5. [x] Add source-level guard `BrandSignatureLocalizationTests.swift`.
6. [x] Write analysis `2026-07-20-iteration-195i-brandsignature.md`.
7. [x] Update `branch-tracking.md` (pointer + row).
8. [ ] Commit + push `-u`; open PR; confirm CI `iOS Tests` green.

## Constraints honored

- 1 production file (+6/−1), 1 catalog edit, 1 new test file. 0 logic,
  0 visual/layout/color change, 0 new visible string.
- Surgical `.xcstrings` edit (Xcode mixed formatting preserved; JSON validated).
- `bundle: .main` matches the `splash.madeWithLove` call in the same file.

## Gate

CI `iOS Tests` (macOS runner) — build + VoiceOver run in CI (Linux container
here). New guard test auto-included via `xcodegen generate`.
