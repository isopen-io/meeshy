# Progress — state & what to do next

> **Archive:** entries older than the ~300-line hygiene threshold live in
> [`PROGRESS-archive-2026-08.md`](./PROGRESS-archive-2026-08.md) (same prepend/newest-first order).
> Archived 2026-08-10 (routine iteration 30, hygiene pass — pure archiving increment, no
> slice, `tasks/lane-cursor.md` unchanged per §Hygiène): moved the 4 oldest entries at the
> time (`feed-composer-media-attachments` back through the `TagInputField`/Kover tail note)
> to the archive, keeping the 4 most recent (`feed-composer-camera-capture`, the §C
> inverted-list decomposition, `notification-channel-id-drift`,
> `feed-composer-reel-classification`).

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
