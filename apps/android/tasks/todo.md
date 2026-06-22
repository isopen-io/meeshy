# Loop — Stories slice (Phase 5): Story tray foundation

Build order is Auth → Conversations → Chat → Feed → **Stories** → Calls.
Feed shipped last loop; Stories is next. This loop delivers the **story tray**
(ring carousel) end-to-end on the existing SWR/Hilt/design-system foundation,
plus a minimal but real story viewer so the tray is not a dead end.

## Plan
- [ ] core/model: canonical `isoToEpochMillis` (SSOT) + sdk-core delegates
- [ ] core/model: `StoryGrouping.kt` — faithful port of `Array<APIPost>.toStoryGroups`
      (filter STORY, group by author, per-group sort by createdAt asc, group sort
      = me-first → unviewed-first → latest desc) + `hasUnviewed` / `latestStory`
      / `isExpired` (21h fallback) / `isFullyExpired`
- [ ] core/model: `StoryGroupingTest.kt` (TDD: grouping, ordering, expiry)
- [ ] `:feature:stories` module (build.gradle, manifest, strings)
- [ ] `StoryRingPresentation` pure builder (resolve avatar/thumbnail URL, ring state,
      isMine, count) + tests
- [ ] `StoriesViewModel` (load via StoryRepository, group, optimistic mark-viewed) + tests
- [ ] `StoryTray` composable (horizontal ring carousel, unviewed gradient ring,
      accent-coherent, my-story affordance)
- [ ] Minimal `StoryViewerScreen` (segmented progress, tap-advance/dismiss,
      auto-advance, Prisme text, first-media image) + nav route `story/{userId}`
- [ ] Wire tray atop ConversationListScreen; settings.gradle include
- [ ] Verify: `./meeshy.sh test`

## Review
All planned items shipped. `./meeshy.sh check` green: debug APK assembles +
all unit tests pass, including 19 new ones (9 `StoryGroupingTest`, 6
`StoryTrayBuilderTest`, 4 `StoryContentResolverTest`).

Delivered this loop (Stories slice, build-order next after Feed):
- SSOT: canonical `isoToEpochMillis` moved to `:core:model`; sdk-core util delegates.
- `:sdk-core` `StoryGrouping.kt` — faithful port of `Array<APIPost>.toStoryGroups`
  + `hasUnviewed`/`latestStory`/`isExpired`(21h)/`isFullyExpired` (pure, `now` injected).
- `:feature:stories` module: `StoryTrayBuilder` (self/others split, expired filter,
  URL resolution), `StoryContentResolver` (Prisme rule 1), `StoriesViewModel`,
  `StoryViewerViewModel`, `StoryTray` (accent-coherent rings) and `StoryViewerScreen`
  (segmented progress, tap nav, auto-advance, mark-viewed).
- Navigation: `story/{userId}` route + `meeshy://story/...` deep link; tray injected
  atop the conversation list via a `header` slot (keeps conversations↔stories decoupled).

Colour/navigation/UX coherence respected: rings use the group's deterministic
`DynamicColorGenerator` accent; viewer dismiss pops back to the list (no dead end);
tray hidden entirely on empty cache (instant-app, no blocking skeleton).

Follow-ups (tracked in feature-parity.md): SWR/Room backing for the tray,
story composer/publish, reactions/comments overlay, viewers sheet, count dots,
media prefetch.
