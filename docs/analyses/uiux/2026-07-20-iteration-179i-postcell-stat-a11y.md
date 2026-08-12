# Iteration-179i — VoiceOver labels for feed post stat counters

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + i18n — feed post like/comment/repost counters
**Files touched:**
- `apps/ios/Meeshy/Features/Main/Views/Cells/TextPostCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/Cells/MediaPostCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/Cells/PostStatAccessibility.swift` (new — shared helper)
- `apps/ios/MeeshyTests/Unit/Views/PostStatAccessibilityTests.swift` (new — pure-logic tests)

0 logic change, 0 visual change, 3 new inline i18n keys.

## Component

`TextPostCell` and `MediaPostCell` are the two UIKit `UICollectionViewCell`
subclasses that render the social feed (`FeedListViewController` →
`FeedStore.posts`). Each cell footer is a `statsStack` of `UIButton(type:
.system)` controls showing engagement counts: `TextPostCell` has
**like / comment / repost**, `MediaPostCell` has **like / comment**. Each
button's visible title is set to `"  \(count)"` — the bare number, indented
two spaces off its leading SF Symbol (`heart`/`heart.fill`, `bubble.right`,
`arrow.2.squarepath`).

This gap was explicitly logged as a backlog item at the end of the
176i `ConversationEncryptionDetailSheet` analysis:
> the UIKit `MediaPostCell`/`TextPostCell` icon-only like/comment/repost
> buttons lacking VoiceOver labels.

## Findings

Because a `UIButton`'s default `accessibilityLabel` derives from its **title**,
VoiceOver read each stat control as just the number — "5, button", "3, button",
"2, button" — with **no indication of what the number counts**. The meaning was
conveyed **only** by the adjacent SF Symbol glyph, which carries no accessible
text. A VoiceOver user sweeping the feed footer heard three anonymous numbers
and could not tell likes from comments from reposts. This is a **WCAG 1.1.1
(Non-text Content)** / **1.4.1 (Use of Color/Icon)** failure — the same
"meaning signalled by glyph only" class resolved for the reply-count row in
176i (`LoadMoreRepliesCell`).

Secondarily, the bare count had no singular/plural grammar ("1 like" vs
"5 likes") and no localizable string at all — a latent i18n gap on an
otherwise number-only surface.

## Fix

Introduced a single shared, pure helper `PostStatAccessibility` (new file,
Cells folder) exposing `likesLabel(_:)`, `commentsLabel(_:)`,
`repostsLabel(_:)`. Each returns a localized string built with **Automatic
Grammar Agreement**:

```swift
String(localized: "feed.post.stat.likes",
       defaultValue: "^[\(count) like](inflect: true)",
       bundle: .main)
```

`inflect: true` yields "1 like" / "5 likes" at runtime in the development
language (en) with **no `.stringsdict`** and no `.xcstrings` edit — the exact
pattern established in 176i for `LoadMoreRepliesCell`. Both cells now assign
`likeButton.accessibilityLabel` / `commentButton.accessibilityLabel` (and
`repostButton` in `TextPostCell`) from the helper inside `configure(with:)`.

The helper **deduplicates** the label logic across the two cells (design-system
principle) rather than inlining three `String(localized:)` calls twice, and its
purity makes it unit-testable without instantiating a `UICollectionViewCell`.

## Rationale

- **Minimal, correct a11y move:** the button title, image, tint, layout, tap
  behavior and reuse path are all untouched — only `accessibilityLabel` is set.
  No trait change: the controls remain `UIButton`s exactly as before.
- **Shared helper over duplication:** two cells, one source of truth for the
  labels; adding a per-type call site in each cell would have duplicated the
  i18n keys and the inflection markup.
- **i18n convergence:** the three new keys are inline `defaultValue`s (dev
  language en), so they localize cleanly when the `.xcstrings` catalog is
  next regenerated, with correct pluralization for free.

## Verification

- **Static review:** `String(localized:defaultValue:bundle:)` with an
  `^[…](inflect: true)` default value is a standard iOS 16.0+ API with an
  in-repo precedent (176i `LoadMoreRepliesCell.labelText`). App floor is
  iOS 16.0 — no availability guard needed. `accessibilityLabel` assignment on
  `UIButton` is universally available.
- **New unit tests:** `PostStatAccessibilityTests` (11 cases) assert count
  presence, singular/plural agreement (`1 like` vs `5 likes` vs `0 likes`),
  and per-type distinctness. Pure-function tests — no cell instantiation.
- **No behavior/test churn:** no existing test references these cells or their
  labels (grep across `MeeshyTests`/`MeeshyUITests`/`MeeshySDKTests` = 0). The
  cells' `configure(with: PostRecord)` signature is unchanged.
- **CI gate:** `iOS Tests` (macOS runner). This is a Linux container, so the
  Xcode compile + XCTest run happen in CI — confirm `iOS Tests` is green on the
  PR before merge.

## Remaining improvements (future iterations)

- The two stat buttons have **no target-action** — they are display-only
  counters rendered as `UIButton`s. A future pass could either wire them to the
  like/comment actions or downgrade them to `UILabel`/static-text a11y elements
  so VoiceOver stops announcing a non-actionable "button". Deferred: it is a
  semantics decision, not an unlabeled-content defect, and out of this scope.
- `StatusComposerView` numeric counter (`Text("\(count)/122")`) is still not run
  through a locale-aware number formatter (carried from the 176i backlog).

**Status: RESOLVED for `TextPostCell` / `MediaPostCell` stat-counter VoiceOver labels.**
