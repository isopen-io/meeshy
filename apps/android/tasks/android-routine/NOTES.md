# Notes — lessons & memory

Append-only log of gotchas and decisions that save time next run.

## Environment
- Fresh container has **no Android SDK**. Install per `ROUTINE.md` recipe (~2 min).
- JDK 21 preinstalled; modules target JVM 17 — fine.
- First Gradle run downloads the whole toolchain (slow); run it in the
  background and poll the output file.
- `./apps/android/meeshy.sh check` = `assembleDebug` + `testDebugUnitTest`.
  Full clean check ≈ 2.5 min once dependencies are cached.

## Test patterns (established in repo)
- ViewModel tests: `UnconfinedTestDispatcher` + `Dispatchers.setMain/resetMain`
  in `@Before/@After`; Truth `assertThat`; MockK (`relaxed = true`); Turbine
  `state.test {}` for flow assertions.
- `MeeshyConfig` is a plain `data class` with defaults — instantiate it real,
  do not mock.
- `SessionRepository` is a concrete class — mock with `mockk(relaxed=true)` and
  stub `currentUser` (a `MutableStateFlow`) and `currentUserId` explicitly.
- `NetworkResult.Failure` wraps **`ApiError(message, code?, httpStatus?)`** — not
  a `NetworkError` type. Use `NetworkResult.Success(Unit)` for unit endpoints.

## Domain gotchas
- `List<ApiPost>.toStoryGroups()` orders each group's stories **oldest-first**
  (ascending `createdAt`); groups order = current-user → unviewed → latest desc.
  When building viewer fixtures, the *first* slide is the *oldest* story.
- Prisme rule 1: when no translation matches a preferred language, show the
  ORIGINAL (`isTranslated = false`) — never an arbitrary translation. Honoured by
  `StoryContentResolver` / `LanguageResolver.preferredTranslation`.

## Decisions
- **Routine docs live in `apps/android/tasks/android-routine/`** (not repo-root
  `tasks/`) so merged diffs stay inside `apps/android` per the hard merge gate.
- Cross-group story navigation is modelled as a **pure `StoryPlayback`** reducer
  in `:feature:stories`; the ViewModel holds an instance and re-derives
  `UiState` from it, the Composable only wires gestures + the auto-advance timer
  and observes `isDismissed` to pop. Keeps all branch logic JVM-testable.

## Decisions (cont.)
- **Optimistic story reactions > iOS fire-and-forget.** iOS `sendReaction` does
  not bump locally and waits for the socket echo (`applyStoryReactionDelta`) for
  its own +1. Android `StoryReactionState.reactedLocally` bumps instantly; to keep
  the eventual socket echo from double-counting, `applyDelta(emoji, delta, isOwn)`
  treats an own ADD of an emoji already in `mine` as a no-op. The VM rolls back to
  a snapshot on `NetworkResult.Failure`/exception. Reducer lives in
  `:feature:stories` (the "when to count" rule is product UX, not an SDK atom).
- Quick-strip source of truth = `EmojiCatalog.defaultQuickReactions` (sdk model),
  NOT a screen-local literal — keeps the strip consistent with the picker.

## Decisions (cont.)
- **Story viewer swipes = pure resolver + pure engine transition.** A drag is
  mapped to intent by `StorySwipeResolver.resolve(dragX, dragY, hThreshold,
  vThreshold)` on the **dominant axis** (`|x|>|y|`); only a *downward* drag
  dismisses; sub-threshold travel is `None` so finger drift during a tap can't
  hijack navigation. Thresholds are parameters (Composable feeds them from
  density) → the decision stays 100% JVM-testable. `StoryViewerViewModel.onSwipe`
  dispatches into `jumpToNext/PreviousGroup` + the new pure `StoryPlayback
  .dismissed()`. Composable only runs `detectDragGestures` (exempt glue).
- Compose gesture coexistence: keep `detectTapGestures` and `detectDragGestures`
  in **separate `pointerInput`** blocks on the same Box — Compose routes taps vs
  drags to the right detector; do not try to merge them.

## Decisions (cont.)
- **Realtime story-reaction deltas = SocialSocketManager flow → VM `applyDelta`.**
  `SocialSocketManager` only decodes `story:reacted`/`story:unreacted` (payload
  `{storyId,userId,emoji}`, identical across shared TS, iOS, Android) into
  `SharedFlow`s — pure transport. The product rule ("which slide, fold +1/-1,
  is-own, ignore unknown ids, don't double-count my optimistic bump") lives in
  `StoryViewerViewModel.onReactionDelta`, which seeds a non-current slide's base
  count from `playback.groups`, calls the pure `StoryReactionState.applyDelta`,
  and re-emits **only on an actual change** (`next == current` → skip). Own echo
  of an already-counted emoji is inert because `applyDelta` returns `this`.
- **Testing socket managers on the JVM needs Robolectric** — `org.json.JSONObject`
  is an android.jar stub that throws "not mocked" under plain unit tests. Mock
  `SocketManager`, capture the `on(event, cb)` handlers into a map, `attach()`,
  then invoke the captured handler with a real `JSONObject`; assert via Turbine
  `flow.test {}`. `@RunWith(RobolectricTestRunner::class)`.
- VM SharedFlow collectors started in `init` are live under
  `UnconfinedTestDispatcher`; emit on the test-owned `MutableSharedFlow`
  (extraBufferCapacity) and read `vm.state.value` synchronously — same pattern as
  the existing intent-driven tests.

## Decisions (cont.)
- **MockK `coAnswers` is a member infix, NOT a top-level import.** `import
  io.mockk.coAnswers` is unresolved in this mockk version — use `coEvery { … }
  coAnswers { … }` directly (it resolves as a member of `MockKStubScope`). To test
  a "cold skeleton then content" transition, gate the suspending stub on a
  `CompletableDeferred` and assert via Turbine `state.test {}` (initial idle →
  isLoading=true → completed).
- **Viewers sheet ≫ load-once.** iOS `StoryViewersSheet` loads once in raw gateway
  order. Android: pure `StoryViewersPresentation.order()` sorts most-recent-first
  (ISO `viewedAt` desc, nulls last via `compareByDescending { it.viewedAt != null }
  .thenByDescending { it.viewedAt.orEmpty() }`, stable → ties keep input order) +
  dedups by id; the VM applies Instant-App SWR (cold-only skeleton, refresh keeps
  the stale list and swallows refresh failures, error only on cold). The "order /
  when-skeleton / author-only affordance" rules are product UX → `:feature:stories`,
  while the wire model + `toStoryViewer()` mapper + `StoryRepository.viewers()` are
  building blocks → `core/model`/`sdk-core`.
- **`story:viewed` realtime can't append a viewer row yet.** Socket payload is
  `{storyId, viewerId, viewedAt}` — no display name/avatar, so a live append would
  render an empty row. Left as a one-shot load (iOS parity); realtime append needs
  a richer gateway event or a user lookup. Tracked follow-up.

## Decisions (cont.)
- **Tray cache-first = Room-backed SWR, not in-memory.** The Feed still uses an
  in-memory L1 cache (`PostRepository`, Room deferred to "Phase 3"); the stories
  tray instead got a real `StoryCacheSource` (port of `ConversationCacheSource`)
  so it survives process death and paints instantly on a cold launch — the
  Instant-App "no spinner when cache has data" rule. Reuse the existing
  `cacheFirstFlow`/`SwrCacheSource`/`CachePolicy`/`sync_meta` primitives; do NOT
  re-implement the SWR state machine (Feed did, inline — don't copy that).
- **Adding a Room entity bumps `MeeshyDatabase.version`.** `StoryEntity` took it
  4 → 5. `fallbackToDestructiveMigration()` is already set, so no migration test
  is needed yet (tracked: `exportSchema`/migration tests follow-up).
- **Story tray fixtures must be LIVE.** `StoryTrayBuilder.build` drops
  fully-expired groups against `System.currentTimeMillis()` (21h fallback TTL),
  and the VM calls it with the default wall-clock `nowMillis`. A fixed past
  `createdAt` makes the tray empty → VM tests fail. Use `Instant.now().toString()`
  for VM-level fixtures; pass an explicit `nowMillis` only to the pure builder/
  grouping tests.

## Decisions (cont.)
- **Adjacent-slide prefetch = pure planner + shared Coil loader.** The "which
  images to warm / how far ahead / skip text-only / stop at the end" decision is
  a pure `StoryPrefetchPlanner.plan(playback, lookahead)` in `:feature:stories`
  (product UX rule, not an SDK atom) returning distinct URLs in forward viewing
  order across group boundaries. The VM derives `prefetchUrls` in `emit()`; the
  Composable enqueues them through `context.imageLoader` — the SAME Coil
  singleton `AsyncImage` resolves against, so the warmed disk/memory entry is
  reused (do NOT build a second `ImageLoader`, that would defeat the cache).
  Coil 2.x prefetch = `loader.enqueue(ImageRequest.Builder(ctx).data(url).build())`
  with no target. Surpasses iOS (single-next) with a windowed cross-group warm.

## Open follow-ups (cross-slice)
- Wire **Kover** with a 90% per-module verification rule.
- Add a dedicated **Android CI workflow** (touches `.github/` → separate run).
- **`SocialSocketManager.attach()` has no caller yet** — none of its social flows
  (storyCreated/Viewed/Reacted/Unreacted, post*, comment*) actually receive events
  in-app until attach is wired to the socket lifecycle. Affects ALL social events,
  touches `:app` → its own slice.
- Story viewer richness: **swipe gestures done**, **reactions strip done**,
  **realtime reaction socket-delta done**, **viewers sheet done**, **tray SWR/Room
  backing done**, **comments overlay done** (optimistic post + `comment:added`
  delta — but realtime echo only flows once `SocialSocketManager.attach()` is
  wired, see above); remaining: media prefetch, cross-dissolve transitions,
  realtime `story:viewed` append (needs richer event payload).
- **Cross-module smart-cast.** A nullable `public` property declared in another
  Gradle module (e.g. `StoryComment.clientId` from `:core:model`) cannot be
  smart-cast after a `!= null` check inside `:feature:*` — Kotlin can't prove it
  is stable across the module boundary. Bind it to a local `val` first, then
  null-check the local. Bit us in `StoryCommentsSheet` (compile error).
- Reaction `mine` still seeded empty on load — needs server `currentUserReactions`
  exposed by the stories API to pre-fill the user's own emojis.
- **`data class` with a non-public primary constructor** triggers a Kotlin 2.1
  copy-visibility warning (the generated `copy()` will change visibility). When a
  value object is only meant to be built through a factory (e.g. `StoryCountDots`),
  prefer a plain `class` (no `copy()` needed) over `data class internal constructor`.
  `@Immutable` already gives Compose stability without value equality here.

## 2026-06-23 — step-0 open PR may be SUPERSEDED, not just mergeable
- An open Android PR (#877, conversation swipe pin/mute/archive) from a *parallel*
  session was far behind `main` (ancient merge-base → a raw merge conflicted in
  hundreds of unrelated translator/gateway/tasks files). Before forcing a merge,
  **check whether `main` already implements the feature** — `git grep` for the
  PR's key symbols on `origin/main`. Here `main` already had a *more complete*
  version (togglePin/Mute/Archive + outbox `UPDATE_CONVERSATION_PREFS` + swipe UI
  + mark-read + row badges), so the right move was to **close the PR as
  superseded**, not merge it. Cherry-picking the PR's single commit onto fresh
  `main` was the right probe — the `strings.xml` conflict (`conversations_action_*`
  already present on HEAD vs the PR's `swipe_*`) was the tell.
- Lesson: "merge the open iteration PR first" assumes the PR's work isn't already
  on `main`. Verify with a symbol grep on `origin/main` before resolving conflicts.

## 2026-06-23 — auto-advance media gate
- The story viewer's auto-advance is gated on media readiness via a pure
  `StoryAutoAdvanceGate`. Readiness is fed from `AsyncImage` `onSuccess`/`onError`
  (BOTH — a failed load must resolve too, else the viewer hangs forever on a dead
  URL). The VM's `onImageResolved` re-emits only when the resolved URL is the
  *current* slide's image, so off-screen prefetch resolutions don't churn state.
  `resolvedImageUrls` persists across slides so back-navigation never re-waits.
