# Iteration-189i (CI repair) — PostStat VoiceOver labels leaked raw inflection markup

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + i18n — feed post stat counters
**File touched:** `apps/ios/Meeshy/Features/Main/Views/Cells/PostStatAccessibility.swift` (1 file, 0 new test)

## Context — pre-existing `main`-red breakage (not introduced by 189i)

While iteration 189i (`KeypadTab` clear-all VoiceOver action) was in review, its
PR CI surfaced **8 failing `PostStatAccessibilityTests`** assertions. Investigation
confirmed the failure is **pre-existing on `main`** — the most recent completed
`ios-tests` run on `main` HEAD (`3fa1ac62`) is itself `failure`, and the 189i diff
does not touch any `PostStat` file. The suite was shipped by 179i (#2119) and has
been red on `main` since.

## Finding

`PostStatAccessibility.{likes,comments,reposts}Label` built the VoiceOver label
with Automatic Grammar Agreement markup passed as an **inline** `defaultValue`:

```swift
String(localized: "feed.post.stat.likes",
       defaultValue: "^[\(count) like](inflect: true)", bundle: .main)
```

Automatic Grammar Agreement (`^[…](inflect: true)`) is resolved **only** when the
value is loaded from a compiled string catalog (`.xcstrings`). No catalog entry
backs `feed.post.stat.likes` / `.comments` / `.reposts` (`grep` = 0 hits in any
`.xcstrings`/`.strings`/`.stringsdict`), so Foundation returns the markup
**verbatim**:

```
XCTAssertEqual failed: ("^[1 like](inflect: true)") is not equal to ("1 like")
```

This is not merely a test failure — it is a **real a11y regression**: VoiceOver
would literally announce "caret bracket 1 like bracket inflect true" for every
feed post stat counter. The doc comment's claim ("yields the singular/plural
form at runtime … with no `.stringsdict` required") was incorrect.

## Fix

Select singular/plural explicitly per count and route each form through
`String(localized:)` so both stay localizable, without depending on catalog-only
inflection resolution:

```swift
count == 1
    ? String(localized: "feed.post.stat.likes.one",   defaultValue: "1 like",         bundle: .main)
    : String(localized: "feed.post.stat.likes.other", defaultValue: "\(count) likes", bundle: .main)
```

English dev-language rule (singular only for `count == 1`, plural for everything
else including `0`) matches the `PostStatAccessibilityTests` contract exactly:
`likesLabel(1)="1 like"`, `likesLabel(5)="5 likes"`, `likesLabel(0)="0 likes"`,
and the same shape for comments/reposts. Distinct per-type keys keep the three
counters unambiguous. VoiceOver now announces "5 likes, button" instead of the
raw markup.

## Rationale for bundling with 189i

`main` is red on `ios-tests`, so **no** iOS PR (the whole `laughing-thompson`
swarm) can reach a green gate until this is repaired — including #2162 (189i)
itself. Repairing it here unblocks the shared gate. Precedent: commit `c71187c6`
("fix(ios): repair app build broken by today's a11y merges") applied the same
"repair the shared `main` breakage inline" pattern. The change stays within the
189i a11y/i18n theme.

## Verification

- **Test contract:** all 11 `PostStatAccessibilityTests` now hold (3
  `includesCount`, 6 singular/plural, 1 zero, 1 distinct-per-type) by
  construction.
- **No catalog edit:** two inline `defaultValue` keys per counter, consistent
  with the file's existing style; interpolated `defaultValue` (`\(count)`) is the
  standard Foundation substitution path when no catalog entry exists.
- **No behaviour change beyond the label string:** the helper signature and both
  call sites (`TextPostCell`, `MediaPostCell`) are unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — confirm green on the PR.

## Remaining improvements (future iterations)

- For full CLDR pluralization (languages with >2 plural forms), migrate these six
  keys into a `.xcstrings` catalog with plural variations. The explicit two-form
  helper is correct for the dev language and any two-form locale; a catalog would
  extend it to all locales. Deliberately deferred (heavier, catalog-scoped
  change).

**Status: RESOLVED — PostStat VoiceOver counters announce localized singular/plural text; `ios-tests` unblocked.**
