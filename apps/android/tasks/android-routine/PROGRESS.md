# Progress — state & what to do next

## Current build-order position

`Auth ✅ → Conversations ✅ → Chat ✅ → Feed ✅ → **Stories (in progress)** → Calls → rest`

Stories so far: tray (ring carousel) + cross-group viewer playback engine +
quick-reaction strip + swipe gestures + realtime reaction socket deltas +
who-viewed sheet shipped earlier loops; this loop gives the **tray a Room-backed
SWR backing** so it is genuinely cache-first (paints from Room on a warm start,
cold skeleton only on an `Empty`/dataless-`Syncing` cache) — `StoryEntity`/
`StoryDao` (DB v5), `StoryCacheSource`, `StoryRepository.storiesStream`, and the
pure `StoryTrayReducer`.

## Next slice (pick one for the next run)

Ordered by value within the Stories area:
1. `story-composer` — publish flow (text/media) via the outbox/WorkManager chain.
2. `story-comments-overlay` — live-chat comments panel + optimistic posting.
3. `story-media-prefetch` — warm the next slide's media before it shows.

Note: server-side `currentUserReactions` seeding of `mine` on load, the
app-wide `SocialSocketManager.attach()` lifecycle wiring (no caller yet — affects
ALL social events, touches `:app`), and realtime `story:viewed` append to the
viewers list (socket payload lacks the viewer's name/avatar to render a row —
needs a richer gateway event or a user lookup) all remain tracked follow-ups.

After Stories richness is sufficient, advance to the **Calls** area
(`feature-parity.md` §"Calls").

## Run log

### 2026-06-23 — slice `story-tray-swr` ✅
- **Branch:** `claude/apps/android/story-tray-swr`
- **What:** gave the story tray a **Room-backed stale-while-revalidate** backing,
  porting the proven `ConversationCacheSource` pattern so the tray is genuinely
  cache-first (Instant-App): on a warm start it paints from Room before any
  network call (survives process death — surpassing the in-memory Feed cache),
  and the cold skeleton shows ONLY on a truly empty / still-dataless cache.
- **Added (production):**
  - `core:database` — `StoryEntity` (`id`/`payload`/`createdAt`/`cachedAt`) +
    `StoryDao` (`observeAll` ordered `createdAt DESC`, `upsertAll`, `deleteNotIn`,
    `clear`); registered in `MeeshyDatabase` (**version 4 → 5**, destructive
    migration is already configured) + `DatabaseModule.providesStoryDao`.
  - `sdk-core` — `StoryCacheSource` (internal `SwrCacheSource<List<ApiPost>>`,
    mirror of `ConversationCacheSource`: cold `null` vs synced-empty list, persist
    in a single `withTransaction`, `sync_meta` key `"stories"`); `CachePolicy.Stories`
    (fresh 1 min / keep 24 h — matches the story lifetime); `StoryRepository`
    gains `database`/`storyDao`/`syncMetaDao` deps + `storiesStream(policy,
    onSyncError)` + `refresh()`.
  - `feature:stories` — pure `StoryTrayReducer` (`stories()` keeps the stale list
    on a valueless `Syncing`; `flags()` = the cold-skeleton/sync discipline);
    `StoriesViewModel` rewired to consume `storiesStream` (was a one-shot
    `list()`), exposes `isSyncing`/`showSkeleton` + `refresh()`; `StoryTray`
    renders a `StoryTraySkeleton` row only on `showSkeleton` over an empty tray.
- **Tests (+22):**
  - `StoryDaoTest` (new, Robolectric) +5 — `createdAt DESC` order, cold-empty,
    upsert-replace by PK, `deleteNotIn`, `clear`.
  - `StoryRepositoryTest` (rewritten to Robolectric + in-memory DB) +5 — cold
    `Empty` first emission, refresh persists rows + `sync_meta`, refresh prunes
    absent rows, refresh serves `Fresh` after sync, refresh throws
    `StorySyncException` with the API message (kept the 3 `viewers()` tests).
  - `StoryTrayReducerTest` (new, pure) +11 — every `stories()` arm (Fresh/Stale/
    Syncing-value/Syncing-null-fallback/Empty) and every `flags()` arm
    (Fresh/Stale/Syncing-null±data/Syncing-value/Empty).
  - `StoriesViewModelTest` (new) +6 — cold `Empty` → skeleton; `Fresh` builds
    tray + clears skeleton; own story → self ring; `Stale` keeps tray + syncing;
    `Syncing(null)` → skeleton; background sync error clears the cold skeleton.
- **Edge cases covered:** cold vs warm cache; synced-empty (real empty list) vs
  cold-null; stale-kept list on a valueless `Syncing`; background revalidation
  failure → skeleton cleared (no infinite spinner); row pruning across syncs;
  own vs foreign author placement; expired-story filtering exercised via the
  builder (live `Instant.now()` fixtures).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m32s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted:
  `:core:database`, `:sdk-core`, `:feature:stories` testDebugUnitTest all green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (Room entity/DAO + `StoryCacheSource` +
  `storiesStream` are building blocks in `core:database`/`sdk-core`; the
  "keep-stale / when-skeleton" product rule lives in `:feature:stories`'s
  `StoryTrayReducer`); single source of truth (one Room DB; reused
  `cacheFirstFlow`/`SwrCacheSource`/`CachePolicy`; tray colours via the existing
  `StoryTrayBuilder`/`DynamicColorGenerator`); Instant-App (cold-only skeleton,
  warm paint from cache, silent background SWR); UDF + immutable `UiState`, pure
  reducer; no dead end (skeleton → tray, dismiss/refresh coherent).

### 2026-06-23 — slice `story-viewers-sheet` ✅
- **Branch:** `claude/apps/android/story-viewers-sheet`
- **What:** the author-only **who-viewed sheet** for a story — parity with iOS
  `StoryViewersSheet` + `StoryInteractionService.loadViewers`, surpassing it with
  most-recent-first ordering, blank-field hardening and Instant-App SWR behaviour.
- **Added (production):**
  - `StoryViewer` (domain) + `StoryViewersResponse`/`StoryViewerWire` (wire) +
    pure `StoryViewerWire.toStoryViewer()` in `core/model` — wire shape mirrors
    iOS `StoryViewersWireResponse` (`{ viewers: [{id, username, displayName?,
    avatarUrl?, viewedAt?, reaction?}] }`). The mapper falls back display name to
    username on null **or blank** (iOS only nil-checks) and collapses blank
    avatar/reaction/viewedAt to `null`.
  - `StoryApi.viewers(id)` → `GET posts/{id}/interactions`; `StoryRepository
    .viewers(storyId): NetworkResult<List<StoryViewer>>` (apiCall + `.map` of the
    wire list through `toStoryViewer()`).
  - `StoryViewersPresentation.order()` (`:feature:stories`, pure) — most-recent
    first (ISO `viewedAt` desc, nulls sink last, stable for ties), defensive
    dedup-by-id keeping the most-recent row. (iOS renders raw gateway order.)
  - `StoryViewersViewModel` — `load(storyId)` with Instant-App discipline:
    skeleton only on a cold empty load, a refresh keeps the existing list on
    screen and **swallows** a refresh failure, an error surfaces only on a cold
    failure; re-entrancy-guarded against a duplicate in-flight load for the same id.
  - `StoryViewersSheet` (`ModalBottomSheet`) — accent-coherent title/count,
    avatar rows (`MeeshyAvatar` + `DynamicColorGenerator.colorForName`), distinct
    loading / empty / error states. Reachable via an **author-only** "Views"
    button added to `StoryViewerScreen`'s top bar (gated on `isOwnStory &&
    currentStoryId != null`); the auto-advance timer pauses while the sheet is open.
  - `StoryViewerUiState` gains `isOwnStory` + `currentStoryId`, derived in `emit()`
    from `playback.currentGroup?.userId == currentUserId` and the current slide id.
  - Strings (`stories_viewers_*`, `stories_viewer_open_viewers`) in en/fr/es/pt.
- **Tests (+22):**
  - `StoryViewerMappingTest` +6 (display-name present / null-fallback / blank-fallback;
    blank avatar+reaction → null; all-present passthrough; blank viewedAt → null).
  - `StoryRepositoryTest` (new) +3 (wire→domain mapping incl. displayName default;
    empty payload → empty list; network error → Failure).
  - `StoryViewersPresentationTest` +6 (recent-first sort; nulls last; null-tie input
    order preserved; dedup keeps most-recent; empty; single unchanged).
  - `StoryViewersViewModelTest` +7 (ordered success; empty → isEmpty no error; cold
    failure → error; cold exception → message; refresh failure keeps list no error;
    cold skeleton→list; re-entrancy guard = 1 repo call).
  - `StoryViewerViewModelTest` +2 (`currentStoryId` tracks the visible slide;
    `isOwnStory` true only on the current user's own group).
- **Edge cases covered:** empty/single/duplicate viewer lists; null & blank wire
  fields; null timestamps; cold vs warm (refresh) load; cold failure vs refresh
  failure (keep stale); exception (non-cancellation) path; re-entrant load; own
  vs foreign group authorship; absent current story id.
- **Verify:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full
  `assembleDebug` + all module JVM unit tests). Targeted: `:core:model`,
  `:sdk-core`, `:feature:stories` testDebugUnitTest all green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no
  tautologies; SDK purity (wire model + mapper + repository method = building
  blocks in `core/model`/`sdk-core`; the "order most-recent-first / when to show
  skeleton vs keep stale / author-only affordance" product rules live in
  `:feature:stories`); single source of truth (avatar colour via
  `DynamicColorGenerator`, accent via `accentHex`); Instant-App (cold-only
  skeleton, stale-kept refresh); UDF + immutable `UiState`; no dead end (button →
  sheet → dismiss returns to a coherent viewer).

### 2026-06-23 — slice `story-reaction-socket-delta` ✅
- **Branch:** `claude/apps/android/story-reaction-socket-delta`
- **What:** wired the realtime `story:reacted` / `story:unreacted` Socket.IO events
  into the open story viewer so other users' reactions move the live count. The
  pure `StoryReactionState.applyDelta` reducer (shipped earlier) already encoded
  the reconciliation; this slice connects the socket → reducer → UI loop.
- **Added (production):**
  - `SocketStoryReactedData` / `SocketStoryUnreactedData` (`core:model`,
    `{storyId, userId, emoji}` — parity with `packages/shared/types/post.ts`
    `StoryReactedEventData`/`StoryUnreactedEventData` and iOS `SocketStoryReactedData`).
  - `SocialSocketManager` — `storyReacted` / `storyUnreacted` `SharedFlow`s +
    `listen("story:reacted"/"story:unreacted")` in `attach()`, mirroring the
    existing `storyCreated`/`storyViewed` wiring.
  - `StoryViewerViewModel` — injects `SocialSocketManager`, collects both flows in
    `init`, and folds each into `reactionStates` via `onReactionDelta(storyId,
    emoji, delta, actorId)`: `+1`/`-1`, `isOwn = actorId == currentUserId`,
    seeding a non-current slide's base count from `playback.groups`, **ignoring**
    unknown story ids and re-emitting only on an actual change. The user's own
    socket echo of an emoji already counted optimistically is a no-op (reducer
    returns `this`), so the optimistic bump from `react()` is never double-counted.
  - `StoryViewerScreen.ReactionStrip` — live total-count badge (renders
    `state.reactionCount` when `>0`) so a *foreign* reaction (count-only change)
    is visible, closing the loop (no dead end).
- **Tests:**
  - `StoryViewerViewModelTest` +5: foreign reacted bumps live; foreign unreacted
    decrements; own echo doesn't double-count after optimistic `react`; a
    non-current slide's delta is stored and shown after navigating to it; unknown
    story id ignored. (Existing 15 stories VM tests still green.)
  - `SocialSocketManagerTest` (new, Robolectric for real `org.json`) +3: reacted
    decode+emit, unreacted decode+emit, malformed payload ignored (no emit).
- **Edge cases covered:** non-current slide, unknown story id (inert), own-echo
  de-dup vs optimistic, decrement path, malformed payload (decode failure → no
  emit), no redundant emit when state unchanged.
- **Verify:** `:feature:stories:testDebugUnitTest` + `:sdk-core:testDebugUnitTest`
  green; full `./apps/android/meeshy.sh check` (assembleDebug + all module unit
  tests) → BUILD SUCCESSFUL.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no
  tautologies; SDK purity (the "when to fold a delta / which slide" product rule
  lives in `:feature:stories`; the manager only decodes+forwards); single source
  of truth for the payload shape (mirrors shared TS + iOS); UDF + immutable
  `UiState`, pure reducer; accent-coherent strip; no dead end (count badge surfaces
  foreign deltas).

### 2026-06-22 — slice `story-viewer-swipe-gestures` ✅
- **Branch:** `claude/apps/android/story-viewer-swipe-gestures`
- **What:** wired horizontal/vertical swipe navigation into the story viewer.
  A pure resolver maps an accumulated drag to a navigation intent on the
  **dominant axis**; the ViewModel dispatches it into the existing pure
  `StoryPlayback` engine. Parity with iOS `StoryViewerView` swipes (swipe left =
  next author, right = previous author, down = close).
- **Added (production):**
  - `StorySwipeResolver.kt` — pure `resolve(dragX, dragY, hThreshold, vThreshold)
    → StorySwipeAction{NextGroup,PreviousGroup,Dismiss,None}`. Dominant axis wins
    (`|x|>|y|`), only a downward drag dismisses, sub-threshold travel is `None`
    (a small drift during a tap can't hijack navigation). Thresholds are params
    (Composable supplies them from density) so the decision stays fully testable.
  - `StoryPlayback.dismissed()` — pure transition that closes the viewer,
    preserving position; idempotent once dismissed.
  - `StoryViewerViewModel.onSwipe(action)` — dispatches `NextGroup`/`PreviousGroup`
    → `jumpToNext/PreviousGroup`, `Dismiss` → `dismissed()`, `None` → inert.
  - `StoryViewerScreen` — second `pointerInput` running `detectDragGestures`,
    accumulating drag and calling `onSwipe(StorySwipeResolver.resolve(...))` on end
    (thresholds 64.dp horizontal / 120.dp vertical). Tap gesture untouched.
- **Tests:** +12 `StorySwipeResolverTest` (left/right/down/up, both sub-threshold
  axes, no-movement, horizontal- & vertical-dominant diagonals, inclusive
  boundaries on each axis, horizontal-dominant-but-sub-threshold) ; +2
  `StoryPlaybackTest` (`dismissed` marks live + idempotent) ; +4
  `StoryViewerViewModelTest` (onSwipe NextGroup / PreviousGroup / Dismiss / None).
  Stories test files now: resolver 12, playback 21, viewer-VM 15 — all green.
- **Edge cases covered:** zero drag, sub-threshold on each axis, upward never
  dismisses, diagonal axis arbitration both ways, inclusive thresholds, None is
  inert (state untouched), dismiss preserves slide position, already-dismissed
  idempotent.
- **Verify:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full
  `assembleDebug` + all JVM unit tests across modules).
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no
  tautologies; SDK purity (the "when a drag becomes a swipe" UX rule lives in
  `:feature:stories`, not the SDK); pure resolver + pure engine transition keep
  all branch logic JVM-testable; UDF + immutable `UiState`; accent-coherent
  viewer, natural gestures, no dead end (dismiss → `onClose`).

### 2026-06-22 — slice `story-viewer-reactions` ✅
- **Branch:** `claude/apps/android/story-viewer-reactions`
- **What:** quick-reaction strip on the story viewer with an **optimistic** count
  and rollback-on-failure (iOS `sendReaction` is fire-and-forget; Android does
  better). Parity with iOS quick emojis + `currentUserReactions`.
- **Added (production):**
  - `StoryReactionState.kt` — pure reducer: `reactedLocally(emoji)` (additive,
    idempotent per emoji), `applyDelta(emoji, delta, isOwn)` (realtime
    `story:reacted`/`unreacted` reconciliation; own-add idempotent vs the
    optimistic count; count clamped ≥0; `mine` set tracks the user's emojis).
  - `StoryViewerViewModel.react(emoji)` — snapshot → optimistic apply → emit →
    `storyRepository.react` → rollback on `Failure`/exception; per-slide state
    map; idempotent repeat taps skip the network. `StoryViewerUiState` gains
    `reactionCount`/`myReactions`/`quickReactions`; `StorySlideView` gains
    `reactionCount` (seeded from `reactionSummary` via `toStoryGroups`).
  - `StoryViewerScreen` `ReactionStrip` — accent-coherent emoji row over the nav
    bar (`EmojiCatalog.defaultQuickReactions`), selected-emoji highlight, taps
    consumed so they never leak to the advance/back gesture behind it.
- **Tests:** +11 `StoryReactionStateTest` (every reducer branch: local add /
  idempotent / distinct emoji / others' add / own-add idempotent / own-add
  un-optimistic / removal own & others / clamp-at-0 / zero-delta inert / empty)
  and +5 `StoryViewerViewModelTest` (optimistic bump+mine+calls repo / failure
  rollback / idempotent twice = 1 network call / per-slide isolation / strip
  exposed). 22 stories tests in the two files green.
- **Edge cases covered:** empty/zero base, idempotent repeat, switch emoji,
  own vs others' deltas, count never negative, zero-delta inert, network failure
  → graceful rollback (`CancellationException` rethrown), per-slide state reset.
- **Verify:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL in 5m44s
  (full `assembleDebug` + all JVM unit tests across modules);
  `StoryReactionStateTest` 11/0/0, `StoryViewerViewModelTest` 11/0/0.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no
  tautologies; SDK purity (the "when/how to count optimistically" rule lives in
  `:feature:stories`, not the SDK); UDF + immutable `UiState`; single source of
  truth for emojis (`EmojiCatalog`) and accent visuals; no dead ends.

### 2026-06-22 — slice `story-viewer-playback` ✅ merged-pending
- **Branch:** `claude/apps/android/story-viewer-playback`
- **What:** pure cross-group story-viewer navigation engine + ViewModel/Screen
  rewire so tap-advance rolls between authors and dismisses past the last slide
  (parity with iOS `StoryViewerView`).
- **Added (production):** `StoryPlayback.kt` (`StoryPlayback` + `StoryGroupSlides`,
  pure transitions `advance/back/jumpToNextGroup/jumpToPreviousGroup` +
  `startingAt`). Rewired `StoryViewerViewModel` to load **all** groups and derive
  `UiState` from the engine (added `groupIndex`, `isDismissed`). Rewired
  `StoryViewerScreen` auto-advance/tap to the engine + `isDismissed` → `onClose`.
- **Tests:** +13 (`StoryPlaybackTest`, 22 cases over startingAt/advance/back/
  jumps/derived accessors — every `when` arm incl. inert/boundary) and
  +6 (`StoryViewerViewModelTest`: load-positions, advance roll-over, dismiss-at-end,
  back roll-back, markViewed, failed-load graceful). 35 stories tests green.
- **Edge cases covered:** unknown start user → group 0; empty-slide groups dropped;
  dismiss is inert; back at very first slice is a no-op; oldest-first slide order;
  network failure → `isLoading=false`, not dismissed.
- **Verify:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full assemble +
  all JVM unit tests across modules).
- **Reviewer:** PASS — scope is `apps/android` only; behavioural tests, no
  tautologies; SDK purity kept (engine in `:feature:stories`, not SDK, since it
  composes app-side `StorySlideView`); UDF + accent-coherent viewer, no dead end.
- **Also (bootstrap):** created `apps/android/tasks/android-routine/{ROUTINE,
  PROGRESS,REVIEWER,TDD-COVERAGE,NOTES}.md`.

## Blocked / risks
- No Android CI workflow → CI green is the JS/Python monorepo suite; local
  `meeshy.sh check` is the real Android gate. (Follow-up: add Android CI.)
- No Kover/Jacoco gate wired → coverage is a discipline (see `TDD-COVERAGE.md`).
