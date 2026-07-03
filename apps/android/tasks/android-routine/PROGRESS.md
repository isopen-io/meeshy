# Progress — state & what to do next

## Current build-order position

`Auth ✅ → Conversations ✅ → Chat ✅ → Feed ✅ → Stories ✅ (rich) → **Calls (started)** → rest`

> Calls kicked off 2026-06-30 with the pure call-lifecycle FSM (`core:model`
> `me.meeshy.sdk.model.call` — `CallState`/`CallEndReason`/`CallEvent`/`CallStateMachine`). On
> 2026-07-01 the `:feature:calls` module landed its real consumer (slice `calls-viewmodel-screen`):
> a UDF `CallViewModel` (`StateFlow<CallUiState>`) driving the FSM via accept/decline/hang-up/mute/
> camera intents + signalling events, a pure `CallPresenter` projecting the UI state, and a minimal
> accent-coherent call screen reachable from audio/video buttons in the chat header. On 2026-07-01 the
> **signalling event models + socket mapping** landed (slice `call-signalling-events`): `@Serializable`
> inbound `call:*` payload types + a total pure `CallSignalMapper.map(eventName, rawJson) → CallEvent?`
> at parity with the iOS `MessageSocketManager` listen table. On 2026-07-01 the **socket subscription +
> outbound emit table** landed (slice `call-signal-manager`): `:sdk-core` `CallSignalManager` listens to
> all 8 inbound `call:*` frames → `CallSignalMapper` → `SharedFlow<CallEvent> events`, and exposes the
> fire-and-forget outbound emits (`join`/`leave`/`end`/`toggle-audio`/`toggle-video`/`signal`) at
> iOS-exact payload keys. On 2026-07-01 the **call-journal model** landed (slice `call-history-model`):
> `core:model` gains `CallDirection` (raw-degrades to incoming), `CallMediaType` (audioOnly/audioVideo),
> `@Serializable` `CallHistoryPeer` + `CallRecord` mirroring the gateway `CallHistoryItem` REST contract
> field-for-field (ISO-8601 timestamps as strings, keeping the module date-dependency-free), with pure
> display accessors (`directionKind`/`isMissed`, `mediaType`, four-tier `displayName`, `avatarUrl`,
> `durationLabel`, `dataLabel`) as the single tested SSOT a future missed/recent-calls list renders.
> On 2026-07-01 the **call-history repository** landed (slice `call-history-repository`): `:core:network`
> `CallHistoryApi`, `:core:database` `CallHistoryEntity`/`CallHistoryDao` (DB v6→v7), and `:sdk-core`
> `CallHistoryRepository` — a cache-first SWR `historyStream()` (via `CallHistoryCacheSource`, port of
> `StoryCacheSource`) plus a cursor-paginated `fetchPage → CallHistoryPage`. On 2026-07-01 the
> **recent/missed-calls list UI** landed (slice `call-history-list`): a UDF `CallHistoryViewModel`
> over `historyStream()` — SWR flags (skeleton only on cold empty), a client-side missed-only filter,
> cursor-paged infinite scroll via `fetchPage` (de-dup, cursor advance, `hasMore`/re-entrancy/failure
> gating), and pull-to-refresh that resets paging — backed by the pure `CallHistoryList` (combine+filter)
> and `CallTimeLabel` (ISO → relative label), rendered by an accent-coherent `CallHistoryScreen`.
> On 2026-07-01 the **ACK-based `call:initiate`** landed (slice `call-initiate-ack`): `core:model` gains
> `SocketIceServer` (+ `IceServerUrlsSerializer` normalising single-string-or-array `urls`),
> `CallInitiateAck`, the sealed `CallInitiateResult` (`Success`/`ServerError`/`Malformed`/`Timeout`) and
> the total pure `CallInitiateAckParser.parse`, plus `:sdk-core` `CallSignalManager.emitInitiate(
> conversationId, isVideo)` — the suspend emit that mints the real `callId` (+ mode / ICE servers / ttl)
> every outbound emit is keyed by, at parity with the iOS `emitCallInitiate` (10s ACK budget). The
> `callId` lifecycle now exists.
> On 2026-07-01 the **VM-fold** landed (slice `call-viewmodel-signal-fold`): `CallViewModel` now folds
> `CallSignalManager.events` in `viewModelScope` (each mapped `CallEvent` reduced through the FSM), an
> outgoing `start` mints the real `callId` via `emitInitiate` (optimistic ring, then `Ended(Failed)` on
> ACK failure), and accept/decline/hang-up/mute/camera fan out to `emitJoin`/`emitEnd`/`emitToggleAudio`/
> `emitToggleVideo` keyed by the known `callId` (inert until one exists). The call screen is now a real
> two-way endpoint over the socket.
> On 2026-07-02 the **realtime session binding** landed (slice `realtime-session-coordinator`): the whole
> realtime layer was previously dead — nothing called `SocketManager.connect()` and no manager's `attach()`
> ran, so `CallSignalManager.events` (and every `message:*`/social frame) never flowed. A new
> `:sdk-core` `RealtimeSessionCoordinator.onAuthenticatedChanged(isAuthenticated)` is the one bridge from
> the auth session to the socket: on sign-in it `connect()`s the socket **then** attaches all three feature
> managers (message/social/call), on sign-out it `disconnect()`s, and it acts only on genuine auth edges
> (no double-connect on a redundant signal). The ordering + edge invariants live in the pure
> `RealtimeLifecyclePlan.commandsFor(was, is)`; **attach is paired with every connect** (not once ever) so a
> logout→login cycle re-attaches on the new socket. `AuthViewModel` drives it at init (restored token),
> login success, and logout. +11 tests (5 plan, 6 coordinator) + 5 AuthViewModel wiring tests.
> On 2026-07-02 the **outgoing-call room threading** landed (slice `call-nav-conversation-thread`): the
> `:app` CALL route dropped the `conversationId`, so `CallViewModel.start` → `emitInitiate("", …)` fired
> into an empty room (every outgoing call dead-on-arrival). A new pure `me.meeshy.app.navigation.CallRoute`
> (SSOT: `PATTERN`, `path(...)`, `config(conversationId?, peerName?, isVideo?) → CallConfig`) now owns the
> route; the CHAT `composable` threads its own `conversationId` nav-arg into `Routes.call(...)`, and the
> CALL `composable` decodes the args through `CallRoute.config`. Outgoing calls now initiate into the real
> room. +8 tests (first `:app` test source set).
> On 2026-07-02 the **Calls bottom-nav tab** landed (slice `calls-tab-nav`): `CallHistoryScreen` was
> reachable-by-nobody dead UI — no route pointed at it. A new `Routes.CALLS` tab (`Call` icon, placed
> Messages · Feed · **Calls** · Activity · Profile) mounts it in the `NavHost`, and tapping a journal row
> re-dials via the new pure `CallRoute.redial(record)` — the natural "tap a past call to call back" gesture,
> threading the record's conversation, resolved `displayName` and media straight into the outgoing-call
> route (identical to a call from the chat header). +4 `CallRouteTest` cases (conversation/name/media round
> trip, displayName-over-username resolution + reserved-char encoding, audio-only, peer-absent group
> fallback). `assembleDebug` + `:app:testDebugUnitTest` green.
> On 2026-07-02 the **incoming-call push decision core** landed (slice `incoming-call-push-decision`): the
> pure `core:model` brick before the Android Telecom/`ConnectionService` full-screen-intent plumbing.
> `IncomingCallPush` (typed FCM `data`-map / VoIP payload at gateway parity) + total
> `IncomingCallPushParser.parse` (call iff `type ∈ {call,voip_call}` + non-blank `callId`; lenient
> `iceServers`) + immutable `SeenCallRing` (pure port of iOS `VoIPDedupRing`, cap 24 / ttl 30s) + pure
> `IncomingCallDecider.decide` (`Ring` | `Ignore(DUPLICATE/BUSY/SELF_INITIATED)`, ordering faithful to
> `VoIPPushManager`/`reportIncomingVoIPCall`). +39 behavioural tests. The SSOT the FCM-service routing +
> full-screen notification will consume.
> On 2026-07-02 the **FCM call-push routing** landed (slice `fcm-call-push-route`): the pure
> `IncomingCallPushRouter.route(data, context) → IncomingCallPushRoute` (`NotACallPush` | `Ring(push,
> updatedSeen)` | `Suppress(reason)`) folds the parser + decider + ring-insert into the single total
> decision the FCM service delegates to — the dedup ring is advanced **only** on a `Ring` outcome, so a
> retried VoIP push is caught next time while a suppressed (self / busy / duplicate) push never poisons a
> future legitimate ring. The app-layer `@Singleton IncomingCallRingStore` is the sole owner of the live
> `SeenCallRing` (synchronized `route`/`forget`; self-user id threaded from `SessionRepository`), and
> `MeeshyFcmService.onMessageReceived` now routes each push by kind: a `Ring` fires a full-screen,
> CATEGORY_CALL / `PRIORITY_MAX` notification on the new `meeshy_calls` channel (`setFullScreenIntent` →
> `MainActivity` with `callId`/`conversationId`/`callerName`/`isVideo` extras), a `Suppress` drops
> silently, and a `NotACallPush` falls through to the existing message-notification + outbox-flush path.
> +19 behavioural tests (11 router, 8 store). `:app:assembleDebug` + `testDebugUnitTest` green.
> On 2026-07-02 the **incoming-call deep-link** landed (slice `incoming-call-deeplink`): the call
> full-screen intent + message notification set extras on `MainActivity`, but `MainActivity` ignored them
> — a ring tap opened the app on the conversation list, never the call. The new pure
> `me.meeshy.app.navigation.LaunchRouter.route(LaunchExtras) → String?` is the SSOT: a non-blank `callId`
> deep-links into the incoming-call screen via `CallRoute.incoming(...)` (a call push **wins** over a
> message push — a ring is the urgent intent — and the route carries `isOutgoing=false` + the server
> `callId` so the screen **answers** rather than re-initiates), else a non-blank `conversationId` opens
> that chat (`Routes.chat`, the shared message-tap path), else `null` (start dest stands). `CallRoute` was
> refactored from a path-arg route to a **static `call` path + all-optional query args** so a blank room
> or peer name can never collapse a required path segment and crash `navigate()` (Compose Navigation
> requires non-empty path segments) — strictly more robust, outgoing/redial behaviour preserved.
> `MainActivity` extracts the extras (thin glue) and calls `LaunchRouter` in `onCreate` + `onNewIntent`;
> `MeeshyApp` navigates via a `LaunchedEffect` once the graph is live **and** the user is authenticated
> (an unauthenticated cold launch defers the route across the login gate), then marks it consumed so a
> recomposition never re-navigates. +14 behavioural tests (8 `LaunchRouterTest`, 6 new `CallRouteTest`).
> `assembleDebug` + all `testDebugUnitTest` green.
> On 2026-07-02 the **live in-call duration timer** landed (slice `call-duration-timer`): the pure
> `CallDuration.clock(seconds)` in `:core:model` is now the SSOT for call-length formatting (reused by
> `CallRecord.durationLabel`), `CallViewModel` runs a 1-Hz timer via an injected `CallSecondsTicker` flow
> seam while connected/reconnecting, and `CallPresenter` derives `CallUiState.durationLabel` — `"0:00"` on
> connect, ticking through a reconnect, frozen at the final length on the ended screen, `null` for a call
> that never connected. The connected screen shows the running clock; the ended screen appends the final
> length. +18 tests.
> On 2026-07-02 the **call-audio decision core** landed (slice `call-sound-policy`): the pure
> `core:model` `CallSoundPolicy` is the SSOT mapping call lifecycle → sound — the Android analogue of the
> iOS `RingbackTonePlayer` call sites collected into one total function. `loopFor(state)`
> (`CallSound.None/Ringback/Ringtone`) plays the caller **ringback** through the whole pre-answer wait
> (`Ringing(outgoing)` + `Offering`) and stops it the instant the answer lands (`Connecting`) — tighter
> than iOS, which drags it to `.connected` — and the callee **ringtone** while `Ringing(incoming)`;
> `cueFor(prev,next)` fires `CallCue.Connected` on every entry into `Connected` (first connect **and**
> reconnect-success) and `CallCue.Ended` only when a *live* call ends (`prev.isActive`, mirroring iOS
> `if wasActive`), so a phantom `Idle→Ended`/idempotent `Ended→Ended` stays silent; `plan(prev,next)`
> bundles both per edge. The `:feature:calls` `CallToneController` seam (thin `ToneGenerator`/
> `RingtoneManager` glue behind an interface, `@Binds AndroidCallToneController`) is folded into
> `CallViewModel.dispatch` — each FSM edge drives the loop (switched only on a genuine change, so an inert
> event never restarts the ringback) + fires the cue, released on `onCleared`. +28 tests (19 policy, 9
> VM-fold via a recording fake). `assembleDebug` + all `testDebugUnitTest` green.
> On 2026-07-03 the **telecom-connection decision core** landed (slice `call-telecom-state-plan`): the pure
> `core:model` `TelecomCallPolicy` is the SSOT mapping call lifecycle → the OS telecom reports a
> self-managed `ConnectionService` must make — the Android analogue of the `CXProvider.reportCall(...)` /
> `report(_:endedAt:)` calls the iOS `CallManager` makes to CallKit, collected into one total function.
> `connectionStateFor(state)` keys purely on `CallState` (no direction leak): outgoing ring/`Offering` →
> `Dialing`, incoming ring → `Ringing`, **answered = `Active`** (`Connecting`/`Connected`/`Reconnecting`
> collapse onto `Active` so an ICE restart never tears the system call down), `Ended` → `Disconnected`,
> `Idle` → none. `disconnectCauseFor(reason)` maps every `CallEndReason` (lost/failed → `Error`).
> `plan(prev,next)` reports **only on a genuine transition** — dedupes an already-active edge, a phantom
> `Idle→Ended` (no connection ever created, mirroring `CallSoundPolicy`'s `prev.isActive` guard), an
> idempotent `Ended→Ended`, and a settle `Ended→Idle` all to `null`. The `:feature:calls`
> `TelecomCallReporter` seam (thin `LogTelecomCallReporter` interim glue behind an interface, `@Binds` into
> a Hilt module) is folded into `CallViewModel.dispatch` (report each genuine edge; released on
> `onCleared`). +35 tests (28 policy, 7 VM-fold via a recording fake). `assembleDebug` + all
> `testDebugUnitTest` green.
> On 2026-07-03 the **connection-quality core + indicator** landed (slice `call-quality-level`): the pure
> `core:model` `VideoQualityLevel` (5-tier `CRITICAL<POOR<FAIR<GOOD<EXCELLENT`, port of iOS
> `VideoQualityLevel`/`QualityThresholds`) classifies live stats via `from(rttMs, packetLoss)`
> (worse-of-two-axes, strict `>`) + `from(availableOutgoingBitrateBps)` and carries each tier's sender
> caps for the future adaptive-bitrate ladder; the four-tier `ConnectionQuality` collapses it
> (`CRITICAL→POOR`, parity with iOS `connectionQualityLabel`) with `bars`/`isWeak`. A `CallQualitySampler`
> stats seam (interim `NoopCallQualitySampler`) is folded into `CallViewModel` exactly while media flows
> (a `qualityJob` mirroring the duration ticker), projected by `CallPresenter` into
> `CallUiState.connectionQuality`, and rendered as an accent-coherent 4-bar signal indicator on the call
> screen (error hue on a weak link). +37 tests (24 core, 6 VM-fold, 3 presenter, +4 strings×4 locales).
> `assembleDebug` + all `testDebugUnitTest` green.
> On 2026-07-03 the **video-survival auto-disable policy** landed (slice `call-video-survival-policy`, #1387):
> the pure `core:model` `VideoSurvivalPolicy.reduce(state, level, nowSeconds, userWantsVideo)` drops
> outbound video to audio-only after a sustained ≥6 s `POOR`/`CRITICAL` streak and resumes after a
> sustained ≥10 s `EXCELLENT`/`GOOD` streak (duration-based hysteresis on a monotonic clock, `FAIR` holds
> the recovery window). +19 tests. The actuator seam is deferred to the WebRTC layer.
> On 2026-07-03 the **WebRTC-plumbing emits** landed (slice `call-webrtc-plumbing-emits`): `:sdk-core`
> `CallSignalManager` gains the five remaining outbound call frames at iOS payload-key parity —
> `emitRequestIceServers`/`emitHeartbeat`/`emitQualityReport`/`emitReconnecting`/`emitReconnected`. The
> `call:quality-report` `stats` shape is decided once by the pure `core:model` `CallQualityReport.
> statsFields()` (base five metrics always present; `availableOutgoingBitrateBps`/`jitterMs` appended only
> when strictly positive, iOS parity), with `ConnectionQuality.wireValue` as the `level` SSOT and `Long`
> byte counters (surpasses iOS's 32-bit `Int` — no overflow on a marathon call). The outbound emit table
> for the whole call domain is now complete; only the **app-side driver seams** (heartbeat/quality-report
> timers, ICE-restart controller) that *call* these emits remain, and land with the WebRTC media
> transport. +16 tests (10 report, 6 manager). `assembleDebug` + all `testDebugUnitTest` green.
> **Next:** the real self-managed `ConnectionService`/`PhoneAccount` registration + full-screen call UI +
> foreground service (the platform glue that swaps the `LogTelecomCallReporter` `@Binds` for a real
> reporter and owns the audio session), then the actual WebRTC media transport (`stream-webrtc-android`).
> Follow-up: `SocketManager.reconnectWithToken()`
> still has no caller (token-refresh re-attach slice — deferred until a token-rotation trigger exists).
> See the run log + `feature-parity.md §H`.

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
Surpasses iOS's in-memory optimism (which evaporates on a kill). The
`story-publish-retry` loop closed the failure gap (exhausted publish → a
"Couldn't post your story" Retry/Discard strip). Latest loop
(`story-composer-media`) gives the composer **real media**: the system
photo/video picker (`ActivityResultContracts.PickVisualMedia`) feeds the chosen
file to `StoryComposerViewModel.onMediaPicked`, which uploads it via the
`media-upload-api` foundation and **appends** the returned media to the draft
(`StoryComposerUiState.attachments` preview + `draft.mediaIds`); `publish()`
carries `mediaIds` into the same durable-outbox flow. A **media-only** story
(no caption) is now publishable. Uploads are re-entrancy-guarded, gate
`canPublish` while in flight, and fail gracefully (message, draft intact).
Latest loop (`story-composer-media-cap`) enforces the iOS **≤10 media cap**: the
pure draft gains `MAX_MEDIA`/`isWithinMediaLimit`/`remainingMediaSlots`/`isMediaFull`
(and `canPublish` now also requires the media limit), `onMediaPicked` truncates a
pick to the free slots and is inert-with-a-warning once full, and the composer's
Add button disables + shows an `n/10` count at the cap. Latest loop
(`story-composer-multipick`) lets a user grab **several media in one go**: a pure
`StoryMediaPicker.modeFor(remainingSlots)` routes the Add button to the single- or
multi-item system picker (`PickMultipleVisualMedia(MAX_MEDIA)`), falling back to
the single picker at exactly one free slot so the multi-picker's `maxItems > 1`
requirement never throws, and launching nothing when full. The VM's existing
free-slot truncation still caps the batch, so the ≤10 invariant holds end-to-end.
Latest loop (`outbox-produced-id-writeback`) closed the **second half** of the durable
upload→publish chain: a prerequisite that delivers a `SendResult.SuccessWithId(realId)`
now **grafts** that real id into every still-queued dependent publish's payload
(placeholder = the prerequisite's own `cmid`) before its gate opens — via the pure
`PublishMediaWriteBack.graft` and the generic `OutboxRepository.rewriteDependents`. A
media story queued **offline, before its upload finished** will publish with the
correct id (once the producer half — a durable `MEDIA`-lane upload sender — lands).
Latest loop (`media-blob-store`) lands the **first brick of that producer half**: a
durable file-bytes store. The shared outbox carries a `String` payload, so an
`UPLOAD_MEDIA` row can't hold raw bytes — the new `MediaBlobEntity`/`MediaBlobDao`
(Room, DB v5→v6 via the existing destructive fallback) plus the `MediaBlobStore`
building block (`put`/`get`/`remove`, keyed by the upload row's cmid, reusing
`MediaUploadItem` as the single bytes shape) persist the file so a media attachment
queued **fully offline** survives process death. Latest loop (`media-upload-sender`)
lands the **rest of the producer half at the SDK layer**: a new
`OutboxKind.UPLOAD_MEDIA`, a pure `MediaUploadSender.send(item, upload)` mapping the
four delivery outcomes (blob gone → permanent; offline → transient; empty result →
permanent; real id → `SuccessWithId(realMediaId)`), a `MediaUploadQueue.enqueue(item)`
building block that writes the bytes to `MediaBlobStore` then queues an `UPLOAD_MEDIA`
row on the `MEDIA` lane (blob + row share one `cmid`, returned as the dependency key),
and the `OutboxFlushWorker` wiring: a `MEDIA`-lane sender (reads the blob, uploads via
`MediaRepository`, `remove`s the bytes once no longer retryable), `MEDIA` drained
**before** `STORY`, and `onExhausted` dropping the blob so a dead upload never leaks
bytes. The whole durable offline upload→publish chain now functions end-to-end at the
SDK layer. Latest loop (`story-composer-offline-media`) wires the **last brick** — the
composer now **falls back to the durable chain** when a synchronous media upload fails
transiently: a single picked media whose upload returns offline / 429 / 5xx (the pure
`MediaUploadRetryPolicy.isQueueable` product policy) is instead `MediaUploadQueue.enqueue`d
and staged as a single `PendingMediaUpload` placeholder in the draft (its `cmid` rides in
`draft.mediaIds`, counts toward the ≤10 cap, renders an "Offline" preview tile). `publish()`
then enqueues the `PUBLISH_STORY` row with `dependsOn = pendingUpload.cmid` (via the new
`StoryRepository.enqueuePublish(request, dependsOn)` param), so the drainer holds the publish
until the upload delivers, then grafts the real id. A **permanent** failure (4xx), a
**multi-item** offline pick, or a pick **while one upload is already pending** still surfaces
the error (single-pending constraint keeps the single-`dependsOn` chain correct). Surpasses
iOS, which drops a pick on an offline upload. Latest loop (`media-upload-cancel`) closes the
**orphan-leak gap**: removing the offline placeholder now `MediaUploadQueue.cancel`s its durable
`UPLOAD_MEDIA` row + blob (row discarded first so the drainer stops picking it up, then the bytes;
unknown cmid inert), so no orphaned upload streams bytes to a media the story never references. The
UI clears optimistically; the durable cancel is best-effort & cancellation-safe. Latest loop
(`outbox-flush-retry-on-blocked`) closes the **cross-pass gating gap**: the `OutboxFlushWorker`
previously rescheduled (WorkManager `Result.retry()`) only when a lane stopped on a **transient**
failure, ignoring a lane that stopped on a **blocked dependency**. Because lanes drain in a fixed
order, a dependent (a media story/message) can be `BLOCKED` early in a pass while its prerequisite
`UPLOAD_MEDIA` row is delivered *later in the very same pass* — leaving a now-satisfiable dependent
sitting until an unrelated trigger fired. A new pure `OutboxFlushPlan.outcome(reports)` building
block decides the pass outcome — `RETRY` when **any** lane stopped on a transient failure **or** a
blocked dependency — and the worker delegates to it. Forward progress is guaranteed: each retry
either delivers the dependent or cascade-exhausts it once the prerequisite gives up (`EXHAUSTED`
flips the verdict to `FAILED`, never `BLOCKED`), so the loop always terminates. Latest loop
(`outbox-multi-dependency`) generalises the `dependsOn` gate from **one** prerequisite to a
**set**: a new pure `OutboxDependencyKey` (encode/decode/`likePattern`) round-trips the set through
the single `dependsOn` column (wrapped-delimited, `_`-escaped membership `LIKE`), `OutboxMutation.dependsOn`
is now a `Set<String>`, and `OutboxDependencies.verdictAll` gates a dependent on **all** prerequisites
(any `EXHAUSTED` ⇒ cascade-exhaust; else any still-queued ⇒ hold). `findDependents` became a membership
query so a delivered producer grafts its real id into a dependent waiting on several uploads, and
`StoryRepository.enqueuePublish` now takes a `List<String>`. This is the provably-correct SDK half of
"several media queued offline"; the composer adopts the list contract but keeps single-pending UI (the
multi-pending UX is the next slice). Surpasses iOS, which has no durable offline upload chain at all.
Latest loop (`story-composer-multi-pending`) closes that chain **end-to-end from the UI**: the composer's
`pendingUpload?` became `pendingUploads: List<PendingMediaUpload>`, so every transient-failed pick is
appended (and a single offline pick carrying **several** items now stages each one), `publish()` gates the
story on **all** pending cmids (`enqueuePublish(.., dependsOn = pendingUploads.map { cmid })`), per-tile
remove cancels only that durable row, and the preview renders N "Offline" tiles. `queueDurably` stages one
item at a time so partial progress survives a mid-batch enqueue failure. Surpasses iOS, which drops a pick
on an offline upload. Latest loop (`story-composer-slide-deck`) makes the **multi-slide model real in the
composer**: `StoryComposerUiState` carries a `deck: StorySlideDeck`, the VM mints slide ids and exposes
add/duplicate/remove/move/select intents (the editor binds to the selected slide's text, each slide keeps
its own caption via pure `updateSelectedText`), publish stays **lossless** — `publishRequests` emits one
story per non-blank slide in order (first carries whole-story media + offline `dependsOn`), `canPublish`
gates on the **whole deck** (an off-screen over-long slide blocks publish), and `StoryComposerScreen`
renders a `SlideStrip` mini-preview (numbered selectable chips, Duplicate/Remove on the selected chip,
"+" add chip capped at 10). The single-slide path stays byte-identical to before. Latest loop
(`slide-drag-reorder`) closes that loop's **deferred drag-reorder gesture**: a horizontal drag on a
slide chip now reorders it. A new pure `SlideReorderResolver.targetIndex(fromIndex, dragPx,
slotWidthPx, slideCount)` converts the accumulated drag pixels + the measured slot width (chip width
+ spacing) into how many whole slots the chip crossed — a sub-half-slot drift rounds to zero (no
accidental reorder), the result is clamped to the deck bounds, and a non-positive slot width / empty
deck / out-of-range origin all degrade safely. `SlideStrip` binds `detectHorizontalDragGestures` on
each chip and hands the resolved target to the already-tested `onMoveSlide`, so the move math lives
in one pure, unit-tested place and the Composable stays glue. Latest loop (`story-slide-media`) moves
media **onto the slide it was added to** (not the whole story): the deck is the single source of truth
(`addMediaToSelected`/`removeMedia`/`hasMedia`/`isWithinMediaLimit`/`selectedRemainingMediaSlots`, ≤10
**per slide**) and `draft` mirrors the selected slide for media just as it does for text, so the single-
slide path stays byte-identical. The preview shows only the selected slide's media, publish emits one
story **per publishable slide** (text **or** media — a media-only slide now publishes) carrying that
slide's media and `dependsOn` only that slide's offline uploads, and removing a slide reclaims its media
(prunes the preview pools + cancels its durable rows). Surpasses iOS, which drops an offline pick.

## Next slice (pick one for the next run)

**Now in the Calls area** (`feature-parity.md §H`). The pure FSM (`core:model`
`me.meeshy.sdk.model.call`) landed 2026-06-30; the `:feature:calls` consumer landed 2026-07-01
(slice `calls-viewmodel-screen`). Ordered by value:
1. ~~**`:feature:calls` `CallViewModel` + minimal call screen**~~ ✅ shipped as `calls-viewmodel-screen`
   (2026-07-01) — new `:feature:calls` module with a UDF `CallViewModel` (`StateFlow<CallUiState>`)
   folding accept/decline/hang-up/mute/camera intents + signalling events through `CallStateMachine.reduce`,
   a pure `CallPresenter` (`CallState × CallConfig × CallMedia → CallUiState`) owning every affordance
   decision, and a minimal accent-coherent Compose screen (ringing/connecting/connected/ended) reachable
   from audio/video call buttons in the chat header; dismissal returns to chat. +34 tests. See run log.
2. ~~**Call signalling event models + socket mapping**~~ ✅ shipped as `call-signalling-events`
   (2026-07-01) — `@Serializable` inbound payload types (`CallInitiatedPayload`/`CallSignalEnvelope`/
   `CallParticipantPayload`/`CallEndedPayload`/`CallMissedPayload`/`CallMediaTogglePayload`/
   `CallErrorPayload`/`CallAlreadyAnsweredPayload`) + a total pure `CallSignalMapper.map(eventName, rawJson)`
   → `CallEvent?` routing every `call:*` frame into the FSM vocabulary (offer/ice/media-toggle/malformed
   inert → `null`). +22 tests. See run log. **Next:** wire the mapper into a socket subscription that
   folds mapped events into `CallViewModel`, and mirror the **outbound** emit table
   (`call:initiate`/`:join`/`:signal`/`:toggle-audio`/`:toggle-video`/`:end`).
3. ~~**`CallDirection` (incoming/outgoing/missed, raw-degrades to incoming) + `CallMediaType`
   (audioOnly/audioVideo) + call-history row model**~~ ✅ shipped as `call-history-model` (2026-07-01) —
   the pure call enums from iOS `CallModels.swift`/`WebRTCTypes.swift` + `@Serializable` `CallHistoryPeer`
   and `CallRecord` mirroring the gateway `CallHistoryItem` REST contract (`GET /api/v1/calls/history`)
   field-for-field, with pure display accessors (`directionKind`/`isMissed`, `mediaType`, four-tier
   `displayName`, `avatarUrl`, `durationLabel`, `dataLabel`) as the SSOT a missed/recent-calls list
   renders. +22 tests. See run log. The **repository** ✅ shipped as `call-history-repository`
   (2026-07-01) — `:core:network` `CallHistoryApi`, `:core:database` `CallHistoryEntity`/`CallHistoryDao`
   (DB v6→v7), and `:sdk-core` `CallHistoryRepository` (cache-first SWR `historyStream()` via
   `CallHistoryCacheSource` + cursor-paginated `fetchPage → CallHistoryPage`). +17 tests. See run log.
   The **list UI** ✅ shipped as `call-history-list` (2026-07-01) — a UDF `CallHistoryViewModel` over
   `historyStream()` (SWR flags, client-side missed-only filter, cursor-paged infinite scroll via
   `fetchPage`, pull-to-refresh) backed by pure `CallHistoryList` (combine+filter) and `CallTimeLabel`,
   rendered by an accent-coherent `CallHistoryScreen`. +30 tests. See run log.
   **Next:** fold `CallSignalManager.events` into `CallViewModel` once the `initiate`-ACK call-id
   lifecycle lands; wire `CallHistoryScreen` into a Calls tab (`:app`).
4. ~~**Socket subscription → VM wiring**~~ ✅ the **subscription half** shipped as `call-signal-manager`
   (2026-07-01) — `:sdk-core` `CallSignalManager` (parity with `MessageSocketManager`/`SocialSocketManager`)
   listens to all 8 inbound `call:*` frames, routes each through `CallSignalMapper`, and republishes the
   mapped `CallEvent` on `SharedFlow<CallEvent> events`; outbound fire-and-forget emit table
   (`join`/`leave`/`end`/`toggle-audio`/`toggle-video`/`signal`) at iOS-exact payload keys. +18 tests.
   See run log. **VM-fold half now shipped** (see #6).
5. ~~**`call:initiate` ACK slice**~~ ✅ shipped as `call-initiate-ack` (2026-07-01) — `core:model`
   `SocketIceServer` (+ `IceServerUrlsSerializer` normalising single-string-or-array `urls`),
   `CallInitiateAck` (`callId`/`mode`/`iceServers`/`ttlSeconds`), the sealed `CallInitiateResult`
   (`Success`/`ServerError`/`Malformed`/`Timeout`) and the total pure `CallInitiateAckParser.parse`,
   plus `:sdk-core` `CallSignalManager.emitInitiate(conversationId, isVideo)` — the suspend transport
   that emits `call:initiate`, awaits the ACK (10s, iOS parity), delegates the body to the parser, and
   maps a missing/non-object ACK to `Timeout`. +26 tests. See run log.
6. ~~**VM-fold slice**~~ ✅ shipped as `call-viewmodel-signal-fold` (2026-07-01) — `CallViewModel` folds
   `CallSignalManager.events` in `viewModelScope` (each mapped `CallEvent` reduced through the FSM); an
   outgoing `start` mints the real `callId` via `emitInitiate` (optimistic ring, then `Ended(Failed)` on
   `ServerError`/`Timeout`/`Malformed`, the gateway message surfaced); accept/decline/hang-up/mute/camera
   fan out to `emitJoin`/`emitEnd`/`emitToggleAudio`/`emitToggleVideo` keyed by the known `callId`
   (outgoing minted, incoming from `CallConfig.callId`, inert until one exists). +14 tests. See run log.
7. ~~**App-level socket-lifecycle caller**~~ ✅ shipped as `realtime-session-coordinator` (2026-07-02) —
   the whole realtime layer was dead (nothing called `SocketManager.connect()` / any `*.attach()`), so
   `CallSignalManager.events` never flowed. `:sdk-core` `RealtimeSessionCoordinator.onAuthenticatedChanged`
   is the auth→socket bridge (connect **then** attach message/social/call on sign-in; disconnect on
   sign-out; edge-only, no double-connect), ordering + edges owned by the pure `RealtimeLifecyclePlan`
   (attach paired with **every** connect so logout→login re-attaches). Driven by `AuthViewModel` at
   init/login/logout. +16 tests. See run log.

**Next (highest value):** ~~a Calls-tab nav entry threading the real `conversationId` into the outgoing
`CallConfig`~~ ✅ the **conversationId threading** shipped as `call-nav-conversation-thread` (2026-07-02)
— pure `:app` `CallRoute` (`PATTERN`/`path`/`config`) owns the route, the CHAT composable threads its
nav-arg `conversationId`, outgoing calls now `emitInitiate` into the real room. +8 tests. Remaining: a
dedicated **Calls tab** in the bottom nav wiring `CallHistoryScreen` (`:app`). Then the heavier
WebRTC/Telecom/FCM plumbing.

Then the heavier WebRTC/Telecom/FCM-full-screen-intent plumbing (glue-heavy; push every testable
decision into pure helpers/the VM). The **ringback/ringtone/cue** decision core shipped as
`call-sound-policy` (2026-07-02), the **telecom-connection** decision core as `call-telecom-state-plan`
(2026-07-03), and the **connection-quality classification + indicator** as `call-quality-level`
(2026-07-03) — all pure `core:model` SSOTs folded into `CallViewModel`, leaving only the real
self-managed `ConnectionService`/`PhoneAccount` registration + foreground-service call UI (which swaps the
`LogTelecomCallReporter` `@Binds`) and the WebRTC media transport (`stream-webrtc-android`) as the
remaining platform glue.

**Next testable pure cores in Calls** (highest value first):
1. ~~**Video-survival auto-disable policy**~~ ✅ shipped as `call-video-survival-policy` (2026-07-03) —
   the pure `core:model` `VideoSurvivalPolicy` (port of iOS `VideoSurvivalPolicy`): `reduce(state, level,
   nowSeconds, userWantsVideo) → VideoSurvivalDecision(state, action)`. A sustained `POOR`/`CRITICAL`
   streak of ≥6 s while sending yields `Suspend` (drop to audio-only); a sustained `EXCELLENT`/`GOOD`
   streak of ≥10 s while suspended yields `Resume`; `FAIR` **holds** the recovery timer (a brief dip
   doesn't restart the window) while `POOR`/`CRITICAL` wipes it; a good/fair sample while sending clears
   the degraded streak. Duration-based hysteresis (monotonic-seconds, cadence-independent), fixed-size
   `VideoSurvivalState` (O(1) over a marathon call), user camera-off resets to `INITIAL`. Two survival
   thresholds added to `CallQualityThresholds` at iOS parity. +19 tests. See run log. **Next:** the
   WebRTC actuator seam that consumes `Suspend`/`Resume` (app-side orchestration).
2. ~~**Call-waiting banner**~~ ✅ shipped as `call-waiting-banner` (2026-07-03) — a second incoming call
   while one is active. The pure `core:model` decision core (`WaitingCall` + `WaitingCall.from(payload)`,
   `CallWaitingState`, total `CallWaitingReducer` — Offered/Rejected/Accepted/RemotelyEnded) is the SSOT,
   folded into `CallViewModel` end-to-end: a new `CallSignalManager.incomingOffers` surfaces the identity
   of each `call:initiated` frame (which the FSM-facing `events` discards), the VM routes a *second* offer
   (different callId, while `CallState.isActive`) to the banner, and a `CallWaitingTimer` seam auto-dismisses
   after 15s **as a reject** (frees the caller, iOS parity). `rejectWaiting()` ends the waiting call keyed by
   its own id (active call untouched); `acceptWaitingSwap()` hangs up the active call, settles, and
   re-presents the waiting call as a fresh incoming (iOS `endCurrentAndAnswerPending`). Accent-coherent
   top banner in `CallScreen` (error-hue reject + peer-accent answer, a11y-labelled). +35 tests. See run log.
   The `RemotelyEnded` driver ✅ shipped as `call-ended-signal-identity` (2026-07-03) — the pure
   `CallSignalMapper.endedCallId(eventName, rawJson)` decodes the `callId` from a `call:ended`/`call:missed`
   frame (blank/absent/malformed → `null`), a new `CallSignalManager.endedCalls: SharedFlow<String>`
   republishes it alongside the identity-less `events` (same parallel-stream pattern as `incomingOffers`),
   and `CallViewModel.onRemoteEnded` folds it into `CallWaitingEvent.RemotelyEnded` — auto-dismissing the
   banner (and cancelling its 15s auto-reject timer) **only** when the ended id is the *pending* call's,
   with **no** `emitEnd` (the caller already hung up), leaving the active call untouched. +15 tests.
   See run log. **Next (known follow-up):** the identity-less `events` fold still routes a *waiting* call's
   `call:ended` → `RemoteHangUp` into the *active* FSM (the gateway fans `call:ended` out to member USER
   rooms, so a busy user receives the waiting call's teardown) — an **identity-aware active-call teardown**
   slice should gate the FSM teardown on the active `callId` so only the active call's own end reduces it.
3. **Adaptive sender-cap plan** — a pure `level → (resolutionHeight, fps, bitrate)` mapping (already on
   `VideoQualityLevel`) folded into the future WebRTC sender-parameters actuator.

--- Stories backlog (area is rich; revisit only if Calls stalls) ---
Ordered by value:
0aa. ~~**8 photo filters with intensity**~~ ✅ shipped as `story-photo-filters` (this run) — pure
   `StoryFilterMatrix` (Compose-agnostic `StoryColorMatrix` + per-preset `baseMatrix` + intensity-blended
   `effectiveMatrix` + `StoryFilter.wireValue`), per-slide `StorySlide.filter`/`filterIntensity` deck
   reducers, live `ColorFilter` on the canvas + None/8-chip + strength `Slider` Effets tile, carried into
   publish on `storyEffects.filter`. See run log. **Emoji stickers** ✅ shipped as `story-sticker-elements`
   (this run) — on-canvas `StoryStickerElement` (drag/pinch/rotate/remove) + Contenu "Sticker" tile +
   emoji-grid picker, serialised to `storyEffects.stickerObjects`. **Next real Effets tiles:** on-canvas
   **freehand drawing**, then **backgrounds** (pastel / gradient / image), then the timeline. The
   **categorised + searchable** sticker picker ✅ shipped as `story-sticker-picker-search` (this run) —
   pure `StickerCatalog` (8 categories, keyworded search, `search(query, category?)`) + pure
   `StickerPickerState` reducer (a non-blank query searches across **all** categories, iOS parity);
   the dialog is now a search field + `FilterChip` tabs + filtered grid + empty-state. Replaces the
   flat `STORY_STICKER_EMOJIS`. +22 tests. See run log.
0. ~~**Z-order management (front/back, forward/backward)**~~ ✅ shipped as `story-text-element-zorder`
   (this run) — pure `StorySlideDeck.reorderTextElement(id, StoryZOrder)` restacks an element within its
   slide's paint order (list order = z-order), inert at the extremes / unknown id / single element;
   4-button z-order row in the floating toolbar. See run log.
   **Next composer-richness:** a single unified long-press context menu consolidating
   edit/duplicate/reorder/delete; then on-canvas **sticker / drawing** elements and the real **Effets
   tiles** (filters / drawing / timeline).
0b. ~~**Snap-to-guide + out-of-bounds warning**~~ ✅ shipped as `story-canvas-snap-guides` —
   pure `StorySnapResolver` (per-axis nearest-guide snap + safe-zone verdict) reused through the existing
   element-drag path, with an accent guide-line overlay + warning border. See run log.
1. **Canvas toolbar/FAB** — the bottom-band toolbar (Contenu/Effets) grouping add-text / add-media;
   glue-heavy, keep any mode decision in a pure helper or the VM.
2. ~~**Per-element transform handles**~~ ✅ shipped as `story-text-element-transform` (this run) — but
   as a **direct pinch/rotate gesture** (more natural than discrete chips, per CLAUDE.md UX rule).
3. ~~**Canvas toolbar/FAB**~~ ✅ shipped as `story-composer-band` (this run) — the two-FAB
   (Contenu/Effets) bottom band, the pure value-type port of iOS `BandStateMachine`. Pure
   `ComposerBandState` (Hidden | Tiles(category)) + `tapFab`/`swipeDown`/`swipeHorizontal` owns the
   navigation; Contenu drawer = Texte/Médias tiles, Effets drawer = visibility chips. **Next refinement:**
   real **Effets tiles** (filters / drawing / timeline) once those features land — currently Effets only
   surfaces visibility. Then the on-canvas **sticker / drawing** elements.
4. ~~**Per-element transform handles**~~ ✅ shipped as `story-text-element-transform` — as a
   **direct pinch/rotate gesture** (more natural than discrete chips, per CLAUDE.md UX rule).
   `StoryTextElement.scale`/`rotationDeg` + pure `transformed()` + `transformTextElement` reducer +
   `onTextElementTransform` VM intent + `graphicsLayer`/`detectTransformGestures` glue. Wire carries
   `scale`/`rotation`. **Per-element duplicate** ✅ shipped as `story-text-element-duplicate` (this run) —
   pure `StorySlideDeck.duplicateTextElement` clones every styled field as a fresh id just after the
   source on its slide, nudged by a small clamped offset, inert on unknown/collision/cap;
   `onDuplicateTextElement` selects the copy + warns at the cap; a `ContentCopy` handle in the floating
   `TextStyleToolbar`. **Next composer-richness refinement:** a unified multi-element context menu +
   z-order **reorder** (per-element delete already exists).
5. After Stories richness is sufficient, advance to the **Calls** area
   (`feature-parity.md` §"Calls").

(`story-floating-toolbar` ✅ shipped 2026-06-29 — this run; **the style toolbar now floats in-place**
over the canvas instead of a fixed bottom band. A pure `StoryToolbarPlacement.resolve(...)` →
`ToolbarPlacement(topPx, ToolbarSide)` decides the anchor: BELOW the selected element when the toolbar
fits beneath it, otherwise ABOVE, clamped into the canvas (boundary-exact, degenerate-canvas safe).
The composer applies `imePadding` so the measured canvas already excludes the soft keyboard (the
keyboard-aware shift), and `StoryCanvasSurface` measures the selected element's half-height + the
toolbar height and offsets the floating `TextStyleToolbar` to the resolved Y. +9 placement tests; no
new strings. Surpasses iOS's fixed bottom style bar. See run log.)

(`story-text-element-styling` ✅ shipped 2026-06-29 — this run; **on-canvas text elements are now
styleable**. A pure `StoryTextStyle.typography()` mapping (the single source of truth for how each of
the five iOS faces renders) returns Compose-agnostic tokens — `StoryTextTypography`
(`fontWeight`/`italic`/`family`/`letterSpacingEm`/`glow`) over the new `StoryTextFontFamily` enum
(SANS/SERIF/MONOSPACE/CURSIVE) — so the canvas Composable stays glue and the rendering decision is
unit-tested in one place. Three one-line VM intents
`onTextElementStyle`/`onTextElementColor`/`onTextElementAlign` wrap `deck.updateTextElement` (inert on
unknown id, selection/editing untouched). `TextElementLayer` now renders weight/slant/family/tracking
+ a neon glow `Shadow`; a `TextStyleToolbar` (shown while editing an element) offers five style chips,
the L/C/R alignment toggle, and a colour-swatch row. +8 typography tests, +8 VM tests; +8 strings × 4
locales. See run log.)

(`story-text-elements` ✅ shipped 2026-06-29 — this run; **on-canvas text elements are real**. A pure
`StoryTextElement` (id/text/`StoryTextStyle`/hex colour/`StoryTextAlign`/normalised x,y) with the canvas
clamp in one place (`normalised`/`nudged`) + a `toTextObject(lang)` gateway-wire mapper. The deck mirrors
the media reducer per-slide (`addTextElementToSelected`/`removeTextElement`/`updateTextElement`/
`moveTextElement`, ≤5/slide cap, `selectedRemainingTextSlots`, `isWithinTextElementLimit`); a
text-element-only slide now publishes. `StoryComposerDraft.toCreateStoryRequest` serialises publishable
elements into `storyEffects.textObjects` (blanks dropped). The VM adds add/select/deselect/move/remove
intents and routes the single text field to the selected element **or** the slide caption
(`editorText`/`isEditingTextElement`); switching slides ends element editing. `StoryCanvasSurface` renders
each element centred-at-fraction, draggable/tappable/removable, with a background tap to deselect. +41
tests (10 element, 16 deck, 5 draft, 10 VM). See run log.)

(`story-canvas-transform` ✅ shipped 2026-06-29 — this run; **the 9:16 canvas is now real with
pinch-zoom + drag-pan**. A pure per-slide `StoryCanvasTransform` (scale clamped 1–4×, offset clamped
to the scaled-content overflow) owns the gesture math: `apply(pan,zoom,canvasW,canvasH)` multiplies
scale by the gesture zoom then clamps translation to the **new** scale's bounds (pinch-out tightens +
re-clamps toward centre; a 0px canvas collapses the range without div-by-zero), and `clampedTo` re-clamps
on resize. The transform is part of the slide's identity (`StorySlide.transform`, carried by `duplicate`),
persisted via `StorySlideDeck.updateSelectedTransform`, driven by `StoryComposerViewModel.onCanvasTransform`,
and rendered by a glue `StoryCanvasSurface` (selected slide's first media as a 9:16 `graphicsLayer`
background under `detectTransformGestures`). +16 transform tests, +3 deck tests, +3 VM tests. See run log.)

(`story-slide-media` ✅ shipped 2026-06-29 — this run; **per-slide media**. Media now belongs to the
slide it was added to, not the whole story. The deck is the single source of truth
(`StorySlideDeck.addMediaToSelected`/`removeMedia`/`hasMedia`/`isWithinMediaLimit`/
`selectedRemainingMediaSlots`, ≤10 media **per slide**); `draft` mirrors the selected slide for media
exactly as it already does for text, so the single-slide path stays byte-identical and most existing
tests pass unchanged. `onMediaPicked` attaches to the selected slide (online ids or offline
placeholders), the preview shows only the selected slide's media
(`selectedSlideAttachments`/`selectedSlidePending`), publish emits one story **per publishable slide**
(text **or** media) carrying that slide's media and `dependsOn` only that slide's offline uploads, and
removing a slide reclaims its media (drops preview entries + cancels its durable rows). +13 deck tests,
+10 VM tests. See run log.)

(`slide-drag-reorder` ✅ shipped 2026-06-29 — this run; the deferred **drag-reorder gesture** from
the slide-deck loop. New pure `SlideReorderResolver.targetIndex` maps accumulated horizontal drag px
+ measured slot width to the clamped landing slot (sub-half-slot drift → no move; bounds-clamped;
div-by-zero/empty/out-of-range safe), and `SlideStrip` binds `detectHorizontalDragGestures` on each
chip to feed the already-tested `onMoveSlide`. +11 behavioural tests. See run log.)

(`story-composer-slide-deck` ✅ shipped 2026-06-29 — this run; the multi-slide model is now **real in
the composer**. `StoryComposerUiState.deck: StorySlideDeck`, the VM mints slide ids and exposes
`onAddSlide`/`onDuplicateSelectedSlide`/`onRemoveSlide`/`onMoveSlide`/`onSelectSlide` (editor bound to
the selected slide's text via pure `updateSelectedText`), publish stays **lossless** — one story per
non-blank slide in order (first carries whole-story media + deps), `canPublish` gates on the whole deck,
and `StoryComposerScreen` renders a `SlideStrip` mini-preview. Drag-reorder gesture deferred. See run log.)

(`story-composer-multi-pending` ✅ shipped 2026-06-28 — this run; the composer's offline staging is now
**multi-pending**: `StoryComposerUiState.pendingUploads: List<PendingMediaUpload>`, every transient-failed
pick (and each item of an offline batch) is durably queued + appended, `publish()` gates on **all**
placeholder cmids, per-tile remove cancels only that durable row, and the preview renders N "Offline"
tiles. Closes the multi-dependency chain end-to-end from the UI. See run log.)

(`outbox-multi-dependency` ✅ shipped 2026-06-28 — this run; the `dependsOn` gate now expresses a
**set** of prerequisites via the new pure `OutboxDependencyKey` (encode/decode/likePattern) +
`OutboxDependencies.verdictAll`. `OutboxMutation.dependsOn: Set<String>`, the drainer gates on all
and cascade-exhausts on any failure, `findDependents` is a `LIKE` membership query so a producer
grafts its id into a dependent waiting on several uploads, and `enqueuePublish` takes a `List<String>`.
The composer adopts the list contract but keeps single-pending UI — the multi-pending UX is the next
slice. See run log.)
(`outbox-flush-retry-on-blocked` ✅ shipped 2026-06-28 — this run; the `OutboxFlushWorker` now
reschedules (WorkManager `Result.retry()`) when any lane stopped on a **blocked dependency**, not
only a transient failure, via the new pure `OutboxFlushPlan.outcome(reports)` building block.
Closes the cross-pass gating gap so a dependent held early in a pass is auto-retried once its
prerequisite is delivered later in the same/next pass. See run log.)
(`media-upload-cancel` ✅ shipped 2026-06-28 — this run; removing the offline placeholder now
`MediaUploadQueue.cancel`s its durable `UPLOAD_MEDIA` row + blob (row discarded first, then
bytes; unknown cmid inert), closing the orphan-leak gap left by `story-composer-offline-media`.
UI clears optimistically; the durable cancel is best-effort & cancellation-safe. See run log.)
(`story-composer-offline-media` ✅ shipped 2026-06-28 — this run; the composer's offline
fallback: a single transient-failed media pick is durably queued + staged as a pending
placeholder, and `publish()` gates the story on it via `enqueuePublish(.., dependsOn)`. The
durable offline upload→publish chain is now reachable from the UI. See run log.)
(`media-upload-sender` ✅ shipped 2026-06-28 — this run; the rest of the producer half
at the SDK layer — `OutboxKind.UPLOAD_MEDIA`, the pure `MediaUploadSender` outcome map,
the `MediaUploadQueue.enqueue` building block, and the `OutboxFlushWorker` `MEDIA`-lane
sender drained before `STORY` with blob cleanup on delivery / exhaustion. The durable
offline upload→publish chain now works end-to-end at the SDK layer. See run log.)
(`media-blob-store` ✅ shipped 2026-06-28 — see run log; the durable file-bytes store,
first brick of the producer half.)
(`outbox-produced-id-writeback` ✅ shipped 2026-06-27 — this run; a prerequisite's
`SendResult.SuccessWithId(producedId)` now grafts the real id into every still-queued
dependent's payload (placeholder = the prerequisite cmid) before the gate opens, via
the pure `PublishMediaWriteBack.graft` + the generic `OutboxRepository.rewriteDependents`.
The second half of the durable upload→publish chain. See run log.)
(`outbox-dependency-gating` ✅ shipped 2026-06-27 — this run; the drainer now
honours the persisted `dependsOn` cmid: a dependent holds its lane while the
prerequisite is queued, runs once it succeeds, cascade-exhausts if it gives up.
The durable upload→publish chain primitive. See run log.)
(`story-composer-multipick` ✅ shipped 2026-06-27 — this run; the Add button now
routes to the multi-item system picker, with a pure single/multi/none decision so
the multi-picker's `maxItems > 1` requirement never throws. See run log.)
(`story-composer-media-cap` ✅ shipped 2026-06-27 — see run log; enforced the iOS
≤10 media cap end-to-end. See run log.)
(`story-composer-media` ✅ shipped 2026-06-27 — PR #979 squash-merged this run
after confirming the sole red CI job (`Test gateway`) is a pre-existing
duplicate-`jwt`-import breakage on `main` itself, with zero gateway files in the
`apps/android`-only diff. See run log.)
(`media-upload-api` ✅ shipped 2026-06-27 — see run log; upload foundation.)
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

### 2026-07-03 — slice `call-ended-signal-identity` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (only open PR #1410 was iOS,
  untouched). Branched `claude/apps/android/call-ended-signal-identity` off latest `origin/main`
  (`6de9912e`).
- **What:** drove the `CallWaitingEvent.RemotelyEnded` reducer branch (already the tested SSOT, shipped
  with `call-waiting-banner`) from a real socket signal — a call-waiting banner now auto-dismisses when
  its caller hangs up (or its ring times out) before the user acts, parity with iOS
  `clearPendingIncomingCall(ifMatching:)`.
- **Added (production, 3 files, +50 lines):**
  - `CallSignalMapper.endedCallId(eventName, rawJson): String?` (`core:model`, pure/total) — decodes the
    `callId` from a `call:ended`/`call:missed` frame; a non-teardown event, a blank/absent id, or malformed
    JSON all yield `null`. Mirrors the existing `incomingOffer` identity decode; `map` left untouched so no
    existing mapper contract changes.
  - `CallSignalManager.endedCalls: SharedFlow<String>` (`sdk-core`) — republishes the ended id for every
    teardown frame in `listen`, the same parallel-stream pattern as `incomingOffers` (hot, no replay). The
    identity-less `events` emission is unchanged (existing manager tests intact).
  - `CallViewModel.onRemoteEnded(endedCallId)` (`feature:calls`) — collected in `viewModelScope`; folds a
    match on the *pending* call's id into `CallWaitingEvent.RemotelyEnded` (stop the auto-reject timer +
    clear the banner) with **no** `emitEnd` (the caller already ended it); inert when there is no pending
    banner or the id is another call's, so the active call is never disturbed.
- **Tests (+15, red→green):**
  - `CallSignalMapperTest` +7 — ended→id, missed→id, non-teardown→null, initiated→null, blank id→null,
    absent id→null, malformed JSON→null.
  - `CallSignalManagerTest` +4 — ended frame republishes id, missed frame republishes id, non-teardown
    emits nothing, blank id emits nothing.
  - `CallViewModelTest` +4 — waiting caller hangs up → banner cleared, **no** `emitEnd`, active call
    untouched (still `INCOMING`); ended id ≠ waiting id → banner stays; ended id with no banner → inert;
    a remotely-ended waiting call cancels its auto-dismiss timer (a later timer fire does not `emitEnd`).
- **Edge cases covered:** blank/absent/malformed teardown payload; non-teardown frame; no pending banner
  (inert); id mismatch (active-call id, unknown id) leaves banner up; timer cancellation after a remote
  end (no double-resolve → no spurious `emitEnd`); remote end distinguished from user reject (no wire emit).
- **Verify:** system `gradle assembleDebug testDebugUnitTest` (wrapper dist download is 403-blocked in this
  container; `/opt/gradle` 8.11.1 matches the wrapper version) → **BUILD SUCCESSFUL in 2m30s** (full
  assemble + all module JVM unit tests). Targeted: `:core:model` 32/`:sdk-core` (CallSignalManagerTest 36)
  /`:feature:calls` (CallViewModelTest 72) — 0 failures, 0 errors.
- **Reviewer:** PASS — scope `apps/android` only (3 prod + 3 test, +184 lines); behavioural tests through
  the public API (`endedCallId` return, `endedCalls` flow emission, VM `waitingBanner` + `emitEnd`
  verification), no tautologies, no coverage floor lowered, no existing test weakened; SDK purity (the
  identity decode + republish are building blocks in `core:model`/`sdk-core`; the "when a teardown dismisses
  *this* banner" product rule lives in `:feature:calls`); single source of truth (the `CallWaitingReducer`
  `RemotelyEnded` branch); UDF + immutable `UiState`, pure reducer; no dead end (banner dismiss returns to a
  coherent active call). **Known follow-up (logged in Next):** the identity-less `events` fold still routes a
  *waiting* call's `call:ended` into the *active* FSM — an identity-aware active-call teardown is the next
  Calls slice.

### 2026-07-03 — slice `call-waiting-banner` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The three open PRs at start
  (#1399 iOS-a11y `CameraView`, #1400 gateway/security notification routes, #1401 web/gateway calls
  rate-limit) are `jcnm` continuous-improvement branches from other sessions — all disjoint from
  `apps/android`, left untouched. Branched `claude/apps/android/call-waiting-banner` off freshly-fetched
  `origin/main` (`9d30066c`).
- **Gap closed:** `feature-parity §H` "Next pure core #2" — a second incoming call arriving while a call
  is active. iOS surfaces a `CallWaitingBannerView` (accept-and-swap / reject-busy / 15s
  auto-dismiss-as-reject) driven by `CallManager.pendingIncomingCall`; Android had no equivalent — a
  second offer while busy was silently dropped (the FSM-facing `events` stream discards caller identity,
  so `ReceiveIncoming` while `Connected` was inert).
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `CallWaiting.kt` — `WaitingCall(callId, callerId, callerName, isVideo)` + the pure
    `from(CallInitiatedPayload)` builder (blank-id → null; four-tier name resolution display→username→userId
    →`WAITING_CALL_FALLBACK_NAME`, skipping blank candidates, parity with `CallRecord.displayName`;
    `type=="video"` → isVideo). `CallWaitingReducer.kt` — `CallWaitingState(pending?)` + total
    `reduce(state, event)` over `Offered`(newest-wins) / `Rejected` / `Accepted` / `RemotelyEnded(callId)`
    (clears iff the id matches; inert otherwise or with no pending). `CallSignalMapper.incomingOffer(raw)`
    — the pure identity decode parallel to `map()`.
  - `:sdk-core` `CallSignalManager.incomingOffers: SharedFlow<WaitingCall>` — the same `call:initiated`
    listener now also republishes the decoded caller identity (hot, no replay, like `events`).
  - `:feature:calls` `CallViewModel` folds `incomingOffers`: `onIncomingOffer` routes a *second* offer
    (`CallState.isActive` && different callId) to the reducer and arms the auto-dismiss timer;
    `rejectWaiting()` emits `call:end` keyed by the **waiting** id (active call untouched) + clears;
    `acceptWaitingSwap()` hangs up the active call, settles, and `start()`s the waiting call as a fresh
    incoming (parity with iOS re-report). `CallWaitingTimer` seam (mirrors `CallSecondsTicker`) emits once
    after 15s → reject-if-still-pending. `CallPresenter` derives `CallUiState.waitingBanner: WaitingBannerUi?`.
    `CallScreen` renders an accent-coherent top banner (error-hue reject + peer-accent answer, a11y labels,
    FR/ES/PT/EN strings).
  - **+35 behavioural tests:** 16 `CallWaitingTest` (builder incl. every name-resolution arm + blank-id +
    media flag; state derivation; every reducer arm incl. newest-wins, match/mismatch/no-pending
    `RemotelyEnded`), +3 `CallSignalMapperTest` (`incomingOffer` decode/null/malformed), +3
    `CallSignalManagerTest` (offer republish, malformed no-emit, non-initiated no-emit), +11
    `CallViewModelTest` (raise banner while active; idle no-banner; redelivery ignored; newest-wins; reject
    ends waiting id only; reject inert with none; 15s auto-dismiss = reject; accept-swap ends current +
    re-presents + joins new room; accept inert with none; fresh start clears stale banner), +2
    `CallPresenterTest` (empty → null, pending → banner).
- **Verification:** `gradle :core:model:testDebugUnitTest :sdk-core:testDebugUnitTest` then
  `gradle :feature:calls:testDebugUnitTest`, then full `gradle assembleDebug testDebugUnitTest` →
  **BUILD SUCCESSFUL** (APK assembles, all module unit tests green). System Gradle 8.14.3 online through
  the agent proxy — see NOTES.md (the `./gradlew` wrapper's distribution host is egress-blocked 403; the
  cached wrapper dist is a 0-byte `.part`, so use the system `gradle` binary online, NOT `--offline`).
- **Reviewer gate:** PASS — diff is `apps/android` only (17 files: 3 new + 6 modified code, 4 strings, 4
  test files), no production logic outside `apps/android`, TDD behavioural (no tautologies, no floor
  lowered, no test weakened), edge cases covered (blank id, no-initiator fallback, redelivery, newest-wins,
  no-pending inert, cancellation-safe self-completing timer job), SDK purity respected (pure SSOT in
  `:core:model`, transport-only flow in `:sdk-core`, orchestration in `:feature:calls`), accent-coherent
  banner + natural top-overlay gesture, single source of truth (`DynamicColorGenerator` accent, reducer
  the sole banner authority). No secrets, `local.properties` gitignored.
- **Known follow-up (documented, not an orphan):** the `RemotelyEnded` reducer arm is the tested SSOT but
  is not yet socket-driven — `events` maps `call:ended`/`call:missed` identity-less, so a banner whose
  caller hangs up before the user acts currently clears only via reject/accept/15s-timeout. A small
  signalling-identity slice (surface the ended `callId`) wires the last arm. See "Next pure core #2".

### 2026-07-03 — slice `call-webrtc-plumbing-emits` ✅ shipped
- **Step 0 (housekeeping):** the prior Android iteration's PR **#1387 (`call-video-survival-policy`) was
  already squash-merged to `main`** (`1c2bb259`, verified `VideoSurvivalPolicy.kt` present on
  `origin/main`). No open Android PR from a prior iteration. The one open PR (#1392) is a `jcnm`
  iOS-a11y branch from another session — disjoint from `apps/android`, left untouched. Branched
  `claude/apps/android/call-webrtc-plumbing-emits` off freshly-fetched `origin/main` (verified the recent
  `VideoSurvivalPolicy.kt` symbol is present on the fresh checkout before coding).
- **Gap closed:** the call-domain outbound emit table stopped at the lifecycle frames
  (`join`/`leave`/`end`/`toggle-audio`/`toggle-video`/`signal`/`initiate`). iOS also emits five
  WebRTC-plumbing frames the gateway needs for liveness, TURN refresh, quality persistence, and reconnect
  bookkeeping (`MessageSocketManager.emitRequestIceServers`/`emitCallHeartbeat`/`emitCallQualityReport`/
  `emitCallReconnecting`/`emitCallReconnected`). Android had none of them — feature-parity §H flagged this
  as the last outbound-signalling gap. This slice ports the emits with the branch-rich `stats` builder as a
  pure, JVM-tested core.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `CallQuality.kt` gains `ConnectionQuality.wireValue` (`excellent|good|fair|poor`, spelled
    out so an enum rename can't silently change the wire token) and the new `CallQualityReport` data class
    with the total pure `statsFields(): Map<String, Any>` — the SSOT for the `call:quality-report` `stats`
    sub-object. Base five metrics (`level`/`rtt`/`packetLoss`/`bytesSent`/`bytesReceived`) always present;
    `availableOutgoingBitrateBps` and `jitterMs` appended **only when strictly positive** (iOS parity — a
    not-yet-available `0` or degenerate negative is dropped so the gateway never persists a meaningless
    value). Byte counters are `Long` (iOS uses a 64-bit `Int`) so a long video call whose cumulative totals
    exceed the 32-bit range are reported faithfully instead of overflowing.
  - `:sdk-core` `CallSignalManager` gains `emitRequestIceServers(callId)`, `emitHeartbeat(callId)`,
    `emitQualityReport(callId, report)` (wraps `report.statsFields()` in `{callId, stats}`),
    `emitReconnecting(callId, participantId, attempt)`, `emitReconnected(callId, participantId)` — all at
    iOS-exact event names + payload keys. The manager owns only the transport; the `stats` decision lives
    once in the pure builder.
  - **+16 behavioural tests:** 10 `CallQualityReportTest` (base keys/values, every `ConnectionQuality`
    tier → wire level, bitrate present/absent across the `0`/negative/positive boundary, jitter likewise,
    both-optionals ordering `inOrder`, `Long` counters beyond `Int.MAX`) + 6 `CallSignalManagerTest`
    (request-ice-servers/heartbeat callId payloads, quality-report nested stats with & without the
    optionals, reconnecting callId/participantId/attempt, reconnected callId/participantId). Every branch
    of `statsFields()` is exercised.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest :sdk-core:testDebugUnitTest`
  → **BUILD SUCCESSFUL** (CallQualityReportTest 10/10, CallSignalManagerTest 29/29, 0 skipped/failed);
  full-project `assembleDebug` green. System Gradle 8.14.3 (`--no-daemon`) per NOTES.md.
- **Reviewer gate:** PASS — diff is `apps/android` only (3 code files + docs), no production logic
  outside `apps/android`, TDD behavioural (no tautologies, no floor lowered), SDK purity respected (pure
  payload SSOT in `:core:model`, transport-only emits in `:sdk-core`), near-total branch coverage on the
  new pure logic, iOS payload-key parity. No secrets, `local.properties` gitignored.

### 2026-07-03 — slice `call-video-survival-policy` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The three open PRs
  (#1384 iOS-a11y, #1385 web-realtime, #1386 gateway/shared) are `jcnm` continuous-improvement
  branches from other sessions — disjoint from `apps/android`, left untouched. Branched
  `claude/apps/android/call-video-survival-policy` off freshly-fetched `origin/main` (`80dab7b4`).
- **Gap closed:** the adaptive-quality story stopped at the tier ladder (`VideoQualityLevel`, slice
  `call-quality-level`). iOS layers a **last-resort** survival controller on top of the bitrate ladder
  (`VideoSurvivalController.swift`): when the link stays degraded past the `POOR`/`CRITICAL` floor long
  enough, it drops outbound video so the call lives on as audio-only, then restores video once the link
  clearly recovers. Android had the ladder but not this graceful-degradation layer. This slice ports the
  **pure policy half** (`VideoSurvivalPolicy`, the exhaustively-testable decision core); the async
  actuator/controller (renegotiation, transition-timeout, one-in-flight guard) is deliberately deferred
  to the app-side WebRTC seam — SDK purity.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `VideoSurvivalPolicy.kt` — `VideoSurvivalAction` (`None`/`Suspend`/`Resume`), the
    fixed-size `VideoSurvivalState(isSending, degradedSince, recoveringSince)` (+ `INITIAL`), the
    `VideoSurvivalDecision(state, action)` return, and the total pure
    `VideoSurvivalPolicy.reduce(state, level, nowSeconds, userWantsVideo)`. Faithful port of the iOS
    `reduce`: **duration-based** hysteresis (thresholds are wall-clock seconds fed a **monotonic** clock,
    not sample counts → independent of monitor cadence and immune to clock jumps over a multi-hour call);
    `Suspend` after a sustained ≥6 s `POOR`/`CRITICAL` streak while sending, `Resume` after a sustained
    ≥10 s `EXCELLENT`/`GOOD` streak while suspended (resume window longer on purpose — renegotiation is
    expensive, avoid oscillation); `FAIR` **holds** the recovery timer (a brief mid-recovery dip doesn't
    restart the window) while a degraded dip wipes it; a good/fair sample while sending clears the degraded
    streak; `userWantsVideo=false` resets to `INITIAL` so survival never re-enables video against intent.
  - `CallQualityThresholds` gains `VIDEO_SURVIVAL_SUSPEND_AFTER_SECONDS = 6.0` /
    `VIDEO_SURVIVAL_RESUME_AFTER_SECONDS = 10.0` at iOS `QualityThresholds` parity (the policy's default
    ctor args, so the tuning lives in one SSOT next to the tier thresholds).
  - **+19 behavioural tests** (`VideoSurvivalPolicyTest`): the intent gate; opening/holding/tripping the
    degraded streak (boundary `now-since == 6.0` suspends, `5.9` doesn't); `CRITICAL` counts as degraded;
    good/fair clearing the streak while sending; opening/holding/tripping the recovery streak (boundary
    `10.0` resumes); degraded-while-suspended wipe vs `FAIR`-hold (asserted `isSameInstanceAs` — state
    held verbatim); transient good/fair/degraded dips (window reset vs held); a full sustained
    degraded→recovered lifecycle suspending then resuming exactly once each; and the default-ctor 6 s/10 s
    thresholds. Every branch of `reduce` is exercised.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest` → 19/19 green + full module
  suite green; `:core:model:assembleDebug` green. (`meeshy.sh check`/`./gradlew` unusable — the pinned
  wrapper distro 403s through the egress proxy; system Gradle 8.14.3 at `/opt/gradle` is the local gate,
  per NOTES.)
- **Reviewer gate:** PASS — diff is `apps/android` only (2 `core:model` files + docs), pure stateless
  building block (SDK purity: the async controller stays app-side), no tautological tests, near-total
  branch coverage, monotonic/O(1) design faithful to iOS. No production logic outside `apps/android`.

### 2026-07-03 — slice `call-quality-level` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1367–#1379)
  are `jcnm` web/ios/gateway branches from other sessions — disjoint from `apps/android`, left
  untouched. Branched `claude/apps/android/call-quality-level` off freshly-fetched `origin/main`
  (`4a69ef0`).
- **Gap closed:** the call had no notion of link quality — no connection-quality indicator, no tier
  model for the future adaptive-bitrate ladder. iOS has `VideoQualityLevel` + `QualityThresholds`
  (`WebRTCTypes.swift`) classifying live stats into a 5-tier ladder and `connectionQualityLabel`
  collapsing it to the 4-tier indicator; Android had nothing.
- **What shipped (thin vertical slice, TDD red→green, same shape as `call-duration-timer`):**
  - `:core:model` `CallQuality.kt` — the pure classification SSOT. `CallQualityThresholds` (the iOS
    `QualityThresholds` constants), `VideoQualityLevel` (`CRITICAL<POOR<FAIR<GOOD<EXCELLENT`) with
    per-tier sender caps (`targetResolutionHeight`/`targetFps`/`targetVideoBitrateBps`) + two total
    classifiers `from(rttMs, packetLoss)` (worse-of-two-axes, **strict `>`** so a value exactly on a
    threshold stays in the better tier — iOS parity) and `from(availableOutgoingBitrateBps)`;
    `CallQualitySample(rttMs, packetLoss).level()`; and the four-tier `ConnectionQuality`
    (`from(VideoQualityLevel)` collapsing `CRITICAL→POOR`, `bars` 1–4, `isWeak`). **24 tests** (every
    boundary of both classifiers pinned on both sides, all tier accessors, ordering, collapse/bars/weak).
  - `:feature:calls` `CallQualitySampler` — the input seam (interface `samples: Flow<CallQualitySample>`)
    with an interim `NoopCallQualitySampler` (`emptyFlow`, so the indicator stays hidden until the
    WebRTC stats collector swaps the `@Binds`) + Hilt module. Framework glue → exempt from JVM coverage.
  - `CallViewModel` folds the sampler stream **only while media flows** (a `qualityJob` started/stopped
    in `syncQuality` exactly like the ticker's `syncTicker`): each sample → `ConnectionQuality`, cleared
    to `null` on leaving connected/reconnecting and on a fresh `start`. `CallPresenter` projects
    `CallUiState.connectionQuality`, suppressing any stale reading off the connected/reconnecting phases.
    **+6 VM-fold tests** (no quality before connect, healthy→GOOD, critical→POOR collapse, updates through
    a reconnect, cleared on end, cleared on a new call) + **+3 presenter tests**. CallViewModelTest 51→57,
    CallPresenterTest 25→28.
  - `CallScreen` renders an accent-coherent 4-bar signal indicator under the status label when
    `connectionQuality != null` (bars fill to `bars`, tinted the peer accent or the error hue on a weak
    link, one VoiceOver tier label; +4 strings × 4 locales).
- **Verification:** `/opt/gradle/bin/gradle assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (all
  modules; CallQualityTest 24/24, CallViewModelTest 57/57, CallPresenterTest 28/28). System Gradle
  8.14.3 per NOTES.md.
- **Reviewer verdict:** **PASS** — diff is `apps/android` only (12 files), no production logic, TDD
  behavioural (no tautologies, no floor lowered), SDK purity respected (pure classification in
  `:core:model`, seam/glue/fold in `:feature:calls`), UDF preserved, cancellation-safe (qualityJob in
  `viewModelScope`, structured cancel), accent-coherent indicator with no dead-end.

### 2026-07-03 — slice `call-telecom-state-plan` ✅ shipped
- **Step 0 (housekeeping):** the prior Android iteration's PR **#1375 (`call-sound-policy`) was still
  open** — rebased it clean on the latest `origin/main` (no `apps/android` file overlap since its base),
  pushed, waited for all 14 CI jobs green, **squash-merged to `main`** (`26e2500`). The other open PRs
  (#1367–#1374, #1376) are `jcnm` web/ios/gateway branches — disjoint from `apps/android`, left untouched.
  Branched `claude/apps/android/call-telecom-state-plan` off the post-merge `origin/main` (`26e2500`) so
  the tree already carries the sound-policy fold this slice extends.
- **Gap closed:** the call lifecycle had no bridge to the **OS telecom layer** — no self-managed
  `ConnectionService`/`PhoneAccount` reporting (the Android analogue of the iOS `CXProvider.reportCall(...)`
  / `report(_:endedAt:)` calls the `CallManager` makes to CallKit). This slice ships the pure decision core
  that a future `ConnectionService` glue consumes, so the heavy platform integration is left decision-free.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `TelecomCallPolicy` — the pure, side-effect-free SSOT mapping call lifecycle → the OS
    telecom reports. `TelecomConnectionState` (`Dialing/Ringing/Active/Disconnected`) +
    `TelecomDisconnectCause` (`Local/Remote/Rejected/Missed/Error/Busy`) + `TelecomConnectionUpdate`.
    `connectionStateFor(state)` keys purely on `CallState` with no direction leak: outgoing ring/offering →
    `Dialing`, incoming ring → `Ringing`, **answered = `Active`** (`Connecting`/`Connected`/`Reconnecting`
    all collapse onto `Active`, so an ICE restart never tears the system call down), `Ended` →
    `Disconnected`, `Idle` → no connection. `disconnectCauseFor(reason)` maps every `CallEndReason`
    (lost/failed → `Error`). `plan(prev,next)` emits a report **only on a genuine transition** — it dedupes
    an already-active edge, a phantom `Idle→Ended` (no connection was ever created — mirrors
    `CallSoundPolicy`'s `prev.isActive` guard), an idempotent `Ended→Ended`, and a settle `Ended→Idle` all
    to `null`. **28 tests** (every arm of `connectionStateFor` incl. both ring directions, every
    `disconnectCauseFor`, every `plan` branch: creation / ring→active / dedupe×3 / all disconnect causes /
    phantom / idempotent / settle).
  - `:feature:calls` `TelecomCallReporter` — the output seam (interface), with a thin `LogTelecomCallReporter`
    interim glue (emits each transition to the system log so the seam is live end-to-end while the heavier
    self-managed `ConnectionService`/`PhoneAccount` registration — which will swap this `@Binds` — is built
    as its own glue slice), `@Binds` into a Hilt module (mirrors `CallToneModule`/`CallTickerModule`).
    Framework glue → exempt from JVM coverage per `TDD-COVERAGE.md`.
  - `CallViewModel.dispatch` folds each FSM edge through `TelecomCallPolicy.plan` — reporting only the
    genuine transitions the policy surfaces; `onCleared` releases the reporter alongside the tone controller.
    **7 VM-fold tests** via a recording fake reporter (outgoing→dialing, incoming→ringing, answered→active-
    once-with-dedupe, inert-no-report, decline→disconnected(rejected), hang-up→disconnected(local),
    failed-initiate→disconnected(error)). CallViewModelTest 44→51.
- **Verification:** `/opt/gradle/bin/gradle assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (all
  modules; TelecomCallPolicyTest 28/28, CallViewModelTest 51/51). System Gradle 8.14.3 fallback per NOTES.md.
- **Reviewer verdict:** **PASS** — diff is `apps/android` only (6 files), no production logic, TDD
  behavioural (no tautologies, no floor lowered), SDK purity respected (pure decision in `:core:model`,
  orchestration/glue in `:feature:calls`), UDF preserved, cancellation-safe (all pure).

### 2026-07-02 — slice `call-sound-policy` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1367–#1374) are
  `jcnm` branches from other sessions touching web/ios/gateway only — disjoint from `apps/android`, left
  untouched. Branched off freshly-fetched `origin/main` (`ad3c3b2`) as `claude/apps/android/call-sound-policy`.
  Confirmed the latest state (top-of-PROGRESS) was `call-duration-timer`; next Calls step per the routine is
  the Telecom/ringback area — carved a thin, fully-testable pure core out of it.
- **Gap closed:** the call screen was silent — no ringback for the caller, no ringtone for the callee, no
  connect/end cue. iOS has a `RingbackTonePlayer` ("the call sound manager") whose start/stop/cue calls are
  scattered across `CallManager`; Android had nothing.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `CallSoundPolicy` — the pure, side-effect-free SSOT collecting every iOS `RingbackTonePlayer`
    call site into one total function. `CallSound` (`None/Ringback/Ringtone`) + `CallCue` (`Connected/Ended`)
    + `CallSoundPlan`. `loopFor(state)` plays **ringback** across the whole pre-answer wait
    (`Ringing(outgoing)` + `Offering`, both outgoing-exclusive → no direction ambiguity) and stops it at the
    answer (`Connecting`) — tighter than iOS which drags it to `.connected` — and **ringtone** while
    `Ringing(incoming)`. `cueFor(prev,next)` fires `Connected` on every entry into `Connected` (first connect
    **and** reconnect-success) and `Ended` only when a *live* call ends (`prev.isActive`, iOS `if wasActive`),
    silent on `Idle→Ended`/`Ended→Ended`. `plan()` bundles both. **19 tests** (every branch of both maps + plan).
  - `:feature:calls` `CallToneController` — the output seam (interface), with a thin
    `AndroidCallToneController` glue impl (`ToneGenerator.TONE_SUP_RINGTONE` ringback + `RingtoneManager`
    ringtone + `TONE_PROP_ACK`/`TONE_PROP_PROMPT` cues, every entry `runCatching`-guarded), `@Binds` into a
    Hilt module (mirrors `CallTickerModule`). Framework glue → exempt from JVM coverage per `TDD-COVERAGE.md`.
  - `CallViewModel.dispatch` folds each FSM edge through `CallSoundPolicy.plan`: switches the loop **only on a
    genuine change** (an inert event never restarts the ringback — tracked via `activeLoop`) and fires the cue;
    `onCleared` releases. **9 VM-fold tests** via a recording fake controller (outgoing ringback→stop→connected
    cue, incoming ringtone→stop→connected cue, decline/hang-up ended cue, remote-hangup-after-connect, inert
    no-restart, reconnect re-cues). CallViewModelTest 35→44.
- **Verification:** `/opt/gradle/bin/gradle assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (all
  modules; CallSoundPolicyTest 19/19, CallViewModelTest 44/44). See NOTES.md for the Gradle-8.14.3 fallback.
- **Reviewer verdict:** **PASS** — diff is `apps/android` only (5 files, +456/−2), no production logic, TDD
  behavioural (no tautologies, no floor lowered), SDK purity respected (pure decision in `:core:model`,
  orchestration/glue in `:feature:calls`), UDF preserved, cancellation-safe (all pure/`runCatching`).

### 2026-07-02 — slice `call-duration-timer` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1366–#1369) are
  `jcnm` branches from other sessions touching web/ios/gateway only — disjoint from `apps/android`, left
  untouched. Branched off freshly-fetched `origin/main` (`dc8f37a4`) as
  `claude/apps/android/call-duration-timer`. Confirmed HEAD's `apps/android` matched `origin/main` (all prior
  Android work merged; `CallViewModel.kt`/`CallPresenter` verified before coding).
- **Gap closed:** the connected call screen showed a static "Connecté" label with **no call timer** —
  iOS shows a live in-call duration. The connected/ended screens had nothing to show elapsed time.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `CallDuration.clock(seconds: Long)` — the pure SSOT for call-length formatting
    (`M:SS`, widening to `H:MM:SS` past an hour; `"0:00"` at zero; negatives clamped). `CallRecord.durationLabel`
    was refactored to reuse it (dropping its private `pad2`), so a completed call and its journal row read
    identically. **6 tests.**
  - `:feature:calls` `CallPresenter` gains a derived `CallUiState.durationLabel`: `"0:00"` the instant the
    call connects, the running clock through connected/reconnecting, the **final length frozen** on the ended
    screen **iff** the call actually connected (`elapsedSeconds > 0`), and `null` before connect / for a
    missed/declined/failed call that never connected. **5 tests** (every arm).
  - `CallViewModel` runs a 1-Hz timer while media is (or is being re-)established, resetting the elapsed
    count on a new call and freezing it on end. The tick source is an **injected `CallSecondsTicker` flow
    seam** (`@Binds RealCallSecondsTicker`, a `flow { while(true){ delay(1000); emit } }`), so the
    elapsed-count logic is driven deterministically in tests via plain `emit(Unit)` — and, crucially, avoids
    a self-rescheduling `delay` loop that hangs `runTest` (see NOTES). **7 tests.**
  - `CallScreen` renders the running clock as the connected-status subtitle and appends the final length to
    the ended label — thin glue, no decision in the Composable.
- **Reviewer gate: PASS.** Scope `apps/android` only (6 files changed, 3 new; all under `apps/android`);
  behavioural tests through the public API (VM `StateFlow`, presenter output, `CallDuration.clock`); no
  tautologies; no floor lowered; SDK purity respected (pure formatter SSOT in `:core:model`, product
  orchestration in `:feature:calls`); ticker cancellation-safe (`viewModelScope`, `collect` cancelled on
  `stopTicker`). Edge cases covered: zero/negative/hour boundary, never-connected (inert), reset on new call,
  freeze-and-stop on end, reconnect continuation.
- **Verification:** `assembleDebug` + `testDebugUnitTest` → **BUILD SUCCESSFUL** (system Gradle 8.14.3
  `--no-daemon`; wrapper still 403s). CallViewModelTest 35, CallPresenterTest 25, CallDurationTest 6,
  CallRecordTest 22 — all green, 0 failures. **+18 new behavioural tests.**
- **Next:** the heavier WebRTC media transport (`stream-webrtc-android`) + `ConnectionService`/Telecom
  system call UI + ringback tone (glue-heavy — push every testable decision into pure helpers/the VM).
  Follow-up still open: `SocketManager.reconnectWithToken()` has no caller (a token-refresh re-attach slice —
  deferred until a token-rotation trigger exists, else it would be orphan code).

### 2026-07-02 — slice `incoming-call-deeplink` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The two open PRs (#1360 iOS a11y,
  #1359 gateway cache refactor) are `jcnm` branches from other sessions, disjoint from `apps/android`;
  left untouched. Branch was in sync with `origin/main` (0/0). Branched off freshly-fetched `origin/main`
  (`7527881e`) as `claude/apps/android/incoming-call-deeplink`. Confirmed HEAD's `apps/android` matches
  `origin/main` (all prior Android work merged; `MainActivity.kt`/`CallRoute.kt` verified before coding).
- **Gap closed:** the prior slice fired a full-screen call notification whose `PendingIntent` set
  `callId`/`conversationId`/`callerName`/`isVideo` extras on `MainActivity` — but `MainActivity.onCreate`
  just called `MeeshyApp()` and dropped them. A ring tap (and the older message-notification tap, which
  set a `conversationId` extra) opened the app on the start destination, never the call / chat. This slice
  wires the extras through a pure decoder into a NavHost deep-link.
- **Design:**
  - `:app` `me.meeshy.app.navigation.LaunchRouter.route(LaunchExtras) → String?` — the pure SSOT: a
    non-blank `callId` wins → `CallRoute.incoming(...)` (ring is the urgent intent); else a non-blank
    `conversationId` → `Routes.chat(...)` (shared message-tap path); else `null`. `LaunchExtras` is the
    plain data holder `MainActivity` fills from the intent (keys mirror `MeeshyFcmService`'s `EXTRA_*`).
  - `CallRoute` **refactored** from `call/{conversationId}/{peerName}/{video}` (path args) to a static
    `call` path + all-optional query args (`conversationId`/`peerName`/`video`/`callId`/`incoming`). A
    path arg must be non-empty (Compose Navigation regex `[^/]+`), so a blank room / peer name would
    collapse the segment and make `navigate()` throw. Query args default cleanly → blank is safe. Added
    `incoming(callId, conversationId, callerName, isVideo)` (server `callId`, `incoming=true`) and extended
    `config(...)` with `callId`/`incoming` → `isOutgoing = !incoming`, adopting the server id so the ring
    is answerable. Outgoing `path`/`redial`/`config` behaviour preserved.
  - `:app` glue (exempt): `MeeshyApp(launchRoute, onLaunchRouteConsumed)` navigates via a `LaunchedEffect`
    keyed on `(launchRoute, isAuthenticated)` — only once the graph is live **and** authenticated (an
    unauthenticated cold launch defers across the login gate), then calls `onLaunchRouteConsumed` so a
    recomposition never re-navigates; the CALL composable's 5 query navArguments + decode. `MainActivity`
    holds a `mutableStateOf` route, computes it via `LaunchRouter` in `onCreate` + `onNewIntent`, and a
    private `Intent.launchExtras()` extension pulls the `MeeshyFcmService.EXTRA_*` extras.
- **Tests:** +14 behavioural through the public API only. `LaunchRouterTest` (8): call push → incoming
  config (server id + `isOutgoing=false`, video/room threaded); call wins over a conversation id;
  reserved-char caller name round-trips; call push with no room still rings (blank room, id kept); bare
  conversation id → `Routes.chat`; blank `callId` falls through to the chat; empty extras / both blank →
  `null`. `CallRouteTest` (+6): `config` adopts an incoming `callId` + flips direction; null incoming
  `callId` → blank; `path` round-trips reserved chars via query; `path` stays a single static `call`
  segment on a blank room; `incoming` threads/encodes/blank-room variants. Reworked the pattern + redial
  assertions to decode the query route (same behaviours, new encoding — not weakened). No tautologies.
- **Verification:** `gradle assembleDebug testDebugUnitTest` (== `meeshy.sh check`) — **BUILD SUCCESSFUL**
  via system Gradle 8.14.3 (wrapper 8.11.1 still 403s on the GitHub-hosted distribution — see NOTES).
  Full suite green; navigation suite `me.meeshy.app.navigation.*` green in isolation too.
- **Reviewer gate:** PASS — diff `apps/android` only (6 files: `LaunchRouter.kt` prod + `LaunchRouterTest`,
  `CallRoute.kt`/`MeeshyApp.kt`/`MainActivity.kt` glue+route, `CallRouteTest` extended). SDK purity (pure
  router + route SSOT in `:app` navigation, no `:sdk-*` change); single source of truth (one route object,
  one launch decoder — no re-implementation); UX coherence (call push prioritised, accent-coherent screen
  reused, dismissal returns via `popBackStack`); failure paths (blank room / malformed extras → inert, no
  crash). Behaviour through public API; the only async is the guarded `LaunchedEffect` (idempotent via the
  consumed flag). **Next:** `ConnectionService`/Telecom + ringback tone, then WebRTC media transport.

### 2026-07-02 — slice `fcm-call-push-route` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1346 iOS a11y,
  #1350–#1353 gateway/web/iOS) are `jcnm` branches from other sessions, disjoint from `apps/android`;
  left untouched. Branched off freshly-fetched `origin/main` (`cdf00714`) as
  `claude/apps/android/fcm-call-push-route`. Confirmed HEAD's `apps/android` byte-identical to
  `origin/main` (all prior Android work merged; verified `IncomingCallPush.kt` present before coding).
- **Gap closed:** the prior slice landed the pure decision bricks but `MeeshyFcmService.onMessageReceived`
  still ignored them — a data-only call push was silently dropped, only a `message.notification` display
  push was handled. This slice wires the bricks into the service via a single pure router + a stateful
  live-ring holder, then fires the full-screen call notification.
- **Design:**
  - `core:model` `IncomingCallPushRoute` (`NotACallPush` | `Ring(push, updatedSeen)` | `Suppress(reason)`)
    + pure `IncomingCallPushRouter.route(data, context)` — folds `IncomingCallPushParser.parse` →
    `IncomingCallDecider.decide` → (on `Ring` only) `SeenCallRing.insert`, returning the advanced ring so
    the caller just adopts it. Total, side-effect-free; a `Suppress`/`NotACall` never advances the ring.
  - `:app` `@Singleton IncomingCallRingStore` — the sole owner of the live `SeenCallRing`; `route(data,
    nowMillis, activeCallId?, selfUserId?)` threads its ring through the router and persists `updatedSeen`
    **only** on `Ring`; `forget(callId)` for a refused/torn-down ring. Synchronized (FCM deliveries +
    teardown may hit different threads).
  - `:app` glue (exempt): `MeeshyFcmService` injects the store + `SessionRepository` (self-user id →
    self-fanout guard), routes each push by kind — `Ring` → full-screen CATEGORY_CALL / `PRIORITY_MAX`
    notification on a new `meeshy_calls` channel (`setFullScreenIntent` → `MainActivity` + call extras),
    `Suppress` → silent drop (logged), `NotACallPush` → the existing message path (outbox flush + rich
    notification). Removed a pre-existing unused `OneTimeWorkRequestBuilder` import.
- **Tests:** +19 behavioural through the public API only. `IncomingCallPushRouterTest` (11): non-call/
  typeless/blank-callId → `NotACallPush`; `voip_call` routes like `call`; fresh idle → `Ring` with the
  parsed push (video/conversationId threaded) + id recorded in `updatedSeen`; replay with the advanced
  ring → `Suppress(DUPLICATE)`; self/busy/active-dup → the right `Suppress` reason; a busy `Suppress`
  does **not** record the id (rings once the active call frees). `IncomingCallRingStoreTest` (8): fresh
  rings; retry deduped; different id still rings; past-ttl re-delivery rings; self-suppress never poisons
  the ring; non-call leaves the ring untouched; `forget` re-opens a ring; busy-suppress rings once free.
  No tautologies, no floor lowered, no test weakened.
- **Verification:** `:core:model:testDebugUnitTest` (router 11/11) then `:app:testDebugUnitTest`
  (`IncomingCallRingStoreTest` 8/8, `CallRouteTest` unchanged) + `:app:assembleDebug` — both **BUILD
  SUCCESSFUL** via system Gradle 8.14.3 (`--no-daemon`; wrapper still 403s — see NOTES). No suite regressed.
- **Reviewer gate:** PASS — diff `apps/android` only (5 files: `IncomingCallPushRouter.kt` +
  `IncomingCallRingStore.kt` prod, 2 test files, `MeeshyFcmService.kt` glue). SDK purity respected (pure
  router in `:core:model`, stateful holder + platform glue in `:app`); single source of truth (reuses the
  parser/decider/ring, no re-implementation); UDF n/a (no VM); behaviour through public API; the only
  async is the synchronized store (cancellation n/a — no coroutines). **Next:** consume `MainActivity`
  call extras → NavHost deep-link into the incoming-call screen; `ConnectionService`/Telecom + ringtone;
  WebRTC media transport.

### 2026-07-02 — slice `incoming-call-push-decision` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1344 gateway
  call-resilience, #1346 iOS a11y) are `jcnm` branches from other sessions, disjoint from `apps/android`;
  left untouched. Branched off freshly-fetched `origin/main` (`0f6dc241`) as
  `claude/apps/android/incoming-call-push-decision`. Confirmed HEAD's `apps/android` is byte-identical to
  `origin/main` (all prior Android work merged).
- **Gap found while scoping:** `MeeshyFcmService.onMessageReceived` only handled a `message.notification`
  display push (reading solely `data["conversationId"]`); a **data-only incoming-call push is silently
  dropped** — no `type`/`callId` parse, no dedup, no ring. That's the first missing brick of parity
  item §H "Incoming-call delivery via FCM data push when backgrounded/killed (full-screen intent)". The
  iOS SSOT is `VoIPPushManager` (parse+phantom-guard) + `VoIPDedupRing` + `CallManager.reportIncomingVoIPCall`
  (busy gate).
- **Design (pure-decision-first, `core:model`):**
  - `IncomingCallPush` — typed FCM `data`-map / VoIP payload at parity with the gateway
    `CallEventsHandler` push (`type:"call"`) + `PushNotificationService.sendVoIPPush` (`type:"voip_call"`):
    `callId`/`conversationId`/`callerUserId`/`callerName`/`isVideo`(sent as string `"true"`/`"false"`)/
    `iceServers`(JSON string) + a blank-skipping `displayName` (`callerName` else the shared "Inconnu").
  - `IncomingCallPushParser.parse(Map<String,String>) → IncomingCallPush?` — total, side-effect-free;
    a call iff `type ∈ {call,voip_call}` AND non-blank `callId` (mirrors the iOS phantom-guard); leniently
    decodes `iceServers` via the existing `SocketIceServer` serializer, degrading a missing/blank/malformed
    value to `[]` rather than dropping the whole push; blank optionals → null; `isVideo` case-insensitive.
  - `SeenCallRing` — immutable pure port of `VoIPDedupRing` (default capacity 24 / ttl 30_000ms):
    `contains(id, now)` (freshness-bounded), `insert(id, now)` (prunes expired, refreshes a same-id window,
    trims oldest past capacity — every mutation returns a new ring), `remove(id)`.
  - `IncomingCallDecision` (`Ring(push)` | `Ignore(reason: DUPLICATE/BUSY/SELF_INITIATED)`) +
    `IncomingCallContext(nowMillis, activeCallId?, seen, selfUserId?)` + pure
    `IncomingCallDecider.decide` — ordering faithful to iOS: **self-fanout → duplicate (active-or-seen) →
    busy (different call active) → ring**. Recording on `Ring` is the caller's job (kept a total fn).
- **Tests:** +39 behavioural (18 `IncomingCallPushParserTest`, 11 `SeenCallRingTest`, 10
  `IncomingCallDeciderTest`) through the public API only — every `when`/`if` arm swept: both call types +
  non-call + no-type; callId absent/blank/valid; isVideo true/false/UPPER/missing/garbage; optionals
  blank/absent/present; iceServers valid/absent/blank/malformed; ring contains-fresh/expired/capacity-evict/
  prune-on-insert/refresh/remove-present-absent/immutability; decider ring/self/blank-self/other-caller/
  active-dup/seen-dup/expired-not-dup/busy/dup-vs-busy precedence. No tautologies, no floor lowered.
- **Verification:** `assembleDebug` + all `testDebugUnitTest` **BUILD SUCCESSFUL** via system Gradle 8.14.3
  (wrapper still 403s — see NOTES); `:core:model` new classes 39/39 green; no suite regressed.
- **Reviewer gate:** PASS — diff `apps/android` only (4 files, 1 prod + 3 test, all in `core:model`), pure
  building blocks correctly in `:core:model` (matches `CallSignalMapper`/`CallStateMachine`/`CallInitiateAckParser`),
  behaviour through public API, no unguarded async (all pure). **Next:** wire `MeeshyFcmService` to route a
  call-type data push through parser+decider and fire a full-screen `ConnectionService`/CATEGORY_CALL
  notification (Android-platform glue).

### 2026-07-02 — slice `calls-tab-nav` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration — the 4 open PRs (#1335, #1337–#1339)
  are gateway/iOS branches from other sessions (`jcnm`), disjoint from `apps/android`; left untouched.
  Branched off freshly-fetched `origin/main` (`c46f8d14`) as `claude/apps/android/calls-tab-nav`.
- **Gap found while scoping:** `CallHistoryScreen` (shipped in `call-history-list`) was **dead UI** — no
  route pointed at it, so the whole recent/missed-calls journal was reachable by nobody. This is the tracked
  "dedicated Calls tab" follow-up.
- **Design (pure-decision-first):**
  - `:app` `CallRoute.redial(record: CallRecord)` — the pure re-dial decision: threads the journal row's
    own `conversationId`, its already-resolved `displayName` (peer displayName → username → group title →
    fallback, owned by `CallRecord`), and its `isVideo` straight through the existing `path(...)` (so
    reserved chars in the name stay encoded). Re-dialling from history is now byte-identical to a call
    placed from the chat header — one SSOT, no re-derivation at the call site.
  - `MeeshyApp` glue: new `Routes.CALLS` tab (`Icons.*.Call`), added to `tabRoutes` and `rememberTabs`
    (order Messages · Feed · **Calls** · Activity · Profile — Calls central, WhatsApp-like); a
    `composable(Routes.CALLS)` mounts `CallHistoryScreen(onOpenCall = { navController.navigate(
    CallRoute.redial(it)) })`. New `tab_calls` string.
- **Tests:** +4 behavioural (`CallRouteTest`, Robolectric for `Uri`): `redial` round-trips
  conversation/name/media into a `CallConfig`; resolves `displayName` **over** the raw username then
  encodes a reserved-char name into exactly 4 path segments; carries an audio-only record as audio; falls
  back to the group `conversationTitle` when `peer == null`. Behaviour asserted by decoding the built path,
  not by reading back a set constant. No floor lowered, no tautology.
- **Verification:** `assembleDebug` + `:app:testDebugUnitTest` **BUILD SUCCESSFUL** via system Gradle
  8.14.3 (wrapper still 403s — see NOTES); debug APK assembles; `CallRouteTest` 12/12 green; no suite
  regressed.
- **Reviewer gate:** PASS — diff `apps/android` only (4 files: `CallRoute.kt` +helper, `MeeshyApp.kt`
  wiring, `strings.xml`, `CallRouteTest.kt`), navigation orchestration correctly in `:app`, behaviour
  through the public API, no unguarded async (pure route builder). **Next:** WebRTC/Telecom/FCM
  full-screen-intent plumbing.

### 2026-07-02 — slice `call-nav-conversation-thread` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration — the only open PR (#1324) is an
  iOS Dynamic-Type branch (`claude/upbeat-euler-s5qysh`, author `jcnm`), disjoint from `apps/android`.
  Branched off freshly-fetched `origin/main` (`0e0ac302`) as `claude/apps/android/call-nav-conversation-thread`.
- **Root cause found while scoping:** the outgoing-call route dropped the `conversationId`. `Routes.CALL`
  only carried `{peerName}/{video}`, so the `NavHost` built a `CallConfig(conversationId = "")` and
  `CallViewModel.start` → `emitInitiate("", isVideo)` fired into an **empty room** — every outgoing call
  was dead-on-arrival (the gateway rejects a blank room → `ServerError` → `Ended(Failed)`). This is the
  tracked "Calls-tab nav entry threading the real `conversationId`" follow-up; the `conversationId` is a
  nav-level fact already known at the chat destination, so no ViewModel/state plumbing was needed.
- **Design (pure-decision-first):**
  - `:app` `me.meeshy.app.navigation.CallRoute` — the single source of truth for the outgoing-call route.
    `PATTERN` (`call/{conversationId}/{peerName}/{video}`), `path(conversationId, peerName, isVideo)`
    (percent-encodes both free-text segments so a peer name with `/`/`&` never adds path segments), and
    the pure `config(conversationId?, peerName?, isVideo?) → CallConfig` mapping (null/absent args degrade
    to blank/audio — a malformed deep link yields an inert call, never an NPE; `callId` left blank so an
    outgoing call mints its own via the initiate ACK; `isOutgoing = true`).
  - `MeeshyApp` glue: the CHAT `composable` now captures its `entry`, reads
    `ChatViewModel.CONVERSATION_ID_ARG`, and threads it into `Routes.call(conversationId, peerName,
    isVideo)`; the CALL `composable` decodes the three args and delegates to `CallRoute.config`. Removed
    the ad-hoc `CALL_PEER_ARG`/`CALL_VIDEO_ARG`/inline `CallConfig` construction (dead once `CallRoute`
    owns it). `ChatScreen`'s public signature is untouched (the id rides in from nav, not from state).
- **Tests:** +8 behavioural (`CallRouteTest`, Robolectric for `Uri`): `config` threads the id / leaves
  callId+peerId blank / defaults absent video to audio / keeps explicit audio / degrades null
  conversationId (no crash, still outgoing) / degrades null peerName; `path` embeds the id and round-trips
  a peer name with reserved chars through exactly 4 segments; `PATTERN` exposes all three named args.
  Every `config` branch (null conversationId, null peerName, `isVideo` null/true/false) is hit. This is
  the **first `:app` test source set** (deps were already declared).
- **Verification:** whole-project `assembleDebug testDebugUnitTest` **BUILD SUCCESSFUL** (890 tasks) via
  system Gradle 8.14.3 (wrapper 8.11.1 still 403s — github-releases egress blocked, see NOTES; AGP 8.7.3
  runs fine on 8.14.3). `CallRouteTest` 8/8 green; debug APK assembles; no other suite regressed.
- **Reviewer gate:** PASS — diff `apps/android` only (1 code file edited + 1 new helper + 1 new test),
  navigation orchestration correctly in `:app` (SDK building blocks untouched), behaviour tested through
  the public API, no tautologies, no floor lowered, no unguarded async. **Next:** a dedicated Calls tab in
  the bottom nav wiring `CallHistoryScreen`, then the heavier WebRTC/Telecom/FCM plumbing.

### 2026-07-02 — slice `realtime-session-coordinator` ✅ shipped
- **Step 0 (housekeeping):** no Android PR was open. The 4 open PRs (#1317–#1320) are iOS/web/gateway
  branches from other sessions — left untouched. Branched off freshly-fetched `origin/main` (`57408634`)
  as `claude/apps/android/realtime-session-coordinator`.
- **Root-cause found while scoping:** the whole realtime layer was **dead code**. `SocketManager.connect()`
  was never called anywhere in production, and no socket manager's `attach()` (message/social/**call**) ran
  — `on()` no-ops while `_socket` is null and only `connectionState` was ever observed. So no `call:*`,
  `message:*` or social frame could reach any ViewModel. This slice (the tracked "app-level
  `CallSignalManager.attach()` lifecycle caller") fixes the root cause for all three managers at once.
- **Design:**
  - `:sdk-core` pure `RealtimeLifecyclePlan.commandsFor(wasAuthenticated, isAuthenticated) → List<RealtimeCommand>`
    owns the two invariants: **ordering** (sign-in yields `Connect` *before* `Attach`, because listeners
    can only register on an existing socket) and **edge-only** (act solely on a genuine auth ⇄ unauth
    transition — never double-connect a live session, which would double-register every listener and
    duplicate every inbound event). Because a fresh `connect()` mints a **new** socket, `Attach` is paired
    with **every** `Connect` (not once ever), so logout→login re-attaches on the new socket.
  - `:sdk-core` `@Singleton RealtimeSessionCoordinator.onAuthenticatedChanged(isAuthenticated)` holds the
    last-seen edge (`@Synchronized`) and dispatches the plan's commands to the SDK singletons (connect /
    attach-all-three / disconnect). Thin wiring; all the logic is in the pure plan.
  - `AuthViewModel` (the app-level auth holder, created above the NavHost in `MeeshyApp`) drives it: at
    `init` with `authRepository.isAuthenticated` (reconnects a restored-token session on app start / after
    process death), on login success (`true`), and on logout (`false`). The coordinator is a `@Singleton`
    so even a VM recreation dedups via the edge.
- **Tests (TDD red→green, +16):**
  - `RealtimeLifecyclePlanTest` (5): sign-in → `[Connect, Attach]` in order; sign-out → `[Disconnect]`;
    stay-in / stay-out → `[]`; attach-never-precedes-connect.
  - `RealtimeSessionCoordinatorTest` (6, mockk relaxed managers): connect-then-attach-all order;
    redundant `true` doesn't reconnect/re-attach (exactly-1); sign-out disconnects; initial `false`
    touches nothing; redundant `false` doesn't re-disconnect; logout→login **re-attaches on the new
    socket** (connect×2, each attach×2, disconnect×1) — proves attach-per-connect, not attach-once.
  - `AuthViewModelTest` (+5): init with restored token → `onAuthenticatedChanged(true)`; init without
    token → `false`; login success → `true`; login failure → not `true`; logout → `false`.
- **Branches covered:** plan's `when` all 3 arms (Connect+Attach / Disconnect / empty); coordinator's
  `execute` all 3 command arms. ≥90% branch+instruction on the new pure logic.
- **Verify:** `assembleDebug` + `testDebugUnitTest` green (system Gradle `/opt/gradle` `--no-daemon`;
  wrapper 403s through proxy — see NOTES). Diff = `apps/android` only (2 modified: `AuthViewModel` +
  its test; 4 new: plan + coordinator + 2 tests). No production logic outside `apps/android`.
- **Reviewer verdict:** PASS — pure logic fully branch-covered, behaviour-tested through the public API
  (no tautologies), SDK purity respected (pure plan + thin stateful coordinator in `:sdk-core`, the
  when-to-connect edge driven from the `:feature:auth` VM), scope `apps/android`-only.
- **Follow-ups noted:** `SocketManager.reconnectWithToken()` (disconnect+connect on token refresh) still
  has no caller — a future token-refresh slice must re-attach after it (same attach-per-connect rule).

### 2026-07-01 — slice `call-viewmodel-signal-fold` ✅ shipped
- **Step 0 (housekeeping):** the prior Android PR **#1311** (`call-initiate-ack`) was still open —
  squash-merged it to `main` first (mergeable=clean, diff `apps/android` only, monorepo CI has no
  required checks for an android-only diff), then branched off freshly-fetched `origin/main`
  (`03c122fe`) as `claude/apps/android/call-viewmodel-signal-fold`. The other 7 open PRs are
  web/iOS/gateway/shared branches — left untouched.
- **Slice:** the VM-fold — turn the call screen from a self-contained FSM demo into a live two-way
  socket endpoint. Folds `CallSignalManager.events` into the VM, places outgoing calls via the ACK, and
  keys every outbound emit by the real `callId`.
- **Design (thin orchestration over the existing pure building blocks):**
  - `CallConfig` gains `conversationId` (the room an outgoing `emitInitiate` targets) and `callId` (the
    id an incoming call already carries); both default `""`, so `:app`'s existing `CallConfig(...)`
    placeholder compiles unchanged.
  - `CallViewModel` now `@Inject`s `CallSignalManager`. `init { viewModelScope.launch { events.collect
    (::dispatch) } }` folds each mapped `CallEvent` through the unchanged `CallStateMachine`. Outgoing
    `start` rings optimistically (`dispatch(StartOutgoing)`) then `launch`es `emitInitiate` → `Success`
    stores the minted `callId`; `ServerError`/`Timeout`/`Malformed` → `dispatch(ConnectionFailed(msg))`
    which the FSM's terminal path settles to `Ended(Failed)`. accept→`emitJoin`, decline/hangUp→
    `emitEnd`, mute→`emitToggleAudio(enabled=!muted)`, camera→`emitToggleVideo(enabled=cameraOn)`, all
    guarded by `emitIfIdentified` (inert while `callId` is blank). No FSM/presenter change.
- **Tests (TDD red→green, +14; 28 total in `CallViewModelTest`):** initiate emits conversationId+video
  type; optimistic ring before ACK; `ServerError`→`Ended(Failed("Room full"))`; `Timeout`/`Malformed`→
  `Ended(Failed)`; incoming never emits initiate; hang-up/accept/decline/mute/camera each verified
  keyed by the minted/incoming id; blank-id guard emits nothing; `RemoteHangUp` and the
  join→answer→connected chain folded through `events` drive the state. All 14 prior tests preserved
  verbatim (only the `vm()` factory + configs gained the injected mock and the new id fields).
- **Verification:** whole-project `assembleDebug testDebugUnitTest` **BUILD SUCCESSFUL** (886 tasks) via
  system Gradle 8.14.3 `--no-daemon` (wrapper still 403s through the proxy — NOTES). `:feature:calls`
  suite 28/28 green; `:app` compiles against the widened `CallConfig`.
- **Reviewer gate:** PASS — diff `apps/android` only (3 code files, +290 −31), VM orchestration lives in
  `:feature:calls` (building blocks untouched in `:sdk-core`/`core:model`), behaviour tested through the
  public API, no tautologies, no floor lowered, `viewModelScope` collect cancellation-safe (no swallowed
  `CancellationException`).

### 2026-07-01 — slice `call-initiate-ack` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the 4 open PRs on `main` are
  web/iOS branches — #1307–#1310, none `claude/apps/android/*`). Branched off freshly-fetched
  `origin/main` (`dc9a1a11`) as `claude/apps/android/call-initiate-ack`.
- **Slice:** the ACK-based `call:initiate` — the "Next slice" #5 that unblocks the VM-fold. It gives the
  future `CallViewModel` the real MongoDB `callId` every outbound emit is keyed by, plus the per-user ICE
  servers WebRTC must be configured with before any SDP offer.
- **Design (SDK-pure-first):**
  - `core:model/.../call/CallInitiateAck.kt` — `SocketIceServer` (`urls`/`username`/`credential`) with a
    custom `IceServerUrlsSerializer` that normalises the gateway's single-string-**or**-array `urls` to a
    `List<String>` (parity with iOS `SocketIceServer.IceServerURLs`); `CallInitiateAck`
    (`callId`/`mode`/`iceServers`/`ttlSeconds`); the sealed `CallInitiateResult`
    (`Success`/`ServerError`/`Malformed`/`Timeout`); and the total, side-effect-free
    `CallInitiateAckParser.parse(rawJson)` — the single tested SSOT for the ACK wire contract, faithful to
    the iOS `emitCallInitiate` guard (`success:true` + non-blank `data.callId` → `Success`; else the
    gateway error from `error.message` → bare-string `error` → `"unknown error"`; undecodable body →
    `Malformed`). `Timeout` is transport-level (never produced by the parser).
  - `:sdk-core/.../socket/CallSignalManager.kt` — `suspend emitInitiate(conversationId, isVideo)`: emits
    `call:initiate` with `{conversationId, type:"video"|"audio"}` via the existing ACK-emit overload,
    awaits the ACK inside `withTimeoutOrNull(10_000)` (iOS's 10s budget) wrapping a
    `suspendCancellableCoroutine`, delegates the body to `CallInitiateAckParser`, and maps a
    missing/non-JSONObject ACK to `CallInitiateResult.Timeout`. Owns only the transport; the wire decision
    lives once in the pure parser.
- **Tests (TDD red→green, +26):** 21 `CallInitiateAckParserTest` (full ACK incl. minimal/unknown-keys,
  single-string vs array `urls`, TURN creds, every `ServerError` fallback incl. non-string error, both
  `Malformed` arms — bad JSON + wrong `iceServers` shape, robust `urls` dropping non-strings/objects);
  5 `CallSignalManagerTest` additions (payload keys + video type, audio type, `ServerError` on rejection,
  `Timeout` on no-ACK, `Timeout` on non-JSONObject ACK — the last two exercise `withTimeoutOrNull` under
  the `runTest` virtual clock). Every parser branch and `messageOf` arm enumerated and hit.
- **Verification:** `assembleDebug testDebugUnitTest` **BUILD SUCCESSFUL** (whole project; 886 tasks) via
  system Gradle 8.14.3 (`--no-daemon`). The wrapper's pinned 8.11.1 distribution 403s through the egress
  proxy (redirects to a blocked github.com release asset) — used the preinstalled `/opt/gradle` instead;
  the committed wrapper is untouched. Lesson recorded in NOTES.md.
- **Reviewer gate:** PASS — diff is `apps/android` only (4 files, +404 −0), pure building blocks in
  `core:model`/`:sdk-core` (no product orchestration; the VM-fold is the next slice, so `emitInitiate`
  joins the already-established outbound emit table awaiting that fold — not an orphan), behaviour tested
  through the public API, no tautologies, no floor lowered.

### 2026-07-01 — slice `call-history-list` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (open PRs on `main` are iOS-a11y
  branches, none `claude/apps/android/*`). **Gotcha caught:** the container's local `main` was stale and
  divergent (un-squashed Stories commits); a naive `git checkout main` would have branched off the wrong
  base. Recovered with `git checkout -B claude/apps/android/call-history-list origin/main` — the freshly
  fetched `origin/main` (`728c999e`) already carries all prior Calls work (`call-history-repository` etc.).
  Lesson recorded in NOTES.md. Always branch off `origin/main`, never local `main`.
- **Slice:** the recent/missed-calls **list UI** (`:feature:calls`) — the real consumer of
  `CallHistoryRepository.historyStream()`. Vertical slice, all in `:feature:calls`:
  - Pure `CallHistoryList` — `combine(stream, paged)` de-dups by `callId` (stream order first, so a
    `fetchPage(cursor=null)` re-fetch of the head never duplicates); `filter(records, missedOnly)`.
  - Pure `CallTimeLabel.label(iso, now, zone, locale, yesterday)` — ISO-8601 → relative label
    (same-day 24h time / yesterday / weekday within the week / date with year only when it differs),
    degrading an absent/unparsable value to `""`. Parses via the SDK's single `isoToEpochMillis` SSOT.
  - UDF `CallHistoryViewModel` (`StateFlow<CallHistoryUiState>`) — cache-first SWR flags (skeleton only
    on cold empty, `isSyncing` on stale/syncing, error surfaced + skeleton dropped), a **client-side**
    missed-only filter (instant, no network), cursor-paged infinite scroll via `fetchPage` (append +
    de-dup, cursor advance, `hasMore`/`isLoadingMore` re-entrancy gating, failure surfaced), and
    pull-to-refresh that resets paging and tracks `isUserRefreshing` distinct from silent SWR.
    `CancellationException` rethrown in every `viewModelScope` catch.
  - Accent-coherent `CallHistoryScreen` glue — `MeeshyAvatar` rows, direction icon (missed = error
    colour), relative time, All/Missed `FilterChip`s, cold skeleton, filtered/cold empty states,
    `PullToRefreshBox`, `loadMoreIfNeeded` on row render.
- **TDD red → green:** tests first. **30** new behavioural tests through the public API:
  `CallHistoryListTest` (+7 — combine order/dedup/empty/stream-wins, filter all/missed/none),
  `CallTimeLabelTest` (+7 — null/garbage → empty, same-day time, later-same-day, yesterday, weekday,
  date without/with year), `CallHistoryViewModelTest` (+16 — cold skeleton, fresh/stale/syncing paint,
  sync error, missed filter narrow+restore, `isFilteredEmpty`, loadMore append+dedup / far-from-tail
  no-op / `hasMore` exhausted / cursor advance / failure / re-entrancy guard, refresh reset + failure).
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (debug APK assembles + all
  JVM unit tests green). Zero warnings after switching to `Icons.AutoMirrored.Filled.CallMissed`.
- **Reviewer gate:** PASS. Scope = `apps/android` only (5 new Kotlin + 3 new tests + 4 strings edits),
  no secrets, no `local.properties`. Behavioural tests, no tautologies, no floor lowered. SDK purity:
  pure list/time algebra + a `:feature` ViewModel (product orchestration); no re-implementation of
  language/colour SSOTs. Cache-first (instant-app): skeleton only on cold empty, cached rows paint
  immediately. Edge cases: empty/single/boundary lists, unknown callId, first/last paging positions,
  no-op filter toggle, failure paths, cancellation-safe scope work.
- **Next:** fold `CallSignalManager.events` into `CallViewModel` once the `initiate`-ACK call-id
  lifecycle lands; wire `CallHistoryScreen` into a Calls tab (`:app`); then WebRTC/Telecom/FCM.

### 2026-07-01 — slice `call-history-repository` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the 27 open PRs on `main` are all
  iOS-a11y / web / gateway `claude/*` branches, none `claude/apps/android/*`). Branched
  `claude/apps/android/call-history-repository` off freshly-fetched `origin/main` (`3c0a74e6`, PR #1235).
- **Slice:** the call-history **repository** — the REST + Room cache-first layer the recent/missed-calls
  list UI will read. Vertical slice across three modules, each mirroring the established Stories SWR:
  - `:core:network` `CallHistoryApi` — `GET calls/history?cursor&limit&filter` → `ApiResponse<List<CallRecord>>`
    (decodes 1:1 into the `:core:model` `CallRecord`), wired into `MeeshyApi.callHistory` + `NetworkModule`.
  - `:core:database` `CallHistoryEntity` (`call_history` table: serialized payload + `startedAt`
    epoch-millis for ordering + `cachedAt`) and `CallHistoryDao` (`observeAll` newest-first,
    `upsertAll`/`deleteNotIn`/`clear`). Registered in `MeeshyDatabase` (**v6→v7**, existing destructive
    fallback) + `DatabaseModule` provider.
  - `:sdk-core` `CallHistoryCacheSource` (Room-backed `SwrCacheSource`, port of `StoryCacheSource`:
    cold cache → `null`, synced-empty distinguished, `sync_meta` freshness, transactional persist that
    prunes rows absent from the latest fetch) + `CallHistoryRepository`: `historyStream()` cache-first
    SWR (`CachePolicy.CallHistory` = fresh 60s / keep the gateway's 90-day window), `refresh()`, and a
    cursor-paginated raw `fetchPage(cursor, limit, missedOnly) → CallHistoryPage(records, nextCursor,
    hasMore)` the list UI drives for older pages (folds the full `ApiResponse` envelope so pagination
    survives, unlike `apiCall` which discards it).
- **TDD red → green:** `CallHistoryDaoTest` (+5) and `CallHistoryRepositoryTest` (+12) first. **17** new
  behavioural tests through the public API: DAO order/upsert-replace/deleteNotIn/clear; repo cold-cache
  `Empty`, refresh persist + sync-meta, refresh prune (row absent from 2nd sync removed), `Fresh`
  after refresh, `CallHistorySyncException` carrying the API error; `fetchPage` pagination
  cursor+hasMore, no-pagination → null/false, cursor+limit+`all` filter forwarding (`coVerify`),
  `missed` filter when `missedOnly`, failed-envelope → `Failure` with message, network-exception →
  `Failure`. Every `when`/`if` arm in the new code is hit.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (debug APK assembles + all
  JVM unit tests green). Note: one Robolectric `MavenArtifactFetcher` SSL flake on the first
  `:core:database` run (proxy download of the `android-all` jar); a re-run was green — environment
  network flake, not a test defect (see NOTES.md).
- **Reviewer gate:** PASS. Scope = `apps/android` only (12 files, 7 new / 5 edits), no secrets, no
  `local.properties`. Behavioural tests, no tautologies, no floor lowered. SDK purity: the repository is a
  stateless building block in `:sdk-core` (the cache→network cascade is the generic `cacheFirstFlow`
  helper; no product "when to X" rule). Cache-first (instant-app); the call-journal display SSOT stays in
  `:core:model`. Edge cases: empty/cold cache, prune, failure paths (sync + network + failed envelope),
  pagination present/absent, both filters.
- **Next:** the recent/missed-calls **list UI** in `:feature:calls` — a `CallHistoryViewModel`
  (`StateFlow<CallHistoryUiState>` over `historyStream()`, `distinct` fresh/stale/empty handling +
  pull-to-refresh + paging via `fetchPage`) and an accent-coherent list rendering each `CallRecord` via
  its pure display accessors; then fold `CallSignalManager.events` into `CallViewModel` once the
  `initiate`-ACK call-id lifecycle lands.

### 2026-07-01 — slice `call-history-model` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the open PRs on `main` are all
  iOS-a11y / web / gateway work, none `claude/apps/android/*`). Branched `call-history-model` off the
  freshly-fetched `origin/main`.
- **Slice:** the pure **call journal** model in `:core:model` `me.meeshy.sdk.model.call` — a
  dependency-free port of iOS `CallModels.swift` (`CallDirection`, `CallHistoryPeer`, `APICallRecord`)
  plus `CallMediaType` from `WebRTCTypes.swift`, mirroring the gateway `CallHistoryItem` REST contract
  (`services/gateway/src/services/callHistory.ts`, `GET /api/v1/calls/history`) field-for-field.
  - `CallDirection(wire)` enum + `fromRaw(raw)` degrading an unknown value → `INCOMING` (parity with
    iOS `CallDirection(raw:)`, so one bad field never fails the whole record).
  - `CallMediaType` (`AUDIO_ONLY`/`AUDIO_VIDEO`) + `forVideo(isVideo)` — the single mapping from the
    record's persisted `isVideo` flag to the enum.
  - `@Serializable CallHistoryPeer` (userId/username/displayName?/avatar?/phoneNumber?/isOnline) and
    `@Serializable CallRecord` (all gateway fields; only the non-null ones required so a malformed frame
    fails to decode rather than half-populating). Timestamps stay ISO-8601 **strings** — faithful to the
    wire and keeping `:core:model` free of any `java.time` dependency (a repository parses where needed).
  - Pure display accessors as the single tested SSOT: `directionKind`/`isMissed`, `mediaType`, four-tier
    `displayName` (peer display → peer username → conversation title → "Inconnu", **blank-skipping** —
    surpasses iOS which only skips empty strings and would surface a whitespace-only name), `avatarUrl`
    (peer → conversation fallback), `durationLabel` (`M:SS`/`H:MM:SS`, empty at ≤0, locale-free padding),
    `dataLabel` (deterministic locale-independent byte ladder B→KB→MB→GB→TB, one decimal, `null` when no
    counters recorded or the total is zero).
- **TDD red → green:** wrote `CallRecordTest` (+22) first; first compile failed **red** on a real defect —
  a `private companion object` holding the helpers shadowed the `@Serializable`-generated public
  `serializer()`, so `CallRecord.serializer()` was inaccessible. Fixed by moving the pure helpers to
  file-private top-level functions (no companion), letting serialization generate its own public one.
  Tests then green. Coverage of new logic: every `CallDirection` arm incl. the unknown-degrades arm; both
  `forVideo` arms; all four `displayName` tiers incl. blank/empty skips and the fallback; all `avatarUrl`
  fallbacks; `durationLabel` zero/negative/sub-minute/minute/hour-boundary; `dataLabel` both-null / zero /
  single-counter / KB-MB-GB ladder; and a real gateway-shaped JSON decode with and without a `peer`
  (unknown extra key tolerated). No `@Composable`/glue in the slice — 100% of it is the covered target.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (debug APK assembles + all JVM
  unit tests green). `:core:model:testDebugUnitTest` = `CallRecordTest` 22/22, skipped 0, failures 0.
- **Reviewer gate:** PASS. Scope = `apps/android/core/model` only (2 new files), no secrets, no production
  logic touched. Behavioural tests through the public API, no tautologies, no floor lowered. SDK purity
  respected (stateless model in `:core:model`); single source of truth (this IS the SSOT for call-journal
  display); immutable data, early returns. Edge cases covered per §3.
- **Next:** the call-history **repository** (REST `/calls/history` fetch + Room cache, cache-first SWR),
  then the missed/recent-calls **list UI**; independently, fold `CallSignalManager.events` into
  `CallViewModel` once the `initiate`-ACK call-id lifecycle lands.

### 2026-07-01 — slice `call-signal-manager` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the open PRs — #1221-1229 —
  are all ios/web/gateway). `origin/main` HEAD `c8063196` (PR #1220). Branched
  `claude/apps/android/call-signal-manager` off latest `main`.
- **What:** the **socket subscription + outbound emit table** half of the Calls signalling wiring —
  a new `:sdk-core` `CallSignalManager`, a transport building block mirroring `MessageSocketManager`/
  `SocialSocketManager`.
  - **Inbound.** `attach()` registers a `SocketManager.on(...)` listener for all 8 inbound `call:*`
    frames (`initiated`/`signal`/`participant-joined`/`ended`/`missed`/`media-toggled`/`error`/
    `already-answered`), converts each first-arg `JSONObject` to its string form, routes it through the
    pure `CallSignalMapper.map(event, raw)` (the single tested source of "which frame is which event"),
    and `tryEmit`s any non-null `CallEvent` on the hot `SharedFlow<CallEvent> events` (replay 0, buffer
    64 — parity with the other managers). A non-`JSONObject` first arg, a malformed frame, or a
    mapper-inert frame (ICE candidate / renegotiation offer / media-toggle) emits nothing.
  - **Outbound.** Fire-and-forget lifecycle emits at **iOS-exact** payload keys (pinned so a rename
    can't silently break the gateway handler): `emitJoin`/`emitLeave`/`emitEnd` → `{callId}`,
    `emitToggleAudio`/`emitToggleVideo` → `{callId, enabled}`, `emitSignal` → `{callId, signal}`
    (nested SDP/ICE object). Derived from the iOS `CallEmitSourceGuardTests` emit table.
  - **Deliberately deferred** (documented, not orphaned): the ACK-based `call:initiate` (mints the
    callId; returns ICE servers — belongs with WebRTC) and `request-ice-servers`/`heartbeat`/
    `quality-report`/`reconnecting`/`reconnected`. The VM-fold + app-level `attach()` caller wait on
    the call-id lifecycle (an `initiate`-ACK slice) — same building-block-awaiting-wiring status as
    `SocialSocketManager`/`MessageSocketManager` today.
- **Tests (+18, `CallSignalManagerTest`, Robolectric):** mockk `SocketManager` capturing `on(...)`
  handlers (SocialSocketManagerTest pattern) + `emit(...)` payload slots.
  - Inbound (12): each of the 10 mapped outcomes (initiated→ReceiveIncoming, participant-joined→
    ParticipantJoined, signal answer→RemoteAnswer, ended missed→RingTimeout, ended rejected→
    RemoteHangUp, missed→RingTimeout, error→ConnectionFailed(msg), already-answered→RemoteHangUp) +
    2 inert (signal ice-candidate, media-toggled) `expectNoEvents` + malformed-missing-callId +
    non-JSONObject-arg both `expectNoEvents`.
  - Outbound (6): each emit verified for event name + payload keys/values via `slot<JSONObject>`.
- **Verify:** `./apps/android/meeshy.sh check` — `assembleDebug` + full `testDebugUnitTest` **BUILD
  SUCCESSFUL** (CallSignalManagerTest 18/18; no regressions).
- **Reviewer gate: PASS** — apps/android-only diff (1 prod file + 1 test + docs); behavioural tests,
  no tautologies; SDK-pure building block reusing the `CallSignalMapper` SSOT; edge cases (malformed /
  non-object / inert frames) covered; no coverage floor touched.
- **Next:** the `initiate`-ACK slice (call-id lifecycle) → then fold `events` into `CallViewModel`.

### 2026-07-01 — slice `call-signalling-events` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the 30 open PRs are all
  ios/web/gateway/shared); `origin/main` HEAD `deb81adf` (iter 61, web). Branched
  `claude/apps/android/call-signalling-events` off latest `main`.
- **What:** gave the pure call FSM its **inbound wire vocabulary** — `core:model`
  `me.meeshy.sdk.model.call` now models every inbound `call:*` frame and maps it to a `CallEvent`.
  - **`CallSocketEvents.kt`** (payload models): `@Serializable` data classes at parity with the iOS
    `MessageSocketManager` listen table — `CallSignalPayload` (SDP/ICE: type/sdp/candidate/sdpMLineIndex/
    sdpMid/from/to/negotiationId), `CallInitiatedPayload` (+`CallInitiatorInfo`), `CallSignalEnvelope`,
    `CallParticipantPayload`, `CallEndedPayload` (reason), `CallMissedPayload`, `CallMediaTogglePayload`,
    `CallErrorPayload`, `CallAlreadyAnsweredPayload`. Required identifiers are non-null so a frame missing
    them fails to decode and is treated as inert (iOS `guard let` parity).
  - **`CallSignalMapper.kt`** (pure `object`): `map(eventName, rawJson): CallEvent?` — total &
    side-effect-free, lenient `Json { ignoreUnknownKeys; isLenient }`, wrapped in `runCatching` so a
    malformed/unknown frame yields `null` (never crashes, never an illegal transition). Routing:
    `call:initiated`→`ReceiveIncoming`; `call:participant-joined`→`ParticipantJoined`; `call:signal`
    type=`answer`→`RemoteAnswer` (renegotiation `offer` / `ice-candidate` / unknown / no-signal → `null`,
    inert plumbing); `call:ended` reason=`missed`→`RingTimeout` else `RemoteHangUp`; `call:missed`→
    `RingTimeout`; `call:media-toggled`→`null` (media state, not a phase); `call:error`→
    `ConnectionFailed(message ?? code ?? "Call error")`; `call:already-answered`→`RemoteHangUp`; unknown
    event name → `null`.
- **Tests (+22, red → green):** `CallSignalMapperTest` drives the public `map(eventName, rawJson)` with
  realistic gateway JSON strings and asserts the mapped `CallEvent`/`null` — every branch: each event name,
  the `signal.type` switch (answer/offer/ice/unknown/no-signal/extra-unknown-fields), the `reason` switch
  (missed/completed/rejected/absent), the inert plumbing events, the message/code/generic error fallback
  chain, missing required ids (initiated/media-toggled), unknown event name, and malformed/empty JSON
  (graceful, no crash). RED was real: the tests fail to compile without the mapper + models.
- **Verification:** `:core:model:testDebugUnitTest` → `CallSignalMapperTest` 22/22 green; full
  `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (no regression across all modules). Diff is
  `apps/android` only (2 prod files + 1 test + docs; `git status` clean of any web/ios/gateway/shared path).
- **Reviewer gate:** PASS — SDK purity respected (stateless pure mapper + data models in `core:model`,
  no product orchestration/singletons/Compose); single source of truth (the mapper feeds the SSOT
  `CallStateMachine`, no re-implementation of transition logic); behaviour-tested through the public API
  (no tautologies, no reflection, asserts the mapper's transformation not a canned return); near-total
  branch coverage incl. the inert/malformed/boundary arms; immutable data, early returns, no coverage floor
  touched; graceful failure paths (malformed frame → inert, never a crash).

### 2026-07-01 — slice `calls-viewmodel-screen` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration; `origin/main` HEAD `1827303`
  (iter 53, web). Branched `claude/apps/android/calls-viewmodel-screen` off latest `main`.
- **What:** gave the pure call FSM (`core:model` `me.meeshy.sdk.model.call`) its **first real consumer** —
  a new `:feature:calls` Gradle module (`include(":feature:calls")`, wired into `:app`).
  - **`CallPresenter`** (pure): projects `CallState × CallConfig × CallMedia → CallUiState`. Owns every
    UI decision — `CallStatus` (IDLE/INCOMING/OUTGOING_RINGING/CONNECTING/CONNECTED/RECONNECTING/ENDED,
    with `Offering` collapsing to CONNECTING), the `showAnswerControls`/`showHangUp`/`canToggleMedia`/
    `isActive`/`isEnded` affordances, the terminal `endReason`, the reconnect attempt, and the
    camera-only-if-video rule. Media intent (mute/camera) rides alongside the phase, never inside the FSM
    (iOS `CallManager` parity).
  - **`CallViewModel`** (UDF, `@HiltViewModel`): holds `CallState` + `CallMedia`, folds
    `start`/`accept`/`decline`/`hangUp`/`onSignal`/`toggleMute`/`toggleCamera`/`dismiss` through
    `CallStateMachine.reduce`, republishes an immutable `StateFlow<CallUiState>` via `CallPresenter`.
    `start` is **inert unless idle** (re-entrant launch effect never resets a live call); `dismiss`
    settles a terminal call back to idle. No `viewModelScope` needed — every transition is synchronous
    and deterministic (the async WebRTC/signalling plumbing is the next slice).
  - **`CallScreen`** (glue): accent-coherent (`DynamicColorGenerator.colorForName`) full-screen call UI
    rendering the phase + peer + status label, with accept/decline/hang-up/mute/camera/close controls the
    state exposes. Reachable from **audio & video call buttons added to the chat header** (iOS parity);
    `onClose` returns to chat (coherent dismissal). +2 strings × 4 locales in `:feature:chat`, 18 strings
    × 4 locales in `:feature:calls`.
- **Tests (+34, red → green):** `CallPresenterTest` (20) sweeps every `statusOf` arm + every derived
  affordance's true/false branches + the camera video/audio matrix + end-reason/reconnect exposure;
  `CallViewModelTest` (14) drives the intents through the public `state` API (outgoing negotiate→connected,
  incoming accept→connecting, decline→Rejected, hang-up→Local, remote hang-up→Remote, mute/camera toggles,
  audio call never reports camera on, `start` inert mid-call, dismiss→idle, restart after settle). **RED
  caught a real bug:** an assertion assumed `Offering` blocks media toggle, but `Offering` presents as
  CONNECTING (which allows it) — the test expectation was corrected to match the intended collapse, not
  the code weakened.
- **Verification:** `:feature:calls:testDebugUnitTest` → 34/34 green; `:app:assembleDebug` → **BUILD
  SUCCESSFUL** (the chat-header + nav wiring compiles). Diff is `apps/android` only (`git status` clean of
  any web/ios/gateway/shared path).
- **Reviewer gate:** PASS — SDK purity respected (pure `CallPresenter` + FSM in `core:model`; product
  orchestration in `:feature:calls`/`:app`); UDF with immutable `StateFlow<CallUiState>` + pure
  transitions; single source of truth for colour (`DynamicColorGenerator`) and call transitions
  (`CallStateMachine`); behaviour-tested through the public API (no tautologies, no reflection); near-total
  branch coverage on the pure logic incl. inert/boundary arms; no coverage floor touched; natural chat-header
  entry with coherent dismissal (no dead end).

### 2026-06-30 — slice `call-state-machine` ✅ shipped (PR pending → squash-merge) + unblocked & merged `story-sticker-picker-search` (PR #1135)
- **Step 0 (housekeeping):** the prior run's PR #1135 (`story-sticker-picker-search`) was open and
  ⚠ blocked on a **pre-existing red `main`** (the `Test web` a11y failure in `invite-user-modal.test.tsx`).
  `main` has since gone **green** (the fix merged; HEAD `c261f0bd` CI = success). Rebased #1135 onto current
  `main` (clean, apps/android-only), re-ran CI → **all green** (the once-red `Test web` now passes),
  local `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL**, then **squash-merged** to `main`
  (`876f9087`). Hard-rule honoured: never merged past the red CI; merged only once `main` was green.
- **Then advanced one phase** into the **Calls** area (Stories richness is now sufficient — composer
  has slides/deck/per-slide media/text-elements/stickers/filters/z-order/snap/canvas-transform/toolbar,
  all non-UI files tested).
- **What:** the first Calls brick — a **pure call-lifecycle FSM** in `core:model`
  (`me.meeshy.sdk.model.call`), the single source of truth the future `:feature:calls` wiring drives.
  - `CallState` (Idle / Ringing(isOutgoing) / Offering / Connecting / Connected / Reconnecting(attempt) /
    Ended(reason)) with derived flags `isActive`/`isRinging`/`isEnded`/`canStart`.
  - `CallEndReason` (Local / Remote / Rejected / Missed / ConnectionLost / Failed(message)) — faithful
    port of iOS `WebRTCTypes.CallEndReason` incl. the message-carrying `Failed`.
  - `CallEvent` — the 15 lifecycle triggers (StartOutgoing/ReceiveIncoming/ParticipantJoined/
    LocalAnswer/RemoteAnswer/MediaConnected/ConnectionStalled/ReconnectFailed/Reject/LocalHangUp/
    RemoteHangUp/RingTimeout/ConnectionFailed(msg)/Settle).
  - `CallStateMachine.reduce(state, event, maxReconnectAttempts = 3)` — total, side-effect-free,
    faithfully mirroring the iOS `CallManager` transition table (outgoing: ringing→offering→connecting→
    connected; incoming: ringing→connecting→connected; connected→reconnecting on stall; reconnect budget
    of 3 → `Ended(ConnectionLost)`; ringing timeout → `Missed`; incoming decline → `Rejected`). Every
    inapplicable event is **inert** (same state); terminal `Ended` only leaves via `Settle` → `Idle`, so
    the machine always settles and never loops. **Surpasses iOS**, where a real FSM validator is only a
    P1 "todo" in its calls SOTA plan.
- **Why `core:model` (not a new `:feature:calls` module):** the FSM is a stateless pure building block
  (SDK-purity grain test → agnostic, parameter-driven, no product orchestration), and `core:model`
  already hosts the codebase's pure domain logic (`EmojiUsageRanker`, `ConversationFilter`,
  `LanguageResolver`). Keeps the slice tight (no Gradle-module wiring) and the FSM reusable by both the
  app and the SDK. The `:feature:calls` ViewModel + minimal screen that *consume* it are the next slice.
- **Tests (+31, red → green):** `CallStateMachineTest` (`core:model`). RED captured first (types
  unresolved). Branch sweep — every `when` arm exercised, including: idle ignores mid-call events;
  outgoing ringing ignores local-answer & reject; incoming ringing ignores participant-join; offering
  ignores the (cancelled) ring timeout; connecting ignores a pre-media stall; connected ignores a
  redundant media-connected; the reconnect-budget boundary (`attempt >= max` → `ConnectionLost`, both
  default max=3 and max=1); ended is inert and keeps its original reason; plus three end-to-end folds
  (outgoing happy path, incoming happy path, stall→reconnect→recover).
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (debug APK assembles, all
  modules' JVM unit tests green; `CallStateMachineTest` 31/31). Diff is `apps/android` only.
- **Reviewer gate:** PASS — pure stateless building block (SDK-purity respected), behaviour tested
  through the public `reduce` API (no tautologies, no reflection), near-total branch coverage incl. the
  inert/no-op and boundary arms, no coverage floor touched.

### 2026-06-30 — slice `story-sticker-picker-search` ⚠ blocked (PR #1135, merge-blocked on red `main`)
- **Status:** implementation + tests + reviewer gate all **DONE/PASS**; merge **blocked** by a
  **pre-existing, unrelated** failure on `main`. The monorepo CI's `Test web` job fails on a single
  web a11y test — `__tests__/components/conversations/invite-user-modal.test.tsx:493`
  (`getByRole('button', { name: 'John Doe déjà sélectionné' })` → `toBeDisabled`); **1 failed /
  10 769 passed**, all in that one web file. My diff is `apps/android` only and touches **zero** web
  code, so it cannot have caused this — it is the same broken-`main` regression open PR #1131 documents
  and carries the fix for. I can't fix it here (editing `invite-user-modal.tsx` is web production logic,
  which breaks the "diff is apps/android only" hard gate). **Unblock:** once `main` goes green (a fix
  like #1131 merges), rebase this branch onto it (`update_pull_request_branch`) → CI re-runs green →
  squash-merge. The `*/8 min` self-check cron (`b4133933`) re-checks and will rebase + merge when `main`
  is green. **Do NOT merge past this red CI** (hard rule).
- **Branch:** `claude/apps/android/story-sticker-picker-search` (off `origin/main` @ `a751730f`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open` → only
  dependabot + non-android `claude/*` branches: #1133 ios-calls, #1132 translator, #1131 gateway, #1130
  gateway-coverage). Branched clean off the freshened `origin/main`.
- **What:** the **categorised + searchable** emoji sticker picker (feature-parity §Stories + audit
  part-21 `StickerPickerView`), replacing the old flat `STORY_STICKER_EMOJIS` palette. iOS parity: 8
  category tabs (smileys/animals/food/activities/travel/objects/symbols/flags) + a search field; a
  non-blank query searches across **all** categories.
- **Design (single source of truth, SDK purity):** two pure types in `:feature:stories` (composer
  product logic, mirroring where `StoryStickerElement` lives). `StickerCatalog` — `enum StickerCategory`
  (8, tab order), `data class StickerEntry(emoji, category, keywords)`, the curated catalogue (~16
  keyworded emojis/category, every glyph in exactly one category so `all` is duplicate-free),
  `inCategory(cat)`, `all`, and `search(query, category?)`: trim+lowercase substring over keywords **or**
  the glyph itself, blank query ⇒ whole scope unfiltered, result preserves catalogue order + `distinct`.
  `StickerPickerState(category, query)` — the product reducer: `isSearching` (non-blank), `visibleEmojis`
  (global `search` while searching so the tab is intentionally ignored, else the tab's emojis),
  `withCategory`/`withQuery` (inert/same-instance on no-op). The decision lives in one unit-tested place;
  the dialog stays glue.
- **Changed (production — all `:feature:stories`, `apps/android` only):** `StickerCatalog.kt` (new),
  `StoryComposerScreen.kt` (`StickerPickerDialog` → search field + `FilterChip` tab row + filtered grid +
  empty-state; removed `STORY_STICKER_EMOJIS`), `values{,-fr,-es,-pt}/strings.xml` (10 strings × 4 locales:
  search hint, no-results, 8 category labels).
- **Tests (+22, red→green):** `StickerCatalogTest` — catalogue shape (every category non-empty,
  `inCategory` order, `all` = concat + duplicate-free + tab order), search (blank ⇒ scope, category-scoped
  blank, keyword match, case-insensitive + trim, substring, spans-all-categories, category-scoped excludes
  others, glyph match, no-match ⇒ empty, order-preserving + distinct), reducer (default smileys/not-
  searching, tab select, whitespace not searching, query searches-all-ignoring-tab, clear ⇒ tab,
  `withCategory`/`withQuery` inert, select-tab-while-searching keeps global result). First RED caught a
  real duplicate (`⭐` in OBJECTS+SYMBOLS) → fixed to `☮️`. No floor lowered, no test weakened.
- **Edge cases:** empty/blank/whitespace query, no-match (empty grid → empty-state), single-category
  scope, glyph-as-query, duplicate-free, idempotent reducer transitions (same instance).
- **Verify:** `./gradlew assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (debug APK assembles; all
  modules' unit tests green; `StickerCatalogTest` 22/22). Diff = `apps/android` only.
- **Reviewer gate:** PASS — pure behaviour through the public API, no tautologies, SDK purity respected
  (pure catalogue/reducer in `:feature:stories`, dialog is glue), single source of truth (catalogue
  replaces the flat palette), UX coherence (natural tabs + live search, no dead-end — empty-state).

### 2026-06-30 — slice `story-sticker-elements` ✅
- **Branch:** `claude/apps/android/story-sticker-elements` (off `origin/main` @ `d06d5ec`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open` → only
  dependabot + non-android `claude/*` branches; the prior slice `story-photo-filters` is already merged).
  Branched clean off the freshened `origin/main`.
- **What:** **on-canvas emoji stickers** for story slides — the second **real Contenu/Effets tile**
  (feature-parity §Stories "Emoji sticker picker"). A user taps a "Sticker" tile in the Contenu drawer,
  picks an emoji from a grid, and it lands on the 9:16 canvas where it can be dragged, pinch-zoomed/rotated
  and removed; it rides into publish on the existing `StoryEffects.stickerObjects` wire (no dead end — the
  gateway model `StorySticker` already existed).
- **Design (single source of truth, SDK purity):** pure immutable `StoryStickerElement`
  (`:feature:stories`, composer **product** state) mirroring `StoryTextElement` — normalised `x/y`, clamped
  `scale`, wrapped `rotationDeg`, `isPublishable`, `normalised`/`transformed`/`nudged`, `toSticker()` wire.
  To keep canvas geometry in **one** place it **reuses** `StoryTextElement.clampCoord`/`clampScale`/
  `normaliseRotation`. The deck is the source of truth: `StorySlide.stickers` + total reducers
  `addStickerToSelected`/`removeSticker`/`updateSticker`/`moveSticker`/`transformSticker` (same-instance
  when inert), `MAX_STICKERS_PER_SLIDE=30` (iOS has no hard composer cap — generous SOTA bound),
  `hasStickers`/`isWithinStickerLimit`/`selectedRemainingStickerSlots`/`selectedCanAddSticker`;
  `publishableSlides` now admits a sticker-only slide. The VM adds
  `onAddSticker`/`onSelectSticker`/`onDeselectSticker`/`onRemoveSticker`/`onStickerMoved`/
  `onStickerTransform` with sticker selection **mutually exclusive** vs the text-element edit (each clears
  the other; a slide switch clears a stale selection in `mirrorDraftToSelection`). `publishPlans` threads
  each slide's stickers into its per-slide draft.
- **Changed (production — all `:feature:stories`, `apps/android` only):** `StoryStickerElement.kt` (new),
  `StorySlideDeck.kt`, `StoryComposerDraft.kt`, `StoryComposerViewModel.kt`, `ComposerBandState.kt`
  (`ComposerContentTile.STICKER`), `StoryComposerScreen.kt` (Contenu Sticker tile → `StickerPickerDialog`
  emoji grid; on-canvas `StickerLayer` drag/pinch/rotate/remove; `StoryCanvasSurface` threads sticker
  state — glue), `values{,-fr,-es,-pt}/strings.xml` (2 strings × 4 locales).
- **Tests (TDD red → green, behaviour via public API): +~53.** `StoryStickerElementTest` (new, +15) —
  defaults, publishability, normalised coord/scale/rotation/non-finite/no-op, transformed clamps + wrap +
  isolation, nudged clamp/free, toSticker. `StorySlideDeckStickersTest` (new, +21) — add selected-only/
  clamp/preserve-selection/dup-inert/cap-inert, remaining-slots, remove holding/unknown, update
  match-reclamp/unknown, move clamp/unknown, transform scale+rotate/clamp/isolation/unknown, limit at/over,
  hasStickers blank vs real, sticker-only publishable, blank-only not. `StoryComposerDraftTest` (+5) —
  stickerObjects serialise + drop blanks, sticker-only payload, no-sticker null, sticker-only publishable,
  blank-only not. `StoryComposerViewModelTest` (+~12) — add+select+publishable, blank ignored, add clears
  text edit, select-text clears sticker, cap warning, select-unknown inert, move clamp, transform
  accumulate, transform-unknown unchanged, remove clears selection, deselect, slide-switch clears stale,
  publish carries stickerObjects. `ComposerBandStateTest` — STICKER tile category + contentTiles order.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + full
  `testDebugUnitTest`, 836 tasks; `:feature:stories` green incl. the new suites). Diff = `apps/android`
  only (6 prod Kotlin incl. 1 new, 4 strings, 4 test incl. 2 new, tracking docs).
- **Reviewer verdict:** **PASS** — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API (no floor lowered; 2 band tests *expanded*,
  not weakened); SDK purity (sticker math + reducers product state in `:feature:stories`, glue in the
  Composable, wire `StorySticker` reused from `core/model`); single source of truth (geometry reused from
  `StoryTextElement`, wire token reused); UDF (VM + immutable `StateFlow`, transitions pure); edge cases
  (cap, dup id, unknown id inert, blank emoji, clamp, per-slide isolation, mutual-exclusive selection,
  slide-switch stale clear); colour/UX coherence (EmojiEmotions tile in the Contenu drawer like the other
  tiles, natural drag/pinch/remove mirroring text elements, picker places a publishable sticker — no dead
  end).
- **Follow-ups:** the **categorised + searchable** sticker picker (palette is a flat curated set today);
  remaining Effets tiles (freehand drawing, backgrounds, timeline); a unified multi-element context menu;
  then advance to **Calls**.

### 2026-06-30 — slice `story-photo-filters` ✅
- **Branch:** `claude/apps/android/story-photo-filters` (off `origin/main` @ `444a983`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; the prior slice `story-text-element-zorder` is merged as
  **#1062**). Branched clean off the freshened `origin/main`.
- **What:** **8 photo filters with adjustable strength** for story slides (feature-parity §Stories
  "8 photo filters … with intensity" — now checked; the first **real Effets tile**, which previously
  surfaced only visibility). Each slide can apply one of the iOS presets (vintage / b&w / warm / cool /
  dramatic / vivid / fade / chrome) and dial its strength; the canvas shows it live and it rides into
  publish. The wire already had `StoryFilter` + `StoryEffects.filter`/`filterIntensity`, so it is no
  dead end.
- **Design (single source of truth, SDK purity):** the *look* lives in **one** pure, Compose-agnostic
  place — `StoryFilterMatrix` (`:feature:stories`, composer product math): `StoryColorMatrix` wraps a
  20-float 4×5 matrix as a `List<Float>` (value equality so it JVM-tests), `baseMatrix(StoryFilter)`
  gives each preset's full matrix, and `effectiveMatrix(filter, intensity)` blends the base toward the
  neutral `IDENTITY` by `clampIntensity` (0 ⇒ identity, 1 ⇒ base, non-finite ⇒ full default); `blend`
  short-circuits the `k≤0`/`k≥1` endpoints so "full strength == base" is exact (no float drift) and
  `StoryFilter.wireValue()` is the lone enum→gateway-token mapping, kept beside the matrices so the look
  and the wire value never diverge. Per-slide state: `StorySlide.filter`/`filterIntensity` + the deck
  reducers `setSelectedFilter`/`setSelectedFilterIntensity` (clamp in one place, only the selected slide,
  selection preserved; `duplicate` carries the look for free). The VM adds `onSelectFilter`/
  `onFilterIntensityChange` (one-line `applyDeck`, element-edit selection preserved) and the derived
  `selectedSlideFilter`/`selectedSlideFilterIntensity`/`selectedSlideFilterMatrix`. The composer draft
  gains `filter`/`filterIntensity`; `storyEffects()` now emits a payload when there are text objects
  **or** a filter (a filter-only slide still serialises), and `publishPlans` threads each slide's look.
- **Changed (production — all `:feature:stories`, `apps/android` only):**
  - `StoryFilterMatrix.kt` (new) — `StoryColorMatrix` (+`IDENTITY`/`blend`), `StoryFilterMatrix`
    (`DEFAULT_INTENSITY`/`clampIntensity`/`baseMatrix`/`effectiveMatrix`), `StoryFilter.wireValue()`.
  - `StorySlideDeck.kt` — `StorySlide.filter`/`filterIntensity`; `setSelectedFilter`/
    `setSelectedFilterIntensity` reducers.
  - `StoryComposerViewModel.kt` — derived filter state; `onSelectFilter`/`onFilterIntensityChange`;
    per-slide publish draft carries the look.
  - `StoryComposerDraft.kt` — `filter`/`filterIntensity` + `withFilter`; `storyEffects` serialises the
    filter + clamped strength.
  - `StoryComposerScreen.kt` — canvas `AsyncImage` `ColorFilter.colorMatrix(...)`; `FilterRow` (None + 8
    chips) + strength `Slider` in the Effets drawer (glue).
  - `values{,-fr,-es,-pt}/strings.xml` — 11 strings × 4 locales (intensity label, None, 8 names).
- **Tests (TDD red → green, behaviour via public API): +43.**
  - `StoryFilterMatrixTest` (new, +21): identity shape + 20-component require; blend at 0/1/half +
    negative/over-one clamp; effectiveMatrix null/0/1/half/clamp-both/non-finite; clampIntensity bounds +
    non-finite→default; every preset ≠ identity; all 8 distinct; BW row-equality; wireValue per preset +
    all distinct.
  - `StorySlideDeckFilterTest` (new, +10): fresh slide defaults; setSelectedFilter selected-only /
    preserves selection / clears with null / leaves text+media; setSelectedFilterIntensity sets /
    clamps over / clamps under / selected-only; duplicate carries the look.
  - `StoryComposerViewModelTest` (+7): select applies + matrix; clear → identity matrix; intensity
    blends; intensity clamp; filter stays on its slide across selection; select keeps element edit.
  - `StoryComposerDraftTest` (+5): filter + strength on the wire; filter-only payload; no-filter null
    fields; clamped strength on the wire.
  - **Branch sweep:** every arm of `blend` (k≤0 / k≥1 / interior), `clampIntensity` (finite / non-finite),
    `effectiveMatrix` (null / filter), `baseMatrix` (all 8), `wireValue` (all 8), and both deck reducers
    (selected vs other slide) is exercised.
- **RED→GREEN note:** the first run had 3 reds — `blend(.., 1f)` drifted by an ULP (`a+(b-a)*1f ≠ b` in
  float), so `isEqualTo(base)` failed at full strength. Fixed by short-circuiting the blend endpoints
  (also the correct design: exact identity/base at the extremes). Recorded in NOTES.md.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + all JVM
  unit tests, 836 tasks; `StoryFilterMatrixTest` 21/21, `StorySlideDeckFilterTest` 10/10, 0 failures).
  Diff = `apps/android` only (5 prod Kotlin incl. 1 new, 4 strings, 3 test incl. 2 new, tracking docs).
- **Reviewer verdict:** **PASS** — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API (no floor lowered); SDK purity (filter math +
  reducers are composer **product** state in `:feature:stories`, glue in the Composable, wire enum reused
  from `core/model`); single source of truth (matrices + wire token + clamp each in one place); UDF (VM +
  immutable `StateFlow`, transitions pure); edge cases (intensity 0/1/clamp/non-finite, null filter,
  per-slide isolation, duplicate-carry); colour/UX coherence (Effets chips reuse Material `FilterChip`
  like the visibility row, live canvas preview, filter-only slide still publishes — no dead end).
- **Follow-ups:** the remaining Effets tiles (freehand drawing, emoji stickers, backgrounds, timeline);
  then a unified multi-element context menu; then advance to **Calls**.

### 2026-06-30 — slice `story-text-element-zorder` ✅
- **Branch:** `claude/apps/android/story-text-element-zorder` (off `origin/main` @ `de08134`).
- **Housekeeping (step 0):** the prior slice's PR **#1048** (`story-canvas-snap-guides`) was found **open
  with merge conflicts** (main had advanced past its base with `story-composer-band` + the gateway test
  slices). Fetched both refs, **rebased the PR branch onto `origin/main`**, resolved 3 conflicts —
  `StoryComposerViewModel.kt` (kept **both** `band` + `snapFeedback` state fields),
  `StoryComposerScreen.kt` (kept **both** import sets), `PROGRESS.md` (kept **both** next-slice + run-log
  entries) — per the "keep BOTH sides" rule. Verified the resolution with `meeshy.sh check` (BUILD
  SUCCESSFUL) before pushing. The maintainer then squash/merge-committed #1048 to `main` (commit
  `de08134`); local `main` reset to it (clean, no markers). Branched this slice off that fresh `main`.
- **What:** **z-order management** for on-canvas text elements (feature-parity §Stories "Z-order
  management (front/back, forward/backward) persisted for WYSIWYG playback" — now checked). The slide's
  `elements` list order *is* the paint order (index 0 = back, last = front, matching the canvas
  `forEach` render), so restacking an element = a list move within its slide. A 4-button z-order row in
  the floating `TextStyleToolbar` (send-to-back / backward / forward / bring-to-front) drives it.
- **Design (SDK purity, single source of truth):** the order rule lives in **one** pure place,
  `StorySlideDeck.reorderTextElement(id, op: StoryZOrder)`. The new top-level `StoryZOrder` enum
  (`TO_BACK | BACKWARD | FORWARD | TO_FRONT`) maps to a target index (`0` / `from-1` / `from+1` /
  `lastIndex`) `coerceIn`-clamped to the list bounds; `target == from` (already-extreme / single
  element) and an unknown id both return the **same instance**. Only the element's holding slide is
  restacked (located by id, so it works on a non-selected slide); the others and the selection are
  untouched. `StoryComposerViewModel.onReorderTextElement` wraps it and keeps the same **state**
  instance on an inert move (`deck === state.deck` ⇒ no `copy`), so an inert tap never churns
  recomposition. Selection/editing untouched — you restack the element you're editing.
- **Changed (production — all `:feature:stories`, `apps/android` only):**
  - `StorySlideDeck.kt` — new `StoryZOrder` enum + pure `reorderTextElement` reducer.
  - `StoryComposerViewModel.kt` — `onReorderTextElement` intent (same-instance on inert).
  - `StoryComposerScreen.kt` — z-order row in `TextStyleToolbar` + `ZOrderButton` glue + 4 icon imports.
  - `values{,-fr,-es,-pt}/strings.xml` — 4 z-order content-description strings × 4 locales.
- **Tests (TDD red → green, behaviour via public API): +16**
  - `StorySlideDeckZOrderTest` (+13): TO_FRONT/TO_BACK move + keep others' order; FORWARD/BACKWARD
    single-step swap; each op inert at its extreme; unknown id inert (all ops); single-element slide
    inert (all ops); restacks only the holding slide; finds element on a non-selected slide + preserves
    selection; preserves the moved element's content.
  - `StoryComposerViewModelTest` (+3): TO_BACK restacks + keeps the element selected + still editing;
    TO_FRONT restacks; unknown id leaves the **same** state instance.
  - **Branch sweep:** every arm of the `when(op)` (4), the `coerceIn` bound + `target == from` inert
    arm, the `slideIndex < 0` inert arm, and the VM same-instance vs copy arms are exercised.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + all JVM
  unit tests; `StorySlideDeckZOrderTest` 13/13, the 3 VM cases green). Diff = `apps/android` only
  (3 source + 4 strings + 2 test + tracking). **Reviewer rubric: PASS** — pure logic full branch
  coverage, behaviour-only tests (incl. same-instance no-churn), no floor lowered, reuse of the
  existing slide/element model (no new reducer family), accent-coherent toolbar, no dead-end.

### 2026-06-30 — slice `story-canvas-snap-guides` ✅
- **Branch:** `claude/apps/android/story-canvas-snap-guides` (off `origin/main` @ `49c7576`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (the prior slice's PR #1045 is **merged**;
  `list_pull_requests state=open` shows only dependabot/non-android `claude/*` branches). ⚠ Pitfall hit &
  fixed: `git pull origin main` failed (`Need to specify how to reconcile divergent branches` — no pull
  strategy configured), and the local `main` was **stale** (missing PR #1045). A branch cut from it lost
  the `scale`/`rotation` fields. Recovered with `git fetch origin main && git checkout -B <slice> origin/main`.
  **Lesson recorded in NOTES.md:** always rebase the slice onto `origin/main`, never local `main`.
- **What:** **snap-to-guide + out-of-bounds (safe-zone) warning** for on-canvas element dragging
  (feature-parity §Stories "Frosted-glass … safe-zone overlay; snap-to-guide + out-of-bounds warning").
  Dragging a text element now magnetically locks each axis onto the nearest alignment guide (rule-of-thirds
  + centre) and flashes an out-of-bounds border when the centre drifts into the edge margin. A natural
  magnetic-alignment gesture — surpasses iOS, which lacks a per-axis guide overlay here.
- **Design (SDK purity, single source of truth):** the snap math lives in **one** pure place,
  `StorySnapResolver.resolve(x, y, verticalGuides, horizontalGuides, threshold, safeZoneInset)` →
  `SnapResult(x, y, verticalGuide, horizontalGuide, withinSafeZone)`. Each axis snaps **independently**
  (nearest in-range guide within `SNAP_THRESHOLD=0.025`; else the clamped candidate); non-finite →
  canvas centre; out-of-canvas → clamped `0f..1f`; `withinSafeZone` uses `SAFE_ZONE_INSET=0.06`. **Reuse,
  no new reducer:** `onTextElementMoved` now runs its resulting centre through the resolver and moves the
  element by the snap-**adjusted** delta via the existing `StorySlideDeck.moveTextElement` path, exposing
  the live guides + verdict as transient `StoryComposerUiState.snapFeedback` (immutable `SnapFeedback`),
  cleared by the new `onTextElementDragEnd()` on lift. The Composable stays glue: a `Canvas` draws the
  active guide line(s) (accent `primary`) + an `error` warning border, and a non-consuming `Final`-pass
  `awaitEachGesture` next to the transform detector signals lift.
- **Changed (production — all `:feature:stories`, `apps/android` only):**
  - `StorySnapResolver.kt` (new) — pure `SnapResult` + `StorySnapResolver` (guides/threshold/inset consts,
    per-axis `snapAxis`, `withinSafeZone`, non-finite/clamp handling).
  - `StoryComposerViewModel.kt` — `SnapFeedback` immutable type, `StoryComposerUiState.snapFeedback`,
    snap-aware `onTextElementMoved`, new `onTextElementDragEnd`.
  - `StoryComposerScreen.kt` — guide-line `Canvas` overlay, safe-zone warning border, `onDragEnd` wiring +
    `Final`-pass drag-end detector (glue).
- **Tests (TDD red → green, behaviour via public API): +25**
  - `StorySnapResolverTest` (+18): free drag; between-guides-no-snap; centre snap (both axes); thirds snap;
    independent axes; threshold inclusive boundary; just-past-threshold free; non-positive threshold off;
    empty guides; out-of-range guides filtered; only-out-of-range no-snap; out-of-canvas clamp; non-finite →
    centre; safe-zone inclusive inset; out-of-bounds left/right/bottom.
  - `StoryComposerViewModelTest` (+7): centre-snap holds element + reports guides; past-threshold free no
    guides; edge drag → out-of-safe-zone; unknown-id inert (no feedback); existing clamp test preserved;
    drag-end clears feedback keeps placement; drag-end inert when no feedback (same-instance).
  - **Branch sweep:** every arm of `snapAxis` (threshold≤0 / empty / nearest-within / nearest-beyond),
    `clampCoord` (finite / non-finite), `withinSafeZone` (in / out per edge), and the VM intents (known /
    unknown id, feedback present / absent) is exercised.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + all JVM
  unit tests; `:feature:stories` 494 tests green). Diff = `apps/android` only (3 source + 2 test + tracking).
  **Reviewer rubric: PASS** — pure logic ≥90% branch, behaviour-only tests, no floor lowered, reuse over new
  reducer, accent-coherent guides, natural gesture, no dead-end.
### 2026-06-30 — slice `story-text-element-duplicate` ✅
- **Branch:** `claude/apps/android/story-text-element-duplicate` (off `origin/main` @ `f6af058`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; every prior slice already squash-merged, incl.
  `story-composer-band` as #1052). Branched clean off the freshened `main`.
- **What:** **per-element duplicate** (named follow-up of `story-text-element-transform`;
  feature-parity §"Multi-element context menu (edit, duplicate, reorder, delete)"). A selected
  on-canvas text element gains a duplicate handle in the floating style toolbar — one tap clones it,
  offset just clear of the original, and selects the copy so the user can immediately move/style it.
  No new gateway-wire model: a cloned element serialises through the existing `toTextObject`.
- **Design (single source of truth, SDK purity):** the clone/cap/offset rules live in **one pure
  place**, `StorySlideDeck.duplicateTextElement(sourceId, newId, dx, dy)` (`:feature:stories`, composer
  **product** state — not an SDK atom): finds the slide holding the source, inserts a `copy(id=newId)`
  (carrying every styled field) **immediately after it**, nudged by `dx/dy` and clamped into the canvas
  via the already-tested `StoryTextElement.nudged`, and is inert (same instance) on an unknown source
  id, a colliding new id, or a slide already at the `MAX_TEXT_ELEMENTS_PER_SLIDE` cap — so the
  ≤5-per-slide invariant holds in one place. The deck doesn't own selection; the VM does. The VM intent
  `onDuplicateTextElement(id)` mints the id (impure edge), warns-without-adding at the cap (mirrors
  `onAddTextElement`), applies the pure reducer, and selects the copy. The Composable stays glue (a
  `ContentCopy` `IconButton` in the `TextStyleToolbar`).
- **Added/changed (production, `apps/android` only — all `:feature:stories`):**
  - `StorySlideDeck.kt` — new pure `duplicateTextElement(sourceId, newId, dx, dy)` (collision/unknown/cap
    guards + after-source insertion + clamped offset).
  - `StoryComposerViewModel.kt` — `onDuplicateTextElement(id)` intent (selected-slide guard → cap warning
    → mint id → pure duplicate → select copy); new `DUPLICATE_ELEMENT_OFFSET = 0.04f` const.
  - `StoryComposerScreen.kt` — `TextStyleToolbar` gains an `onDuplicate` slot rendered as a `ContentCopy`
    handle next to the alignment toggles; wired to `onDuplicateTextElement`. (Glue — JVM-exempt.)
  - `strings.xml` (+ fr/es/pt) — 1 new string (duplicate-element content description).
- **Tests (TDD red → green, behaviour via the public API): +11.**
  - `StorySlideDeckTextElementsTest` (+7): clones content with the new id right after the source;
    copies every styled field (text/style/colour/align/scale/rotation); offsets + clamps the clone into
    the canvas; duplicates an element on a **non-selected** slide (selection untouched); inert on unknown
    source id; inert on colliding new id; inert at the per-slide cap.
  - `StoryComposerViewModelTest` (+4): clones the edited element, offsets it, and selects the copy;
    carries the source style onto the copy; at the cap surfaces a warning and adds nothing; unknown id
    is inert and selects nothing new.
- **Branch sweep:** every arm of `duplicateTextElement` (collision-inert, unknown-inert, cap-inert,
  success-insert-after) and `onDuplicateTextElement` (not-on-slide-inert, cap-warning, success-select)
  is exercised. ≥90% branch + instruction on the new pure logic.
- **Verification:** `./apps/android/meeshy.sh test` → **BUILD SUCCESSFUL** (all JVM unit tests;
  `StorySlideDeckTextElementsTest` 27/27, `StoryComposerViewModelTest` 102/102, 0 failures);
  `./apps/android/meeshy.sh build` → **BUILD SUCCESSFUL** (`assembleDebug` APK). Diff = `apps/android`
  only (3 prod Kotlin, 4 strings, 2 test, tracking docs).
- **Reviewer verdict:** **PASS** — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API (no floor lowered); SDK purity (clone/cap
  rules pure in `:feature:stories`, glue in the Composable); single source of truth (clone + clamp each
  in one place, reuses `nudged`); UDF (VM + immutable `StateFlow`, transition pure); edge cases
  (unknown/collision/cap/non-selected-slide/offset-clamp); colour/UX coherence (duplicate handle uses
  `MaterialTheme` onSurfaceVariant tint, natural placement beside the align toggles, copy auto-selected).
- **Follow-ups:** unified multi-element context menu + z-order reorder; real Effets tiles; then Calls.

### 2026-06-30 — slice `story-composer-band` ✅
- **Branch:** `claude/apps/android/story-composer-band` (off `origin/main` @ `4dee364`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; every prior slice already squash-merged). Branched clean
  off the freshened `main`.
- **What:** **the composer's FAB + bottom-band toolbar** ("Next" #1, feature-parity §"9:16 canvas …
  FAB + bottom-band toolbar (Contenu/Effets)"). The flat add-text / add-media / visibility buttons are
  replaced by a two-FAB (Contenu / Effets) bottom band that animates a tools drawer in above the FABs —
  the **pure value-type port of iOS `BandStateMachine`** (audit part-21: "Excellent design; carry it
  over verbatim … ideal candidate for shared unit-tested code").
- **Design (single source of truth, SDK purity):** all band navigation lives in **one pure place**,
  `ComposerBandState` (`:feature:stories` — composer **product** state, not an SDK atom): a sealed
  `Hidden | Tiles(BandCategory)` with `BandCategory {CONTENU, EFFETS}` (+ `swapped`) and the total
  transitions `tapFab(category)` (open / switch / toggle-close), `swipeDown()` (dismiss), and
  `swipeHorizontal()` (swap, inert while hidden); `activeCategory`/`isVisible` derive the render.
  `ComposerContentTile {TEXT, MEDIA}` + `ComposerBand.contentTiles` enumerate the Contenu tiles. The
  VM holds `band` and applies the pure transitions (`onBandFabTap`/`onBandDismiss`/`onBandSwapCategory`);
  the Composable is glue (two `ExtendedFloatingActionButton`s, an `AnimatedVisibility` drawer showing
  Contenu tiles → existing `onAddTextElement` / system picker, or the Effets `VisibilityRow`, with
  swipe-down-to-dismiss + swipe-horizontal-to-swap `detectVerticalDragGestures`/`detectHorizontalDrag`).
- **Added/changed (production, `apps/android` only — all `:feature:stories`):**
  - `ComposerBandState.kt` (new) — `BandCategory` (+`swapped`), `ComposerContentTile` (+`category`),
    sealed `ComposerBandState` (`Hidden`/`Tiles` + `activeCategory`/`isVisible`/`tapFab`/`swipeDown`/
    `swipeHorizontal`), `ComposerBand.contentTiles`.
  - `StoryComposerViewModel.kt` — `StoryComposerUiState.band: ComposerBandState = Hidden`;
    `onBandFabTap`/`onBandDismiss`/`onBandSwapCategory` intents (each a one-line pure-transition copy).
  - `StoryComposerScreen.kt` — the flat add-text/add-media/visibility block replaced by a glue
    `ComposerControlsLayer` (FAB row + animated drawer), `BandFab`, `ContentTilesRow`, `BandTile`;
    `VisibilityRow` gains a `modifier` param. Removed the now-unused fixed buttons.
  - `strings.xml` (+ fr/es/pt) — 3 new strings (Contenu / Effets / close-tools content desc).
- **Tests (TDD red → green, behaviour via the public API): +18.**
  - `ComposerBandStateTest` (new, +11): `swapped` round-trip; content-tile category; hidden has no
    active category / not visible; open band exposes category + visible; `tapFab` open-from-hidden /
    toggle-close-same / switch-other (both categories); `swipeDown` from any state incl. already-hidden;
    `swipeHorizontal` swap (both) + inert-while-hidden; `contentTiles` order.
  - `StoryComposerViewModelTest` (+7): band starts hidden; FAB opens category; same-FAB toggle-closes;
    other-FAB switches; dismiss hides; swap flips Contenu→Effets; swap inert while hidden.
- **Branch sweep:** every arm of `tapFab` (same→Hidden, other→switch, hidden→open), `swipeHorizontal`
  (Tiles→swap, Hidden→inert), `swipeDown`, `activeCategory`/`isVisible` (both variants), `swapped`
  (both) and `category` are exercised. ≥90% branch + instruction on the new pure logic.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (`assembleDebug` APK + all
  JVM unit tests, 836 tasks). `ComposerBandStateTest` 11/11, `StoryComposerViewModelTest` (band) 7/7.
  Diff = `apps/android` only (3 prod Kotlin incl. 1 new, 4 strings, 2 test incl. 1 new, tracking docs).
- **Reviewer verdict:** **PASS** — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API (no floor lowered); SDK purity (pure band
  state is composer **product** state in `:feature:stories`, glue in the Composable); single source of
  truth (all band navigation in one pure value type); UDF (VM + immutable `StateFlow`, transitions pure);
  colour/UX coherence (FABs use `MaterialTheme` primary / secondaryContainer, natural tap + swipe
  gestures, both categories carry real content so no dead-end drawer, dismissal returns to FAB-only).
- **Follow-ups:** real Effets tiles (filters / drawing / timeline); on-canvas sticker / drawing elements.

### 2026-06-29 — slice `story-text-element-transform` ✅
- **Branch:** `claude/apps/android/story-text-element-transform` (off `origin/main` @ `c3963d5`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open` → 24 open
  PRs, all dependabot or non-android `claude/*`; none on an `apps/android` branch). Branched clean off the
  freshened `main`.
- **What:** **per-element pinch-scale + rotate** on the story composer canvas ("Next" #2,
  feature-parity §"In-place floating text editor"/handles). A selected on-canvas text element can now be
  pinched to resize and twisted to rotate with one natural two-finger gesture, and the transform rides
  into publish on the gateway wire (`StoryTextObject.scale`/`rotation`, already in the model, previously
  always left at defaults). Chose a direct-manipulation gesture over discrete handle chips per the
  CLAUDE.md "natural gestures / coherent single view" rule.
- **Design (single source of truth, SDK purity):** the clamp/wrap rules live in **one pure place**,
  `StoryTextElement` (`:feature:stories`, product UI math — not an SDK atom): `scale` clamped to
  `[MIN_SCALE=0.3, MAX_SCALE=4]`, `rotationDeg` wrapped to the canonical half-open turn `(-180, 180]`
  (any accumulated full turns reduce to one signed angle; `±180` both resolve to `180`). `clampScale`
  collapses a non-finite factor to `DEFAULT_SCALE`; `normaliseRotation` collapses non-finite to `0`. The
  incremental gesture op `transformed(scaleBy, rotateByDeg)` multiplies scale / adds rotation then
  clamps+wraps, so a `scaleBy <= 0` or `NaN` can never poison the element. `normalised()` now re-pulls
  **all** continuous fields (x/y/scale/rotation) into range, so every `updateTextElement` re-clamps for
  free. The Composable stays glue (`detectTransformGestures` → VM; `graphicsLayer` scaleX/scaleY/rotationZ).
- **Added/changed (production, `apps/android` only — all `:feature:stories`):**
  - `StoryTextElement.kt` — `scale`/`rotationDeg` fields (+ DEFAULT/MIN/MAX/DEFAULT_ROTATION consts);
    pure `clampScale`/`normaliseRotation`; `transformed(scaleBy, rotateByDeg)`; `normalised()` extended;
    `toTextObject` now sets `scale`/`rotation`.
  - `StorySlideDeck.kt` — `transformTextElement(id, scaleBy, rotateByDeg)` (inert on unknown id,
    re-clamp via `updateTextElement`'s `.normalised()`).
  - `StoryComposerViewModel.kt` — `onTextElementTransform(id, scaleBy, rotateByDeg)` (selection/editing
    untouched, unknown-id inert).
  - `StoryComposerScreen.kt` — `StoryCanvasSurface`/`TextElementLayer` thread an `onElementTransform`
    callback; the per-element gesture switched `detectDragGestures` → `detectTransformGestures` (one
    gesture pans+pinches+rotates); `graphicsLayer { scaleX/scaleY = scale; rotationZ = rotationDeg }`
    renders it. Removed the now-unused `detectDragGestures` import. (Glue — JVM-exempt.)
- **Tests (TDD red → green, behaviour via the public API): +21.**
  - `StoryTextElementTest` (+14): defaults at rest; `transformed` scale multiply / clamp ceiling /
    clamp floor / non-positive→floor / non-finite→default; rotation add / wrap-positive / wrap-negative;
    identity+text+style+position preserved; `clampScale` bounds+passthrough+∞; `normaliseRotation`
    canonical turn incl. `±180`/`360`/`540`/`270`/`NaN`; `normalised` clamps scale+wraps rotation /
    leaves valid untouched; `toTextObject` carries scale+rotation.
  - `StorySlideDeckTextElementsTest` (+4): applies; clamps; touches only the matching element; inert id.
  - `StoryComposerViewModelTest` (+3): applies + keeps editing; accumulates across gestures + clamps;
    inert id.
  - Class totals after: `StoryTextElementTest`=25, `StorySlideDeckTextElementsTest`=20,
    `StoryComposerViewModelTest`=91 — all green, 0 failures/errors.
- **Branch sweep:** every arm of `clampScale` (finite-coerce both bounds + passthrough; non-finite),
  `normaliseRotation` (non-finite; `<= -180`; `> 180`; passthrough), `transformed`, `transformTextElement`
  (apply/clamp/isolation/inert), and `onTextElementTransform` (apply/accumulate/inert) is exercised.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + all JVM
  unit tests). Diff = `apps/android` only (7 files: 4 prod `:feature:stories`, 3 test). No SDK/web/gateway
  /shared change — the `scale`/`rotation` wire fields already existed on `StoryTextObject`.
- **Reviewer verdict:** **PASS** — scope/safety clean, behavioural tests via public API (no tautologies,
  no floor lowered), edge cases (bounds, non-finite, unknown id, isolation) covered, SDK purity + single
  source of truth (clamp/wrap in one place) + UDF respected, natural-gesture UX coherence.

### 2026-06-29 — slice `story-floating-toolbar` ✅
- **Branch:** `claude/apps/android/story-floating-toolbar` (off `origin/main` @ `6cd1a3c`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; every prior slice already squash-merged). Branched clean
  off the freshened `main`.
- **What:** **in-place floating style toolbar** ("Next" #1, feature-parity §"In-place floating text
  editor"). The `TextStyleToolbar` previously sat in a fixed bottom column below the canvas; it now
  **floats over the canvas**, anchored just clear of the element being edited, and the composer shifts
  for the keyboard so the toolbar always lands in view. Surpasses iOS's fixed bottom style bar.
- **Design (single source of truth, SDK purity):** the placement decision lives in **one pure place**,
  `StoryToolbarPlacement.resolve(elementCenterYpx, elementHalfHeightPx, toolbarHeightPx, canvasHeightPx,
  gapPx)` → `ToolbarPlacement(topPx, ToolbarSide.ABOVE|BELOW)`. BELOW when `belowTop + toolbarHeight <=
  canvasHeight` (the band beneath the element fits the toolbar), otherwise ABOVE clamped into
  `[0, (canvasHeight - toolbarHeight).coerceAtLeast(0)]` — so the toolbar is never pushed off the top or
  past the bottom, and a canvas shorter than the toolbar pins it to the top. The **canvas itself** is the
  keyboard-aware region: the composer Column gains `imePadding()`, so when the keyboard opens the weighted
  9:16 canvas shrinks to the keyboard-free area and the resolver (fed that shrunk `canvasHeightPx`,
  `keyboardInset` folded into the measurement) keeps the toolbar visible — no fragile window-coordinate
  math, every resolver param is live. All in `:feature:stories` (product UI math, not an SDK atom).
- **Added/changed (production, `apps/android` only):**
  - `StoryToolbarPlacement.kt` (new) — `ToolbarSide` enum, `ToolbarPlacement` data class, the pure
    `resolve(...)` (total; below-fits / above / clamp-top / clamp-bottom / degenerate-canvas arms).
  - `StoryComposerScreen.kt` — root Column gains `imePadding()`; `StoryCanvasSurface` takes
    `selectedElement: StoryTextElement?` + a `floatingToolbar` slot, measures the selected element's
    half-height (`TextElementLayer.onMeasured`) and the toolbar's height, and offsets the floating
    `TextStyleToolbar` (translucent `surface` chip, rounded) to `placement.topPx`. The fixed bottom-band
    toolbar block was removed (the toolbar now only renders floating while editing an element).
- **Tests (TDD red → green, behaviour via the public resolver API):** `StoryToolbarPlacementTest` (new,
  +9): sits below when it fits; goes above on bottom-overflow; a shrunken (keyboard) canvas forces above;
  clamps to the top for a high element; clamps off the bottom in a tight band; a canvas shorter than the
  toolbar pins to top; gap honoured below **and** above; the exact-fit boundary still sits below.
- **Edge cases:** boundary `==` (exact fit → BELOW), degenerate `canvasHeight < toolbarHeight`
  (`coerceAtLeast(0)` → top), high element (clamp to 0), tight band (clamp to `clampMax`), gap on both
  sides. No floor lowered, no test weakened; assertions are exact computed pixels (no tautology).
- **Branch coverage (new logic):** every arm of `resolve` hit — below-fits, above in-range, above
  clamp-low (→0), above clamp-high (→clampMax incl. the `coerceAtLeast` floor). ≥90% branch + instruction.
- **Verification:** `./apps/android/meeshy.sh check` (`assembleDebug` + all `testDebugUnitTest`, 836
  tasks) — **BUILD SUCCESSFUL**. `StoryToolbarPlacementTest` 9/9 green. Diff = `apps/android` only
  (1 new prod Kotlin, 1 prod Kotlin changed, 1 new test, tracking docs).
- **Reviewer gate:** PASS — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API; SDK purity (pure placement math is composer
  **product** state in `:feature:stories`, glue in the Composable); single source of truth (anchor
  decision in one pure place); UDF (VM + immutable `StateFlow` untouched); colour/UX coherence (toolbar
  uses `MaterialTheme` surface, floats by natural anchor, keyboard-aware via `imePadding`).
- **Follow-ups:** canvas toolbar/FAB (Contenu/Effets); per-element rotate/scale transform handles; then Calls.

### 2026-06-29 — slice `story-text-element-styling` ✅
- **Branch:** `claude/apps/android/story-text-element-styling` (off `origin/main` @ `7f28c533`).
- **Housekeeping (step 0):** no open Android PR (`story-text-elements` and every prior slice already on
  `origin/main`); branched this slice clean off the latest main.
- **What:** **per-element text styling** ("Next" #1, feature-parity §"Text elements"). On-canvas text
  elements already carried `style`/`color`/`align`; this slice *renders* them and gives the user the
  picker to change them. Five iOS-parity faces (bold / neon / typewriter / handwriting / classic),
  a colour-swatch palette, and L/C/R alignment — all live on the element being edited.
- **Design (single source of truth, SDK purity):** the *look* of each style lives in **one pure,
  Compose-agnostic place**, `StoryTextStyle.typography()` → `StoryTextTypography`
  (`fontWeight`/`italic`/`family`/`letterSpacingEm`/`glow`) over the new `StoryTextFontFamily` token
  enum. Because the tokens hold no Compose types they unit-test on the JVM; the Composable maps a token
  to `FontFamily`/`FontStyle`/`Shadow` at the glue layer. The three mutators are one-line
  `deck.updateTextElement` wrappers (the clamp/identity rules already proven in the deck), so the VM stays
  thin and inert-on-unknown-id falls straight out of the existing reducer. All in `:feature:stories`
  (product styling, not an SDK atom).
- **Added/changed (production, `apps/android` only):**
  - `StoryTextElement.kt` — new `StoryTextFontFamily` enum, `StoryTextTypography` data class, and the pure
    `StoryTextStyle.typography()` mapping (total over the five cases).
  - `StoryComposerViewModel.kt` — `onTextElementStyle`/`onTextElementColor`/`onTextElementAlign` intents
    (each a `deck.updateTextElement` copy; selection/editing untouched; inert on unknown id).
  - `StoryComposerScreen.kt` — `TextElementLayer` now renders weight/slant/family/tracking + a neon glow
    `Shadow`; `StoryTextFontFamily.toFontFamily()` glue; a `TextStyleToolbar` (style chips + `AlignToggle`
    L/C/R + `ColorSwatch` row, shown only while editing an element) wired to the three new intents; a
    `STORY_TEXT_COLORS` palette (white first).
  - `strings.xml` (+ fr/es/pt) — 8 new strings (5 style names, 3 alignment content descriptions).
- **Tests (TDD red → green, behaviour via public API):**
  - `StoryTextTypographyTest` (new, +8): each of the five faces maps to its expected family/italic/glow,
    bold heavier than classic, every weight in `100..900`, tracking never negative, and all five resolve
    to **distinct** typographies (branch sweep over the `when`).
  - `StoryComposerViewModelTest` (+8): restyle keeps text + position + editing; recolour/realign touch
    only their field; each intent is **inert on an unknown id**; styling one of several elements leaves the
    others; a fully restyled element carries `textStyle`/`textColor`/`textAlign` into the published object.
- **Edge cases:** unknown-id inert (all three intents), single vs. several elements, default-state
  preservation, publish round-trip of the wire tokens. No floor lowered, no test weakened.
- **Verification:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (assembleDebug + all JVM unit
  tests green).
- **Reviewer gate:** PASS — diff is `apps/android` only (4 prod Kotlin/res files + 2 test files + tracking),
  no production logic outside it, pure logic branch-swept, UDF/SSOT/SDK-purity honoured.
- **Follow-ups (unchanged):** in-place floating text editor; canvas toolbar/FAB; then Calls.

### 2026-06-29 — slice `story-text-elements` ✅
- **Branch:** `claude/apps/android/story-text-elements` (off `origin/main` @ `e638c712`).
- **Housekeeping (step 0):** no open Android PR for the prior loop (`story-canvas-transform` merged);
  `origin/main` carried every Android slice; branched this slice clean.
- **What:** **on-canvas text elements** ("Next" #2, feature-parity §"Text elements (≤5/slide)"). The
  composer canvas can now hold up to 5 draggable text elements per slide — add, position, edit, remove —
  and they ride into publish via `storyEffects.textObjects`. Surpasses iOS by routing publish through the
  durable outbox (the existing Android story path).
- **Design (single source of truth, SDK purity):** the position clamp lives in **one pure place**,
  `StoryTextElement` (`normalised()` / `nudged(dx,dy)` keep x,y in `0f..1f`); the deck mirrors the media
  reducer exactly (an element id lives on one slide; total functions return the same instance when inert);
  the single text field serves two roles via the pure-derived `editorText`/`isEditingTextElement` so the
  canvas stays one coherent surface (no second editor). All in `:feature:stories` (product state, not an
  SDK atom). The wire mapping reuses the existing `StoryTextObject`/`StoryEffects` model — no new types.
- **Added/changed (production, `apps/android` only):**
  - `StoryTextElement.kt` (new) — pure element + `StoryTextStyle`/`StoryTextAlign` enums (gateway `wire`
    tokens), `isPublishable`, `normalised`/`nudged` (clamp), `toTextObject(lang)`, `CENTER`/`DEFAULT_COLOR`/
    `clampCoord`.
  - `StorySlide.elements: List<StoryTextElement>` (carried by `duplicate`); `StorySlideDeck`
    `addTextElementToSelected`/`removeTextElement`/`updateTextElement`/`moveTextElement` +
    `selectedRemainingTextSlots`/`selectedCanAddTextElement`/`hasTextElements`/`isWithinTextElementLimit`,
    `MAX_TEXT_ELEMENTS_PER_SLIDE=5`, and `publishableSlides` now counts an element-only slide.
  - `StoryComposerDraft.textElements` + `withTextElements`/`publishableTextElements`/`hasTextElements`;
    `canPublish` admits a publishable element; `toCreateStoryRequest` serialises non-blank elements into
    `storyEffects.textObjects` (null when none).
  - `StoryComposerViewModel` — `onAddTextElement`/`onSelectTextElement`/`onDeselectTextElement`/
    `onTextElementMoved`/`onRemoveTextElement`, `onTextChange` routes to element-vs-caption,
    `selectedTextElementId` + derived `selectedTextElement`/`isEditingTextElement`/`editorText`/
    `selectedSlideTextElements`; `canPublish` gates on the element cap + presence; `mirrorDraftToSelection`
    drops a dangling element selection on slide change; `publishPlans` carries each slide's elements.
  - `StoryComposerScreen` — `StoryCanvasSurface` renders the elements (centred at fraction, drag→
    `onTextElementMoved` via px/size, tap→select, remove affordance, background tap→deselect); the field
    binds `editorText`; an "Add text" button. +4 strings × 4 locales.
- **TDD (red → green):** `StoryTextElementTest` +10 (defaults; blank/non-blank publishable; normalised
  clamp + in-range untouched; nudged translate / edge-clamp both axes / identity preserved; toTextObject
  wire tokens; enum wire coverage). `StorySlideDeckTextElementsTest` +16 (add to selected only / clamp /
  dup-id inert / cap inert / remaining countdown; remove from any slide / unknown inert; update matching
  only / re-clamp / unknown inert; move clamp / unknown inert; hasTextElements ignores blank;
  element-only slide publishable; over-cap flagged; duplicate carries elements).
  `StoryComposerDraftTest` +5 (element-only publishable / blank-only not; withTextElements; serialise +
  drop blanks; storyEffects null when none). `StoryComposerViewModelTest` +10 (add+edit; route to element
  not caption; blank not publishable; deselect→caption; unknown select inert; cap warning; drag clamp;
  remove ends editing; slide switch ends editing; publish carries textObjects).
- **Branch coverage (new logic):** every arm of the deck reducers (inert/cap/clamp/unknown), the
  element clamp (in/over/under both axes), the `onTextChange` route (element vs caption), the
  `mirrorDraftToSelection` still-selected vs dangling branch, `canPublish` element presence + cap, and the
  draft serialise/empty branch are all hit. ≥90% branch + instruction on the added logic.
- **Verification:** `./apps/android/meeshy.sh check` — **BUILD SUCCESSFUL** (`assembleDebug` + all
  `testDebugUnitTest`, 836 tasks). Diff = `apps/android` only (4 prod Kotlin changed + 1 new, 4 strings,
  2 test changed + 2 new).
- **Reviewer gate:** PASS — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API; SDK purity (pure model is product state in
  `:feature:*`); single source of truth (clamp + wire mapping each in one place, reuses `StoryTextObject`);
  UDF (VM + immutable `StateFlow`, transitions pure); canvas/element Composables are glue;
  colour/UX coherence (one coherent canvas surface, natural drag/tap gestures, deselect on background tap).

### 2026-06-29 — slice `story-canvas-transform` ✅
- **Branch:** `claude/apps/android/story-canvas-transform` (off `origin/main`).
- **Housekeeping (step 0):** no open Android PR for the prior loop (`story-slide-media` PR #1026
  squash-merged); `origin/main` carried every Android slice through #1026; branched this slice clean.
- **What:** **9:16 canvas with pinch-zoom + drag-pan** ("Next" #1, feature-parity §Stories composer).
  The composer gains a real central 9:16 canvas where the user pinches to zoom and drags to pan the
  selected slide's media background; the pan/zoom **persists per slide** (it's part of the slide's
  identity, carried by duplicate and into publish) — surpassing iOS's ephemeral, per-session canvas
  state. Text/sticker/drawing **elements** layer on top in later slices.
- **Design (single source of truth, SDK purity):** the gesture math lives in **one pure place**,
  `StoryCanvasTransform` (in `:feature:stories`, product state — it's the slide model, not a stateless
  SDK atom). `scale` clamps to `[1,4]`; `offsetX/Y` clamp to `maxOffset = (size·scale − size)/2` (the
  symmetric overflow of the scaled content). `apply(panX,panY,zoom,canvasW,canvasH)` multiplies scale
  by the gesture `zoom`, clamps it, then clamps the translated offset to the bounds of the **new**
  scale — so a pinch-out tightens the pan range and snaps a now-out-of-range offset back toward centre,
  a pinch-in widens it. A degenerate 0px canvas collapses the range (no divide-by-zero — there is no
  division), `clampedTo(w,h)` re-clamps on a fresh/resized measurement, and `isIdentity` lets the
  Composable skip `graphicsLayer` at rest.
- **Added/changed (production, `apps/android` only):**
  - `StoryCanvasTransform.kt` (new) — the pure transform value + resolver (`apply`/`clampedTo`/
    `clampScale`/`maxOffset`/`clampOffset`/`isIdentity`, `MIN_SCALE=1`/`MAX_SCALE=4`/`IDENTITY`).
  - `StorySlide.transform: StoryCanvasTransform = IDENTITY` — per-slide persisted canvas state
    (carried by `duplicate`; default keeps the single-slide path byte-identical).
  - `StorySlideDeck.updateSelectedTransform(transform)` — rewrites only the selected slide's transform
    (text/media/selection untouched), mirroring `updateSelectedText`.
  - `StoryComposerViewModel.onCanvasTransform(panX,panY,zoom,canvasW,canvasH)` — applies the gesture to
    the selected slide via the pure `apply`, through the existing `applyDeck`; `StoryComposerUiState.
    selectedSlideTransform` projects it for the screen.
  - `StoryComposerScreen.StoryCanvasSurface` — glue 9:16 `Box` (`aspectRatio(9f/16f)`, surfaceVariant,
    rounded clip, `semantics` label) rendering the selected slide's first media under a `graphicsLayer`
    transform + `detectTransformGestures` forwarding pan/zoom + measured size to the VM. +1 string × 4 locales.
- **TDD (red → green):** `StoryCanvasTransformTest` +16 (identity/defaults; scale clamp min/mid/max;
  apply zoom-in/out clamp + multiply; rest-scale no-pan; maxOffset overflow; in-range pan both axes;
  out-of-range symmetric clamp both axes; pan accumulation; zoom-out re-clamp toward centre; 0px canvas
  no-div-by-zero; `clampedTo` snap + in-range untouched). `StorySlideDeckTest` +3
  (updateSelectedTransform rewrites only selected / leaves text+media; duplicate carries transform).
  `StoryComposerViewModelTest` +3 (onCanvasTransform applies pinch-pan; clamps to bounds; edits only the
  selected slide + leaves editor text + exposes `selectedSlideTransform`). RED verified (unresolved
  `StoryCanvasTransform`/`updateSelectedTransform`/`onCanvasTransform`).
- **Branch coverage (new logic):** every arm of `apply` (zoom clamp ↑/↓/mid, offset clamp in/over/under,
  0px collapse), `clampScale`/`maxOffset`/`clampOffset` boundaries, `isIdentity` true/false,
  `clampedTo` in/out-of-range, `updateSelectedTransform` selected-vs-others, and the VM intent's
  selected-only edit are all hit. ≥90% branch + instruction on the added logic.
- **Verification:** `./apps/android/meeshy.sh check` — **BUILD SUCCESSFUL** (`assembleDebug` + all
  `testDebugUnitTest`). `:feature:stories` `StoryCanvasTransformTest` 16, `StorySlideDeckTest` 50,
  `StoryComposerViewModelTest` 70 — 0 failures. Diff = `apps/android` only (4 prod Kotlin, 4 strings,
  3 test).
- **Reviewer gate:** PASS — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API; SDK purity (pure transform is product
  state in `:feature:*`, not an SDK atom); UDF (VM + immutable `StateFlow`, transitions pure); canvas
  Composable is glue; colour/UX coherence (MaterialTheme surface, natural pinch/pan gestures).

### 2026-06-29 — slice `story-slide-media` ✅
- **Branch:** `claude/apps/android/story-slide-media` (off `origin/main` @ `18be707b`).
- **Housekeeping (step 0):** the prior loop's PR **#1020 `slide-drag-reorder`** was open — merged it
  first (all 15 CI checks green, diff `apps/android` only, base `384826d3` an ancestor of `main`, the
  only main-since changes were gateway-coverage commits touching nothing under `apps/android` → clean
  rebase). Squash-merged as `18be707b`, synced local `main`, then branched this slice.
- **What:** **per-slide media** ("Next" #1, feature-parity §E "Multi-slide composer"). Media now
  belongs to the **slide it was added to**, not the whole story. Surpasses iOS (which drops an offline
  pick on upload failure) by keeping the durable offline chain intact per-slide.
- **Design (single source of truth):** the **deck** owns media; `draft` mirrors the *selected slide*
  for media exactly as it already did for text (`mirrorDraftToSelection`), so the single-slide path is
  byte-identical and nearly every existing test passes unchanged — only genuinely new per-slide
  behaviour needed new tests.
- **Added/changed (production, `apps/android` only):**
  - `StorySlideDeck` (`:feature:stories`) — pure additions: `addMediaToSelected(mediaId)` (append to
    the selected slide, dedup + ≤`MAX_MEDIA_PER_SLIDE` cap, inert otherwise), `removeMedia(mediaId)`
    (drop from whichever slide holds it, inert when absent), `hasMedia`, `isWithinMediaLimit()`,
    `selectedRemainingMediaSlots`, and `publishableSlides` now = non-blank text **or** attached media
    (a media-only slide publishes). `MAX_MEDIA_PER_SLIDE = 10`.
  - `StoryComposerViewModel` — `onMediaPicked` reads free slots off the selected slide and routes the
    uploaded ids / offline cmids onto it (deck); `mirrorDraftToSelection` re-points `draft` at the
    selected slide's text+media after every deck change; `onRemoveSlide` reclaims the removed slide's
    media (prunes the global preview pools + cancels its durable `UPLOAD_MEDIA` rows); `canPublish`
    gates on `deck.hasMedia`/`deck.isWithinMediaLimit()`; new `publishPlans` emits one request **per
    publishable slide** carrying that slide's media and `dependsOn` only that slide's offline uploads.
  - `StoryComposerUiState` — `selectedSlideAttachments`/`selectedSlidePending` project the global pools
    onto the selected slide (in slide order) for the preview; dropped the now-unused `draftMediaIds`.
  - `StoryComposerScreen` — the preview row renders the **selected slide's** media (glue only).
- **TDD (red → green):** `StorySlideDeckTest` +13 (addMediaToSelected append/order/dedup/cap-inert;
  removeMedia from-any-slide / unknown-inert; hasMedia false/true; isWithinMediaLimit within/exceeds;
  selectedRemainingMediaSlots free/never-negative; publishableSlides media-only included / text+media
  order; renamed the no-content case). `StoryComposerViewModelTest` +10 (picked media → selected slide;
  each story carries only its slide's media; offline upload on a later slide gates only that story;
  media-only middle slide publishes between text slides; preview shows only the selected slide; media
  on a non-selected slide still lets the deck publish; per-slide cap lets a fresh slide attach its own
  ten; removing a slide drops its uploaded media / cancels its durable rows; removing the last slide is
  inert and keeps its media). RED verified (unresolved `addMediaToSelected`/`selectedSlideAttachments`).
- **Branch coverage (new logic):** every arm of the new deck methods hit (dedup, cap, inert, present/
  absent); VM media routing covered online + offline + cap + slide-removal-cleanup (pending & non-
  pending) + last-slide-inert. ≥90% branch + instruction on the added logic.
- **Verification:** `./apps/android/meeshy.sh check` (`assembleDebug` + all `testDebugUnitTest`) **BUILD
  SUCCESSFUL**. `:feature:stories` 67 (`StoryComposerViewModelTest`) + 47 (`StorySlideDeckTest`), 0
  failures. Diff = `apps/android` only (3 prod Kotlin, 2 test).
- **Reviewer gate:** PASS — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API; SDK purity (pure media reducer in the
  composer **product** module `:feature:stories`, glue in the Composable); single source of truth (deck
  owns media, `draft` is a mirror — `mirrorDraftToSelection` the one writer); UDF (immutable
  `StateFlow`, pure deck transitions); edge cases (empty/dedup/cap/unknown-id/last-slide-inert/offline-
  cancel); UX coherence (preview tracks the selected slide, slide removal leaves no orphan upload).
  Surpasses iOS per-slide while preserving the durable offline chain.

### 2026-06-29 — slice `slide-drag-reorder` ✅
- **Branch:** `claude/apps/android/slide-drag-reorder` (off `origin/main` @ `384826d3`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open` →
  none of the 27 open PRs are `claude/apps/android/*`; prior loop `story-composer-slide-deck` already
  squash-merged to `main`). Branched directly off the freshened `main`.
- **What:** closes the deferred **drag-reorder gesture** ("Next" #1, feature-parity §E line 453).
  The `move` reducer + `onMoveSlide` intent were already wired & tested last loop; this binds a
  Compose drag handle to them through a new pure resolver — no production logic outside `apps/android`.
- **Added (production, `apps/android` only):**
  - `SlideReorderResolver.targetIndex(fromIndex, dragPx, slotWidthPx, slideCount)` (`:feature:stories`)
    — pure mapping from accumulated horizontal drag px + measured slot width to the clamped landing
    slot. `steps = round(dragPx / slotWidthPx)`; sub-half-slot drift rounds to 0 (no accidental
    reorder); result clamped to `0..slideCount-1`; non-positive slot width or empty/origin-out-of-range
    degrade safely (no div-by-zero, no throw). Mirrors the `StorySwipeResolver` "thresholds as params"
    style so the decision is fully unit-tested off the Composable.
  - `StoryComposerScreen.SlideStrip` — each chip now carries `onSizeChanged` (slot width) +
    `detectHorizontalDragGestures`; on drag end it feeds the resolver and calls the existing
    `onMoveSlide`. Glue only; the testable decision lives in the resolver.
- **TDD (red → green):** `SlideReorderResolverTest` +11 (no-drag inert; sub-half-slot inert; right
  past-half +1; left past-half −1; multi-slot crossing; clamp-far-right to last; clamp-far-left to 0;
  single-slide nowhere-to-move; non-positive slot width → origin; out-of-range origin clamped;
  empty deck → 0 no-throw). All 11 green. RED first verified (unresolved `SlideReorderResolver`
  compile failure). No floor lowered, no test weakened; one expectation was corrected (2.5 rounds to
  3, not 2 — value changed to 2.3 so the "several slots" assertion is unambiguous, not weakened).
- **Branch coverage (new logic):** every arm of `targetIndex` is hit — `slideCount<=0`,
  `slotWidthPx<=0`, the clamp lower/upper bounds, and the in-range round. ≥90% branch + instruction.
- **Verification:** `./apps/android/meeshy.sh check` green (`assembleDebug` + `testDebugUnitTest`,
  BUILD SUCCESSFUL). Diff is `apps/android` only.
- **Reviewer gate:** PASS — scope `apps/android` only, behavioural tests through the public resolver
  API, no tautologies, edge cases (empty/single/boundary/degenerate-width/out-of-range) covered, SDK
  purity respected (pure resolver in `:feature:stories`, glue in the Composable), single source of
  truth (reorder math in one pure place), UX coherence (natural horizontal drag → reorder).

### 2026-06-29 — slice `story-composer-slide-deck` ✅
- **Branch:** `claude/apps/android/story-composer-slide-deck` (off `origin/main` @ `f4ff6b2cd`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; prior loop `story-slide-deck` squash-merged as #1014).
  Branched directly off the freshened `main`.
- **What:** makes the multi-slide model **real in the composer** ("Next" #1, feature-parity §E
  line 433). Wires the pure `StorySlideDeck` reducer into `StoryComposerViewModel`, binds the editor
  to the **selected slide's** text (each slide keeps its own caption), and renders a `SlideStrip`
  mini-preview in `StoryComposerScreen`. Publish stays **lossless across slides**: one story per
  non-blank slide, in order.
- **Added/changed (production, `apps/android` only):**
  - `StorySlideDeck` (`:feature:stories`) — pure additions: `hasText`, `publishableSlides`
    (non-blank slides in order), `isWithinTextLimit(maxChars)` (every slide within the cap),
    `updateSelectedText(text)` (rewrites only the selected slide's text, id/media/order/selection
    intact). All pure, deterministic — no clock/random.
  - `StoryComposerUiState` — new `deck: StorySlideDeck` (default `single(newSlideId())`); `canPublish`
    now gates on the **whole deck** (`deck.hasText || draft.hasMedia` &&
    `deck.isWithinTextLimit(MAX_CHARS)` && media cap && not in flight) so an off-screen over-long
    slide blocks publish.
  - `StoryComposerViewModel` — `onTextChange` writes the selected slide (+ mirrors `draft.text`);
    new intents `onAddSlide`/`onDuplicateSelectedSlide`/`onRemoveSlide`/`onMoveSlide`/`onSelectSlide`
    via a private `applyDeck{}` that re-syncs the editor to the (possibly new) selected slide's text.
    Slide ids minted with `UUID` at the impure VM edge (reducer stays pure). `publish` → new pure
    `publishRequests`: **one story per non-blank slide** in deck order; the first carries whole-story
    media + offline `dependsOn`, later slides are text-only; a media-only deck still emits one
    media-bearing story. Single-slide path is byte-identical to before.
  - `StoryComposerScreen` — `SlideStrip` composable (numbered selectable `FilterChip`s; selected chip
    carries Duplicate/Remove, Remove hidden on the last slide; trailing "+" `AssistChip` disabled at
    the cap). Glue only — every decision read off the unit-tested deck. +4 strings × 4 locales.
- **TDD (red → green):** `StorySlideDeckTest` +12 (updateSelectedText rewrites-only-selected /
  media-untouched; hasText false-blank / whitespace-ignored / true; publishableSlides order-filter /
  empty; isWithinTextLimit all-within / any-exceeds / raw-length-counts-whitespace). 34/34 green.
  `StoryComposerViewModelTest` +18 (starts single slide; onTextChange writes slide+mirror;
  add appends+clears / inert-at-cap; per-slide text survives selection move; duplicate clones+selects
  clone; remove drops+refreshes-editor / inert-on-last; move reorders+preserves-selection;
  select-unknown inert; canPublish false on off-screen over-long slide; publish one-per-non-blank-slide
  in order / skips blank between content / media+deps only on first / resets to single empty slide).
  57/57 green. No floor lowered, no test weakened; ids read off state (no exact-id tautology).
- **Verification:** `:feature:stories:testDebugUnitTest` (`StorySlideDeckTest` 34/34 +
  `StoryComposerViewModelTest` 57/57, failures=0 errors=0); full `./apps/android/meeshy.sh check`
  (`assembleDebug` + all `testDebugUnitTest`) **BUILD SUCCESSFUL**. Diff = `apps/android` only
  (3 prod Kotlin, 4 strings, 2 test).
- **Reviewer gate:** PASS — scope clean (apps/android only, no secrets, `local.properties` gitignored);
  behavioural non-tautological tests through the public API; SDK purity (deck is composer **product**
  state in `:feature:stories`; id-minting at the impure VM edge keeps the reducer pure); single source
  of truth (`draft.text == selectedSlide.text` invariant held by one writer `applyDeck`); UDF
  (immutable `StateFlow`, pure reducer transitions); UX coherence (theme chips, selected highlight,
  no dead end — publish is lossless across slides). Surpasses iOS by gating publish on the whole deck.
- **Note / next:** drag-reorder **gesture** binding deferred (the `onMoveSlide` intent + `move`
  reducer are wired & tested — only the Compose drag handle remains); per-slide media still
  whole-story. Next: the **9:16 canvas** ("Next" #2) — per-slide pinch-zoom/drag-pan + toolbar.

### 2026-06-28 — slice `story-slide-deck` ✅
- **Branch:** `claude/apps/android/story-slide-deck` (off `origin/main` @ `bf4cd477`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`search_pull_requests is:open
  head:claude/apps/android` → 0; prior loop `story-composer-multi-pending` already squash-merged as
  #1012). HEAD == `origin/main` (0/0). Branched directly off the freshened `main`.
- **What:** opens the **multi-slide composer** ("Next" #1, feature-parity §E line 433) with its pure,
  provably-correct foundation — the structural slide-deck reducer. iOS's `StoryComposerViewModel` owns
  `slides` + slide CRUD (`addSlide`/`removeSlide`/`duplicateSlide`/`selectSlide`/`moveSlide`) with
  `maxSlides=10` and `canAddSlide` (<10); this slice ports that as a **pure immutable model** so the
  rules are unit-tested before any canvas glue. Kept thin (no UI) per the established "primitive first,
  UX next slice" pattern (cf. `outbox-multi-dependency`, `media-blob-store`).
- **Added (production, `apps/android` only):**
  - `StorySlide` (`:feature:stories`) — `data class(id, text="", mediaIds=[])`, one slide's identity +
    content (richer elements layer on later, reusing the id).
  - `StorySlideDeck` (`:feature:stories`) — immutable deck with two enforced invariants (always ≥1
    slide; ≤`MAX_SLIDES`=10, both checked in `init`). Derived: `size`/`isFull`/`canAddSlide`/
    `canRemoveSlide`/`selectedIndex`/`selectedSlide`. Total ops returning the same instance when
    inapplicable: `addSlide(newId)` (append+select; inert at cap or dup id), `duplicate(sourceId,
    newId)` (clone content after source + select; inert at cap / unknown source / dup id),
    `removeSlide(id)` (inert if last or unknown; removal reselects the slide taking the removed one's
    place, new-last when removing the last), `move(id, toIndex)` (clamps index, preserves selection by
    id, inert on unknown/no-op), `select(id)` (inert on unknown/already-selected). `single(id)` factory.
    Ids are caller-supplied → pure & deterministic (no clock/random).
- **TDD (red → green):** `StorySlideDeckTest` +24 — `single`/invariants (empty + absent-selectedId
  rejected); add (append+select / cap-inert / dup-id-inert); duplicate (clone content + insert-after +
  select / unknown-inert / cap-inert / collision-inert); remove (keep-other-selection / reselect-taker /
  reselect-new-last / single-inert / unknown-inert); move (reorder + selection-by-id / clamp-negative /
  clamp-over / same-index-inert / unknown-inert); select (switch / unknown-inert); selectedIndex+slide.
  Branch sweep: every cap/boundary/unknown/last-slide/inert arm. No floor lowered, no test weakened.
- **Verification:** `:feature:stories:testDebugUnitTest` (`StorySlideDeckTest`) **24/24 green**
  (failures=0 errors=0); full `./apps/android/meeshy.sh check` (`assembleDebug` + all
  `testDebugUnitTest`) **BUILD SUCCESSFUL**. Diff = `apps/android` only (1 new prod file, 1 new test).
- **Reviewer gate:** PASS — scope clean (apps/android only), behavioural non-tautological tests through
  the public API (deck ops → observable `slides`/`selectedId`), SDK purity (the structural deck rules are
  composer **product** state in `:feature:stories`, like `StoryComposerDraft`; no orphan in `:sdk-core`),
  single source of truth (one deck model gates add/remove caps + selection — no second slide list),
  immutable UDF-friendly value, total functions (no throw on inapplicable op), Kotlin style (immutable,
  early returns, `coerceIn`). Surpasses the deprecated iOS `StorySlideManager` SSoT violation by being a
  single pure model from the start.
- **Note / next:** pure foundation only — nothing renders it yet. Next: wire it into
  `StoryComposerViewModel` (mint ids, expose in `StoryComposerUiState`) + a **slide mini-preview strip**
  in `StoryComposerScreen` ("Next" #1). Then the 9:16 canvas ("Next" #2).

### 2026-06-28 — slice `story-composer-multi-pending` ✅
- **Branch:** `claude/apps/android/story-composer-multi-pending` (off `origin/main` @ `997ee729`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (all prior loops already
  squash-merged; 28 open PRs are iOS/web/dependabot, none Android). Branched off the freshened `main`.
- **What:** delivers "Next" #1 — the **multi-pending offline uploads composer UX** on top of the
  `outbox-multi-dependency` SDK primitive. The composer staged at most **one** `pendingUpload`; it now
  holds a **list**, so every transient-failed pick is appended (and a single offline pick that carries
  **several** items now stages each one). `publish()` gates the story on **all** pending cmids; per-tile
  remove cancels only that durable row. Surpasses iOS, which drops a pick on an offline upload entirely.
- **Changed (production, `apps/android` only):**
  - `StoryComposerUiState.pendingUpload: PendingMediaUpload?` → `pendingUploads: List<PendingMediaUpload>`
    (default empty); `draftMediaIds` now appends every pending cmid after the uploaded ids.
  - `onUploadFailed` dropped the `single != null && pendingUpload == null` guard: any transient error now
    durably queues **every** accepted item (already capped to the free slots by `onMediaPicked`). A
    permanent (4xx) error still surfaces the message and stages nothing.
  - `queueDurably(items: List<…>)` enqueues + stages **one item at a time** so partial progress survives
    if a later `enqueue` throws (already-staged items stay; the caller's catch surfaces the error).
  - `onRemoveMedia` removes one pending upload from the list and cancels **only that** durable row; the
    other pending uploads are untouched.
  - `publish(dependsOn = pendingUploads.map { cmid })`; `StoryComposerScreen.MediaPreviewRow` renders N
    "Offline" tiles via `items(pending)` (was a single optional tile).
- **TDD (red → green):** `StoryComposerViewModelTest` — 3 existing single-pending tests adapted to the
  list field; the *"second offline pick is rejected"* and *"multi-item offline pick is not chained"*
  behaviours **flipped** (now: second pick appended / each item staged) — strengthened, not weakened;
  +5 new: multi-item batch stages each, second pick appends, offline batch truncated to free slots,
  publish gates on **all** placeholder ids, remove one pending keeps the rest + cancels only its row,
  first staged item survives a mid-batch enqueue failure. No coverage floor lowered, no test weakened.
- **Verification:** `./apps/android/meeshy.sh check` (`assembleDebug` + all `testDebugUnitTest`)
  **BUILD SUCCESSFUL**. Diff = `apps/android` only (2 prod edits, 1 test file).
- **Reviewer gate:** PASS — scope clean (apps/android only), behavioural non-tautological tests,
  branch sweep on the new list paths (empty/single/multi/cap-truncated/mid-batch-failure), SDK purity
  respected (composer is product orchestration in `:feature:stories`; the multi-dependency primitive
  stays in `:sdk-core`), single source of truth (one `draftMediaIds` derivation feeds both draft +
  dependsOn), failure paths covered, `viewModelScope` cancel-safe (`CancellationException` rethrown).
- **Note / next:** the single-pending offline chain is now fully multi-pending end-to-end. Next up:
  **multi-slide canvas** ("Next" #2) — the real multi-slide composer (add/remove/reorder slides, 9:16
  canvas), a larger slice. After Stories richness is sufficient, advance to **Calls**.

### 2026-06-28 — slice `outbox-multi-dependency` ✅
- **Branch:** `claude/apps/android/outbox-multi-dependency` (off `origin/main` @ `af7791af`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (all prior loops already
  squash-merged; HEAD == `origin/main`). Branched off the freshened `main`.
- **What:** delivers the **multi-dependency outbox primitive** flagged in "Next" #1 — the
  foundational, provably-correct half. The `dependsOn` gate was single-valued (one `cmid`), so a
  publish could wait on at most **one** offline upload. It now expresses a **set** of prerequisites:
  a dependent gates on **all** of them and is doomed the moment **any** is exhausted. This is the
  enabling brick for "several media queued offline" (the composer multi-pending **UX** is the
  explicit next slice — kept out of this slice to keep it thin and low-risk).
- **Added / changed (production, `apps/android` only):**
  - `OutboxDependencyKey` (`:sdk-core`, new stateless building block) — `encode(Collection)→String?`
    / `decode(String?)→List` round-trip a *set* of `cmid`s through the one `dependsOn` column,
    wrapped-delimited (`{a,b}`→`"|a|b|"`; `'|'` is reserved, a `cmid` never contains it). `decode`
    is robust to a **bare** legacy value (no delimiter → singleton). `likePattern(cmid)` builds an
    escaped membership `LIKE` pattern (`%|cmid\_x|%`, `_` escaped — `cmid`s carry `_`).
  - `OutboxDependencies.verdictAll(states)` — pure multi-prerequisite gate: any `EXHAUSTED`→`FAILED`,
    else any `PENDING`/`INFLIGHT`→`BLOCKED`, else `SATISFIED`. Empty→`SATISFIED`. `FAILED` dominates
    `BLOCKED` (one dead prerequisite ⇒ cascade-exhaust now, never wait).
  - `OutboxMutation.dependsOn`: `String?` → `Set<String>` (default empty); `toEntity` encodes via
    `OutboxDependencyKey.encode` so the column stays one TEXT field (no schema/migration change).
  - `OutboxDrainer` decodes `row.dependsOn` to the set and gates via `verdictAll` (the single-dep
    path is just N=1 — every existing drainer behaviour preserved).
  - `OutboxDao.findDependents` is now a `LIKE … ESCAPE '\'` membership query; `OutboxRepository`
    `.rewriteDependents` builds the pattern with `likePattern`, so a delivered producer grafts its
    real id into a dependent gated on *several* uploads.
  - `StoryRepository.enqueuePublish(request, dependsOn: List<String> = emptyList())` (was `String?`)
    → `dependsOn.toSet()`; the composer adopts the list contract (`listOfNotNull(pendingUpload?.cmid)`)
    while **keeping single-pending UI** for now.
- **TDD (red → green):** +new `OutboxDependencyKeyTest` (14: empty/blank/single/multi/dupes+trim
  encode, null/blank/bare/wrapped decode, round-trip, likePattern wrap + `_` escape, escapeLike all
  metachars); `OutboxDependenciesTest` +5 verdictAll (empty / all-gone / one-blocked / failed-dominates
  / satisfied); `OutboxDrainerTest` +4 (hold-until-all / deliver-when-all / cascade-exhaust-on-any /
  graft-each-producer); `OutboxRepositoryTest` +2 (membership-by-any-prereq / no substring false match);
  `StoryRepositoryTest` +1 (persists every prerequisite) and the existing single-dep assertion adapted
  to decode the encoded column (behaviour-preserving); `StoryComposerViewModelTest` +1 (no-media publish
  gates on no prerequisites) and the `dependsOn` capture adapted to the `List` contract. No test
  weakened, no coverage floor lowered.
- **Verification:** `./apps/android/meeshy.sh check` (`assembleDebug` + all `testDebugUnitTest`)
  **BUILD SUCCESSFUL**. Diff = `apps/android` only (2 prod files added, 5 prod edits, 6 test files).
- **Reviewer gate:** PASS — scope clean (apps/android only), behavioural non-tautological tests, SDK
  purity respected (pure stateless key + gate in `:sdk-core`; no product orchestration leaked down),
  single source of truth (one encode/decode + one verdict resolver), backward-compatible decode,
  no schema migration.
- **Note / next:** the composer still stages at most one `pendingUpload`; the *multi-pending UX*
  (let the user queue several offline media — `pendingUploads: List`, relax the single-pending guard,
  `publish(dependsOn = all cmids)`) is now unblocked at the SDK layer and is the next slice.

### 2026-06-28 — slice `outbox-flush-retry-on-blocked` ✅
- **Branch:** `claude/apps/android/outbox-flush-retry-on-blocked` (off `origin/main` @ `50c198e9`).
- **Housekeeping (step 0):** prior run's PR **#998** (`media-upload-cancel`) was open + behind main
  (main had gained iOS-only commits). Rebased it cleanly on `origin/main` (no code conflicts —
  iOS-only upstream), pushed, confirmed CI run `28323140213` **success** + `mergeable_state: clean`
  + local `meeshy.sh check` **BUILD SUCCESSFUL** (836 tasks), then **squash-merged to `main`**
  (`50c198e9`, PR #998). Branched this slice off the freshened `main`.
- **What:** closes the cross-pass gating gap flagged in "Next" #1 — `OutboxFlushWorker.doWork`
  returned `Result.retry()` only when a lane stopped on a **transient** failure, ignoring a lane
  that stopped on a **blocked dependency**. Because lanes drain in a fixed order, a dependent (a
  media story/message gated via `dependsOn`) can be `BLOCKED` early in a pass while its prerequisite
  `UPLOAD_MEDIA` row delivers *later in the same pass*; without a retry the now-satisfiable
  dependent sat until an unrelated trigger fired.
- **Added / changed (production, `apps/android` only):**
  - `OutboxFlushPlan.outcome(reports)` (`:sdk-core`, stateless building block) + `FlushOutcome`
    enum — pure decision: `RETRY` when **any** `DrainReport` stopped on a transient failure **or**
    a blocked dependency, else `SUCCESS`. Forward progress is guaranteed: each retry delivers the
    dependent or cascade-exhausts it once the prerequisite gives up (`EXHAUSTED` → verdict `FAILED`,
    never `BLOCKED`), so the loop terminates.
  - `OutboxFlushWorker.doWork` now collects each lane's `DrainReport` into a list and delegates the
    WorkManager outcome to `OutboxFlushPlan.outcome` (the untestable worker glue stays thin; the
    decision is the pure, fully-covered function).
- **TDD (red → green):** `OutboxFlushPlanTest` +9 — empty pass / single clean lane / transient-only /
  blocked-only / both flags / many clean lanes / one transient among clean / one blocked among clean /
  deliveries+exhaustions without a stop signal never retry. Branch sweep: both arms of the `||`,
  `.any{}` true and false, recorded as `tests=9 failures=0` in the JUnit report.
- **Verification:** `./apps/android/meeshy.sh check` (assembleDebug + all unit tests) **BUILD
  SUCCESSFUL**. Diff = `apps/android` only, 1 prod file added + 1 prod file edited + 1 test file.
- **Reviewer gate:** PASS — scope clean, behavioural non-tautological tests, SDK purity respected
  (pure stateless decision in `:sdk-core`; the "when to retry" rule extracted out of the worker),
  single source of truth (one decision point), no coverage floor lowered.

### 2026-06-28 — slice `media-upload-cancel` ✅
- **Branch:** `claude/apps/android/media-upload-cancel` (off `origin/main` @ `a970f979`).
- **Housekeeping (step 0):** prior run's PR **#996** (`story-composer-offline-media`) was already
  squash-merged to `main` (`a970f979`); no open `claude/apps/android/*` PR. (PR #997 is a separate
  `calls`/iOS branch, out of this loop's scope.) Branched off the freshened `main`.
- **What:** closes the **orphan-leak gap** flagged in "Next" #1 — `onRemoveMedia(pendingCmid)`
  cleared only the draft placeholder, leaving the durable `UPLOAD_MEDIA` row + blob to upload to a
  media the story would never reference. Removal now cancels the durable upload too.
- **Added / changed (production, `apps/android` only):**
  - `MediaUploadQueue.cancel(cmid)` (`:sdk-core`, stateless building block) — the mirror of
    `enqueue`: `OutboxRepository.discard(cmid)` (drops the row so the drainer stops picking it up)
    **then** `MediaBlobStore.remove(cmid)` (drops the bytes). Unknown cmid inert — both layers
    tolerate absence. Reuses the existing `discard`/`remove` primitives (no new outbox API).
  - `StoryComposerViewModel.onRemoveMedia` (`:feature:stories`, product orchestration) — captures
    `wasPending` before the state update, and when the removed id was the pending placeholder fires
    a best-effort `cancelDurableUpload(cmid)` on `viewModelScope` (cancellation-safe: rethrows
    `CancellationException`, swallows the rest — a stranded row exhausts harmlessly). UI still
    clears optimistically/synchronously; removing a regular attachment never cancels.
- **TDD (red → green):**
  - `MediaUploadQueueTest` +3: cancel drops both row & blob (real Room) / cancel leaves other
    queued uploads untouched / cancel of an unknown cmid is a no-op.
  - `StoryComposerViewModelTest` +4: removing the pending upload cancels its durable row & blob /
    removing an uploaded attachment never cancels / removing a non-pending id while a pending
    upload exists doesn't cancel (and keeps the pending) / clears state even when the cancel throws.
  - Branch sweep: pending-vs-attachment arm, unknown-id arm, failure (cancel throws) arm,
    cancellation-safety arm all covered.
- **Verification:** `./apps/android/meeshy.sh test` (37 story tests, 6 queue tests) + `build`
  (assembleDebug) both `BUILD SUCCESSFUL`. Diff = `apps/android` only, 2 prod + 2 test files.
- **Reviewer gate:** PASS — scope clean, behavioural non-tautological tests, SDK purity respected
  (cancel is a stateless building block; "when to cancel" stays in the VM), failure path graceful,
  cancellation-safe, no coverage floor lowered.

### 2026-06-28 — slice `story-composer-offline-media` ✅
- **Branch:** `claude/apps/android/story-composer-offline-media` (off `origin/main` @ `e691dbe9`).
- **Housekeeping (step 0):** prior run's PR **#994** (`media-upload-sender`) was open + green +
  `apps/android`-only + up-to-date with `main` → squash-merged it first (`e691dbe9`), then
  branched off the freshened `main`.
- **What:** the **last brick of the producer half** flagged in "Next" #1 — the composer now
  reaches the durable offline upload→publish chain. The SDK chain (`MediaUploadQueue.enqueue`,
  the `MEDIA`-lane sender, `SuccessWithId` graft, `dependsOn` gating) was already complete; this
  slice adds the **product orchestration** in `:feature:stories` that drives it from the UI.
- **Added / changed (production, `apps/android` only):**
  - `MediaUploadRetryPolicy` (`:feature:stories`, new, **pure**) — `isQueueable(error)`: no HTTP
    status (offline) / 429 / 5xx → queueable; any other 4xx → dead end. The composer's product
    pivot between "stage it offline" and "tell the user now"; kept app-side, not in the SDK.
  - `StoryComposerViewModel` — injects `MediaUploadQueue`; on a **single** transient-failed pick
    with no upload already pending, `queueDurably(item)` enqueues the durable upload + stages a
    `PendingMediaUpload(cmid, item)`; the draft's media ids (`draftMediaIds`) now combine uploaded
    ids + the placeholder cmid (so the cap, `canPublish`, and the wire request all see it).
    `publish()` passes `dependsOn = pendingUpload?.cmid`. `onRemoveMedia` also clears a pending
    placeholder. A permanent failure / multi-item pick / second-while-pending surfaces the error.
  - `StoryComposerUiState.pendingUpload` + the `PendingMediaUpload` model + internal `draftMediaIds`.
  - `StoryComposerScreen` — renders the pending media as an "Offline" preview tile (Coil reads the
    held bytes) with its own remove affordance (no dead end); extracted a shared `MediaThumbnail`.
    New string `stories_composer_media_pending` in all 4 locales.
  - `StoryRepository.enqueuePublish(request, dependsOn: String? = null)` — additive param threading
    the prerequisite cmid into the `PUBLISH_STORY` `OutboxMutation` (default `null` = unchanged).
- **Tests (+20, red→green):**
  - `MediaUploadRetryPolicyTest` (pure) +8 — null status, 429, 500, 599 → queueable; 413, 400, 401,
    499 → not. Boundary sweep of the 5xx range.
  - `StoryComposerViewModelTest` +10 — single offline pick → durable enqueue + pending staged +
    placeholder in draft + canPublish; permanent failure → error, never queued; multi-item offline
    → not chained, error; second pick while pending → rejected, queued once; publish gates on the
    pending cmid + carries the placeholder media id + kicks the worker; remove-pending clears it +
    its id; pending kept alongside an already-uploaded id (ordering); pending counts toward the cap;
    durable-enqueue throwing → graceful error, nothing staged; publish clears the pending on success.
  - `StoryRepositoryTest` +2 — `enqueuePublish` persists a given `dependsOn`; defaults it to null.
- **Edge cases covered:** boundary HTTP statuses (499/500/599); empty pick (inert); single vs
  multi-item batch; idempotent/inert second pick while pending; failure path (queue throws →
  graceful, no crash, nothing staged); re-entrancy guard preserved; `CancellationException`
  rethrown. The single-pending constraint is asserted (keeps the single-`dependsOn` chain correct).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m21s** (full `assembleDebug`
  incl. the VM's new Hilt dep + the screen + all module JVM unit tests; 836 tasks). TEST XMLs:
  `MediaUploadRetryPolicyTest` 8/8, `StoryComposerViewModelTest` 33/33, `StoryRepositoryTest` 28/28
  — failures=0 errors=0.
- **Reviewer:** PASS — scope `apps/android` only (1 new prod + 3 prod edits + 4 string files under
  `:feature:stories`, 1 additive prod edit under `:sdk-core`; + 1 new test + 2 test edits + docs);
  behavioural tests through the public API (VM intents → `state`/`StateFlow`, pure policy outcomes,
  observable outbox `dependsOn`), no tautologies, no floor lowered; **SDK purity** (the durable
  building blocks stay in `:sdk-core`; the "when to fall back to durable" product rule is the
  app-side `MediaUploadRetryPolicy`); **single source of truth** (reuses `MediaUploadQueue`,
  `MediaRepository`, the one `enqueuePublish`, `draftMediaIds` derived once — no second queue/id
  shape); **Instant-App** (offline pick is staged instantly, no blocking spinner, publish stays
  optimistic); **UDF** (immutable `StateFlow<UiState>`, pure transitions); **UX coherence** (the
  pending tile is a real, removable preview — no dead end). Surpasses iOS (durable offline media vs
  drop-on-offline).
- **Follow-up (next slice):** multi-pending offline uploads (needs a multi-`dependsOn` / barrier
  primitive); remove-pending should also cancel the durable `UPLOAD_MEDIA` row (currently a harmless
  orphan); the cross-pass `BLOCKED`-not-`anyTransient` retry gap. See "Next slice" #1.

### 2026-06-28 — slice `media-upload-sender` ✅
- **Branch:** `claude/apps/android/media-upload-sender` (off `origin/main` @ `a3d39a3e`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests is:open head:claude/apps/android` → 0). `main` was fresh (last
  Android merge `#990 media-blob-store`); branched directly off it.
- **What:** the **rest of the producer half** flagged in "Next" #1 — at the SDK layer,
  the durable offline upload→publish chain now functions end-to-end. The drainer's
  dependency-gating (`outbox-dependency-gating`) and produced-id graft
  (`outbox-produced-id-writeback`) and the durable bytes store (`media-blob-store`) were
  already in place; this slice adds the `UPLOAD_MEDIA` kind, its delivery logic, its
  enqueue, and the worker wiring that ties them together. Surpasses iOS, which uploads
  synchronously and cannot queue a media attachment while offline.
- **Added / changed (production, `apps/android` only):**
  - `OutboxKind.UPLOAD_MEDIA` (new enum value; `OutboxLanes.MEDIA` already existed from
    `outbox-dependency-gating`).
  - `MediaUploadSender` (`:sdk-core/media`, new, pure) — `send(item, upload): SendResult`
    mapping the four outcomes: `item == null` (blob gone) → `PermanentFailure` **without
    calling upload**; transport `Failure` → `TransientFailure`; `Success` with no usable
    (blank/empty) id → `PermanentFailure`; `Success` with a real id → `SuccessWithId`
    (first id). Kept out of the worker so the decision is JVM-testable.
  - `MediaUploadQueue` (`:sdk-core/media`, new building block) — `enqueue(item): String`
    writes the bytes to `MediaBlobStore` **first**, then queues an `UPLOAD_MEDIA` row on
    the `MEDIA` lane; blob + row share one fresh `cmid` (= `targetId`), returned as the
    dependency key a dependent publish references. Blob-before-row so the row never exists
    without its bytes.
  - `OutboxFlushWorker` — injects `MediaRepository` + `MediaBlobStore`; a `MEDIA`-lane
    `UPLOAD_MEDIA` sender (looks the blob up, `MediaUploadSender.send`, `remove`s the bytes
    on any non-transient outcome); `OutboxLanes.MEDIA` added to the lane list **before**
    `STORY`; `onExhausted` converted to a `when` that drops the blob for an exhausted
    `UPLOAD_MEDIA` row (no byte leak when an upload gives up).
- **Tests (+10, red→green):**
  - `MediaUploadSenderTest` (pure) +7 — gone blob → permanent + upload never called;
    transport failure → transient; delivered → `SuccessWithId(realId)`; multiple produced
    → first id; empty success → permanent; blank id → permanent; the stored item is the
    one handed to upload.
  - `MediaUploadQueueTest` (Robolectric, real DB) +3 — enqueue stores the bytes
    retrievable by the returned cmid (bytes/name/mime); queues exactly one
    `UPLOAD_MEDIA`/`MEDIA`/`PENDING` row keyed by the cmid (= targetId, no `dependsOn`);
    independent enqueues produce distinct rows + blobs.
- **Edge cases covered:** absent blob (gone → permanent, no upload, no crash); empty +
  blank-id upload results (boundary on "no usable media"); transient vs permanent
  classification (retry vs abandon); first-of-many id selection; blob-before-row ordering;
  independent keys isolated. (No `viewModelScope` here — pure object + mechanical enqueue.)
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m39s** (full
  `assembleDebug` — incl. the worker's new Hilt deps — + all module JVM unit tests; 836
  tasks). TEST XMLs: `MediaUploadSenderTest` 7/7, `MediaUploadQueueTest` 3/3 —
  failures=0 errors=0.
- **Reviewer:** PASS — scope `apps/android` only (2 prod edits + 2 new prod + 2 new test,
  all under `sdk-core/`); behavioural tests through the public API (pure `send` outcomes,
  `enqueue` observable rows + blobs), no tautologies, no floor lowered; SDK purity (the
  outcome map + enqueue are stateless building blocks in `:sdk-core`; no product "when to
  upload" rule — that stays in the composer); single source of truth (reuses
  `MediaBlobStore`, `MediaRepository.upload`, the one outbox, `SendResult`, `OutboxIds` —
  no second queue / bytes shape); Instant-App N/A (no UI; makes durable offline optimism
  *capable*); Kotlin style (immutable, early returns, exhaustive `when`, plain glue in the
  worker). Surpasses iOS (durable offline media upload vs synchronous-only).
- **Follow-up (next slice):** nothing enqueues an `UPLOAD_MEDIA` row from the UI yet —
  wire the composer's offline-media chain (`MediaUploadQueue.enqueue` + a publish that
  `dependsOn` the upload cmid with it as the placeholder media id). See "Next slice" #1.

### 2026-06-28 — slice `media-blob-store` ✅
- **Branch:** `claude/apps/android/media-blob-store` (off `origin/main` @ `30b6130b`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests is:open head:claude/apps/android` → 0). `main` was fresh
  (last Android merge `#987 outbox-produced-id-writeback`); branched directly off it.
- **What:** the **first brick of the producer half** flagged in "Next" — a durable
  file-bytes store. The shared outbox payload is a `String`, so the raw bytes of a
  queued media upload have nowhere to live; this slice gives them a durable home keyed
  by the (future) `UPLOAD_MEDIA` row's `cmid`, so a media attachment can be enqueued
  **fully offline** and its bytes survive process death until the `MEDIA`-lane sender
  uploads them. Surpasses iOS, which uploads synchronously and cannot queue a media
  attachment while offline.
- **Added / changed (production, `apps/android` only):**
  - `MediaBlobEntity` (`:core:database`, new) — `cmid` PK + `bytes: ByteArray` +
    `fileName`/`mimeType`/`createdAt`. A **plain `class`** (not `data`) because value
    equality over a `ByteArray` is a footgun and the row is only ever looked up by
    `cmid` — the same decision already made on `MediaUploadItem`.
  - `MediaBlobDao` (`:core:database`, new) — `upsert`/`find(cmid)`/`delete(cmid)`/`clear`.
  - `MeeshyDatabase` — registered `MediaBlobEntity` + `mediaBlobDao()`, **DB version
    5 → 6** (covered by the existing `fallbackToDestructiveMigration()`; an in-flight
    blob is transient, so destroying it on an upgrade is safe — it re-queues).
  - `DatabaseModule` — `providesMediaBlobDao`.
  - `MediaBlobStore` (`:sdk-core`, new) — `put(cmid, item)`/`get(cmid)`/`remove(cmid)`,
    mapping to/from `MediaUploadItem` (single bytes shape, no second type). A stateless
    building block: it persists exactly what the uploader consumes; the "when to
    enqueue / upload" rule stays in the product layer.
- **Tests (+12, red→green):**
  - `MediaBlobDaoTest` (Robolectric) +6 — round-trips every field incl. bytes; unknown
    `cmid` → null; `upsert` replaces same-cmid; `delete` removes only the target;
    `delete` unknown → no-op; `clear` empties.
  - `MediaBlobStoreTest` (Robolectric) +6 — `get` returns what `put` stored (bytes +
    name + mime); unknown → null; `put` overwrites same cmid; `remove` deletes;
    `remove` unknown → no-op; independent cmids stay separate.
- **Edge cases covered:** unknown cmid on get/delete/remove (null / no-op, never a
  crash); same-cmid overwrite (idempotent replace); byte-array preservation across the
  BLOB round-trip; independent keys isolated; empty store. (No network/failure path —
  this is a pure durable store; classification lives in the future sender.)
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m45s** (full
  `assembleDebug` + all module JVM unit tests). TEST XMLs: `MediaBlobDaoTest` 6/6,
  `MediaBlobStoreTest` 6/6 — failures=0 errors=0.
- **Reviewer:** PASS — scope `apps/android` only (2 prod edits + 3 new prod + 2 new
  test, all under `core/database/` + `sdk-core/`); behavioural tests through the public
  API (DAO/store methods + observable rows), no tautologies, no floor lowered; SDK
  purity (durable store is a stateless building block in `:sdk-core`; entity/DAO in
  `:core:database`; no product "when" rule); single source of truth (reuses
  `MediaUploadItem` — no second bytes shape; one DB, destructive-fallback migration —
  no bespoke migration); Instant-App N/A (no UI); Kotlin style (`explicitApi` honoured,
  immutable, plain class for the `ByteArray` footgun). Surpasses iOS (durable offline
  media bytes vs synchronous-only upload).
- **Follow-up (next slice):** nothing reads/writes this store yet — wire the
  `UPLOAD_MEDIA` kind + `MEDIA`-lane sender (`SuccessWithId(realMediaId)`) + lane
  ordering (`MEDIA` before `STORY`) + composer chain. See "Next slice" #1.

### 2026-06-27 — slice `outbox-produced-id-writeback` ✅
- **Branch:** `claude/apps/android/outbox-produced-id-writeback` (off `origin/main` @ `64c2c4e1`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests head:claude/apps/android` → 0). `main` was fresh (last merge
  `#985 outbox-dependency-gating`); branched directly off it.
- **What:** the **second half** of the durable upload→publish chain (the part-1
  follow-up flagged in "Next"). The `outbox-dependency-gating` slice taught the
  drainer to *hold* a publish until its upload lands, but the held publish still
  carried its **enqueue-time** `mediaIds` — useless for a media story queued
  **offline, before the upload finished** (the real `mediaId` is unknowable then).
  Now: when a prerequisite delivers a **`SendResult.SuccessWithId(producedId)`**, the
  drainer **grafts** that real id into every still-queued dependent's payload —
  placeholder = the prerequisite's own `cmid` — **before** the prerequisite row is
  deleted and the gate opens. So a media story queued offline with a placeholder
  publishes with the correct id once its upload lands. Surpasses iOS, which uploads
  synchronously and cannot queue a media story while offline.
- **Added / changed (production, `apps/android` only):**
  - `PublishMediaWriteBack.graft(payload, placeholder, realId): String?` (pure, new) —
    decodes a `CreateStoryRequest`, swaps every `placeholder` media id for `realId`
    (order preserved, duplicates collapsed via `distinct()`), re-encodes; returns
    `null` (no-op) when undecodable, no `mediaIds`, placeholder absent, or an identity
    swap — so the caller skips a pointless durable write.
  - `SendResult.SuccessWithId(producedId: String)` (new variant) — a delivery that
    carries a server-produced id; accounted as a delivery exactly like `Success`.
  - `OutboxDrainer` — gains an injected `graftProducedId` (default no-op, keeping the
    outbox package generic). On `SuccessWithId`, calls `outbox.rewriteDependents(...)`
    then `markSucceeded` (graft-before-delete ordering).
  - `OutboxRepository.rewriteDependents(prerequisiteCmid, rewrite): Int` — applies a
    generic `(payload) -> payload?` to every **PENDING** dependent (skips
    INFLIGHT/EXHAUSTED — can't rewrite a row mid-flight), persists non-null results,
    returns the count. Generic shape keeps the queue payload-format-agnostic.
  - `OutboxDao` — `findDependents(cmid)` (by `dependsOn`) + `updatePayload(cmid,
    payload, now)`. No schema change (the `payload` column already exists).
  - `OutboxFlushWorker` — wires `graftProducedId = PublishMediaWriteBack::graft` so the
    production drainer is capable; `onExhausted` made a named arg in the same call.
- **Tests (+17, red→green):**
  - `PublishMediaWriteBackTest` (pure) +10 — graft in place; order/neighbours
    preserved; every occurrence replaced; dedupe when realId already present; rest of
    the request intact (content/visibility); inert on placeholder-absent, null media,
    empty media, identity swap (realId==placeholder), undecodable payload. All `graft`
    branches hit.
  - `OutboxDrainerTest` +3 — `SuccessWithId` grafts the real id into a waiting
    dependent publish; `SuccessWithId` counts as a delivery and removes the row; a
    plain `Success` leaves a dependent placeholder untouched (graft only on the new arm).
  - `OutboxRepositoryTest` +4 — rewrites every PENDING dependent and returns the count;
    a `null` rewrite leaves the row untouched; rows depending on a **different**
    prerequisite are ignored; a **non-PENDING** (INFLIGHT) dependent is skipped.
- **Edge cases covered:** empty/single media list; null/absent `mediaIds`; placeholder
  absent (inert); identity swap (inert, no DB write); duplicate collapse; undecodable
  payload (graceful null, never a crash); dependent on a different prerequisite; a
  non-PENDING dependent skipped; graft-before-delete ordering; `dependsOn`-less and
  plain-`Success` rows unaffected (all prior drainer/repo tests still green).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 1m47s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). TEST XMLs:
  `PublishMediaWriteBackTest` 10/10, `OutboxDrainerTest` 14/14, `OutboxRepositoryTest`
  13/13 — failures=0 errors=0.
- **Reviewer:** PASS — scope `apps/android` only (4 prod + 2 test changed, 1 prod + 1
  test new, all under `sdk-core/` + `core/database/`); behavioural tests through the
  public API (pure `graft`, drainer `drainLane` outcome, repo `rewriteDependents`
  count + observable payloads), no tautologies, no floor lowered; SDK purity (the
  story-specific knowledge lives only in the stateless `PublishMediaWriteBack`;
  `rewriteDependents`/the drainer stay payload-agnostic via the injected transform);
  single source of truth (reuses `MeeshyApi.json` + `CreateStoryRequest`, the one
  outbox table, `dependsOn` — no second queue, no new column); Instant-App (makes
  durable offline optimism *correct*, not just held); Kotlin style (`explicitApi`,
  immutable, early `return`/`continue`, exhaustive `when`). Surpasses iOS (durable
  offline media publish vs synchronous-only upload).
- **Follow-ups (next slice — the producer half):** no upstream sender returns
  `SuccessWithId` yet, and the worker's lane list still omits `MEDIA` (no
  `UPLOAD_MEDIA` kind/sender). Next: add a durable `UPLOAD_MEDIA` outbox row (needs a
  durable file-bytes store), a `MEDIA`-lane sender that returns `SuccessWithId(realId)`,
  drain `MEDIA` **before** `STORY`, and wire the composer to enqueue the upload +
  publish-with-placeholder chain. A `BLOCKED` dependency also doesn't currently set
  `anyTransient`, so a held lane isn't auto-retried by WorkManager — revisit when the
  producer lands.

### 2026-06-27 — slice `outbox-dependency-gating` ✅
- **Branch:** `claude/apps/android/outbox-dependency-gating` (off `origin/main` @ `8277b688`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests head:claude/apps/android` → 0). `main` was fresh; branched
  directly off it.
- **What:** the durable **upload→publish outbox chain** primitive — the SOTA
  follow-up flagged on `story-composer-media`. The `dependsOn` cmid was persisted on
  every outbox row but the drainer **never consulted it**; a media publish could be
  delivered before (or independently of) the upload it depends on. The drainer now
  gates a dependent on its prerequisite: it **holds the lane** while the prerequisite
  is still queued, runs the dependent once the prerequisite has succeeded (its row is
  gone), and **cascade-exhausts** the dependent if the prerequisite gives up. The
  prerequisite may sit on a **different lane** (e.g. an upload on the new `MEDIA`
  lane the publish, on the `STORY` lane, depends on). Surpasses iOS, which has no
  durable cross-mutation dependency primitive.
- **Added / changed (production, `apps/android` only):**
  - `OutboxModel.kt` — pure `DependencyVerdict {SATISFIED, BLOCKED, FAILED}` +
    `OutboxDependencies.verdict(prerequisiteState: OutboxState?)`: `null` (gone) →
    `SATISFIED`; `EXHAUSTED` → `FAILED`; `PENDING`/`INFLIGHT` → `BLOCKED`. Added
    `OutboxLanes.MEDIA = "media"` for the upload lane.
  - `OutboxRepository.stateOf(cmid): OutboxState?` — current state of an arbitrary
    cmid (null when the row is gone), so the drainer can resolve a cross-lane gate.
  - `OutboxDrainer.drainLane` — before sending a row with a non-null `dependsOn`,
    resolves the verdict: `BLOCKED` returns early (`stoppedOnBlockedDependency=true`,
    dependent left `PENDING`); `FAILED` `markExhausted`+`onExhausted`+continues;
    `SATISFIED` falls through to the existing send path. `DrainReport` gains
    `stoppedOnBlockedDependency: Boolean = false` (defaulted — no existing call site
    changes). A `dependsOn == null` row is entirely unaffected (existing behaviour).
- **Tests (+9, red→green):**
  - `OutboxDependenciesTest` (pure) +4 — gone→SATISFIED; PENDING→BLOCKED;
    INFLIGHT→BLOCKED; EXHAUSTED→FAILED. All four arms of the nullable-state `when`.
  - `OutboxDrainerTest` +5 — a pending prerequisite holds the dependent (lane stops,
    0 sends, dependent stays PENDING); an inflight prerequisite holds it; a succeeded
    (gone) prerequisite lets it deliver; an exhausted prerequisite cascade-exhausts
    it (onExhausted fires with the dependent, state EXHAUSTED); a never-enqueued
    prerequisite delivers (gone = satisfied).
- **Edge cases covered:** prerequisite gone vs present; all three live/terminal
  states (PENDING/INFLIGHT/EXHAUSTED); cross-lane dependency (upload on `MEDIA`,
  publish on `STORY`); never-existed prerequisite (no crash, treated satisfied);
  cascade-failure surfaces through `onExhausted` (never a silent drop); a
  `dependsOn == null` row unaffected (all 6 prior drainer tests still green).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m08s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks).
  `:sdk-core:testDebugUnitTest` — `OutboxDependenciesTest` 4/4, `OutboxDrainerTest`
  11/11 green (TEST XMLs: tests=4/11 failures=0 errors=0).
- **Reviewer:** PASS — scope `apps/android` only (3 prod + 2 test files, all under
  `sdk-core/`); behavioural tests through the public API (pure `verdict`, drainer
  `drainLane` report + observable outbox state), no tautologies, no floor lowered;
  SDK purity (the dependency *resolution* is a stateless building block in
  `:sdk-core` — there is no product "when to chain" rule here, that is the future
  composer's job); single source of truth (reuses `OutboxState`/`dependsOn`/the one
  outbox table — no second queue, no new state machine); Instant-App (the gate makes
  durable optimism *stronger* — a queued publish now waits for its upload rather than
  failing); Kotlin style (`explicitApi` honoured, immutable `DrainReport` with a
  defaulted field, exhaustive `when`, early `return`/`continue`). Surpasses iOS
  (durable cross-mutation dependency vs none).

### 2026-06-27 — slice `story-composer-multipick` ✅
- **Branch:** `claude/apps/android/story-composer-multipick` (off `origin/main` @ `2d229df4`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests head:claude/apps/android` → 0). The one open PR (#980) is a
  `shared` types-coverage PR by a teammate — outside Android scope, left untouched.
  `main` was fresh; branched directly.
- **What:** lets the composer grab **several media in one pick**, while keeping the
  iOS ≤10 cap. Closes the "multi-pick the picker" follow-up flagged on
  `story-composer-media`/`-media-cap`.
- **Added (production, `apps/android` only):**
  - `StoryMediaPickMode` (pure enum `None`/`Single`/`Multiple`) + `StoryMediaPicker.modeFor(remainingSlots)`
    — routes by free slots: `<= 0` → `None` (don't launch), `== 1` → `Single`,
    `>= 2` → `Multiple`. Encodes the crash-avoiding rule that Android's
    `PickMultipleVisualMedia(maxItems)` **throws** when `maxItems <= 1`.
  - `StoryComposerScreen` (exempt glue) — now holds two launchers (`PickVisualMedia`
    single + `PickMultipleVisualMedia(MAX_MEDIA)` multi); a shared `dispatchPicked`
    reads every picked uri off-main into `MediaUploadItem`s and forwards the batch to
    the existing `onMediaPicked` (which already truncates to free slots). The Add
    button's `onClick` switches on `StoryMediaPicker.modeFor(...)`.
- **Tests (+8, red→green):** `StoryMediaPickerTest` — `modeFor` 0/None, negative/None,
  1/Single, 2/Multiple, `MAX_MEDIA`/Multiple; plus draft-derived: empty draft → Multiple,
  one-slot-left draft → Single, full draft → None. All three `when` arms + both
  boundaries (0→1, 1→2) hit.
- **Edge cases covered:** empty/full collections (0 and 10 media); boundary at the
  single-slot fallback (1 vs 2); defensive negative slot count → None. The
  per-launch quantity cap is unchanged (VM truncation, already tested in
  `StoryComposerViewModelTest`).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 6m14s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks).
  `StoryMediaPickerTest` 8/8 green (`TEST-…StoryMediaPickerTest.xml`:
  tests=8 failures=0 errors=0).
- **Reviewer verdict:** PASS — diff is `apps/android` only (3 files: 1 pure prod, 1
  glue screen, 1 test); behavioural tests through the public `modeFor` API, no
  tautologies; SDK purity respected (pure product rule lives in `:feature:stories`,
  not the SDK); no coverage floor touched.

### 2026-06-27 — slice `story-composer-media-cap` ✅
- **Branch:** `claude/apps/android/story-composer-media-cap`
- **Housekeeping (step 0):** PR **#979** (`story-composer-media`) was open from the
  prior run, held only by the pre-existing `Test gateway` red on `main`. Re-verified
  the blocker — the duplicate `jwt` import (`AuthHandler.manual-auth.test.ts` lines
  16 & 21) is present verbatim on `origin/main`, the PR's diff touches **zero**
  gateway files, and 11/12 CI checks are green — so merging this `apps/android`-only
  PR cannot regress `main` (already red on that one job). Per the run directive
  ("merge the open PR before proceeding"), **squash-merged #979** → `0d65615`, then
  branched this slice off the freshened `main`.
- **What:** enforces the iOS **≤10 media-per-story cap** end-to-end. Closes the
  "multi-pick limit (≤10)" follow-up flagged on `story-composer-media`.
- **Added (production, `apps/android` only):**
  - `StoryComposerDraft` (pure) — `MAX_MEDIA = 10`; `isWithinMediaLimit`
    (`size <= MAX_MEDIA`); `remainingMediaSlots` (`MAX_MEDIA - size`, clamped ≥0 so
    the UI can size a picker request); `isMediaFull` (`size >= MAX_MEDIA`).
    `canPublish` now also requires `isWithinMediaLimit`, so an over-cap draft can't
    publish.
  - `StoryComposerViewModel.onMediaPicked` — computes free slots from the draft:
    inert-with-a-warning (`MEDIA_LIMIT`, no upload) once full; otherwise uploads only
    `items.take(remaining)` so a pick can never exceed the cap and never wastes an
    upload on items that won't fit.
  - `StoryComposerScreen` (exempt glue) — Add button `enabled` also gated on
    `!draft.isMediaFull`; label switches to an `n/10` count (`stories_composer_add_media_count`)
    once media is attached.
  - strings — `stories_composer_add_media_count` in en/fr/es/pt, plus **backfilled**
    `stories_composer_add_media`/`stories_composer_remove_media` into fr/es/pt (a
    parity gap from #979, which only added them to default `values/`).
- **Tests (+6, red→green):**
  - `StoryComposerDraftTest` +4 — empty draft offers the full allowance + not full;
    partially-filled reports remaining slots; exactly-at-cap is full / 0 remaining /
    within-limit / still publishable; past-cap not-within-limit / remaining clamped
    to 0 / can't publish.
  - `StoryComposerViewModelTest` +2 — picking when at the cap is inert (no upload
    call) + warns + leaves the 10 attachments intact; picking 3 items with only 1
    free slot uploads exactly 1 (slot-captured) and lands at the cap.
- **Edge cases covered:** empty/at-cap/over-cap collections; boundary (=10 ok vs
  >10 blocked); remaining clamped non-negative; over-pick truncated to free slots;
  full → inert + no network. `CancellationException` path unchanged (still rethrown).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m16s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). `:feature:stories`
  `testDebugUnitTest` — `StoryComposerDraftTest` 23/23, `StoryComposerViewModelTest`
  23/23 green.
- **Reviewer:** PASS — scope `apps/android` only (draft/VM/screen + 4 string files +
  2 test files); behavioural tests through the public API (pure draft getters, VM
  state via intents), no tautologies, no floor lowered; SDK purity (the "≤10 cap /
  truncate / warn when full" product rule lives in `:feature:stories`; no SDK touch);
  single source of truth (one `MAX_MEDIA`, reuses the existing upload/draft flow);
  Instant-App (no new I/O — cap is derived from the in-memory draft); UDF + immutable
  `UiState`, pure draft; colour/UX coherence (Add button disables + shows `n/10`, no
  dead end). Surpasses iOS (cap enforced *and* over-pick truncated gracefully).

### 2026-06-27 — slice `story-composer-media` ✅ MERGED (PR #979, this run)
- **Status:** PR [#979](https://github.com/isopen-io/meeshy/pull/979) **squash-merged**
  this run (`0d65615`) — see the `story-composer-media-cap` housekeeping note above
  for why merging past the pre-existing `Test gateway` red was safe. The detail below
  is the original (held) entry, kept for the record.
- **Status (original):** PR open, held — everything in scope green (local `check`,
  reviewer PASS, `apps/android`-only diff, 11/12 CI checks ✅) but the monorepo
  **`Test gateway`** CI job is **red on `main` itself** — pre-existing breakage
  unrelated to this diff:
  - `AuthHandler.manual-auth.test.ts` — `TS2300: Duplicate identifier 'jwt'` (two
    `import jwt from 'jsonwebtoken'` lines 16 & 21 — present verbatim on `origin/main`).
  - `MeeshySocketIOManager.test.ts`, `AuthHandler.test.ts`, two `ConversationHandler`
    suites — assertion mismatches in gateway socket handlers.
  - `git diff origin/main...HEAD` touches **zero** gateway files → this PR cannot have
    caused it, and the hard scope rule (`apps/android` only, no production logic in
    `gateway/`) forbids fixing it inside this slice. Held per hard rule "never merge
    past red CI". Will re-run CI + squash-merge once `main`'s gateway suite is green
    (tracked: a separate, explicitly-authorised run is needed to fix gateway tests —
    out of the Android workstream's scope).
- **Branch:** `claude/apps/android/story-composer-media`
- **Housekeeping:** no open Android PR to land first (`list_pull_requests` open
  set = 24, none on an `apps/android` head). Branched off latest `origin/main`
  (carries #976). SDK bootstrapped per the env recipe; also installed
  `build-tools;34.0.0` (a module pins it — the recipe only lists 35.0.0; noted).
- **What:** wires **real media** into the story composer on top of the
  `media-upload-api` foundation. The composer gains an "Add photo or video" button
  that launches the **system photo/video picker** (`ActivityResultContracts
  .PickVisualMedia`, ImageAndVideo); the picked file is read off-main into a
  `MediaUploadItem`, uploaded via `MediaRepository.upload()`, and the returned
  `UploadedMedia` is **appended** to the draft. `publish()` carries the resulting
  `mediaIds` into the existing durable-outbox publish flow. A **media-only** story
  (no caption) is now publishable. Surpasses iOS (single-JPEG-avatar uploads,
  no story media composer yet).
- **Added / changed (production, `apps/android` only):**
  - `StoryComposerDraft` — `mediaIds: List<String>` + `hasMedia` + `withMediaIds`;
    `canPublish` now admits **text OR media** within the limit; `toCreateStoryRequest`
    sends `content` null when blank (media-only) and rides `mediaIds` when present.
  - `StoryComposerViewModel` — injects `MediaRepository`; `StoryComposerUiState`
    gains `attachments: List<UploadedMedia>` + `isUploadingMedia` (gates `canPublish`).
    New `onMediaPicked(items)` (empty/in-flight inert; upload → append on success;
    failure / thrown / all-rows-unusable → message, draft intact; `CancellationException`
    rethrown) and `onRemoveMedia(id)`. `publish()` now guards on the derived
    `canPublish` (so an in-flight upload blocks it) and clears attachments on success.
  - `StoryComposerScreen` — picker launcher + off-main `ContentResolver` reader
    (bytes/MIME/display-name → `MediaUploadItem`), media preview `LazyRow`
    (coil `AsyncImage` thumbnails + remove chip), "Add photo or video" button with
    in-flight spinner. Exempt Compose/IO glue.
  - `feature/stories/build.gradle.kts` — `implementation(libs.androidx.activity.compose)`
    for `rememberLauncherForActivityResult` / `PickVisualMedia`.
  - strings: `stories_composer_add_media`, `stories_composer_remove_media`.
- **Tests (+19, red→green):**
  - `StoryComposerDraftTest` +6 — media-only draft publishes; media + over-limit
    text can't; empty draft has no media / can't publish; `withMediaIds` is a pure
    copy preserving text+visibility (original untouched); `toCreateStoryRequest`
    carries non-empty `mediaIds` alongside text; media-only request sends null content.
  - `StoryComposerViewModelTest` +13 — empty pick is inert (no upload call); upload
    stores ids on the draft + flips `canPublish`; second pick **appends**; in-flight
    sets `isUploadingMedia` and blocks publish until resolved (gated `CompletableDeferred`);
    re-entrancy guard (one upload while in flight); failure response → message, no ids;
    thrown upload → message, no ids; all-rows-unusable (empty success) → message, no ids;
    `onRemoveMedia` drops the attachment + its id; media-only draft publishes carrying
    `mediaIds` with null content; publish clears attachments on success.
- **Edge cases covered:** empty pick (short-circuit, no network); single vs append;
  in-flight re-entrancy + publish-gating; three failure paths (Failure / exception /
  empty-success); remove-then-publish; media-only (no text) boundary; over-limit text
  with media. `CancellationException` rethrown (cancellation-safe `viewModelScope`).
- **Verify:** `:feature:stories:testDebugUnitTest --tests StoryComposer*` →
  **BUILD SUCCESSFUL in 2m09s**; full `assembleDebug + testDebugUnitTest` →
  **BUILD SUCCESSFUL in 2m58s** (836 tasks; full debug APK + every module's JVM
  unit tests green).
- **Reviewer:** PASS — scope `apps/android` only (draft/VM/screen/build/strings +
  docs; no web/ios/gateway/shared); behavioural tests through the public API
  (draft rule, VM state machine via intents + Turbine-free synchronous reads under
  `UnconfinedTestDispatcher`), no tautologies, no floor lowered; SDK purity (the
  "when to upload / append / gate publish" rule is product UX → `:feature:stories`;
  `MediaRepository`/`MediaUpload`/wire mapper stay building blocks in `:sdk-core`/
  `:core:*`); single source of truth (reuses `MediaRepository.upload`, `NetworkResult`,
  `LanguageResolver`, the one durable outbox); Instant-App (optimistic publish
  unchanged; upload shows an inline spinner, not a blocking screen); colour/nav
  coherence (composer accent unchanged, natural system-picker gesture, removable
  preview). Surpasses iOS (any-MIME multi-file upload + media-only story vs single
  JPEG avatar / no story media composer).

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
