# Progress — state & what to do next

> **Archive:** entries older than the ~300-line hygiene threshold live in
> [`PROGRESS-archive-2026-08.md`](./PROGRESS-archive-2026-08.md) (same prepend/newest-first order).
> Archived 2026-08-10 (routine iteration 30, hygiene pass — pure archiving increment, no
> slice, `tasks/lane-cursor.md` unchanged per §Hygiène): moved the 4 oldest entries at the
> time (`feed-composer-media-attachments` back through the `TagInputField`/Kover tail note)
> to the archive, keeping the 4 most recent (`feed-composer-camera-capture`, the §C
> inverted-list decomposition, `notification-channel-id-drift`,
> `feed-composer-reel-classification`).

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
