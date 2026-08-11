# Progress — state & what to do next

> **Archive:** entries older than the ~300-line hygiene threshold live in
> [`PROGRESS-archive-2026-08.md`](./PROGRESS-archive-2026-08.md) (same prepend/newest-first order).
> Archived 2026-08-10 (routine iteration 30, hygiene pass — pure archiving increment, no
> slice, `tasks/lane-cursor.md` unchanged per §Hygiène): moved the 4 oldest entries at the
> time (`feed-composer-media-attachments` back through the `TagInputField`/Kover tail note)
> to the archive, keeping the 4 most recent (`feed-composer-camera-capture`, the §C
> inverted-list decomposition, `notification-channel-id-drift`,
> `feed-composer-reel-classification`).

> On 2026-08-11 **TUS uploads gained a Room-backed checkpoint so a retried upload resumes past
> already-acknowledged chunks instead of restarting from byte zero** (slice
> `tus-upload-checkpoint-resume`, §Q — the "persistent checkpoint" candidate `tus-chunked-upload-
> core` flagged as the next sub-slice). **RE-PROUVEN before starting**: `git branch -r`/`gh pr
> list --state open` found no interrupted run (no `claude/apps/android/*`/`claude/apps/ios/debt-*`
> branch touched recently, the one open PR — `apps/web/calls`-scoped — unrelated to this routine).
> Read `TusUploadRepository.upload()`/`MediaUploadItem` closely: confirmed the prior slice's own
> doc comment was accurate — every retry always called `createUpload` fresh and PATCHed from
> offset zero, discarding any prior progress unconditionally. Also confirmed the true remaining
> surface is bigger than "persistent checkpoint" alone: `MediaUploadItem.bytes` is a `ByteArray`
> fully resident in memory for the call's lifetime, so genuine app-kill survival additionally needs
> a lazily-read file source (the bytes themselves don't outlive the process) — scoped this slice to
> the checkpoint's honest, immediately-valuable subset (resume across retries within a session/
> process) rather than over-claim app-kill survival the current architecture can't yet deliver.
> **Shipped (production, all `apps/android`)**: new `tus_upload_checkpoint` Room table
> (`:core:database`, `TusUploadCheckpointEntity`/`Dao`, `MeeshyDatabase` v11→v12,
> `fallbackToDestructiveMigration` — no migration test needed per existing convention) + pure
> `TusCheckpointKey.of(context, fileName, mimeType, totalBytes)` (`:core:model` — deliberately
> content-agnostic, no hash of the bytes: capture paths already name files with millis-precision
> timestamps and a picked gallery item keeps its display name across a retry, so this is a cheap,
> strong-enough identity) + pure `TusResumePlanner.plan(...)` deciding `Fresh` vs
> `Resume(location, offset)` — conservatively `Fresh` whenever confirmed progress is zero (no HEAD-
> recovery exists yet to verify the gateway's own view of a stale/unconfirmed session, so only
> genuinely multi-chunk uploads that got at least one chunk acknowledged ever resume; a single-
> chunk upload, the common case, behaves byte-identical to before). `TusUploadRepository.upload()`
> now looks up a checkpoint by key before choosing to call `createSession` or reuse an existing
> `location`, writes the checkpoint after every acknowledged intermediate chunk, and defensively
> clears it on completion (a harmless no-op when absent, confirmed by a dedicated DAO test) —
> covers the failure path too (a failed chunk never writes, a failed final chunk leaves the row
> untouched for the next retry). +29 new tests: 13 pure (`TusCheckpointKeyTest`/
> `TusResumePlannerTest`, `:core:model`), 6 DAO (`TusUploadCheckpointDaoTest`, Robolectric
> in-memory Room, `:core:database`), 10 repository (`TusUploadRepositoryTest`, `:sdk-core` —
> single-chunk never upserts, successful/failed intermediate and final chunks, a checkpoint with
> confirmed progress resumes without calling `createUpload`, a checkpoint with zero progress still
> starts fresh). **Mutation-proven**: hardcoding `TusResumePlanner.plan` to always return `Fresh`
> fails **exactly** the 2 discriminating "resumes" tests, the 6 "starts fresh" tests correctly stay
> green — reverted via a scratch `cp`-backed edit, never `git checkout --`, re-confirmed green.
> **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, zero failures,
> matching the prior slice's task count — no build-graph regression). Reviewer **PASS** (diff
> `apps/android` only — 5 new files, 4 edited [`MeeshyDatabase`/`DatabaseModule`/
> `TusUploadRepository`/its test]; SDK purity — the checkpoint key/resume decision are stateless
> building blocks in `:core:model`/`:core:database`, matching the prior slice's own precedent of
> putting TUS protocol orchestration in `:sdk-core`'s `TusUploadRepository`, reused identically by
> every composer that calls it (post/story/status/comment) — no per-feature duplication; no
> coverage floor lowered; no tautological tests). **Full on-device verification against the live
> gateway** (`meeshy_pixel8`): pushed three distinct ~17.9 MB synthetic (noise-source, so
> incompressible and genuinely multi-chunk) videos via `adb push` + a media-scanner broadcast,
> attached each through the real Feed post composer's gallery picker (`uiautomator dump` bounds
> throughout, including chasing the system photo-picker's `Add (N)` button across two
> re-verifications after a stale-bounds miss dismissed the sheet). `adb logcat` confirmed the real
> two-chunk sequence **twice**: `POST /uploads` → `201` → `PATCH` (non-final, 10 MB) → `204` →
> `PATCH` (final, ~7.9 MB) → `200` with the gateway's own attachment JSON (real probed
> `duration`/`bitrate`/`codec`, not garbage). Queried the on-device Room DB directly
> (`run-as … sqlite3 databases/meeshy.db`): confirmed the `tus_upload_checkpoint` table exists with
> exactly the designed columns (proving the v11→v12 migration applied cleanly on a real device, no
> crash) and reads back **empty** after each successful upload (proving the defensive
> delete-on-completion path really executed against the real Room DB, not just a mock). Attempted
> (twice) to catch the transient mid-upload row via a tight polling loop timed right after the
> picker's "Add" tap; both attempts' polling windows landed outside the ~2.3 s intermediate-PATCH
> window (`adb shell run-as … sqlite3` round-trip overhead made the window hard to hit reliably) —
> noted honestly rather than fabricated: the transient write itself is unconfirmed live, but the
> pre/post states (empty → real progress implied by the resumed-PATCH unit tests → empty again) and
> the mutation-proven pure logic together close the loop without it. `adb logcat` checked across
> the whole session for `FATAL EXCEPTION`/`AndroidRuntime` — none. App force-stopped and emulator
> left on the home screen afterward (not mid-composer). **Categorical re-check (due again per the
> ~5-run cadence, flagged by the orchestrator this iteration)**: re-grepped
> `AppWidgetProvider`/`GlanceAppWidget`/`glance-appwidget`/`PictureInPicture`/
> `enterPictureInPictureMode`/`PipParams` across `apps/android` (excluding `build/`) — **zero hits,
> unchanged from prior runs**. Both already have checklist lines in `feature-parity.md` (§ "Home-
> screen widgets", §P "Picture-in-Picture", §Calls "PiP / floating call pill") from the iteration-19
> audit-gap fix, so this is not a fresh audit hole — just confirms genuinely zero progress, both
> still correctly deferred as multi-slice epics (a new Gradle module + Glance dependency for
> widgets; WebRTC-adjacent surface + system PiP API wiring for calls) rather than pickable as a
> single thin slice. **Next slice candidates (not attempted this run)**: the persistent-checkpoint
> follow-ups this slice explicitly scoped out (lazy file-source read, boot-time orphan/checkpoint
> recovery scan, 409 HEAD-recovery, dedicated `WorkManager` foreground chain); on-device
> transcription for the Feed audio composer (still no Android on-device transcription capability
> anywhere, needs its own foundation); location attachment for the Feed composer (re-confirmed
> this run to be a bigger gap than previously scoped — no `FusedLocationProviderClient`/
> `LocationServices` usage anywhere in `apps/android`, not even in chat's existing static-location
> *display* path, so a send-side location capability doesn't exist at all yet, not just "no
> picker UI"); a concrete sub-slice decomposition write-up for widgets/PiP (both confirmed real but
> too large for one slice — worth a dedicated planning pass rather than another bare re-grep next
> time); the gateway `POST /conversations/:id/messages` 400 flagged out-of-lane by the prior slice
> (unconfirmed whether still live — worth re-checking, cross-platform, not Android-scoped).

> On 2026-08-11 **`OutboxFlushWorker` never drained per-conversation message lanes in
> production — root-caused and fixed** (slice `outbox-message-lane-discovery`, §Q — the
> "`OutboxFlushWorker` re-drain même-run" candidate the previous iteration flagged without
> detailing). **RE-PROUVEN before starting**, per the orchestrator's explicit instruction to
> re-derive exactly what the candidate is: `git branch -r`/`gh pr list --state open` found no
> interrupted run (only one open PR, `apps/web/calls`-scoped, unrelated to this routine). Reading
> `OutboxFlushWorker.doWork()` closely (not just skimming the prior iteration's framing) found the
> actual bug is far more severe than "same-run timing": `messageLanes` was discovered via
> `outboxRepository.deliverable(OutboxLanes.forMessage(""))`, which resolves to an **exact-match**
> SQL query (`WHERE lane = :lane`) against the literal string `"message:"` — no row is ever
> enqueued with a blank conversation id, so this **always returned an empty list**. The "drain
> per-conversation message lanes" loop was **dead code in production**: `SEND_MESSAGE`/
> `EDIT_MESSAGE`/`DELETE_MESSAGE` rows were never attempted at all, not merely delayed by one
> pass. **Proven empirically** with a new Robolectric test pinning the old call pattern's
> brokenness (`deliverable(OutboxLanes.forMessage(""))` returns empty even with a real pending
> `SEND_MESSAGE` enqueued on `"message:c1"`) before writing the fix. **Shipped (production, all
> `apps/android`)**: `OutboxDao.activeMessageLanes()` (`core:database` — `SELECT lane FROM outbox
> WHERE lane LIKE 'message:%' AND state != 'EXHAUSTED' GROUP BY lane ORDER BY MIN(createdAt) ASC`,
> a genuine distinct-lane discovery query) + `OutboxRepository.activeMessageLanes()` wrapper
> (`sdk-core`), wired into `OutboxFlushWorker.doWork()` in place of the broken call — a 1-line
> swap once the discovery primitive exists. +4 new tests (discovers a lane holding a pending
> send; discovers every distinct lane oldest-first without duplicating a 2-row lane; omits a lane
> whose only row is `EXHAUSTED`; empty when the queue holds only shared-lane rows) + 1 regression-
> pin test documenting the old broken call pattern. **No same-pass redrain logic was needed**:
> `OutboxFlushPlan.outcome`'s existing `FlushOutcome.RETRY` (→ WorkManager's own `EXPONENTIAL,
> 10s` backoff) already handles "prerequisite delivered later in the same pass" correctly by
> design (its own doc comment says so) — it simply never fired for message lanes because they
> were never visited. Fixing discovery alone makes the pre-existing retry design actually work
> for the first time. **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970
> tasks, zero failures). Reviewer **PASS** (diff `apps/android` only — 4 files, 2 production +
> 1 test + 1 worker wiring; SDK purity n/a — this is `core:database`/`sdk-core` internal plumbing,
> no product decision; no coverage floor lowered; no tautological tests — every assertion checks
> a real query result against real enqueued rows, not a canned mock).
> **Full on-device verification against the live gateway** (`meeshy_pixel8`, already-authenticated
> session): reopened the exact conversation the prior iteration's notes named
> (`flip-test-verify`/`ime-verify-flip-c3`, both stuck pending for weeks) and sent a fresh
> message. `adb logcat` now shows `OutboxFlush lane=message:68f3808baf186ffd9583b0fa ...` — a log
> line that **could not structurally have appeared before this fix** (the loop producing it was
> never entered). `flip-test-verify` was attempted for the first time ever and transitioned from
> an inert clock icon to `Not sent — tap to retry` (a stale/old-schema payload decode failure,
> now correctly surfaced to the user instead of rotting silently forever — an improvement in its
> own right). A fresh message in a second, unpolluted conversation (`Windie Nh`) triggered a real
> `POST https://gate.meeshy.me/api/v1/conversations/6a712c3acd1fb95d11b8fc6d/messages`, confirmed
> via OkHttp request/response logcat lines. `adb logcat` checked for `FATAL EXCEPTION`/
> `AndroidRuntime` across the whole verification pass — none. Emulator left on the home screen
> afterward (app closed cleanly, not mid-flow).
> **New, separate, out-of-lane finding — flagged, NOT fixed here** (gateway code; fixing it would
> violate this PR's `apps/android`-only diff purity): both `POST /conversations/:id/messages`
> calls above returned `400 {"error":"Internal Server Error"}`. Reproduced independently with a
> bare `curl` using the same bearer token (rules out any Android request-shape cause) while a
> `GET` on the same conversation's messages returns `200` normally — creating a new message via
> the REST API currently appears broken in production, platform-independent. This means the fix
> in this slice cannot be verified all the way to a green "delivered" checkmark right now — the
> discovery-and-attempt pipeline is proven correct (real POSTs now reach the gateway, which never
> happened before), but the gateway-side 400 is a pre-existing, currently-live, unrelated
> production issue that deserves its own urgent investigation (likely `services/gateway`, POST
> message-creation route). **Next slice candidates (not attempted this run)**: investigate/fix
> the gateway `POST /conversations/:id/messages` 400 above (urgent, cross-platform, NOT
> Android-scoped — needs its own lane/session); on-device transcription for the Feed audio
> composer; location attachment for the Feed composer; the §Q persistent TUS checkpoint store;
> widgets/PiP categorical re-check (due again per the ~5-run cadence).

> On 2026-08-10 **the Feed post composer's audio-attachment sub-slice landed — re-proven and
> shipped in the same iteration the prior slice's own follow-up list flagged it as unblocked**
> (slice `feed-composer-voice-capture`, feature-parity §F — the standing "files, location, audio,
> per-post language" candidate's audio sub-slice, previously deferred: "blocked on the still-
> pending `MediaRecorder`/`AudioRecord` capture core... no Android audio recorder exists yet at
> all, chat or feed"). **RE-PROUVEN before starting** (per the orchestrator's explicit prompt to
> re-verify this exact unblock): confirmed `chat-voice-recording-capture` (merged the same day,
> `#2791`) really did land a working, reusable `MediaRecorder` capture stack — read
> `VoiceRecordingSession.kt`/`VoiceRecordingFile.kt`/`VoiceRecordingPill.kt` end to end (all
> living in `:feature:chat`, module-private) and confirmed `:feature:feed` has no dependency on
> `:feature:chat` (checked `build.gradle.kts`), so a literal reuse across features wasn't
> possible without first promoting the shared bits — reused, not duplicated, per the prompt's own
> explicit instruction. `git branch -r`/`gh pr list --state open` found no interrupted run (no
> `claude/apps/android/*`/`claude/apps/ios/debt-*` branch touched in the prior 24h, no matching
> open PR). Also read iOS's `AudioPostComposerView.swift` (785 lines) end to end — confirmed it's
> a full dedicated screen (on-device transcription via `EdgeTranscriptionService`, a language
> picker, its own preview/publish flow), a materially larger scope than the chat voice pill's
> inline capture; decomposed rather than ported whole, matching the routine's own established
> sub-slice-decomposition precedent (`tus-chunked-upload-core`, `feed-composer-file-attachment`).
> **Shipped (production, all `apps/android`)**: promoted `VoiceRecordingSession`/
> `VoiceRecordingOutcome`/`VoiceRecordingStop`/`VoiceRecordingPhase`/`VoiceRecordingFile`
> (pure — same file, same tests, only the package changed) from `:feature:chat` to
> `:core:model`'s `me.meeshy.sdk.model.waveform` (alongside `MicAmplitudeDecibels`, which the
> Feed composer already had transitive access to via `:sdk-core`'s `api(project(":core:model"))`
> and needed no move) and `VoiceRecordingPill` (`internal` → `public`) from `:feature:chat` to
> `:sdk-ui`'s `me.meeshy.ui.component.recording` — a behaviour-preserving move (`ChatScreen.kt`
> gains 4 new imports, otherwise unchanged; its own two moved test files stay green verbatim) so
> both composers share one state machine/pill instead of two drifting copies, honouring the
> orchestrator's explicit "reuse, don't duplicate" instruction and CLAUDE.md's SSOT principle.
> `FeedComposerSheet` gains a sixth attach tile (`Icons.Filled.Mic`, mirrors iOS's `mic.fill`)
> wired with the **exact same** permission-request → `MediaRecorder` (`MPEG_4`/`AAC`) →
> 100 ms tick-and-meter loop → Stop/Send-finalises-identically shape `ChatScreen` already proved
> — Android-runtime I/O glue with no further pure decision to share, so duplicated rather than
> promoted (matching this composer's own existing precedent of duplicating `readMediaUploadItem`
> rather than importing chat's). While recording, `VoiceRecordingPill` **replaces**
> `MediaAttachmentsRow` in place (same UX shape as the chat composer swapping its whole input row
> for the pill) — already-attached media/spinner reappear immediately once the take is
> cancelled/finalised. The take is handed to a new `dispatchItems(items: List<MediaUploadItem>)`
> entry point — a small refactor extracting the shared "cap, upload, fold into draft+previews"
> tail (`uploadAndAttach`) out of the existing `dispatchPicked`, so both the Uri-based pickers and
> the directly-built voice `MediaUploadItem` (bytes + explicit `"audio/mp4"` MIME, matching
> chat's approach rather than trusting `ContentResolver.getType()`'s `.m4a` MIME-sniffing, which
> chat's own doc comments already flagged as unreliable) converge on one upload path — zero new
> gateway/pipeline logic, reusing the already-tested `MediaKindClassifier`/
> `UploadedMedia.hasThumbnailPreview` `AUDIO` case (generic-icon fallback). **New, genuinely
> Feed-specific correctness fix**: a `DisposableEffect` releases the `MediaRecorder`/deletes the
> in-flight file on composable disposal — unlike chat's composer (anchored to a screen, not
> casually dismissed), this composer is a `ModalBottomSheet` provably dismissible via the system
> back gesture mid-recording with no confirmation (the exact gotcha `feed-composer-file-
> attachment`'s own on-device verification already documented) — an un-released `MediaRecorder`
> left recording past the sheet's lifetime would leak an open microphone, a materially worse
> consequence than that slice's lost picked-image edge case; `Header`'s Publish also gates on
> `!recording.isRecording` so a live take can't be silently orphaned by publishing over it.
> **No new tests** beyond the moved ones (which stay green unchanged) — every genuinely new
> decision in this slice is either Android-runtime Compose/IO glue (exempt per `TDD-COVERAGE.md`,
> matching this composer's own precedent for `dispatchPicked`/`launchCamera`) or a reuse of
> already-tested pure logic (`MediaKindClassifier`'s `startsWith("audio/")` prefix match already
> covers `audio/mp4` the same way the file-attachment slice's own `audio/mpeg` test proved).
> **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, full
> `assembleDebug` + all-module `testDebugUnitTest`, zero failures — including the 2 relocated
> `:core:model` waveform test files, confirmed individually via their test-result XML). Reviewer
> **PASS** (diff `apps/android` only — 11 files: 5 moved [3 production, 2 test, one crossing into
> `:sdk-ui`], `ChatScreen.kt` import-only, `FeedComposerSheet.kt` the real new wiring, 4 locale
> `strings.xml` [en/fr/es/pt, `feed_composer_record_voice` carries zero format specifiers]; SDK
> purity — the move is exactly the "stateless building block → `:sdk-core`/`:sdk-ui`" direction
> `REVIEWER.md` names explicitly; SSOT — one recording state machine, one pill, shared; no
> coverage floor lowered; no tautological tests). **Full on-device verification against the live
> gateway**: tapped the real Mic tile (`uiautomator dump` bounds, `content-desc="Record audio"`),
> confirmed Android's system mic-in-use indicator appeared and a real, growing
> `voice_<millis>.m4a` file in the Feed composer's own `cacheDir/voice/` (24,950 → 35,707 bytes
> across a 3s window); the pill's timer advanced (`0:01` → `0:20`) confirming the tick loop.
> Tapped Send: `adb logcat` confirmed a real `POST`+`PATCH /api/v1/uploads` round-trip
> (`filetype=audio/mp4`, `uploadcontext=post`) whose **response carried the gateway's own
> independent audio probe** — `duration:15741,bitrate:12200.16,sampleRate:8000,
> codec:"MPEG-4/AAC",channels:1` — definitive proof of genuine playable AAC, not silence-shaped
> garbage (same verification depth as the chat slice). The attachment rendered as the expected
> generic file-icon tile in the row (not a broken/blank thumbnail); its ≥3s duration correctly
> triggered the **already-existing, untouched** `ReelComposition` reel-classification rule (the
> `▶ Reel` chip appeared) — composes cleanly with an unrelated existing feature, zero
> special-casing added. Published for real (`POST /api/v1/posts` → 201, `type:"REEL"`, media
> attached); `GET /api/v1/posts/:id` confirmed the persisted post before `DELETE` →
> `{"deleted":true}`, confirmed gone via a follow-up `GET` → 404. Confirmed the local recording
> file is deleted after upload (`cacheDir/voice/` empty afterward — no orphan). `adb logcat`
> checked for `FATAL EXCEPTION`/`AndroidRuntime` across the whole sequence — none. Emulator left
> on the Feed screen afterward (a normal app screen, not mid-composer/mid-recording).
> **feature-parity.md's §F Create-post bullet now records audio attachment done** alongside
> photo/video/file; **§Q's "Universal audio recorder" line now cross-references both concrete
> chat + Feed instances** instead of only chat's. **Deliberate, documented scope cut vs. iOS**: no
> on-device transcription preview (`EdgeTranscriptionService`/`MobileTranscriptionPayload`), no
> per-post language override tied to the clip, no dedicated full-screen composer — iOS's
> `AudioPostComposerView` is a genuinely heavier, separately-scoped feature. **Next slice
> candidates (not attempted this run)**: on-device transcription for the Feed audio attachment
> (heavier — no Android on-device transcription capability exists anywhere in the app yet, would
> need its own investigation/foundation, not a small follow-up); location attachment for the Feed
> composer (needs a place-picker UI, still none exists); per-post language override (needs a
> language-picker component, none exists outside registration's inline menu); the `OutboxFlushWorker`
> same-run re-drain fix flagged by the chat voice slice (affects every dependent chat attachment
> send, not Feed-specific); the §Q persistent TUS checkpoint store; widgets/PiP (re-grepped this
> run too — still zero `AppWidgetProvider`/`GlanceAppWidget`/`PictureInPicture` hits, due for a
> real categorical pass soon per the ~5-run cadence — this run's own categorical check stayed
> negative).

> On 2026-08-10 **real `MediaRecorder` voice capture landed, closing the chat voice pill's own
> standing "pending follow-up"** (slice `chat-voice-recording-capture`, §Q — the routine's own
> two-item candidate list from `chat-voice-recording-pill`, 2026-07-15: "real MediaRecorder/
> AudioRecord capture feeding meter(), and the voice-attachment send pipeline"). **RE-PROUVEN
> before starting**: found two stale-but-recent remote branches
> (`claude/apps/android/feed-composer-media-attachments`, `claude/apps/ios/inline-video-top-
> controls`) via `git branch -r` — both diffed byte-identical to already-merged main commits
> (`dd151eac4` #2759, `7f49bf904` #2767), i.e. lost-the-race duplicates from a concurrent
> session, not interrupted work of this routine; deleted both remote branches (no PR to close,
> nothing to adopt) before choosing a slice. Read `ChatScreen.kt`'s composer: confirmed the
> pill's tick loop only ever called `.tick()`, never `.meter()` — `VoiceRecordingPill`'s own
> `RecordingWaveform` doesn't even read `session.levels`, it paints a fully synthetic
> `rememberInfiniteTransition` animation (its own doc comment already said so) — and Stop/Send
> both discarded the take unconditionally. **Shipped (production, all `apps/android`)**: new pure
> `me.meeshy.sdk.model.waveform.MicAmplitudeDecibels.toDecibels` (`:core:model`, alongside
> `AudioLevelNormalizer`) converts `MediaRecorder.getMaxAmplitude()`'s linear PCM reading
> (`0..32767`) to the dB domain the existing normalizer expects — genuinely new surface, not a
> port, since Android has no direct dB-metering API unlike iOS's `AVAudioRecorder.averagePower`.
> New pure `VoiceRecordingFile.next(nowMillis)` (`:feature:chat`, mirrors `:feature:feed`'s
> `CameraCaptureFile` byte-for-byte) names `voice_<millis>.m4a`. `ChatComposer` now: requests
> `RECORD_AUDIO` on Mic tap (mirrors `feature:calls`' `CallPermissions`/`withMediaPermissions`
> pattern verbatim), starts a real `MediaRecorder` (`MPEG_4`/`AAC`, API-31-aware constructor
> branch) writing into `cacheDir/voice`, polls `maxAmplitude` every 100 ms tick and feeds it
> through `MicAmplitudeDecibels.toDecibels` into `VoiceRecordingSession.meter()`. Rewrote
> `RecordingWaveform` to render `session.levels` directly (`animateFloatAsState` per bar) instead
> of the synthetic placeholder. Stop and Send both finalise the take identically (no staging tray
> exists anywhere in this composer — every other attachment kind sends on pick too) and, only on
> a `Completed` outcome (`canSend` already gates both buttons), hand the real bytes to the
> **existing, unmodified** `onPickFile`/`ChatViewModel.sendFileAttachment` — zero VM changes,
> since `AttachmentMessageType.forMime("audio/mp4")` already resolves `"audio"` and
> `ComposerSendGate` already gates it on `canSendAudios`. +10 tests (`MicAmplitudeDecibelsTest`:
> silence floor, defensive negative amplitude, full/half-scale dB, monotonicity, above-reference
> safety; `VoiceRecordingFileTest`: naming determinism/uniqueness, mirroring
> `CameraCaptureFileTest`). **Mutation-proven**: hardcoding `toDecibels` to always return
> `FLOOR_DB` fails **exactly** the 4 discriminating tests (monotonicity, full/half-scale,
> above-reference) — the 2 silence-floor tests (already expecting `FLOOR_DB`) correctly stay
> green; reverted via a scratch `cp`-backed edit (never `git checkout --`), re-confirmed green.
> **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, zero failures).
> Reviewer **PASS** (diff `apps/android` only — 2 new `:core:model`/`:feature:chat` files + 2 new
> test files, `VoiceRecordingPill.kt`/`ChatScreen.kt` edited; SDK purity — the dB conversion is a
> stateless building block reusable by any future recorder, "when/how to request the mic and
> wire it" stays app-side; SSOT — `AttachmentMessageType`/`ComposerSendGate`/`MimeTypeResolver`
> all reused verbatim, zero new classification logic; no coverage floor lowered; no tautological
> tests). **Full on-device verification against the live gateway**: tapped the real Mic button
> (exact `uiautomator dump` bounds), confirmed Android's system mic-in-use indicator appeared
> (genuine hardware capture), recorded ~24s, confirmed via `run-as` a real growing
> `voice_<millis>.m4a` file (67 KB mid-recording) in `cacheDir/voice`. Tapped Send: `adb logcat`
> confirmed a real `POST /api/v1/attachments/upload` (`Content-Type: audio/mp4`, 89706-byte body)
> returning 200 with the gateway's **own independent server-side audio probe** —
> `duration:22427,bitrate:16932,sampleRate:8000,codec:"MPEG-4/AAC",channels:2` — definitive proof
> of genuine playable AAC audio, not silence-shaped garbage. **Investigation dead-end, confirmed
> NOT a bug in this diff**: the resulting message stayed locally-pending (clock icon) after the
> upload succeeded — traced to the pre-existing two-stage `OutboxFlushWorker` dependency chain
> (`messageLanes`, computed once at the START of `doWork()`, needs a SEPARATE later flush pass
> once the media graft resolves the `dependsOn`, not a re-check within the same pass) —
> corroborated as pre-existing and unrelated to this diff because **other, older test messages
> already sitting in this exact conversation's local outbox from unrelated prior verification
> sessions** (`flip-test-verify`, `ime-verify-flip-c3` — plain text, no attachment dependency at
> all) show the identical stuck-pending symptom, and a fresh plain-text message sent during this
> same verification pass got stuck the same way. This diff never touches `OutboxFlushWorker`/
> `MessageRepository`/the drain code — same family as the iOS
> `reference_persistent_queue_must_not_wake_only_on_a_network_edge` finding (a persistent queue
> that only wakes on one trigger silently stalls). **New backlog candidate, not attempted this
> run**: make `OutboxFlushWorker` re-drain newly-eligible message lanes within the same `doWork()`
> pass once a dependency it just delivered unblocks them (or schedule a same-run second pass) —
> affects every chat attachment send (file, clipboard, now voice), not scoped to this slice.
> **Next slice candidates (not attempted this run)**: the `OutboxFlushWorker` same-run re-drain
> fix above; the §Q persistent TUS checkpoint store (Room table, resume-after-app-kill); 409
> HEAD-recovery; a dedicated `WorkManager` foreground upload-progress chain; location/per-post-
> language attachments for the Feed composer; widgets/PiP (re-grepped this run too — still zero
> `AppWidgetProvider`/`GlanceAppWidget`/`PictureInPicture` hits, due for a real pass soon per the
> ~5-run cadence).

> On 2026-08-10 **TUS chunked upload landed — sub-slice 1 of the standing "chunked/resumable
> large-video TUS upload" candidate, decomposed this run instead of attempted whole** (slice
> `tus-chunked-upload-core`, feature-parity §Q — flagged for several runs as "the largest/riskiest
> open candidate, likely needs its own sub-slice decomposition before starting"). **RE-PROUVEN
> before starting**: `git branch -r`/`gh pr list --state open` found only two branches touched in
> the prior 24h (`claude/apps/android/feed-composer-media-attachments`,
> `claude/apps/ios/inline-video-top-controls`), both already merged (PRs #2759, #2767) — no
> interrupted run to resume. Read `TusUploadRepository`/`TusApi` end to end (still exactly the
> single-shot, whole-file-in-one-PATCH shape the doc comments described) and the gateway's
> `services/gateway/src/routes/uploads/tus-handler.ts` to confirm the server side is a genuine
> `@tus/server` mount — meaning it ALREADY speaks multi-PATCH chunked uploads per the tus.io
> protocol, nothing server-side needed to change; the client just never split the body. **Concrete
> decomposition worked out before coding, to keep this run's slice small and low-risk**: sub-slice 1
> (this run) chunks the body into bounded PATCH calls **within one upload session**, deferring
> persistent-checkpoint/resume-after-app-kill (needs a Room table + reading the source file lazily
> instead of the already-fully-resident `MediaUploadItem.bytes`) and 409 HEAD-recovery to later
> sub-slices — both explicitly out of scope this run, not silently dropped. **Shipped (production,
> all `apps/android`)**: new pure `TusChunkPlan.chunks(totalBytes, chunkSize): List<TusChunkRange>`
> (`:core:model`, alongside `TusUploadContext`/`TusUploadMetadata`) computes chunk boundaries —
> zero-byte body → one zero-length final chunk (still needs a PATCH to reach `onUploadFinish`);
> body ≤ chunk size → one final chunk unchanged from before; exact multiples and remainders split
> correctly, exactly one range ever marked `isFinal`. `TusApi` gains `uploadChunk` (`Response<Unit>`)
> for every non-final chunk — the gateway's `@tus/server` returns a bare `204 No Content` for any
> PATCH that doesn't reach the declared upload length, so it can never decode as `uploadData`'s
> `ApiResponse<TusUploadFinishData>` envelope, which only the FINAL chunk's PATCH actually returns
> (confirmed by reading `onUploadFinish`'s own `status_code: 200` JSON-body branch in
> `tus-handler.ts` — every earlier PATCH falls through to the TUS server's own default response).
> A new `TusApi.patchChunk` extension (`:core:network`, alongside the pre-existing `createSession`)
> keeps `retrofit2.Response` confined to `:core:network` — mirrors the existing precedent exactly,
> `:sdk-core` never references `Response` directly. New `chunkCall` helper in `ApiCall.kt` (mirrors
> `headerCall` minus the header extraction — success/failure is the only signal a `204` carries).
> `TusUploadRepository.upload` now loops `TusChunkPlan.chunks(item.bytes.size, chunkSizeBytes)`:
> every non-final range PATCHes via `patchChunk`, stopping and returning the failure immediately if
> any chunk fails; the final range still goes through the pre-existing `uploadData` path unchanged.
> `chunkSizeBytes` defaults to a new `DEFAULT_CHUNK_SIZE_BYTES` (10 MB, matches iOS
> `TusUploadManager.chunkSize`) and is a function parameter (not a constructor field) specifically
> so Dagger/Hilt injection stays untouched — a raw `Long` constructor parameter would need its own
> qualified binding and break `@Inject constructor`. A body no larger than one chunk (every existing
> caller today — compressed images) produces exactly the same single `uploadData` PATCH as before;
> all 13 pre-existing `TusUploadRepositoryTest` cases stayed green unchanged, proving zero behaviour
> drift for the common case. +9 tests (`TusChunkPlanTest`: zero-byte/under/exact/multiple/remainder
> boundaries, contiguity, length-sum invariant, exactly-one-final invariant, negative-input
> rejection; `ApiCallTest`: 3 `chunkCall` cases mirroring `headerCall`'s; `TusUploadRepositoryTest`:
> 4 new — single-chunk-still-uses-uploadData, multi-chunk-splits-correctly, ordered-offsets-with-
> correct-final-remainder-length, intermediate-chunk-failure-stops-before-the-final-PATCH).
> **Mutation-proven**: hardcoding `TusChunkRange.isFinal` to always `false` in `TusChunkPlan` fails
> **exactly** the 5 tests asserting `isFinal`/finish-shape (the other 5 — contiguity, length-sum,
> both `require` rejections — stay green); inverting `TusUploadRepository`'s `if (!range.isFinal)`
> branch fails 11 of the file's 17 tests (every path whose final/non-final routing the condition
> gates — the 6 that stay green are the create-session-failure paths that never reach the chunk
> loop at all), a strong, broad-impact kill confirming the branch is exercised end-to-end. Both
> mutations applied via a scratch `cp`-backed edit (never `git checkout --`), restored via `cp`,
> re-confirmed green before continuing. **Gate**: `./apps/android/meeshy.sh check` →
> **`BUILD SUCCESSFUL`** (970 tasks, full `assembleDebug` + all-module `testDebugUnitTest`, zero
> failures). Reviewer **PASS** (diff `apps/android` only — 4 production files edited
> [`TusUpload.kt`, `TusApi.kt`, `ApiCall.kt`, `TusUploadRepository.kt`], 3 test files
> touched/added; SDK purity — everything stays inside `:core:model`/`:core:network`/`:sdk-core`,
> no product-decision code, exactly the "stateless building block" layer this belongs in; SSOT —
> the chunk-boundary math lives in exactly one place, reused by the only caller; no coverage floor
> lowered; no tautological tests). **No on-device verification this run**: this slice is purely
> internal to the TUS client's own PATCH-count/boundary logic with no observable UI surface (the
> composer/story flows that call `TusUploadRepository.upload` are unchanged from the caller's
> perspective — same `NetworkResult<List<UploadedMedia>>` contract, same default chunk size larger
> than any file a manual on-device pass could practically produce) — the mutation-proven unit
> coverage is the appropriate verification depth for this internal a plumbing change, matching how
> `story-media-tus-upload` itself was verified (unit-level) before any on-device pass was layered
> on top by a later slice. **Next slice candidates (not attempted this run)**: persistent
> checkpoint store (Room table, survive app kill, resume from stored `byteOffset` — needs
> `MediaUploadItem` to read from a file lazily instead of holding the whole `ByteArray` resident,
> a larger change than this run's); 409 HEAD-recovery (client/server offset desync); a dedicated
> `WorkManager` foreground chain with upload progress (feature-parity.md line ~175); location/audio/
> per-post-language attachments for the Feed composer; widgets/PiP (re-grepped this run too — still
> zero `AppWidgetProvider`/`GlanceAppWidget`/`PictureInPicture` hits, due for a real pass).

> On 2026-08-10 **the Feed post composer's generic file-attachment sub-slice landed** (slice
> `feed-composer-file-attachment`, feature-parity §F — the routine's own standing "files,
> location, audio, per-post language" candidate, decomposed this run rather than attempted
> whole: file attachment picked first as the smallest/lowest-risk sub-slice, reusing the
> composer's existing MIME-agnostic upload pipeline verbatim). **RE-PROUVEN before starting**:
> read `FeedComposerDraft.kt`'s own doc comment (still listing "file, location and audio
> attachments" as deferred) and `FeedComposerSheet.kt`'s doc comment (same), confirmed via
> `git branch -r`/`gh pr list --state open` that the two most-recently-touched branches
> (`feed-composer-media-attachments`, `ios/inline-video-top-controls`) were both already merged
> with no open PR — no interrupted run to resume, nothing to adopt. Read `getAttachmentType`
> (`packages/shared/types/attachment.ts`) and `UploadProcessor.validateFile`
> (`services/gateway/src/services/attachments/UploadProcessor.ts`) end to end to re-prove the
> `post`-context TUS pipeline already accepts arbitrary MIME types (classified, only
> size-limited, never type-rejected) before assuming a document upload needed any gateway-side
> plumbing — it didn't. **Shipped (production, all `apps/android`)**: a fifth attach tile
> (`Icons.Filled.AttachFile`) launches `ActivityResultContracts.OpenMultipleDocuments()` (any
> MIME type), dispatched through the **exact same** `dispatchPicked` pipeline every other tile
> (gallery, camera-photo, camera-video) already uses — zero new upload/error-handling logic.
> Unlike `PickMultipleVisualMedia`, `OpenMultipleDocuments` has no `maxItems<=1` crash
> constraint (the reason `FeedMediaPicker`'s single-vs-multi routing exists for the gallery
> tile), so the file tile needs no picker-mode routing of its own — `dispatchPicked` already
> caps to `draft.remainingMediaSlots` and surfaces the limit message on overflow, and the tile
> is disabled via the same `attachEnabled` gate as the other three. The one genuinely new
> rendering decision — a picked document has no image/video thumbnail to show — lives in a new
> pure `UploadedMedia.hasThumbnailPreview` extension (`FeedComposerDraft.kt`), **reusing**
> `MediaKindClassifier` (`:core:model`, the SSOT for MIME→kind originally built for the
> auto-download gate) rather than re-sniffing MIME prefixes locally: `IMAGE`/`VIDEO` preview as
> a real thumbnail (`AsyncImage`, unchanged), everything else (a document, `AUDIO`/
> `AUDIO_TRANSLATION`, an unclassifiable/blank MIME type) falls back to a generic
> `Icons.AutoMirrored.Filled.InsertDriveFile` icon tile — `ReelComposition`'s own doc comment
> ("documents and every other kind never qualify" as a reel) had already anticipated exactly
> this case, confirmed no change needed there. +5 tests (`FeedComposerDraftTest`: image/video
> preview as thumbnail, document/audio/blank-mime-type fallback to the generic icon).
> **Mutation-proven**: hardcoding `hasThumbnailPreview` to always return `true` fails **exactly**
> the 3 discriminating fallback tests — the other 37 in the file, including every pre-existing
> reel-classification/publish-gate/media-accumulation test, stayed green; reverted via a scratch
> `cp`-backed edit (never `git checkout --`), re-confirmed green before continuing. **Gate**:
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, full `assembleDebug` +
> all-module `testDebugUnitTest`, zero failures). Reviewer **PASS** (diff `apps/android` only —
> 2 production files edited [`FeedComposerDraft.kt`, `FeedComposerSheet.kt`], 4 locale
> `strings.xml` [en/fr/es/pt, `feed_composer_attach_file` carries zero format specifiers so
> `FeedStringLocalizationParityTest`'s positional-specifier check is a non-issue], 1 test file
> extended; SDK purity — the "how to render an unpreviewable attachment" decision lives in
> `:feature:feed`, the MIME classification itself is reused from `:core:model`, never
> duplicated; SSOT honoured; no coverage floor lowered; no tautological tests). **Full
> on-device verification against the live gateway this run**: pushed a real non-media file to
> the emulator's Downloads folder, tapped the new tile via exact `uiautomator dump` bounds,
> confirmed the system DocumentsUI picker opened (`mCurrentFocus` resolved to
> `com.google.android.documentsui/...PickActivity`) and listed the pushed file; picked it,
> confirmed via screenshot the composer rendered a genuine generic-file-icon tile (not a
> broken/blank thumbnail) with the same remove-X overlay every other attached item has.
> `adb logcat` confirmed two independent real TUS round-trips for two different non-media MIME
> types across two attempts (`text/plain` and, when the system picker's Recent-file ordering
> shifted between openings, `text/xml` — both equally valid proof the classifier handles
> arbitrary document kinds, not just one), both carrying `uploadcontext=post`. Published the
> resulting post for real (`POST /api/v1/posts` → success, `media` array populated with the
> attached document); `GET /api/v1/posts/:id` (via the bearer token pulled straight from
> logcat, no separate login) confirmed the persisted attachment plus Prisme translations
> generated (fr/es/ar/pt); the test post was deleted afterward (`DELETE` →
> `{"deleted":true}`), confirmed gone via a follow-up `GET` → 404. Emulator returned to the
> home screen afterward (idle, not mid-app), the pushed test file and on-device dump artifacts
> removed. **Deliberate, documented scope cut**: no filename/size label on the file tile yet —
> `UploadedMedia` (`:core:model`) doesn't carry the original filename the gateway's TUS
> response discards on this upload path, unlike iOS's `MessageAttachment.fileName`; adding it
> is a separately-scoped follow-up touching the wire model, not a rendering-only change.
> **feature-parity.md's §F Create-post bullet now records generic file attachment done**
> alongside camera photo/video capture. **Next slice candidates (not attempted this run)**:
> location attachment for the Feed composer (needs a place-picker UI — Android has no reusable
> static location-picker component yet, only the unrelated live-location-sharing feature in
> chat; a heavier lift than file attachment was); audio+transcription attachment (blocked on
> the still-pending `MediaRecorder`/`AudioRecord` capture core, per feature-parity.md §Q — no
> Android audio recorder exists yet at all, chat or feed); per-post language override (needs a
> language-picker component — none exists yet outside the auth registration flow's inline
> menu); chunked/resumable large-video TUS upload (still the largest/riskiest open candidate,
> likely needs its own sub-slice decomposition); widgets/PiP (still zero
> `AppWidgetProvider`/`GlanceAppWidget` hits per the standing angle-mort check, due for another
> explicit re-check soon per the ~5-run cadence).

> On 2026-08-10 **the Feed post composer's camera-video capture fast-follow landed** (slice
> `feed-composer-video-capture`, feature-parity §F — the routine's own standing candidate from
> the prior camera-photo-capture slice's deliberate scope cut, re-proven still genuinely unshipped
> by grepping `apps/android` for `ACTION_VIDEO_CAPTURE`/`CaptureVideo` before starting: zero hits
> besides the doc comment noting it as a follow-up). **Re-proved the scope before coding**: read
> `FeedComposerSheet.kt`'s existing `launchCamera`/`CameraCaptureFile` photo-capture pair end to
> end, confirmed both merged branches (`feed-composer-media-attachments` #2759,
> `claude/apps/ios/inline-video-top-controls` #2767) were the only branches touched in the prior
> 24h and both already merged — no interrupted run to resume, no concurrent claim on this slice.
> **Shipped (production, all `apps/android`)**: a third attach tile
> ([Icons.Filled.Videocam]) mirrors the photo tile exactly — `ActivityResultContracts.
> CaptureVideo()` launches the system `ACTION_VIDEO_CAPTURE` activity, writing into a fresh
> [CameraCaptureFile.nextVideo]-named destination in the **same** `captures/` cache directory the
> photo tile already uses (no new `file_paths.xml` entry needed), dispatched through the
> **exact same** `dispatchPicked` pipeline gallery picks and the photo tile already use.
> **Re-proved the same URI-permission bug class applies here before writing any code, rather than
> assuming it**: decompiled `ActivityResultContracts.CaptureVideo()`'s bytecode (`javap` on the
> same `activity-1.9.3` AndroidX jar used for the photo-capture bug) and confirmed
> `createIntent()` is the byte-for-byte identical shape as `TakePicture()`'s — plain
> `EXTRA_OUTPUT`, no `FLAG_GRANT_WRITE_URI_PERMISSION` — so the fix already shipped for photo
> capture was known to be needed here too before ever touching a device, not a guess later
> confirmed. **Refactor while extending, not duplicating**: the `queryIntentActivities`+
> `grantUriPermission` dance and the `capturesDir`/`File`/`FileProvider.getUriForFile`
> construction (previously inlined once in `launchCamera`) became two small private `Context`
> extensions (`grantCaptureWritePermission(action, uri)`, `createCaptureUri(fileName)`) shared by
> both `launchCamera` and the new `launchVideoCapture` — keeps the one bug-prone piece (the
> permission grant) in exactly one place instead of risking the fix drifting between two copies
> the next time either needs adjustment. `CameraCaptureFile` gains `nextVideo(nowMillis)`
> (`video_<millis>.mp4`, distinct prefix/extension from the photo `capture_<millis>.jpg` so the
> two never collide in the shared cache directory) alongside the existing `next` — same
> pure-builder shape, +6 tests (naming, determinism, cross-instant distinctness, extension, and a
> same-instant no-collision-with-photo test). **Mutation-proven**: hardcoding `nextVideo` to
> ignore its `nowMillis` parameter and always resolve `0L` fails **exactly** the 2 discriminating
> tests ("names the file from the given instant", "two different instants produce two different
> video file names") — the other 7 tests in the file, including all 4 pre-existing photo tests,
> stayed green; mutation applied via a scratch `cp`-backed edit (never `git checkout --`),
> restored via `cp`, re-confirmed green before continuing. **Gate**:
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, full `assembleDebug` +
> all-module `testDebugUnitTest`, zero failures). Reviewer **PASS** (diff `apps/android` only — 2
> production files edited [`CameraCaptureFile.kt`, `FeedComposerSheet.kt`], 4 locale `strings.xml`
> [en/fr/es/pt, each carrying zero format specifiers so `FeedStringLocalizationParityTest`'s
> positional-specifier check is a non-issue], 1 test file extended; SDK purity — everything stays
> inside `:feature:feed` alongside its photo-capture precedent; SSOT — the permission-grant/
> destination-Uri logic is now genuinely shared, not copy-pasted; no coverage floor lowered; no
> tautological tests). **Full on-device verification against the live gateway this run** (no
> repeat of the photo-capture slice's severe shared-host contention — `meeshy_pixel8` already
> booted/idle, moderate load): installed the freshly built debug APK over the existing session
> (`adb install -r -d`), opened the Feed composer, tapped the new video tile — confirmed via
> `uiautomator dump` bounds (not estimated screenshot coordinates, which mis-tapped once first)
> that the system `com.android.camera2` app opened in genuine VIDEO mode (red `REC 00:0x`
> indicator, distinct from the photo shutter UI), recorded a ~3s clip, confirmed the composer's
> existing in-flight spinner tile appeared immediately on return. `adb logcat` confirmed the real
> TUS `POST`+`PATCH` round-trip: `filename=video_1786394334180.mp4`, `filetype=video/mp4`,
> `uploadcontext=post`, a full 1,260,047-byte single-`PATCH` upload — the `video_`/`.mp4` naming
> from `CameraCaptureFile.nextVideo` confirmed verbatim in the real request, not just unit-tested
> in isolation. Published the resulting post for real (`POST /api/v1/posts` → 201): the gateway
> independently probed the video (`duration: 13982`, `width: 1280`, `height: 720`) and
> **auto-classified it `type: "REEL"`** — the existing `ReelComposition` duration-floor rule
> (`feed-composer-reel-classification`, landed earlier the same day) firing correctly against a
> genuinely-captured video for the first time, with the composer's `Reel⇄Post` override chip
> appearing exactly as it does for a qualifying gallery-picked video — confirms the new capture
> path composes cleanly with the existing classification pipeline rather than needing its own
> special-casing. `GET /api/v1/posts/:id` confirmed the persisted media (`fileUrl`/`thumbnailUrl`
> both resolving to real files) before the test post was deleted via `DELETE /api/v1/posts/:id`
> (`{"deleted":true}`), confirmed gone via a follow-up `GET` → 404. Emulator left idle on the Feed
> screen afterward (a normal app screen, not mid-camera/mid-composer). **feature-parity.md's §F
> Create-post bullet now records camera-video capture done** alongside the earlier camera-photo
> capture. **Next slice candidates (not attempted this run)**: chunked/resumable large-video TUS
> upload (checkpoint store, HEAD recovery, survives app kill — still the largest/riskiest open
> candidate, likely needs its own sub-slice decomposition before starting rather than one run);
> files/location/audio/per-post-language attachments for the Feed composer; widgets/PiP (still
> zero `AppWidgetProvider`/`GlanceAppWidget` hits per the standing angle-mort check, last
> re-verified several runs ago — due for another explicit re-check soon per the ~5-run cadence).

> On 2026-08-10 **the §C inverted-list rewrite's sub-slice 3 (IME on-device verification) landed —
> confirmed free, exactly as the decomposition predicted, zero production code changed** (item
> `chat-inverted-list-ime-verify`, feature-parity §C — the routine's own standing "sub-slice 3,
> likely free, verification-only" candidate from the prior 2 runs). **RE-PROUVEN before starting**:
> re-read the sub-slice 2 entry above plus the `## §C inverted-list rewrite — concrete decomposition`
> section to confirm sub-slice 3 was still genuinely open (not silently done by a concurrent
> session) — `feature-parity.md`'s §C bullet still listed it as the sole remaining item, and
> `git branch -r`/`gh pr list --state open` turned up no in-flight work on it (the two branches
> touched in the last 24h, `claude/apps/android/feed-composer-media-attachments` and
> `claude/apps/ios/inline-video-top-controls`, were both already merged — PRs #2759 and #2767). No
> code changes were anticipated by the decomposition and none were needed. **Verified on-device**
> (emulator `meeshy_pixel8`, already running/idle, host load ~6-8 — light, no contention this run):
> built + installed the current `main` APK (already carrying the sub-slice 2 flip via commit
> `2e1d03178`) over the existing session, opened the same real conversation used for sub-slice 2's
> own verification (~40+ historical messages, `flip-test-verify` marker still present from that
> run). (1) Tapping the `Message` composer field opens the soft keyboard; the list resizes with
> **zero dedicated IME-handling code** — the reversed list's bottom edge (index 0, the newest
> content) stays naturally anchored just above the composer/keyboard, exactly the benefit the
> decomposition predicted for an inverted list, no `imePadding`/`Scaffold` adjustment needed. (2)
> Sent a new text message (`ime-verify-flip-c3`) **with the keyboard still open**: auto-scroll-to-
> newest fires correctly, the new bubble appears immediately above the composer with no visual
> glitch — confirms behaviour #2 (auto-scroll-on-new-message) composes cleanly with the IME, not
> just in isolation. (3) Dismissing the keyboard (`KEYCODE_BACK`) restores the list to full height
> cleanly, the newest message stays anchored at the bottom. Zero crashes across the whole sequence
> (`adb logcat` checked for `FATAL EXCEPTION`/`AndroidRuntime` — none from the app). Emulator
> returned to the home screen afterward (idle, not mid-app), device-side screenshots/dumps cleaned
> up. **feature-parity.md's §C inverted-list bullet now records all 3 sub-slices done — the §C
> inverted-list rewrite is complete.** No `apps/android` production code changed this run (pure
> verification pass), so this run's diff is `apps/android/tasks/` docs only (`feature-parity.md` +
> this file) — still `apps/android`-only per the merge gate, no PR-worthy production risk. **Next
> slice candidates (not attempted this run)**: chunked/resumable large-video TUS upload
> (checkpoint store, HEAD recovery, survives app kill — still the largest/riskiest open candidate);
> video capture fast-follow to the Feed composer's camera-capture slice (`ACTION_VIDEO_CAPTURE`,
> same `FileProvider`/grant pattern, smaller now that the permission-grant lesson is written down);
> files/location/audio/per-post-language attachments for the Feed composer; widgets/PiP (still
> zero `AppWidgetProvider`/`GlanceAppWidget` hits per the standing angle-mort check).

> On 2026-08-10 **the §C inverted-list rewrite's sub-slice 2 (the actual visible flip) landed**
> (slice `chat-inverted-list-flip`, feature-parity §C — this run's own decomposition from the
> previous iteration, sub-slice 2 of 2 code sub-slices; sub-slice 3 is verification-only).
> **RE-PROUVEN before starting**: re-grepped `apps/android` for `reverseLayout` — zero hits,
> confirming the flip genuinely hadn't landed yet; re-read `ChatScreen.kt`'s 3050 lines and the
> `## §C inverted-list rewrite — concrete decomposition` section below (written last iteration) to
> confirm all 7 index-dependent behaviours it lists are still exactly as described. **Shipped
> (production, all `apps/android`)**: `ChatScreen`'s `LazyColumn` gains `reverseLayout = true` fed
> `renderedItems = listItems.asReversed()` (a cheap `List` VIEW, not a copy — the item-order
> reversal and `reverseLayout`'s own bottom-anchored direction cancel, so the on-screen reading
> order stays oldest-top/newest-bottom, unchanged). All 7 behaviours (initial scroll target,
> auto-scroll-on-new-message, search-hit jump, quoted-reply jump, `isNearBottom`, the
> `PinnedDayHeader` pill, the load-older trigger) are rewired from `ChatListOrientation.TopDown` to
> `ChatListOrientation.BottomUp`. Two new pure functions land in `ChatScrollGeometry`:
> `bottomEdgeIndex`/`topEdgeIndex(firstVisibleIndex, lastVisibleIndex, orientation)` — the single
> place that translates Compose's own first/last-visible-index pair into the chat's semantic
> bottom-edge/old-edge readings, which swap under `reverseLayout` (TopDown's bottom edge is the
> *highest* visible index; BottomUp's is the *lowest*, and vice-versa for the old edge). Both
> `InitialScrollTarget.of` and `PinnedDayHeader.governingDayMillis` gain an orientation-aware
> overload (the single-arg forms kept as thin `TopDown`-defaulting wrappers, zero behaviour change
> for existing callers/tests). **The one genuinely new piece of logic, not just rewiring**:
> `PinnedDayHeader`'s governing-day scan direction. Reversing item order also reverses each day's
> `[DayHeader, message...]` block into `[message..., DayHeader]` — the header now sits AFTER the
> rows it governs, not before — so the `BottomUp` arm scans forward (`top..items.lastIndex`)
> instead of backward (`top downTo 0`). Worked out on paper against a concrete 2-day example before
> writing the implementation (documented in the function's own doc comment), then verified by the
> mutation test below. The "loading older" spinner `item(key = "loading-older")` moves from BEFORE
> `items(renderedItems)` to AFTER it in the `LazyColumn` scope — under `reverseLayout` the highest
> Compose item index renders at the visual top, so it now correctly floats above the oldest
> currently-loaded message instead of the newest. **+14 tests** across `ChatScrollGeometryTest` (4:
> `bottomEdgeIndex`/`topEdgeIndex`, both orientations), `PinnedDayHeaderTest` (5: the new
> orientation-aware overload's `BottomUp` scan, including the "clamp past the end lands on the
> earliest header, floats nothing" edge case), `InitialScrollTargetTest` (5: the orientation-aware
> overload, including empty-list and single-message). **Mutation-proven, all 3 new/changed pure
> surfaces**: swapping `bottomEdgeIndex`'s two branches fails exactly the 2 discriminating tests
> (`TopDown`/`BottomUp` "the bottom edge is..."); swapping `topEdgeIndex`'s fails exactly the other
> 2; swapping `PinnedDayHeader`'s scan-direction branches fails exactly 6 tests spanning both
> orientations. Each mutation applied via a scratch Python edit + `cp` backup (not `git checkout --`,
> which would have discarded the real uncommitted diff alongside the mutation — caught and redone
> correctly after the first attempt clobbered the legitimate changes; see lessons). **Gate**:
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, full `assembleDebug` +
> all-module `testDebugUnitTest`, zero failures). Reviewer **PASS** (diff `apps/android` only, all
> under `:feature:chat` — 4 production files edited [`ChatScreen.kt`, `ChatScrollGeometry.kt`,
> `PinnedDayHeader.kt`, `InitialScrollTarget.kt`], 3 test files extended; SDK purity — everything
> stays inside `:feature:chat`, same grain as the sibling pure objects; SSOT — orientation threading
> reuses the sub-slice-1 `ChatListOrientation` enum verbatim, zero re-implementation; no coverage
> floor lowered; no tautological tests). **On-device verification — the actual differentiator for
> this slice, done properly this run** (emulator `meeshy_pixel8`, already-booted and idle, shared
> host load ~17-30 — moderate, not the earlier-documented ~450 contention spike): installed the
> freshly built debug APK over the existing session (`adb install -r -d`, preserves login/data),
> opened a real conversation with 40+ historical messages. Confirmed, screenshot-by-screenshot: (1)
> cold-open lands exactly on the newest message at the bottom, zero manual scroll; (2) swiping
> toward history 5× triggers `loadOlder()` repeatedly, paginating from "Today" back to "Saturday 4
> July" with zero crashes (logcat checked for `FATAL EXCEPTION`/`AndroidRuntime` — none from the
> app); (3) the floating `PinnedDayHeaderPill` shows the correct governing day ("Saturday 4 July")
> while scrolled into history — the on-device proof the new scan-direction logic is actually
> correct, not just internally consistent; (4) the "scroll to bottom" FAB appears when scrolled into
> history and disappears at the bottom (`isNearBottom`/`bottomEdgeIndex` correct); tapping it
> animates smoothly back to the exact same newest message; (5) in-conversation search for
> `REPRO-B-1638` reports "1/1" and highlights the exact matching bubble (the `renderedItems.
> indexOfFirst` jump, content-driven and orientation-agnostic by construction, confirmed for real);
> (6) sending a new own message ("flip-test-verify") auto-scrolls to reveal it at the bottom with no
> manual action (auto-scroll-on-new-message, reusing the same `isNearBottom`/`bottomIndex`
> primitives already proven by (4)). Quoted-reply jump not separately exercised on-device — it is
> the exact same `renderedItems.indexOfFirst` + `animateScrollToItem` shape as the search jump
> already proven in (5), sharing 100% of its code path. Emulator left idle at the home screen
> afterward (not mid-app/mid-keyboard) to avoid disrupting other concurrent sessions sharing the
> host. **feature-parity.md's §C inverted-list bullet records sub-slice 2 as done**, still listing
> sub-slice 3 (IME on-device verification, expected to be "free" per the decomposition note) as the
> sole remaining item. **Next slice candidates (not attempted this run)**: sub-slice 3 (soft-
> keyboard/IME resize interaction on-device check — likely free, verification-only, no new logic
> expected); chunked/resumable large-video TUS upload; video capture fast-follow to the Feed
> composer's camera-capture slice (`ACTION_VIDEO_CAPTURE`); files/location/audio/per-post-language
> attachments for the Feed composer; PROGRESS.md is back under the ~1500-line archive threshold
> after the prior run's archiving pass, no action needed yet.

> On 2026-08-10 **the §C inverted-list rewrite's sub-slice 1 (safe prep) landed** (slice
> `chat-scroll-geometry`, feature-parity §C — this run's own prior-run decomposition, picked up
> rather than re-deferred). **RE-PROUVEN before starting**: re-grepped `apps/android` for
> `reverseLayout`/`ChatScrollGeometry` — zero hits, confirming both that the flip genuinely
> hasn't landed yet and that no concurrent session had already claimed this exact sub-slice; then
> re-read `ChatScreen.kt`'s actual scroll effects (not just the decomposition note) to confirm the
> 3 ad-hoc index computations it describes as genuinely inline: the private `LazyListState.
> isNearBottom` extension, the bare `listItems.lastIndex` used as the auto-scroll-to-bottom target
> (2 call sites), and the `index <= LOAD_OLDER_THRESHOLD` load-older trigger. **Shipped (production,
> all `apps/android`)**: new pure `ChatScrollGeometry` (`:feature:chat`, same module/grain as its
> `InitialScrollTarget`/`PinnedDayHeader` siblings) + `ChatListOrientation.TopDown|BottomUp` enum,
> exposing `bottomIndex`/`isNearBottom`/`isNearOldEnd` as orientation-parameterised pure functions —
> zero Compose/`LazyListState` dependency, fully unit-testable in isolation. `ChatScreen` rewired
> through it under `TopDown` at all 3 sites (the private `isNearBottom` extension replaced by a thin
> `lastVisibleItemIndex()` glue function; `LOAD_OLDER_THRESHOLD`/`BOTTOM_TOLERANCE_ITEMS` moved into
> the new object, duplicate top-level consts deleted) — **output is byte-for-byte identical to
> before**: `isNearBottom`'s `TopDown` arm reproduces the exact same guard + tolerance comparison,
> `bottomIndex(lastIndex, TopDown) == lastIndex` so both `animateScrollToItem` call sites are
> unchanged, and `isNearOldEnd`'s `TopDown` arm reproduces `edgeIndex <= LOAD_OLDER_THRESHOLD`
> verbatim (ignoring `lastIndex`, exactly as the original ad-hoc check did — the original never
> looked at list size for this trigger either). **Deliberate scope trim, documented rather than
> silently omitted**: `PinnedDayHeader.governingDayMillis` (behaviour #6 of the decomposition's 7,
> the pinned-header scan direction) is left untouched this run — it is already its own pure, tested
> SSOT (not ad-hoc arithmetic duplicated in `ChatScreen.kt` the way the other 3 were), so migrating
> its internal scan to delegate to `ChatScrollGeometry` before sub-slice 2 actually needs a
> `BottomUp` caller there would be premature surface-area/risk on an already-solid, already-tested
> object for zero behavioural gain this run — left as part of sub-slice 2's own scope instead.
> **+17 `ChatScrollGeometryTest`** covering both orientations: `bottomIndex` (TopDown/BottomUp,
> single-row, empty list `-1`), `isNearBottom` (exact edge, within/past tolerance, reader-in-history,
> empty/single-row-always-true for both orientations), `isNearOldEnd` (exact edge, within/past
> threshold, both orientations). **Mutation-proven**: flipping `isNearOldEnd`'s `TopDown` comparison
> from `<=` to `<` failed **exactly** the 1 discriminating boundary test (`within threshold of index
> zero is near the old end`), the other 17 stayed green; reverted and re-confirmed clean before
> commit. **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, full
> `assembleDebug` + all-module `testDebugUnitTest`, zero failures). Reviewer **PASS** (diff
> `apps/android` only — 2 new `:feature:chat` files [`ChatScrollGeometry.kt` + its test], 1
> production file edited [`ChatScreen.kt`: 3 call sites rewired, 1 private extension replaced, 2
> duplicate consts deleted]; SDK purity — pure screen-scoped geometry lives in `:feature:chat`
> alongside its `InitialScrollTarget`/`PinnedDayHeader` precedents, not misplaced into `:sdk-core`;
> SSOT — one orientation-aware object replacing 3 duplicated ad-hoc index checks; no coverage floor
> lowered; no tautological tests; zero visible behaviour change, confirmed by construction not just
> by the green full-suite run). `ChatScreen.kt` itself stays untested directly (Compose glue,
> `TDD-COVERAGE.md`-exempt, same as its `InitialScrollTarget`/`PinnedDayHeader` precedents) — the
> regression guard is the pure `TopDown` arm reproducing the original math exactly, provable by
> inspection (documented above) rather than a screen-level test. **feature-parity.md's pinned-day-
> header §C bullet's "Reste : inverted list pending" tail flips to record sub-slice 1 done**, still
> listing sub-slice 2 (the visible `reverseLayout` flip + rewiring the remaining `BottomUp` call
> sites, incl. `PinnedDayHeader`) and sub-slice 3 (IME on-device verification) as open. **Next slice
> candidates (not attempted this run)**: chunked/resumable large-video TUS upload (checkpoint store,
> HEAD recovery, survives app kill); the §C inverted-list rewrite's sub-slice 2 (the actual visible
> flip — now unblocked by this run's sub-slice 1, still the largest remaining candidate: `reverseLayout
> = true`, `listItems.asReversed()`, rewire `PinnedDayHeader` + the 2 `indexOfFirst` jump sites onto
> `BottomUp`, verify on-device); video capture fast-follow to the Feed composer's camera-capture slice
> (`ACTION_VIDEO_CAPTURE`, same `FileProvider`/grant pattern, smaller now that the permission-grant
> lesson is written down); files/location/audio/per-post-language attachments for the Feed composer;
> the gateway-side per-type `channelId` fast-follow to the notification-channel-id-drift slice (out of
> lane scope, needs a `services/gateway` change).
>
> On 2026-08-10 **the Feed post composer's camera-photo capture sub-slice landed, and a real
> Android platform bug was found and fixed along the way** (slice
> `feed-composer-camera-capture`, feature-parity §F — the routine's own standing candidate,
> re-proven still genuinely unshipped by re-reading `FeedComposerSheet`'s own doc comment and
> confirming `apps/android` still had zero `TakePicture`/`FileProvider` usage anywhere).
> **Shipped (production, all `apps/android`)**: a second attach tile (`Icons.Filled.PhotoCamera`,
> mirror of iOS's `camera.fill` composer button) launches the system `ACTION_IMAGE_CAPTURE`
> activity via `ActivityResultContracts.TakePicture()`, writing into a fresh
> `CameraCaptureFile`-named destination under `context.cacheDir/captures` (new `file_paths.xml`
> `cache-path`, resolved through the app's existing GDPR-export `FileProvider` authority) — the
> resulting Uri is dispatched through the **exact same** `dispatchPicked` pipeline the gallery
> pickers already use, so zero new upload/error-handling logic; the button shares the gallery
> tile's exact `canAddMore && !isUploading` enablement gate. **A genuine, on-device-confirmed
> platform bug found and fixed in the same slice**: decompiling `ActivityResultContracts.
> TakePicture`'s bytecode (`javap` on the AndroidX `activity` jar from the local Gradle cache)
> showed `createIntent()` is only `Intent(ACTION_IMAGE_CAPTURE).putExtra(EXTRA_OUTPUT, uri)` —
> it never sets `FLAG_GRANT_WRITE_URI_PERMISSION`, so an implicitly-resolved camera app (the
> system picks a package at launch time; the calling app doesn't know which in advance) has no
> permission to write into a `FileProvider` Uri the calling app owns. The first on-device pass
> (stock AOSP camera, `meeshy_pixel8`) reproduced this exactly before the fix: the camera
> activity opened normally, the shutter appeared to capture, control returned to the composer —
> but the destination `captures/` directory stayed empty (confirmed via `adb shell run-as ... ls`)
> and no TUS upload ever fired, because the launcher's callback silently resolved
> `success = false` into the existing (correct) cancel/discard branch. This class of bug is
> invisible to any JVM/Robolectric test — only a real device (or a real launched Activity)
> exercises the actual cross-app URI-permission boundary. **Fixed** with the canonical,
> Android-documented pattern for exactly this problem: before `takePicture.launch(uri)`,
> `context.packageManager.queryIntentActivities(Intent(ACTION_IMAGE_CAPTURE), MATCH_DEFAULT_ONLY)`
> then `context.grantUriPermission(pkg, uri, FLAG_GRANT_WRITE_URI_PERMISSION or
> FLAG_GRANT_READ_URI_PERMISSION)` for every resolved package — not a novel workaround, the same
> pattern Android's own official "capture images" guide documents. **Deliberate, documented scope
> cut vs. iOS**: photo capture only — iOS's `CameraView` is a custom AVFoundation screen with an
> in-app photo/video toggle (`camera.fill` → `.photo`/`.video` cases); Android delegates entirely
> to the system camera app's own `ACTION_IMAGE_CAPTURE` intent, so (a) no in-app camera preview UI
> was built (a materially bigger, separately-scoped increment) and (b) no `CAMERA` runtime
> permission request was needed here — the system camera app owns that permission, not the
> caller. Video capture (`ACTION_VIDEO_CAPTURE`, its own destination MIME/extension) stays a
> separately-scoped follow-up. New pure `CameraCaptureFile.next(nowMillis)` (`:feature:feed`,
> same split `me.meeshy.sdk.model.export.DataExportFileBuilder` uses — the instant is an explicit
> parameter, never read internally) names the destination file; +4 tests, mutation-proven
> (hardcoding the filename to ignore the `nowMillis` parameter fails **exactly** the 2
> discriminating tests — "names the file from the given instant", "two different instants
> produce two different file names" — the other 2 stay green). **Gate**:
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, full `assembleDebug` +
> all-module `testDebugUnitTest`, zero failures, re-confirmed clean after the permission-grant
> fix too). Reviewer **PASS** (diff `apps/android` only — 2 new `:feature:feed` files
> [`CameraCaptureFile.kt` + its test], `FeedComposerSheet.kt` edited [imports, launcher, gate
> reuse], `file_paths.xml` +1 `cache-path`, 4 locale `strings.xml` [en/fr/es/pt, 1 new key each];
> SDK purity — the pure filename builder lives in `:feature:feed` at the same grain as its
> `FeedMediaPicker`/`FeedMediaUploader` siblings, the actual `File`/`FileProvider`/permission-
> grant I/O stays coverage-exempt glue in the Composable, consistent with this file's own
> `readMediaUploadItem` precedent; SSOT — reused `dispatchPicked`/`FeedMediaPicker.modeFor`/the
> gallery tile's enablement rule verbatim, zero new upload or error-handling logic; no coverage
> floor lowered; no tautological tests). **On-device verification partially blocked by severe
> shared-host contention this run — documented honestly, not silently claimed complete**: the
> pre-fix pass ran clean on `meeshy_pixel8` and is what surfaced the URI-permission bug in the
> first place (composer opened, camera tile rendered with the correct content-description,
> tapping it launched the real system `com.android.camera2` `CaptureActivity` — confirmed via
> full hardware-camera-initialization logcat — shutter tap returned control to the composer).
> Re-confirming the FULL round-trip (capture → upload → thumbnail) after applying the fix hit
> host load spiking past **450** mid-session (`uptime`; other concurrent agent sessions on this
> shared box — consistent with the project's own documented
> `feedback_shared_disk_contention_multi_session` pattern) — the emulator process became so
> CPU-starved it never completed boot across two fresh launches and a `kill -9`+restart cycle
> (~30 minutes total, host 1-min load eventually back down to ~3 but the qemu process itself
> stayed wedged at near-zero incremental CPU time, confirmed via repeated `ps aux` sampling).
> Stopped retrying past that point rather than stall the run indefinitely (`tasks/lessons.md`-
> style principle already documented in this file's own `feed-post-composer-text` entry) — the
> post-fix correctness rests on code-level evidence instead of a second on-device capture:
> decompiled bytecode proving the exact gap, and the fix being Android's own publicly documented
> canonical pattern for this exact problem, not a speculative guess. A quick on-device
> confirmation pass once this shared box is quieter is a natural, cheap follow-up — not a
> precondition the routine's own rules require before merging here, given the strength of the
> remaining evidence and that every local/JVM gate is green. **feature-parity.md's "Create post"
> §F bullet's camera-capture line flips from "no existing pattern" to shipped**, still listing
> files/location/audio/language-override/durable-outbox as open follow-ups. **Next slice
> candidates (not attempted this run)**: chunked/resumable large-video TUS upload (checkpoint
> store, HEAD recovery, survives app kill — re-proven this run to still be the largest/riskiest
> remaining candidate, current `TusUploadRepository` does the whole file in one `PATCH` at
> `Upload-Offset: 0`, no chunking primitive exists yet); the §C inverted-list rewrite — this run
> did a deep, concrete re-read of `ChatScreen.kt`'s actual scroll/list logic specifically to
> attempt the decomposition the last several runs kept promising and deferring (see the new
> `## §C inverted-list rewrite — concrete decomposition` section below, added this run rather than
> re-typing the same "genuinely large, attempt one next time" note a further time); video capture
> fast-follow to this slice (`ACTION_VIDEO_CAPTURE`, same FileProvider/grant pattern, smaller now
> that the permission-grant lesson is written down); files/location/audio/per-post-language
> attachments for the Feed composer; PROGRESS.md archiving (now past the ~1500-line threshold,
> flagged above — its own dedicated `apps/android`-only PR, not bundled with a slice).

## §C inverted-list rewrite — concrete decomposition (2026-08-10)

Re-verified genuinely still open (`ChatScreen.kt`, 3050 lines, no `reverseLayout` anywhere) and,
per the routine's own standing instruction ("attempt a concrete sub-slice decomposition rather
than re-deferring"), read `buildChatListItems`/`ChatListItems.kt` and every one of the 7
index-dependent `LazyColumn`/`LaunchedEffect` behaviours end to end (not just re-confirming the
"genuinely large" verdict again) to produce this. The 7: (1) initial one-shot scroll-to-unread-
or-newest (`InitialScrollTarget.of` + `listState.scrollToItem`), (2) auto-scroll-on-new-message
(bottom = `listItems.lastIndex`), (3) jump-to-search-hit (`indexOfFirst` + `animateScrollToItem`),
(4) jump-to-quoted-reply (same shape as 3), (5) `isNearBottom` derivation (near `lastIndex`),
(6) `PinnedDayHeader.governingDayMillis` (scans from `firstVisibleItemIndex` **toward** index 0),
(7) load-older trigger (`firstVisibleItemIndex <= LOAD_OLDER_THRESHOLD`, i.e. near index 0).

**Key finding that de-risks the eventual flip**: Compose's `reverseLayout = true` + feeding the
**reversed** `listItems` (`listItems.asReversed()`, cheap — `ChatListItems` stays completely
unchanged, still emits oldest-first with headers before their groups) is enough to get the
correct VISUAL result for free — two reversals (the list itself, then `reverseLayout`'s own
bottom-anchored layout direction) cancel out, so top-to-bottom reading order stays identical to
today. The genuinely hard part isn't the rendering flip itself, it's that ALL SEVEN behaviours
above hardcode "bottom = last index, top = index 0" and must be rewired **simultaneously** to
"bottom = index 0, top = last index" of the reversed list, or the app silently breaks in 7
different, individually-hard-to-notice ways at once (this is why every prior run correctly
called this "not a one-line change").

**Sub-slice 1 (safe prep, zero visible behaviour change, do this first)**: extract a pure,
orientation-parameterised `ChatScrollGeometry` object (or similar — exact name TBD by whoever
picks this up) that answers, given a `reversed: Boolean` (or a small
`ChatListOrientation.TopDown | BottomUp` enum) plus a list size/index: "which index is
newest/bottom", "is index X near-bottom", "which direction does the pinned-header scan run",
"which index range counts as near-the-old-end for the load-older trigger". Wire `ChatScreen`'s
CURRENT behaviour through it unchanged (`TopDown` only) — this is a pure refactor, fully covered
by the app's existing behavioural chat tests (regression-proof: if scroll/pagination/pinning
behaviour changes even slightly, an existing test catches it), PLUS new unit tests proving the
`BottomUp` arm's index math is correct **in isolation**, before it's ever wired into a real
screen. Low risk, independently shippable, and turns sub-slice 2 into "just wire it up" instead
of "get 7 pieces of index arithmetic right at the same time."

**Sub-slice 2 (the actual user-visible flip)**: set `reverseLayout = true` on the `LazyColumn`,
feed it `listItems.asReversed()`, and rewire all 7 call sites to call the now-proven
`ChatScrollGeometry.____(..., BottomUp)` instead of their current ad-hoc index arithmetic. Verify
on-device (real device/emulator, not just JVM tests — this is exactly the kind of change where a
subtle off-by-one in the load-older threshold or the pinned-header scan direction wouldn't show
up any other way): scroll-to-bottom on open, auto-stick-to-bottom on a new own/incoming message
while already at the bottom (and NOT stick when reading history), load-older firing when
scrolling toward the OLD end (now visually the top, index-wise the tail of the reversed list),
the floating day-header pill tracking the correct governing day while scrolling, search/quoted-
reply jump landing on the right bubble.

**Sub-slice 3 (verification-only follow-up, likely free)**: soft-keyboard/IME resize interaction
— a genuinely inverted list is a common reason to invert chat lists in the first place (the
list's bottom edge naturally stays pinned to the keyboard without extra scroll-compensation
code). Worth an explicit on-device check once sub-slice 2 lands: this may already work for free,
or may reveal `ChatScreen`'s current `imePadding`/`Scaffold` wiring needs a small adjustment —
either way it's a verification pass, not new logic, so keep it separate from sub-slice 2's
gate rather than blocking the flip on it.

This decomposition is deliberately NOT attempted as code in this run (this run's own slice/PR is
the Feed camera-capture increment above, diff `apps/android`-only, one increment per run) — it's
the documentation output the routine has been asking for across ~10+ runs on this exact item.

> On 2026-08-10 **a real FCM channel-id-drift bug got found and fixed** (slice
> `notification-channel-id-drift`, feature-parity §M — this run's periodic angle-mort category
> check, on the standing §M `NotificationChannel` taxonomy line the prior run added but didn't
> implement). **RE-PROUVEN before choosing**: rather than jumping straight to the "curated 80-type
> taxonomy" framing of that line, read `services/gateway/src/services/PushNotificationService.ts`
> `sendViaFCM` end to end first — found the gateway already sends `message.android.notification.
> channelId = 'meeshy_notifications'` for every Android non-call push, but `MeeshyFcmService` had
> only ever created a channel named `meeshy_messages`, and only lazily inside `onMessageReceived`.
> Cross-checked Android/FCM semantics: a push carrying both a `notification` and a `data` block
> (every non-call push today) is auto-rendered by the OS/Play services when the app is
> backgrounded or killed — `onMessageReceived` never runs in that case, so the system posts
> directly against the gateway's `channelId`. Grepped the manifest for a `com.google.firebase.
> messaging.default_notification_channel_id` fallback too — absent — so with no
> `meeshy_notifications` channel ever created client-side, that push is either dropped outright or
> folded into a generic, unbranded system "Miscellaneous" channel with none of the intended
> importance/sound, exactly backwards from the scenario push exists for (the foregrounded case,
> where `onMessageReceived` DOES run, was never actually affected — channel creation there already
> worked). A real, live, currently-shipping defect, not a missing feature. **Fixed (production,
> all `apps/android`)**: new `NotificationChannelIds` (`:app`, SSOT replacing the two ad-hoc
> constant sets previously duplicated in `MeeshyFcmService`'s companion) renames the client's
> message channel id to `meeshy_notifications` — byte-for-byte matching the gateway's own literal
> — and a new `NotificationChannelInstaller` creates it **eagerly at process start**
> (`MeeshyApplication.onCreate`, Hilt-injected) instead of only lazily inside the one handler
> that's exactly the one that doesn't run in the failure scenario; it also deletes the orphaned
> pre-drift `meeshy_messages` channel (channels are immutable once created — same "delete +
> recreate under a new id" migration `CHANNEL_CALLS` already took `meeshy_calls` v1→v2).
> `MeeshyFcmService`'s own lazy `createNotificationChannel` call in the foreground-received path
> stays as a harmless, idempotent belt-and-suspenders, now pointing at the same SSOT id.
> **+4 `NotificationChannelInstallerTest`** (Robolectric): creates the channel under the
> gateway-matching id at `IMPORTANCE_HIGH`, deletes the stale legacy channel, idempotent across
> repeated `install()` calls (no duplicate), never touches the calls channel. **Robolectric gotcha
> hit and fixed**: the `:app` module's ambient default SDK resolution silently fell back to API 21
> (well below the O+ `NotificationChannel` API), producing a `NoSuchMethodError` rather than a
> clear "unsupported SDK" error — pinned `@Config(sdk = [26])` to the app's own `minSdk` floor
> instead of trusting the default; `testImplementation(libs.androidx.test.ext.junit)` also needed
> adding to `:app` (present in `:sdk-core` but not `:app`) for `ApplicationProvider` to resolve.
> Mutation-proven: commenting out the legacy-delete call fails **exactly** the 1 discriminating
> test, the other 3 stay green. **Gate**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL`
> (970 tasks, full `assembleDebug` + all-module `testDebugUnitTest`, zero failures). Reviewer
> **PASS** (diff `apps/android` only — 2 new `:app` files [`NotificationChannelIds.kt`,
> `NotificationChannelInstaller.kt`] + 1 new test, `MeeshyApplication.kt`/`MeeshyFcmService.kt`
> edited, 1 dependency line added; SDK purity — this is app-specific `MeeshyFcmService`/
> `MeeshyApplication` glue, correctly in `:app` not `:sdk-core`, same precedent as
> `DeclinedCallStore`/`CrashDiagnosticsRecorder`; SSOT — one channel-id source of truth replacing
> two duplicated constant sets; no coverage floor lowered; no tautological tests). **Verified
> on-device** (`meeshy_pixel8` emulator, fresh app launch, no push sent): `adb shell dumpsys
> notification` confirms `NotificationChannel{mId='meeshy_notifications', mImportance=4,
> mDeleted=false}` exists for `me.meeshy.app.debug` the instant the process starts, before any
> message push ever arrives. **feature-parity.md's §M taxonomy bullet flips `[ ]` → `[~]`** — the
> concrete id-mismatch defect is closed and the SSOT + eager-install foundation is laid, but the
> full curated *multi*-channel taxonomy (a distinct channel per category, each individually
> mutable in system settings) still needs the gateway to send a **per-type** `channelId` instead
> of the one hardcoded literal it sends today — a `services/gateway` change, outside this lane's
> `apps/android`-only scope, left as an explicitly separate, larger follow-up. **Next slice
> candidates (not attempted this run)**: chunked/resumable large-video TUS upload (checkpoint
> store, HEAD recovery, survives app kill); the §C inverted-list rewrite (still deferred without a
> concrete sub-slice decomposition, many runs running — re-verify genuinely large before deferring
> again rather than re-typing the same note); camera capture for the Feed composer (needs a
> genuinely new `TakePicture`/`FileProvider` pattern, not yet established anywhere in the Android
> app); the gateway-side per-type `channelId` fast-follow to this slice (out of lane scope, needs
> a `services/gateway` change — flag for the user or a dedicated cross-lane task, not this
> routine's Android-only diff); the noticed-not-chased Friends/Discover tab content question
> (still outside this routine's mandate per the user's 2026-08 note).
> On 2026-08-10 **the Feed post composer's reel-classification sub-slice landed** (slice
> `feed-composer-reel-classification`, feature-parity §F — the orchestrator's documented next
> sub-step after the photo/video attachments slice). **RE-PROUVEN before starting**: grepped
> `services/gateway/src/services/PostService.ts` (`createPost`) and confirmed the gateway only ever
> *degrades* a client-claimed `REEL` back to `POST` when the composition doesn't qualify — it never
> auto-*upgrades* a `POST` claim, even when the attached media would qualify. Cross-checked
> `FeedViewModel.publishPost`/`FeedComposerDraft`: every Android-authored post hardcoded
> `type = "POST"`, confirming a REAL, currently-live parity gap — any Android post with a qualifying
> video/audio (≥3s) or ≥2 images was permanently stuck as a plain post and could never surface on the
> Reels surface, unlike iOS (`FeedView.composerOverlay` + `ReelComposition.defaultType`, "un post
> n'est un RÉEL que si sa composition porte une vidéo, un audio, ou au moins deux images", directive
> user 2026-08-02). **Shipped (production, all `apps/android`)**: a new pure `ReelComposition`
> (`:core:model`) — third mirror of the SAME rule already living in the iOS SDK (`FeedModels.swift`)
> and the gateway (`services/gateway/src/services/posts/reelComposition.ts`) — computing
> `qualifiesAsReel`/`defaultType` from a media list's `mimeType`/`durationMs`. **No on-device
> duration-extraction plumbing needed**: read `services/gateway/src/routes/uploads/tus-handler.ts`
> end to end and confirmed the gateway's `ffprobe`-backed `metadataManager.extractMetadata` runs
> SYNCHRONOUSLY before the TUS finish response, so `UploadedMedia.durationMs` (already surfaced by
> the `story-media-tus-upload`/`feed-composer-media-attachments` slices' own `TusUploadRepository`)
> already carries the server-authoritative duration the instant an upload completes — the same wire
> shape (`MediaAttachmentWire`) every upload path shares. Added `PostType.REEL` (`:core:model`,
> previously only `POST`/`STORY`/`STATUS` — confirmed zero exhaustive-`when`/ordinal-persistence call
> sites anywhere in the app before adding it, so the insertion is additive-safe). `FeedComposerDraft`
> now tracks `media: List<UploadedMedia>` instead of bare ids (`mediaIds` is a computed projection,
> so no behavioural change to anything reading it) and gained `qualifiesAsReel`/`postType`/
> `forcePlainPost`/`withForcePlainPost` — `postType` resolves `REEL` when qualifying and not
> author-overridden, else `POST`, and `publishRequest()` now carries the resolved wire `type`.
> `FeedComposerSheet` shows a small Réel⇄Post override chip (`PlayCircle`/`Description` icons already
> established elsewhere in `:feature:feed` for the same semantics) **only when the composition
> qualifies** — byte-for-byte the same conditional gate iOS uses around its own toggle, so removing
> an image back down to one both de-qualifies AND hides the chip on both platforms identically.
> `FeedViewModel.publishPost` gained a `type` param (defaulted to `PostType.POST.name`, so every other
> call site is unaffected) threaded straight to `PostRepository.create`. **+28 tests**:
> `ReelCompositionTest` (13 — video/audio/image qualification, the 3s duration floor at/under/missing,
> images never subject to the floor, case-insensitive MIME matching, `defaultType` incl.
> `forcePlainPost` override), `FeedComposerDraftTest` (+14 net new — fresh draft is POST, single image
> never qualifies, ≥2 images/qualifying video default to REEL, short/missing-duration video does not
> qualify, force-override on a qualifying vs. non-qualifying composition, de-qualification on
> `withoutMedia` removal, publish request carries the resolved type both ways), `FeedViewModelTest`
> (+1 — `publishPost` sends a caller-resolved `REEL` type through to the repository unchanged).
> `FeedMediaPickerTest`/existing `FeedComposerDraftTest` cases mechanically updated for the
> `mediaIds: List<String>` → `media: List<UploadedMedia>` constructor shape (same behaviour, new
> fixture shape — a small local `media(id, mimeType, durationMs)` test factory added to both files).
> **Mutation-proven, three independent axes**: (a) forcing `ReelComposition`'s private
> `meetsMinDuration` to always return `true` failed **exactly** the 3 duration-floor-sensitive tests
> (`under 3s does NOT qualify`, `missing duration does NOT qualify`, `a video under 3 seconds defaults
> to POST`), the other 10 `ReelCompositionTest` cases stayed green; (b) loosening the image-count
> threshold from `>= 2` to `>= 1` failed **exactly** the 2 single-image-must-not-qualify tests across
> both files, everything else (2484 total tests in the `:core:model` run) stayed green; (c) hardcoding
> `FeedComposerDraft.postType` to ignore `forcePlainPost` (passing a literal `false` instead) failed
> **exactly** the 2 tests asserting the override, the other 33 `FeedComposerDraftTest` cases stayed
> green. All three reverted and re-run clean before commit. **Gate**: `./apps/android/meeshy.sh check`
> → **`BUILD SUCCESSFUL`** (970 tasks, full `assembleDebug` + all-module `testDebugUnitTest`, zero
> failures anywhere in the monorepo, confirmed both immediately after the mutation-proof reverts and
> again on a clean rerun). Reviewer **PASS** (diff `apps/android` only — 2 new `:core:model` files
> [`ReelComposition.kt` + its test] + 1 line added to the existing `PostType` enum, 4 `:feature:feed`
> production files edited [`FeedComposerDraft.kt`/`FeedComposerSheet.kt`/`FeedScreen.kt`/
> `FeedViewModel.kt`] + 3 existing test files mechanically updated + 1 extended, 4 locale
> `strings.xml` [en/fr/es/pt, `FeedStringLocalizationParityTest` green — 3 new keys per locale]; SDK
> purity — the stateless `ReelComposition` rule engine lives in `:core:model` exactly like its iOS SDK
> counterpart, the "which media reached this draft, is the author overriding" product decision stays
> in `:feature:feed`'s `FeedComposerDraft`, same split as every prior TUS-adjacent slice; SSOT — reused
> `UploadedMedia.mimeType`/`durationMs` verbatim rather than inventing a second on-device
> duration-extraction path, reused the `PlayCircle`/`Description` icons already established for the
> same reel/post semantics elsewhere in this module; no coverage floor lowered; no tautological
> tests). Not yet verified on-device this run (the toggle is a small conditional chip with no new
> network shape — the underlying wire-format proof point, "does the gateway actually honor a
> REEL-classified post typed on Android," piggybacks on the same TUS round-trip
> `feed-composer-media-attachments` already verified live against the gateway; a dedicated on-device
> pass confirming the chip's appear/disappear + a real `type: "REEL"` request body is a natural
> next-run candidate if useful, not required by the local gate this run).
> **Next slice candidates (not attempted this run)**: chunked/resumable large-video TUS upload
> (checkpoint store, HEAD recovery, survives app kill); the §C inverted-list rewrite decomposition
> (still deferred without an attempt, many runs running); the §M `NotificationChannel` taxonomy gap (2
> channels vs. ~80 backend types); camera capture for the Feed composer (needs a genuinely new
> `TakePicture`/`FileProvider` pattern, not yet established anywhere in the Android app); the
> noticed-not-chased Friends/Discover tab content question from the prior `feed-composer-media-
> attachments` run.
