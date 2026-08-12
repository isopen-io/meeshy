# Iteration 143i — StoryExpiredContent VoiceOver structure

- **Date**: 2026-07-16
- **Track**: iOS UI/UX (suffix `i`)
- **Working branch**: `claude/laughing-thompson-rjwver`
- **Base**: `main` HEAD `0528a90`
- **Scope**: 1 file, 0 logic changes, 0 new i18n keys, 0 new test files

## Component

`apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift`

Empty-state screen surfaced when a notification points at a story that is no
longer available (expired / deleted / 404). Composition top → bottom: actor
header (avatar + name + relative time) → trigger visual (reaction emoji or
comment bubble) → optional comment excerpt → localised title/subtitle → primary
CTA → secondary link.

## Findings

1. **actorHeader read as three separate VoiceOver elements.** The `MeeshyAvatar`
   already carries `.accessibilityLabel(name)` (see `MeeshyAvatar.swift:378`), so
   VoiceOver read the actor name **twice** — once from the avatar, once from the
   adjacent name `Text` — then the relative time as a third swipe stop.
2. **Decorative comment bubble exposed to VoiceOver.** The `bubble.left.fill`
   hero symbol (comment trigger) had no accessibility treatment; VoiceOver
   announced it as an unlabeled image. Its meaning is already carried by the
   comment excerpt and the localised title, so it is purely decorative.
3. **Title + subtitle read as two swipe stops** rather than one statement.

## Changes

- **actorHeader**: `.accessibilityHidden(true)` on `MeeshyAvatar` (kills the
  duplicate name read) + `.accessibilityElement(children: .combine)` on the
  `HStack` → one element: `"<name>, <relative time>"`.
- **triggerVisual**: `.accessibilityHidden(true)` on the decorative comment
  bubble. The reaction emoji keeps its `.accessibilityLabel` (the emoji **is**
  the reaction content).
- **titleBlock**: `.accessibilityElement(children: .combine)` → title + subtitle
  read as one statement.

## Dynamic Type — freeze (per 84i convention)

The two `.font(.system(size:))` call sites (reaction emoji **64pt**, comment
bubble **56pt**) are **hero glyphs ≥40pt** and stay fixed — NOT migrated to
`MeeshyFont.relative`. Scaling a 64pt hero visual under Dynamic Type would blow
the empty-state layout; per the 84i decorative-glyph rule, ≥40pt hero glyphs
remain fixed and are annotated in-line. The surrounding body copy
(`headline`, `caption`, `title2`, `body`, `subheadline`) already uses semantic
relative fonts and scales.

**⚠️ `StoryExpiredContent` SOLDÉ**: do not re-open. VoiceOver structure done; the
2 hero glyphs are intentionally frozen (≥40pt, 84i).

## Verification

- No logic, no branch changes — purely additive view modifiers.
- Existing `StoryExpiredContentTests` exercise `_ = view.body` for **both**
  triggers (`test_init_doesNotCrash_withReactionTrigger` /
  `_withCommentTrigger`), so both modified code paths are constructed under test.
  The pure `foregroundOnBackground` tests are unaffected.
- Cannot run the iOS simulator on this Linux host; CI gate = `ios-tests`.

## Remaining trail (for 144i)

`StoryViewerView+Content` (⚠️ i18n + `@State private` cross-file), then the
2/1-`.system` tail: `BubbleStandardLayout` (2), `StatsTimelineChart` (2),
`AudioPostComposerView`, `ConversationBackgroundComponents`, `MessageViewsDetailView`.
Avoid files touched by open iOS PRs (#1966 ThemedBackButton, #1968 MyStoriesView,
#1970 FriendRequestListView).
