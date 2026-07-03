# Notes — lessons & memory

Append-only log of gotchas and decisions that save time next run.

## PR / CI
- ⚠ **The monorepo CI (`ci.yml`) is the only gate on an `apps/android` PR, and it stays green
  by construction** — the diff touches none of the JS/TS/Python stack it exercises. `mergeable_state:
  unstable` right after opening just means checks are still running; poll the CI run to completion
  before squash-merging. Webhooks deliver CI *failures* but NOT success, and `send_later` is not
  available in this env — poll `pull_request_read get_status` (or `actions_list list_workflow_runs
  ci.yml`) yourself; a short background timer to re-check is fine.

## Environment
- ⚠ **Always rebase the slice onto `origin/main`, never local `main`.** Fresh containers ship a
  stale local `main`, and `git pull origin main` can hard-fail with `Need to specify how to
  reconcile divergent branches` (no merge/rebase strategy configured) — which silently leaves you on
  the stale tree. A branch cut from it **loses the previous merged slice** (e.g. `story-canvas-snap-guides`
  was first cut without PR #1045's `scale`/`rotation` fields). Recipe: `git fetch origin main && git
  checkout -B claude/apps/android/<slice> origin/main`. Verify a known recent symbol is present before coding.
- ⚠ **Gradle wrapper distribution 403s through the egress proxy.** `./gradlew` downloads the pinned
  `gradle-8.11.1-bin.zip` from `services.gradle.org`, which **302-redirects to a `github.com` release
  asset** the org egress policy blocks (`403`). The wrapper then dies with
  `Server returned HTTP response code: 403`. Fix: a full Gradle is preinstalled at **`/opt/gradle`**
  (8.14.3) — run the build with `/opt/gradle/bin/gradle <tasks> --no-daemon` (the daemon had a startup
  hiccup once; `--no-daemon` is reliable). 8.14.3 builds this AGP project fine. **Do NOT edit the
  committed `gradle-wrapper.properties`** to work around this — that's a repo change unrelated to the
  slice; keep the wrapper pinned and use the system gradle locally.
  - **Run ONLINE, not `--offline`** (2026-07-03): AGP 8.7.3 + its transitive deps are **not** in the
    local Gradle cache on a fresh container, so `gradle … --offline` fails with `Plugin [id:
    'com.android.application'] … was not found`. Let it fetch through the agent proxy (Google Maven +
    Maven Central are allowed). The partially-downloaded wrapper leaves a **0-byte
    `~/.gradle/wrapper/dists/gradle-8.11.1-bin/*/*.part`** — harmless, ignore it. The daemon worked fine
    this run (plain `gradle <tasks>`); `--no-daemon` remains the fallback if it hiccups.
- Fresh container has **no Android SDK**. Install per `ROUTINE.md` recipe (~2 min).
- JDK 21 preinstalled; modules target JVM 17 — fine.
- First Gradle run downloads the whole toolchain (slow); run it in the
  background and poll the output file.
- `./apps/android/meeshy.sh check` = `assembleDebug` + `testDebugUnitTest`.
  Full clean check ≈ 2.5 min once dependencies are cached.
- ⚠ **Robolectric artifact-fetch SSL flake.** The first Robolectric run in a fresh container downloads
  the `android-all-instrumented` jar from Maven through the agent proxy; that download can fail with
  `SSLHandshakeException` inside `MavenArtifactFetcher` (surfaces as ONE test in a class "failing" with an
  `AssertionError`/`EOFException` cause — not a real assertion failure). It is a network flake: simply
  **re-run the same test task** and it passes once the jar is cached. Don't chase it as a code bug.
  Seen in `call-history-repository` on `:core:database`'s first run.
- The `:app` module now has a **JVM test source set** (`app/src/test/kotlin`, first added in
  `call-nav-conversation-thread`). Test deps (junit/robolectric/truth/turbine/mockk) were already declared
  in `app/build.gradle.kts`. Navigation-decision logic belongs in a pure helper under
  `me.meeshy.app.navigation` (e.g. `CallRoute`) so it is unit-testable while the `NavHost` glue stays
  exempt. `android.net.Uri` needs `@RunWith(RobolectricTestRunner::class)`.
- **Pattern for platform-glue slices (FCM/Service/BroadcastReceiver): a pure router + a synchronized
  live-state holder.** `fcm-call-push-route` kept `MeeshyFcmService` (untestable `FirebaseMessagingService`)
  a 3-line delegation: (1) a pure `IncomingCallPushRouter.route(data, ctx) → sealed Route` in `:core:model`
  folds all the decisions and *returns* the advanced state (never mutates), (2) a plain `@Singleton`
  holder (`IncomingCallRingStore`, `@Inject constructor()`, no Android deps → JVM-testable without Hilt)
  owns the live state and persists it only on the outcome that should advance it, (3) the Service just
  pattern-matches the Route. 19 tests hit the real behaviour; zero test touches the Service. A store test
  needs **no** `Dispatchers.setMain` — it's synchronous, so instantiate it real (`IncomingCallRingStore()`).
- **`| tee file | tail -N` hides progress from a backgrounded Bash task.** `tail -N` only emits at pipe
  close, so the task's own output file stays empty until the build ends — poll the **`tee` target**
  (`appcheck.log`) for live `> Task :…` lines, or grep it for `BUILD SUCCESSFUL|BUILD FAILED` in a
  `run_in_background` `until` loop to get one clean completion ping. First full `:app` `check` in a fresh
  container ≈ 5 min (assembleDebug compiles the whole feature graph); `:core:model` alone ≈ 3.5 min cold.

## CI / GitHub gotchas
- ⚠ **Never poll GitHub via raw `curl` to `api.github.com`.** Even with `$GITHUB_TOKEN` set, the direct
  API returns `{"message":"GitHub access is not enabled for this session..."}` — the token is not scoped
  for it. All GitHub reads/writes must go through the **`mcp__github__*` tools** (they use the proxied auth
  path). A `curl` poll loop will spin forever on a `None` status. Use `mcp__github__actions_list`
  (`method:list_workflow_jobs`, `resource_id:<run_id>`, `filter:latest`) for a compact per-job
  status/conclusion view — much smaller than `list_workflow_runs`, which overflows the token limit.
- ⚠ **`pull_request_read get_status` shows `total_count:0` for an `apps/android`-only PR** — that's the
  *legacy commit-status* API, which GitHub **Actions** check-runs do not populate. It does NOT mean CI
  didn't run or failed. Confirm the real state via the workflow **jobs** endpoint above.
- The monorepo `ci.yml` runs on **every** PR to `main` (no path filter), so an `apps/android`-only PR does
  trigger the full JS/TS/Python suite (~10 min) — but it stays green because it touches none of that code.
  Merge only once every job's `conclusion` is `success` (a `skipped` benchmark job is fine).

## Serialization gotchas
- ⚠ **Never put a `private companion object` on a `@Serializable` class.** The plugin generates the
  public `serializer()` *onto the class's companion*; if you declare your own `private companion object`
  (e.g. to hold `const`/helper functions), the generated `serializer()` inherits that `private`
  visibility and `MyType.serializer()` becomes inaccessible from other files (compile error:
  "Cannot access 'companion object Companion': it is private"). Fix: keep helpers/constants as
  **file-private top-level** declarations (no companion), or make the companion non-private. Hit on
  `call-history-model` (`CallRecord`).

## Socket-emit patterns (established in repo)
- **Keep the conditional payload shape as a pure `Map<String, Any>` in `:core:model`, not inline in the
  emit.** `call-webrtc-plumbing-emits` put the `call:quality-report` `stats` decision (which optional
  fields are present) in `CallQualityReport.statsFields()` — a pure map, JVM-tested for every branch with
  no `org.json` dependency — and the `:sdk-core` emit just does `JSONObject(report.statsFields())`.
  `org.json.JSONObject(Map)` works under Robolectric, so the manager test asserts the nested `stats` keys
  directly. This mirrors the `CallInitiateAckParser` grain: transport in the manager, decision in the model.
- **Prefer `Long` over `Int` for cumulative WebRTC byte counters.** iOS uses a 64-bit Swift `Int`; Kotlin
  `Int` is 32-bit and a long video call's totals exceed ~2.1 GB → silent overflow. Modelling them as `Long`
  is a correctness win over a literal iOS port (assert with a `> Int.MAX_VALUE` test case).

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
- **Non-deterministic id minting in a VM, tested without injection:** when a VM mints ids
  inline (`UUID.randomUUID()` like `StoryCommentsViewModel`), don't fight Hilt to inject a
  `() -> String` (a function type has no Hilt binding). Instead assert **structure** and read
  ids back off the state (`vm.state.value.deck.slides[i].id`) to drive the next op — fully
  behavioural, no exact-id tautology. Used for `story-composer-slide-deck` slide intents.
- **Editor-buffer ↔ selected-item mirror:** the composer keeps `draft.text == deck.selectedSlide.text`
  as a one-writer invariant (a single private `applyDeck{}` re-syncs the buffer on every structural
  op). This is an accepted "active editor buffer" pattern, not a SoT violation — the deck is the SoT,
  the draft is the live editing view of its selected slide.
- **MockK capture-all into a `mutableListOf`:** `coEvery { repo.enqueuePublish(capture(reqs), capture(deps)) }`
  collects **every** call's arg in order — perfect for asserting a publish loop (one row per slide).
- **Flipping a behavioural test is not weakening it** when the slice *intentionally* changes
  the behaviour: `story-composer-multi-pending` flipped "second offline pick is rejected" →
  "second offline pick is appended". Keep the assertion strong (assert the new outcome
  precisely), record the flip + rationale in the run log, and the reviewer gate passes.
- **A "duplicate-free across categories" invariant pays for itself as a RED test.** `story-sticker-picker-search`'s
  `all is … duplicate-free` test caught `⭐` accidentally placed in both OBJECTS and SYMBOLS on the first run
  — exactly the kind of hand-curated-data slip that silently breaks `distinct`/counts. Assert structural
  invariants (`containsNoDuplicates`, `hasSize(sum of parts)`, `isInOrder`) over curated catalogues, not just
  spot-checks of individual entries.
- **Encode "search ignores the active tab" as a pure reducer, not Compose state.** The product rule (a
  non-blank query searches across all categories) lives in `StickerPickerState.visibleEmojis`, so it is
  unit-tested with a one-liner (`state.withQuery("heart").visibleEmojis contains ❤️` while the tab is ANIMALS)
  and the dialog never has to branch. Same grain as `ComposerBandState` — push the decision out of the Composable.
- **One text field, two roles (caption vs on-canvas element):** rather than add a second editor,
  `story-text-elements` routes the existing field by a derived `editorText`/`isEditingTextElement`
  (selected element's text or the slide caption). `onTextChange` branches on
  `_state.value.selectedTextElement?.id`. Keeps the canvas a single coherent surface and the SoT in
  the deck. A dangling element selection (after a slide switch/remove) is dropped centrally in
  `mirrorDraftToSelection` — an element id only lives on one slide, so "not on the selected slide ⇒
  not editing". Don't clear in `applyDeck` per-op (it also runs on every pan gesture).
- **Editor models can land before/after-but-separate from wire serialization** — but prefer wiring
  it when the model already exists: `story-canvas-transform` shipped the per-slide transform without
  publishing it; `story-text-elements` *did* serialize into the existing `StoryEffects.textObjects`,
  so the slice is a complete vertical (no dead-end). Check `core/model` for an existing wire type
  before deciding the publish path is out of scope.
- **Private VM companion constants aren't visible to tests** — assert `errorMessage != null` (the
  existing pattern for `MEDIA_LIMIT` etc.), don't reference `StoryComposerViewModel.X` from a test.
- **Pure gesture resolvers (drag/swipe) — keep thresholds/slot widths as params** so the
  decision is fully unit-tested off the Composable (`StorySwipeResolver`, `SlideReorderResolver`).
  The Composable measures (`onSizeChanged`, `LocalDensity`), accumulates (`detectHorizontalDragGestures`
  with a local `totalDrag`), and on drag end calls the pure resolver → an existing tested intent.
- **Float interpolation drifts at the endpoints — short-circuit them.** `a + (b - a) * 1f` is
  **not** bit-equal to `b` for many floats (1-ULP error), so a lerp tested with `isEqualTo(b)` at
  `t = 1` (and `isEqualTo(a)` at `t = 0`) fails. Don't switch the test to a tolerance and lose
  exactness — make `blend` return `this`/`other` directly when `k ≤ 0` / `k ≥ 1`. It's also the
  correct design: "full-strength filter == base matrix" should be exact. Hit on `story-photo-filters`
  (3 reds: `blend at one`, `non-finite → full`, VM `selecting a filter`).
- **Model a small fixed-size numeric vector as `List<Float>`, not `FloatArray`, when you want value
  equality in tests.** `FloatArray` uses reference equality (a `data class` over it won't compare by
  content), breaking `assertThat(matrix).isEqualTo(other)`. `StoryColorMatrix` wraps a 20-element
  `List<Float>` (value equality, JVM-testable) and the Composable only does `values.toFloatArray()`
  at the glue boundary to feed Compose `ColorMatrix`.
- **`Float.roundToInt()` rounds half **up** toward +∞** (`2.5 → 3`, but `-0.5 → 0`). When a
  reorder/threshold test sits exactly on `.5` the expectation is ambiguous — pick a value clearly
  above/below half (e.g. `2.3` not `2.5`) so the assertion is unambiguous, not flaky. Hit while
  writing `SlideReorderResolverTest`.
- **Moving a field "up" a level cheaply: keep a *mirror*, not a second source of truth.** Moving story
  media from whole-draft to per-slide (`story-slide-media`) looked like it would flip ~20 mature media
  tests. Instead the deck became the single owner and `draft` was made a *mirror of the selected slide*
  for media — exactly as it already was for text (`mirrorDraftToSelection`). On the single-slide path
  `draft.mediaIds == selectedSlide.mediaIds`, so nearly every existing test passed unchanged and only
  the genuinely new per-slide behaviour needed new tests. The reviewer "single source of truth" box
  still holds because the mirror has **one writer** and the deck is authoritative; `draft.*` media
  helpers (`remainingMediaSlots`/`isMediaFull`/`hasMedia`) then automatically read per-*selected*-slide
  for free. Prefer this over a wholesale rename when the existing facade is already a projection.

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

## 2026-06-28 — multi-slide composer foundation (`story-slide-deck`)
- **Open a big feature with its pure structural model, not its UI.** The multi-slide composer
  (feature-parity §E line 433) is large; the first slice is `StorySlideDeck` — an immutable
  reducer owning the slide CRUD rules — with **no wiring yet** (same "primitive first, UX next
  slice" pattern as `outbox-multi-dependency` / `media-blob-store`). Keeps the diff tiny and the
  rules 100% JVM-tested before any Compose canvas glue exists to obscure a bug.
- **Two invariants, enforced in `init`:** a deck always holds **≥1 slide** and **≤`MAX_SLIDES`=10**
  (iOS `maxSlides`). `init { require(slides.isNotEmpty()); require(slides.any{it.id==selectedId}) }`
  — construction-time guards mean every op can assume a valid deck (no defensive nulls downstream).
  `selectedIndex`/`selectedSlide` are total because the selected id is invariant-present.
- **Total functions over throwing.** Every op returns `this` (same instance) when inapplicable —
  cap reached (`addSlide`/`duplicate`), last slide or unknown id (`removeSlide`), unknown id / no-op
  (`move`/`select`). Tests assert `isSameInstanceAs(deck)` for the inert arms — a strong, cheap
  behavioural check that the reducer didn't allocate a spurious new state. Mirrors the iOS
  composer's silent-guard CRUD without porting its mutable `@MainActor` state (the deprecated
  `StorySlideManager` was an explicit SSoT violation — Android uses one pure model from the start).
- **Caller-supplied ids keep the reducer pure.** `addSlide(newId)`/`duplicate(sourceId, newId)`
  take the new id as a param rather than minting a UUID inside — no `Math.random`/clock, so the
  reducer is deterministic and the ViewModel (next slice) owns id minting. `removeSlide` reselects
  the slide that **takes the removed one's place** (`next[index.coerceAtMost(lastIndex)]`), i.e. the
  former neighbour, and the new-last when the selected last is removed — the natural carousel UX.
- **Placement = `:feature:stories` (product), not `:sdk-core`.** The deck encodes composer UX rules
  ("when can I add", "always keep one", "what gets selected after a remove") → product orchestration,
  same module as `StoryComposerDraft`. An SDK atom would be agnostic to those policies. Grain test
  from `packages/MeeshySDK/CLAUDE.md` applied.

## `story-canvas-transform` — pure 2D pan/zoom that *persists* per slide (2026-06-29)
- **Persisted, not ephemeral.** The fullscreen image viewer's `ImageViewerTransform` (in `:sdk-ui`)
  is throwaway per-session viewer state. The story canvas transform is **part of the slide's
  identity** — it survives slide switches, is carried by `duplicate`, and rides into publish. So it
  lives on `StorySlide.transform` in `:feature:stories` (product state), NOT as an SDK atom and NOT
  in transient Compose `remember`. Same shape of clamp math, opposite lifecycle — don't conflate them.
- **Clamp the offset to the *new* scale inside `apply`.** Order matters: compute `nextScale` first,
  then clamp the translated offset to `maxOffset(size, nextScale)`. This makes a pinch-out tighten the
  pan range *and* snap a now-out-of-range offset back toward centre in the same gesture. Clamping to
  the old scale would let the content drift off-edge for one frame.
- **`maxOffset = (size·scale − size)/2`** — the symmetric half-overflow of the scaled content. No
  division anywhere, so a not-yet-measured 0px canvas just yields `0` (no div-by-zero guard needed);
  a unit test pins this (`apply(.., canvasWidth=0f, canvasHeight=0f)` → offset 0).
- **Composable stays glue.** All math is in the pure object; `StoryCanvasSurface` only measures the
  canvas (`onSizeChanged`), forwards each `detectTransformGestures` callback verbatim to
  `onCanvasTransform`, and applies the result via `graphicsLayer`. Zero testable decisions in Compose
  → nothing lost to the JVM coverage gate. `isIdentity` lets it skip the layer at rest.
- **Default field keeps existing tests byte-identical.** Adding `transform = IDENTITY` to `StorySlide`
  with a default means every prior `StorySlide(id=..)` / deck test still constructs the same value —
  only genuinely new per-slide-transform behaviour needed new tests.

## `story-text-element-transform` — per-element pinch/rotate (2026-06-29)
- **Extend `normalised()`, don't bolt clamps onto every mutator.** Adding `scale`/`rotationDeg` to
  `StoryTextElement`, I made `normalised()` re-pull *all* continuous fields (x/y/scale/rotation) into
  range. Because the deck's `updateTextElement` already calls `.normalised()` after every transform,
  every reducer (move/style/transform) re-clamps for free — one place, no per-mutator clamp drift.
  `transformed()` still clamps directly too (mirrors `nudged`), so the value is sane even if called
  raw; `normalised()` is then idempotent.
- **Non-finite is a real gesture input.** A `detectTransformGestures` zoom can be `0`/`NaN` on a
  degenerate pinch. `clampScale` guards `isFinite()` → `DEFAULT_SCALE` (coerceIn would pass `NaN`
  straight through — `NaN.coerceIn` returns `NaN` because every comparison is false). `normaliseRotation`
  guards the same. Both have a unit test pinning the non-finite arm.
- **Rotation wrap = `(-180, 180]`.** `% 360` then `+360` if `<= -180`, `-360` if `> 180`. `-180` maps
  to `180` so `±180` are one canonical value; `360`→`0`, `540`→`180`, `270`→`-90`. Tested each arm.
- **One gesture, three effects.** Switching the per-element `detectDragGestures` → `detectTransformGestures`
  lets a single two-finger gesture pan (→ `onTextElementMoved`) *and* pinch-scale + rotate (→
  `onTextElementTransform`). Single-finger drag still pans. More natural than separate handle chips
  (CLAUDE.md UX rule). The Composable forwards `zoom`/`rotation` verbatim — zero testable decision lost
  to the JVM gate; `graphicsLayer { scaleX/scaleY/rotationZ }` renders around the layer centre while the
  `offset` keeps using the *unscaled* measured size, so centring stays correct under scale.
- **Wire fields already existed.** `StoryTextObject.scale`/`rotation` were on the `:core:model` port
  from day one but always left at defaults; this slice is purely `:feature:stories` consuming them — no
  SDK/model change, keeps the diff `apps/android`-only.

## `story-canvas-snap-guides` — magnetic snap + safe-zone on drag (2026-06-30)
- **Snap the delta, reuse the reducer.** Rather than add an absolute `placeTextElement` reducer (which
  would orphan `moveTextElement`/`nudged`), the snap-aware `onTextElementMoved` computes the resolver's
  snapped centre, then moves by `snap.x - element.x` / `snap.y - element.y` through the **existing**
  `StorySlideDeck.moveTextElement` delta path. One reducer, no orphan, the canvas clamp still lives in
  `nudged`. The existing corner-clamp test (`drag 0.9,-0.9 → (1,0)`) stays green untouched because the
  far corner is beyond every guide's threshold (snapping is a no-op there) — proof a magnetic enhancement
  need not break the raw-move contract.
- **Per-axis independent snap.** `resolve` snaps x against vertical guides and y against horizontal guides
  separately, so an element can lock to the centre column while its row slides free — matches iOS. Guides
  are `[1/3, 0.5, 2/3]` on each axis (rule-of-thirds + centre). Min guide gap (0.167) ≫ threshold (0.025),
  so a centre is ever within threshold of at most one guide — `minByOrNull` then a single threshold check
  is enough; no tie-breaking needed.
- **`coerceIn` doesn't guard `NaN` (again).** Snap's `clampCoord` does `if (value.isFinite()) coerceIn(0,1)
  else CENTER`. A `NaN`/∞ drag candidate (degenerate gesture) collapses to the canvas centre instead of
  poisoning the position. Same lesson as `clampScale` — pin the non-finite arm with a test.
- **Transient feedback, cleared on lift.** Guide lines + the out-of-bounds verdict live in
  `StoryComposerUiState.snapFeedback: SnapFeedback?` — set during drag, cleared by `onTextElementDragEnd()`.
  It's *transient UI feedback*, never persisted on the element; the element only carries its snapped x/y.
- **Compose drag-end without reimplementing `detectTransformGestures`.** That detector never returns (its
  internal `awaitEachGesture` loops forever), so you can't append an `onEnd` after it, and a parallel
  detector on the **Main** pass would see consumed events and cancel early. Pattern that works: a second
  `pointerInput` running `awaitEachGesture { awaitFirstDown(false); do { awaitPointerEvent(Final) } while
  (changes.any { pressed }) ; onDragEnd() }`. The **`Final`** pass observes events *after* the transform
  detector consumed them and only watches `pressed`, so it fires exactly on lift without stealing the
  gesture. Pure glue (JVM-exempt); the testable decision (clear vs keep) is the VM's `onTextElementDragEnd`.

## `story-text-element-zorder` — z-order restack (2026-06-30)
- **The list order IS the z-order.** The canvas renders `slide.elements.forEach { TextElementLayer(...) }`,
  so later items paint on top → index 0 = back, `lastIndex` = front. Z-order needs **no new field on the
  element** — restacking is a pure list move within the holding slide. `TO_BACK`→0, `TO_FRONT`→lastIndex,
  `BACKWARD`→from-1, `FORWARD`→from+1, all `coerceIn(0, lastIndex)`; `target == from` ⇒ inert (same
  instance). This keeps the model minimal and the publish serialisation unchanged (order already rides).
- **Same-`when`, four arms, one `coerceIn` covers all boundaries.** Mapping each `StoryZOrder` to a target
  index then a single clamp + `target == from` guard collapses "already at front/back" and "single
  element" into one inert path — no per-op boundary branches to miss. Test sweep: 4 op-arms × (move +
  inert-at-extreme) + unknown-id + single-element + cross-slide isolation = full branch coverage in 13
  reducer tests.
- **VM must guard `copy` to keep the same-instance contract.** `_state.update { it.copy(deck = reducer(...)) }`
  always mints a NEW `UiState` even when the reducer returned the same deck — so `isSameInstanceAs(before)`
  would fail and an inert tap churns recomposition. Pattern: `val deck = state.deck.reorder(...); if (deck
  === state.deck) state else state.copy(deck = deck)`. Same shape as `onTextElementDragEnd`'s null-guard.
  Always pair a "returns same instance when inert" reducer with this guard at the VM edge.
- **Step-0 conflict recovery (PR #1048).** A prior slice's PR can still be **open with conflicts** when
  main advanced past its base. Recipe: `git fetch origin main <pr-branch>`; `git checkout -B <pr-branch>
  origin/<pr-branch>`; `git rebase origin/main`; resolve keeping **both** sides (additive state fields /
  imports / doc entries); `meeshy.sh check`; `git push --force-with-lease` (fall back to a plain `push -u`
  if the remote ref was deleted out from under you → "couldn't find remote ref"). Verify with the merge
  tool; the maintainer may merge it concurrently — re-`get` the PR to confirm `merged:true` before moving on.
- **Reuse canvas geometry across element types (`story-sticker-elements`).** A new on-canvas object
  (sticker) shares the *exact* clamp/wrap rules of `StoryTextElement` (coord `0..1`, scale `0.3..4`,
  rotation `(-180,180]`). Don't re-derive them — call `StoryTextElement.clampCoord`/`clampScale`/
  `normaliseRotation` from the new model so the geometry lives in **one** unit-tested place. Reads slightly
  oddly ("a sticker using a text-element companion") but it's pure canvas math and keeps single-source-of-
  truth. Mirror the deck reducer family verbatim (`add*ToSelected`/`remove*`/`update*`/`move*`/`transform*`)
  so most behaviour falls out of the established, tested pattern.
- **`when(tile)` exhaustiveness is your friend.** Adding `ComposerContentTile.STICKER` made the screen's
  `when (tile)` non-exhaustive → compiler error until the new branch was wired. Free guarantee that a new
  enum content-tile can't be silently unrendered (a dead-end tile). Same for any `when` over a sealed/enum.
- **Grid `items` vs list `items` import clash.** `StoryComposerScreen` already imports
  `androidx.compose.foundation.lazy.items` (LazyRow). For a `LazyVerticalGrid` use
  `import androidx.compose.foundation.lazy.grid.items as gridItems` to disambiguate — importing both
  un-aliased compiles but is fragile; the alias is explicit.
- **Mutually-exclusive canvas selection.** When two selectable object kinds share a canvas (text element vs
  sticker), each select/add intent must clear the *other*'s selection (`selectedTextElementId = null` when
  selecting a sticker and vice-versa), and `mirrorDraftToSelection` must drop *both* stale ids on a slide
  switch — otherwise a slide change can leave a phantom remove-handle on an object not on the visible slide.

## Decisions (cont.) — Calls area kickoff (2026-06-30)
- **Calls started with the pure FSM, not the WebRTC plumbing.** First Calls brick = a pure
  call-lifecycle reducer (`core:model` `me.meeshy.sdk.model.call`: `CallState`/`CallEndReason`/
  `CallEvent`/`CallStateMachine.reduce`). Faithful port of iOS `CallManager.CallState` +
  `WebRTCTypes.CallEndReason`. The transition table is THE thing to get right (iOS only validates it
  informally — a real FSM validator is a P1 todo in `tasks/calls-sota-plan-2026-06-05.md`), so it's the
  highest-leverage, most-testable first slice. WebRTC/Telecom/FCM plumbing is glue-heavy → comes after.
- **Why `core:model` and not a new `:feature:calls` module yet.** SDK-purity grain test: the FSM is a
  stateless, parameter-driven building block agnostic to product orchestration → it belongs with the
  codebase's other pure domain logic (`EmojiUsageRanker`, `ConversationFilter`, `LanguageResolver`),
  not behind new-module wiring. The `:feature:calls` VM + screen that *consume* it (giving it a real,
  non-orphan consumer) are the very next slice. A pure FSM in `core:model` is NOT a dead-end screen —
  the reviewer's "no dead-end screens" is about navigation/UX, and SDK-purity explicitly endorses
  stateless building blocks.
- **FSM shape that keeps branch coverage honest + safe:** model phase only (media-type/mute live
  alongside, never inside the state — matches iOS); make every inapplicable (state, event) pair
  **inert** (return the same state) so the machine is total and idempotent; let terminal `Ended` leave
  only via `Settle`→`Idle` so it always settles and never loops. A shared `terminal(event)` helper maps
  the from-any-active-phase enders (LocalHangUp/RemoteHangUp/ConnectionFailed) so each per-state `when`
  stays short. Reconnect budget (`attempt >= maxReconnectAttempts`, default 3 per iOS) → boundary tests
  at both default max=3 and max=1.
- **Merge-gate: unblock-then-merge a stale ⚠-blocked PR before the new slice.** PR #1135 had been
  blocked on a pre-existing red `main` (web a11y test). Step 0 each run: if the prior PR is blocked on
  `main`, re-check `main`'s latest CI — once green, rebase the blocked branch onto it
  (`git rebase origin/main`, force-with-lease push), re-run CI, and squash-merge once green. Never merge
  past red CI; the red must be gone (fixed on `main`), not bypassed.

## Realtime socket lifecycle (slice `realtime-session-coordinator`, 2026-07-02)
- ⚠ **The realtime layer was entirely dead until this slice.** `SocketManager.connect()` had **zero
  callers in production** and no socket manager's `attach()` (message/social/call) ran anywhere. Only
  `SocketManager.connectionState` was ever observed (for the connection banner). So no `call:*`,
  `message:*` or social frame could reach any ViewModel — the whole `attach()`/`events` machinery built
  over prior loops was orphaned. If you wire a new socket manager, remember it also needs its `attach()`
  called from `RealtimeSessionCoordinator.attachAll()`, or it stays dead.
- **Attach must follow every connect, and exactly once per socket.** `SocketManager.on(event, cb)`
  registers on the current `_socket` and **no-ops when `_socket` is null** — so `attach()` before
  `connect()` silently loses every listener. And `disconnect()` nulls `_socket`; a later `connect()`
  mints a **new** `Socket` (socket.io's internal auto-reconnect reuses the *same* instance and keeps its
  listeners, but a full disconnect→connect does not). Therefore the rule encoded in the pure
  `RealtimeLifecyclePlan`: sign-in emits `[Connect, Attach]` **in that order**, and `Attach` is paired
  with **every** `Connect` (a logout→login re-attaches on the new socket) — NOT an "attach once ever"
  flag, which would leave the second session's socket listener-less.
- **`SocketManager.reconnectWithToken()` (disconnect+connect on token refresh) still has no caller.**
  When a token-refresh path is wired, it must also re-attach (it mints a new socket) — either route it
  through the coordinator or call `attachAll()` after it. Tracked follow-up.
- **Driver placement.** The "when to connect" edge is product orchestration → driven from `AuthViewModel`
  (`:feature:auth`, the app-level auth holder created above the NavHost in `MeeshyApp`, so effectively
  process-lifetime for the session). The coordinator + pure plan are stateless-ish SDK building blocks in
  `:sdk-core`. The `@Singleton` coordinator dedups on the edge, so a VM recreation can't double-connect.

## Compose Navigation route shape for nullable values (slice `incoming-call-deeplink`, 2026-07-02)
- **A required path arg must be non-empty, or `navigate()` throws.** Compose Navigation compiles a path
  placeholder `{arg}` to the regex `[^/]+` (one-or-more non-slash). A route built with a blank value —
  e.g. `call/${Uri.encode("")}/…` → `call//…` — has an empty segment that the regex won't match, so
  `navController.navigate(route)` throws `IllegalArgumentException: destination … cannot be found`. And
  `Uri.getPathSegments()` **silently drops** empty segments, so a test parsing `path.split("/")`/
  `pathSegments` won't even see the collapse — it just shifts indices and passes for the wrong reason.
- **Fix: for any route field that can be blank/nullable, use an OPTIONAL QUERY ARG, not a path arg.** A
  static path + `?a={a}&b={b}…` with `navArgument { … ; defaultValue = … }` (and `nullable = true` for
  strings) matches with the arg present-blank OR absent, binding the default — never a crash. We migrated
  `CallRoute` from `call/{conversationId}/{peerName}/{video}` to a static `call?…` query route so an
  incoming call with no room (gateway may omit `conversationId`) still deep-links safely. Prefer this shape
  from the start for routes carrying free-text names or optional ids.
- **Test the route by decoding it back through the SSOT, not by string-splitting.** `Uri.parse(route)
  .getQueryParameter(ARG)` (auto-decoded) → `CallRoute.config(...)` → assert on the real `CallConfig`. That
  survives an encoding change (path→query) without rewriting the behavioural intent, and it asserts the
  actual value the screen drives rather than a positional segment literal.
- **`MainActivity` intent → NavHost deep-link.** Keep the decision pure: `MainActivity` reads the intent
  extras into a plain `LaunchExtras` (thin, untestable glue) and calls `LaunchRouter.route(...)`; hold the
  result in `mutableStateOf`, recompute in both `onCreate` and `onNewIntent` (a running Activity gets
  `onNewIntent`, not a fresh `onCreate`). `MeeshyApp` navigates from a `LaunchedEffect(route, isAuth)` — gate
  on `isAuthenticated` so a not-yet-logged-in cold launch defers the route across the login gate — then a
  `onLaunchRouteConsumed` callback nulls the state so a recomposition never re-navigates.
- **⚠ A self-rescheduling `while(true){ delay }` loop in `viewModelScope` HANGS `runTest`.**
  `call-duration-timer` first shipped the 1-Hz timer as `viewModelScope.launch { while (isActive) {
  delay(1000); elapsed++ } }`. Any existing test that merely *reached* the connected phase then spun a
  gradle worker at 100% CPU forever: `runTest`'s end-of-test `advanceUntilIdle()` chases the infinite
  chain of virtual-time-scheduled `delay` continuations and never idles (the ticker always has one more
  task queued). A `SharedFlow.collect` that just *suspends* (like `signalManager.events`) is fine — it
  schedules no timed task — which is why only the `delay`-loop version hung. **Fix / pattern:** inject the
  tick source as a `Flow<Unit>` seam (`CallSecondsTicker` interface + `@Binds RealCallSecondsTicker`, whose
  prod impl is the `flow { while(true){ delay(1000); emit(Unit) } }`), and collect it in the VM. Tests pass
  a fake backed by a `MutableSharedFlow<Unit>` and drive the clock with plain `emit(Unit)` calls — fully
  deterministic, no `advanceTimeBy`, no wall-clock, and impossible to hang because the fake schedules no
  timed work. Same grain as every other "push the decision out of the untestable primitive" lesson: the
  ticker is the primitive, the elapsed-count logic is what we test.

## 2026-07-03 — env: gradle wrapper dist download is 403-blocked; use `/opt/gradle`
- In a fresh web container the wrapper's `distributionUrl` (services.gradle.org →
  github releases) returns **403 through the agent proxy**, and the cached
  `~/.gradle/wrapper/dists/gradle-8.11.1-bin/` holds only a `.lck`/`.part` (incomplete).
  `./gradlew` / `meeshy.sh` therefore can't bootstrap.
- **Recipe:** a matching system gradle is preinstalled at `/opt/gradle/bin/gradle`
  (8.11.1 — same version the wrapper pins). Run tasks with it directly, e.g.
  `export ANDROID_HOME=$HOME/android-sdk ANDROID_SDK_ROOT=$HOME/android-sdk &&
  /opt/gradle/bin/gradle assembleDebug testDebugUnitTest --console=plain`. Maven
  dependency resolution goes through the proxy fine; only the wrapper's own dist zip is
  blocked. (Follow-up if it recurs: pre-seed the dist, or point `distributionUrl` at a
  reachable mirror — but that touches `apps/android/gradle/…`, a legit apps/android edit.)

## 2026-07-03 — pattern: parallel *identity* stream beside the identity-less FSM `events`
- The call socket layer republishes a decoded FSM `CallEvent` on `CallSignalManager.events`
  — deliberately **identity-less** (`ReceiveIncoming`/`RemoteHangUp`/`RingTimeout` carry no
  `callId`). When a feature needs the *identity* of a frame (which call?), do **not** widen
  `events` or the `map` contract (that breaks every existing mapper/manager test). Instead add
  a **parallel `SharedFlow`** fed by a separate pure decode: `incomingOffers` (call-waiting
  raise, from `call:initiated`) and now `endedCalls` (banner dismiss, from `call:ended`/
  `call:missed`) both follow this shape — pure `CallSignalMapper.{incomingOffer,endedCallId}`
  decode + `_flow.tryEmit` in `listen`, collected in the VM. Keeps `map`/`events` frozen, adds
  zero risk to the FSM path, and each stream is independently unit-testable.
- **Known limitation this exposes (next Calls slice):** because `events` is identity-less, a
  teardown for a *different* call (e.g. the waiting call's `call:ended`, which the gateway fans
  out to member USER rooms) is folded into the *active* call's FSM as `RemoteHangUp` and wrongly
  ends it. The `endedCalls` banner-dismiss is correct and self-contained, but the full fix is an
  **identity-aware active-call teardown**: gate the FSM teardown so only a teardown whose `callId`
  matches the active call reduces it. Deferred to keep this slice thin and non-test-breaking.
