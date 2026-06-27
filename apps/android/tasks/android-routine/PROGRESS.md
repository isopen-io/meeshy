# Progress — state & what to do next

## Current build-order position

`Auth ✅ → Conversations ✅ → Chat ✅ → Feed ✅ → **Stories (in progress)** → Calls → rest`

Stories so far: tray (ring carousel) + cross-group viewer playback engine +
quick-reaction strip + swipe gestures + realtime reaction socket deltas +
who-viewed sheet + Room-backed tray SWR + comments overlay + segmented
count-dots + adjacent-slide media prefetch + auto-advance media-load gate +
text composer + durable-outbox publish shipped earlier loops; this loop makes
the **tray optimistic** — a just-queued story shows instantly as a `pending_*`
self-ring derived from the live durable outbox (`StoryRepository.pendingPublishes`
building block + pure `StoryOptimisticTray` product rule), so it survives process
death, **rolls back** automatically if the publish exhausts, and hands off to the
real story on delivery (the VM refreshes when a publish vanishes from the queue).
Surpasses iOS's in-memory optimism (which evaporates on a kill). Latest loop
(`story-publish-retry`) closes the failure gap: an **exhausted** publish now
surfaces a "Couldn't post your story" **Retry/Discard strip** above the tray
(`StoryRepository.failedPublishes` + pure `StoryPublishFailures`) instead of
vanishing silently, and the reconciler tells a *failed* publish apart from a
*delivered* one (no spurious refresh).

## Next slice (pick one for the next run)

Ordered by value within the Stories area:
1. `story-composer-media` — now that the **upload foundation exists**
   (`media-upload-api` ✅ — `MediaApi` + `MediaRepository.upload()` → `UploadedMedia`),
   wire a **system photo/video picker** (Compose `PickVisualMedia` glue) into the
   composer: pick → `MediaRepository.upload()` → carry the returned ids into
   `StoryComposerDraft.toCreateStoryRequest(mediaIds = …)` so a single image/video
   slide publishes through the existing durable-outbox flow. Keep the upload off
   the publish enqueue path is acceptable for v1 (upload synchronously in the VM,
   then enqueue the publish with the resulting ids); a **TUS-style upload-then-
   publish outbox chain** (upload as its own durable lane the publish `dependsOn`)
   is the SOTA follow-up. Pure/testable parts: the VM's pick→upload→publish state
   machine (loading/error/ids), and the `mediaIds` plumbing into the draft mapping.
2. Then multi-slide composer + on-canvas media (much larger; see `feature-parity.md`
   §"Stories composer").

After Stories composer-media, advance to the **Calls** area (`feature-parity.md` §"Calls").

(`story-publish-retry` ✅ shipped 2026-06-27 — see run log; closed the
"failed publish disappears silently" follow-up.)
(`story-composer-optimistic-tray` ✅ shipped 2026-06-27 — see run log.)
(`story-composer` ✅ shipped 2026-06-26 — see run log.)
(`story-autoadvance-media-gate` ✅ shipped 2026-06-23 — see run log.)
(`story-media-prefetch` ✅ shipped 2026-06-23 — see run log.)
(`story-tray-count-dots` ✅ shipped 2026-06-23 — see run log.)

Note: server-side `currentUserReactions` seeding of `mine` on load, the
app-wide `SocialSocketManager.attach()` lifecycle wiring (no caller yet — affects
ALL social events, touches `:app`), and realtime `story:viewed` append to the
viewers list (socket payload lacks the viewer's name/avatar to render a row —
needs a richer gateway event or a user lookup) all remain tracked follow-ups.

After Stories richness is sufficient, advance to the **Calls** area
(`feature-parity.md` §"Calls").

## Run log

### 2026-06-27 — slice `media-upload-api` ✅
- **Branch:** `claude/apps/android/media-upload-api`
- **Housekeeping:** no open Android PR to land first (`search_pull_requests` for open
  `apps/android` heads = 0). Branched off latest `origin/main` (carries #968). SDK
  bootstrapped per the env recipe.
- **What:** the **media-upload foundation** the story composer's media slice needs.
  iOS uploads a single compressed JPEG avatar via `POST /attachments/upload`
  (`AttachmentUploader`) and discards the returned id; Meeshy stories reference media
  **by id** (`CreateStoryRequest.mediaIds`), so Android generalises the upload to any
  file/MIME and **carries the attachment id**. Pure, fully-testable: no Compose glue —
  this is the request/repository/mapper layer only (the picker + publish wiring is the
  next slice).
- **Added (production):**
  - `core:model` — `UploadedMedia` domain (id = `mediaId`, url, mimeType, fileSize,
    width?/height?/durationMs?/thumbnailUrl?) + `MediaUploadResponse`/`MediaAttachmentWire`
    wire (subset of `messageAttachmentSchema`, every field defaulted/nullable) + pure
    `MediaAttachmentWire.toUploadedMedia()` mapper returning `null` for unusable rows
    (blank id → no `mediaId`; blank/absent `fileUrl` → nothing to show), defaulting a
    blank mime to `DEFAULT_MEDIA_MIME_TYPE`, clamping a negative size to 0 and collapsing
    zero/negative dims+duration and blank thumbnail to `null`.
  - `core:network` — `MediaApi` (`@Multipart @POST("attachments/upload")` taking
    `List<MultipartBody.Part>`), registered in `MeeshyApi` + a Hilt `providesMediaApi`.
  - `sdk-core` — pure `MediaUpload` part-builder (field name `files`, default filename
    `upload`, octet-stream default content type; `formPart` builds the
    `MultipartBody.Part`) + `MediaRepository.upload(items)` → `NetworkResult<List<UploadedMedia>>`
    (empty list short-circuits with **no** API call; folds via `apiCall`, maps the wire
    list through the mapper, `mapNotNull` drops unusable rows). Added `implementation(libs.okhttp)`
    to `sdk-core` (it only had okhttp transitively as `implementation` of `:core:network`).
- **Tests (+28):**
  - `MediaMappingTest` (core:model, pure) +11 — full payload maps every field; blank/
    whitespace id → null; absent url → null; blank url → null; blank mime → octet-stream;
    absent size → 0; negative size → 0; zero/negative dims → null; zero/negative duration
    → null; blank thumbnail → null; audio-style (no dims, has duration) keeps positives.
  - `MediaUploadTest` (sdk-core, pure) +9 — filename passthrough / blank→default; mime
    passthrough / blank→octet-stream; `formPart` uses the `files` field name + filename;
    blank filename → default in disposition; resolved content type set on body; blank mime
    → octet-stream content type; body carries the exact byte count.
  - `MediaRepositoryTest` (sdk-core, fake `MediaApi`) +8 — empty items → Success(empty)
    with **no** API call (`coVerify exactly = 0`); single attachment maps wire→domain;
    multiple preserve order; unusable rows dropped, valid kept; **one part per item under
    the `files` field** (slot-captured); failure response → Failure; `IOException` →
    Failure; success with no attachments → empty list.
- **Edge cases covered:** empty collection (short-circuit, no network); single vs multiple;
  blank/absent identifiers (id, url) → row dropped, never crashes the batch; boundary
  numeric values (negative size, zero/negative dims+duration); default-substitution
  branches (filename, mime); failure-response vs transport-exception paths.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m04s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:core:model` (MediaMappingTest 11/11) + `:sdk-core` (MediaUploadTest 9/9,
  MediaRepositoryTest 8/8) green.
- **Reviewer:** PASS — scope `apps/android` only (3 edits in `:core:network`/`:sdk-core`
  build + 5 new files; no web/ios/gateway/shared); behavioural tests through the public
  API (pure mapper, pure builder via okhttp's observable headers/body, repo `NetworkResult`),
  no tautologies; SDK purity (the upload endpoint + repository + part-builder + wire mapper
  are stateless **building blocks** in `:core:network`/`:core:model`/`:sdk-core` — no "when
  to upload" product rule here, that's the composer's next slice); single source of truth
  (reuses `apiCall`/`NetworkResult`/`ApiResponse`, the `messageAttachmentSchema` wire shape,
  one `MediaApi`); Instant-App N/A (no UI); Kotlin style (immutable data, early returns in
  the mapper, plain class for the `ByteArray`-holding `MediaUploadItem` to dodge the array-
  equality footgun). Surpasses iOS (id-carrying, any-MIME, multi-file vs single-JPEG-avatar).

### 2026-06-27 — slice `story-publish-retry` ✅
- **Branch:** `claude/apps/android/story-publish-retry`
- **Housekeeping:** no open Android PR to land first (`list_pull_requests` open
  set = 24, none on an `apps/android` branch). Branched off latest `origin/main`
  (carries #960, the optimistic tray). SDK bootstrapped per the env recipe.
- **What:** closes the tracked follow-up — a story publish that **exhausts** its
  durable-outbox retries no longer vanishes silently. It now surfaces as a
  "Couldn't post your story" **strip above the tray** with explicit **Retry** and
  **Discard**, derived from the durable outbox so it survives process death.
  Also **fixes a latent bug**: the optimistic-tray reconciler treated *any*
  vanished pending publish as "delivered" and fired a spurious `refresh()` — it
  now tells a *failed* publish (moved to `EXHAUSTED`, surfaced as a failure) apart
  from a *delivered* one (row deleted → real hand-off). Surpasses iOS, whose
  optimistic story evaporates on failure with no signal or recovery.
- **Added (production):**
  - `sdk-core` — `FailedStoryPublish` (pure domain: `cmid` + `tempId` + content/
    visibility/language + `createdAtMillis`/`failedAtMillis`); `StoryPublishQueue`
    (`{pending, failed}`) + `StoryRepository.publishQueue(): Flow<StoryPublishQueue>`
    — derives **both** lists from **one** `observeAll()` emission so a
    `PENDING → EXHAUSTED` transition is atomic to a consumer (the row leaves
    `pending` and enters `failed` in the same frame; never seen in neither set →
    no false "delivered" read). `pendingPublishes()`/`failedPublishes()` are now
    thin `.map` projections of it. `retryPublish(cmid)` → `OutboxRepository.retry`
    (revive → PENDING, fresh budget); `discardPublish(cmid)` → new
    `OutboxRepository.discard(cmid)` (delete row, no outcome signal — a deliberate
    user removal, not a delivery).
  - `feature:stories` — pure `StoryPublishFailures` (`from(failed)` → newest-failed-
    first items with a single-line, cap-80 ellipsised content preview);
    `StoriesViewModel` now `combine`s the single consistent `publishQueue()`
    snapshot (one source — the fix that makes the no-spurious-refresh guarantee
    race-free; two separately-subscribed flows could show a transient neither-set
    frame), exposes `failedPublishes: List<Item>` in `UiState`, and adds
    `retryPublish`/`discardPublish` intents (retry kicks `OutboxFlushWorker`);
    reconciler excludes failed temp ids from the delivered-detection.
  - `feature:stories` (Compose glue) — `StoryFailedStrip`/`StoryFailedRow` rendered
    above the carousel (shown even when the tray is otherwise empty), accent via the
    `MeeshyTheme.tokens.error` token, Retry `TextButton` + Discard `IconButton`.
  - Strings `stories_publish_{failed_title,retry,discard}` in en/fr/es/pt.
- **Tests (+24):**
  - `StoryPublishFailuresTest` (pure) +8 — empty→none; single item keyed by cmid;
    newest-failed-first ordering; same-timestamp ties keep input order; multi-line →
    single-line preview; surrounding whitespace trimmed; exactly-cap kept whole;
    over-cap truncated with ellipsis (len cap+1).
  - `StoryRepositoryTest` (sdk-core, Robolectric) +9 — `publishQueue` surfaces live +
    exhausted together in one snapshot / empty when nothing queued; `failedPublishes`
    surfaces an exhausted publish (cmid/tempId/content/visibility/lang/timestamps);
    excludes a still-pending one; ignores non-publish exhausted rows; skips
    blank/undecodable; `retryPublish` revives (failed→empty, pending→content) ;
    unknown cmid → false; `discardPublish` removes for good (failed & pending empty).
  - `OutboxRepositoryTest` (sdk-core) +2 — `discard` removes a row outright; unknown
    cmid → no-op.
  - `StoriesViewModelTest` +5 — exhausted publish surfaces as a failed item (one
    atomic `publishQueue` transition) with **no** spurious refresh; retry revives +
    kicks the worker; retry on a vanished row does **not** kick the worker; discard
    drops the row. (Existing tests migrated to the `publishQueue` stub + `workManager`
    ctor arg, all green.)
- **Edge cases covered:** empty/single collections; preview cap boundary (=80 whole /
  >80 ellipsised); multi-line + whitespace normalisation; unknown cmid on retry
  (false → no worker kick) and discard (no-op); failed-vs-delivered disambiguation
  (no spurious refresh); non-publish & blank/undecodable rows excluded; tie-stable order.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m32s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:sdk-core` + `:feature:stories` `testDebugUnitTest` green (23/23 stories VM+failures).
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the public
  API (repo `Flow`, VM `state`, pure object), no tautologies; SDK purity (the outbox-
  reading `failedPublishes`/`retry`/`discard` building blocks live in `:sdk-core`; the
  "render as a Retry/Discard strip, when to refresh" product rule lives in
  `:feature:stories`); single source of truth (reuses the durable outbox +
  `OutboxRepository.retry`, no second queue/cache); Instant-App (failed state derived
  from the durable outbox, survives process death, no spinner); UDF + immutable
  `UiState`, pure presentation; colour/UX coherence (error-token strip, explicit
  Retry/Discard = no dead end). Surpasses iOS (durable failure recovery vs silent
  evaporation).

### 2026-06-27 — slice `story-composer-optimistic-tray` ✅
- **Branch:** `claude/apps/android/story-composer-optimistic-tray`
- **Housekeeping:** no open Android PR to land first (`list_pull_requests` open set
  has none on an `apps/android` branch). Branched off latest `origin/main`.
- **What:** makes the story tray **optimistic** off the durable outbox. A publish
  queued by the composer now shows **instantly** as a `pending_*` self-ring,
  derived from the live outbox queue — so it survives process death (the row is
  durable), **rolls back** by itself when the publish exhausts (the row stops
  being surfaced), and **hands off** to the real server story on delivery. This
  surpasses iOS, whose optimistic story is in-memory and evaporates on a kill.
- **Added (production):**
  - `sdk-core` — `PendingStoryPublish` (pure domain: `tempId`, `content`,
    `visibility`, `originalLanguage`, `createdAtMillis`) +
    `StoryRepository.pendingPublishes(): Flow<List<PendingStoryPublish>>`: observes
    `OutboxRepository.observeAll()`, keeps only `PUBLISH_STORY` rows in a **live**
    state (`PENDING`/`INFLIGHT` — exhausted = rolled back, deleted = delivered),
    and decodes each `CreateStoryRequest` payload, skipping blank/undecodable rows.
    This is the queue-semantics **building block**.
  - `feature:stories` — pure `StoryOptimisticTray` (`pendingStories(publishes, self)`
    → synthetic self-authored `STORY` `ApiPost`s, `isViewedByMe=true`, enqueue-time
    `createdAt`; `merge(cached, pending)` appends pending after the cached feed,
    de-duping by id). This is the **product rule** ("render a queued publish as the
    signed-in user's newest story"). `StoriesViewModel` now `combine`s
    `storiesStream` with `pendingPublishes`, merges the synthetics before
    `toStoryGroups` → `StoryTrayBuilder` (one code path, self ring), and **refreshes**
    when a publish vanishes from the queue (delivered → pull the real story in so
    the optimistic ring hands off without waiting for the next background sync).
- **Tests (+20):**
  - `StoryOptimisticTrayTest` (pure) +11 — self-null → none; empty → none; publish
    → self-authored STORY post (id/type/content/visibility/lang/author); marked
    viewed-by-me; enqueue time → `createdAt`; multiple map in order; `merge` no-pending
    passthrough / append-after-cached / drop-id-already-cached / empty-cache.
  - `StoryRepositoryTest` (sdk-core, Robolectric) +6 — `pendingPublishes` decodes a
    queued publish; excludes an **exhausted** row (rollback); ignores non-publish
    rows; skips blank content; skips an undecodable payload without crashing;
    surfaces each independent publish.
  - `StoriesViewModelTest` +4 — a queued publish injects the self ring; merges with
    the user's server stories into one ring (count 2); a logged-out tray stays empty;
    a publish that **vanishes** refreshes once (hand-off); a still-pending publish
    does **not** refresh. (Existing 6 tests updated for the new `pendingPublishes`/
    `currentUser` stubs, all green.)
- **Edge cases covered:** empty/single collections; null self (logged out → nothing
  optimistic); exhausted publish (rollback, no ring); blank/undecodable payload
  (failure path, no crash); id-collision de-dup on merge; idempotent (still-pending
  → no spurious refresh); delivery hand-off (vanished → exactly one refresh);
  no refresh on first emission (empty → empty).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:sdk-core` + `:feature:stories` `testDebugUnitTest` green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API (VM `state`, repo `Flow`, pure object), no tautologies; SDK purity
  (the outbox-decoding `pendingPublishes` building block lives in `:sdk-core`; the
  "render as a self ring / when to refresh" product rule lives in
  `:feature:stories`); single source of truth (reuses the durable outbox,
  `toStoryGroups`, `StoryTrayBuilder`, `LanguageResolver` — no second queue/cache);
  Instant-App (optimistic ring with no spinner, durable across process death);
  UDF + immutable `UiState`, pure object; colour/UX coherence (the synthetic flows
  through the existing accent-coherent tray builder, lands in the self ring entry
  point, no dead end). Surpasses iOS (durable-outbox optimism vs in-memory).

### 2026-06-26 — slice `story-composer` ✅
- **Branch:** `claude/apps/android/story-composer`
- **Housekeeping:** no open Android PR to land first (checked `list_pull_requests`
  — 22 open PRs, none `apps/android`). Branched off latest `origin/main`.
- **What:** the **text story composer + publish flow**. A user taps the tray's
  add-story affordance, types a story, picks an audience, and shares; the publish
  is enqueued on the **shared durable outbox** and delivered in the background by
  `OutboxFlushWorker`. Optimistic: the composer dismisses the instant the row is
  queued. Surpasses iOS, which uses a bespoke `StoryPublishQueue` — Android reuses
  the proven outbox (FIFO lanes, coalescing skip for publishes, ×5 retry/exhaust,
  WorkManager drain on reconnect), so a publish survives process death / offline
  and never head-of-line-blocks message sends.
- **Added (production):**
  - `feature:stories` — pure `StoryComposerDraft` (`StoryVisibility{PUBLIC,FRIENDS,
    COMMUNITY,PRIVATE}` with `.wire`; `trimmedText`, `isWithinLimit`@`MAX_CHARS=5000`,
    `charactersRemaining`, `canPublish`, immutable `withText`/`withVisibility`,
    `toCreateStoryRequest(originalLanguage)` mapping); `StoryComposerViewModel`
    (immutable `StoryComposerUiState` + derived `canPublish`; `onTextChange`/
    `onVisibilityChange`; re-entrancy-guarded `publish()` → resolves the Prisme
    publish language from the session via `LanguageResolver`, `enqueuePublish`,
    kicks `OutboxFlushWorker`, clears the draft, emits a one-shot `published`
    signal; failure → error + draft preserved; `CancellationException` rethrown);
    `StoryComposerScreen` (Material3 Scaffold, char-counter `OutlinedTextField`,
    accent `FilterChip` visibility row, dismiss-on-`published`) — Composable glue.
  - `sdk-core` — `OutboxKind.PUBLISH_STORY` + `OutboxLanes.STORY`;
    `StoryRepository.enqueuePublish(CreateStoryRequest)` (serializes + enqueues on
    the `story` lane, fresh `pending_<uuid>` targetId per publish, no coalescing);
    `OutboxFlushWorker` injects `PostApi` + drains the `story` lane with a
    `PUBLISH_STORY` sender (`json → postApi.createStory`, transient/permanent map).
  - `:app` — route `story_composer` (collision-free vs `story/{userId}`) wired to
    the tray's `onAddStory`; `StoryComposerScreen` destination.
  - Strings `stories_composer_*` / `stories_visibility_*` in en/fr/es/pt.
- **Tests (+24):**
  - `StoryComposerDraftTest` (pure) +13 — empty/blank can't publish; non-blank can;
    whitespace trimmed; at-limit ok vs over-limit blocked; `charactersRemaining`
    counts down + goes negative; `withText`/`withVisibility` immutability; default
    visibility PUBLIC; `toCreateStoryRequest` mapping (trimmed content, STORY type,
    wire visibility, language, null media); every visibility's wire value.
  - `StoryComposerViewModelTest` +8 — text/visibility intents update state; blank
    can't publish; publish enqueues exactly one + kicks the worker + emits
    `published`; language resolved from session (`es`) and fallback `fr` when no
    user; draft cleared + flag down on success; blank publish is a no-op (0
    enqueue/worker); re-entrancy guard = 1 enqueue; queue-throws → error surfaced,
    flag down, draft preserved.
  - `StoryRepositoryTest` +3 — `enqueuePublish` persists one `PUBLISH_STORY` row on
    the `story` lane; payload round-trips the `CreateStoryRequest`; two publishes
    stay independent (no coalescing).
- **Edge cases covered:** empty/blank/whitespace draft; char-limit boundary
  (5000 ok / 5001 blocked) + negative remaining; absent session user → `fr`
  fallback; re-entrancy while in-flight; durable-queue failure → graceful error
  with draft kept for retry; independent publish rows; cancellation-safe scope.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m11s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:feature:stories` + `:sdk-core` `testDebugUnitTest` green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (the pure publish-gate + wire mapping
  live in `:feature:stories`; the durable `enqueuePublish` building block + worker
  sender live in `:sdk-core`; the "when to publish" rule is the ViewModel's);
  single source of truth (Prisme language via `LanguageResolver`, reuses the
  existing `CreateStoryRequest`/`PostApi.createStory` + the shared outbox, no
  second queue); Instant-App (optimistic dismiss on queue, no blocking spinner);
  UDF + immutable `UiState`, pure draft; colour/UX coherence (accent chips,
  natural tray entry point, dismiss returns to the list — no dead end). Surpasses
  iOS (shared durable outbox vs bespoke queue).

### 2026-06-23 — slice `story-autoadvance-media-gate` ✅
- **Branch:** `claude/apps/android/story-autoadvance-media-gate`
- **Housekeeping:** closed PR #877 (`claude/wonderful-goldberg-8xtr6s`,
  conversation swipe pin/mute/archive) as **superseded** — `main` already carries
  a more complete implementation (`togglePin/toggleMute/toggleArchive`,
  `set{Pinned,Muted,Archived}Optimistic` + `UPDATE_CONVERSATION_PREFS`,
  `SwipeToDismissBox` + long-press menu, plus mark-read and pinned/muted row
  badges the PR lacked). That branch was also far behind `main` (ancient
  merge-base); re-merging would regress unrelated areas. Nothing needed to land.
- **What:** gates the story viewer's 5s auto-advance countdown on actual
  media-load readiness — closing the loop the prefetch window opened. A slow
  image can no longer auto-advance before it has painted. Surpasses iOS, which
  starts its timer on slide appearance regardless of paint state.
- **Added (production):**
  - `feature:stories` — pure `StoryAutoAdvanceGate.shouldCountdown(slide,
    resolvedImageUrls)`: `null` slide → no countdown; text-only slide (no image)
    → count down at once; image slide → count down only once its URL is in the
    resolved set (a load **or** error resolves it, so the viewer never hangs).
  - `StoryViewerViewModel` — `resolvedImageUrls` set + `onImageResolved(url)`
    (re-emits only when the just-resolved URL is the current slide's image; off-
    screen prefetch resolutions are recorded silently); `StoryViewerUiState
    .canAutoAdvance` derived in `emit()` via the gate.
  - `StoryViewerScreen` (exempt Composable glue) — `AsyncImage`
    `onSuccess`/`onError` → `viewModel.onImageResolved(url)`; the countdown
    `LaunchedEffect` now keys on `state.canAutoAdvance` and holds progress at
    empty (`snapTo(0f)`, early return) until the gate opens.
- **Tests (+9):**
  - `StoryAutoAdvanceGateTest` (pure) +4 — null slide → false; text-only → true;
    image waits then opens on resolve; a different resolved URL doesn't unblock.
  - `StoryViewerViewModelTest` +5 — text-only slide can auto-advance immediately;
    image slide blocked until `onImageResolved`; off-screen resolution leaves the
    current gate closed; advancing to a new image slide re-closes the gate until
    resolved; revisiting an already-resolved image keeps the gate open.
- **Edge cases covered:** null/empty slide; text-only vs image; first-load
  blocked; resolve-other-url inert for current; slide transition re-closes gate
  (no carry-over readiness for a fresh URL); back-navigation to a resolved slide
  stays open (no re-wait); idempotent resolve (set add guard).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m22s**
  (full `assembleDebug` + all module JVM unit tests). Targeted
  `:feature:stories:testDebugUnitTest` → gate 4/4, viewer-VM 29/29 green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (the "when may the countdown run /
  what counts as ready" product rule is a pure unit in `:feature:stories`, not
  the SDK; the screen only reports resolution + reads the flag); single source of
  truth (reuses the existing `StorySlideView`/`StoryPlayback`; no second cache —
  readiness is derived from the live `AsyncImage` callbacks); Instant-App
  (proactive: never skips an unpainted image, complements the prefetch window);
  UDF + immutable `UiState`, pure gate; colour/UX coherence (progress bar holds
  at empty while waiting, no jarring skip); no dead end. Surpasses iOS.

### 2026-06-23 — slice `story-media-prefetch` ✅
- **Branch:** `claude/apps/android/story-media-prefetch`
- **What:** **adjacent-slide media prefetch** for the story viewer — warm the
  next slides' images into the shared Coil cache so they paint instantly
  (Instant-App: "no spinner for media we could have prefetched"). Surpasses iOS,
  which preloads only the single immediate next item; Android warms a sliding
  window of the next N distinct image-bearing slides, continuing across author
  groups.
- **Added (production):**
  - `feature:stories` — pure `StoryPrefetchPlanner.plan(playback, lookahead=2)`:
    returns the next up-to-N **distinct** image URLs strictly ahead of the
    current slide, in forward viewing order (remaining-in-current-group then
    later groups flattened), skipping text-only slides; empty when dismissed,
    no groups, non-positive lookahead, or at the last slide of the last group.
  - `StoryViewerUiState.prefetchUrls` derived in `StoryViewerViewModel.emit()`
    from the live `StoryPlayback` via the planner.
  - `StoryViewerScreen` — a `LaunchedEffect(state.prefetchUrls)` enqueues each
    URL through `context.imageLoader` (the same singleton `AsyncImage` uses, so
    the warmed entry is reused) — exempt Composable glue.
- **Tests (+12):**
  - `StoryPrefetchPlannerTest` (pure) +10 — immediate-next; lookahead window in
    order; group-boundary continuation; skip text-only; dedupe repeated URLs;
    empty at last-slide-last-group; empty when dismissed; empty when no groups;
    empty for non-positive lookahead (0 and negative); fewer-than-lookahead when
    not enough remain.
  - `StoryViewerViewModelTest` +2 — `prefetchUrls` warms the current author's
    upcoming images on load; shrinks to empty as the viewer advances to the end.
- **Edge cases covered:** empty/single collections; boundary (last slide of last
  group → nothing ahead); group roll-over; idempotent/inert (dismissed →
  empty); text-only slides skipped; dedupe; non-positive lookahead guard;
  fewer-than-window remaining.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m45s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:feature:stories:testDebugUnitTest` (planner + VM) green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (the "which images to warm / how far
  ahead / when nothing" product rule is a pure unit in `:feature:stories`, not
  the SDK; the screen only enqueues); single source of truth (reuses the shared
  Coil `ImageLoader`, no second cache; URLs derived from the existing
  `StoryPlayback`/`StorySlideView`); Instant-App (proactive cache warming, no new
  blocking spinner); UDF + immutable `UiState`, pure planner; no dead end.
  Surpasses iOS (windowed cross-group prefetch vs single-next).

### 2026-06-23 — slice `story-tray-count-dots` ✅
- **Branch:** `claude/apps/android/story-tray-count-dots`
- **What:** the **segmented unviewed-count dots** under each multi-story tray ring —
  parity with iOS `storyCountDots`, surpassing it: where iOS dims every dot
  uniformly on a group-level `hasUnviewed` flag, Android resolves the *precise*
  number of unseen stories and activates only the trailing unviewed dots, so the
  indicator reads as "how many new" at a glance.
- **Added (production):**
  - `feature:stories` — pure `StoryCountDots` (`from(storyCount, unviewedCount)`:
    `null` for ≤1 story; dot count capped at `MAX_DOTS=5` with `hasOverflow` flag;
    `isActive(index)` marks the trailing `unviewedCount` dots active, clamped to
    `[0, dotCount]`, inert for out-of-range indices).
  - `StoryRing.unviewedCount` (computed in `StoryTrayBuilder` from
    `stories.count { !it.isViewed }`) — the per-story `isViewed` data iOS's tray
    ring doesn't surface.
  - `StoryTray` — `StoryCountDotsRow` composable: accent-tinted active dots, muted
    `textSecondary@35%` inactive dots, trailing "+" on overflow, hidden+weightless
    for single-story rings; an accessibility `contentDescription`
    (`stories_count_dots` "N new of M stories", en/fr/es/pt).
- **Tests (+13):**
  - `StoryCountDotsTest` (pure) +12 — empty→null; single→null; all-viewed inactive;
    all-unviewed active; partial→trailing active; exactly-5 no overflow; >5 caps+overflow;
    overflow keeps trailing-active; unviewed clamped to all-active; negative→none;
    unviewed > count never over-activates; `isActive` inert out-of-range.
  - `StoryTrayBuilderTest` +1 — `unviewedCount` counts only unseen stories (mixed
    viewed/unviewed group); existing "ring carries unviewed state" tightened to assert
    `unviewedCount`.
- **Edge cases covered:** 0/1-story (no dots); all-viewed vs all-unviewed; partial
  view (trailing activation); exactly-cap (5) vs overflow (>5); defensive clamps
  (negative unviewed, unviewed > count); out-of-range `isActive`.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m44s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:feature:stories:testDebugUnitTest` green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (the "how many dots / which active / when
  hidden" presentation rule is a pure unit in `:feature:stories`, not the SDK);
  single source of truth (accent via `accentHex`/`hexColor`, muted token via
  `MeeshyTheme.tokens`); Instant-App (no new I/O — derived from the already-cached
  tray); colour/UX coherence (accent-coherent dots, weightless when irrelevant);
  no dead end. Surpasses iOS (precise per-count activation vs group-level dimming).

### 2026-06-23 — slice `story-comments-overlay` ✅
- **Branch:** `claude/apps/android/story-comments-overlay`
- **What:** the **comments overlay** on the open story — parity with iOS
  `StoryCommentsView` + `StoryInteractionService` comments, surpassing it with
  Instant-App discipline (cold-only skeleton, stale-kept refresh) and **optimistic
  posting** (instant Pending row → server-ACK swap → Failed + tap-to-retry; iOS
  posts fire-and-forget), plus realtime `comment:added` deltas appended live.
- **Added (production):**
  - `core:model` — `StoryComment` domain + `StoryCommentStatus {Pending,Sent,Failed}`
    + pure `ApiPostComment.toStoryComment(prefs)` mapper: Prisme-resolved body
    (Rule 1 — original on no preferred-language match), author name display→username
    fallback (blank-guarded), blank avatar→`null`, wire comments always `Sent`.
  - `core:network` — `StoryApi.comments(id, cursor, limit)` → `GET posts/{id}/comments`.
  - `sdk-core` — `StoryRepository.comments(storyId, cursor, limit)`.
  - `feature:stories` — pure `StoryCommentsReducer` (`merged` server-page fold:
    dedupe-by-id, oldest-first, keep in-flight optimistic rows at tail; `posting`;
    `confirmed` clientId→server swap with echo-already-present de-dup + unknown-id
    append/inert; `failed` mark; `received` socket append deduped by id);
    `StoryCommentsViewModel` (Instant-App load + optimistic post/retry + filtered
    `commentAdded` collection); `StoryCommentsSheet` (`ModalBottomSheet`: count
    title, comment rows with dimmed-pending + tap-to-retry-failed, accent-tinted
    input + send, `imePadding`). Wired into `StoryViewerScreen` via a comment
    `IconButton` (everyone, gated on `currentStoryId`); the auto-advance timer
    pauses while the sheet is open. Strings `stories_comments_*` in en/fr/es/pt.
- **Tests (+39):**
  - `StoryCommentMappingTest` (core:model, pure) +8 — preferred-language
    translation applied / no-match keeps original / blank-translation keeps
    original; displayName preferred / blank→username / null author→empty;
    blank avatar→null; mapped always Sent + non-optimistic.
  - `StoryCommentsReducerTest` (feature, pure) +16 — `merged` empty/sort/dedupe/
    keep-pending-tail/drop-once-server-delivers/null-createdAt-sinks; `posting`
    appends; `confirmed` swap / echo-present-drop-dup / unknown-append /
    unknown-inert-when-present; `failed` mark / unknown-inert; `received`
    append / inert-when-present / into-empty.
  - `StoryCommentsViewModelTest` (feature) +15 — cold success oldest-first;
    empty→isEmpty; cold failure→error; cold exception→message; refresh-failure
    keeps list no error; cold skeleton→list (Turbine); re-entrancy = 1 repo call;
    optimistic Pending→Sent on ACK; failure→Failed; blank ignored (0 repo calls);
    retry failed→Sent; retry unknown inert; socket this-story appends; socket
    other-story ignored; socket echo of shown comment deduped.
- **Edge cases covered:** empty/single lists; null createdAt sort; cold vs warm
  (refresh) load; cold failure vs refresh failure (keep stale); exception
  (non-cancellation) path; re-entrant load; optimistic post + rollback-to-Failed
  + retry; blank/whitespace post (no-op); own-echo de-dup (socket-before-ACK and
  ACK-before-socket both converge, no dup); foreign-story socket ignored;
  Prisme Rule-1 original-on-no-match; blank wire fields.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m55s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted:
  `:core:model`, `:sdk-core`, `:feature:stories` testDebugUnitTest all green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (domain model + Prisme mapper + repository
  method are building blocks in `core:model`/`core:network`/`sdk-core`; the
  "merge/reconcile/when-skeleton/optimistic" product rules live in
  `:feature:stories`'s `StoryCommentsReducer`/`StoryCommentsViewModel`); single
  source of truth (Prisme via `LanguageResolver`, avatar colour via
  `DynamicColorGenerator`, accent via `accentHex`); Instant-App (cold-only
  skeleton, stale-kept refresh, optimistic post); UDF + immutable `UiState`, pure
  reducer; no dead end (button → sheet → dismiss returns to a coherent viewer,
  timer paused while open).

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
