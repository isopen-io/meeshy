# Iteration 208i — `PostTranslationSheet.originalSection` VoiceOver selected-state

**Track:** iOS UI/UX (suffix `i`)
**Date:** 2026-07-21
**Branch:** `claude/laughing-thompson-nw88a3`
**Base:** `main` HEAD `22465a5` (Merge PR #2214)
**File:** `apps/ios/Meeshy/Features/Main/Views/PostTranslationSheet.swift`

## Problem

`PostTranslationSheet` is the Prisme Linguistique language picker for a feed post
(original content + available translations + on-demand translation requests). Its
first row, `originalSection`, presents the **original language** as the active /
checked option: it carries a green `checkmark.circle.fill` (`MeeshyColors.success`,
line 93-95) — visually the "this one is current" marker, the exact counterpart of
the `chevron.right` navigational affordance on the (non-checked) translation rows.

The row is a `Button`, but it had **no `.accessibilityAddTraits(.isSelected)`**. Its
checked/active state was therefore conveyed by **icon + colour alone** — a
**WCAG 1.4.1 (Use of Color)** violation. VoiceOver announced the original row and the
translation rows identically, with no way to perceive which option is the current one.

This is the exact follow-up explicitly named by merged sibling **#2147 (186i)**:

> `PostTranslationSheet.originalSection` — active language marked by checkmark +
> color only, no `.accessibilityAddTraits(.isSelected)` (WCAG 1.4.1).

## Prior art on this file (all merged — no contention)

- **#2116 (179i)** — `common.close` label on the toolbar close button (`:67`). ✅ done.
- **#2149 (186i)** — locale-aware + VoiceOver-labelled confidence badge (`:157`). ✅ done.
- The originalSection selected-state was the last remaining gap flagged in the audit
  (`ACCESSIBILITY_AUDIT.md` §6.6, `PostTranslationSheet`) and in #2147's follow-up.

`git show origin/main:…/PostTranslationSheet.swift | grep -c accessibilityAddTraits`
→ **0** on the fresh base (no prior trait, no duplicate). No open PR references this file
(`search_pull_requests … PostTranslationSheet` → 6 results, all closed/merged).

## Fix

One additive view modifier on the `originalSection` `Button`, mirroring the proven
`ProfileLanguagePickerSheet` doctrine (85i, first `.isSelected` in the app) and its
replications (186i):

```swift
.buttonStyle(PlainButtonStyle())
.accessibilityAddTraits(.isSelected)
```

The original is unconditionally the checked baseline in this picker (the green check is
rendered unconditionally), so the trait is unconditional — parity with the visual. The
visible checkmark stays for sighted users; `.isSelected` adds the VoiceOver equivalent
that iOS localises natively.

## Scope

- **1 file**, +4 lines (3 comment, 1 modifier).
- **0** logic / **0** network / **0** new i18n key / **0** new test / **0** visual change.
- iOS 16 floor → `.isSelected` needs no `@available` guard.
- No test references `PostTranslationSheet` (grep across `MeeshyTests` / `MeeshyUITests`
  / SDK = 0). Gate = CI `iOS Tests` (compile Xcode 26.1.1 / run sim iOS 18.2) — this
  branch is authored in a Linux container with no Swift toolchain.

## Verification

- Insertion point is the row-level `Button` (parity with 85i/186i siblings), after
  `.buttonStyle`, so the trait attaches to the combined button element.
- The translation rows (`translationsSection`) use `chevron.right` (navigational, not a
  selection marker) and the request rows (`requestTranslationSection`) use a
  text-bearing "Demandée" status — neither is a colour-only selection indicator, so
  `originalSection` was the sole WCAG 1.4.1 gap on this screen. It is now closed.

## Follow-ups (208i+ — verify swarm contention first)

- `requestTranslationSection` in-flight `ProgressView` (`:208`) is label-less — the
  "requesting translation" state announces a bare spinner. Candidate for a labelled
  in-flight state (reuse an existing "en cours" key).
- `requestTranslationSection` rows are not `.accessibilityElement(children: .combine)`
  (flag + name read as separate stops); combine the text while keeping the "Traduire"
  button separate (195i ThreadView doctrine).
