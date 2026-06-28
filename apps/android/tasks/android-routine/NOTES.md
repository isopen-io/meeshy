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
- For distinct sequential stub returns, MockK `coEvery { … } returnsMany listOf("a","b")`;
  for "succeed once then fail", `… returns "a" andThenThrows Exception(…)`. Used to test
  multi-pending staging (each `enqueue` returns a distinct cmid) and mid-batch failures.
- **Flipping a behavioural test is not weakening it** when the slice *intentionally* changes
  the behaviour: `story-composer-multi-pending` flipped "second offline pick is rejected" →
  "second offline pick is appended". Keep the assertion strong (assert the new outcome
  precisely), record the flip + rationale in the run log, and the reviewer gate passes.

## Outbox / durable chain
- The durable upload→publish chain is two halves: (1) **gating** the dependent on
  its prerequisite (`outbox-dependency-gating` — drainer holds/cascade-exhausts via
  `OutboxDependencies.verdict`); (2) **produced-id write-back**
  (`outbox-produced-id-writeback` — a prerequisite's `SendResult.SuccessWithId(realId)`
  grafts the id into dependents' payloads via `OutboxRepository.rewriteDependents` +
  the pure `PublishMediaWriteBack.graft`). The **placeholder convention** is: a publish
  queued before its upload carries the **upload row's own `cmid`** as the placeholder
  media id; the drainer passes `placeholder = row.cmid` to the graft. Self-documenting,
  needs no extra column.
- Keep the outbox package **payload-agnostic**: `rewriteDependents` takes a generic
  `(payload) -> payload?` and the drainer takes an injected `graftProducedId` (no-op
  default). The story-specific `CreateStoryRequest` decode lives only in
  `PublishMediaWriteBack` (sdk-core `story` package); the worker injects it. Don't let
  `OutboxRepository`/`OutboxDrainer` import story types.
- `MeeshyApi.json` has `explicitNulls = false` + default `encodeDefaults = false`, so
  re-encoding a `CreateStoryRequest.copy(...)` round-trips cleanly (default/null fields
  are simply omitted). Safe to decode→edit→re-encode a queued payload.
- `rewriteDependents` only touches **PENDING** dependents — never rewrite a row that is
  INFLIGHT (mid-send) or EXHAUSTED. The gate keeps a dependent PENDING until its
  prerequisite succeeds, so the graft always lands before the dependent's gate opens.
- Producer gap (still open after `outbox-produced-id-writeback`): nothing emits
  `SuccessWithId` yet and the worker's lane list omits `MEDIA`. The write-back is a
  tested primitive awaiting its `UPLOAD_MEDIA` sender — same "ship the primitive before
  its producer" pattern as the gating slice. Drain `MEDIA` **before** `STORY` when it
  lands. Also: a `BLOCKED` dependency doesn't set `anyTransient`, so a held lane isn't
  auto-retried by WorkManager — fix with the producer.

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

## 2026-06-27 — optimistic tray derived from the durable outbox
- **Optimism = a projection of the durable queue, not a separate in-memory list.**
  The tray's optimistic self-ring is `StoryRepository.pendingPublishes()` — a `map`
  over `OutboxRepository.observeAll()` keeping `PUBLISH_STORY` rows in a **live**
  state (`PENDING`/`INFLIGHT`). This gives reconcile + rollback for free: a
  *delivered* publish deletes its row (vanishes), an *exhausted* one flips to
  `EXHAUSTED` (filtered out) — no bespoke state machine, and the optimism survives
  process death because the row does. Surpasses iOS's in-memory optimistic story.
- **Decode lives in `:sdk-core`, "render it" lives in `:feature`.** Decoding the
  outbox payload (`CreateStoryRequest`) into a `PendingStoryPublish` is queue
  semantics → a building block in `:sdk-core` (also keeps `:feature` off
  `:core:database`, which `:sdk-core` only exposes as `implementation`, NOT `api` —
  so `OutboxEntity` is invisible downstream). The "synthesize a self-authored
  `STORY` `ApiPost` and merge it into the tray" rule is product UX → pure
  `StoryOptimisticTray` in `:feature:stories`. Reuse the existing `toStoryGroups` →
  `StoryTrayBuilder` pipeline (one code path) instead of a second tray builder.
- **Delivery hand-off without an `outcomes` subscription:** diff consecutive
  `pendingPublishes` emissions in the VM — a tempId present last tick but gone now
  was delivered (success deletes the row; exhausted rows linger), so `refresh()`
  pulls the real story in. Avoids plumbing `OutboxOutcome` + cmid→kind tracking.
  Guard the first emission (empty→empty ⇒ no spurious refresh) and rely on the
  pending set staying stable afterwards so the refresh doesn't loop.
- **`combine` needs every source to emit once.** A `relaxed` mockk of a
  `Flow`-returning fun yields a flow that emits **nothing**, so `combine` stalls and
  the VM never updates state. Always stub `pendingPublishes()`/`storiesStream()`
  explicitly with `flowOf(...)` in `StoriesViewModel` tests, even the unrelated ones.

## 2026-06-27 — media upload foundation (`media-upload-api`)
- **`:core:network` exposes okhttp only as `implementation`, not `api`.** So a
  downstream module that builds `MultipartBody.Part` (here `:sdk-core`'s
  `MediaUpload`) does NOT see okhttp transitively — add an explicit
  `implementation(libs.okhttp)` to that module's `build.gradle.kts`. Symptom
  otherwise: `MultipartBody`/`RequestBody.toRequestBody` unresolved at compile.
- **okhttp multipart parts are JVM-testable without a server or Robolectric.**
  `MultipartBody.Part.createFormData(name, filename, body)` is pure JVM okhttp:
  assert the field name + filename via `part.headers?.get("Content-Disposition")`
  and the content type + length via `part.body.contentType()` / `contentLength()`.
  Keeps the "which field name / filename / mime" decision behavioural, not mocked.
- **Stories reference media by id, not URL.** iOS `AttachmentUploader` returns the
  uploaded URL and throws the attachment **id** away (messages embed by URL). But
  `CreateStoryRequest.mediaIds` is a list of **ids**, so the Android `UploadedMedia`
  carries `id` (= the gateway attachment id from `messageAttachmentSchema.id`) as the
  primary key, with `url` alongside for previews. Don't port iOS's URL-only response.
- **Repository drops unusable rows instead of failing the batch.** `MediaRepository
  .upload` maps the wire list through `toUploadedMedia()` with `mapNotNull` — a blank
  id or url removes that one attachment but keeps the good ones (one degenerate row
  never discards a multi-file upload). Empty input short-circuits to `Success(empty)`
  with **no** network call (assert with `coVerify(exactly = 0)`).
- **A `data class` holding a `ByteArray` is a footgun** (value equality over arrays).
  `MediaUploadItem` is a plain `class` — it's only ever constructed + read, never
  compared by value, so no `equals`/`hashCode` is needed.

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
- **Optimistic publish has no failed-state UI.** An `EXHAUSTED` publish silently
  drops from the optimistic tray (rollback). A "failed to post — tap to retry"
  affordance (read `EXHAUSTED` rows via `observeAll`/`outcomes`, call
  `outboxRepository.retry(cmid)`) would close the loop. Needs `:app`/`:feature`
  wiring → its own slice.
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

## 2026-06-26 — story composer / publish via outbox
- **Publish reuses the shared outbox, not a bespoke queue.** iOS has a dedicated
  `StoryPublishQueue` (its own retry schedule + media-ref persistence). Android's
  generic `outbox` already gives durable FIFO lanes, ×5 retry/exhaust, boot
  recovery and the WorkManager drain — so a story publish is just a new
  `OutboxKind.PUBLISH_STORY` on its own `OutboxLanes.STORY` lane. The sender lives
  inline in `OutboxFlushWorker.buildSenders()` (mirror the existing senders:
  `json.decodeFromString<CreateStoryRequest>` → `postApi.createStory`, map
  Success/Failure → SendResult). Add the lane to the drained-lanes list too, or it
  never flushes.
- **Don't coalesce publishes.** `OutboxCoalescer.decide` only special-cases the
  message/reaction/prefs kinds; everything else (incl. PUBLISH_STORY) falls to
  `Enqueue`. Give each publish a fresh `pending_<uuid>` targetId so two stories
  stay independent rows.
- **R import is the module Gradle namespace, NOT the package.** `feature:stories`
  Kotlin lives in `me.meeshy.app.stories` but the generated `R` is
  `me.meeshy.feature.stories.R` (the module `namespace`). Always
  `import me.meeshy.feature.stories.R` — copy it from a sibling screen.
- **`Modifier.weight` is a scope member, never import it.** Importing
  `androidx.compose.foundation.layout.weight` pulls the *internal* RowColumn
  extension and fails with "it is internal in file". Inside a `Column { }` /
  `Row { }` content lambda, `Modifier.weight(1f)` resolves on the scope receiver
  with no import.
- **Nav route collisions are silent.** `story_composer` (literal) must not be
  `story/compose` — that pattern-matches `story/{userId}` with userId="compose".
  Use a slash-free literal for a sibling of a parameterised route.
- **`WorkManager` is a per-feature dependency.** `feature:stories` needed
  `implementation(libs.work.runtime)` added before the VM could `workManager
  .enqueue(OutboxFlushWorker.buildRequest())` (chat already had it). `buildRequest()`
  builds a `OneTimeWorkRequest` fine in a plain JVM unit test (no Robolectric).

## Lessons — slice `story-publish-retry` (2026-06-27)
- **`combine` only emits once ALL source flows have emitted.** When the VM's
  combined repository flows changed, every test (and every hand-rolled mock) had to
  stub the new flow (here `publishQueue()`) — a relaxed mockk returns a Flow that
  never emits, so `combine` silently never collected and the VM state stayed at its
  default. Symptom: a previously-green assertion fails for no obvious reason. Always
  stub *every* combined flow (default `flowOf(...)`).
- **A "row vanished from the pending queue" is ambiguous.** Both a *delivered*
  publish (row deleted) and a *failed* one (row → `EXHAUSTED`, dropped from
  `pendingPublishes`) disappear from the live queue. The optimistic-tray
  reconciler originally treated any disappearance as delivery and fired a spurious
  `refresh()`. Disambiguate by also tracking the failed set: a temp id now failed
  exhausted (surface it), only a temp id in neither set delivered.
- **Don't disambiguate across two separately-subscribed flows — they race.**
  First cut combined `pendingPublishes()` + `failedPublishes()` as two `combine`
  args, but each independently re-subscribes `observeAll()`, so a `PENDING →
  EXHAUSTED` change fires both and `combine` emits an intermediate frame where the
  row is in *neither* set → the exact spurious `refresh()` we were fixing,
  reintroduced by timing. Fix: a **single** `publishQueue(): Flow<{pending, failed}>`
  mapping one `observeAll()` emission into both lists, so the transition is atomic
  to the consumer; `pendingPublishes`/`failedPublishes` became thin `.map`
  projections. Rule: when two derived views must stay mutually consistent, derive
  them from **one** source emission, never two subscriptions.
- **`OutboxRepository.retry(cmid)` already existed** (revive EXHAUSTED → PENDING,
  fresh budget) but had no caller — wiring it through `StoryRepository.retryPublish`
  + a VM intent that kicks `OutboxFlushWorker` is all the recovery loop needed.
  Added a sibling `discard(cmid)` (plain `deleteAll`, emits no outcome — a user
  removal is not a delivery outcome) so a permanently-failing publish isn't a dead end.
- **A public `UiState` can't hold an `internal` nested type.** `StoriesUiState`
  (public, read by the screen + exposed via the public VM `StateFlow`) carries
  `List<StoryPublishFailures.Item>`, so `StoryPublishFailures` had to be public
  (matches `StoryCountDots`). "Function 'public' exposes its 'internal' parameter
  type" is the compiler telling you a public surface leaks an internal type.

## Decisions (cont.)
- **A module pins `build-tools;34.0.0`.** The env recipe installs `35.0.0` only;
  the first `:feature:stories:testDebugUnitTest` failed with "Failed to install
  build-tools;34.0.0" (Gradle's auto-install can't reach the SDK repo through the
  proxy). Fix once per fresh container: `sdkmanager "build-tools;34.0.0"`. Tracked:
  align the pinned build-tools across modules (or add 34.0.0 to the ROUTINE recipe).
- **Photo/video picker = `ActivityResultContracts.PickVisualMedia`, not legacy
  `GET_CONTENT`.** Needs `implementation(libs.androidx.activity.compose)` on the
  feature module for `rememberLauncherForActivityResult`. Keep the VM testable by
  passing it a clean `MediaUploadItem` (bytes already read) — the `ContentResolver`
  read (bytes/MIME/`OpenableColumns.DISPLAY_NAME`) stays in the Composable on
  `Dispatchers.IO`; filename/MIME defaulting lives downstream in `MediaUpload`, so
  the reader is a thin, exempt glue function with no branch logic worth a JVM test.
- **Story media product rule lives in the VM, not the SDK.** `onMediaPicked`
  encodes "when to upload / append vs replace / gate publish while uploading / how
  to surface each failure" → `:feature:stories`. `MediaRepository.upload` +
  `MediaUpload` part-builder + wire→domain mapper stay opaque building blocks in
  `:sdk-core`/`:core:*`. Draft `canPublish` admits **text OR media** so a caption-
  less image story is valid (iOS-surpassing — iOS has no story media composer).
- **Media cap belongs in the pure draft, enforced at the VM upload-gate.** `MAX_MEDIA`
  + `remainingMediaSlots` (clamped ≥0) live on `StoryComposerDraft`; the cap also
  gates `canPublish` so an over-cap draft can never publish. `onMediaPicked` reads the
  free slots and `items.take(remaining)` BEFORE the upload — truncating the pick, not
  the result, so we never spend an upload on media that won't fit, and the cap holds
  even if a future multi-pick hands in more than `remaining`. Surface a warning + skip
  the network entirely when already full (`remaining <= 0`).
- **#979 was held on a pre-existing `main` red, not its own.** When the ONLY red CI job
  is failing on `origin/main` itself (verify: `git show origin/main:<test-file>` shows
  the same breakage) AND the PR diff touches zero files in that job's scope, merging an
  `apps/android`-only PR cannot regress `main`. The "never merge past red CI" rule
  guards against *introducing* a regression; a pre-existing, out-of-scope red that the
  run directive tells you to merge through is the documented exception. Always re-confirm
  the red is pre-existing + out-of-diff before merging, and record the proof in the log.

- **`dependsOn` was persisted but never honoured (fixed in `outbox-dependency-gating`).**
  `OutboxEntity.dependsOn` + `OutboxMutation.dependsOn` shipped with the outbox runtime
  but `OutboxDrainer.drainLane` ignored it — a chain was a no-op. The gate is now a pure
  `OutboxDependencies.verdict(prerequisiteState)`: **gone (null) = SATISFIED** (a chain is
  enqueued prerequisite-first, so an absent row has already succeeded), `PENDING`/`INFLIGHT`
  = BLOCKED (hold the lane, dependent stays PENDING for the next pass), `EXHAUSTED` = FAILED
  (cascade-exhaust the dependent — it can never run). The prerequisite can live on **another
  lane** (`OutboxRepository.stateOf(cmid)` looks it up by cmid, lane-agnostic), which is the
  point: an upload on the `MEDIA` lane, a publish on `STORY` that `dependsOn` it. BLOCKED
  *stops the lane* (like a transient failure) rather than skipping — preserves the strict
  FIFO-per-lane invariant uniformly; message rows never carry `dependsOn` so this branch
  only ever affects the upload/publish lanes. Remaining gap for the real chain: the upload's
  returned real `mediaId` must be written into the dependent publish's payload before the
  gate opens (next slice) — gating alone holds the order but doesn't yet rewrite the id.

- **Durable bytes need their own table — the outbox payload is a `String`
  (`media-blob-store`).** An `UPLOAD_MEDIA` row can't carry raw file bytes in the
  outbox; persist them in a dedicated `MediaBlobEntity`/`MediaBlobDao` keyed by the
  upload row's `cmid` and read them back in the `MEDIA`-lane sender. The
  `MediaBlobStore` wrapper deliberately reuses `MediaUploadItem` (single bytes shape —
  the store persists exactly what `MediaRepository.upload` consumes, no second type).
  Two Room footguns confirmed: (1) a `ByteArray` field makes a `data class` equals/
  hashCode reference-compare the array — use a **plain `class`** (same call already
  made on `MediaUploadItem`); (2) adding an entity bumps `@Database(version=…)` (5→6
  here) — safe with the existing `fallbackToDestructiveMigration()` since an in-flight
  blob is transient (it re-queues), no bespoke migration needed. Assert bytes with
  `assertThat(actual.bytes).isEqualTo(expected)` (Truth does an array content compare),
  not entity equality.

- **Worker senders stay thin; the *decision* moves to a pure object
  (`media-upload-sender`).** `OutboxFlushWorker`'s sender lambdas aren't unit-tested
  (they're WorkManager glue). For a sender with real branching (blob gone / offline /
  empty result / real id), extract a pure `MediaUploadSender.send(item, upload)` that
  returns a `SendResult` and unit-test all four arms with a fake `upload` lambda; the
  worker lambda is then just "look the blob up → `send` → `remove` on any non-transient
  outcome". The producer-half enqueue (`MediaUploadQueue.enqueue`) writes the blob
  **before** the outbox row so a queued upload never lacks its bytes, and shares **one
  `cmid`** across blob + row + (future) dependent publish placeholder. Blob cleanup is
  symmetric: drop it on `SuccessWithId`/`PermanentFailure` in the sender glue **and** in
  `onExhausted` (repeated transient → exhausted keeps the bytes until the give-up), or it
  leaks. Gotchas: `UploadedMedia` lives in `me.meeshy.sdk.model` (not `.media`); and
  `:sdk-core`'s `media` package does **not** use `explicitApi`-style `public` modifiers
  (bare `class`/`object`) while the `outbox` package does — match the *package-local*
  convention, don't blindly add `public`.

- **Offline-media composer fallback (`story-composer-offline-media`).** The "when to
  fall back to the durable chain" decision is a **product policy → app-side**: a pure
  `MediaUploadRetryPolicy.isQueueable(ApiError)` in `:feature:stories` (null status /
  429 / 5xx → queueable; other 4xx → dead end), NOT in the SDK. Adding an optional param
  to an SDK function consumed via mockk (`enqueuePublish(req, dependsOn = null)`) **breaks
  existing mockk stubs** silently: `coEvery { f(capture(s)) }` no longer matches the now
  2-arg call, the relaxed mock returns the default, and the slot never captures →
  "slot not captured". Fix = extend every stub/verify to the new arity
  (`f(capture(s), any())`), which is *adapting* not weakening. **`io.mockk.captureNullable`
  is not in this mockk version** — to capture a nullable param whose actual value is
  non-null, use a plain `slot<String>()` + `capture(slot)` (non-null actual ⇒ matches).
  Keep the offline path **single-pending**: the outbox `dependsOn` is one cmid, so one
  pending upload per publish stays provably correct; reject a 2nd pick + multi-item batches
  rather than ship a broken multi-`dependsOn` chain. Centralise the combined wire ids in
  **one** derivation (`UiState.draftMediaIds = attachments.ids + pending?.cmid`) and feed
  `withMediaIds(next.draftMediaIds)` from every mutator (applyUploaded/queueDurably/remove)
  — else a later success silently drops the pending placeholder. The pending preview tile
  renders the held `ByteArray` straight through Coil (`AsyncImage(model = bytes)`); make it
  removable so it's never a dead end.

- **Multi-dependency outbox gate (`outbox-multi-dependency`).** The single-pending constraint
  above was a deliberate *temporary* guard until the gate could express **several** prerequisites.
  It now can: `OutboxMutation.dependsOn` is a `Set<String>` encoded into the **one** `dependsOn`
  TEXT column by `OutboxDependencyKey` — wrapped-delimited (`{a,b}`→`"|a|b|"`, `'|'` reserved/absent
  from a `cmid`), so a *membership* test is a substring `LIKE`. Two gotchas that shaped the design:
  (1) a `cmid` is `cmid_<uuid>` and contains `_`, a `LIKE` wildcard — `likePattern` **escapes** it
  and the DAO query must use `ESCAPE '\'` (Kotlin string: `"… ESCAPE '\\'"`), else `cmid_a` spuriously
  matches `cmidXa`; a regression test (`up` must NOT match member `upload`) guards it. (2) `decode`
  must tolerate a **bare** value with no delimiter → singleton, so existing single-dep rows/tests keep
  resolving — that let every prior drainer test keep its behaviour while only the *storage format*
  changed (no schema/migration: same column). Gate priority: in `verdictAll`, **`FAILED` dominates
  `BLOCKED`** — one exhausted prerequisite means the dependent can never run, so cascade-exhaust now
  rather than wait on the others. Keep the key/gate **pure in `:sdk-core`** (no product policy); the
  composer's "when to queue / how many pending" rule stays app-side. Changing `enqueuePublish`'s param
  `String? → List<String>` again rippled into mockk stubs — `slot<String>()` → `slot<List<String>>()`
  and `isEqualTo("x")` → `containsExactly("x")` (same adapting-not-weakening pattern as the offline
  slice). The composer **UX** relaxation (`pendingUploads: List`, drop the single-pending guard) is a
  separate slice — splitting the SDK primitive from the UI kept this diff thin and every prior test green.
