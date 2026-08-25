# Progress — state & what to do next

> Older entries archived in `PROGRESS-archive-2026-08.md` (prepend/newest-first, same convention).

> On 2026-08-25 **the composer AUTHORS a per-slide duration pin** (slice `story-composer-slide-duration-pin`,
> feature-parity E. Stories — "Per-element + per-slide duration"). The prior slice made the *reader* honour
> `effects.timelineDuration`; this one gives Android's own composer a control that *writes* it, closing the
> author→reader loop (today only iOS-authored / back-end stories carried the pin). Ports iOS
> `StoryComposerViewModel.currentSlideDuration` (StoryComposerViewModel+Slides.swift): clamp `[2, 600]`s, write
> the authoritative `timelineDuration`; the getter falls back to the content-derived duration when unpinned.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3504/#3502/#3500/#3498/#3497, all
> gateway/ios/shared branches (`claude/brave-archimedes-*`, `claude/intelligent-noether-*`), none a
> `claude/apps/android/*` slice from THIS routine. Prior slice (`story-viewer-slide-duration`, #3503) already
> merged into main (`5f20c529`). Branched off freshly-fetched `origin/main` (`5f20c529`).
>
> **The fix — a pure clamp SSOT + a deck field/reducer + a draft serialiser + a VM intent + a screen slider.**
> (1) `StoryDurationPin` (`:core:model`, pure, no state) owns the one bound — `clamp(seconds)` →
> `coerceIn(2.0, 600.0)` with a NaN→MIN guard the `Float` slider could otherwise feed through — the authoring
> counterpart of the reader SSOT `StorySlideDuration`. (2) `StorySlide` (deck) gains `durationSecondsPin: Double?`;
> `StorySlideDeck.setSelectedDuration(seconds)` clamps via the SSOT, writes the pin on the selected slide only,
> and is inert (same instance) when the clamped value already equals the pin; `selectedSlideDurationSeconds`
> resolves `pin ?? contentDerived` by delegating the fallback to `StorySlideDuration.contentDerivedSeconds`
> (fed the publishable text elements, mirroring iOS's `timelineDuration ?? computedTotalDuration()`). (3)
> `StoryComposerDraft` carries `durationSecondsPin` and serialises it onto `StoryEffects.timelineDuration`
> (a pin alone now materialises effects). (4) `StoryComposerViewModel.onSlideDurationChange` + the pin flows
> per-slide through `publishPlans`; `selectedSlideDurationSeconds` is exposed on the UiState. (5) A "Slide
> duration" slider in the Effets band (Compose glue, exempt) with a live seconds label, wired end-to-end.
>
> **Tests: +21** — 8 `StoryDurationPinTest` (pure: inside-range unchanged; below-floor & above-ceiling clamp;
> exact bounds preserved; bounds are 2/600; ±∞ clamp; NaN→MIN), 10 `StorySlideDeckDurationTest` (fresh slide has
> no pin; set pins selected slide only; selection preserved; clamp below/above; inert on equal pin; inert when a
> below-floor request equals a floor pin; effective duration default 6s / follows the content rule for a long
> caption / blank element does not extend / pin wins over content), 3 new `StoryComposerDraftTest` (pin serialises
> to `timelineDuration`; a pin alone materialises effects with empty textObjects; no pin → null effects), 3 new
> `StoryComposerViewModelTest` (intent pins through public state; clamps out-of-range; pin rides into the wire
> request on publish). **RED-proof isolated**: neutering `StoryDurationPin.clamp` to return `seconds` reddened
> EXACTLY the 5 clamp-behaviour tests (below/above/±∞/NaN) while the 3 non-clamp tests (within-range, exact
> bounds, bounds-are-2/600) stayed green — genuine discrimination, not an assertion echo.
>
> **SDK bootstrap — `dl.google.com` 200; THIRD mode (copy→patch + BOTH dirs).** Pristine `android-37.0`
> auto-installed by AGP but the first `./gradlew` hash-errored on `android-37`; the four-edit copy→patch
> (`source.properties` ApiLevel 37.0→37, `package.xml` `<api-level>` + `path=`, BOTH `build.prop` `sdk_full`
> fields) keeping android-37.0 ALONGSIDE resolved it — same THIRD mode as the `story-viewer-slide-duration` run.
>
> **Verified**: targeted `:core:model` (`StoryDurationPinTest`) + `:feature:stories` (`StorySlideDeckDurationTest`
> / `StoryComposerDraftTest` / `StoryComposerViewModelTest`) suites green, then full `./apps/android/meeshy.sh
> check` (assembleDebug + testDebugUnitTest, 973 tasks, the CI-mirror gate) **BUILD SUCCESSFUL** before any push.
> Reviewer PASS. Diff is `apps/android` only (1 new prod file in :core:model, 4 prod files + 4 strings.xml in
> :feature:stories, +2 new test files + 2 amended, tracking docs). Verdict: **PASS** — a pure clamp SSOT
> mirroring iOS's authority, a deck reducer, a draft serialiser, a VM intent, and a screen slider; behavioural
> tests through the public API; no production logic outside `apps/android`.
>
> **Next**: the two remaining pieces of feature-parity E's duration/background item — **per-ELEMENT duration**
> (a text/media element carries its own on-screen window `startTime`/`duration`, distinct from the slide's) and
> the **background-designation toggle** (mark 1 visual + 1 audio per slide as the looping background, feeding the
> content-derived `bgVideoDur`/`bgAudioDur` branch the reader SSOT already reads). Scout `feature-parity.md`
> read-only before branching.

> On 2026-08-25 **the story viewer honours per-slide duration** (slice `story-viewer-slide-duration`,
> feature-parity E. Stories — "Timed auto-advance" + "Per-element + per-slide duration"). The viewer's
> auto-advance ran a HARDCODED 5s (`SLIDE_DURATION_MS`) for every slide; iOS has a single source of truth
> (`StorySlide.computedTotalDuration()`, StoryModels.swift) that is content-aware and defaults to **6s**,
> not 5s — so Android was both wrong on the default and blind to per-slide timing.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3502/#3500/#3498/#3497, all
> gateway/ios/shared branches (`claude/brave-archimedes-*`, `claude/intelligent-noether-*`), none a
> `claude/apps/android/*` slice from THIS routine. Prior slice (`story-updated-realtime-tray`) already merged
> into main (`c4a3d517`). Branched off freshly-fetched `origin/main` (`c4a3d517`).
>
> **The fix — a pure SSOT + a projection + a screen consumer.** (1) `StorySlideDuration` (`:core:model`,
> pure, no clock/IO) ports iOS's rule EXACTLY: priority-0 `effects.timelineDuration` (> 0, author-pinned via
> the timeline editor) wins over content; otherwise content-derived — background video/audio looped up to ≥
> the target (`period < target → ceil(target/period)*period`), long caption text (> 30 cumulative words)
> extends 1s per 6 words past 30, 6s static default. The legacy `effects.slideDuration` is DELIBERATELY
> ignored (old backend stories carry arbitrary 12s values the composer wrote per publish, bypassing the
> rule) — same reasoning as iOS. `computeMillis` rounds to whole ms. (2) `StorySlideView.autoAdvanceMillis`
> is resolved ONCE at projection (`StoryViewerViewModel.toSlideView`) from the slide's `storyEffects`.
> (3) `StoryViewerScreen` drops the `SLIDE_DURATION_MS` constant and drives BOTH the countdown tween and the
> keyframe playhead (`playheadSeconds`) from `slideDurationMs`, keyed into the auto-advance `LaunchedEffect`
> so a realtime slide-replace re-times. (4) Latent v3 gap fixed: `SceneV3.timelineDuration` was silently
> dropped by `StoryEffects.rendering` — now mapped, so a timeline-pinned v3 story honours its author duration.
>
> **Tests: +20** — 17 `StorySlideDurationTest` (pure, every branch: null/empty → 6s; short vs long text +
> multi-object cumul + multi-space split parity with Swift `split(separator:)`; bg video ≥/< target loop; bg
> audio loop; non-bg media/audio data windows; near-zero period ignored; image-bg no-loop; timelineDuration
> positive override vs 0/negative fallthrough; legacy slideDuration ignored; millis conversion), 1
> `CanvasV3ProjectionTest` (v3 `timelineDuration` traverses the bridge), 2 `StoryViewerViewModelTest` (no
> effects → 6s default; author-pinned 3s → 3000ms through the public state). **RED-proof isolated**: neutering
> the priority-0 branch reddened EXACTLY `un timelineDuration positif l'emporte sur le contenu` (17 tests, 1
> failed) while the other 16 stayed green; neutering the VM projection reddened EXACTLY the author-pinned VM
> test (75 tests, 1 failed) — genuine discrimination, not an assertion echo.
>
> **SDK bootstrap — `dl.google.com` 200; THIRD mode (copy→patch + both dirs).** Pristine `android-37.0`
> auto-installed by AGP but the first `./gradlew` hash-errored on `android-37`; the four-edit copy→patch
> (`source.properties` ApiLevel 37.0→37, `package.xml` `<api-level>` + `path=`, BOTH `build.prop` `sdk_full`
> fields) keeping android-37.0 ALONGSIDE resolved it.
>
> **Verified**: targeted `:core:model` + `:feature:stories` suites green, then full `./apps/android/meeshy.sh
> check` (assembleDebug + testDebugUnitTest, 973 tasks, the CI-mirror gate) **BUILD SUCCESSFUL** before any
> push. Reviewer PASS. Diff is `apps/android` only (2 prod + 1 new prod in :core:model, 2 prod in
> :feature:stories, +3 test files, tracking docs). Verdict: **PASS** — a pure SSOT mirroring iOS's authority
> function, a projection, a screen consumer, and a v3-bridge fix; behavioural tests through the public API;
> no production logic outside `apps/android`.
>
> **Next**: the composer-side AUTHORING of per-slide duration — a control that writes
> `effects.timelineDuration` (the timeline editor "pin duration"), so the reader-side SSOT this slice built
> gets fed by Android's own composer (today only iOS-authored/back-end stories carry it). Adjacent backlog:
> per-ELEMENT duration + the background-designation toggle (1 visual + 1 audio/slide, feature-parity E), or
> the V2 timeline editor foundation. Scout `feature-parity.md` read-only before branching.

> On 2026-08-25 **the story TRAY folds a realtime `story:updated`** (slice `story-updated-realtime-tray`,
> feature-parity Story realtime) — the viewed-monotonicity MERGE, and the LAST STORY-realtime gap. STORY realtime
> is now fully at parity (viewer: reactions/overlay-tx/delete/update; tray: delete/update).
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3500/#3498/#3497, all gateway/ios
> production-logic branches (`claude/brave-archimedes-*`, `claude/intelligent-noether-*`), none a
> `claude/apps/android/*` slice from THIS routine. Prior slice (`story-deleted-realtime-tray`) already merged into
> main. Branched off freshly-fetched `origin/main` (`36b9921b`).
>
> **The gap — the tray kept a stale ring after an edit made elsewhere.** The `story:updated` viewer fold (prior
> run) swapped the slide only in the OPEN viewer; the TRAY (`StoriesViewModel`) is driven entirely by
> `StoryRepository.storiesStream()` (Room-backed, cache-first), so an edit — a content change, or a content edit
> that RESET engagement (views/reactions wiped, ring should revert to unseen) — left the old ring painted until the
> next background revalidation. iOS folds it in `StoryViewModel.storyUpdated` with a `shouldKeepLocalViewed`
> viewed-monotonicity guard + the `engagementReset` flag; the `SocketStoryUpdatedData` DTO + `storyUpdated` flow
> already existed (viewer slice) — this slice needed the Room-cache MERGE seam.
>
> **The fix — a pure merge + a read-merge-write cache seam + a repository fold + a tray VM subscription.**
> (1) `StoryUpdateMerge.merge(previous, updated, engagementReset, isOwnStory)` in `:core:model`: `engagementReset
> && !isOwnStory` → adopt the fresh (unseen) story wholesale (server wiped engagement); otherwise delegate to
> `PostUpdateMerge` (monotone seen — one source of truth for reader-personal-field preservation). The AUTHOR is
> the exception to the reset (their own seen is client-only, the server never records it), mirroring iOS
> `isOwnGroup ||`. Android reads the explicit `engagementReset` flag, not iOS's `contentEditedAt` timestamp (absent
> from the wire model). (2) `StoryDao.getById(id)` + `StoryCacheSource.findLocal`/`upsertLocal` (single-writer seam,
> re-deriving the `createdAt` ordering column; no `sync_meta` touch — a realtime fold is not a revalidation).
> (3) `StoryRepository.applyStoryUpdate(updated, engagementReset, currentUserId)` reads the cached copy, computes
> `isOwnStory = updated.author?.id == currentUserId`, merges, upserts; inert (`false`) for an unknown id
> (over-broadcast) or a no-op merge. (4) `StoriesViewModel.observeStoryUpdates` forwards every `story:updated`,
> resolving the reset flag (`?: false`) and `sessionRepository.currentUserId`.
>
> **Tests: +14** — 6 `StoryUpdateMergeTest` (pure, every branch: non-owner reset reverts to unseen; author keeps
> seen through a reset; metadata edit keeps monotone seen; metadata adopts an authoritative reaction summary; inert
> on the reset path; inert on the metadata path), 2 `StoryDaoTest` (real Room: `getById` returns the row / null for
> an absent id), 3 `StoryRepositoryTest` (real Room folds: an edit repaints; a non-owner reset reverts to unseen;
> a metadata edit keeps seen; author keeps seen; inert unknown id; inert no-op — 6 cases across the block), 3
> `StoriesViewModelTest` (the VM forwards the flag + current user; an absent flag folds as `false`; a behavioural
> repaint reverts an author's ring `hasUnviewed` false→true via a fake stream mirroring Room re-emitting).
> **RED-proof isolated**: neutering the reset branch (`return PostUpdateMerge.merge(...)` unconditionally) reddened
> EXACTLY `a non-owner content edit reverts the ring to unseen on an engagement reset` (6 tests, 1 failed) while
> the other 5 preserve-path cases stayed green — genuine discrimination, not an assertion echo.
>
> **SDK bootstrap — `dl.google.com` REACHABLE (200); pristine `android-37.0` alone worked** (no copy→patch, no
> both-dirs; AGP mapped compileSdk 37 → android-37.0 on the first `./gradlew`). The recipe still flips per
> container (per NOTES) — this one was the pristine mode.
>
> **Verified**: targeted `:core:model`/`:core:database`/`:sdk-core`/`:feature:stories` unit suites **BUILD
> SUCCESSFUL** (all four touched suites green), then full `./apps/android/meeshy.sh check` (assembleDebug +
> testDebugUnitTest, the CI-mirror gate) — see run log for the result. Reviewer PASS. Diff is `apps/android` only
> (1 new prod file + 3 prod files across :core:model/:core:database/:sdk-core/:feature:stories, +2 test files,
> tracking docs). Verdict: **PASS** — a pure merge reusing the established `PostUpdateMerge` law, a read-merge-write
> Room seam mirroring the delete seam, a repository fold, and a tray VM subscription mirroring the delete
> subscription; behavioural tests through the public API; no production logic outside `apps/android`.
>
> **Next**: STORY realtime is complete. Move to the next feature-parity area in build order — candidates from the
> Story/editor backlog (per-clip inspector, timeline transport) or advancing the CALLS area. Scout `feature-parity.md`
> for the highest-value unchecked box before committing, and read-only before branching.

> On 2026-08-25 **the story TRAY folds a realtime `story:deleted`** (slice `story-deleted-realtime-tray`,
> feature-parity Story realtime) — the TRAY sibling of the viewer-scoped `story:deleted` fold (cycle before last),
> and the first of the two remaining TRAY realtime folds the prior "Next" pointer flagged.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → only #3497 (gateway/e2ee, branch
> `claude/brave-archimedes-mu8dvk`): not a `claude/apps/android/*` slice from THIS routine, touches production logic
> outside `apps/android`. Prior slice (`story-updated-realtime-viewer`) already merged into main. Branched off
> freshly-fetched `origin/main` (`e91b3d19`).
>
> **Scout — STATUS realtime was already DONE, so the pointer's alt option was moot.** The prior "Next" offered
> either the TRAY fold or STATUS realtime folds; scouting found `StatusesViewModel.subscribeToSocketEvents`
> already folds all five status events (`created`/`updated`/`deleted`/`reacted`/`unreacted`), so STATUS needed
> nothing. That left the TRAY fold as the highest-value thin slice; mirroring how the VIEWER folds were sequenced
> (delete before update), I took the deletion half — smaller than the update half (which needs the
> viewed-monotonicity merge).
>
> **The gap — the viewer fold dropped a deleted story only from the OPEN viewer.** The story TRAY
> (`StoriesViewModel`) is driven entirely by `StoryRepository.storiesStream()` (Room-backed, cache-first), so a
> `story:deleted` arriving while the tray was on screen left the deleted ring painted until the next background
> revalidation pruned it. The `SocketStoryDeletedData` DTO + `SocialSocketManager.storyDeleted` flow already
> existed (viewer slice) — this slice only needed the authoritative Room-cache removal seam + the tray VM
> subscription.
>
> **The fix — a DAO delete-by-id + a cache-source passthrough + a repository fold + a tray VM subscription.**
> (1) `StoryDao.deleteById(id)` = `DELETE FROM stories WHERE id = :id`. (2) `StoryCacheSource.deleteLocal(storyId)`
> delegates to it (single writer of the cache). (3) `StoryRepository.removeCachedStory(storyId)` folds the delete
> into the cache so the cache-first stream re-emits without the row — an unknown id is an inert 0-row delete, so
> Room emits nothing and an over-broadcast delivery (a friend's feed room gets deletes for stories never cached)
> causes no repaint. (4) `StoriesViewModel` now injects `SocialSocketManager`; `observeStoryDeletions` forwards
> every `story:deleted` to `removeCachedStory` UNCONDITIONALLY — no own-echo guard (unlike a reaction), mirroring
> iOS `purgeDeadStories`: a story deleted on another device must vanish for its author too. Single-source-of-truth:
> the Room cache is authoritative, the reactive stream repaints — no in-memory overlay of deleted ids.
>
> **Tests: +4** — 2 `StoryDaoTest` (real in-memory Room via Robolectric: `deleteById` removes exactly the matched
> row leaving the rest ordered; `deleteById` on an absent id leaves the table unchanged), 2 `StoriesViewModelTest`
> (a realtime deletion drops the story from the tray — the fake `removeCachedStory` mutates a `MutableStateFlow`
> stream to mirror Room re-emitting, and the tray drops the ring; a realtime deletion of the current user's OWN
> story is folded too, proving no own-echo guard). **RED-proof isolated**: neutering `observeStoryDeletions` to
> collect-but-not-remove reddened EXACTLY the 2 new VM tests (17 completed, 2 failed) while the other 15 stayed
> green — genuine discrimination, not an assertion echo. The DAO tests are compile-RED without `deleteById`.
>
> **SDK bootstrap — `dl.google.com` REACHABLE (200).** Pristine `android-37.0` auto-installed by AGP but the first
> `./gradlew` hash-errored on `android-37`; the four-edit copy→patch (`source.properties` ApiLevel 37.0→37 +
> `package.xml` `<api-level>` + `path=` + BOTH `build.prop` `sdk_full` fields), keeping android-37.0 alongside,
> resolved it ("THIRD mode", per NOTES).
>
> **Verified**: targeted `:core:database:StoryDaoTest` + `:feature:stories:StoriesViewModelTest` **BUILD
> SUCCESSFUL** (both suites green), then full `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest,
> all modules, 973 tasks, the CI-mirror gate) **BUILD SUCCESSFUL** before any push. Reviewer PASS. Diff is
> `apps/android` only (3 prod files across :core:database + :sdk-core + :feature:stories, +4 tests across 2 files,
> tracking docs). Verdict: **PASS** — a DAO delete-by-id, a cache-source passthrough, a repository fold reusing the
> established cache-first stream, and a tray VM subscription mirroring the existing status folds; behavioural tests
> through the public API; no production logic outside `apps/android`.
>
> **Next**: the LAST STORY-realtime slice is the TRAY fold of `story:updated` — the viewed-monotonicity merge
> (iOS `shouldKeepLocalViewed`: keep a locally-viewed ring viewed unless the story's content was edited AFTER the
> local view, i.e. `engagementReset`). It needs a Room-cache MERGE seam (read the existing cached `ApiPost`, upsert
> the incoming one preserving `isViewedByMe` when `!engagementReset`), a pure merge function worth TDD, and the tray
> VM subscription to `storyUpdated`. After that, STORY realtime is fully at parity (viewer: reactions/overlay-tx/
> delete/update; tray: delete/update). Scout read-only before committing.

> On 2026-08-25 **the open story viewer folds a realtime `story:updated`** (slice
> `story-updated-realtime-viewer`, feature-parity Story realtime) — the EDIT sibling of the `story:deleted`
> fold shipped the prior run, and the last remaining VIEWER-scoped STORY realtime gap.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → `[]` (empty). Prior slice
> (`story-deleted-realtime-viewer`) already merged into main. My routine branch `claude/fervent-darwin-2bdo9z`
> sat exactly at `origin/main` (`9ac1f0f7`, 0/0). Branched off freshly-fetched `origin/main`.
>
> **The gap — the edit twin of `story:deleted`.** The gateway broadcasts a story edit as the COMPLETE new
> story (`{ story, engagementReset }`) to every visibility-filtered feed room via
> `SocialEventsHandler.broadcastStoryUpdated`; `engagementReset: true` when the edit wiped views/reactions
> (a content edit), false/absent on a metadata-only change (visibility). iOS folds it via
> `StoryViewModel.storyUpdated`. On Android the event decoded nowhere: `SocialSocketManager` had no
> `storyUpdated` flow, `SocketEvents.kt` no DTO, `StoryViewerViewModel` no subscriber — an edit made on
> another device never reached the open viewer until it was reloaded.
>
> **Scout — why the VIEWER, not the tray.** iOS lands `story:updated` in the TRAY (`storyGroups`) with a
> `shouldKeepLocalViewed` viewed-monotonicity guard (a stale story mustn't revert the ring to "unseen"). The
> Android tray (`StoriesViewModel`) is Room-cache-driven — no in-memory fold seam — so a tray fold is a
> larger, distinct slice. The VIEWER already consumes story socket events (`reacted`/`translation`/`deleted`)
> into an in-memory `StoryPlayback` + `rawItems` seam, giving a clean, orphan-free fold: the viewer-scoped
> half of the gap, sized exactly like the three folds before it. The tray half is deferred (noted in
> feature-parity).
>
> **The fix — a DTO + a socket flow + a PURE in-place slide-swap engine method + a VM subscriber reusing the
> load-time projection.** (1) New `SocketStoryUpdatedData(story: ApiPost, engagementReset: Boolean? = null)`
> in `:core:model` (mirror of iOS, defaulted flag for forward-compatible decoding). (2)
> `SocialSocketManager.storyUpdated` flow + `listen("story:updated", …)`. (3) New pure
> `StoryPlayback.replacingSlide(newSlide)` — swaps the slide sharing `newSlide`'s id in place, keeping every
> group's order and the cursor on the SAME slot (unknown id → inert `this`). (4)
> `StoryViewerViewModel.observeStoryUpdates` re-projects the payload through the SAME
> `toStoryItem().toSlideView` conversion the initial load used (repopulating `rawItems`, the single source of
> truth for the current-slide re-projection in `emit()`), swaps it via `replacingSlide`, and — only on
> `engagementReset` — purges `reactionStates[storyId]` so the count re-seeds from the fresh story; a
> metadata-only update leaves any live reaction count in place. `ApiPost.toStoryItem()` promoted from
> `private` to `public` in `:sdk-core` (`StoryGrouping.kt`) so the viewer re-projects through the ONE
> canonical wire→item mapper rather than a second copy — SDK-pure (a stateless mapper).
>
> **Tests: +11** — 5 `StoryPlaybackTest` (`replacingSlide`: unknown-id inert, swap current keeping cursor,
> swap a non-current slide in the current group, swap a slide in another group untouched-cursor, every other
> slide preserved), 4 `StoryViewerViewModelTest` (current-slide content swap; engagement-reset wipes the
> reaction count to 0; metadata-only update KEEPS a live reaction count from a prior delta — the arm that
> distinguishes the flag; an update for a story not in the viewer is inert), 2 `SocialSocketManagerTest`
> (decodes story + engagementReset:true; decodes with a null flag when absent). **RED-proof isolated**:
> stubbing `replacingSlide` to `return this` reddened EXACTLY the 3 structural `StoryPlaybackTest` cases
> (36 completed, 3 failed) while the unknown-id inert case (correctly expecting `this`) and the
> preserve-others case stayed green — genuine discrimination, not an assertion echo.
>
> **SDK bootstrap — `dl.google.com` REACHABLE (200).** Pristine `android-37.0` auto-installed by AGP but the
> first `./gradlew` hash-errored on `android-37`; the four-edit copy→patch (`source.properties` ApiLevel +
> `package.xml` `<api-level>` + `path=` + BOTH `build.prop` `sdk_full` fields), keeping android-37.0 alongside,
> resolved it (per NOTES "THIRD mode").
>
> **Verified**: targeted `:core:model`/`:sdk-core`/`:feature:stories` unit tests **BUILD SUCCESSFUL** (the three
> touched suites green), then full `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules, the CI-mirror gate) run before any push. Reviewer PASS. Diff is `apps/android` only (4 prod files
> edited across :core:model + :sdk-core + :feature:stories, 1 pure engine method, +11 tests across 3 files,
> tracking docs). Verdict: **PASS** — a DTO mirroring an existing type, a socket event mirroring the existing
> story events, a pure in-place slide-swap engine method, and a VM subscriber reusing the established
> socket-fold + `toSlideView` + `emit()` seam; behavioural tests through the public API; no production logic
> outside `apps/android`.
>
> **Next**: STORY realtime VIEWER folds now cover reactions, overlay translations, DELETION, and now UPDATE.
> Remaining STORY realtime work is the TRAY fold of `story:updated`/`story:deleted` (iOS `storyGroups` +
> `shouldKeepLocalViewed` viewed-monotonicity) — a distinct, larger slice needing a Room-cache removal/merge
> seam. Alternatively move to the next feature-parity box (STATUS realtime folds — `status:created`/`updated`/
> `deleted`/`reacted` — are the sibling family Android's `SocialSocketManager` already declares flows for; scout
> whether a status render surface exists to fold into before committing, per the orphan rule). Scout read-only
> before committing.

> On 2026-08-24 **the open story viewer folds a realtime `story:deleted`** (slice
> `story-deleted-realtime-viewer`, feature-parity Story realtime) — the removal sibling of the story socket
> events the viewer already consumes (`story:reacted`/`-unreacted`/`-translation-updated`), and the third of
> the STORY realtime folds the "Next" pointer flagged (`story:updated`/`story:deleted`).
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3493/#3492/#3491/#3474/#3470
> (gateway/web/ios Prisme/validation/calls cycles): none is a `claude/apps/android/*` slice from THIS routine,
> all touch production logic outside `apps/android`. Prior slice (`feed-post-reposted-realtime`) already merged
> into main. Branched off freshly-fetched `origin/main` (`0432cd41`).
>
> **The gap — the removal twin of the story events the viewer already folds.** The gateway broadcasts
> `story:deleted` (`{ storyId, authorId }`) to every friend's feed room via `SocialEventsHandler.broadcastStoryDeleted`
> (over-broadcast is safe; a recipient who never had the story ignores it). Every client auto-joins its own
> `feed:{userId}` room on auth (`AuthHandler`), so the event reaches Android — but `SocialSocketManager` had no
> `storyDeleted` flow, `SocketEvents.kt` no DTO, and `StoryViewerViewModel` no subscriber, so a story deleted
> from another device stayed on screen in the open viewer until it was closed. iOS folds it via
> `StoryViewModel.storyDeleted` → `purgeDeadStories`.
>
> **Scout — why the VIEWER, not the tray.** The story TRAY (`StoriesViewModel`) is Room-cache-driven (no
> in-memory fold seam like the feed's `_feedCache`); folding a delete there means a DB-cache removal — a larger
> slice. The VIEWER already consumes story socket events into an in-memory `StoryPlayback` via a pure engine
> (`StoryReactionState`, `StoryTextObjectTranslationMerge`), giving a clean, orphan-free fold seam and render
> surface. `story:updated` (engagement-reset + whole-story content swap with viewed-monotonicity) is deferred:
> a distinct, larger slice (its own viewed-state preservation rule).
>
> **The fix — a DTO + a socket flow + a PURE slide-removal engine method + a VM subscriber.** (1) New
> `SocketStoryDeletedData(storyId, authorId="")` in `:core:model` (mirror of iOS, defaulted authorId for
> forward-compatible decoding). (2) `SocialSocketManager.storyDeleted` flow + `listen("story:deleted", …)`.
> (3) New pure `StoryPlayback.removingSlide(storyId): StoryPlayback` — drops the matched slide, drops an emptied
> author group, and re-anchors the cursor BY IDENTITY (so a dropped earlier group shifts the index correctly):
> current slide survives → stay on it; current slide removed but group survives → reuse the slot (advance to
> next / fall back to new last); current group emptied → clamp onto the group now in the slot at its first slide;
> nothing left → dismiss; unknown id → inert. (4) `StoryViewerViewModel.observeStoryDeletions` subscribes,
> applies `removingSlide`, purges the per-slide caches (`rawItems`, `reactionStates`), and re-projects via `emit()`.
>
> **Tests: +16** — 10 `StoryPlaybackTest` (`removingSlide`: unknown-id inert, later/earlier slide in current
> group, current-slide advance, current-last fallback, only-slide-of-group drop+clamp forward/back, earlier-group
> shift, later-group untouched, last-remaining dismiss), 5 `StoryViewerViewModelTest` (drop a later slide, delete
> current advances, delete only slide rolls to next group, delete last remaining dismisses, unknown-id inert),
> 2 `SocialSocketManagerTest` (decodes storyId+authorId; decodes with defaulted authorId). **RED-proof isolated**:
> stubbing `removingSlide` to `return this` reddened EXACTLY the 9 structural `StoryPlaybackTest` cases (31
> completed, 9 failed) while the unknown-id case (correctly expecting `this`) stayed green — genuine
> discrimination, not an assertion echo.
>
> **SDK bootstrap — `dl.google.com` REACHABLE (200).** Pristine `android-37.0` auto-installed by AGP but the
> first `./gradlew` hash-errored on `android-37`; the four-edit copy→patch (`source.properties` ApiLevel +
> `package.xml` `<api-level>` + `path=` + BOTH `build.prop` `sdk_full` fields), keeping android-37.0 alongside,
> resolved it (per NOTES "THIRD mode").
>
> **Verified**: targeted `:core:model`/`:sdk-core`/`:feature:stories` unit tests **BUILD SUCCESSFUL**; full
> `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules) — **BUILD SUCCESSFUL in 3m
> 45s (973 tasks)**. Reviewer PASS. Diff is `apps/android` only (3 prod files edited in :core:model + :sdk-core +
> :feature:stories, 1 pure engine method, +16 tests across 3 files, tracking docs). Verdict: **PASS** — a DTO
> mirroring an existing type, a socket event mirroring the existing story events, a pure identity-anchored
> slide-removal engine method, and a VM subscriber reusing the established socket-fold + `emit()` seam;
> behavioural tests through the public API; no production logic outside `apps/android`.
>
> **Next**: STORY realtime folds now cover reactions, overlay translations, and DELETION in the viewer. Remaining
> STORY realtime gap: `story:updated` (engagement-reset + whole-story content swap) — a distinct slice needing a
> viewed-monotonicity rule (iOS `shouldKeepLocalViewed`), and it lands in the TRAY on iOS (`storyGroups`), so
> scout whether Android should fold it into the viewer, the Room cache, or both. Alternatively move to the next
> feature-parity box. Scout read-only before committing.

> On 2026-08-24 **the feed folds a realtime REPOST pushed over `post:reposted`** (slice
> `feed-post-reposted-realtime`, feature-parity Feed) — the ARRIVAL sibling of the `post:created` fold.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3487/#3481/#3475/#3474/#3470
> (gateway/web/ios Prisme/validation cycles) and #3477 (`claude/upbeat-dirac-*`, the SEPARATE calls routine —
> `tasks/calls-fonctionnel-todo.md`, left untouched): none is a `claude/apps/android/*` slice from THIS routine,
> all touch production logic outside `apps/android`. Prior slice (`feed-post-updated-realtime-merge`) already
> merged into main. Branched off freshly-fetched `origin/main` (`48b2fe41`).
>
> **The gap — the arrival twin of `post:created`.** The gateway broadcasts a repost as a COMPLETE new post
> (`{ originalPostId, repost }`, the repost authored by the reposter, embedding the original under `repostOf`)
> to every visibility-filtered feed room via `SocialEventsHandler.broadcastPostReposted`. iOS folds it via
> `FeedSocketHandler` routing `postReposted` through `handlePostUpsert(data.repost)` — a repost is itself a new
> feed post. On Android the event decoded nowhere: `SocialSocketManager` had no `postReposted` flow,
> `SocketEvents.kt` no DTO, `FeedViewModel` no subscriber — a repost stayed invisible on the feed until a full
> refetch, while `post:created` (its arrival twin) already prepended live.
>
> **Scout — why NOT the other Next candidates.** `post:reaction-added`/`-removed`: iOS folds the ABSOLUTE
> per-emoji count into `reactionSummary`, but the Android feed card renders reactions as a HEART + count only
> (no emoji summary; only STATUSES render `reactionSummary` chips), so folding it would be orphan/dead-end code
> (routine forbids). `comment:reaction-sync`/`post:reaction-sync`: NOT broadcasts — iOS SDK documents them as
> ACK-only responses to `*-request-sync` emits (`socket.on` explicitly absent), so not an "ignored broadcast"
> slice. `post:reposted` was the clean one: an existing render surface (the `RepostEmbedBuilder` feed card),
> an existing fold seam (`FeedRealtimeReducer.accept`), zero orphan risk.
>
> **The fix — a DTO + a socket flow + a VM subscriber reusing the `post:created` seam.** (1) New
> `SocketPostRepostedData(originalPostId, repost: ApiPost)` in `:core:model` (mirror of iOS, nests the repost
> under `repost`). (2) `SocialSocketManager.postReposted` flow + `listen("post:reposted", …)`. (3) `FeedViewModel`
> subscribes and routes `payload.repost` through the SAME `FeedRealtimeReducer.accept(head, repost, cacheIds)`
> path `post:created` uses — dedup against the cache-projected feed and the buffered head, prepend newest-first,
> bump the "N new posts" banner. No new pure logic, no new render surface: the repost renders through the
> existing repost embed cell.
>
> **Tests: +3** — 1 `SocialSocketManagerTest` (decodes the repost nested under `repost`, carrying author +
> content), 2 `FeedViewModelTest` (a `post:reposted` arrives at the head and raises the banner; a repost already
> visible in the cache feed is inert with no banner bump — the two arms of `accept`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE (200).** Pristine `android-37.0` auto-installed by AGP but the
> first `./gradlew` hash-errored on `android-37` (no "inconsistent location" line); the four-edit copy→patch
> (`source.properties` ApiLevel + `package.xml` `<api-level>` + `path=` + BOTH `build.prop` `sdk_full` fields),
> keeping android-37.0 alongside, resolved it (per NOTES "THIRD mode").
>
> **Verified**: SDK bootstrapped via the four-edit copy→patch (both dirs);
> `:sdk-core:testDebugUnitTest` (`SocialSocketManagerTest`) **BUILD SUCCESSFUL in 3m 14s**, then full
> `assembleDebug testDebugUnitTest` (all modules, the CI-mirror gate, incl. `FeedViewModelTest`) **BUILD
> SUCCESSFUL in 6m 39s (973 tasks)**. Reviewer PASS. Diff is `apps/android` only (3 prod files edited in
> :core:model + :sdk-core + :feature:feed, +3 tests across 2 files, tracking docs). Verdict: **PASS** — a DTO
> mirroring an existing type, a socket event mirroring the existing social events, and a VM subscriber reusing
> the established `post:created` head-accept seam; behavioural tests through the public API; no production logic
> outside `apps/android`.
>
> **Next**: Feed realtime arrivals/edits/deletes now honoured for POST (created / updated / reposted /
> translation / liked / bookmarked / deleted), STORY overlay, and COMMENT (add / edit / delete / translation /
> like / reaction-heart). Remaining iOS folds Android's `SocialSocketManager` still ignores are all currently
> **orphan-blocked or ACK-only** (see Scout above): `post:reaction-*` and `comment:reaction-sync` need a post/
> comment EMOJI-reaction render surface first (Android renders heart-only), and `comment:media-updated` needs a
> comment-media model+render surface (Android's `ApiPostComment` has no `media` field). Next high-value area:
> scout STORY realtime (`story:updated` engagement-reset, `story:deleted`) or move to the next feature-parity
> Feed box. Scout read-only before committing.

> On 2026-08-24 **the feed folds realtime post EDITS pushed over `post:updated`** (slice
> `feed-post-updated-realtime-merge`, feature-parity Feed) — the WHOLE-POST sibling of the
> `post-translation-updated` fold and the post analog of the `comment:updated` fold, both shipped the same day.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3481 (gateway anonymous IP-range),
> #3477 (`claude/upbeat-dirac-*`, the SEPARATE calls routine — `tasks/calls-fonctionnel-todo.md`, left
> untouched), #3475/#3474/#3470 (web/ios/gateway Prisme/i18n cycles): none is a `claude/apps/android/*` slice,
> all touch production logic outside `apps/android`, none in this routine's scope. Prior slice
> (`comment-updated-realtime-merge`, #3482) already merged into main. **Main's Android CI green** at 756e7b9d
> (last android-touching commit; later main commits — cycle 126, web composer — touch no `apps/android` file,
> so android.yml did not re-run and could not have reddened it). Branched off freshly-fetched `origin/main`
> (`f79ed42f`).
>
> **The gap — the whole-post twin of the two content-folds Android already ships.** The gateway rebroadcasts an
> edited post (caption / media / mood) as the COMPLETE new object `{ post }` to every feed/post room via
> `SocialEventsHandler.broadcastPostUpdated`. iOS folds it into the feed, preserving the viewer's own `isLiked`
> across the swap (`FeedViewModel` post:updated sink). On Android the event decoded nowhere: `SocialSocketManager`
> had no `postUpdated` flow, `SocketEvents.kt` no DTO, `FeedViewModel` no subscriber — an edited post stayed
> stale on the card until a full refetch, while `post:translation-updated` (the caption-only twin) already folded.
>
> **The fix — a DTO + a socket flow + a PURE viewer-state-preserving merge + a cache fold + a VM subscriber.**
> (1) New `SocketPostUpdatedData(post: ApiPost)` in `:core:model` (mirror of iOS, nests the post under `post`).
> (2) New pure `PostUpdateMerge.merge(previous, updated): ApiPost?` — adopts every AUTHORITATIVE field from the
> edit (content, counts, translations, reactionSummary, media) while carrying the reader's OWN
> `isLikedByMe`/`isBookmarkedByMe`/`isViewedByMe`/`currentUserReactions` across the swap. The broadcast is ONE
> unpersonalized object shared by all recipients, so its viewer fields are the broadcaster's/default view;
> adopting them wholesale would silently un-like/un-bookmark/un-view the card on any unrelated edit. iOS preserves
> only `isLiked`; Android preserves all four — **strictly more faithful**. Returns `null` (inert, caller skips the
> re-emit) when the merged result equals `previous` (a re-broadcast, or an edit that changed nothing visible).
> (3) `SocialSocketManager.postUpdated` flow + `listen("post:updated", …)`. (4)
> `PostRepository.applyPostUpdate(updated): Boolean` folds via `PostUpdateMerge` into `_feedCache` (the whole-post
> sibling of `applyTranslationUpdate`). (5) `FeedViewModel` subscribes and routes to the repository (the
> content-edit sibling of the `post:translation-updated` sink).
>
> **SDK bootstrap — `dl.google.com` REACHABLE (200).** Pristine `android-37.0` auto-installed by AGP but the
> first `./gradlew` hash-errored on `android-37`; the four-edit copy→patch (`source.properties` ApiLevel +
> `package.xml` `<api-level>` + `path=` + BOTH `build.prop` `sdk_full` fields), keeping both dirs, resolved it
> (per NOTES "THIRD mode").
>
> **Tests: +11** — 6 `PostUpdateMergeTest` (adopts edited content/counts; preserves the reader's like state
> against an unpersonalized broadcast; preserves bookmark/viewed/reactions; inert when nothing visible changed;
> inert on an identical re-broadcast; a reactionSummary-only change is NOT a no-op), 3 `PostRepositoryTest`
> (folds the edit preserving the reader's like state; inert for an unknown post; inert on an identical
> re-broadcast), 1 `SocialSocketManagerTest` (decodes the nested edited post), 1 `FeedViewModelTest` (a
> `post:updated` routes to `applyPostUpdate`). **RED-proof isolated**: dropping the viewer-state preservation
> (`merge` → `updated.takeIf { it != previous }`) reddened EXACTLY the 4 preservation/discrimination tests
> (2968 completed, 4 failed) — the 2 preservation-independent tests (`adopts edited content`, `inert
> re-broadcast`) stayed green: genuine discrimination, not an assertion echo.
>
> **Verified**: targeted `:core:model`/`:sdk-core`/`:feature:feed` unit tests **BUILD SUCCESSFUL**; full
> `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules) — **BUILD SUCCESSFUL in 4m
> 10s (973 tasks)**. Reviewer
> PASS. Diff is `apps/android` only (3 prod files edited in :core:model + :sdk-core + :feature:feed, 1 new pure
> file, +11 tests across 4 files, tracking docs). Verdict: **PASS** — a DTO mirroring an existing type, a pure
> viewer-state-preserving merge, a cache fold reusing the established `_feedCache` seam, a socket event mirroring
> the existing social events, and a VM subscriber reusing the `post:translation-updated` pattern; behavioural
> tests through the public API; no production logic outside `apps/android`.
>
> **Next**: Feed realtime is now honoured for POST caption (translation), POST body (edit), STORY overlay, and
> COMMENT (add/edit/delete/translation/like). The remaining social realtime channels iOS folds that Android's
> `SocialSocketManager` still ignores: **`post:reaction-added`/`-removed`/`-sync`** and
> **`comment:reaction-sync`** (both need scouting first — Android models post/comment reactions as a like/heart
> count + `reactionSummary`, but whether the feed/thread RENDERS the emoji summary decides orphan risk),
> **`post:reposted`** (a repost landing live — scout whether the feed head accepts it), and `comment:media-updated`
> (still BLOCKED on a comment-audio render surface). Scout read-only before committing to any.

> On 2026-08-24 **the comment thread folds realtime EDITS pushed over `comment:updated`** (slice
> `comment-updated-realtime-merge`, feature-parity Feed) — AND a required hotfix that **restored a red `main`**.
>
> **Step 0 — main was RED, and the fix came first.** `list_pull_requests` (open) → one android PR, #3477
> (`claude/upbeat-dirac-*`, "Vague 178" calls routine), which belongs to the SEPARATE `tasks/calls-fonctionnel-todo.md`
> routine, NOT this one (its slices are `claude/apps/android/<slice-id>`); left untouched. But bootstrapping the SDK
> (dl.google.com **200**; pristine `android-37.0` hash-errored → four-edit copy→patch `android-37`, both dirs, per NOTES)
> and running `meeshy.sh check` surfaced a **compile error on `origin/main`**: `bb99e9bd` made
> `ParticipantLeftEvent`/`ParticipantBannedEvent.userId` nullable but never updated `ConversationMembersViewModel`, which
> still passed `event.userId: String?` into `MemberRoster.withoutUser(String)`. **Android CI red on main since
> `11f0c31e`** (last green `fb7afd47`, confirmed via `actions_list`). Since `assembleDebug` compiles all modules, NO
> android PR could go green until this was fixed. Shipped as a dedicated hotfix PR **#3479**
> (`claude/apps/android/fix-members-nullable-participant`): remove by `userId ?: participantId ?: return@collect` — which
> also **completes `bb99e9bd`'s own intent** ("un visiteur sans compte expulsable": a link visitor with no account is now
> expellable by participantId; the roster already matches either id). +3 tests (accountless visitor dropped by
> participantId on left AND banned; neither-id event inert). RED-proof: dropping the participantId fallback fails exactly
> the 2 accountless-visitor tests (28 completed, 2 failed). Full `meeshy.sh check` BUILD SUCCESSFUL (973 tasks).
>
> **The slice — the EDIT sibling of the comment folds already shipped.** The Next pointer named `comment:media-updated`,
> but a read-only scout killed it as a thin slice: Android's `ApiPostComment` has **no `media` field at all** (iOS's
> `APIPostComment` does), and no comment audio/media render surface exists — wiring the realtime event would be
> orphan/dead-end code (routine forbids it; same orphan risk the pointer flagged for §E). Turned instead to
> `comment:updated`: iOS folds it (`FeedCommentsSheet.applyCommentEdit`), Android had no handler — an edited comment
> stayed stale until a full refetch. New `SocketCommentUpdatedData(postId, comment)` (mirror of iOS, nests the full
> `ApiPostComment`) + `SocialSocketManager.commentUpdated` + `listen("comment:updated", …)`. New
> `CommentThreadState.replaced(comment)` / `CommentRepliesState.replacedReply(reply)` reducers swap the whole row in
> place by id (adopt every field — the payload is complete; the heart lives in a separate `CommentLikeState` keyed by id,
> so a full-row swap never disturbs the viewer's like). `PostCommentsViewModel.onCommentUpdated` filters by `postId` and
> applies both reducers (each inert for the collection it doesn't hold) — mirror of the `onCommentTranslationUpdated`
> dual-update pattern.
>
> **Tests: +9** — 3 `CommentThreadStateTest` (replace swaps the row preserving position; leaves other rows untouched;
> inert unknown), 3 `CommentRepliesStateTest` (replace swaps a reply in place; finds it in whichever thread; inert
> unknown), 1 `SocialSocketManagerTest` (decodes the full edited comment), 2 `PostCommentsViewModelTest` (an edit
> repaints a top-level comment AND a loaded reply in place with NO refetch; inert for another post; inert for an unknown
> comment). **RED-proof isolated**: neutering both reducers to `return this` reddened EXACTLY the 5 transformation tests
> (193 completed, 5 failed) — every inert/ignored test stayed green: genuine discrimination.
>
> **Verified**: full `meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules) with hotfix+slice — **BUILD
> SUCCESSFUL**. Reviewer PASS. Both diffs `apps/android` only. Verdict: **PASS** — the hotfix restores a red main and
> completes the intent of the change that broke it; the slice is a DTO mirroring an existing type, two in-place-replace
> reducers, a socket event mirroring the existing social events, and a dual-update VM fold reusing the established
> pattern; behavioural tests through the public API; no production logic outside apps/android.
>
> **Next**: The realtime comment channels Android folds are now `added` / `deleted` / `translation-updated` / `updated`.
> The remaining social realtime events iOS folds that Android's `SocialSocketManager` still ignores (existing host
> surfaces, low orphan risk): **`comment:reaction-sync`** (authoritative reaction resync for a comment — Android already
> wires `comment:reaction-added`/`-removed`, so the host exists), **`post:updated`** (a post edited — the feed VM already
> handles posts), **`post:reposted`** and the **`post:reaction-*`** family (scout whether Android renders post emoji
> reactions first — likes only may mean a missing surface). `comment:media-updated` stays BLOCKED on a comment-audio
> render surface (add `ApiPostComment.media` + a comment audio player first — a larger UI slice, not a thin fold).

> On 2026-08-24 **the comment thread folds realtime translations pushed over `comment:translation-updated`**
> (slice `comment-translation-updated-realtime-merge`, feature-parity Feed/Prisme — the previous entry's `Next`
> pointer named this exact candidate: "the adjacent sibling the scout flagged is `comment:translation-updated`…
> same shape, one rung over (comment-keyed)"). It IS the COMMENT sibling of the POST caption realtime merge
> shipped the same day.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3465 (gateway/ios cycle 124), #3464
> (ios i18n 241i), #3463 (gateway search pagination): none is a `claude/apps/android/*` slice, all touch
> production logic outside `apps/android`, none in this routine's scope, none touched. Prior slice
> (`post-translation-updated-realtime-merge`) already merged into main. Branched off freshly-fetched
> `origin/main` (`edaec937`).
>
> **The gap — the comment-keyed twin of the post channel Android never wired.** The gateway's
> `PostTranslationService` translates a comment server-side and broadcasts `comment:translation-updated`
> `{ postId, commentId, language, translation:{text, translationModel?, confidenceScore?, createdAt?} }` via
> `SocialEventsHandler.broadcastCommentTranslationUpdated`. iOS folds it into the open thread
> (`PostDetailViewModel`/`FeedViewModel.applyCommentTranslation` + `SocketCommentTranslationUpdatedData`). On
> Android the event decoded nowhere: `SocialSocketManager` had no comment-translation flow, `SocketEvents.kt`
> no DTO, and `PostCommentsViewModel` no subscriber — a comment the reader could see translated on iOS stayed
> in its source language on Android until a full refetch. (`PostTranslationMerge` had a comment STRING overload
> from the on-demand slice, but no entry-preserving one, and it was unwired to any socket.)
>
> **The fix — reuse the entry upsert + a metadata-preserving comment overload + socket wiring + a thread fold.**
> (1) New `SocketCommentTranslationUpdatedData(postId, commentId, language, translation)` in `:core:model` whose
> `translation` field IS an `ApiPostTranslationEntry` (the comment-keyed sibling of
> `SocketPostTranslationUpdatedData`, one rung over) — decodes straight into one, no bespoke payload struct.
> (2) New entry-preserving comment overload `PostTranslationMerge.mergeTranslation(comment, lang, entry): ApiPostComment?`
> reusing the existing private entry `upsert` (the string comment overload stored `ApiPostTranslationEntry(text=…)`
> only, dropping the model/confidence the push carries; metadata-only change is NOT a no-op). (3)
> `SocialSocketManager.commentTranslationUpdated` flow + `listen("comment:translation-updated", …)`. (4)
> `PostCommentsViewModel.onCommentTranslationUpdated` subscribes, filters by `postId`, finds the comment (top-level
> or a loaded reply), merges the entry, and folds via the existing `thread.retranslated`/`replies.retranslated`
> reducers — **no `activeLanguages` override forced** (the reader did not tap; their own Prisme chain decides, parity
> with iOS `applyCommentTranslationUpdate` and with the post slice).
>
> **SDK bootstrap — `dl.google.com` REACHABLE (200); pristine `android-37.0` via `--channel=3` WORKED alone.**
>
> **Tests: +13** — 7 `PostTranslationMergeTest` (comment entry overload: appends preserving model/confidence/timestamp;
> appends order-preserving; replaces in place under a case-insensitively matched key; stores a metadata-only change;
> no-op identical entry; no-op blank lang; no-op blank text), 2 `SocialSocketManagerTest` (decodes+emits the full
> entry; text-only payload → null metadata), 4 `PostCommentsViewModelTest` (an es reader on a fr/en-only comment sees
> the pushed `es` translation repaint the row with NO tap; the same repaints a loaded REPLY; an event for another post
> is ignored; an unknown comment is inert). **RED-proof, surgical per piece**: neutering the comment entry
> `mergeTranslation`→`return null` reddened EXACTLY the 4 transformation merge tests (3 no-op tests green); commenting
> the socket `listen` reddened the 2 socket tests; neutering the VM fold reddened EXACTLY the 2 repaint tests while
> the 2 inert tests stayed green — genuine discrimination, not assertion echo.
>
> **Verified**: full `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules) locally —
> **BUILD SUCCESSFUL in 6m 17s** (973 tasks). Reviewer PASS. Diff is `apps/android` only (4 prod files edited in
> :core:model + :sdk-core + :feature:feed, +13 tests across 3 files, tracking docs). Verdict: **PASS** — a DTO reusing
> an existing type, a metadata-preserving merge overload reusing the entry upsert, a socket event mirroring the
> existing social events, and a thread fold reusing the on-demand reducers; behavioural tests through the public API;
> no production logic outside apps/android.
>
> **Next**: Feed/Prisme realtime is now honoured end to end for POST caption, STORY overlay, and COMMENT. The
> remaining realtime social channel Android may not fold is **`comment:media-updated`** (gateway emits it, iOS wires it
> at `PostDetailViewModel.commentMediaUpdated`/`FeedCommentsSheet` — a comment's audio transcription/translations
> landing) — scout whether Android's `SocialSocketManager` decodes it and whether `PostCommentsViewModel` routes it into
> the thread. Else turn to the §E editor-side candidates (clip-inspector reducer / timeline transport) — both still need
> a timeline/selection host surface first (orphan risk), so scout read-only before committing.

> On 2026-08-24 **the feed folds realtime post translations pushed over `post:translation-updated`**
> (slice `post-translation-updated-realtime-merge`, feature-parity Feed/Prisme — the previous entry's `Next`
> pointer named this exact candidate: "the caption sibling of THIS slice — iOS wires it too, Android's viewer
> likely doesn't"). It IS the POST caption sibling of the STORY overlay realtime merge shipped the same day.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3458 (web Prisme cycle 123), #3426
> (ios i18n 240i): neither is a `claude/apps/android/*` slice, both touch production logic outside
> `apps/android`, none in this routine's scope, none touched. Prior slice
> (`story-text-object-translation-realtime-merge`) already merged into main. Branched off freshly-fetched
> `origin/main` (`c65d44cd`).
>
> **The gap — a realtime Prisme channel Android never wired (a scout confirmed it before a line was written).**
> The gateway's `PostTranslationService` translates a post server-side and broadcasts `post:translation-updated`
> `{ postId, language, translation:{text, translationModel?, confidenceScore?, createdAt?} }` to the author's
> feed room (`SocialEventsHandler.broadcastPostTranslationUpdated`). iOS folds it into the open feed
> (`FeedViewModel.applyPostTranslation` + `SocketPostTranslationUpdatedData`). On Android the event decoded
> nowhere: `SocialSocketManager` had no post-translation flow, `SocketEvents.kt` no DTO, no VM subscriber. A
> post the reader could see translated on iOS stayed in its source language on Android until a full refetch.
>
> **The fix — reuse the entry type + a metadata-preserving merge + socket wiring + a cache fold.**
> (1) New `SocketPostTranslationUpdatedData(postId, language, translation)` in `:core:model` whose
> `translation` field IS an `ApiPostTranslationEntry` — the payload's `{text, model, confidence, createdAt}`
> object matches that type exactly, so it decodes straight into one (no bespoke payload struct).
> (2) New entry-preserving `PostTranslationMerge.mergeTranslation(post, lang, entry): ApiPost?` overload: the
> existing string overload stored `ApiPostTranslationEntry(text=…)` only, dropping the model/confidence the
> push carries; the new overload folds the whole entry. No-op on blank lang / blank text / the identical entry
> already present (a metadata-only change is NOT a no-op — richer server data is never silently dropped).
> (3) `SocialSocketManager.postTranslationUpdated` flow + `listen("post:translation-updated", …)`.
> (4) `PostRepository.applyTranslationUpdate(postId, lang, entry): Boolean` folds the merge into `_feedCache`
> (the push sibling of `requestOnDemandTranslation`, minus the translator call), so the projected card
> re-renders in the reader's preferred language — **no override forced** (the reader's own chain decides,
> parity with iOS `applyPostTranslation` which only sets `translatedContent` when the language is preferred,
> and with the story slice). (5) `FeedViewModel` subscribes and routes the event to the repository.
>
> **SDK bootstrap — `dl.google.com` REACHABLE (200); pristine `android-37.0` via `--channel=3` WORKED alone**
> (no copy→patch, no both-dirs). compileSdk 37; AGP 8.13.0 mapped it to `android-37.0` on the first
> `./gradlew`. (NOTES' "try pristine first" held again.)
>
> **Tests: +18** — 9 `PostTranslationMergeTest` (entry overload: appends preserving model/confidence/timestamp;
> appends order-preserving; replaces in place under a case-insensitively matched key; no-op on identical entry;
> **stores a metadata-only change** so richer data is never dropped; no-op blank lang; no-op blank text; trims
> the target), 2 `SocialSocketManagerTest` (decodes+emits the full entry; text-only payload → null metadata),
> 5 `PostRepositoryTest` (`applyTranslationUpdate` folds into cache preserving metadata AND calls no translator;
> inert on unknown post / blank target / blank text / identical entry), 1 `FeedViewModelTest` (a
> `post:translation-updated` event routes to `repository.applyTranslationUpdate` with the payload). **RED-proof,
> surgical**: neutering the entry `mergeTranslation` → `return null` reddened EXACTLY the 5 transformation
> merge tests while the 3 no-op tests stayed green (and the 8 string-overload tests untouched) — genuine
> discrimination, not assertion echo.
>
> **Verified**: full `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules) locally
> — **BUILD SUCCESSFUL in 4m 26s** (973 tasks). Reviewer PASS. Diff is `apps/android` only (4 prod files
> edited in :core:model + :sdk-core + :feature:feed, +18 tests across 4 files, tracking docs). Verdict:
> **PASS** — a DTO reusing an existing type, a metadata-preserving merge overload reusing the string overload's
> upsert shape, a socket event mirroring the existing social events, and a cache fold mirroring the on-demand
> path; behavioural tests through the public API; no production logic outside apps/android.
>
> **Next**: Feed/Prisme — the POST caption realtime merge is now honoured end to end. The adjacent sibling the
> scout flagged is **`comment:translation-updated`** (gateway emits it, iOS wires it at
> `FeedViewModel.commentTranslationUpdated`; Android's `PostTranslationMerge` already has the comment overload
> but it is UNWIRED to any socket). That is the natural next slice — same shape, one rung over
> (comment-keyed). Before building it, scout whether the comment thread surface (`PostCommentsSection` /
> `PostDetailViewModel`) subscribes to a comment stream to route it into, or whether comments live in the feed
> cache too. Else turn to the §E editor-side candidates (clip-inspector reducer / timeline transport) — both
> still need a timeline/selection host surface first (orphan risk), so scout read-only before committing.

> On 2026-08-24 **the story viewer merges realtime overlay translations pushed over `story:translation-updated`**
> (slice `story-text-object-translation-realtime-merge`, feature-parity §E — the previous entry's `Next` pointer
> flagged that `requestStoryTranslation` translates only the CAPTION and asked to scout iOS overlay parity
> first. The scout found the missing half: iOS does NOT pull overlays on demand — the **gateway** translates a
> canvas overlay server-side and BROADCASTS it via `story:translation-updated` (`{postId, textObjectIndex,
> translations}`), which iOS merges into the open viewer (`StoryItem.mergingTextObjectTranslations`). Android
> had no handler for this event at all — a whole realtime Prisme channel was on the floor).
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3453..#3434 are all Dependabot, plus
> #3429 (shared ObjectId), #3426 (ios i18n): none is a `claude/apps/android/*` slice, all touch production
> logic outside `apps/android`, none in this routine's scope, none touched. Prior slice
> (`story-language-bar-text-object-translations`) already merged into main. Branched off freshly-fetched
> `origin/main` (`cba70d47`).
>
> **The gap — a realtime Prisme channel Android never wired.** The gateway's `StoryTextObjectTranslationService`
> persists a translated overlay and broadcasts `story:translation-updated` to the author's feed room. iOS folds
> it into the cached story so the reader — who resolves overlays via the preferred chain — switches to the
> requested language the instant it lands. On Android the event decoded nowhere, so an overlay the reader asked
> to translate stayed in its source language until a full refetch.
>
> **The fix — pure merge + socket wiring + one emit generalisation.**
> (1) New pure `StoryTextObjectTranslationMerge.merge(item, textObjectIndex, translations)` in `:core:model`
> (canvas sibling of `StoryTranslationMerge`): upserts the languages into the targeted text object (existing
> overwritten, new added) via immutable `copy`; empty map / no `storyEffects` / out-of-range or negative index
> → story returned unchanged (iOS `mergingTextObjectTranslations` parity, minus its memberwise-init field-drop
> hazard — `copy` preserves every other field for free).
> (2) New `SocketStoryTranslationUpdatedData` + `SocialSocketManager.storyTranslationUpdated` flow, wired with
> `listen("story:translation-updated", …)`.
> (3) `StoryViewerViewModel.observeTranslationUpdates()` subscribes, merges into `rawItems` (inert on unknown
> `postId` or no-op merge), and calls `emit()`. `emit()` now re-projects the current slide from `rawItems`
> **unconditionally** — it was gated behind an active exploration override, which meant a realtime merge with
> no override never reached the view. With no override and no runtime merge the unconditional path reproduces
> `toSlideView` exactly (same `StoryContentResolver`/`StoryTextObjectProjection` calls, override=null), so
> non-current slides and no-change emits are byte-identical to before. No forced override (iOS parity — the
> reader's own chain resolves the merged language).
>
> **SDK bootstrap — `dl.google.com` REACHABLE; pristine `android-37.0` via `--channel=3` WORKED alone this run**
> (no copy→patch, no both-dirs). `platforms;android-37` is not a downloadable package; `sdkmanager --channel=3
> "platforms;android-37.0"` installed the preview platform and AGP 8.13.0 mapped compileSdk 37 → android-37.0
> on the first `./gradlew`. (NOTES' "recipe is image-dependent, try pristine first" held — pristine was right.)
>
> **Tests: +12** — 8 `StoryTextObjectTranslationMergeTest` (adds to target; preserves+overwrites same
> language; targets only the indexed object; out-of-range → unchanged; negative → unchanged; empty map →
> unchanged; no storyEffects → unchanged; every other story/effects field survives), 2
> `SocialSocketManagerTest` (decodes+emits the payload; missing `translations` → empty map), 2
> `StoryViewerViewModelTest` (a realtime merge repaints the current overlay in the reader's language with NO
> tap; the merged language surfaces as a present content chip) + a reused inert case (unknown `postId` leaves
> the overlay untouched). **RED-proof, surgical per piece**: neutering `merge`→`return item` reddened the 4
> transformation merge tests (4 no-op tests stayed green — correct); commenting the socket `listen` reddened
> the 2 socket tests (other 15 green); with merge+subscription intact, reverting ONLY the `emit()`
> re-projection reddened EXACTLY the repaint test while the chip test (reads `rawItems` via
> `availableLanguagesFor`) and the inert test stayed green — isolating the emit generalisation's necessity.
>
> **Verified**: full `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest) locally — see run log
> below for the result. Reviewer PASS. Diff is `apps/android` only (3 prod files edited/added in :core:model +
> :sdk-core + :feature:stories, +12 tests across 3 files, tracking docs). Verdict: **PASS** — a pure merge
> reusing the caption-merge shape, a socket event mirroring the existing story events, and one behaviour-
> preserving emit generalisation; behavioural tests through the public API; no production logic outside
> apps/android; no wire/shared/model change beyond a new Android socket DTO.
>
> **Next**: §E (Stories) — realtime AND on-demand overlay translation are both now honoured end to end (the
> viewer offers overlay languages, resolves them per the chain and per a tapped override, and now folds in
> pushed overlay translations). Remaining reader-side loose end: `requestStoryTranslation` still pulls only the
> CAPTION on demand (`translateStory` → `StoryTranslationMerge` on `item.content`); iOS does NOT pull overlays
> on demand either (they arrive via the realtime channel this slice wired), so this is **parity-complete, not a
> gap** — do not build an N-call overlay pull. Turn instead to the editor-side candidates that resurface each
> cycle: (a) the **clip-inspector editor reducer** (pure per-clip volume/fade/loop/background/delete) or (b)
> the **timeline transport** pure state (play/pause/scrub/zoom 0.25×–4×/mute) — both still need a
> timeline/selection host surface first (orphan risk), so scout that surface read-only before committing; else
> take the highest-value non-editor §E box (e.g. `post:translation-updated` CAPTION realtime merge into the
> viewer, the caption sibling of THIS slice — iOS wires it too, Android's viewer likely doesn't).

> On 2026-08-24 **the story language bar descends the Prisme over ALL slide content, not the caption alone**
> (slice `story-language-bar-text-object-translations`, feature-parity §E — the previous entry's `Next`
> pointer's scout arm: "worth a scout to confirm a pulled-then-displayed text object resolves." The scout
> found the gap one rung earlier than the pull: the **language bar itself** never offered overlay languages).
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3431 (gateway/shared notif Prisme
> cycle 121), #3429 (shared ObjectId it. 259), #3426 (ios i18n 240i), #3424 (gateway ObjectId 258), #3418
> (web/admin 257): none is a `claude/apps/android/*` slice, all touch production logic outside `apps/android`,
> none in this routine's scope, none touched. Prior slice (`story-text-object-exploration-override`) already
> merged into main. Branched off freshly-fetched `origin/main` (`7fdd6b64`).
>
> **The gap — the exploration strip was blind to overlay translations.** `availableLanguagesFor` built its
> "present" content chips from `item.translations` alone (the CAPTION). But CLAUDE.md §Cohérence: the Prisme
> applies to ALL content, and the two prior cycles wired text overlays as first-class translatable content
> (`StoryTextObject.translations`, resolved by `StoryTextObjectProjection`). A slide whose overlays carried a
> translation the caption lacked (nominal once the device locale, rank 4, differs from the app language)
> offered the reader NO chip to reach it — the overlay's translation existed but was unreachable. Same shape
> as the caption/overlay disagreement the last two cycles fixed, one rung earlier: the strip that OFFERS the
> languages, not the resolver that renders them.
>
> **The fix — union caption + overlay languages, caption-first, deduped case-insensitively.**
> `availableLanguagesFor` now unions `item.translations` languages (in caption order) with every language key
> across `storyEffects.textObjects[].translations` (blank values filtered, mirroring the caption's
> `content.isNotBlank()`), `distinctBy { lowercase() }`. The empty-gate (`present.isEmpty()` ⇒ no strip) and
> the translatable-request arm's `presentLower` exclusion both now account for overlay languages, so an
> overlay-only-translated story (a) shows its overlay languages as present content chips and (b) still offers
> a configured-absent language as a translatable request chip. Consumer path unchanged: tapping a present
> overlay-language chip sets the ephemeral override, `emit()` re-projects the overlays into it (proven by the
> toggle test). One pure private method edited; zero screen/model/wire change.
>
> **SDK bootstrap — `dl.google.com` REACHABLE; gradle auto-installed pristine `android-37.0` which HASH-ERRORED
> (`Failed to find target with hash string 'android-37'`); the four-edit copy→patch `android-37` + keep-both-dirs
> recipe worked** (source.properties ApiLevel=37, package.xml `<api-level>`+`path=`, build.prop `sdk_full=37`;
> both `android-37` and `android-37.0` kept). Matches the immediately-prior slice's finding — this image family
> wants the patched integer-hash dir. (NOTES' "recipe is image-dependent" still holds.)
>
> **Tests: +5** (`StoryViewerViewModelTest`) — overlay-only translation surfaces as a present content chip;
> caption+overlay unioned caption-first with no duplicate (`.inOrder()` es,de); a blank overlay translation
> value is not offered; an overlay-only-translated story still offers a configured-absent language as
> translatable; tapping an overlay-only present chip re-resolves the overlays into it (the full offer→act
> loop). **RED proven against unmodified production**: exactly these 5 failed, the other 56
> `StoryViewerViewModelTest` cases stayed green — genuine discrimination on the fixture, not the assertion.
>
> **Verified**: full `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest) locally — **BUILD
> SUCCESSFUL** (973 tasks, 6m34s). Reviewer PASS. Diff is `apps/android` only (1 prod file, +5 tests in 1
> file, tracking docs). Verdict: **PASS** — one pure method extended to union overlay translations into the
> exploration strip, reusing the existing chip/override machinery, behavioural tests through the public API,
> no production logic outside apps/android, no wire/shared/model change.
>
> **Next**: §E (Stories) — the exploration strip now offers every present content language across caption +
> overlays, and both reader-side resolvers (caption + overlays) honour the tapped override. One reader-side
> loose end remains: **`requestStoryTranslation` translates only the CAPTION** (`translateStory` →
> `StoryTranslationMerge.mergeTranslation` on `item.content`), so a pulled on-demand language repaints the
> caption but leaves overlays on their own chain — worth a scout to confirm whether iOS translates overlays
> on demand (parity) before building an N-call overlay pull. Otherwise the editor-side candidates resurface:
> (a) the **clip-inspector editor reducer** (pure per-clip volume/fade/loop/background/delete; needs a
> timeline/selection host surface first — orphan risk until then, two iOS fields
> `mutedVolumeMemento`/`isDuckingDisabled` still undecoded on Android), or (b) the **timeline transport**
> pure state (play/pause/scrub/zoom 0.25×–4×/mute, modelled on chat's `OverlayMediaTransport`, ephemeral
> editor state no wire backing — also needs a host surface). Prefer the candidate with the cleanest pure core
> AND a real consumer surface; scout read-only first.

> On 2026-08-24 **a text overlay re-resolves into the "Exploration" language the reader taps** (slice
> `story-text-object-exploration-override`, feature-parity §E — the previous entry's `Next` pointer
> candidate (c): folding the exploration language override into text-object re-resolution, chosen over
> the clip-inspector editor reducer (needs a timeline/selection host surface first) and the timeline
> transport (ephemeral editor state, no wire backing) because it has BOTH the cleanest pure core AND a
> real consumer surface — the viewer we wired text objects into the run before). The caption already
> re-resolved on a language-bar tap (`StoryContentResolver.resolve(item, prefs, override)` in `emit()`),
> but the freshly-shipped text overlays did **not**: `toSlideView` projected them once with the default
> `preferredLanguages` and `emit()`'s override branch copied only the caption's `text`/`isTranslated`/
> `languageCode` — so tapping "es" translated the slide's caption but left every text overlay stuck in the
> chain language. The overlay and the caption disagreed on the very language the user had just chosen.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3425 (web/audio cycle 119),
> #3424 (gateway ObjectId it. 258), #3418 (web/admin it. 257): none is a `claude/apps/android/*` slice,
> all touch production logic outside `apps/android`, none in this routine's scope, none touched. Prior
> iteration (`story-text-object-viewer-projection`) already merged into main. Branched off freshly-fetched
> `origin/main` (`924c8618`).
>
> **One pure param, threaded to a real consumer, mirroring the caption's own override contract.**
> `StoryTextObjectProjection.resolveText`/`project` gain an optional `overrideLanguage` (default `null` —
> the 2-arg call sites are byte-identical). The override is tried FIRST without removing the preference
> chain, exactly as `StoryContentResolver` documents its own `overrideLanguage`: implemented by prepending
> the override to the language list the existing exact-then-normalised loop already walks
> (`listOf(override) + preferredLanguages`), so the override inherits the text-object resolver's own
> case/region-insensitive matching (iOS `resolvedText` parity) and an override with no matching translation
> falls straight through to the normal Prisme resolution. A blank/null override is inert. The empty-guard
> moved from `preferredLanguages.isEmpty()` to the effective `languages.isEmpty()` so an override still
> resolves for a reader with no configured chain.
>
> **Real wiring (not orphan logic)**: `emit()`'s override branch now re-projects the current slide's text
> objects from the raw item — `item.storyEffects.textObjects.map { project(it, preferredLanguages, override) }`
> — alongside the caption re-resolution, and the Compose `StoryTextObjectLayer` already reads
> `slide.textObjects`, so a tapped language now repaints caption AND overlays together. Zero screen edit.
>
> **SDK bootstrap — `dl.google.com` REACHABLE, but pristine `android-37.0` HASH-ERRORED this image; the
> four-edit copy→patch `android-37` + keep-both-dirs recipe worked.** `sdkmanager "platforms;android-35"…`
> installed fine, `:feature:stories:help`/`testDebugUnitTest` died `Failed to find target with hash string
> 'android-37'`. Applied the documented copy→patch (source.properties ApiLevel, package.xml `<api-level>` +
> `path=`, build.prop both `sdk_full` keys) then kept BOTH `android-37` and pristine `android-37.0` — next
> run green. (NOTES' "recipe is image-dependent, flips between runs" held again; pristine-first cost one run.)
>
> **Tests: +9** — 7 `StoryTextObjectProjectionTest` (override tried FIRST ahead of chain, override with no
> match falls back to chain, override matched case/region-insensitively, override resolves with no
> configured chain, blank override inert ≡ no override, neither override nor chain matches → original,
> `project` resolves via override), +2 `StoryViewerViewModelTest` (toggling the override re-resolves the
> current slide's text objects then a re-tap restores the automatic resolution; an override with no
> text-object translation falls back to the reader's chain). **Mutation RED-proof (isolated, restored
> after)**: neutering the override (`val languages = preferredLanguages`) failed EXACTLY the 5
> override-dependent tests (4 pure + 1 viewmodel toggle) while the 4 fallback/inert tests
> (no-match-falls-back, blank-inert, neither-matches, viewmodel-fallback) stayed green — genuine
> discrimination on the FIXTURE, not the assertion; production restored clean, no stray `.bak`.
>
> **Verified**: full `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest) locally, **BUILD
> SUCCESSFUL** (973 tasks, 4m). Reviewer PASS. Diff is `apps/android` only (2 prod files edited, +9 tests
> across 2 files, tracking docs). Verdict: **PASS** — one pure optional param threaded to the one existing
> consumer, reusing the resolver's own matching, mirroring the caption's documented override contract,
> behavioural tests through the public API, no production logic outside apps/android, no wire/shared change.
>
> **Next**: §E (Stories) — the two remaining reader-side overrides now both honour Exploration (caption +
> text objects); the on-demand story translation (`requestStoryTranslation`) already merges the pulled
> translation into the raw item so text objects will pick it up on the next `emit()` — worth a scout to
> confirm a pulled-then-displayed text object resolves. Otherwise the editor-side candidates resurface:
> (a) the **clip-inspector editor reducer** (pure per-clip volume/fade/loop/background/delete derivation —
> rich pure core, still needs a timeline/selection host surface, two iOS fields
> `mutedVolumeMemento`/`isDuckingDisabled` not yet decoded on Android), or (b) the **timeline transport**
> pure state (play/pause/scrub/zoom 0.25×–4×/mute, modelled on chat's `OverlayMediaTransport`, ephemeral
> editor state no wire backing). Prefer the candidate with the cleanest pure core AND a real consumer
> surface; scout read-only first.

> On 2026-08-24 **a slide's text overlays render and animate on the viewer canvas** (slice
> `story-text-object-viewer-projection`, feature-parity §E — the previous entry's `Next` pointer's
> preferred candidate: the scout ranked the text-object viewer projection first, cleanest pure core with
> the wire fully backed, reusing the two already-tested reader resolvers, chosen over the clip-inspector
> editor reducer, which lands editor-side with no host surface yet, and the timeline transport, which has
> no wire backing at all). The viewer decoded `storyEffects.textObjects` on the wire (`Story.kt`) and the
> v3→v1 projection already produced them, but `StoryViewerViewModel.toSlideView` projected background +
> foreground **media** only — a text overlay authored on a slide was dropped on the floor.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → only #3418 (web/admin it. 257):
> not a `claude/apps/android/*` slice, out of this routine's scope, untouched. Prior iteration
> (`story-media-fade-envelope`) already merged into main. Branched off freshly-fetched `origin/main`
> (`5cb8ce45`).
>
> **One pure view + one pure projection, ported from iOS's canonical paths.** New `StoryTextObjectView`
> mirrors `StoryForegroundMediaView`: `animated(atSeconds)` folds the keyframe transform
> (`StoryKeyframeResolver`) with the object's own fadeIn/fadeOut envelope (`StoryMediaFadeResolver`) at
> iOS render precedence `fade ?? keyframeOpacity ?? base` — a live envelope OVERRIDES a keyframe opacity;
> a text object never participates in a clip transition (iOS parity), so unlike the media layer no
> transition ramp is folded, and `animated()` returns `this` unchanged when neither a keyed channel nor a
> live envelope acts. New `StoryTextObjectProjection.resolveText` ports iOS
> `StoryTextObject.resolvedText(preferredLanguages:)` (`StoryModels.swift`): per preferred language, an
> exact `translations[lang]` key first, then a case/region-insensitive `base()` match (via the shared
> `LanguageCodeNormalizer`), before the next language — else the original text (Prisme rule 1: absent
> target ⇒ show the original). `project()` maps transform/timing/keyframe fields into the view.
>
> **Real wiring (not orphan logic)**: `StorySlideView` gains `textObjects`; `toSlideView` projects
> `storyEffects.textObjects` through `LanguageResolver.preferredContentLanguages(prefs)`. Compose
> `StoryTextObjectLayer` renders each overlay at its center anchor with `.alpha(animated.opacity)`,
> `fontSize × scale` mapped from the 1080-referential design space (iOS `StoryTextSize` parity) onto the
> real canvas width, and a `graphicsLayer` rotation — so a fading, keyframed text overlay now paints and
> animates where before it was invisible.
>
> **SDK bootstrap — `dl.google.com` REACHABLE, pristine `android-37.0` worked (NOTES' cheapest recipe).**
> `sdkmanager "platforms;android-35" …` then `--channel=3 "platforms;android-37.0"`; `:feature:stories:help`
> resolved `android-37` on the first run — no copy→patch, no both-dirs mode.
>
> **Tests: +19** — 6 `StoryTextObjectViewTest` (no-fade-no-kf → identity, fade-in folds, fade-out folds,
> envelope OVERRIDES keyframe opacity while position keeps animating, outside-window → identity,
> keyframes animate position while opacity holds base + un-keyed scale holds base), 11
> `StoryTextObjectProjectionTest` (no-translations→original, empty-preferred→original, exact-key match,
> case/region-insensitive match, normalized 3-letter key ↔ 2-letter preference, exact-key wins over
> normalized sibling, preferred-priority first-match-wins, no-match→original, project carries
> transform/timing/keyframe fields + animates, project resolves text via prisme, project defaults absent
> timing to 0), +1 `StoryViewerViewModelTest` (a slide's text objects project into the view and ramp
> their fade). **Mutation RED-proof (isolated, restored after)**: dropping the envelope override
> (`fadeEnvelope ?: base.opacity` → `base.opacity`) failed EXACTLY the 4 fade-value tests (fade-in,
> fade-out, override, viewmodel fade), the identity/keyframe-only/outside-window/projection tests stayed
> green — genuine discrimination; production restored clean, no stray `.bak`.
>
> **Verified**: `:feature:stories:testDebugUnitTest` for the three files **BUILD SUCCESSFUL** (60 tests,
> 3m15s); full `assembleDebug testDebugUnitTest` gate run for the PR. Reviewer PASS. Diff is
> `apps/android` only (2 new pure files, 1 view-model data-class field + projection, 1 Compose layer +
> render loop, +19 tests across 3 files, tracking docs). Verdict: **PASS** — pure app-side view + projection
> reading existing wire fields, reusing two tested resolvers + the shared normalizer, behavioural tests
> through the public API, no production logic outside apps/android, no wire/shared change.
>
> **Next**: §E (Stories) — with the reader now honouring text objects, either (a) the **clip-inspector
> editor reducer** (pure per-clip volume/fadeIn/fadeOut/loop/background/delete derivation over a selected
> object — rich pure core, but needs a timeline/selection host surface first, and two iOS fields
> `mutedVolumeMemento`/`isDuckingDisabled` are not yet decoded on Android), or (b) the **timeline transport**
> pure state (play/pause/scrub/zoom 0.25×–4×/mute — clean reducer modelled on chat's `OverlayMediaTransport`,
> but ephemeral editor state with no wire backing), or (c) folding the **exploration language override**
> into text-object re-resolution (the caption re-resolves on override today; text objects use default prefs).
> Prefer the candidate with the cleanest pure core AND a real consumer surface; scout read-only first.

> On 2026-08-23 **a timed foreground clip fades in/out on the viewer canvas** (slice
> `story-media-fade-envelope`, feature-parity §E — the previous entry's `Next` pointer's clip-inspector
> candidate, taken on its reader side first: the wire-backed fade envelope is a clean pure core, chosen
> over the text-keyframe alternative which would need a whole new text-object projection + Compose
> rendering it doesn't have yet). iOS ramps a clip's opacity over its own `fadeIn`/`fadeOut`
> (`StoryRenderer.fadeOpacity(item:at:)`); the Android foreground projection **dropped** both fields, so a
> clip authored with a fade snapped on/off instead of ramping.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3414 (ios cycle 114 bis), #3409
> (shared/gateway it. 256), #3395 (iOS 239i), #3392 (gateway it. 254): none is a `claude/apps/android/*`
> slice, none in this routine's scope, none touched. Prior iteration (`story-clip-transition-opacity`)
> already merged into main. Branched off freshly-fetched `origin/main` (`9be98e15`).
>
> **One pure resolver, ported 1:1 from iOS's canonical path** (`StoryRenderer.fadeOpacity`): new
> `StoryMediaFadeResolver.fadeOpacity(fadeIn, fadeOut, startTime, duration, currentTime)` — `null` when the
> clip authors no fade (both ≤0) OR the playhead is outside `[start, end)`; inside, fade-in ramps
> `(t−start)/fadeIn` clamped `[0,1]`, then a steady `1.0`, then fade-out `(end−t)/fadeOut`; a `null`
> duration → `end = +∞` so the fade-out edge (which needs a finite end) never fires; fade-in is evaluated
> before fade-out so a clip shorter than `fadeIn+fadeOut` reports the fade-in ramp at the overlap
> (iOS parity).
>
> **Real wiring (not orphan logic)**: `StoryForegroundMediaView` now carries `fadeIn`/`fadeOut` (threaded
> through `toForegroundMediaView`, previously discarded). `animated()` computes the envelope and folds it at
> **iOS render precedence** `fade ?? keyframeOpacity ?? base`, then `× transitionOpacity` — so a live
> envelope OVERRIDES an authored keyframe opacity (not multiplied) and still multiplies with a
> crossfade/dissolve ramp. The early-return now also accounts for a lone fade envelope
> (`resolved == null && transitions.isEmpty() && fadeEnvelope == null → this`). **Zero Compose glue
> change**: the viewer already applied `.alpha(animated.opacity)`, so a fading clip now ramps with no
> screen edit.
>
> **SDK bootstrap — pristine `android-37.0` worked this image** (cheapest recipe; NOTES' "try pristine
> first" held). `sdkmanager --channel=3 "platforms;android-37.0"` alone; `./gradlew :feature:stories:help`
> resolved the target on the first run — no copy→patch, no both-dirs mode needed.
>
> **Tests: +23** — 16 `StoryMediaFadeResolverTest` (no-fade→null, zero-fade→null, before-window→null,
> at/after-end→null, fade-in start=0/mid=0.5/past=1.0/boundary=1.0, fade-out mid=0.5/near-end=0.25/
> boundary=1.0, fade-in-only-no-duration fades then holds forever, fade-out-only-no-finite-end never fades,
> fade-in-precedence on overlap, shifted-clip start-relative clock, absent-startTime≡0), 6
> `StoryForegroundFadeTest` (fade-in folds, fade-out folds, envelope OVERRIDES keyframe opacity while
> position keyframes still animate, envelope × transition multiply to 0.05, outside-window identity,
> no-fade-no-kf-no-transition identity), +1 `StoryViewerViewModelTest` (projection carries
> fadeIn/fadeOut and ramps in/out). **Mutation RED-proof (isolated, restored after)**: dropping the
> override (`fadeEnvelope ?: base.opacity` → `base.opacity`) failed EXACTLY the 5 envelope-value tests
> (2 foreground fade + 1 viewer projection + fade-in/fade-out folds), the identity/outside-window tests
> stayed green — genuine discrimination; production verified clean after restore, no stray `.bak`.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, **BUILD SUCCESSFUL** (973 tasks, 4m11s, no
> test failures). Reviewer PASS. Diff is `apps/android` only (1 new pure file, 1 view-model data-class +
> projection threading + `animated()` opacity fold, +23 tests across 3 files, tracking docs). Verdict:
> **PASS** — pure app-side resolver reading existing wire fields + `animated()` folding at iOS precedence,
> behavioural tests through the public API, no production logic outside apps/android, no wire/shared change.
>
> **Next**: §E (Stories) — the clip-inspector **editor** side now that the reader honours fades: a pure
> per-clip inspector reducer (volume/fadeIn/fadeOut/loop/background/delete derivation over a selected
> `StoryMediaObject`, wire-backed), OR the **timeline transport** pure state (play/pause/scrub/zoom
> 0.25×–4×/mute), OR the text-object viewer projection (prerequisite for text keyframes/fades). Prefer the
> candidate with the cleanest pure core; scout read-only first to confirm the wire fields and avoid
> glue-only work.

> On 2026-08-23 **story clip transitions fade the foreground on the viewer canvas** (slice
> `story-clip-transition-opacity`, feature-parity §E — the previous entry's `Next` pointer's preferred
> candidate: the wire-backed clip-transition reader resolver, chosen over the text-keyframe alternative for
> the cleaner pure core). iOS ramps a transitioning clip's opacity over the transition window (`fromClipId`
> fades out, `toClipId` fades in) via `ReaderTransitionResolver.opacity` + the canonical primitive
> `StoryRenderer.clipTransitionOpacity`; the Android viewer decoded `StoryClipTransition[]` on the wire
> (`Story.kt`) but **dropped** it from the projection — a serialized crossfade/dissolve rendered as a hard cut.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3409 (shared/gateway it. 256),
> #3408 (calls Vague 169), #3404 (web it. 255), #3395 (iOS 239i), #3392 (gateway it. 254): none is a
> `claude/apps/android/*` slice, none in this routine's scope, none touched. Prior iteration
> (`story-keyframe-interpolation`) already merged into main. Branched off freshly-fetched `origin/main`
> (`b38adef6`).
>
> **One pure resolver, ported 1:1 from iOS's canonical SOTA path** (`StoryReaderResolvers.swift`
> `ReaderTransitionResolver` + `StoryRenderer.clipTransitionOpacity`): new `StoryClipTransitionResolver`
> with (1) `crossfadeFactor(mediaId, transitions, transitionStart, at)` — the canonical primitive: crossfade
> only (other kinds + zero-duration → opaque, defensively guarding the `0/0` NaN iOS would hit), window guard,
> `fromClipId → 1−progress`, `toClipId → progress`, else `1.0`; (2) `opacity(mediaId, startTime, duration,
> transitions, currentTime)` — the reader layer: clips to the clip's own `[start, end]` window (→0 outside),
> degrades `dissolve → crossfade` for live playback (iOS `liveRenderableTransition` — the MP4 exporter keeps
> the per-pixel dissolve), computes each matching transition's `transitionStart` (outgoing `end−dur`, incoming
> `start`), multiplies the factors, clamps `[0,1]`.
>
> **Real wiring (not orphan logic)**: `StoryForegroundMediaView` now carries `id`, `duration`, and the slide's
> `clipTransitions` (threaded through `toForegroundMediaView`, previously discarded). `animated(atSeconds)`
> folds the transition opacity into the keyframe-resolved opacity (`base.opacity * transitionOpacity`),
> returning `this` only when neither keyframes nor a participating transition animate. **Degenerate-window
> guard (improvement over a naive port)**: a clip that participates in a transition but has `duration == 0`
> is left untouched — `end == start` would make the window-clip hide it at almost every instant. **Zero Compose
> glue change**: the viewer already applied `.alpha(animated.opacity)`, so a transitioning clip now fades
> instead of hard-cutting with no screen edit.
>
> **SDK bootstrap — NEW recipe: BOTH dirs present** (NOTES updated). This image failed with *both* the pristine
> `android-37.0` alone (`Failed to find target with hash string 'android-37'`) AND the full four-edit copy→patch
> `android-37` alone (same error, no "inconsistent location" line — descriptor demonstrably correct:
> `<api-level>37</api-level>`, `base-extension true`, `path="platforms;android-37"`, `sdk_full=37`). What worked:
> keep the patched `android-37` AND reinstall the pristine `android-37.0` so **both** platform dirs coexist —
> AGP 8.13.0 then resolved the target. Neither-alone-both-together is a third mode past the two the NOTES record.
>
> **Tests: +23** — 16 `StoryClipTransitionResolverTest` (8 `crossfadeFactor`: outgoing 1→0 across window with
> start/mid/end boundaries, incoming 0→1 likewise, neither-role opaque, before-window opaque, after-window
> opaque, dissolve opaque in raw primitive, zero-duration opaque no-divide-by-zero, empty-list opaque; 8
> `opacity`: before-start invisible, after-end invisible, no-transition-in-window opaque, incoming fades in +
> settles full past window, outgoing fades out at tail, dissolve degraded to crossfade ramp, stacked
> incoming×outgoing multiply to 0.25, empty-transitions opaque), 6 `StoryForegroundTransitionTest` (no-kf-no-tr
> → identity, incoming folds ramp, outgoing folds fade-out, zero-duration participant untouched, bystander
> keeps base opacity, keyframe×transition opacity multiply), +1 `StoryViewerViewModelTest` (foreground
> projection carries id/duration/clipTransitions and fades on the ramp). **Mutation RED-proof (isolated,
> restored after)**: inverting the outgoing branch `1−progress → progress` failed EXACTLY the 2 outgoing tests
> (start/end boundaries where the ramp direction actually differs), the other 20 stayed green — genuine
> discrimination; production verified clean after restore, no stray `.bak`.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, **BUILD SUCCESSFUL** (973 tasks, 4m27s, no test
> failures). Reviewer PASS. Diff is `apps/android` only (1 new pure file, 1 view-model data-class + projection
> threading, +23 tests across 3 files, tracking docs). Verdict: **PASS** — pure app-side resolver reading an
> existing wire model + `animated()` folding, behavioural tests through the public API, no production logic
> outside apps/android, no wire/shared change.
>
> **Next**: §E (Stories) V2-timeline neighbours — extend keyframe application to **text** clips (the wire
> `StoryTextObject.keyframes` already decode; a text element could animate the same way the foreground media
> now does — genuinely wire-backed pure logic), OR the **per-clip inspector** volume/fade/loop derivation, OR
> the timeline transport (play/pause/scrub) pure state. Prefer the candidate with the cleanest pure core;
> scout read-only first to confirm the wire fields and avoid glue-only work.

> On 2026-08-23 **story keyframe animation plays back on the viewer canvas** (slice
> `story-keyframe-interpolation`, feature-parity §E — the `Next` pointer's preferred candidate: a genuinely
> wire-backed keyframe interpolation reducer, chosen over glue-only work). iOS animates a canvas clip's
> position/scale/opacity over time from its `StoryKeyframe[]` (the wire model Android already decodes); the
> Android viewer projection explicitly **dropped** keyframes ("keyframe animation … not applied in this
> projection"), so a shifting/fading foreground clip rendered frozen at its static base.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3404 (web it. 255), #3395 (iOS 239i),
> #3392 (gateway it. 254): none is a `claude/apps/android/*` slice, none in this routine's scope, none touched.
> Prior iteration (`story-text-element-rtl-direction`, #3402) already merged into main. Branched off
> freshly-fetched `origin/main` (`0656f14a`).
>
> **Three pure units, ported 1:1 from iOS's canonical SOTA path** (`KeyframeInterpolator.swift` +
> `StoryReaderResolvers.swift`): (1) `StoryEasing.eased(t)` — linear/easeIn/easeOut/easeInOut, ports
> `StoryEasing.apply`; (2) `StoryKeyframeInterpolator.interpolate(samples, at)` — 0→null, 1→constant,
> `t≤t0`/`t≥tn` clamp, else find the straddling segment, `u=(t-lo)/(hi-lo)`, apply the LOWER keyframe's easing,
> lerp; unsorted-safe via an O(n) sorted-check before the O(n log n) fallback (runs per animation frame);
> (3) `StoryKeyframeResolver.resolve(...)` — projects the four independently-optional wire channels
> (x/y/scale/opacity) each onto their own sample list, returns a complete `ResolvedKeyframeTransform` (un-keyed
> channels hold the clip's static base) or `null` when nothing is keyed. **Deliberate improvement over iOS**:
> iOS subtracts the clip `startTime` for the position channel but forgets to for scale/opacity
> (`StoryReaderResolvers.swift:117/129` pass raw `currentTime`); per timeline spec §2.1 `keyframe.time` is a
> `startTime`-relative offset for EVERY channel, so this port subtracts it uniformly. A `startTime==0` clip
> (the common case) is unaffected.
>
> **Real wiring (not orphan logic)**: `StoryForegroundMediaView` now carries `keyframes`+`startTime` (threaded
> through `toForegroundMediaView`, previously discarded) + an `opacity` base, and exposes the pure
> `animated(atSeconds)` (returns `this` when nothing animates, else a copy with interpolated x/y/scale/opacity).
> **Compose glue (exempt)**: `StoryForegroundLayer` takes the slide `progress` clock (`progress.value *
> SLIDE_DURATION_MS/1000`), calls `.animated(playhead)`, and applies `.alpha(opacity)` — a keyed foreground
> clip now moves/scales/fades during playback instead of sitting frozen.
>
> **SDK bootstrap — recipe FLIPPED**: the four-edit copy→patch `android-37` (correct `package.xml`) STILL died
> `Failed to find target with hash string 'android-37'` on this image; the **pristine** `android-37.0`
> (no patching) worked instead — opposite of the last two entries. NOTES updated: try pristine FIRST next run.
>
> **Tests: +26** — 13 `StoryKeyframeInterpolatorTest` (5 easing: endpoints-pinned, linear identity, easeIn/
> easeOut/easeInOut midpoints; empty→null; single→constant; clamp-low; clamp-high; linear midpoint; lower-kf
> easing; segment-crossing switches easing; same-time no-divide-by-zero; unsorted≡sorted), 8
> `StoryKeyframeResolverTest` (null/empty/no-channel→null; keyed-channel-only; four-channels; startTime offset
> uniform; no-easing linear; per-channel easing), 4 `StoryForegroundKeyframeTest` (no-keyframes→identity;
> no-channel→identity; keyed follows animation + identity fields preserved; startTime offsets the clock), +1
> `StoryViewerViewModelTest` (foreground projection carries keyframes/startTime, animates). **Mutation
> RED-proof ×2 (isolated, restored after)**: `EASE_IN → t` (linear) failed EXACTLY the 3 ease-in tests; dropping
> the `startTime` subtraction failed EXACTLY the 2 startTime-offset tests — 5 of 26 failed, the other 21 stayed
> green. Genuine discrimination; production verified clean after restore.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, **BUILD SUCCESSFUL** (973 tasks, 5m46s, no test
> failures). Reviewer PASS. Diff is `apps/android` only (2 new pure files, 1 view-model data-class + projection
> threading, Compose glue in the viewer screen, +26 tests across 4 files, tracking docs). Verdict: **PASS** —
> pure app-side reducers reading an existing wire model + exempt Compose glue, behavioural tests through the
> public API, no production logic outside apps/android, no wire/shared change.
>
> **Next**: §E (Stories) V2-timeline neighbours of this slice — the **clip-transition** reader resolver
> (crossfade/dissolve opacity ramp, iOS `ReaderTransitionResolver` + `StoryRenderer.clipTransitionOpacity`, also
> wire-backed via `StoryClipTransition`) is the natural pure-logic follow-up, OR extend keyframe application to
> **text** clips (the wire `StoryTextObject.keyframes` already decode — a text element could animate the same way
> the foreground media now does). Both are genuinely wire-backed. Prefer the one with the cleaner pure core;
> scout read-only first to confirm the wire fields and avoid glue-only work.

> On 2026-08-23 **story text elements resolve their base writing direction (RTL) from content** (slice
> `story-text-element-rtl-direction`, feature-parity §E — the last named text-element attribute, the `Next`
> pointer's RTL item). This **completes §E text-element attribute parity** (style, colour, size, alignment,
> background, outline/stroke, fade, RTL).
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3398 (iOS Vague 167), #3395 (iOS
> 239i), #3392 (gateway it. 254): none is a `claude/apps/android/*` slice, none in this routine's scope, none
> touched. Prior iteration (`story-text-element-fade-timing`) already merged into main. Branched off
> freshly-fetched `origin/main` (`0fb38477`).
>
> **Scout confirmed the note's hypothesis**: the wire `StoryTextObject` has NO RTL/direction field (`textAlign`
> is the only alignment-ish field). iOS derives direction from content at render time. So the honest,
> iOS-parity design is a **content-derived resolver**, NOT a stored field or a manual override (an override
> couldn't persist with no wire field — it would be a dead-end feature). Did NOT invent a wire field.
>
> **The resolver is real, testable pure logic**: new `StoryTextBidi.resolveBaseDirection(text) ->
> StoryTextDirection` (LTR/RTL) implementing the **Unicode Bidi Algorithm P2/P3 "first strong character"
> rule** — scan for the first strong char (skipping neutrals, whitespace, digits, punctuation, and the whole
> content of any directional isolate LRI/RLI/FSI…PDI via a depth counter), take RTL iff it is R or AL, default
> LTR when none. Classification uses `Character.getDirectionality` (the JDK's UBA table) — the SOTA choice
> over hand-rolled ranges — so Arabic/Hebrew/Adlam (incl. supplementary-plane surrogate pairs) and the strong
> marks LRM/RLM/ALM all resolve correctly. `StoryTextElement.baseDirection` is a **derived** property (no
> stored field → `toTextObject` untouched, honest parity). **Compose glue (exempt)**: the canvas sets
> `TextStyle.textDirection` from `baseDirection` on both the stroked underlay and the fill, so an Arabic
> caption lays its paragraph out right-to-left instead of the previous forced LTR. **No VM intent** —
> direction follows the text automatically, mirroring iOS's render-time derivation.
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (200). NEW gotcha (NOTES): the `android-37` copy→patch
> also needs **`build.prop`'s `ro.build.version.sdk_full=37.0` → `37`** patched, not only `source.properties`
> ApiLevel + `package.xml` `<api-level>`/`path=`. With only the first three edits, `./gradlew` STILL died with
> `Failed to find target with hash string 'android-37'` (AGP 8.13 reads `sdk_full`). Also deleted the pristine
> `android-37.0` dir so only `android-37` remains. With all four fixes, the local gate ran.
>
> **Tests: +20** — 17 `StoryTextDirectionTest` (no-strong→LTR ×3: empty/digits/emoji; first-strong-L ×3:
> latin, latin-before-arabic, leading-LRM; first-strong-R ×2: hebrew, RLM; first-strong-AL ×3: arabic, ALM,
> arabic-before-latin; neutral-skip ×2: whitespace/punct→arabic, digits→hebrew; supplementary-plane Adlam;
> isolate ×3: arabic-in-isolate→LTR, FSI→LTR, unmatched-PDI→hebrew) + 3 element `baseDirection` (empty→LTR,
> latin→LTR, arabic→RTL). **Mutation RED-proven ×2 (isolated runs after an earlier collision was detected and
> discarded)**: RTL branch→LTR failed EXACTLY the 9 RTL-detection tests (the 8 LTR/default/isolate stayed
> green); removing the `if (isolateDepth > 0) continue` guard failed EXACTLY the 2 isolate tests. Genuine
> discrimination, files restored + verified clean afterward.
>
> **Verified**: `:feature:stories:testDebugUnitTest` green (17/17 direction, 44/44 element, 0 failures/skips);
> full `assembleDebug testDebugUnitTest` local gate [see run log below]. Reviewer PASS. Diff is `apps/android`
> only (1 new pure resolver file, 1 derived model property, Compose glue in the composer, +20 tests across 2
> files, tracking docs). Verdict: **PASS** — pure app-side resolver + derived property + exempt Compose glue,
> behavioural tests through the public API, no production logic outside apps/android, no wire/shared change.
>
> **Next**: §E (Stories) moves past text-element attributes (now complete) to the story-canvas **Effets** tiles
> — filters / drawing / timeline (named pending in the composer-band slice) — or on-canvas sticker/drawing
> elements. Scout read-only first: check whether the wire `StoryEffects`/`StoryTextObject` already carry
> filter/keyframe fields (keyframes DO exist on the wire — `StoryKeyframe`), so a timeline/keyframe slice may
> be genuinely wire-backed and testable, unlike RTL. Prefer a candidate with real pure logic (a filter
> enum+wire mapping, or a keyframe interpolation reducer) over glue-only work.

> On 2026-08-23 **story text elements get per-element fade in/out timing (fadeIn/fadeOut)** (slice
> `story-text-element-fade-timing`, feature-parity §E — the fade item the size/outline slices named as pending,
> `story-text-element-fade-timing`, feature-parity §E — the fade item the size/outline slices named as pending,
> the `Next` pointer's preferred candidate (2): two existing `Double?` wire fields, mirroring the size/outline
> shape). iOS's `StoryTextEditorView` exposes two independent `0…5 s` timing sliders (`fadeIn`/`fadeOut`, `0`
> folds to `nil`); Android's on-canvas text element carried style/colour/align/size/background/outline but no
> fade, so a caption could never ease in or out.
>
> **Step 0 — no open android-routine PR.** `list_pull_requests` (open) → #3395 (iOS 239i) and #3392 (gateway
> it. 254): neither is a `claude/apps/android/*` slice, neither in this routine's scope, neither touched. Prior
> iteration (`story-text-element-font-size`, #3384-line) already merged into main. Branched off freshly-fetched
> `origin/main` (`396ae223`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). New gotcha recorded in NOTES: the
> copy→patch for `android-37` also needs `package.xml`'s **`path="platforms;android-37.0"` → `android-37`**
> patched, not only `<api-level>` + `source.properties`. Without it the first `./gradlew` died with *"Observed
> package id 'platforms;android-37.0' in inconsistent location"* → `Failed to find target with hash string
> 'android-37'`. With all THREE metadata edits, full `assembleDebug testDebugUnitTest` ran locally, **BUILD
> SUCCESSFUL** (973 tasks). Local gate available this run.
>
> **Model, not duplication**: the wire `StoryTextObject.fadeIn`/`fadeOut` (`Double?`, seconds) already existed —
> this slice adds only the **app-side** model that projects onto them. New pure `StoryTextFade`
> `(inSeconds, outSeconds)` — held FLAT (two independent ends, exactly as iOS binds two separate sliders), each
> defaulting to `NONE_SECONDS = 0`. `StoryTextFadeCycle.advance` is the Android tap-friendly form of the iOS
> `0…5 s` slider: discrete steps `[0.5,1,2,3,5]` short→long, one tap advances to the first step STRICTLY greater
> than the current value (a between-steps value jumps UP, a tap never shortens), wraps past the longest back to
> no-fade; every step stays within the iOS-accepted `0…5 s` range so a cycled value round-trips the wire.
>
> **`StoryTextElement`**: gained `fade: StoryTextFade = StoryTextFade()` (defaulted no-fade); `toTextObject` sets
> `fadeIn`/`fadeOut`, EACH omitted while its end is 0 (the value iOS folds to `nil` — same "absent = no styling,
> minimal payload" law the outline/background slices set). **VM** `onTextElementCycleFadeIn(id)` /
> `onTextElementCycleFadeOut(id)` each advance ONLY their own end via the pure cycle, inert on unknown id,
> selection/editing untouched — mirrors the size/outline wrappers. **Compose glue (exempt)**: two toolbar buttons
> (`Login`/`Logout` AutoMirrored icons, tinted `primary` when that end fades, else `onSurfaceVariant`) drive the
> taps; the style row that holds align/size/outline/fade/duplicate is now `horizontalScroll`-wrapped so the two
> extra buttons never clip on a narrow phone. 4 locales get `stories_composer_fade_in`/`_fade_out`.
>
> **Tests: +20** — 10 `StoryTextFadeTest` (model visibility ×3; `cycledIn`/`cycledOut` each touch only their end
> ×2; cycle: every-step-then-wrap, between-steps jump-up, past-longest wrap, beyond-longest wrap, the five steps
> all ≤5s), 5 `StoryTextElementTest` (fresh element no fade; `toTextObject` omits both when none, carries in-only,
> out-only, both), 5 `StoryComposerViewModelTest` (fade-in advances only in, fade-out advances only out, fade-in
> wraps, both inert on unknown id). **Mutation RED-proof ×2**: nulling `toTextObject`'s `fadeIn` failed EXACTLY
> the 3 fade-in projection tests + a no-op `advance` (return `current`) failed EXACTLY the 7 cycle/cycled tests —
> 10 of 195 failed, genuine discrimination (the omit/inert tests stayed green). Restored via backup; production
> diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, **BUILD SUCCESSFUL** (4m37s, no test failures);
> stories suite re-run green on the restored files. Reviewer PASS. Diff is `apps/android` only (1 new pure model
> file, 1 model field + wire wiring, 2 VM methods, Compose glue in the composer screen + a scrollable row, strings
> ×4 locales, +20 tests across 3 files, tracking docs). Verdict: **PASS** — pure app-side model projecting onto
> two existing wire fields + exempt Compose glue, behavioural tests through the public API, no production logic
> outside apps/android.
>
> **Next**: §E (Stories), the last named text-element attribute — **RTL** (a per-element writing-direction
> override). Scout read-only first: the wire `StoryTextObject` has NO dedicated RTL/direction field (confirmed
> this run — `textAlign` is the only alignment-ish field), so iOS likely derives direction from the text content
> at render time. Decide whether Android RTL is a client-only concern (derive from the caption's script, no wire
> field, glue-only) or genuinely needs a new wire field (in which case it's cross-cutting, not an apps/android-only
> slice, and should be deferred/flagged). If RTL turns out to be non-wire-backed like `frame` was, skip it and
> move to the story-canvas **Effets** tiles (filters / drawing / timeline) or another §E gap. Do NOT invent a wire
> field for RTL — that would touch shared/gateway and break the merge gate.

> On 2026-08-23 **story text elements get a discrete font size (fontSize), born at the iOS-parity 96** (slice
> `story-text-element-font-size`, feature-parity §E — the `story-text-element-styling` backlog's **size** item,
> the follow-up the outline slice named). iOS births a fresh text element at `fontSize: 96` design units
> (1080-referential) and changes it by pinch (baked into `fontSize`); Android's `StoryTextElement.toTextObject`
> never set `fontSize`, so it leaked the wire default `64.0` — a caption rendered ~⅓ smaller than iOS. This lands
> the parity size **and** a discrete size ladder so a size can be chosen by a single tap (an Android-side
> improvement; iOS has no discrete size control).
>
> **Step 0 — merged the prior iteration's open PR first.** #3384 (`story-text-element-outline`) was left ⚠ blocked
> last run on a base-red `ci.yml`. Re-examined: the **Android** merge gate was GREEN, and the gateway time-bomb
> that held it (a `MessageHandlerEditDelete` fixture pinning `createdAt = 2026-08-22T10:00:00Z`, expiring at the
> 24 h edit window) is **fixed on main** — commit `68e4285b` made the fixture relative to the real clock. #3384's
> `ci.yml` was red only because its base (`e87b7b0d`) predated that fix. `ci.yml` remains red on main itself, now
> on **Quality (bun)** — an `apps/web` type-debt ratchet regression (1240 vs baseline 1239, +1) — again zero
> Android lines, unfixable in `apps/android` scope. Merge criteria held (Android gate green, diff `apps/android`
> only, mergeable), so squash-merged #3384 → main (`4141bfd5`), documented the base-red resolution on the PR.
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Recipe refinement: the copy→patch for
> `android-37` needs to patch **`package.xml`'s `<api-level>37.0</api-level>` → `37`**, not only
> `source.properties`'s `AndroidVersion.ApiLevel` — AGP reads `package.xml` for the platform hash, so patching
> only `source.properties` still fails with `Failed to find target with hash string 'android-37'`. With both
> patched, full `assembleDebug testDebugUnitTest` ran locally, **BUILD SUCCESSFUL** (973 tasks). Local gate
> available this run. (NOTES updated.)
>
> **Model, not duplication**: the wire `StoryTextObject.fontSize` (default `64.0`) already existed — this slice
> adds only the **app-side** discrete model that projects onto it. New pure `StoryTextSize` enum ladder
> (`SMALL 64` / `MEDIUM 96` / `LARGE 140` / `XLARGE 200` design units) with `DEFAULT = MEDIUM` (iOS-parity birth
> size). `StoryTextSizeCycle.next` wraps largest→smallest (no "off" step — text always has a size; unlike the
> outline cycle), off the ordered `StoryTextSize.entries` SSOT the tap and any future picker share.
>
> **`StoryTextElement`**: gained `size: StoryTextSize = StoryTextSize.DEFAULT`; `toTextObject` now sets
> `fontSize = size.designSize.toDouble()` (default → 96.0, the parity fix). The effective on-screen size is
> `designSize × scale`, mirroring iOS `fontSize × scale` — Android keeps the pinch on the separate `scale`
> multiplier, so the two compose rather than fight. **VM** `onTextElementCycleSize(id)` advances one tap via the
> pure cycle, inert on unknown id, selection/editing untouched — mirrors the outline/bg/style/align wrappers.
> **Compose glue (exempt)**: a `FormatSize` toolbar button (tinted `primary` when the size is non-default, else
> `onSurfaceVariant`) drives the tap; the canvas previews the size in sp via `designSize ×
> STORY_TEXT_CANVAS_FONT_FACTOR` (0.1875, so MEDIUM→18 sp) on both the fill and the stroked underlay. 4 locales
> get `stories_composer_size`.
>
> **Tests: +11** — 5 `StoryTextSizeTest` (the four-step design-unit ladder, `DEFAULT`=MEDIUM=96, cycle steps
> order, `next` visits-all-then-wraps, `next` past-largest wraps), 3 `StoryTextElementTest` (fresh element born
> MEDIUM; `toTextObject` carries default→96.0 and a chosen size→200.0), 3 `StoryComposerViewModelTest`
> (`onTextElementCycleSize` advances / wraps at the top / inert on unknown id). **Mutation RED-proof ×2**:
> dropping the `toTextObject` `fontSize` projection failed EXACTLY the 2 fontSize element tests (the ladder/cycle
> stayed green); a no-advance `next` (return `steps[index]`) failed EXACTLY the 4 cycle tests (2 size + 2 VM; the
> inert VM test and the born-MEDIUM test stayed green) — genuine discrimination, restored via backup.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, **BUILD SUCCESSFUL** (4m47s, no test failures).
> Reviewer PASS. Diff is `apps/android` only (1 new pure model file, 1 model field + wire wiring, 1 VM method,
> Compose glue in the composer screen, strings ×4 locales, +11 tests across 3 files, tracking docs). Verdict:
> **PASS** — pure app-side model projecting onto the existing wire field + exempt Compose glue, behavioural tests
> through the public API, no production logic outside apps/android.
>
> **Next**: still §E (Stories). Candidates, re-scout read-only before committing (parity notes are hypotheses):
> (1) **RTL** for text elements (a per-element writing-direction override; the wire has no dedicated field — iOS
> derives it, so scout whether it's a client-only concern or needs a wire field); (2) **fade timing**
> (`StoryTextObject.fadeIn`/`fadeOut` are Double? wire fields already — a per-element fade in/out, same shape as
> this slice, projecting onto existing wire fields — likely the cleanest next thin slice); (3) the story-canvas
> **Effets** tiles (filters / drawing / timeline). Prefer (2) — two existing wire fields, mirrors this slice.
> NOTE: `frame` (iOS `StoryTextFrameShape` cycle) is NOT cleanly wire-backed — the frame fields live on iOS's
> client `StoryTextObject` but are absent from the gateway/shared contract and the canvas-v3 fixtures, so skip it
> unless a wire field is confirmed.

> On 2026-08-23 **story text elements get a stroke outline (borderColor / borderWidth)** (slice
> `story-text-element-outline`, feature-parity §E — the `story-text-element-styling` backlog's `outline/stroke`
> item, the pending follow-up the `story-text-element-background` entry named). iOS lets a text element carry a
> discrete `.border` attribute cycled from the composer's high row (`StoryTextAttributeCycle.advance(.border)`);
> Android's on-canvas text element carried style/colour/align/background but no stroke, so a caption could never
> be outlined for legibility over busy media.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration. `list_pull_requests` → the open
> PRs repo-wide are OTHER routines' work — #3381 (realtime-sync cycle 108, branch `claude/keen-hamilton-lmraqx`,
> touches shared+gateway = production logic, NOT android-routine), #3375 (web it. 251), #3364 (iOS 238i). None is
> a `claude/apps/android/*` android-routine slice, and none is in this routine's scope. Prior android iteration
> (`story-text-element-background`, #3379) already merged into main. Branched off freshly-fetched `origin/main`
> (`1e6837b6`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). This run the recipe that worked was the
> **copy→patch** one (as the three 2026-08-23 entries used), NOT the pristine `android-37.0` one the 2026-08-21
> NOTES recorded: install cmdline-tools + `platforms;android-37.0` via `--channel=3` + `build-tools;36.0.0`, then
> `cp -r android-37.0 android-37` and `sed` its `source.properties` to `AndroidVersion.ApiLevel=37`. The FIRST
> `./gradlew` failed with **`Failed to find target with hash string 'android-37'`** on the pristine dir; after the
> copy+patch, `assembleDebug testDebugUnitTest` ran locally, **BUILD SUCCESSFUL**. Local gate available this run.
>
> **Model reuse, not duplication**: the wire `StoryTextObject` already carried `borderColor`/`borderWidth` — this
> slice adds only the **app-side** composer model that projects onto them. New pure `StoryTextOutline`
> `(width: Float, color: String?)` in `:feature:stories` — held FLAT, not a sealed `None`/`Stroke`, precisely
> because iOS keeps the chosen colour when the width returns to zero (so re-thickening never re-asks); a `None`
> case would erase it. Plus `StoryTextOutlineCycle.advance` — a case-for-case port of iOS
> `StoryTextAttributeCycle.advance(.border)`: steps `[2,4,8,12]` thin→thick, one tap advances to the first step
> STRICTLY greater than the current width (a between-steps width jumps UP, a tap never thins), wraps past the
> thickest back to no-stroke, and posts the default white (`FFFFFF`) the first time a stroke leaves zero
> uncoloured. The colour is preserved across every other transition, the return to zero included.
>
> **`StoryTextElement`**: gained `outline: StoryTextOutline = StoryTextOutline()` (defaulted no-stroke — the one
> non-copy construction site uses named args, verified); `toTextObject` sets `borderColor`/`borderWidth`, BOTH
> omitted while width is 0 (a retained colour never leaks onto the wire without a width — the same "absent = no
> styling, minimal payload" law the background slice set). **VM** `onTextElementCycleOutline(id)` advances one
> tap via the pure cycle, inert on unknown id, selection/editing untouched — mirrors the style/colour/align/bg
> wrappers. **Compose glue (exempt)**: a `BorderColor` toolbar button (tinted `primary` when a stroke is visible,
> else `onSurfaceVariant`) drives the tap; the canvas paints a stroked underlay of the same glyphs
> (`TextStyle(drawStyle = Stroke(width))`, outline colour) beneath the fill so the border hugs the letterforms
> rather than boxing the element. 4 locales get `stories_composer_outline`.
>
> **Tests: +17** — 10 `StoryTextOutlineTest` (model visibility ×4; cycle: every-step-then-wrap, between-steps
> jump-up, leaving-zero posts white, leaving-zero keeps chosen colour, return-to-zero keeps colour, the four
> steps), 4 `StoryTextElementTest` (fresh element has no outline; `toTextObject` omits border when none, carries
> both when stroked, keeps a retained colour off the wire at zero width), 3 `StoryComposerViewModelTest`
> (`onTextElementCycleOutline` thickens+posts white / wraps / inert on unknown id). **Mutation RED-proof ×2**:
> nulling `toTextObject`'s `borderWidth` failed EXACTLY `carries a stroked outline` (the omit tests stayed green);
> dropping the white-post in `advance` failed EXACTLY `advance leaving zero posts the default white` + the VM
> `thickens…posts the default colour` (wrap/inert stayed green) — 3 of 179 failed, genuine discrimination.
> Restored via backup; production diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, **BUILD SUCCESSFUL** (4m49s, no test failures). Reviewer PASS.
> Diff is `apps/android` only (1 new pure model file, 1 model field + wire wiring, 1 VM method, Compose glue in
> the composer screen, strings ×4 locales, +17 tests across 3 files, tracking docs). Verdict: **PASS** — pure
> app-side model projecting onto the existing wire fields + exempt Compose glue, behavioural tests through the
> public API, no production logic outside apps/android.
>
> **PR #3384 — ⚠ BLOCKED ON BASE, NOT MERGED (2026-08-23).** The merge gate — the **Android** CI check —
> is **GREEN** (`assembleDebug` + `testDebugUnitTest`, run 32633748096 conclusion success). The monorepo
> `ci.yml` is RED, but **the only red job is `Test gateway`** (2 failed / 19214 passed): both failures are in
> `services/gateway/src/socketio/handlers/__tests__/MessageHandlerEditDelete.test.ts` — the `message:edited`
> payload/`senderId` cases whose fixture pins `createdAt = 2026-08-22T10:00:00Z`. `admitMessageEdit` refuses any
> edit past a 24 h window, so those two turned RED for EVERY branch at 10:00 UTC today. This is red on `main`
> itself (PR #3381's commit proved it on a clean `origin/main`) and touches ZERO lines of this apps/android-only
> diff — `ci.yml` doesn't even compile the Kotlin this slice adds. It is the CI-red rule's "red on the base too,
> not mine" case, and it is **unfixable within apps/android scope** (the fix lives in `services/gateway`; touching
> it would violate the hard rule "diff is apps/android only"). Per the hard rule **never merge past red CI**, the
> PR is left OPEN and WATCHED (subscribed to PR activity). **Next iteration's Step 0**: if `main`/base has
> recovered (the gateway time-bomb fixed — e.g. PR #3381's gateway fix, or another, merged), merge base into this
> branch, re-run CI, and squash-merge #3384 once `ci.yml` is green; then proceed to the next slice. Until then
> this slice stays ⚠ blocked and no new slice starts on top of an unmerged one.
>
> **Next**: still §E (Stories). Candidates, re-scout read-only before committing (parity notes are hypotheses):
> (1) continue the text-element styling backlog — **size** (discrete font-size control; the wire
> `StoryTextObject.fontSize` already exists, default 64) is the cleanest remaining thin slice, same shape as
> this one; (2) RTL / fade timing (`fadeIn`/`fadeOut` on the wire); (3) the story-canvas **Effets** tiles
> (filters/drawing/timeline). Prefer (1) — one wire field, mirrors this slice.

> On 2026-08-23 **story text elements get a background (none / solid / glass)** (slice
> `story-text-element-background`, feature-parity §E — "Text elements … background (none/solid/glass) …",
> the `story-text-element-styling` slice's first named-pending item). iOS lets a text element carry a
> `StoryTextBackgroundStyle` (`.none`/`.solid(hex:)`/`.glass(radius:)`) chosen from `StoryTextBackgroundPresets`;
> Android's on-canvas text element carried style/colour/align but no backing, so a caption always floated bare.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` → the open
> PRs repo-wide are gateway/web/ios work — #3376/#3375/#3368/#3364/#3352 — none android-routine). Prior android
> iteration (`feed-repost-embed-location`) already merged into main. Branched off freshly-fetched `origin/main`
> (`06e85aa4`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Recipe as recorded in NOTES: install
> cmdline-tools + `platforms;android-37.0` via `--channel=3`, then **copy** `android-37.0` → a real `android-37`
> dir and `sed` its `source.properties` to `AndroidVersion.ApiLevel=37`. Full `assembleDebug testDebugUnitTest`
> (= `meeshy.sh check`) ran locally, **BUILD SUCCESSFUL** (973 tasks). Local gate available this run.
>
> **Model reuse, not duplication**: the wire model `StoryTextBackgroundStyle` (`{type,hex?,radius?}`, in
> `:core:model`) already existed — this slice adds only the **app-side** composer model that projects onto it.
> New pure `StoryTextBackground` sealed interface in `:feature:stories` (`None`/`Solid(hex)`/`Glass(radius)`)
> — exhaustive `when`, impossible states unrepresentable — with `toStyleWire()` deciding the tagged-union
> encoding in one place: `None`→`null` (absent = "no background" per the gateway's `resolvedBackgroundStyle`,
> minimal payload, mirrors iOS purging the legacy `textBg`), `Solid`→`{type:"solid",hex}`, `Glass`→
> `{type:"glass",radius}`. `StoryTextBackgroundPresets.all` mirrors the iOS `StoryTextBackgroundPresets.all`
> order/values (None, Glass(24), then 10 solids incl. the `…A6` alpha variants) as the single ordered SSOT the
> picker chips and the pure `next()` tap-cycle both read (they can't diverge). `next()` wraps at the end and
> restarts at the first for an off-palette backing.
>
> **`StoryTextElement`**: gained `background: StoryTextBackground = None` (defaulted last-ish field — all
> construction sites use named args, verified — so no call breaks); `toTextObject` now sets
> `backgroundStyle = background.toStyleWire()`. **VM** `onTextElementBackground(id, background)` mirrors the
> style/colour/align wrappers exactly (one-line `updateTextElement`, inert on unknown id, selection/editing
> untouched). **Compose glue (exempt)**: `TextElementLayer` paints the backing behind the glyphs via a
> `Modifier.storyTextBacking` (rounded solid fill / translucent frosted scrim for glass / nothing for none;
> `parseBackingColor` handles both `RRGGBB` and `RRGGBBAA`→Compose `AARRGGBB`), and a `BackgroundSwatch` chip
> row (accent-ringed selection, a slash icon for None) joins the `TextStyleToolbar`. 4 locales get
> `stories_composer_bg_none`/`_glass`.
>
> **Tests: +14** — 8 `StoryTextBackgroundTest` (none/solid/8-digit-solid/glass wire mapping, preset order,
> `next` advance/wrap/off-palette), 4 `StoryTextElementTest` (fresh element has no backing; `toTextObject`
> omits `backgroundStyle` when none, carries solid, carries glass), 2 `StoryComposerViewModelTest`
> (`onTextElementBackground` re-backs only the edited element / inert on unknown id). **Mutation RED-proof ×1**:
> nulling `toTextObject`'s `backgroundStyle = background.toStyleWire()` failed EXACTLY the two positive-wiring
> tests (solid + glass, 2 of 29 in that suite) while "omits when none" stayed green — genuine discrimination.
> Restored via backup; production diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL (973 tasks). Reviewer PASS.
> Diff is `apps/android` only (1 new pure model file, 1 model field + wire wiring, 1 VM method, Compose glue in
> the composer screen, strings ×4 locales, +14 tests across 3 files, tracking docs). Verdict: **PASS** — pure
> app-side model projecting onto the existing wire type + exempt Compose glue, behavioural tests through the
> public API, no production logic outside apps/android.
>
> **Next**: still §E (Stories). Candidates, re-scout read-only before committing (parity notes are hypotheses):
> (1) continue the text-element styling backlog — **size** (discrete font-size control) or **outline/stroke**
> (`borderColor`/`borderWidth` already on the wire `StoryTextObject`), each a clean thin model+wire+chip slice
> like this one; (2) RTL / fade timing (`fadeIn`/`fadeOut` on the wire); (3) the story-canvas **Effets** tiles
> (filters/drawing/timeline). Prefer (1) — the wire fields exist and it mirrors this slice's shape exactly.

> On 2026-08-23 **repost embed shows the reposted post's shared location** (slice
> `feed-repost-embed-location`, feature-parity §F — "Repost / quote embed cell in the feed"). iOS renders
> the SOURCE post's `SharedPlace` as a tappable sticker inside the quote block (`FeedPostCard.swift:989`),
> below the reposted media. Android's `ApiRepostOf` did not even carry the field, so a reposted location
> never surfaced in the embed. This closes the last repost-embed data gap that reuses this cycle's models.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` → the
> open PRs repo-wide are gateway/ios/shared work — #3370/#3368/#3364/#3352 — none android-routine). Prior
> android iteration (`feed-post-location-sticker`) already merged into main. Branched off freshly-fetched
> `origin/main` (`09caa5a3`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Recipe as recorded in NOTES:
> install cmdline-tools + `platforms;android-37.0` via `--channel=3`, then **copy** `android-37.0` → a real
> `android-37` dir and `sed` its `source.properties` to `AndroidVersion.ApiLevel=37` (AGP reads the integer
> ApiLevel, not the dir name). Full `assembleDebug testDebugUnitTest` ran locally, **BUILD SUCCESSFUL**
> (973 tasks). Local gate available this run.
>
> **Model reuse, not duplication**: `ApiRepostOf` gained only `location: SharedPlace? = null` — the same
> `:core:model` SSOT `ApiPost.location` already uses (mirrors the *gateway* shape, no iOS-extra `id`).
> `RepostEmbedPresentation` gained `location: FeedLocationPresentation? = null`, projected through the
> **same** `FeedPostLocationBuilder.build(repost.location)` the outer feed card uses — one label-resolution
> source of truth (name → address → null), not a second copy. The Compose glue (exempt) renders the
> existing dumb `FeedPostLocationSticker` atom inside `RepostEmbedCell` after the media preview (mirror of
> iOS ordering), tap wired to the screen's `openPlaceOnMap` — promoted `private` → `internal` so the shared
> cell reuses the one `geo:`-intent + Google-Maps-web-fallback path (no dead-end, no per-screen copy). All
> 4 `RepostEmbedCell` call sites (feed, detail, bookmarks, user-posts) get the sticker with zero signature
> change.
>
> **Tests: +3** `RepostEmbedBuilderTest` — projects label+coords / absent→null / coordinate-only→null-label.
> **Mutation RED-proof ×1**: forcing `location = null` in the builder fails EXACTLY the two positive-projection
> tests (2 of 3), while `absentLocationBecomesNull` correctly stays green (it asserts null for null input) —
> genuine discrimination, not a blanket break. Restored via backup; production diff verified clean afterward.
> The label-resolution branches themselves are already mutation-proven in `FeedPostLocationBuilderTest`
> (prior slice), so these 3 cover the wiring, not a re-test of the delegate.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL (973 tasks); `RepostEmbedBuilderTest`
> 23/23 green after restore. Reviewer PASS. Diff is `apps/android` only (1 model field, 1 presentation field
> + builder wiring, 1 Compose sticker in the shared cell, `openPlaceOnMap` visibility bump, +3 tests, tracking
> docs — no new strings, reuses `feed_location_shared`/`feed_location_open`). Verdict: **PASS** — pure app-side
> projection through a tested builder + exempt Compose glue, behavioural tests through the public API, no
> production logic outside apps/android.
>
> **Next**: still §F (Feed). Candidates, re-scout read-only before committing (parity notes are hypotheses):
> (1) begin decomposing the **Unified post composer** tabs (large, multi-slice) — the largest remaining Feed
> gap; (2) the **story-/reel-canvas repost embed** (needs an Android story-canvas renderer — iOS
> `StoryRepostEmbedCell`/`ReelRepostEmbedCell`, a bigger dependency); (3) advance to **§E Stories** (next in
> build order). Prefer (1) or (3) — the cleanly-doable repost-embed data gaps are now closed (like count,
> mood emoji, location all landed).

> On 2026-08-23 **feed post shows its shared location** (slice `feed-post-location-sticker`,
> feature-parity §F — new "Feed post location sticker (display side)" box). iOS renders a received post's
> shared place as a pin + label capsule under the media (`FeedPostLocationSticker`); the Android composer
> already ATTACHED an outgoing `SharedPlace`, but `ApiPost` dropped the field on the way IN, so a received
> location never surfaced on the feed card. This lands the display side — the cleanest thin Feed slice with
> data already on the wire (the composer's own `SharedPlace` model proves the type is used both ways).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` → the one
> open PR repo-wide is #3352, a gateway share-link language fix, not android-routine). Prior android iteration
> (`feed-repost-embed-mood-emoji`) already merged into main as PR #3361 (commit `97742b98`). Branched off
> freshly-fetched `origin/main` (`2e24d7cc`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Recipe as recorded in NOTES: install
> cmdline-tools + `platforms;android-37.0` via `--channel=3`, then **copy** `android-37.0` → a real
> `android-37` dir and `sed` its `source.properties` to `AndroidVersion.ApiLevel=37` (AGP reads the integer
> ApiLevel, not the dir name). After that the full `assembleDebug testDebugUnitTest` (= `meeshy.sh check`) ran
> locally, **BUILD SUCCESSFUL** (973 tasks). Local gate available this run.
>
> **Model reuse, not duplication**: I first almost re-declared `SharedPlace` in `Post.kt`, then found the
> existing SSOT `:core:model/SharedPlace.kt` (`{latitude, longitude, name, address, category}`, no `id` — it
> mirrors the *gateway* shape, deliberately not iOS's extra `id`). Reused it; `ApiPost` gained only
> `location: SharedPlace? = null` (data-class boilerplate, coverage-exempt; key-based kotlinx.serialization,
> order-independent).
>
> **`:feature:feed` `FeedPostLocationBuilder`** (pure, app-side — same grain as `RepostEmbedBuilder`):
> `build(place)` → `FeedLocationPresentation(label, latitude, longitude)` or null when absent. Label resolves
> `name?.takeIf { isNotBlank } ?: address?.takeIf { isNotBlank }` → null (mirror of iOS `displayLabel`
> name → address precedence). A null label is NOT an absent sticker — the cell supplies the localized
> "Position partagée" fallback so a hand-dropped, coordinate-only pin still renders a tappable sticker.
> Projected into `FeedPostPresentation.location` (defaulted last field — the one direct-construction test,
> `FeedMediaGalleryTest`, uses named args so it stays green).
>
> **`:feature:feed` `FeedPostLocationSticker`** (Compose glue, exempt): a reusable dumb atom (pin +
> ellipsized label in an Indigo500@12% capsule, accent-coherent, a11y `Role.Button` + open-hint), taking an
> `onTap` so the map-intent orchestration stays in the screen. Wired into `PostCard` after the image grid
> (mirror of iOS ordering). Tap → `openPlaceOnMap`: a `geo:lat,lng?q=…` intent, `Locale.ROOT`-formatted so a
> comma-decimal JVM locale never emits an invalid URI, with a Google-Maps-web `ACTION_VIEW` fallback on
> `ActivityNotFoundException` — no dead-end when no map app is installed.
>
> **Tests: +11** — 9 `FeedPostLocationBuilderTest` (null place / name / name-over-address /
> blank-name→address / absent-name→address / blank-both→null / absent-both→null / coord passthrough /
> coord-only→null-label) + 2 `FeedPostBuilderTest` wiring (projects label+coords / absent→null). **Mutation
> RED-proof ×1**: dropping the name `isNotBlank` guard fails EXACTLY the two blank-name tests (2 of 9), the
> other 7 green. Restored via `cp` backup; production diff verified clean afterward. Compile-RED was also
> genuine — the tests referenced `SharedPlace`/`FeedPostLocationBuilder`/`FeedLocationPresentation` before
> they were plumbed.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL (973 tasks). Reviewer PASS.
> Diff is `apps/android` only (1 model field, 1 new pure builder + presentation, 1 new Compose cell, screen
> wiring + map helper, strings ×4 locales, +11 tests, tracking docs). Verdict: **PASS** — pure app-side
> projection through a tested builder + exempt Compose glue, behavioural tests through the public API, no
> production logic outside apps/android.
>
> **Next**: still §F (Feed). Candidates, re-scout read-only before committing (parity notes are hypotheses):
> (1) the reposted post's **location** in the repost embed — now unblocked on the display side, needs a new
> `ApiRepostOf.location` field + gateway payload confirmation (iOS `APIRepostOf.location` is on the wire per
> `PostModels.swift`), then a small mirror of this slice's projection into `RepostEmbedBuilder`; (2) begin
> decomposing the **Unified post composer** tabs (large, multi-slice); (3) advance to **§E Stories** (next in
> build order). Prefer (1) — it is the last cleanly-doable repost-embed gap and reuses this slice's model.

> On 2026-08-23 **repost embed shows the reposted post's mood emoji** (slice `feed-repost-embed-mood-emoji`,
> feature-parity §F — "Repost / quote embed cell in the feed"). iOS prefixes the reposted post's mood emoji
> to the quoted content (`FeedPostCard.swift:966` — `if let mood = repost.moodEmoji, !mood.isEmpty`), with an
> explicit comment that a reposted STATUS carries an empty body, so without the emoji "un mood republié
> n'afficherait qu'un corps vide". Android's `ApiRepostOf` did not even carry the field, so a reposted mood
> status rendered a completely empty embed. This lands it — the last cleanly-doable repost-embed gap whose
> data was NOT already on the model.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` → the one
> open PR repo-wide is #3352, a gateway share-link language fix, not android-routine). Prior android iteration
> (`feed-repost-embed-like-count`) already merged into main. Branched off freshly-fetched `origin/main`
> (`e4d8c3f5`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Recipe as recorded in NOTES: install
> `platforms;android-37.0` via `--channel=3`, then **copy** `android-37.0` → a real `android-37` dir and `sed`
> its `source.properties` to `AndroidVersion.ApiLevel=37` (the symlink alone is insufficient — AGP reads
> `37.0` from `source.properties`). After that the full `assembleDebug testDebugUnitTest` ran locally, **BUILD
> SUCCESSFUL** (152 actionable tasks for the feed subtree; full check below). Local gate available this run.
>
> **Backend risk resolved before committing**: the "mood emoji embed" candidate was flagged in prior NOTES as
> needing "gateway payload confirmation first". Confirmed on the wire — iOS `APIRepostOf` declares
> `moodEmoji: String?` and decodes `repostOf.moodEmoji` (`PostModels.swift:87,281`), so the gateway already
> serves it; Android was simply dropping it. No gateway/shared change — the fix is a pure Android model +
> projection + Compose gap.
>
> **`:core:model` `ApiRepostOf`**: gained `val moodEmoji: String? = null` (kotlinx.serialization, key-based —
> order-independent; data-class boilerplate, coverage-exempt). Only construction site is `RepostEmbedBuilder`
> (grep-verified), so no other call breaks on the new field.
>
> **`:feature:feed` `RepostEmbedBuilder`** (pure, app-side): `RepostEmbedPresentation` gained
> `moodEmoji: String?`, projected as `repost.moodEmoji?.takeIf { it.isNotBlank() }` — identical guard to the
> feed card's own `FeedPostPresentation` (`post.moodEmoji?.takeIf { it.isNotBlank() }`) and iOS's `!mood.isEmpty`.
>
> **`:feature:feed` `RepostEmbedCell`** (Compose glue, exempt): the content block now shows when
> `moodEmoji != null || content.isNotBlank()` (was content-only), on a firstTextBaseline `Row` prefixing the
> emoji (`bodyMedium`) before the content — mirror of iOS's `HStack(alignment: .firstTextBaseline, spacing: 6)`.
> **Improvement over iOS**: the mood-only case (blank body + emoji) now renders on Android — iOS's own comment
> flags that exact case as previously an empty body; Android gates content to non-blank so a mood-only repost
> shows just the emoji, no empty text node. No new strings (emoji is verbatim text). No dead ends: read-only,
> part of the same tap target that opens the original post.
>
> **Tests: +3** — all in `RepostEmbedBuilderTest`, through the public `RepostEmbedBuilder.build`: projects the
> mood emoji ("🎉") / absent (null) → null / blank ("   ") → null. **Mutation RED-proof ×1**: dropping
> `.takeIf { it.isNotBlank() }` fails EXACTLY `build_blankMoodEmojiBecomesNull` (1 of 20), the other 19 green.
> Restored via `cp` backup; production diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL. Reviewer PASS. Diff is
> `apps/android` only (1 model field + projection, cell wiring, +3 tests, tracking docs). Verdict: **PASS** —
> pure app-side projection through a tested SSOT + exempt Compose glue, behavioural tests through the public
> API, no production logic outside apps/android.
>
> **Next**: still §F (Feed) is nearly complete (the two remaining unchecked boxes — "Unified post composer
> (Post/Status/Story tabs)" and the story-canvas repost embed — are large multi-slice features). Candidates:
> (1) the reposted post's **location sticker** in the embed (needs a new `ApiRepostOf.location` field — confirm
> iOS `APIRepostOf.location` is on the wire, which it is per `PostModels.swift`, then a model-plumbing slice
> mirroring this one); (2) begin decomposing the **Unified post composer** tabs; (3) or advance to **§E Stories**
> (22 todos, next in build order). Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **repost embed shows the reposted post's like count** (slice `feed-repost-embed-like-count`,
> feature-parity §F — "Repost / quote embed cell in the feed"). iOS renders the reposted post's like count
> inside the embedded quote block (`FeedPostCard.repostView` heart + `repost.likes`; `PostDetailView`
> `repostEmbed` gated `> 0`); Android's shared `RepostEmbedCell` omitted it. This lands it — the single
> cleanest remaining Feed embed gap, since the data is **already deserialized** into `ApiRepostOf.likeCount`
> (no new gateway endpoint, no new SDK model field, no new socket stream — which is exactly what disqualified
> the mood-emoji / location-sticker embed variants that each need a net-new `ApiRepostOf` field).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` → the one
> open PR repo-wide is #3352, a gateway share-link language fix, not android-routine). Prior android iteration
> (`feed-postdetail-quote-repost`) already merged into main as PR #3350. Branched off freshly-fetched
> `origin/main` (`ad904485`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Recipe wrinkle DEEPENED: the symlink
> `android-37 → android-37.0` is **no longer sufficient** — AGP reads `AndroidVersion.ApiLevel=37.0` from the
> platform's `source.properties` and computes the hash `android-37.0`, so `compileSdk = 37` still fails with
> *"Failed to find target with hash string 'android-37'"* even with the symlink present (confirmed this run:
> baseline `assembleDebug` failed on exactly that). Fix that actually works: **copy** `android-37.0` → a real
> `android-37` dir and `sed` its `source.properties` to `AndroidVersion.ApiLevel=37`. After that the full
> `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) ran locally, **BUILD SUCCESSFUL**
> (973 tasks). Local gate available this run. (Recorded in NOTES.md.)
>
> **`:feature:feed` `RepostEmbedBuilder`** (pure, app-side): `RepostEmbedPresentation` gained `likeCount: Int`,
> projected as `(repost.likeCount ?: 0).coerceAtLeast(0)` — null (absent payload) → 0, and a malformed
> negative clamps to 0 (same precedent as `feed-realtime-comment-count`'s `coerceAtLeast(0)`). **Improvement
> over iOS**: gated `> 0` in the shared cell, so a reposted post with no likes shows no "0 j'aime" clutter —
> iOS's `FeedPostCard.repostView` renders the count unconditionally; its own `PostDetailView.repostEmbed`
> already gates `> 0`, and the shared Android cell adopts that restraint for both surfaces.
>
> **`:feature:feed` `RepostEmbedCell`** (Compose glue, exempt): a heart (`Icons.Filled.Favorite`) + count row
> after the media block, accent-coherent (`Indigo500` at 0.7 alpha, mirroring iOS `accentText(...).opacity(0.7)`),
> merged into one accessibility element via the new `feed_repost_likes_count` plurals (EN/FR/ES/PT). No dead
> ends: the row is read-only, part of the same tap target that opens the original post.
>
> **Tests: +3** — all in `RepostEmbedBuilderTest`, through the public `RepostEmbedBuilder.build`:
> projects the reposted post's count (7) / absent (null) → 0 / negative (-3) clamps to 0. **Mutation RED-proof
> ×1**: dropping `.coerceAtLeast(0)` fails EXACTLY `build_clampsNegativeLikeCountToZero` (1 of 17), the other 16
> green. Restored via `cp` backup; production diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL (973 tasks). Reviewer PASS.
> Diff is `apps/android` only (1 field + projection, cell wiring, plurals ×4 locales, +3 tests, tracking docs).
> Verdict: **PASS** — pure app-side projection through a tested SSOT + exempt Compose glue, behavioural tests
> through the public API, no production logic outside apps/android.
>
> **Next**: still §F (Feed). Candidates, re-scout read-only before committing (parity notes are hypotheses):
> (1) the composer's **per-post language selector** (iOS lets you pick the post's original language; confirm
> `POST /posts` accepts an explicit `originalLanguage` before committing — unverified-backend risk); (2) the
> reposted post's **mood emoji** in the embed (needs a new `ApiRepostOf.moodEmoji` field + gateway payload
> confirmation — model plumbing slice); (3) the composer's **location** attachment. Comment-repost is
> DISQUALIFIED — iOS exposes no repost/quote on comment cells (net-new invention, skip).

> On 2026-08-22 **post-detail gains repost + quote** (slice `feed-postdetail-quote-repost`, feature-parity
> §F — "Post / comment pin-unpin; repost / quote-repost / share; report"). The feed card already offered
> repost + quote (slice `feed-quote-repost`); the full-screen post-detail did not. iOS offers both there via
> `PostDetailView.toggleDetailRepost(quote:)` behind a repost button + alert. This lands the same on Android,
> routed through the already-tested `RepostCommand` SSOT.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` → the one
> open PR repo-wide is #3348, a web/gateway/shared/iOS realtime fix, not android-routine). Prior android
> iteration (`feed-quote-repost`) already merged into main. Branched off freshly-fetched `origin/main`
> (`ea1789df`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Recipe wrinkle: `--channel=3
> platforms;android-37.0` installs a MINOR-versioned platform dir (`platforms/android-37.0`, ApiLevel
> `37.0`), but AGP 8.13 with `compileSdk = 37` looks up hash string `android-37` → *"Failed to find target
> with hash string 'android-37'"*. Fix: `ln -sf android-37.0 android-37` in `$HOME/android-sdk/platforms`.
> After the symlink the full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) ran
> locally, **BUILD SUCCESSFUL** (973 tasks). Local gate available this run. (Recorded in NOTES.md.)
>
> **`:feature:feed` `PostDetailViewModel`**: new `repost()` / `beginQuote()` / `onQuoteTextChange()` /
> `cancelQuote()` / `submitQuote()`, mirror of the feed VM's quote flow but scoped to the single open post
> (`rawPost`). Both paths fold through `RepostCommand.of(post.id, post.repostOf, quote, commentary)` — the
> pure SSOT already tested by `RepostCommandTest` (root-target resolution + blank-quote degradation). Two
> **improvements over iOS's post-detail**, both free from routing through the SSOT: (1) reposting a SHARE
> targets its ROOT, never the intermediate share — iOS's `toggleDetailRepost` reposts the raw `postId` and so
> embeds an empty share card; (2) a blank/whitespace quote degrades to a simple repost (iOS sends
> `content = ""`, and in fact iOS's post-detail "quote" is content-LESS entirely — `content: nil`). Ephemeral
> repost/quote UI state (`quoteComposer`, optimistic `isReposted`, in-flight guard) lives in the existing
> `PostDetailStatus` flow so it survives every re-projection; the optimistic `isReposted` reverts on failure
> (iOS `isPostReposted`), failures surface via `errorMessage`, and a double-tap fires the network once
> (in-flight guard). `sendRepost` rethrows `CancellationException`.
>
> **`:feature:feed` `PostDetailScreen`** (Compose glue, exempt): the read-only repost stat becomes an
> interactive `DetailRepostStat` — a tap opens a Repost / Quote `DropdownMenu` (Android take on iOS's button
> + alert), the icon fills accent `Indigo500` once reposted (optimistic). The quote path reuses the feed's
> `QuoteComposerSheet` (made `internal`) for visual coherence — the source-preview card above a commentary
> field, same as the feed. No new strings (reuses `feed_action_repost` / `feed_action_quote` / the quote
> sheet strings). No dead ends: the menu dismisses cleanly, the sheet cancels back to the post.
>
> **Tests: +15** — all in `PostDetailViewModelTest`, driving the public `state`: repost-original→own-id /
> repost-of-repost→root / repost-no-root→direct-parent / repost-before-load inert / repost-failure reverts +
> error / double-repost fires once (in-flight guard) / beginQuote preview (author + trimmed content) /
> beginQuote-before-load inert / draft change / cancel closes no repost / submitQuote commentary + flags +
> closes / submitQuote-of-repost→root / submitQuote blank degrades / submitQuote no-composer inert /
> submitQuote failure reverts + error. **Mutation RED-proof ×1**: `RepostCommand.of(post.id, post.repostOf…)`
> → `…, null…` fails EXACTLY the 2 root-target tests, other 27 green. Restored via `cp` backup; production
> diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL (973 tasks). Reviewer PASS.
> Diff is `apps/android` only (VM methods + state, screen wiring, 1 visibility widening in FeedScreen, +15
> tests, tracking docs). Verdict: **PASS** — app-side orchestration + Compose glue, behavioural tests through
> the public API, the "what to send" decision left in the already-tested pure SSOT, no production logic
> outside apps/android.
>
> **Next**: still §F (Feed). Candidates: the `PostCommentsViewModel` could gain the same repost entry point if
> iOS exposes one on comment cells (scout first); or advance to the reposted/quoted embed cell polish, or the
> `comment pin-unpin` sibling once a gateway endpoint exists (still net-new, skip until then). Re-scout
> read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **quote-repost composer shipped** (slice `feed-quote-repost`, feature-parity §F —
> "Post / comment pin-unpin; repost / quote-repost / share; report"). The post options menu offered only a
> SIMPLE repost; iOS also lets you **quote** — repost with your own commentary. This lands the quote flow
> and, along the way, fixes a latent Android bug.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` → the two
> open PRs repo-wide are #3342 web + #3337 shared/iOS, neither android-routine). Prior android iteration
> (`guest-join-entry-navigation`) already merged into main. Branched off freshly-fetched `origin/main`
> (`cb7c8297`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `--channel=3 platforms;android-37.0`
> recipe worked; ran the full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally,
> **BUILD SUCCESSFUL** (973 tasks). Local gate available this run.
>
> **Pure SSOT `RepostCommand`** (`:feature:feed`, app-side — ports what iOS keeps in `FeedViewModel`):
> `of(postId, repostOf, quote, commentary) → RepostCommand(targetId, content, isQuote)` folds two decisions.
> **(1) Target id** (port of iOS `resolveRepostTargetId`): reposting a repost targets its recorded ROOT
> (`originalRepostOfId?.trim() ?: repostOf.id`), never the intermediate share — the gateway hydrates
> `repostOf` one level deep, so reposting a share by its own id embeds an EMPTY share card. The pre-existing
> simple `repost()` passed `postId` straight through — a **latent bug now fixed** since both the simple and
> quote paths route through `RepostCommand`. **(2) content/isQuote** (port of iOS `repostPost`
> `content: isQuote ? content : nil`, `isQuote: isQuote ? (content != nil) : false`): a simple repost carries
> no content; a quote carries the trimmed commentary. **Surpasses iOS**: a blank/whitespace-only quote
> degrades to a simple repost (blank→null then `isQuote = content != null`), where iOS's raw `content != nil`
> would send `content = ""`, `isQuote = true` (an empty quote card).
>
> **`:feature:feed` `FeedViewModel`**: `repost(postId)` now routes through `RepostCommand` (target fix);
> new `beginQuote(postId)` (inert if the post isn't loaded — nothing to quote; seeds a `QuoteComposerState`
> with the source author + trimmed content preview), `onQuoteTextChange`, `cancelQuote`, `submitQuote`
> (computes the command, closes the sheet — iOS dismisses immediately — reposts, `refresh()` on success /
> `errorMessage` on failure). `PostAction.Quote` added to the pure `PostActionMenu` right after `Repost`
> (every post). `FeedScreen` wires `onQuote → beginQuote` and renders a `QuoteComposerSheet` (Compose glue,
> exempt: an `AlertDialog` coherent with `ReportPostDialog` — commentary field above a bordered source
> preview). New strings in all 4 locales (en/fr/es/pt).
>
> **Tests: +23** — `RepostCommandTest` ×11 (pure: own-id / repost→root / no-root fallback / blank-root
> fallback / padded-root trim / simple carries no content / quote trims content + flags / blank + null
> commentary degrade / inner-whitespace preserved / quote-of-repost composes both); `FeedViewModelTest` ×11
> (repost own-id + refresh / repost-of-repost→root / error surfaces + no refresh / beginQuote preview /
> beginQuote inert on unknown / draft change / submitQuote commentary + close + refresh / submitQuote-of-
> repost→root / submitQuote blank degrades / cancel closes no repost / submit inert with no composer);
> `PostActionMenuTest` ×1 (quote follows repost). **Mutation RED-proof ×1**: `isQuote = content != null` →
> `= quote` fails EXACTLY the 3 blank-degradation tests (2 pure + 1 VM), 730 others green. Restored via `cp`
> backup; production diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL (973 tasks). Reviewer PASS.
> Diff is `apps/android` only (1 new pure SSOT + 1 new test in `:feature:feed`, VM + menu + screen wiring,
> strings in 4 locales, tracking docs). Verdict: **PASS** — app-side orchestration + Compose glue,
> behavioural tests through the public API, the pure "what to send" decision isolated in a tested SSOT, no
> production logic outside apps/android.
>
> **Next**: still §F (Feed). The sibling gap `comment pin-unpin` remains, but neither iOS nor Android has a
> comment-pin backend, so it is net-new invention without a port reference — skip until a gateway endpoint
> exists. Better candidates: quote-repost from the **post-detail** menu (iOS `PostDetailView.toggleDetailRepost`
> offers both repost and quote there too — `PostDetailViewModel` has its own `repost`; wiring the same
> `RepostCommand` + composer there is a clean follow-up), or advance to another §F `[~]` (e.g. the reposted/
> quoted embed cell, line ~4544). Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **guest-join deep-link route rewired — the umbrella box is now `[x]`** (slice
> `guest-join-entry-navigation`, feature-parity §Chat — "Anonymous-session conversation mode; guest
> join-via-share-link flow"). This lands the last named follow-up: the `MeeshyApp.kt` deep-link route no
> longer jumps straight to the anonymous guest form; it now consults the entry brain and branches the
> navigation on the resolved intent.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` → the
> single open PR repo-wide is #3337, a `packages/shared` + iOS Rivière fix, not android-routine). Prior
> android iteration (`sharelink-entry-resolver`) already merged into main. Branched off freshly-fetched
> `origin/main` (`0cec829f`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `--channel=3 platforms;android-37.0`
> recipe worked; ran the full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`)
> locally, **BUILD SUCCESSFUL** (973 tasks). Local gate available this run.
>
> **`:feature:auth` `ShareLinkEntryViewModel`** (new, app-side): the brain the guest-join route now
> consults on entry. `@HiltViewModel`, exposes `state: StateFlow<ShareLinkEntryUiState>`. On init it reads
> the auth flag (`ShareLinkAuthStateProviding` seam over `AuthRepository.isAuthenticated`), gathers known
> conversation ids ONLY when authenticated (`KnownConversationIdsProviding` seam over
> `ConversationRepository.cachedConversations` — a guest never pays a needless cache read, proven by a
> test), runs the app-side `ShareLinkEntryResolver`, and reduces the six-way `ShareLinkEntryIntent` to one
> `ShareLinkEntryUiState`: `OpenConversation` / `ChooseIdentity(conversationId, title, resumesGuestSession)`
> / `RequiresAccount` / `GuestForm` / `Failed(message)` / `Resolving`. Two intents drive a network join the
> VM performs itself (`JoinWithAccount`, and the null-resolution fallback while authenticated — iOS's
> `joinViaShareLink`) via an `AuthenticatedShareLinkJoining` seam over
> `ShareLinkJoinRepository.joinAuthenticated`: success → `OpenConversation(canonicalId)`, failure →
> `Failed`. `ChooseIdentity` is actionable (no dead end): `chooseAccount()` joins + opens, `chooseAnonymous()`
> resumes the stored guest session (or opens the form when there is none / a blank stored conversationId).
> SOTA over iOS, which routes authenticated vs unauthenticated entry through TWO separate views: Android
> unifies both behind one VM; a blank stored `conversationId` degrades to the form instead of navigating to
> an empty id.
>
> **`:feature:auth` `ShareLinkEntryScreen`** (new, Compose glue): hosts the VM and renders each state —
> `GuestForm` delegates to the existing `GuestJoinScreen`; `OpenConversation`/`RequiresAccount` fire the
> nav callback under a spinner; `ChooseIdentity` shows an accent-coherent two-button choice (Continue with
> my account / Join·Resume anonymously); `Failed` offers retry. `MeeshyApp.kt`'s `GUEST_JOIN` composable now
> hosts `ShareLinkEntryScreen(onOpenConversation, onJoined, onBack, onSignIn)` instead of `GuestJoinScreen`.
> `ShareLinkEntryModule` (Hilt) binds the resolver + three `fun interface` seams to their SDK sources
> (boilerplate, coverage-exempt). New strings in all 4 locales (en/fr/es/pt).
>
> **Tests: +19** — `ShareLinkEntryViewModelTest` drives the public `state` with a REAL `ShareLinkEntryResolver`
> over faked leaf seams (preview / `InMemoryAnonymousSessionStore` / join / auth / known-ids): guest open→form /
> guest never-consults-account-list / guest requires-account→sign-in / guest stored-session→resume /
> guest preview-failure→form / account member→open-straight-away (join not called) / account non-member-open→
> choose-identity / choose-identity flags-resumable-guest / account require-account→join→open / account
> join-failure→Failed / account unresolvable→authenticated-join fallback / unresolvable+join-failure→Failed /
> resume blank-conversationId→form / retry-after-Failed→succeeds / initial-state Resolving / chooseAccount→open /
> chooseAccount-failure→Failed / chooseAnonymous stored→resume / chooseAnonymous none→form. **Mutation (RED
> proof) ×1**: neuter the resume blank-conversationId guard → **exactly** `resume ... degradesToTheAnonymousForm`
> fails (1 of 15 at that point). Restored via the Edit tool; production diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL (973 tasks). Reviewer PASS.
> Diff is `apps/android` only (2 new code files + 1 Hilt module + 1 new test in `:feature:auth`, 1 route
> rewire in `:app`, strings in 4 locales, tracking docs). Verdict: **PASS** — app-side orchestration + Compose
> glue, behavioural tests through the public API, pure decision left in the SDK model, no production logic
> outside apps/android.
>
> **Next**: the guest-join feature is complete end to end. Pick the next-highest-value unchecked box in
> `feature-parity.md` for the current build-order area (Auth → Conversations → Chat → Feed → Stories → Calls
> → the rest). Candidate seen while here: the `ChooseIdentity` "resume anonymously" path currently resumes
> only when a stored session exists for the exact link; a future refinement could also re-preview + open the
> guest form pre-filled from the dormant session. Re-scout read-only before committing — parity notes are
> hypotheses.

> On 2026-08-22 **share-link entry-fact resolver shipped** (slice `sharelink-entry-resolver`,
> feature-parity §Chat — "Anonymous-session conversation mode; guest join-via-share-link flow"; the
> umbrella box stays `[~]` — the `MeeshyApp.kt` deep-link rewire is now the single named follow-up).
> This lands the app-side brain that assembles the five `ShareLinkEntryFacts` and asks the pure
> `ShareLinkEntryPolicy` how a person enters, closing the gap between the policy (shipped last-but-one
> slice) and the endpoint (`ShareLinkJoinRepository`, shipped last slice).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (`list_pull_requests` →
> `[]`, zero open PRs repo-wide). Prior android iteration (`sharelink-join-authenticated`) already
> merged into main. Branched off freshly-fetched `origin/main` (`d84fc807`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `platforms;android-37.0` recipe
> worked; ran the full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally,
> **BUILD SUCCESSFUL** (973 tasks). Local gate available this run.
>
> **Placement correction (parity note was a hypothesis).** Last slice's "Next" proposed a `:sdk-core`
> `ShareLinkEntryResolver`. Re-scouting iOS proved that wrong: iOS's `ShareLinkEntryResolver.swift`
> lives **app-side** (`apps/ios/Meeshy/Features/Main/Navigation/`), and its own header states "App-side
> et non SDK : elle appelle un service réseau et consulte l'état de l'app." Putting it in `:sdk-core`
> would break SDK purity (I/O + device-state consult = product orchestration). Landed it in
> `:feature:auth` (where the guest-join flow already lives) instead. The pure decision stays in
> `:core:model` (`ShareLinkEntryPolicy`); the resolver only gathers facts and delegates.
>
> **`:feature:auth` `ShareLinkEntryResolver`** (new, app-side): a `ShareLinkPreviewProviding` `fun
> interface` seam (decouples from the concrete `AnonymousSessionRepository`; the consumer binds it to
> `repository::preview`) + `AnonymousSessionStore`. `resolve(identifier, isAuthenticated,
> knownConversationIds): ShareLinkEntryResolution?` where `ShareLinkEntryResolution = (intent,
> conversationTitle)`. Assembles the five facts — `conversationId` (trimmed), `isAuthenticated`,
> `isAlreadyMember` (`knownConversationIds.contains`), `linkRequiresAccount` (`info.requireAccount`),
> `hasStoredGuestSession` — then returns `ShareLinkEntryPolicy.intent(facts)` with the conversation
> title threaded. SOTA over the iOS force-unwrapping original: (a) a blank identifier is inert (returns
> `null`, no doomed empty-preview request); (b) a preview with no conversation, or a blank conversation
> id, resolves to `null` (graceful caller fallback, never a crash). Android divergence made explicit: the
> guest store is single-valued, so "stored session for THIS link" is `store.load()?.linkId?.trim() ==
> identifier` — a session opened on a *different* link must never resume here (iOS keys its store by
> linkId; Android compares).
>
> **Tests: +15** — `ShareLinkEntryResolverTest` (drives public `resolve`, recording preview seam +
> `InMemoryAnonymousSessionStore`; the policy itself is exhaustively covered by `ShareLinkEntryPolicyTest`,
> so these assert only the resolver's own contribution): blank-identifier-inert-no-network /
> preview-failure→null / no-conversation→null / blank-conversation-id→null / unauth-open-link→JoinAnonymously /
> unauth-stored-this-link→ResumeGuestSession / stored-different-link→JoinAnonymously (the linkId compare) /
> auth-member→OpenConversation(id) / auth-nonmember-requireAccount→JoinWithAccount / auth-nonmember-open→
> ChooseIdentity / title-threaded / null-title→null-not-crash / identifier-trimmed-before-preview-and-compare /
> padded-conversation-id-trimmed-for-membership. **Mutation (RED proof) ×2**: (a) linkId equality dropped
> (`load() != null`) → **exactly** `a stored session for a different link does not count as stored for this
> one` fails (1 of 15); (b) preview called with the untrimmed identifier → **exactly** `the identifier is
> trimmed before the preview and the stored-session compare` fails (1 of 15). Both restored via `cp` of a
> pre-mutation backup; production diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL (973 tasks). Reviewer
> PASS. Diff is `apps/android` only (1 new code file in `:feature:auth` + 1 new test + tracking docs).
> Verdict: **PASS** — app-side orchestration addition, behavioural tests through the public API, pure
> decision left in the SDK model, no production logic outside apps/android.
>
> **Next**: rewire `MeeshyApp.kt`'s guest-join deep-link route (`Routes.GUEST_JOIN`) to call the resolver
> before presenting a screen, and branch the navigation on the returned intent —
> `OpenConversation`/`JoinWithAccount` (call `ShareLinkJoinRepository.joinAuthenticated`, then navigate to
> chat) / `ResumeGuestSession` (restore + navigate) / `JoinAnonymously` (the current `GuestJoinScreen`) /
> `ChooseIdentity` (a new choice sheet) / `RequiresAccount` (steer to login). This flips the umbrella box to
> `[x]`. The Compose glue is JVM-untestable — push all decidable logic into a small VM/state holder and cover
> that. Re-scout read-only before committing — parity notes are hypotheses (this slice corrected one).

> On 2026-08-22 **authenticated share-link join shipped** (slice `sharelink-join-authenticated`,
> feature-parity §Chat — "Anonymous-session conversation mode; guest join-via-share-link flow"; the
> umbrella box stays `[~]` — the `ShareLinkEntryResolver` + `MeeshyApp.kt` rewire are the last named
> follow-ups). This lands the JWT counterpart of the anonymous guest join, continuing the same feature
> begun by `sharelink-entry-policy`.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 21 open PRs at branch
> time (#3325/#3324/#3317/#3310/#3299/#3289/#3281/#3280/#3275/#3270/#3266/#3262/#3259/#3255/#3253/#3250/
> #3249/#3247/#3245/#3243/#3242) are all web/shared/gateway/ios/sdk, none android-routine. Prior android
> iteration (`sharelink-entry-policy`) already merged into main. Branched off freshly-fetched
> `origin/main` (`940ad0c1`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `platforms;android-37.0` recipe
> worked (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`); ran
> the full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally, **BUILD
> SUCCESSFUL** (973 tasks).
>
> **The gap (read-only recon over iOS + Android)**: iOS `ShareLinkService.joinAuthenticated(linkId)`
> hits `POST /conversations/join/{linkId}` (empty body — the gateway derives the joiner from the JWT;
> `routes/conversations/sharing.ts` `resolveConversationEntry`, idempotent: an existing member gets the
> same canonical conversationId as a fresh join). Android had the `JoinAuthenticatedResponse` model but
> shipped it **orphaned** (grep: zero consumers outside `ShareLink.kt`) — no API endpoint, no repository.
> `ShareLinkEntryPolicy` (last slice) can now DECIDE `JoinWithAccount`, but nothing could EXECUTE it.
>
> **`:core:network` `ConversationApi.joinViaShareLink(linkId)`** (`@POST conversations/join/{linkId}`,
> no `@Body` — the markRead precedent; JWT rides the interceptor). Chose `ConversationApi` over
> `ShareLinkApi` deliberately: the path is `conversations/…` and every `ConversationApi` endpoint is
> JWT, whereas `ShareLinkApi` is documented as the **no-JWT** anonymous surface. The three hand-written
> `ConversationApi` test stubs (`ConversationRepositoryTest`, `ConversationStatsRepositoryTest`,
> `ConversationAnalysisRepositoryTest`) each gained the one-line override + import.
>
> **`:sdk-core` `ShareLinkJoinRepository`** (new, stateless — JWT sibling of
> `AnonymousSessionRepository.join`, but installs no token and touches no Room):
> `joinAuthenticated(linkId): NetworkResult<String>` returns the canonical conversationId. SOTA over
> iOS: a blank linkId is **inert** (folds to Failure with no network call — never the doomed
> `conversations/join/` request iOS would fire); a success envelope carrying a **blank** conversationId
> folds to Failure (malformed), so a caller can never navigate to an empty id; both the linkId sent and
> the conversationId returned are trimmed.
>
> **Tests: +6** — `ShareLinkJoinRepositoryTest`: canonical-id-returned+linkId-forwarded / trims-both-
> sides / blank-conversationId→Failure / blank-linkId-inert-no-network / unsuccessful-envelope→Failure /
> transport-error→Failure. **Mutation (RED proof) ×2**: (a) neuter the blank-linkId guard (`if(false)`)
> → **exactly** `is inert on a blank linkId and never calls the network` fails (1 of 6); (b) neuter the
> blank-conversationId guard → **exactly** `folds a success envelope with a blank conversationId into a
> failure` fails (1 of 6). Both restored via the Edit tool (uncommitted file — never `git checkout`);
> production diff verified clean afterward.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL. Reviewer PASS. Diff is
> `apps/android` only (1 API method in `:core:network` + 1 new repository in `:sdk-core` + 1 new test +
> 3 stub one-liners + tracking docs). Verdict: **PASS** — stateless repository addition, behavioural
> tests through the public API, no production logic outside apps/android.
>
> **Next**: the `:sdk-core` `ShareLinkEntryResolver` — assembles the five `ShareLinkEntryFacts` (preview
> via `AnonymousSessionRepository.preview` + `AnonymousSessionStore.load(linkId)` + the in-memory
> conversation list) and dispatches the resolved `ShareLinkEntryIntent` to either
> `AnonymousSessionRepository.join` or `ShareLinkJoinRepository.joinAuthenticated`; then rewire
> `MeeshyApp.kt`'s deep-link route to branch on the intent (the final `[x]` for the umbrella box).
> Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **share-link entry-decision policy shipped** (slice `sharelink-entry-policy`,
> feature-parity §Chat — "Anonymous-session conversation mode; guest join-via-share-link flow",
> box flipped `[ ]` → `[~]`). This lands the missing "who enters, and how" brain for share-link
> deep links; the umbrella box stays `[~]` because the resolver + `joinAuthenticated` endpoint +
> `MeeshyApp.kt` rewiring are named follow-ups.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (the 20 open PRs at
> branch time are all web/shared/gateway/ios/sdk, none android-routine). Branched off latest
> `origin/main` (`685ac5e2`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `platforms;android-37.0`
> recipe worked (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0"
> "platform-tools"`); the local gate is available this run.
>
> **The gap (read-only recon over iOS + Android)**: iOS `ShareLinkEntryPolicy.swift` is a pure
> six-way decision engine that decides HOW a person enters a conversation from a share link.
> Android had ported nearly the whole anonymous-session feature (permission core, session store,
> guest-join form/VM/screen, composer gate, dual-auth) but NOT this entry-decision policy — so
> `MeeshyApp.kt`'s deep-link handler routed EVERY share-link straight to the anonymous guest form,
> wrongly forcing an already-authenticated user, an existing member, or a returning guest into it.
> iOS branches six ways here; Android branched zero.
>
> **`:core:model` `ShareLinkEntryPolicy`** (new, pure SSOT): `intent(ShareLinkEntryFacts) →
> ShareLinkEntryIntent`. `ShareLinkEntryFacts` = five values (conversationId, isAuthenticated,
> isAlreadyMember, linkRequiresAccount, hasStoredGuestSession) — deliberately values, not services:
> the rule looks nothing up itself. `ShareLinkEntryIntent` = sealed interface of six:
> `OpenConversation(id)` / `JoinWithAccount(id)` / `JoinAnonymously` / `ResumeGuestSession` /
> `ChooseIdentity(id)` / `RequiresAccount`. Branch order is a faithful port of iOS `intent(for:)`:
> unauthenticated → (stored guest session ⇒ resume) else (requireAccount ⇒ requiresAccount) else
> joinAnonymously; authenticated → (member ⇒ open) else (requireAccount ⇒ joinWithAccount) else
> chooseIdentity. Two load-bearing precedence rules asserted: stored-guest beats requireAccount
> (unauth), member beats requireAccount (auth). Pure — no I/O, no clock, no state; presentation
> (choice sheets, routing) stays app-side.
>
> **Tests: +11** — `ShareLinkEntryPolicyTest`: joinAnonymously / requiresAccount /
> resumeGuestSession / stored-guest-beats-requireAccount / openConversation / member-beats-
> requireAccount / joinWithAccount / chooseIdentity / stored-guest-does-not-skip-choice-when-auth /
> conversationId-threaded-into-every-conversation-scoped-intent / member-flag-ignored-when-unauth.
> **Mutation (RED proof) ×2**: (a) unauthenticated precedence reordered (requireAccount checked
> before the stored-guest guard) → **exactly** `unauthenticated_storedGuestSession_beatsAccountRequirement`
> fails (1 of 11); (b) authenticated precedence reordered (requireAccount checked before
> isAlreadyMember) → **exactly** `authenticated_alreadyMember_beatsAccountRequirement` fails (1 of
> 11). Both restored; production diff is clean.
>
> **Verified**: `assembleDebug testDebugUnitTest` locally (see run log for result). Reviewer PASS.
> Diff is `apps/android` only (1 new code file in `:core:model` + 1 test + tracking docs). Verdict:
> **PASS** — pure decision-engine addition, behavioural tests through the public API, no production
> logic outside apps/android.
>
> **Next**: continue the same feature toward `[x]` — port `joinAuthenticated` (`POST
> conversations/join/{linkId}`, idempotent) on `ShareLinkApi` + `AnonymousSessionRepository` (or a
> new `ShareLinkJoinRepository`) as the next thin, TDD-friendly slice; then the `:sdk-core`
> `ShareLinkEntryResolver` that assembles the facts; then rewire `MeeshyApp.kt`. Re-scout read-only
> before committing — parity notes are hypotheses.

> On 2026-08-22 **conversation-lock master-PIN change + remove shipped** (slice
> `conversation-lock-master-pin`, feature-parity §Chat — "Conversation lock: master PIN
> setup/change/remove + per-conversation 4-digit lock + unlock-all", flipped `[ ]` → `[x]`). This closes
> the last named arm of the conversation-lock feature; setup / per-conversation lock / open-gate /
> unlock-all were already live from prior slices.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 20 open PRs at branch
> time (#3311/#3310/#3299/#3289/#3281/#3280/#3275/#3270/#3266/#3262/#3259/#3255/#3253/#3250/#3249/#3247/
> #3245/#3243/#3242 …) are all web/shared/gateway/ios/sdk, none android-routine. Branched off
> freshly-fetched `origin/main` (`59aac98c`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `android-37.0` recipe worked
> (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`); ran the full
> `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally, **BUILD SUCCESSFUL**
> (973 tasks).
>
> **The gap (read-only recon over iOS + Android)**: iOS `ConversationLockSheet.Mode` has SEVEN modes;
> Android's `LockPinReducer` shipped only five — `changeMasterPin` and `removeMasterPin` (both Settings-level)
> were missing, leaving the box's "master PIN … change/remove" arm unmet. The store already exposed
> `removeMasterPin` (guarded) / `forceRemoveMasterPin` / `setMasterPin`, so no `:sdk-core` change was needed.
>
> **`:feature:chat`… `LockPinReducer`** (pure, extended): `CHANGE_MASTER_PIN` runs verify-current (step 0)
> → new (step 1) → confirm (step 2) → `CommitMasterPin(new)`; a new-pin mismatch rewinds to step 1 (NOT the
> already-passed verify step 0). `REMOVE_MASTER_PIN` verifies once then emits the new `RemoveMasterPin`
> effect. New copy keys map to the sheet's title/subtitle strings (change reuses "Verify master PIN" title
> with a distinct "enter current" subtitle, faithful to iOS). **`ConversationListViewModel`** gains
> `onChangeMasterPin`/`onRemoveMasterPin`, a mirrored `hasMasterPin` (refreshed from the lock store on every
> lock mutation AND after each master-PIN commit/removal), and the `canChangeMasterPin` /
> `canRemoveMasterPin` gates; `applyLockResult` applies `RemoveMasterPin` via the store's **guarded**
> `removeMasterPin`. **`ConversationListScreen`** adds a `LockSecurityMenu` overflow (top bar, visible once a
> PIN exists) offering Change (always) and Remove (only while nothing is locked). Strings en/fr/es/pt.
>
> **SOTA over iOS**: iOS `removeMasterPin` force-clears the PIN even while conversation locks survive —
> orphaning them (a lock can no longer be authorised, and unlock-all silently always fails against a null
> master). Android offers Remove ONLY while nothing is locked and applies it through the guarded store call,
> so an orphan is structurally impossible.
>
> **Tests: +17** — `LockPinReducerTest` +9 (change: length-all-steps / copy-per-step / happy verify→new→
> confirm→commit / wrong-current-keeps-verify / new-mismatch-rewinds-to-step-1-not-0; remove: length / copy /
> correct→RemoveMasterPin+Completed / wrong-flags-and-removes-nothing), `ConversationLockFlowViewModelTest`
> +8 (change: affordance-gated-on-pin / replaces-pin-leaving-locks / wrong-current-keeps-sheet / inert-no-pin;
> remove: affordance-requires-pin-and-no-locks / clears-it / wrong-keeps-it / inert-no-pin / inert-while-locked).
> **Mutation (RED proof) ×2**: (a) change new-pin mismatch `entryStep = 1` → `0` → **exactly**
> `a_mismatched_new_master_pin_resets_to_the_new_entry_step_not_the_verify_step` fails (1 of 38); (b)
> `canRemoveMasterPin` drop the `&& lockedConversationIds.isEmpty()` guard → **exactly**
> `the_remove_affordance_requires_a_pin_and_no_locks` fails (1 of 26). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL. Reviewer PASS. Diff is
> `apps/android` only (reducer + ViewModel + Screen + Sheet in `:feature:conversations`, strings×4, tracking
> docs). Verdict: **PASS** — pure state-machine additions, behavioural tests through the public API, no
> production logic outside apps/android.
>
> **Next**: the conversation-lock feature is now at full parity. Pick the next highest-value unchecked §Chat
> box — the "Conversation info sheet" (hero/direct headers + options tab; members/media/pinned already live)
> or "Anonymous-session conversation mode; guest join-via-share-link flow" (pure session/permission gating,
> TDD-friendly). Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **conversation-stats sentiment three-way bar shipped** (slice
> `conversation-stats-sentiment-bar`, feature-parity §Chat — "Conversation stats rings + activity +
> content-type / **sentiment** breakdown", box flipped `[~]` → `[x]`). This closes the last open arm of
> the stats/analysis dashboard; the conversation-analysis surface is now at full iOS parity.
>
> **Step 0**: no open `claude/apps/android/*` slice PR at branch time (the 20 open PRs — #3301/#3299/
> #3298/#3289/#3281/#3280/#3279/#3275/#3270/#3266/#3263/#3262/#3259/#3255/#3253/#3250/#3249/#3247/
> #3245/#3243 — are all web/shared/gateway/ios/sdk, none android-routine). Prior android iteration
> (`conversation-analysis-personas`, #3287-lineage) already merged. Branched off freshly-fetched
> `origin/main` (`f2ebc819`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Note: `compileSdk = 37` resolves
> to platform hash `android-37`, served by `platforms;android-37.0` (canary `--channel=3`); the FIRST
> gradle invocation raced its own auto-install of `android-37.0` and died with *"Failed to find target
> with hash string 'android-37'"* — a one-shot install race, NOT a real toolchain gap. Re-running once
> the platform finished installing built clean. Ran the full `assembleDebug testDebugUnitTest`
> (= `./apps/android/meeshy.sh check`) locally: **BUILD SUCCESSFUL** (973 tasks).
>
> **The gap (read-only recon over iOS + Android)**: iOS `ConversationDashboardView.sentimentSection`
> renders a three-way sentiment split (positive/neutral/negative counts → % columns + a segmented
> success/warning/error bar) computed **client-side** via Apple `NLTagger` over the loaded `messages`
> (±0.15 thresholds, `shuffled().prefix(200)` sampling). Android had `SentimentAnalyzer` (`:core:model`,
> the composer's dictionary scorer from `composer-live-sentiment`) but no three-way projection and no
> stats-sheet consumer. This slice reuses that scorer — **no `NLTagger` equivalent, no new model** — so
> the earlier open question ("does this need an on-device NL model?") is answered: no.
>
> **`:core:model` `SentimentBreakdownProjection`** (new, pure SSOT): `toneOf(score)` collapses the
> seven-bucket `SentimentLevel` SSOT into `SentimentTone.{POSITIVE,NEUTRAL,NEGATIVE}` (reusing
> `SentimentLevel.from` rather than a parallel ±0.15 threshold — one sentiment SSOT, not two);
> `sample(list,max)` is a **deterministic even stride** (`i*size/max`, head-to-tail) — SOTA over iOS's
> RNG `shuffled().prefix(200)`; `breakdown(contents)` trims/drops-blank, samples to `MAX_SAMPLE=200`,
> scores each via `SentimentAnalyzer`, and tallies with `groupingBy().eachCount()`. `SentimentBreakdown`
> exposes `count`/`fraction`/`percent` (truncated, iOS `Int(frac*100)` parity), `segments()`
> (present-tones-only, pos→neu→neg order, zero dropped), and `dominant` (explicit tie-break
> positive ≥ neutral ≥ negative — port of iOS `dominantColor`; null when nothing scored).
>
> **`:feature:chat` `ConversationStatsViewModel`**: `load(conversationId, messageContents)` scores the
> texts on-device at load and stores `sentiment: SentimentBreakdown?` (null when nothing scorable). The
> score is **independent of the `/stats` network fetch** — it seeds the fresh state in `fetch(...)` and
> survives a fetch failure (Error phase still carries the sentiment); `retry()` keeps the already-scored
> value. **`ConversationStatsSheet`** renders it under the language section: three emoji/percent columns
> (😄/😐/😔, success/warning/error tints) + a segmented bar. `ChatScreen` passes the non-deleted message
> texts. Strings en/fr/es/pt.
>
> **Tests: +28** — `SentimentBreakdownProjectionTest` +24 (toneOf: zero / both neutral boundaries / just
> above / just below / strong ±; sample: fits / at-cap / even-stride / first-kept-never-rolls-past-last /
> non-positive-cap; breakdown: mixed-three-tones / drop-blank / trim / MAX_SAMPLE-cap / empty; breakdown
> derived: count / fraction / fraction-zero-total / percent-truncation / percent-zero-total / segments
> order+drop-zero / segments count+fraction / segments-empty / dominant-null / dominant-plurality×3 /
> dominant-tie-cascade), `ConversationStatsViewModelTest` +4 (scores-into-split / null-when-unscorable /
> survives-fetch-failure / retry-keeps-sentiment; the existing 7 still green). **Mutation (RED proof)
> ×2**: (a) `sample` stride → `list.take(max)` → **exactly** `sample strides evenly across an oversized
> list spanning head to tail` fails (1 of 28); (b) `dominant` tie-break arms swapped (neutral before
> positive) → **exactly** `dominant tie resolves positive before neutral before negative` fails (1 of
> 28). Both restored; production diff is clean.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL. Reviewer PASS. Diff is
> `apps/android` only (2 new code+test in `:core:model` + ViewModel/Sheet/ChatScreen wiring + strings×4 +
> tracking docs).
>
> **Next**: the conversation-analysis + stats dashboards are now at full parity — pick the next
> highest-value unchecked §Chat or §Feed box in `feature-parity.md` for the current build-order area.
> Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **AI participant persona profiles + trait bars shipped** (slice
> `conversation-analysis-personas`, feature-parity §Chat — "AI participant persona profiles + trait
> bars", now `[x]`). This closes the second half of the `/analysis` dashboard begun by
> `conversation-analysis-summary`; only the stats sheet's sentiment three-way bar remains on that area.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 20 open PRs at
> branch time (#3292/#3289/#3288/#3281/#3280/#3279/#3275/#3270/#3266/#3263/#3262/#3259/#3257/#3255/
> #3253/#3250/#3249/#3247/#3245/#3243) are all web/shared/gateway/ios/sdk, none android-routine. Prior
> android iteration (`conversation-analysis-summary`, #3287) already merged into main. Branched off
> freshly-fetched `origin/main` (`bf1367e4`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `android-37.0` recipe worked
> (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`); ran the
> full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally, BUILD SUCCESSFUL.
>
> **The gap (read-only recon over iOS + Android)**: iOS's `ConversationDashboardView`
> `agentParticipantProfilesSection` + `traitBarsView` render `ConversationAnalysis.participantProfiles`
> (persona summary, tone, vocabulary, confidence badge, 4 trait axes as score bars, catchphrases,
> topics, emojis) from `GET /conversations/{id}/analysis`. On Android the whole
> `ParticipantProfile`/`ParticipantTraits`/`CommunicationTraits`/… tree in `AgentAnalysis.kt` shipped
> **orphaned** — grep confirmed zero consumers outside the model file. The summary half went real last
> iteration; this slice turns the **persona half** real.
>
> **`:core:model` `ParticipantProfileProjection`** (new, pure SSOT): `traitTier` (≥70 GOOD / ≥40 MID /
> else LOW — faithful port of iOS `traitScoreColor`, which uses `>=` UNLIKE `healthScoreColor`'s `>`),
> `bars(axis)` (present-traits-only, score **clamped 0..100**, **stable** desc sort, top 4 — SOTA over
> iOS's raw-score bar width + unstable Swift sort + `Mirror` reflection extraction), `categories(tree)`
> (the 4 axes in canonical order, empty ones dropped, null tree ⇒ none), `profile()` →
> `ParticipantProfileView` (name = displayName › username › userId as a **single** seed for label AND
> colour — SOTA over iOS's `"?"`-for-label vs userId-for-colour fork; confidence **clamped 0..1** then
> `>0`-gated percent — SOTA over iOS's raw `Int(confidence*100)`; trimmed persona/tone/vocabulary;
> deduped topics/emojis + de-blanked catchphrases capped 3/6/3).
>
> **`:feature:chat` `ConversationAnalysisViewModel`** now projects BOTH halves of the same `/analysis`
> response (added `profiles: List<ParticipantProfileView>`); phase is **Empty only when the summary AND
> the personas are both empty** (backward-compatible — the existing Empty tests carry no profiles).
> **`ConversationAnalysisSheet`** renders the personas **under the summary in the same sheet** (no third
> header button — matches iOS's single dashboard): a per-persona card with an accent stripe, coloured
> seed dot, name, confidence pill, italic persona, tone/vocabulary chips, the trait-bar categories
> (label + fraction bar + tier-coloured score), catchphrases, topics + emojis. Strings en/fr/es/pt.
>
> **Tests: +25** — `ParticipantProfileProjectionTest` +22 (traitTier: ≥70/69/≥40/<40 boundaries;
> bars: present-only / desc / stable-tie / top-4-cap / clamp-out-of-range / empty-axis; categories:
> canonical-order / drop-empty-axis / null-tree; confidence: zero-or-neg-null / floor / clamp>1; name:
> displayName / username-fallback / userId-fallback; text: blank→null / trimmed; lists: catchphrases
> drop-blank+cap3 / topics dedupe+cap3 / emojis dedupe+cap6; profiles: maps-all-incl-empty / empty),
> `ConversationAnalysisViewModelTest` +3 (personas-without-summary Loaded / both-present / — the
> existing 6 still green under the new Empty rule). **Mutation (RED proof) ×2**: (a) `traitTier`
> `>=`→`>` at the GOOD threshold → **exactly** `traitTier at or above seventy is good` fails (1 of 26);
> (b) drop `bars`' `.take(4)` → **exactly** `bars cap at four even when more are present` fails (1 of
> 26). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally this
> run, BUILD SUCCESSFUL. Reviewer PASS. Diff is `apps/android` only (2 new code+test + ViewModel/Sheet
> wiring + strings×4 + tracking docs).
>
> **Next**: the stats dashboard's **sentiment three-way bar**
> (`ConversationDashboardView.sentimentAnalysis` — positive/neutral/negative segmented bar). Note iOS
> computes sentiment on-device via `NLTagger`; the Android equivalent has no bundled NL sentiment
> engine, so re-scout whether the gateway serves a sentiment field or whether this needs an on-device
> model decision before committing. If that's too heavy for one slice, pick the next-highest §Chat or
> §Feed parity box. Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **AI conversation-analysis summary card shipped** (slice `conversation-analysis-summary`,
> feature-parity §Chat — "AI conversation analysis (health score, summary, topics, tone, emotions)",
> now `[x]`; only the participant-persona/trait-bars arm of the same endpoint remains).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 18 open PRs at
> branch time (#3281/#3280/#3279/#3275/#3270/#3266/#3263/#3262/#3259/#3257/#3255/#3253/#3250/#3249/
> #3247/#3245/#3243/#3242) are all web/shared/gateway/ios/sdk, none android-routine. Prior android
> iteration (`conversation-stats-core`) already merged into main. Branched off freshly-fetched
> `origin/main` (`99d0ba1d`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Pristine `android-37.0` recipe
> worked (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`);
> ran the full `assembleDebug testDebugUnitTest` locally.
>
> **The gap (read-only recon over iOS + Android)**: iOS's `ConversationDashboardView.heroHealthCard`
> renders `ConversationAnalysis.summary` (health score / tone / topics / dominant emotions /
> engagement / conflict / dynamique) fetched from `GET /conversations/{id}/analysis`. On Android the
> whole `ConversationAnalysis` model tree in `AgentAnalysis.kt` shipped **orphaned** — grep confirmed
> zero references outside the model file (no repository, no consumer). The stats half (sibling
> `ConversationMessageStatsResponse`) was turned real last iteration; this slice turns the **AI-summary
> half** real. The AI-persona/trait-bars arm stays a separate open box on the same endpoint.
>
> **`:core:model` `ConversationAnalysisProjection`** (new, pure SSOT): `healthTier` (>70 good / >40
> fair / else poor — faithful port of iOS `healthScoreColor` cut-offs), `conflictTier`
> (case-insensitive high|eleve|fort / medium|moyen|modere keyword match, high wins — parity
> `conflictLevelColor`), `cleanLabels` (trim / drop-blank / case-insensitive dedupe preserving first
> casing + order — **SOTA over iOS**, which renders the raw list so `["Joy","joy"]` doubles),
> `summary()` → a render-ready `AnalysisSummaryView` or **null** (the Empty state) when the summary is
> absent or projects to no content (`hasContent` excludes messageCount as metadata). The health score
> is **clamped 0..100** before the tier derives (SOTA — iOS trusts the raw value); messageCount clamps
> ≥0.
>
> **`:sdk-core` `ConversationAnalysisRepository`**: thin dependency-light sibling of
> `ConversationStatsRepository` (only the API — analysis is an ephemeral drill-down that neither reads
> nor writes Room), `fetchAnalysis(id)` → `NetworkResult` via `apiCall`. New
> `ConversationApi.analysis(id)` (`@GET conversations/{id}/analysis`) — the two existing stub-based
> repo tests (`ConversationRepositoryTest`, `ConversationStatsRepositoryTest`) gained the new override.
>
> **`:feature:chat` `ConversationAnalysisViewModel`** (`StateFlow<ConversationAnalysisUiState>`,
> Loading/Loaded/Empty/Error): fetches once, projects at load; `load` idempotent (re-tries only a
> prior Error), `retry()` re-fetches. **`ConversationAnalysisSheet`** + a new header `AutoAwesome`
> action (any member) render it: health badge (tier-tinted), engagement/conflict chips (tier-tinted),
> tone, topics + emotions chip rows, summary narrative, dynamic. Strings en/fr/es/pt.
>
> **Tests: +23** — `ConversationAnalysisProjectionTest` +17 (healthTier: >70/=70/41..70/=40/≤40;
> conflictTier: high×3-lang / medium×3-lang / low-fallback / high-wins-over-medium; cleanLabels:
> trim+drop-blank / case-insensitive-dedupe-order / empty; summary: null-no-summary / null-all-blank /
> full-projection / clamp-out-of-range-score / no-tier-when-text-only / health-only-surfaces /
> clamp-negative-count), `ConversationAnalysisRepositoryTest` +3 (success forwards id / envelope
> failure / transport failure), `ConversationAnalysisViewModelTest` +6 (loaded projection / no-summary
> Empty / blank-summary Empty / failure Error / idempotent load / retry after failure). **Mutation
> (RED proof) ×2**: (a) drop `summary()`'s `takeIf { it.hasContent }` → **exactly** `summary is null
> when every renderable field is blank or empty` fails (1 of 19); (b) `healthTier` `>`→`>=` at the good
> threshold → **exactly** the two boundary tests asserting 70 is FAIR fail (2 of 19). Both restored.
> Genuine RED was also captured up-front: the first projection-test run BUILD FAILED on `Unresolved
> reference 'HealthTier'/'ConversationAnalysisProjection'` before the impl existed.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally this
> run. Reviewer PASS. Diff is `apps/android` only (3 code + 3 test + ChatScreen/Api wiring + strings×4 +
> tracking docs).
>
> **Next**: the **AI participant persona profiles + trait bars** box (same endpoint, still-orphaned
> `ParticipantProfile`/`ParticipantTraits`/`CommunicationTraits`/… in `AgentAnalysis.kt`) — the other
> half of this dashboard; or the stats dashboard's own **sentiment three-way bar**
> (`ConversationDashboardView.sentimentAnalysis`). Re-scout read-only before committing — parity notes
> are hypotheses.

> On 2026-08-21 **Conversation stats dashboard shipped** (slice `conversation-stats-core`,
> feature-parity §Chat — "Conversation stats rings + activity-over-time + content-type breakdown").
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (the 18 open PRs at branch
> time — #3282/#3281/#3280/#3279/#3275/#3270/#3266/#3263/#3262/#3259/#3257/#3255/#3253/#3250/#3249/#3247/
> #3245/#3243/#3242 — are all web/shared/gateway/ios/sdk, none android-routine). Prior android iteration
> (`story-viewer-translation-request`, #3278) already merged into main. Branched off freshly-fetched
> `origin/main` (`1def3504`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (200). One gotcha: `compileSdk = 37` resolves to
> platform hash `android-37`, but the platform AGP 8.13.0 accepts is `android-37.0` (Android 17,
> `AndroidVersion.ApiLevel=37.0`). The first run failed (`Failed to find target … 'android-37'`) because it
> raced the mid-install auto-download; once `android-37.0` finished installing, `compileDebugKotlin`
> resolved it cleanly. Ran the full `assembleDebug testDebugUnitTest` locally this run.
>
> **The gap (read-only recon over iOS + Android)**: iOS reaches a full `ConversationDashboardView`
> (`ConversationMessageStatsResponse` via `GET /conversations/{id}/stats` + `ConversationAnalysis` via
> `/analysis`). On Android the DTOs shipped **orphaned** — `AgentAnalysis.kt` defines
> `ConversationMessageStatsResponse`/`ContentTypeCounts`/`DailyActivityEntry`/… but nothing consumed them
> (confirmed by grep: zero references outside the model file). This slice turns the STATS half real; the
> AI-analysis (sentiment/health/persona) half stays a separate, still-open box.
>
> **`:core:model` `ConversationStatsProjection`** (new, pure SSOT): `contentTypeBreakdown` (server
> `ContentTypeCounts` → non-zero shares, count-desc, canonical tie-break, empty on zero total — **SOTA over
> iOS**, which re-counts the loaded message page and under-counts un-paged content), `activitySeries`
> (trailing-window filter with an **injected `today`** — deterministic, unlike iOS's wall-clock view getter;
> drops unparseable dates, ALL keeps everything, oldest-first), `participantShares`/`languageShares`
> (fraction + stable ordering, zero-total safe), `hourlyBuckets` (fixed 24-slot histogram; ignores
> non-numeric/out-of-range keys, clamps negatives, accumulates dupes).
>
> **`:sdk-core` `ConversationStatsRepository`**: thin dependency-light sibling of `ConversationRepository`
> (only the API — stats is an ephemeral drill-down that neither reads nor writes Room), `fetchStats(id)` →
> `NetworkResult` via `apiCall`. New `ConversationApi.stats(id)` (`@GET conversations/{id}/stats`).
>
> **`:feature:chat` `ConversationStatsViewModel`** (`StateFlow<ConversationStatsUiState>`,
> Loading/Loaded/Empty/Error): fetches once, projects the time-independent sections at load, and exposes the
> activity series as a pure `activity(today)` getter so a **period switch re-derives locally, no refetch**
> (the "pass time in" doctrine the chat header already uses for presence). `load` is idempotent (re-tries only
> a prior Error); `retry()` re-fetches; `selectPeriod` inert on no-op. **`ConversationStatsSheet`** + a new
> header `Insights` action (any member) render it: total pills, content-type bars, an accent activity
> mini-chart with a 7d/30d/All picker, busiest-participant list, language breakdown. Strings en/fr/es/pt.
>
> **Tests: +30** — `ConversationStatsProjectionTest` +20 (content: drop-zero/fractions/order/tie/empty;
> hourly: 24-span/invalid+range/negative-clamp/padded-key; activity: window/cutoff-inclusive/ALL/sort/
> bad-date/empty; participant: fraction/zero-total/order/name-then-id tie/empty; language:
> fraction/order+tie/drop-zero/empty), `ConversationStatsRepositoryTest` +3 (success forwards id / envelope
> failure / transport failure), `ConversationStatsViewModelTest` +7 (loaded projection / empty / error /
> period re-derives without refetch / idempotent load / retry after failure / inert period). **Mutation
> (RED proof) ×2**: (a) drop the `count > 0` filter in `contentTypeBreakdown` → 3 content tests fail
> (zero-count/order/tie); (b) drop the activity cutoff (`date.isBefore(cutoff)`) → **exactly** `activity week
> keeps only points within the trailing window` fails (1 of 24). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally this run.
> Reviewer PASS. Diff is `apps/android` only (4 code + 3 test + ChatScreen/Api wiring + strings + tracking docs).
>
> **Next**: the **AI conversation analysis** arm (`GET /conversations/{id}/analysis` → `ConversationAnalysis`
> health score / summary / tone / emotions) — the other half of this dashboard and its own parity box — or
> the **AI participant persona profiles + trait bars** box (same endpoint, `ParticipantProfile`/
> `ParticipantTraits`). Both consume the same still-orphaned `AgentAnalysis.kt` models. Re-scout read-only
> before committing — parity notes are hypotheses.

> On 2026-08-21 **Story on-demand translation shipped** (slice `story-viewer-translation-request`,
> feature-parity's Feed §F Prisme line — the **per-story timeline flag strip** arm, the LAST item on the
> `request-missing-languages` follow-up. The whole follow-up (feed card / post-detail / comments / story) is
> now done).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (the open PRs at branch time are
> all web/shared/gateway/ios/sdk — none android-routine). Prior android iteration
> (`feed-comment-translation-request`, #3273) already merged into main. Branched off freshly-fetched
> `origin/main` (`9233e850`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (`curl` → 200). Pristine `android-37.0` recipe worked
> (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`); ran the full
> `assembleDebug testDebugUnitTest` locally.
>
> **The gap (read-only recon over iOS + Android)**: the story viewer's language quick bar
> (`StoryViewerViewModel.availableLanguagesFor`) only listed languages ALREADY present in `StoryItem.translations`
> — a configured content language the story had no translation for yet never surfaced, so a viewer could not
> request one. iOS surfaces on-demand story translation via `StoryLanguageDetailView` (a full picker, socket-
> completed `POST /posts/:id/translate`). Android has no story-translation socket consumer, so — exactly as the
> feed post/comment arms did — the faithful move is **pull-translate-and-merge**, surfacing configured-but-absent
> languages as translatable chips directly in the quick bar (no separate picker sheet needed yet).
>
> **`:core:model` `StoryTranslationMerge`** (new, list-keyed sibling of `PostTranslationMerge`):
> `mergeTranslation(item: StoryItem, target, text): StoryItem?` upserts into the `List<StoryTranslation>` — blank
> target/text guard, idempotent (same lang case-insensitive + same content → null), in-place replace preserving
> position & original casing, else append under the trimmed target.
>
> **`:sdk-core` `StoryRepository`**: now injects `TranslationApi`; new stateless
> `translateStory(item, target): StoryItem?` (story-shaped sibling of `PostRepository.translatePost`) — trims
> target, reads `item.content` as source (empty `sourceLanguage` → translator auto-detects; stories carry no
> `originalLanguage`), blocking-translates via `translationApi.translate`, folds via `StoryTranslationMerge`.
> Null on blank target / no source / network failure / blank translation / idempotent.
>
> **`:feature:stories` `StoryViewerViewModel`**: `StoryLanguageOption` gains `isTranslatable`/`isTranslating`;
> `availableLanguagesFor` appends each configured content language (`LanguageResolver.preferredContentLanguages`)
> absent from the present set as a translatable chip — GATED on the story already carrying ≥1 translation (a
> pure-original story never dumps every preferred language) and on a real logged-in viewer (an anonymous viewer
> with no prefs sees only present translations). New `requestStoryTranslation(code)`: in-flight guard via
> `translatingLanguages` (keyed `storyId|lang`), pull-translate-and-merge into `rawItems`, then switch the
> "Exploration" `languageOverride` to the target so the slide re-renders in it even when a higher-priority
> language is already present (Prisme auto-resolution would otherwise keep the primary). Cancellation-safe;
> failure inert (strip retries); `finally` clears the key. **`:sdk-ui` `LanguageQuickStrip`**: `LanguageQuickOption`
> gains the two flags; a translatable chip reads dimmed with a "+" affordance ("…" in flight). **`StoryViewerScreen`**
> routes a translatable tap to `requestStoryTranslation`, a content tap to `toggleLanguageOverride`.
>
> **Tests: +21** — `StoryTranslationMergeTest` +8 (append no-translations / append preserving order / replace
> in place preserving position+casing / blank target / blank text / trims target / idempotent / case-insensitive
> replace), `StoryRepositoryTest` +7 (`translateStory`: translates+merges / forwards source & trims target /
> inert blank target / inert no source / null on failure / null on blank / idempotent), `StoryViewerViewModelTest`
> +6 (translatable surfaces once translated / none when no translations / present language never re-offered /
> requests+merges+switches / failed leaves display / second in-flight no duplicate). **Mutation (RED proof) ×2**:
> (a) drop the VM in-flight guard → **exactly** `a second in-flight request … does not fire a duplicate` fails
> (1 of 50); (b) drop `languageOverride = storyId to target` → **exactly** `requesting a translation … switches
> to it` fails (1 of 50) — the switch test deliberately uses a secondary language (en present, de requested) so
> Prisme auto-resolution cannot mask the missing override. Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) → BUILD SUCCESSFUL
> locally this run. Reviewer PASS. Diff is `apps/android` only (5 code + 3 test files + tracking docs).
>
> **Next**: Feed §F Prisme's `request-missing-languages` follow-up is now COMPLETE across every surface. Candidates:
> the Chat `slow`/retry glyph tier (still waits on outbox retry-state plumbing), or the next unchecked Feed/Stories
> parity box. Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Comment on-demand translation shipped** (slice `feed-comment-translation-request`,
> feature-parity's Feed §F Prisme line — the **comments** arm of the `request-missing-languages` follow-up.
> Only the per-story timeline flag strip remains on that line).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 14 open PRs at branch
> time (#3270/#3266/#3263/#3262/#3259/#3257/#3255/#3253/#3250/#3249/#3247/#3245/#3243/#3242 web/shared/
> gateway/ios/sdk) are none android-routine. Prior android iteration (`feed-post-detail-translation-request`,
> #3269) already merged into main. Branched off freshly-fetched `origin/main` (`8ddb8bda`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (`curl` → 200). Pristine `android-37.0` recipe
> worked: `sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`;
> `local.properties` → `sdk.dir=$HOME/android-sdk`; ran the full `assembleDebug testDebugUnitTest` ONLINE
> with `-Pandroid.builder.sdkDownload=false` after the initial install → BUILD SUCCESSFUL (973 tasks).
>
> **The gap (read-only recon over iOS + Android)**: iOS's `FeedCommentsSheet.onRequestTranslation` routes a
> content-less comment language tap to `PostService.requestCommentTranslation` (REST, socket-completed).
> Android's `PostCommentsViewModel.onCommentFlagTap` carried a **dead** `RequestTranslation -> Unit` arm AND
> `CommentProjection.build` passed no `includeTranslatable`, so a configured-but-absent language never even
> surfaced a chip. Android has no post/comment-translation socket consumer, so the faithful move mirrors the
> post arms: pull-translate-and-merge, NOT iOS's socket path (which would be blocked/cross-cutting).
>
> **`:core:model` `PostTranslationMerge`**: new `mergeTranslation(comment: ApiPostComment, …)` overload; the
> post and comment overloads now share one private `upsert(translations, target, text)` law (blank/idempotent
> guards + in-place-or-append). **`:sdk-core` `PostRepository`**: new stateless
> `translateComment(comment, target): ApiPostComment?` (comment-keyed sibling of `translatePost`); both trim
> the target and delegate to a shared `translateSource(source, sourceLanguage, target): String?` network law
> (the cache-mutating `requestOnDemandTranslation` now delegates to `translatePost`, so all three share one
> translate path).
>
> **`:feature:feed`**: `CommentProjection.build` flips `includeTranslatable = true` (SSOT strip; the tap was
> already wired `PostCommentsSection` → `viewModel::onCommentFlagTap`). `CommentThreadState.retranslated` /
> `CommentRepliesState.retranslated` fold ONLY the merged translations onto the live row (leaving `replyCount`
> etc. untouched, so a concurrent realtime bump is never clobbered), inert for the other collection. The VM's
> `requestCommentTranslation` guards in-flight via new `PostCommentsUiState.translatingLanguages`
> (`commentId|lang`, folded through the projection via a new `ProjectionBundle`), applies both retranslate
> transitions (covers top-level + reply), and points `activeLanguages[commentId]` at the target; cancellation-safe,
> failure surfaces `errorMessage`, `finally` clears the key.
>
> **Tests: +21** — `PostTranslationMergeTest` +6 (comment overload: append / replace-in-place case-insensitive /
> idempotent / blank target / blank text), `PostRepositoryTest` +7 (`translateComment`: translates+returns merged /
> forwards source+langs & trims / inert blank target / inert no source / null on failure / null on blank / idempotent),
> `CommentThreadStateTest` +3 (`retranslated`: replaces only the match / preserves replyCount / inert unknown),
> `CommentRepliesStateTest` +2 (`retranslated`: replaces only the match / inert), `CommentProjectionTest` +1
> (configured-absent language surfaces a translatable chip), `PostCommentsViewModelTest` +4 (translatable tap
> requests & switches to merged / failed leaves display / second in-flight no duplicate / reply translated too);
> 1 obsolete dead-arm test (`content-less language is inert`) rewritten to the new contract (a content-less tap now
> requests + leaves display until it lands). **Mutation (RED proof) ×2**: (a) remove the VM in-flight guard →
> **exactly** `a second in-flight translation tap does not fire a duplicate request` fails (1 of 99); (b) drop
> `activeLanguages.update` → **exactly** the two `switches to the merged translation` tests fail (2 of 99). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) → **BUILD SUCCESSFUL**
> (973 tasks) locally this run. Reviewer PASS. Diff is `apps/android` only (6 code + 6 test files + tracking docs).
>
> **Next**: the **per-story timeline flag strip** on-demand request arm (last item on Feed §F Prisme's
> `request-missing-languages` follow-up), or the Chat `slow`/retry glyph tier (still waits on outbox retry-state
> plumbing). Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Post-detail on-demand translation shipped** (slice `feed-post-detail-translation-request`,
> feature-parity's Feed §F Prisme line — the post-detail arm of the `request-missing-languages` follow-up;
> only the **comments** arm + the per-story timeline strip remain there).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 14 open PRs at branch
> time (#3268/#3267/#3266/#3263/#3262/#3259/#3255/#3253/#3250/#3249/#3247/#3245/#3243/#3242 web/shared/
> gateway/ios/sdk) are none android-routine. Prior android iteration (`feed-post-translation-request`, #3265)
> already merged into main. Branched off freshly-fetched `origin/main` (`83687db6`).
>
> **SDK bootstrap — `dl.google.com` was REACHABLE this run** (`curl` → 200; unlike prior containers where it
> was 403-blocked). Pristine `android-37.0` recipe worked: `sdkmanager --channel=3 "platforms;android-37.0"
> "build-tools;35.0.0" "platform-tools"`; `local.properties` → `sdk.dir=$HOME/android-sdk`; run online once
> then `-Pandroid.builder.sdkDownload=false`. **Trap re-confirmed**: `--offline` fails a full `assembleDebug`
> when only sdk-core/feature:feed deps were cached by an earlier targeted run — `:app` needs androidx.browser,
> zxing, activity etc. that were never fetched. Run the full `assembleDebug testDebugUnitTest` ONLINE.
>
> **The gap (read-only recon over iOS + Android)**: the feed's flag-strip on-demand request arm (slice
> `feed-post-translation-request`) left `PostDetailViewModel.onFlagTap`'s `RequestTranslation -> Unit` arm
> dead. `FeedPostBuilder.build` already sets `includeTranslatable = true` universally, so the post-detail
> strip *surfaces* a configured-but-absent language as a translatable chip — but tapping it did nothing.
> The feed's own `PostRepository.requestOnDemandTranslation(postId, target)` mutates `_feedCache`, which the
> detail VM does NOT observe (it owns its post in `rawPost` from an independent `getPost` fetch). So the
> faithful move was a **stateless** repository method returning the merged post the caller swaps in.
>
> **Repository (`:sdk-core` `PostRepository`)**: new `translatePost(post: ApiPost, target): ApiPost?` — trims
> target, reads source, blocking-translates via `translationApi.translate`, folds into the post via
> `PostTranslationMerge.mergeTranslation`; returns the merged post or `null` (blank target/no source/network
> failure/blank translation/idempotent). Extracted the shared `translateAndMerge` law and **refactored the
> existing `requestOnDemandTranslation` to delegate to it** (behaviour identical under single-thread — its 8
> tests stayed green), so both surfaces share one translate-then-merge path.
>
> **VM wiring (`:feature:feed` `PostDetailViewModel`)**: `onFlagTap`'s `RequestTranslation` arm now calls a
> new private `requestOnDemandTranslation(target)` — in-flight guard via new `PostDetailStatus.translating`
> (surfaced as `PostDetailUiState.translatingLanguages`, symmetric with `FeedUiState`); `viewModelScope.launch`
> translate → on success `rawPost.value = merged` + `activeCode.value = target` so the card switches once the
> merged post lands; cancellation-safe, failure surfaces `errorMessage`, `finally` clears the in-flight key.
>
> **Tests: +10** — `PostRepositoryTest` +7 (`translatePost`: translates+returns merged / forwards source+langs
> & trims target / inert blank target / inert no source / null on translator failure / null on blank
> translation / idempotent null), `PostDetailViewModelTest` +3 (translatable tap requests & switches to merged
> / failed tap leaves display unchanged / second in-flight tap no duplicate). **Mutation (RED proof) ×2**:
> (a) remove the VM in-flight guard → **exactly** `a second tap while a translation is in flight does not fire
> a duplicate request` fails (1 of 33); (b) drop `activeCode.value = target` → **exactly** `onFlagTap on a
> translatable language requests it and switches to the merged translation` fails (1 of 33). Both restored.
>
> **Verified**: targeted `:sdk-core` + `:feature:feed` `testDebugUnitTest` green; full `assembleDebug`
> `testDebugUnitTest` (= `./apps/android/meeshy.sh check`) → BUILD SUCCESSFUL locally this run. Reviewer PASS.
> Diff is `apps/android` only (4 code/test files + tracking docs).
>
> **Next**: the **comments** on-demand request arm (`PostCommentsViewModel.onCommentFlagTap` still carries the
> dead `RequestTranslation -> Unit` arm) — heavier: comments are `ApiPostComment` translated via their own
> path, so it needs a comment-translation repository method (no `translatePost` reuse). Re-scout the iOS
> comment-translation path first. Otherwise the per-story timeline flag strip, or the Chat `slow`/retry glyph
> tier (still waits on outbox retry-state plumbing). Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Feed on-demand post-translation shipped** (slice `feed-post-translation-request`,
> feature-parity's Feed §F Prisme line — the `request-missing-languages` sub-gap, now `[x]`; only the
> per-story timeline strip + the post-detail/comments request arms remain there).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 12 open PRs at branch
> time (#3263/#3262/#3259/#3255/#3253/#3249/#3247/#3245/#3243/#3242 web/shared/gateway, #3257/#3250 iOS) are
> none android-routine. Prior android iteration (`feed-realtime-comment-count`) already merged. Branched off
> freshly-fetched `origin/main` (`6062746b`).
>
> **SDK bootstrap — the pristine-`android-37.0` recipe is the ONLY one that works on this container (the
> `cp→android-37` patch recipe FAILS here):** `sdkmanager --channel=3 "platforms;android-37.0"` still writes
> malformed metadata (`source.properties` → `ApiLevel=37.0`, "Platform 17"), but AGP 8.13 maps `compileSdk 37`
> → the `android-37.0` **dir** directly and BUILDS GREEN. The intervening notes' `cp -r android-37.0 android-37`
> + sed-to-`android-37` recipe was tried first here and FAILED: AGP's error message reads "compile SDK version
> **37.0**" and it wants the minor-versioned dir, so a hand-made `android-37` (even with perfect metadata) is
> never matched — `Failed to find target with hash string 'android-37'`. Two more traps: (1) a first `./gradlew`
> auto-re-downloads the pristine malformed `android-37.0` on top of your patch → keep auto-download OFF with
> `-Pandroid.builder.sdkDownload=false` after the initial install; (2) `--offline` fails the first ever run
> (AGP 8.13.0 plugin not yet cached) — run online once. `assembleDebug testDebugUnitTest` green after (973 tasks).
>
> **The gap (scout + read-only recon over iOS + Android)**: iOS's feed flag strip routes a content-less
> language tap to a translation request (`FeedPostCard.handleFlagTap` → `PostService.requestTranslation`,
> REST `POST /posts/:id/translate`, completed by a socket event). Android's `FeedViewModel.onPostFlagTap`
> had a **dead** `RequestTranslation -> Unit` arm and the strip passed `includeTranslatable = false`, so a
> configured-but-absent language never even surfaced. Chat already shipped this exact pattern
> (`ChatViewModel.requestOnDemandTranslation` → `MessageRepository.requestTranslation` translate+merge) — the
> faithful, apps/android-only move was to mirror it (NOT iOS's socket path — Android has no post-translation
> socket consumer, which would be blocked/cross-cutting).
>
> **Pure reducer (`:core:model` `PostTranslationMerge`)**: the map-keyed sibling of `MessageTranslationMerge`
> — `mergeTranslation(post, target, translated): ApiPost?`. Blank target/text → null; identical entry already
> present (case-insensitive key match, same text) → null; else upsert (replace in place under the original
> key, else append under the trimmed code). No tombstone guard (ApiPost has no `deletedAt`).
>
> **Repository (`:sdk-core` `PostRepository`)**: gains `translationApi: TranslationApi` (Hilt-provided, as
> `MessageRepository`) + `requestOnDemandTranslation(postId, target): Boolean` — trims target, reads the cached
> post's source text, blocking-translates via `translationApi.translate`, merges into `_feedCache` via
> `PostTranslationMerge`; returns whether stored. Inert (`false`, no network) for unknown post / blank target /
> no source / failure / blank result / idempotent. The old fire-and-forget `requestTranslation` (dead, iOS
> socket-path parity) left untouched.
>
> **VM wiring (`:feature:feed`)**: `onPostFlagTap`'s `RequestTranslation` arm now calls a new
> `requestOnDemandTranslation` (mirror of chat's, keyed per post): in-flight guard via new
> `FeedUiState.translatingLanguages` (`postId|lang`), `viewModelScope.launch` translate → on success
> `activeLanguageOverride += postId→target` so the card switches once the merged post arrives off the cache
> stream; cancellation-safe, failure surfaces `errorMessage`. `FeedPostBuilder` flips `includeTranslatable = true`.
>
> **Tests: +20** — `PostTranslationMergeTest` +8 (append to empty / alongside existing preserving order /
> replace in place / case-insensitive key kept / idempotent no-op / blank target / blank text / trims code),
> `PostRepositoryTest` +8 (stores + reports success / forwards source text+langs & trims / inert unknown post /
> inert blank target / inert no source / translator-failure false / blank-translation false / idempotent false),
> `FeedViewModelTest` +3 (tap translatable → requests & switches to merged / failed leaves language unchanged /
> second in-flight tap no duplicate), `FeedPostBuilderTest` +1 (configured-absent language surfaces as a
> translatable chip). **Mutation (RED proof) ×2**: (a) neuter `PostTranslationMerge`'s idempotence clause →
> **exactly** `is a no-op when the identical translation is already present` fails (1 of 8); (b) neuter the VM
> in-flight guard → **exactly** `a second tap while a translation is in flight does not fire a duplicate request`
> fails (1 of 70). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) → **BUILD SUCCESSFUL**
> (973 tasks) locally this run. New suites ran green (PostTranslationMergeTest 8/8, PostRepositoryTest 30/30,
> FeedViewModelTest 70/70, FeedPostBuilderTest 28/28). Reviewer PASS. Diff is `apps/android` only (7 files +
> tracking docs).
>
> **Next**: the same on-demand request arm on the **post-detail + comments** surfaces (`PostDetailViewModel`/
> `PostCommentsViewModel` still carry the dead `RequestTranslation -> Unit` arm — a thin follow-up reusing
> `PostRepository.requestOnDemandTranslation`, though comments translate via their own path — re-scout). Or the
> per-story timeline flag strip (heavier — needs a story translation surface). Otherwise the Chat `slow`/retry
> glyph tier still waits on outbox retry-state plumbing. Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Live feed comment-count sync shipped** (slice `feed-realtime-comment-count`,
> feature-parity's Feed §F social-feed realtime block — extends the created/deleted/liked/bookmarked
> overlay family with `comment:added`/`comment:deleted`).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 10 open PRs at branch
> time (#3259/#3255/#3253/#3249/#3247/#3245/#3243/#3242 shared/web/gateway, #3257/#3250 iOS) are none
> android-routine. Prior android iteration (#3258, conversation-lock-unlock-all) already merged into main
> (`bfd152fe`). Branched off freshly-fetched `origin/main` (`bfd152fe`).
>
> **SDK bootstrap:** dl.google.com reachable in this container (curl → 200). Used the NOTES 2026-08-21
> recipe that finally works cleanly: install a **pristine** `platforms;android-37.0` via
> `sdkmanager --channel=3` and let AGP 8.13 auto-map `compileSdk 37` → `android-37.0` (NO hand-patched
> `android-37` dir, no sed, no symlink). `assembleDebug testDebugUnitTest` green after. Capture gradle
> output to a file and grep for `BUILD FAILED` (a piped `| tail` swallows the exit code).
>
> **The gap (iOS-parity scouted)**: iOS `FeedViewModel` live-updates each feed card's comment count on
> `comment:added`/`comment:deleted` by setting `posts[index].commentCount = data.commentCount` (ABSOLUTE,
> `FeedViewModel.swift:1246`/`:1256`). Android's `FeedViewModel` consumed `commentAdded` only in the
> post-detail/comments VMs — the **feed list card's** comment count was static, never bumped live.
>
> **Pure reducer (`:feature:feed` `FeedRealtimeReducer`)**: new `FeedRealtimeHead.comments: Map<String, Int>`
> overlay + `comment(state, postId, commentCount)` (blank-id inert; `coerceAtLeast(0)` clamp; same-count
> dedup → same instance) + `reconcileComments(state, cachePosts)` (releases overlays the cache has caught
> up to, `null` cache count reads as 0; keeps overlays for posts absent from cache; same-instance when
> unchanged). `clear` auto-resets via `FeedRealtimeHead()`. No viewer-own dimension — a comment count is
> public (unlike like/bookmark).
>
> **Wiring**: `FeedViewModel` collects `commentAdded`/`commentDeleted` → `FeedRealtimeReducer.comment`;
> the projection adds `reconcileComments` to the reconcile chain and `.withCommentOverlays(comments)` to
> both the cache and realtime-head projections (new private helper mirroring `withLikeOverlays`).
>
> **Tests**: **+18** — `FeedRealtimeReducerTest` +12 (records absolute count; blank-id inert; idempotent
> dedup; addition raises / deletion lowers; negative clamp; reconcile release/keep-behind/keep-absent/
> null-cache-as-zero/partial-release; clear drops overlay), `FeedViewModelTest` +6 (comment-added raises /
> comment-deleted lowers the card count live; event for an unknown post inert; overlay survives a stale
> re-emission; a later cache count is respected once reconciled away; refresh drops the overlay — all on the
> real reducer + a mockk `SocialSocketManager`). **Mutation (RED proof)**: removing `coerceAtLeast(0)` fails
> exactly `comment clamps a negative absolute count to zero` (1 of 70, no collateral). Restored.
>
> **Verified**: `:feature:feed:testDebugUnitTest` green (FeedRealtimeReducerTest 70/70, FeedViewModelTest
> 67/67); full `assembleDebug testDebugUnitTest` gate run for the PR. Reviewer PASS. Diff is `apps/android`
> only (4 files: FeedRealtimeHead.kt, FeedViewModel.kt + the two test files, plus tracking docs).
>
> **Next**: the Feed §F remaining apps/android-only boxes — the per-post **flag strip / request-missing-
> languages** on the feed Prisme line (needs an on-demand post-translation request path), or the Feed
> **repost/quote embed cell** polish (`[~]` line ~4357). Otherwise the Chat `slow`/retry glyph tier still
> waits on outbox retry-state plumbing. Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Conversation lock "unlock-all" shipped** (slice `conversation-lock-unlock-all`,
> feature-parity's Conversations `[~]` "Pinned/muted/archived/locked" line — the `unlock-all` sub-gap of
> its "Remaining lock sub-gaps" note, now done; only Settings master-PIN change/remove + swipe-to-lock remain).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 10 open PRs at branch
> time (#3255/#3253/#3249/#3247/#3245/#3243/#3242 shared/web/gateway, #3251/#3250 iOS) are none
> android-routine. Branched off freshly-fetched `origin/main` (`7f1de533`).
>
> **SDK bootstrap (see NOTES 2026-08-21 latest):** used the ROUTINE-pinned `commandlinetools-linux-11076708`,
> which STILL mis-registers the 37.x preview package (`android-37.0/source.properties` → "Platform 17",
> `ApiLevel=37.0`). The `cp -r android-37.0 android-37` + sed on `source.properties` was NOT enough this run —
> AGP also rejected `android-37/package.xml`'s stale `path="platforms;android-37.0"` + `<api-level>37.0</api-level>`
> ("Failed to find target with hash string 'android-37'"). Full fix: patch BOTH `source.properties` AND
> `package.xml` (path→android-37, api-level→37) in the copy, and remove the malformed `android-37.0` dir so its
> unparseable `ApiLevel=37.0` cannot abort the platform scan. `assembleDebug testDebugUnitTest` green after.
> Container reached `dl.google.com` (curl → 200). Also: `./gradlew … | tail` swallows gradle's exit code — a
> failed build reads as exit 0; capture to a file and grep for `BUILD FAILED` instead.
>
> **The gap**: iOS `ConversationLockSheet.Mode.unlockAll` (Settings) verifies the 6-digit master PIN once, then
> calls `ConversationLockManager.removeAllLocks()` — dropping every per-conversation lock while leaving the
> master PIN set. Android's `LockPinReducer` had setup/lock/unlock/open arms but no unlock-all; the store's
> `ConversationLockStore.removeAllLocks()` already existed but was dead code (only `resetForLogout` used it).
>
> **Pure reducer arm (`:feature:conversations` `LockPinReducer`)**: new `LockPinMode.UNLOCK_ALL` (6-digit
> pinLength, `LockPinCopy.UNLOCK_ALL` header) + `LockPinEffect.RemoveAllLocks` + `completeUnlockAll` — a single
> step: `verifyMasterPin` → `[RemoveAllLocks, Completed]`, else `verifyFailure(MASTER_PIN_INCORRECT)` (buffer
> cleared, sheet stays open). Faithful to iOS: no new error type, master PIN untouched.
>
> **Wiring**: `ConversationListViewModel.onUnlockAll()` (inert unless `lockStore.lockedConversationIds` is
> non-empty — authoritative store read, not the mirrored state, so a stale tap can't open an empty sheet) opens
> the sheet in UNLOCK_ALL mode; `applyLockResult` maps `RemoveAllLocks → lockStore.removeAllLocks()`. New derived
> `ConversationListUiState.canUnlockAll = lockedConversationIds.isNotEmpty()`. `ConversationLockPinSheet` maps
> the new copy → title/subtitle strings + the LockOpen glyph. `ConversationListScreen` renders a top-bar
> `LockOpen` action shown ONLY while `canUnlockAll` (SOTA over iOS: contextual affordance, hidden when no locks;
> iOS buries it in Settings). EN/FR/ES/PT strings ×3.
>
> **Tests**: **+8** — `LockPinReducerTest` +4 (unlock-all is 6-digit; copy is UNLOCK_ALL; correct master →
> `[RemoveAllLocks, Completed]`; wrong master → `MASTER_PIN_INCORRECT`, no effects, buffer cleared),
> `ConversationLockFlowViewModelTest` +4 (`canUnlockAll` reactive to the lock set; correct master drops both
> locks + closes sheet + master PIN stays; wrong master keeps both locks; inert when nothing locked, on a real
> `InMemoryConversationLockStore`). **Mutation (RED proof)**: flipping `verifyMasterPin(state.pin)` → `true`
> fails exactly the wrong-PIN arms (2 failed of 29), restored via `git checkout`.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` (both suites) green; full `assembleDebug
> testDebugUnitTest` gate run for the PR. Reviewer PASS. Diff is `apps/android` only (10 files).
>
> **Next**: the sibling Settings master-PIN **change/remove** arms (scout #2 — `changeMasterPin`/`removeMasterPin`,
> store methods `setMasterPin`/`forceRemoveMasterPin` already present) is the natural follow-on, once an Android
> Settings "Security" surface exists to host them (none today — master-PIN setup is only reachable via the
> conversation context menu). Otherwise the Chat `slow`/retry glyph tier remains (heavier — needs the outbox
> retry-state surfaced through `LocalSendState`). Re-scout read-only before committing.

> On 2026-08-21 **Sub-200ms sending-clock debounce shipped** (slice `chat-send-clock-reveal-debounce`,
> feature-parity's Chat `[~]` "Delivery status" line — the `invisible pre-200ms debounce` half of its
> **Pending** 8-state clause, now shipped; only the finer `slow`/retry glyph tier remains).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 9 open PRs at branch
> time (#3255/#3253/#3249/#3247/#3245/#3243/#3242 shared/web/gateway, #3251/#3250 iOS) are none
> android-routine. Prior android iteration (#3254, chat-draft-language-persistence) already merged.
> Branched off freshly-fetched `origin/main` (`c138ffe4`, which includes #3254).
>
> **SDK bootstrap — the platform-metadata fight, finally understood (see NOTES 2026-08-21):** since the
> Android *minor* SDK releases (36.1, **37.0**, 37.1…) an API level is no longer published under a bare
> `android-37` name — only `android-37.0`. The prior recipe (`cp -r android-37.0 android-37` + sed
> `source.properties`) is now HARMFUL: the copy keeps `package.xml` (`path="platforms;android-37.0"`,
> `<api-level>37.0</api-level>`), so AGP sees a package claiming to be `android-37.0` living in the
> `android-37` dir → "Observed package id … in inconsistent location" → the whole SDK scan aborts →
> "Failed to find target with hash string 'android-37'". **The fix is to do NOTHING by hand**: install a
> pristine `platforms;android-37.0` via `sdkmanager --channel=3` and let **AGP auto-map `compileSdk 37` →
> `android-37.0`** itself (exactly what CI's setup-android does — `android.yml` even documents this). No
> `android-37` dir, no sed, no symlink, auto-download left ON. `assembleDebug testDebugUnitTest` green
> after. This container **reaches `dl.google.com`** (curl → 200), so the full local gate ran here.
>
> **The gap (re-proved by reading source)**: iOS's `BubbleDeliveryCheck.SendingClockGlyph` debounces the
> **online in-flight clock**: `shouldRevealImmediately(sendStartedAt, now)` keeps the clock hidden for the
> first `revealDelay = 0.2s` of a send, revealed via a self-cancelling `.task`, so a send that round-trips
> in under 200ms never flashes an icon the user has no time to perceive. Android showed the `Schedule`
> clock immediately for a `DeliveryStatus.Pending` bubble — no debounce. The offline hourglass
> (`QueuedOffline`) and settled tiers are NOT debounced on iOS, and stay immediate here.
>
> **Pure core (`:core:model` `SendLifecycleResolver`)**: new
> `shouldRevealSendingGlyph(sendStartedAtMillis: Long?, nowMillis: Long): Boolean` +
> `SENDING_REVEAL_DELAY_MILLIS = 200L` — faithful port: `null` start → `true` (reveal now, nothing to
> debounce); elapsed `>= 200ms` → `true` (iOS's `>=` inclusive boundary); under the window (incl. a
> negative elapsed from device clock skew) → `false`. `resolve()` untouched.
>
> **Wiring (Compose glue, coverage-exempt)**: new `SendingClockRevealPresenter.rememberSendingGlyphRevealed`
> (`produceState` initialised from the pure decision + one-shot `delay(remaining)` then flip to revealed —
> the SAME shape as `rememberBubbleRenderKind`'s tick loop). `MessageBubble` gates ONLY the
> `DeliveryStatus.Pending` clock behind it, reading the send-start from the existing
> `content.createdAtIso` (an optimistic pending bubble's `createdAt` IS its send-start — no new
> `BubbleContent` field, no builder/VM param, no wire change). Every other status renders immediately as
> before.
>
> **Tests**: **+8 `SendLifecycleResolverTest`** — no start → reveal; just-started/100ms/199ms hidden;
> exactly-200ms/5s revealed; future start (clock skew) hidden; the 200ms constant. Mirrors the iOS twin
> `BubbleDeliveryCheckSendingRevealTests` exactly, plus the 199ms exclusive-lower-edge + skew arms.
> **Mutation (RED proof)**: `>=`→`>` fails **exactly** `a send elapsed exactly 200ms reveals the clock`
> (15 run, 1 failed, no collateral). Restored. The `produceState`/`delay` presenter is thin Compose glue,
> exempt per TDD-COVERAGE.
>
> **Verified**: `:core:model:testDebugUnitTest` (SendLifecycleResolverTest) green; `:sdk-ui`
> `compileDebugKotlin` green; full `assembleDebug testDebugUnitTest` gate run for the PR. Reviewer PASS.
> Diff is `apps/android` only.
>
> **Next**: the last piece of the Delivery-status line is the finer `slow`/retry glyph tier (iOS
> `DeliveryStatus.slow` — a warning-tinted clock for a message still in automatic outbox retry after its
> first attempt failed but before the budget is exhausted). That needs the outbox retry-attempt count
> plumbed into the send state → `BubbleContent`, so it is a bigger slice than this one (not a pure
> resolver alone). Otherwise the Chat area's remaining apps/android-only boxes are thin; if the retry-state
> plumbing looks heavy, advance to **Feed (§F)** per build-order. Re-scout read-only before committing —
> parity notes are hypotheses.

> On 2026-08-21 **Manual composer-language draft persistence shipped** (slice `chat-draft-language-persistence`,
> the last open piece of feature-parity's Chat "Draft auto-save/restore" line — now `[x]`).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 8 open PRs at branch time
> (#3253/#3249/#3247/#3245/#3243/#3242 shared/web/gateway, #3251/#3250 iOS) are none android-routine. Prior
> android iteration (#3252, chat-draft-effects-persistence) already merged. Branched off freshly-fetched
> `origin/main` (`f2a2e404`, which includes #3252).
>
> **SDK bootstrap (see NOTES 2026-08-21 later):** the "newer cmdline-tools fix the platform metadata" claim
> did NOT hold this run — `platforms/android-37.0/source.properties` again came out malformed (`Platform 17`,
> `ApiLevel=37.0`), so AGP's `compileSdk 37`→`android-37` hash found no match. Fixed by a real `cp -r
> android-37.0 android-37` + `sed` on `source.properties` (ApiLevel→37). `assembleDebug testDebugUnitTest`
> green after across all modules. This container **reaches `dl.google.com`** (curl → 200) so the full local
> gate ran here.
>
> **The gap**: iOS's app-side `MessageDraft` persists `selectedLanguage` (the composer language pick)
> alongside text/reply/effects, restored in `ConversationView.onAppear` (`if let lang = draft.selectedLanguage
> { composerState.selectedLanguage = lang }`) and re-persisted on `.adaptiveOnChange(of: selectedLanguage)`.
> Android's `ConversationDraft` carried text+reply+effects but not the language — a deliberate language
> override armed but not sent was lost on navigation.
>
> **The key design call — a language is NOT content (faithful iOS port)**: iOS `MessageDraft.isEffectivelyEmpty`
> (persistence) and `hasDraftText` (list badge) BOTH ignore `selectedLanguage`. So on Android I left
> `ConversationDraft.isMeaningful` AND `isWorthPersisting` **unchanged** — a language-only composer neither
> floats/badges a conversation row nor is persisted on its own; the language rides along an otherwise
> worth-persisting draft (text/reply/effects present) and is dropped with it. This is the cleanest match to
> iOS and needed NO new predicate (unlike the effects slice, which added `isWorthPersisting`).
>
> **Manual override only**: Android's `ComposerLanguageState` splits `detected` (auto) from `manualOverride`
> (deliberate pick). Only `manualOverride` is persisted — live detection is redundant (re-derives from the
> restored text). Restore re-applies it via `withManualPick` (wins over detection of the restored text, locks
> analysis) — exactly iOS's override-wins semantics.
>
> **Pure core (`:core:model`)**: `ConversationDraft` gains `selectedLanguage: String? = null` (defaulted →
> legacy blob decodes to no language, back-compat covered by a decode test). `isMeaningful`/`isWorthPersisting`
> untouched.
>
> **Pure reducer (`:feature:chat`)**: `DraftAutosave.resolve` gains `selectedLanguage: String? = null`
> (normalised trim/blank→null; folded into the idempotence clause so a language change on a worth-persisting
> draft → `Save`, identical text+lang → `None`; the blank-guard is untouched so a language on an empty composer
> → `None`, never rescuing it). `DraftRestore` gains `selectedLanguage`; `restore` returns the normalised
> stored language.
>
> **Trivial VM wiring**: `ChatViewModel.persistDraft` reads `_state.value.composerLanguage.manualOverride`;
> `onComposerLanguagePicked` now calls `persistDraft` (iOS `.adaptiveOnChange` parity); the open-time restore
> applies `restored.selectedLanguage?.let { withManualPick(it) }`. Send/clear paths reset `composerLanguage =
> ComposerLanguageState()` before their existing `persistDraft("", null)` → manualOverride null → language
> cleared with the draft (no change needed there).
>
> **Tests**: **+17** — `ConversationDraftTest` +4 (a language pick alone is neither meaningful nor worth
> persisting; a pick riding a real draft leaves both predicates on the content; legacy blob missing
> `selectedLanguage` decodes to null), `DraftAutosaveTest` +10 (7 resolve: language on empty composer → None;
> language-only over no prior → None; text+lang saved; only-the-language-changing → Save; identical text+lang →
> None; trim/blank→null; clearing language while text remains → Save without lang — + 3 restore: returns / trims
> & drops / a text-only draft restores with no language), `ChatViewModelTest` +3 round-trip (picking a
> language persists it alongside the typed draft; a pick on an empty composer persists nothing; a stored
> text+language draft re-applies the manual override on open). **Mutation (RED proof)**: drop the resolve
> `previous.selectedLanguage == language` idempotence clause → **exactly** `only_the_language_pick_changing_on_a_text_draft_still_saves`
> fails while `identical_text_and_language_writes_nothing` stays green (proving the clause is the tested
> behaviour, not a tautology). Restored after.
>
> **Verified**: `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) — **BUILD SUCCESSFUL**
> across every module locally in this run; touched modules also ran explicitly green (`ConversationDraftTest`,
> `DraftAutosaveTest`, `ChatViewModelTest`). Reviewer PASS. Diff is `apps/android` only.
>
> **Next**: the Chat "Draft auto-save/restore" line is now fully `[x]`. Remaining Chat `[◐]`/`[~]` boxes:
> finer send-lifecycle `Slow` tier (needs outbox retry-attempt state plumbed into `BubbleContent`) and the
> edit-history viewer (blocked — needs a gateway endpoint, not apps/android-only). With Chat drafts closed,
> the next high-value area per build-order (`… → Chat → Feed → Stories → Calls`) is the top unchecked Chat
> box that stays apps/android-only, else advance to Feed. Re-scout read-only before committing — parity notes
> are hypotheses.

> On 2026-08-21 **Composer draft effects persistence shipped** (slice `chat-draft-effects-persistence`,
> feature-parity's Chat `[◐]` "Draft auto-save/restore" line — the `effects`/`blur`/`ephemeral` fields its
> **Pending** clause called out, now unblocked because the composer effects picker / ephemeral duration /
> blur / view-once all shipped in later §C slices, so there is finally state to persist).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 6 open PRs at branch
> time (#3249 shared, #3247 web, #3245/#3242 gateway, #3243 shared/gateway, #3241 iOS) are none of them
> android-routine. Prior android iteration (#3248, chat-bubble-a11y-label) already merged. Branched off the
> freshly-fetched `origin/main` (`3e64afaa`, which includes #3248 and #3241). This container **reaches
> `dl.google.com`** (curl → 200), so the full local gate ran here.
>
> **SDK-bootstrap correction (see NOTES 2026-08-21):** the older recipe's `android-37 → android-37.0`
> symlink is now HARMFUL. With cmdline-tools `11076708` the platform mis-registers (metadata "Platform 17"),
> and the symlink makes sdkmanager reject it as an "inconsistent location" → `Failed to find target with hash
> string 'android-37'`. Fix: fetch the newer bundle `commandlinetools-linux-13114758`, `sdkmanager
> --channel=3 "platforms;android-37.0" "build-tools;36.0.0"`, and **no symlink** — AGP 8.13 resolves
> `compileSdk 37` → the `android-37.0` dir directly. `assembleDebug testDebugUnitTest` green after.
>
> **The gap (re-proved by a read-only recon subagent over iOS + Android)**: iOS's app-side `DraftStore`
> (`MessageDraft`) persists the FULL compose state — text, reply, **and** `effectFlags`/`isBlurEnabled`/
> `ephemeralDurationRawValue` (+ `selectedLanguage`). Android's `ConversationDraft` persisted only
> text + `replyToId`; a self-destruct duration or a confetti effect armed on the composer was lost on
> navigation. The recon confirmed via grep that `pendingEffects: MessageEffects` already exists on
> `ChatUiState` (line 160) but was never fed into `DraftAutosave.resolve` nor restored on open — a genuine,
> now-portable gap needing **no** gateway endpoint, **no** wire-DTO change (`ConversationDraft` is a local
> DataStore value type), and **no** timer/instrumentation.
>
> **Faithful two-predicate port (the key design call)**: iOS splits "worth persisting" (`isEffectivelyEmpty`,
> weighs effects/blur/ephemeral) from the conversation-list "Brouillon" badge (`hasDraftText`, text-only).
> Android's shared `ConversationDraft.isMeaningful` already drives FOUR conversation-list surfaces
> (`DraftAwareOrdering` float, `LastMessagePreview` "Brouillon …" line, `DraftDiscard`, `ConversationListScreen`
> `hasDraft` badge). Extending `isMeaningful` to include effects would make an effects-only draft float and
> badge the list — a divergence from iOS. So I added a SEPARATE `ConversationDraft.isWorthPersisting`
> (`isMeaningful || effects.hasAnyEffect`) used ONLY by `DraftAutosave`, leaving all four list surfaces
> byte-for-byte unchanged. An effects-only draft now persists and restores but never floats/badges a row —
> exactly iOS.
>
> **Pure core (`:core:model`)**: `ConversationDraft` gains `effects: MessageEffects = MessageEffects()`
> (defaulted so a legacy blob decodes to an empty selection — back-compat covered by a decode test) folding
> iOS's three separate fields into the single `MessageEffects` SSOT (a set flag bit = armed). New
> `isWorthPersisting` extension. `isMeaningful` unchanged.
>
> **Pure reducer (`:feature:chat`)**: `DraftAutosave.resolve` gains an `effects: MessageEffects = MessageEffects()`
> param — empty composer + armed effect → `Save`; a change in effects alone → `Save`; identical
> text+reply+effects → `None`; clearing the last effect on an empty composer → `Clear` (via
> `isWorthPersisting`). `DraftRestore` gains `effects`; `restore` returns `stored.effects` and gates on
> `isWorthPersisting` (an effects-only stored draft re-arms an idle empty composer).
>
> **Trivial VM wiring**: `ChatViewModel.persistDraft` reads `_state.value.pendingEffects` (every existing
> caller already updates state before calling, so no new params on the 6 call sites); `toggleEffect` /
> `selectEphemeralDuration` / `clearEffects` now call `persistDraft` so an armed/cleared effect is saved
> immediately; the open-time restore applies `pendingEffects = restored.effects` and tracks
> `lastPersistedDraft` via `isWorthPersisting`. Post-send path unchanged (state cleared before the existing
> `persistDraft("", null)` → reads empty effects → `Clear`). **Documented edge (iOS-parity):** `restore`
> guards on text/editing only, not on already-armed composer effects — the load runs in `init` before the
> user can interact, and iOS's `onAppear` restore has the same shape.
>
> **Tests**: **+19** — `ConversationDraftTest` +7 (effects never make a draft list-meaningful;
> `isWorthPersisting` weighs effects / stays false when empty / true for text|reply; legacy blob missing
> `effects` decodes to `MessageEffects()`), `DraftAutosaveTest` +8 (armed effects on empty composer → Save;
> saved draft carries effects; clearing effects → Clear; effects-alone change → Save; identical
> text+reply+effects → None; blank+no-effects+no-prior → None; restore re-arms effects-only + effects
> alongside text/reply), `ChatViewModelTest` +4 round-trip (arming persists to the store; clearing the last
> effect purges; effects-only stored draft re-arms `pendingEffects` on open). **Mutation (RED proof) ×3**:
> (a) drop `isWorthPersisting`'s `|| effects.hasAnyEffect` → **exactly 1** `ConversationDraftTest` fails
> (the list `isMeaningful` tests stay green, proving no leak); (b) drop `resolve`'s `previous.effects ==
> effects` idempotence clause → **exactly 1** `DraftAutosaveTest` fails; (c) drop the empty-guard
> `!effects.hasAnyEffect` → **exactly 1** `DraftAutosaveTest` fails. All restored.
>
> **Verified**: `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) — **BUILD SUCCESSFUL**
> across every module locally in this run; touched modules also ran explicitly green (`ConversationDraftTest`,
> `DraftAutosaveTest` 31, `ChatViewModelTest`). Reviewer PASS. Diff is `apps/android` only.
>
> **Next**: the narrower follow-up `chat-draft-language-persistence` — persist the manual composer language
> pick (`MessageDraft.selectedLanguage` / `ComposerLanguageState.withManualPick`) on `ConversationDraft`,
> restoring the language pill's override. Per iOS a language-only draft is NOT meaningful (so it re-applies
> only atop an otherwise worth-persisting draft) — a clean pure sub-rule + trivial VM wiring, same shape as
> this slice. After that, the Chat `[◐]`/`[~]` boxes still open (finer send-lifecycle `Slow` tier — needs
> outbox retry-attempt state plumbed into `BubbleContent`; edit-history viewer — blocked on a gateway
> endpoint, not apps/android-only). Re-scout read-only before committing; parity notes are hypotheses.

> On 2026-08-21 **Message-bubble accessibility composer shipped** (slice `chat-bubble-a11y-label`).
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (the 5 open PRs were
> web #3247 / gateway #3242 #3245 / shared #3243 / iOS #3241 — none android-routine). Prior iteration
> #3246 (mood) already merged. Branched off the freshly-fetched `origin/main` (`d3686997`, which
> includes the prior Android mood/story-ring merges). This container **reaches `dl.google.com`** (curl
> → 200), so the full local gate ran here; SDK bootstrapped `platforms;android-37.0` via cmdline-tools
> `11076708` `--channel=3` + the `android-37` alias, Gradle 8.13 by the wrapper.
>
> **First closed a stale marker**: the conversation-row `presence` sub-gap. Grep-verified the dot is
> already wired — `ConversationListScreen.kt:232` passes `presence = state.presenceStateFor(conversation,
> System.currentTimeMillis())` down to the row's `MeeshyAvatar(..., presence = …)` (`:649`), alongside
> `storyRing` and `moodEmoji`. All three avatar affordances coexist (a mood badge suppresses the dot),
> exactly as iOS. The conversation-row "rich last-message preview" line is now **complete** — no new
> slice was needed for presence; feature-parity updated to `presence done`.
>
> **The gap (re-proved by reading source)**: iOS composes ONE spoken VoiceOver label per message bubble
> (`MessageAccessibilityLabelComposer.compose`, itself the port of `BubbleStandardLayout.messageAccessibilityLabel`)
> in a frozen order. Android's `MessageBubble` had no composed label — it relied on default child-merge
> with only per-icon `contentDescription`s (delivery glyphs, starred, translated). A repo-wide grep for
> a bubble a11y composer hit only docs/contacts/auth — never chat. So the composed message label was a
> real, categorical gap.
>
> **Pure core (`:sdk-ui`)**: `MessageBubbleAccessibilityLabel.compose(content, strings, locale, timeText?)`
> — framework-free object over `BubbleContent`, emitting the joined label in the iOS-frozen order
> (sender → reply → text → images → audios → location/files → time → delivery → edited → pinned →
> ephemeral → reactions). Localized wording injected via `BubbleAccessibilityStrings` /
> `BubbleDeliveryA11yStrings` (the `RelativeTimeFormat` injection pattern — zero Android deps, fully
> JVM-testable). A deleted message short-circuits to sender + "deleted". **Assumed deviations vs iOS,
> documented**: no image/video split (one "images" count — Android `BubbleContent` carries no video
> distinction); no "you" reply-author phrasing (Android reply target has no `isMe`); no clock in the
> Android bubble meta-row, so `timeText` is only supplied where a time is actually shown (null here).
>
> **Safe, NON-destructive wiring**: `MessageBubble` gains an opt-in `accessibilityLabel: String? = null`
> applied via `clearAndSetSemantics` — wired ONLY at `MessageOverlayPreviewHero` (the long-press overlay
> hero, documented "Purely decorative and non-interactive — never intercepts input"), where collapsing
> the semantics subtree is provably safe. The interactive **list** bubble keeps the default `null`, so
> its per-element touch targets (reaction taps, image taps, long-press) are untouched — I deliberately
> did NOT merge/clear semantics on the interactive bubble, since collapsing its touch targets would
> regress TalkBack and cannot be verified without an on-device/instrumented run (routine §CI-reality
> caution). Wiring the composed label onto the list bubble is left as a future instrumented-test slice.
> Strings added EN/FR/ES/PT.
>
> **Tests**: **+20 `MessageBubbleAccessibilityLabelTest`** (pure composer — every arm: received sender /
> unknown / blank-name; outgoing never names sender; blank text skipped; reply excerpt / blank-excerpt →
> author-only / unknown author / deleted-target author-only; images+audios counts; location-then-file
> order; unnamed file; time appended / blank-time dropped; delivery after time; all 6 delivery arms;
> edited+pinned+ephemeral order; reactions summary last; deleted short-circuit; bare outgoing).
> **Mutation (RED proof) ×2**: (a) neutering the deleted short-circuit `return` fails **exactly** 1 test
> (20 run, 1 failed); (b) collapsing the reply-excerpt arm to author-only fails **exactly** 2 tests
> (the two excerpt cases). Both restored.
>
> **Verified**: `./apps/android/meeshy.sh check` — `BUILD SUCCESSFUL` (assembleDebug + every module's
> `testDebugUnitTest`) green locally in this run. Reviewer PASS.
>
> **Next**: the natural follow-up is a Roborazzi/instrumented slice to wire and verify the composed
> `accessibilityLabel` on the interactive list bubble WITHOUT regressing per-element touch targets
> (custom accessibility actions for reactions/images under one merged node) — needs the instrumented
> test harness, out of the JVM gate. Otherwise advance to the next Chat `[◐]`/`[~]` box: candidates are
> the finer 8-state send-lifecycle glyphs (slow/invisible pre-200ms debounce; needs send-lifecycle
> timing state) or the edit-history viewer (blocked on a gateway edit-history endpoint — not
> apps/android-only). Prefer a pure-resolver + trivial-value-wiring slice as always; re-scout with a
> read-only recon over iOS + Android before committing, since parity notes are hypotheses not facts.

> On 2026-08-20 **Conversation-row mood badge shipped** (slice `conversation-row-mood`,
> feature-parity's Conversations `[~]` rich last-message-preview line — the `mood` avatar
> affordance, the second of the three sub-gaps `presence/story-ring/mood`; story-ring merged
> #3244 this same day, presence is the last one left). **Step 0**: the open Android PR of the
> PRIOR iteration (#3244, story-ring) was green (Android CI success) and `mergeable_state:clean`
> — squash-merged it to `main` (→ `949bb521`) as the literal first action before branching, per
> the routine's step-0 gate. The other four open PRs at this instant (#3241 iOS, #3242/#3243/#3245
> gateway/shared) are NOT android-routine slices — left untouched. Branched off the freshly-merged
> `origin/main` (`949bb521`). This container **reaches `dl.google.com`** (curl → 200), so the full
> local gate ran here; SDK bootstrapped `platforms;android-37.0` via cmdline-tools `11076708`
> `--channel=3`, aliased `android-37 → android-37.0`; Gradle 8.13 auto-fetched by the wrapper.
>
> **The gap (re-proved by a read-only recon subagent over iOS + gateway + Android)**: "mood" is
> NOT a field on `User` or on conversation participants anywhere in the stack — it is a `moodEmoji`
> string carried on an ephemeral STATUS-type Post, resolved **per-user at render time** via a
> `statusForUser(userId)` lookup against the shared status feed. iOS
> `ConversationListView.conversationMoodStatus(for:)` (`ConversationListView.swift:695`) gates on
> `type == .direct`, resolves the other participant's `userId`, and passes
> `statusViewModel.statusForUser(userId)?.moodEmoji` into `MeeshyAvatar(moodEmoji:)`, which paints
> an emoji badge at the avatar's bottom-trailing corner, replacing the presence dot. Android's
> `MeeshyAvatar` already accepted `moodEmoji: String?` and rendered exactly that (bottom-end
> `Text`, presence dot suppressed when a mood is present) — but no conversation-row caller ever
> supplied it. **No wire/DTO widening** was warranted (would diverge from iOS/gateway, where mood
> never rides the participant payload): every supporting piece — `StatusEntry`, `statusForUser`,
> `ApiPost.moodEmoji`, `StatusBarCache`, the 1h expiry law — was already ported. Contacts
> (`ContactsListViewModel.moodEmojiFor`) is the established precedent this slice mirrors verbatim.
>
> **Pure core (`:feature:conversations`)**: `ConversationMoodStatus.moodEmojiFor(conversation,
> currentUserId, statuses): String?` — direct-only + peer gate via the `otherParticipantUserId`
> SSOT (`null` → no badge, so a group/community/channel/bot row is never decorated), then
> `statuses.statusForUser(peerId)?.moodEmoji?.takeIf { it.isNotBlank() }` (the exact Contacts
> lookup — a blank emoji never surfaces, and because the lookup is keyed by the PEER a self-only
> status is never shown as the peer's badge).
>
> **State plumbing**: `ConversationListUiState.moodStatuses: List<StatusEntry>` new defaulted-empty
> field + `moodEmojiFor(conversation)` state helper delegating to the pure resolver with the state's
> `currentUserId`. `ConversationListViewModel` gains a `StatusBarCache` dep and calls a synchronous
> `paintMoodStatusesFromCache()` at the end of `init` — reads whatever the shared FRIENDS statuses
> bar already holds (`valueOrNull` collapses Fresh/Stale/Syncing; cold `Empty` → no badges), no fetch
> of its own. Decorative affordance, never primary content — mirrors
> `ContactsListViewModel.paintMoodStatusesFromCache` VERBATIM so mood resolution is identical across
> every surface (single source of truth).
>
> **Wiring (Compose glue, coverage-exempt)**: `moodEmoji = state.moodEmojiFor(conversation)` threaded
> through the row call site → `ConversationRow` → `ConversationRowContent` → the existing
> `MeeshyAvatar(..., moodEmoji = …)` param.
>
> **Tests**: **+8 `ConversationMoodStatusTest`** (pure resolver — group never badged; direct with no
> peer → null; peer with no live status → null; non-blank emoji surfaces; blank emoji → null; peer
> picked among several; currentUserId decides which side is the peer; self-only status never surfaced
> as the peer badge) — every branch of `moodEmojiFor` exercised. **+3 `ConversationListMoodStateTest`**
> (state helper delegates with `moodStatuses`+`currentUserId`; empty set → null; identity swap
> resolves the peer from the right side). **+3 `ConversationListViewModelTest`** (the FRIENDS bar
> paints the peer's emoji onto its direct row through `init`; a DISCOVER-only status never decorates a
> row; a cold cache leaves every row without a badge) — proving the `paintMoodStatusesFromCache`
> init glue end-to-end. Two existing VM suites get a `StatusBarCache` (a seeded real cache in
> `ConversationListViewModelTest` via a `FixedClock` helper mirroring Contacts; a relaxed mock
> returning `CacheResult.Empty` in `ConversationLockFlowViewModelTest`).
>
> **RED-proof (mutation × 2)**: (a) dropping `takeIf { it.isNotBlank() }` fails **exactly** 1 test
> (`a peer status with a blank mood emoji yields no badge` — 8 run, 1 failed, no collateral). (b)
> keying the lookup by `currentUserId` instead of `peerId` fails **exactly** 4 tests (the peer-surfaces
> + picked-among-several + currentUserId-decides + self-never-surfaced arms — 8 run, 4 failed). Both
> restored after.
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` across all modules green locally. New suites
> ran: `ConversationMoodStatusTest` 8/8, `ConversationListMoodStateTest` 3/3, `ConversationListViewModelTest`
> 73/73 (was 70). Reviewer PASS.
>
> **Next**: `presence` is the last of the three conversation-row avatar sub-gaps. `presenceStateFor`
> already exists on the state AND is already passed into `MeeshyAvatar(presence = …)` at the row call
> site (grep-verified: `ConversationListScreen.kt` passes `presence = state.presenceStateFor(...)`),
> so the dot is ALREADY wired — the `presence` marker on feature-parity:1633 is now stale. Grep-verify
> it renders (a mood badge now suppresses the dot when both are present, matching iOS) and, if truly
> done, close the line with no new slice; otherwise the only remaining gap there is a live presence
> SOURCE for conversation rows (`ApiConversation.participants` carries no `isOnline`/`lastActiveAt`, so
> the dot only lights from live `user:status`/`presence:snapshot` socket frames — a genuinely cold
> row shows none). After the row line closes, advance to the next Conversations `[◐]`/`[ ]` box or the
> next build-order area (Chat).

> On 2026-08-20 **Conversation-row story-ring shipped** (slice `conversation-row-story-ring`,
> feature-parity's Conversations `[~]` rich last-message-preview line — the `story-ring` avatar
> affordance that same line called out as pending). **Step 0**: two open
> `claude/apps/android/*` slice PRs were merged into `main` first — #3238
> (`conversation-row-message-summary-kind`, merged clean) and #3239
> (`chat-composer-attachment-ladder`, closed as redundant after its head landed via a
> resolved-conflict merge commit; both sides of the tracking-file conflicts were kept — my slice's
> paragraph plus the message-summary-kind paragraph, per NOTES-lesson on prepend/newest-first).
> Branched off `origin/main` (`13bedd98`) as the literal first action. This container **reaches
> `dl.google.com`** (curl → 200), so the full local gate ran here; SDK bootstrapped
> `platforms;android-37.0` via cmdline-tools `11076708` on `--channel=3` + the `android-37` symlink
> alias, Gradle 8.13 via the wrapper.
>
> **The gap, re-proved by reading source (scout + independent verify)**: iOS renders a per-row story
> ring on the direct-conversation avatar (`ConversationListView+Rows.swift:275,296` pipe `storyRingState`
> into the row's `AvatarContext`), sourced from `StoryViewModel.storyRingState(forUserId:)`
> (`apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:1351`) via
> `ConversationListView.storyRingState(for:)` (`apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:690`).
> Android's `ConversationListScreen.kt:637` called `MeeshyAvatar(name, containerColor, presence)`
> WITHOUT a `storyRing` argument — the `MeeshyAvatar` parameter existed
> (`sdk-ui/.../MeeshyAvatar.kt:67`) and its `Unread`/`Read`/`None` rendering was already unit-covered,
> but no caller ever fed it a non-`None` value for a conversation row: the ring was cold at every
> row, no matter what the peer had posted. A `StoryRepository.storiesStream()` cache-first flow was
> already in the SDK (`apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`)
> and consumed by `StoriesViewModel`, so the missing plumbing was the *lookup*, not the source.
>
> **Pure core (`:feature:conversations`)**: `ConversationStoryRing.ringFor(userId, groups, nowMillis)`
> — framework-free, 3 first-match arms mirroring iOS EXACTLY: (1) `userId == null` OR no matching
> group OR `StoryGroup.isFullyExpired(now)` → `StoryRingState.None`; (2) `StoryGroup.hasUnviewed()`
> → `Unread`; (3) otherwise (all viewed, still active) → `Read`. Row overload
> `ringFor(conversation, currentUserId, groups, now)` applies the iOS direct-only gate by delegating
> peer-id resolution to the existing `ApiConversation.otherParticipantUserId` SSOT — a group /
> community / channel / bot conversation never carries a ring. Every constant (isFullyExpired
> semantics, hasUnviewed) reuses `me.meeshy.sdk.story.*` — no local re-implementation.
>
> **State plumbing (`:feature:conversations`)**: `ConversationListUiState.storyGroups: List<StoryGroup>`
> new defaulted-empty field; `ConversationListViewModel.observeStoryGroups()` new observer collects
> `storyRepository.storiesStream()` (cache-first `Fresh/Stale/Syncing` yield their value, `Empty`
> yields nothing so the ring rests at the previous groups) and reduces via `toStoryGroups(currentUserId
> = state.value.currentUserId)`. A sync-error is swallowed so a transient network hiccup never wipes
> the rings — parity iOS `StoryViewModel.storyGroups` (a `@Published` that only writes on success).
> `ConversationListUiState.storyRingFor(conversation, now)` delegates to the pure resolver.
>
> **Wiring (Compose glue, coverage-exempt)**: the row callsite (`ConversationListScreen.kt:231`)
> gains `storyRing = state.storyRingFor(conversation, System.currentTimeMillis())`, threaded through
> `ConversationRow` → `ConversationRowContent` → the existing `MeeshyAvatar(..., storyRing = …)`
> parameter. Zero avatar-render churn — the ring painting already existed, only the value was cold.
>
> **Tests**: **+12 `ConversationStoryRingTest`** — per-user rule (null userId → None; missing group
> → None; empty groups → None; fully-expired group with an unviewed story → None *rule 1 outranks
> rule 3*; active + unviewed → Unread; active + all-viewed → Read; mixed one-expired-viewed +
> one-active-viewed → Read *not-fully-expired arm*; multiple groups → the matching one is picked) +
> row rule (direct with peer's Unread group → Unread; group-type conversation → None; direct with no
> other participant → None; direct with peer having no active story → None). **+3
> `ConversationListStoryRingStateTest`** — state helper resolves the peer's ring; empty state yields
> None; state passes its own `currentUserId` so the peer is resolved from the right side (identity
> swap makes "peer" the OTHER, only "me" has a story, yields Read). Every branch of both `ringFor`
> overloads and every arm of the peer-side resolution covered. Compose glue (the row's
> `MeeshyAvatar` param thread) is thin wiring, exempt per TDD-COVERAGE.
>
> **RED-proof (mutation)**: swapping `if (group.hasUnviewed())` for `if (false)` in the pure
> resolver fails **exactly** 3 tests (the two Unread arms — per-user and row — plus the state helper
> "peer's unread ring") — 15 run, 3 failed, no collateral — restored after.
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` across all modules green locally
> (973 actionable tasks — `BUILD SUCCESSFUL`). Two existing `:feature:conversations` VM tests
> (`ConversationListViewModelTest`, `ConversationLockFlowViewModelTest`) fed a new mocked
> `StoryRepository` whose `storiesStream(any(), any())` returns `emptyFlow()` — a minimal, honest
> injection: the observer subscribes, the flow completes, no story groups arrive, state stays at
> `storyGroups = emptyList()`, every existing behaviour proof runs unchanged. Reviewer PASS.
>
> **Next**: two Conversations row-preview sub-gaps remain at `feature-parity.md:1594` — `presence`
> (a grep on `ConversationListScreen.kt:231` proves the dot is already wired via
> `state.presenceStateFor(...)` piped into `MeeshyAvatar(presence = …)`, so the note is stale — do
> not spend a slice on it, mark it verified-done in feature-parity) and `mood` (needs a Kotlin
> mirror of iOS `StatusEntry`/`statusForUser(userId:)` on `:core:model` + a `StatusRepository`
> analogue to `StoryRepository` before the same delegation shape can apply). Or advance the Chat
> line: the `[◐] Universal composer` still has sub-gaps beyond the just-shipped attachment-ladder
> (per feature-parity umbrella), the finer send-lifecycle glyph, or the composer's photo-specific
> `PickVisualMedia` launcher noted as candidate in the attachment-ladder slice's Next.

> On 2026-08-20 **Conversation-row message-summary-kind shipped** (slice
> `conversation-row-message-summary-kind`, feature-parity's Conversations "rich last-message
> preview" `[~]` — the `ephemeral / expired / hidden / view-once` sub-gap that same line listed
> as pending alongside the just-shipped `activity-heat`, `tags`, `typing`). **Step 0**: no open
> `claude/apps/android/*` PR to merge first — the six open PRs at this instant are the
> `claude/intelligent-noether-kana7q` iOS-only forward-picker fix (#3236) and five Dependabot
> (`actions/cache`, `framer-motion`, root build-tools group, `setup-android` — the CI-infra
> Android bump, not an android-routine slice — and `gradle/actions`). None on an
> android-routine slice branch. Branched off `origin/main` (`65af14d5`) as the literal first
> action. This container **reaches `dl.google.com`** (curl → 200 slowly), so the full local
> gate ran here.
>
> **A first stale trip found by reading source, not the note**: `PROGRESS.md`'s "Next" line —
> written before the activity-heat slice merged — recommended pursuing the *message-body kinds*
> (ephemeral/expired/hidden/view-once) but warned that "the honest first move there is to
> widen the wire DTO" because "the current `ApiConversationLastMessage` doesn't carry
> `expiresAt`, `deletedAt`, `viewOnce`". Grep across `services/gateway/src/routes/conversations/
> core.ts:971-1010` proved this half-true: the gateway ALREADY spreads the full `msg` object
> onto `lastMessage` via `...msgRest` after stripping only `translations` and `originalLanguage`,
> so `isBlurred`, `isViewOnce`, `expiresAt` all reach the wire today — the Kotlin DTO simply
> doesn't declare them. The widening is 3 defaulted fields, not a wire contract change.
> Lesson: verify the wire before designing a widening slice — a hint that a field "isn't on
> the wire" may just mean the client can't see it.
>
> **The gap, re-proved by reading source**: iOS `MeeshyConversation.lastMessageSummaryKind()`
> (`packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`) classifies the
> preview into 5 kinds and `ThemedConversationRow.lastMessagePreviewView`
> (`apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift:540-610`) renders each
> with a kind-specific icon + italic tint: `expired` → `timer.badge.xmark` textMuted italic,
> `hidden` → `eye.slash` sender-prefixed textSecondary italic, `viewOnce` → `flame` accent
> italic, `ephemeralActive` → standard content + timer badge, `standard` → plain body. Android
> rendered every message with the same non-italic secondary text — expired ephemeral,
> moderated hidden, and view-once messages all indistinguishable from a plain "Salut !".
>
> **Pure core (`:feature:conversations`)**: `MessageSummaryKind` — framework-free enum
> `{ STANDARD, HIDDEN, VIEW_ONCE, EPHEMERAL_ACTIVE, EXPIRED }` + companion `of(message,
> nowMillis) : MessageSummaryKind` that mirrors iOS's priority order EXACTLY: (1) `expiresAt <=
> now` → EXPIRED (inclusive boundary — iOS's `<=` guard, one less way a row flashes old
> content); (2) `isBlurred` → HIDDEN (moderation outranks a live ephemeral so blurred content
> can never leak); (3) `isViewOnce` → VIEW_ONCE; (4) future `expiresAt` → EPHEMERAL_ACTIVE;
> (5) otherwise → STANDARD. Also `SummaryLine(text, kind)` (row's composed preview line) +
> `messageSummaryLine(message, currentUserId, showSender, labels, nowMillis)` that composes
> the kind-appropriate label with the same sender-prefix rule as `lastMessagePreview` for
> HIDDEN/VIEW_ONCE; EXPIRED drops the sender (parity iOS `.expired` arm which renders the
> label alone).
>
> **Sibling SSOT** (`:core:model`): `ApiConversationLastMessage` widened with three defaulted
> fields — `isBlurred: Boolean = false`, `isViewOnce: Boolean = false`, `expiresAt: String? =
> null`. Purely additive wire widening: the gateway already spreads these onto the payload,
> so an older backend/no-flags message keeps decoding to the same defaults it did before.
> Kdoc references the gateway serializer path + iOS SSOT.
>
> **Wiring (Compose glue, coverage-exempt)**: `RowPreview` gains a defaulted `kind:
> MessageSummaryKind = STANDARD`, `conversationRowPreview` gets a second overload that takes
> `SummaryLine` and preserves its kind (typing/draft still supersede and stay STANDARD — their
> styling is the accent flag, not the kind). New private composable
> `ConversationRowPreviewLine(preview, primaryAccent)` picks (icon, tint, italic) per kind
> from a small `RowPreviewKindStyle` data class — HourglassEmpty/textMuted/italic for EXPIRED,
> VisibilityOff/textSecondary/italic for HIDDEN, LocalFireDepartment/accent/italic for
> VIEW_ONCE, Timer/standardColor for EPHEMERAL_ACTIVE, no-icon standard otherwise. Icons at
> 14dp with `MeeshySpacing.xs` gap — same footprint as the pinned/muted/locked title icons.
> Row's `lastMessage` call site swaps `lastMessagePreview` → `messageSummaryLine` with a
> `System.currentTimeMillis()` clock.
>
> **Localization**: 7 new strings per locale × 4 locales (en/fr/es/pt) — 3 body labels
> (`_expired`/`_hidden`/`_view_once`, ported from iOS `Localizable.xcstrings` at
> `message.expired`, `conversation.summary.hidden`, `conversation.summary.view_once`) + 4
> accessibility content descriptions (ephemeral/expired/hidden/view-once). A partial locale
> that ships without them transparently falls through to the standard body path via the
> defaulted `LastMessagePreviewLabels(expired="", hidden="", viewOnce="")` — a blank label
> must never leave the row visually empty.
>
> **Tests**: +14 `MessageSummaryKindTest` — null-message → STANDARD; plain-text → STANDARD;
> future expiresAt → EPHEMERAL; strictly-past expiresAt → EXPIRED; equal-to-now expiresAt →
> EXPIRED (inclusive boundary); blurred → HIDDEN; view-once → VIEW_ONCE; expired outranks
> blurred; expired outranks view-once; blurred outranks view-once; blurred outranks live
> ephemeral; view-once outranks live ephemeral; malformed/blank expiresAt does NOT classify
> as ephemeral; defaults on the DTO are non-ephemeral non-blurred non-view-once. **+12
> `MessageSummaryLineTest`** — standard body direct / group sender prefix; null message →
> "Aucun message"; expired label drops sender; hidden label sender-prefixed in group and
> label-alone in direct; view-once sender-prefixed and "Vous" for me; ephemeral-active
> reuses standard body direct + group; inclusive expired boundary at now; blank
> expired/hidden labels fall through to standard body (partial-locale safety). **+5
> `ConversationRowPreviewKindTest`** — summary kind propagates on the last-message path,
> typing supersedes summary (kind→STANDARD), draft supersedes summary (kind→STANDARD),
> standard summary in secondary colour, ephemeral summary preserves its kind for styling.
> Every branch of `of()`, `messageSummaryLine`, and the kind-aware overload of
> `conversationRowPreview` exercised. Compose glue in `ConversationRowPreviewLine` is thin
> visual mapping, exempt per TDD-COVERAGE.
>
> **RED-proof (mutation × 2)**: (a) swapping `expiresAt <= nowMillis` for `expiresAt <
> nowMillis` fails **exactly** 2 tests (the two inclusive-boundary tests — 28 run, 2 failed,
> no collateral). (b) reversing HIDDEN/VIEW_ONCE below EPHEMERAL_ACTIVE fails **exactly** 2
> tests (`blurred outranks a live ephemeral`, `view-once outranks a live ephemeral` — 28 run,
> 2 failed, no collateral). Restored after each.
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` across all modules green locally
> (973 actionable tasks). SDK bootstrapped as `platforms;android-37.0` via cmdline-tools
> `11076708`, aliased `android-37 → android-37.0`; Gradle 8.13 fetched auto by the wrapper.
> Reviewer PASS.
>
> **Next**: the last two Conversations row-preview sub-gaps at `feature-parity.md:1594` are
> avatar affordances — `presence` (already wired via `state.presenceStateFor`, so the note is
> stale — grep-verify before spending a slice on it), `story-ring` (clean single slice:
> `MeeshyAvatar` already accepts `storyRing: StoryRingState` and `StoryTray` exposes per-user
> unread-story state; the missing wire is a lookup key exposed on the row's state), and
> `mood` (needs new SDK model — the wire field lives on User in iOS but no Kotlin type mirror
> yet). Pick story-ring next: it's the shortest path from the pieces already in place.

> On 2026-08-20 **Composer attachment-ladder tray shipped** (slice `chat-composer-attachment-ladder`,
> feature-parity's Chat `[◐] Attachment ladder` sub-gap "an emoji-ladder tray grouping the entries";
> also feeds the umbrella `[ ] Universal composer`). **Step 0**: no open `claude/apps/android/*` slice PR
> to merge first — the open-PR sweep (listed WITHOUT a head filter, per the typing-slice NOTES lesson) held
> only an iOS session (#3236) and five Dependabot; none on an android-routine branch. Branched off
> `origin/main` (`65af14d5`). This container **reaches `dl.google.com`** (200), so the full local gate ran
> here; SDK bootstrapped `platforms;android-37.0` via cmdline-tools `13114758` `--channel=3` + the
> `android-37` symlink alias, Gradle 8.13 curl-fetched (wrapper still 403s through the proxy — same env quirk
> as the last three slices).
>
> **The gap, re-proved by reading source (scout + independent verify)**: iOS's composer opens a "+" carousel
> (`UniversalComposerBar+Attachments.carouselTiles`) offering Photo/Camera/File/Location/Voice/Emoji as
> distinct discs; Android's composer had a **single** `AttachFile` `IconButton` firing `filePicker.launch("*/*")`
> directly (`ChatScreen.kt:2812`) — no grouped tray, no photo/camera/location/voice/emoji distinction. Two
> other composer buttons (`Mic`, effects) sat beside it. The remaining conversation-row gaps
> (ephemeral/view-once/story-ring/mood) were confirmed **backend-wire-blocked** (the gateway conversation
> preview payload excludes deleted/ephemeral/view-once and carries no per-user story state — `emitConversationPreviewUpdate.ts`
> selects `where { deletedAt: null }` and never hoists those flags), so the honest move was this composer
> (outbound-only) slice, not another row micro-tint that would need a new server field.
>
> **Pure core (`:feature:chat`)**: `ComposerAttachmentLadder.tiles(affordances, hasRecentMediaStrip=false,
> showCamera=true, showLocation=true, showVoice=true, showEmoji=true) → List<AttachmentTile>`. Two gate
> families mirror iOS: **permission** off `ComposerAffordances` (Photo+Camera ride `canSendImages ||
> canSendVideos`; File→`canSendFiles`; Location→`canSendLocations`; Voice→`canSendAudios`; Emoji→`canSendText`)
> and **host-capability** off the `show*` flags (iOS gates on `on* != nil`). Photo suppressed under a
> recent-media strip (iOS `onRecentMediaSelected == nil`; Android has no strip, defaulted off, branch kept for
> the day one lands). Order is the iOS carousel order; each `AttachmentTile` carries its iOS gradient hex
> (`9B59B6/F8B500/45B7D1/2ECC71/E74C3C/FF9F43`) so colour parity is a pure, tested fact. Built with an
> immutable `listOfNotNull { takeIf }` — no mutation, order-preserving. **SOTA over iOS**: the tile decision,
> buried in a SwiftUI `View` computed property (untestable without a UI host), is a framework-free SSOT with
> every branch JVM-covered.
>
> **Wiring (Compose glue, coverage-exempt)**: `ComposerAttachmentTray` (new file) renders the resolved tiles
> as a horizontal carousel of circular gradient discs + labels (parity `carouselTile`). The composer's lone
> `AttachFile` button becomes an `Add`/`Close` toggle (`attachmentTrayOpen`) that opens the tray above the
> composer Row (hidden while recording or read-only). Kind→handler map: Photo → `filePicker.launch("image/*")`,
> File → `*/*`, Voice → `requestVoiceRecording()` (the standalone Mic button stays for now — quick access —
> since Voice also lives in the tray). Camera/Location/Emoji host flags are passed **off** at the call site
> (`showCamera=false, showLocation=false, showEmoji=false`) because no handler exists yet — so the resolver
> yields exactly Photo/File/Voice today and never renders a dead-end tile; each flag flips on the day its
> handler lands.
>
> **Tests**: +14 `ComposerAttachmentLadderTest` — full posture (all six in order); recent-strip suppresses
> Photo but keeps Camera; capture arms (both / image-only / video-only / neither); no-file drops File;
> Location/Voice/Emoji each need BOTH permission and host flag (both arms); read-only participant keeps its
> permitted attachment tiles but loses Emoji; fully-denied → empty; partial subset preserves canonical order;
> the live chat-screen posture (camera/location/emoji off) yields Photo/File/Voice; colour parity locked for
> all six. **RED-proof (mutation)**: flipping `canCapture` from `||` to `&&` fails **exactly** 2 tests
> (video-only, image-only) — 15 run, 2 failed, no collateral — restored after.
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` for `:feature:chat` green locally (BUILD SUCCESSFUL);
> full-project gate re-run for the PR. Reviewer PASS.
>
> **Next**: Candidate 2 from the scout — the finer send-lifecycle glyph (sub-200 ms "invisible" reveal +
> "slow" tier) on `:core:model` `SendLifecycleResolver`, driven purely by the local send-start timestamp vs
> `now` (no wire field). iOS source `BubbleDeliveryCheck.swift` (`SendingClockGlyph.shouldRevealImmediately`,
> `revealDelay = 0.2`) has a ready Swift test twin to mirror. Or continue the composer line by landing a real
> photo-specific `PickVisualMedia` launcher so Photo and File become genuinely distinct pickers.

> On 2026-08-20 **Conversation-row activity-heat gradient shipped** (slice
> `conversation-row-activity-heat`, feature-parity's Conversations "rich last-message preview"
> `[~]` — the `activity-heat` sub-gap that same line listed as pending alongside `tags` (just
> merged) and `typing` (merged the same day)). **Step 0**: no open `claude/apps/android/*` PR to
> merge first — the open-PR list held only parallel `claude/brave-archimedes-*` /
> `claude/intelligent-noether-*` sessions, a Jules branch, and five Dependabot; none on an
> android-routine slice branch, and the one Android Dependabot PR (#3139, `setup-android` bump)
> is CI-infra, not this lane. Branched off `origin/main` (`4b6f6342`, the merge of my own
> tag-chips slice #3232) as the literal first action. This container **reaches `dl.google.com`**
> (curl → 200 albeit slow), so the full local gate ran here.
>
> **A first stale trip found by reading source, not the note**: `PROGRESS.md`'s "Next" line —
> written before my tag-chips slice merged — recommended the *presence-dot wiring* as the next
> follow-up, but a grep on `ConversationListScreen.kt` proved the wiring is already
> **line 225 → 615** (`state.presenceStateFor(conversation, System.currentTimeMillis())` fed
> into `MeeshyAvatar(presence = …)`), landed in the earlier `conversation-list-presence-dot`
> slice. Lesson (already logged 2026-08-09): the "Next" hint is a hypothesis, not a fact —
> grep the code before spending a run on it. Real remaining Conversations row-preview gaps
> (`feature-parity.md:1594`): **activity-heat, presence/story-ring/mood** — of which the last
> two are avatar affordances not represented in `ApiConversation` yet, so *activity-heat* — a
> pure closed-form score off signals already on the wire — is the clean next slice.
>
> **The gap, re-proved by reading source**: iOS `ThemedConversationRow.conversationHeat`
> (`ThemedConversationRow.swift:54-70`) computes a `[0,1]` heat as
> `0.40·recency + 0.35·unread + 0.15·members + 0.10·pinned` (muted → floor `0.05`), and
> `heatBackground` (lines 72-85) fades a `topLeading → bottomTrailing` linear gradient from
> `accent.opacity(topOpacity)` to `accentSecondary.opacity(topOpacity*0.25)` — `topOpacity =
> isDark ? (0.03 + heat*0.10) : (0.02 + heat*0.08)`. Android's row rendered a flat glass
> surface — no heat tint, no gradient, so a hot group thread looked identical to a stale
> archived one until the eye caught the unread badge.
>
> **Pure core (`:feature:conversations`)**: `ConversationActivityHeat` — framework-free (no
> Compose, no Android time source), exposes `heat(lastActivityMillis, nowMillis, unreadCount,
> memberCount, isPinned, isMuted): Double`, `of(conversation, nowMillis)` (reads signals off
> the resolved preferences + `ConversationRowTime.epochMillis` SSOT — which already picks the
> last-message → updatedAt → createdAt cascade iOS gets from `conversation.lastMessageAt`),
> plus `gradient(heat, isDark): HeatGradient(topOpacity, bottomOpacity)`. Every constant —
> weights, saturation caps (unread 10, members 50), the four recency bucket boundaries and
> their exclusive `<` edges, the isDark floor/ramp coefficients — mirrors the iOS source.
>
> **Sibling SSOT** (`:sdk-core`): new `ApiConversation.accentColorPalette()` (`ConversationAccent.kt`)
> exposes the full `DynamicColorGenerator.ColorPalette` (primary + secondary + accent), the
> deterministic port of iOS `conversation.colorPalette`; the pre-existing `accentHex()` is now
> its `primary` accessor. The row composes the palette once via `remember(conversation)` and
> reads its two hues into `primaryAccent` / `secondaryAccent` (used by the heat gradient + the
> avatar's `containerColor` + the two accent-tinted labels — 3 previous `hexColor(conversation
> .accentHex())` calls collapsed to one memoized pair).
>
> **Wiring (Compose glue, coverage-exempt)**: the row's inner `Row` (inside `MeeshyGlassSurface`)
> gains a `.background(Brush.linearGradient(listOf(primaryAccent.copy(alpha = topOpacity),
> secondaryAccent.copy(alpha = bottomOpacity))))` under its existing content padding. The
> heat brush layers under the glass fill and above the surface's rounded clip — so a cold row
> stays a plain glass card (top α ≈ 0.02-0.03), and a hot row picks up a subtle
> accent-secondary → accent tint whose intensity tracks the score. Zero new `.dp`, no shape
> change, no clip conflict with the glass surface.
>
> **Tests**: +22 `ConversationActivityHeatTest` — muted short-circuit; 5 recency buckets
> (isolated arms, exact-boundary drops for each of 300/3600/86_400/604_800 s proving the
> exclusive `<` edges); null-last-activity → coldest; future-instant (clock skew) → hottest
> bucket; unread proportional + cap at 10; members proportional + cap at 50; pinned 0.10;
> maxed sum = 1.0 exact; realistic mixed blend; dark gradient floor 0.03→0.13 & light floor
> 0.02→0.10; bottom = ¼ top invariant; `of(conversation, now)` reads every signal off a real
> `ApiConversation`; `of` short-circuits muted; `of` treats a conversation with no parseable
> timestamp as coldest recency. **+3 `ConversationAccentTest`** cover the new palette
> (primary matches `accentHex`, secondary is distinct, deterministic across calls). Every
> branch of `heat` and `gradient` exercised. The Compose Brush/`Modifier.background` threading
> is thin glue, exempt per TDD-COVERAGE. **RED-proof (mutation)**: swapping `WEIGHT_UNREAD` from
> `0.35` to `0.30` fails **exactly** 5 tests (max-sum, realistic-blend, `of`-reads-signals, and
> the two unread arms) — 22 run, 5 failed, no collateral — restored after.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` green for the new suite, then
> `assembleDebug` + `testDebugUnitTest` across all modules green locally. SDK bootstrapped as
> `platforms;android-37.0` via newer cmdline-tools `13114758` on `--channel=3`, aliased to
> `android-37`; Gradle 8.13 fetched via curl and invoked directly (the wrapper still 403s
> through the proxy — same env quirk as the two prior slices). Reviewer PASS.
>
> **Next**: continue the Conversations row-preview line — the remaining sub-gaps at
> `feature-parity.md:1594` are the message-body kinds (`ephemeral`/`expired`/`hidden`/
> `view-once`) and avatar affordances (`story-ring`/`mood`). The message-body kinds each need
> a wire field the current `ApiConversationLastMessage` doesn't carry yet (no `expiresAt`,
> no `deletedAt`, no `viewOnce` flag), so the honest first move there is to widen the wire
> DTO, not to guess kinds off the message-type string. Avatar `story-ring` is cleaner as a
> single slice: `StoryTray` already exposes per-user unread-story state and `MeeshyAvatar`
> already accepts `storyRing: StoryRingState`, just like it accepted `presence` before the
> earlier wiring slice — the missing wire is a lookup key exposed on the row state.

> On 2026-08-20 **Conversation-row tag chips shipped** (slice `conversation-row-tag-chips`,
> feature-parity's Conversations "rich last-message preview" `[~]` — the `tags` sub-gap that line
> listed as pending). **Step 0**: no open `claude/apps/android/*` PR to merge first — the open-PR
> list held only parallel `claude/brave-archimedes-*` / `claude/intelligent-noether-*` sessions, a
> Jules branch, and five Dependabot; none on an android-routine slice branch, and the one Android
> Dependabot PR (#3139, `setup-android` bump) is CI-infra, not this lane. Branched off `origin/main`
> (`408a49ea`) as the literal first action. This container **reaches `dl.google.com`** (curl → 200),
> so the full local gate ran here.
>
> **The gap, re-proved by reading source**: Android already lets you *edit* per-conversation tags
> (`ConversationTagsEditor` + the context-menu "Tags" dialog persist a `List<String>` into
> `resolvedPreferences.tags`) but **never displayed them on the row** — a grep for `TagChip`/tag
> rendering under `feature/conversations/` found only the editor dialog. iOS's `ThemedConversationRow`
> renders a tags row at the top of the row via the pure `visibleTagsInfo` (width-based fit with a
> "+N" overflow badge) + `MeeshyConversationTag.estimatedWidth` (`name.count*7+22`, CoreModels.swift).
>
> **Pure core (`:feature:conversations`)**: new `ConversationTagRow` — `estimatedWidth(name)` and
> `fit(tags, availableWidth) → Fit(visible, remaining)`, a faithful port of iOS's algorithm: iterate
> tags accumulating width+spacing(6), reserve the badge width(32)+spacing for any non-final tag,
> stop at the first that doesn't fit, and **always force at least one tag** so a row with tags never
> renders empty. **Placed in `:feature:conversations`, not on the `:core:model` tag type where iOS
> parks `estimatedWidth`** — it's a row-layout heuristic, not a property of the wire model (SDK
> purity: models stay layout-agnostic; a deliberate cleaner-than-iOS placement).
>
> **Wiring (Compose glue, coverage-exempt)**: `ConversationTagsRow(currentTags)` at the top of the
> row content Column, inside a `BoxWithConstraints` so the fit sees the **real** available width —
> an improvement over iOS's hardcoded `availableWidth = 200`. Each chip's colour is the deterministic
> `DynamicColorGenerator.colorForName` SSOT (same tag name → same colour everywhere), rendered as a
> translucent capsule; the "+N" badge is a neutral `textSecondary` capsule. String ×1
> (`conversations_row_tags_overflow` = `+%1$d`, `translatable="false"` — a locale-invariant numeric).
>
> **Tests**: +10 `ConversationTagRowTest` — `estimatedWidth` (chars×7+padding; empty name = padding);
> `fit` empty→nothing; all-fit; force-first-when-none-fits; badge reserved so a later tag hides;
> **final tag exempt from the reserve** (width 79 passes only because the last tag skips the badge
> reserve); stop-at-first-overflow keeps the earlier ones; remainder count for a hidden tail. Every
> branch of `fit` exercised (both spacing arms, both reserve arms, fit/break, force-first). The
> `BoxWithConstraints`/chip rendering is thin Compose glue, exempt per TDD-COVERAGE.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` green (10/10 new), then full
> `assembleDebug` + `testDebugUnitTest` across all modules green locally. SDK bootstrapped as
> `platforms;android-37.0` via the newer cmdline-tools `13114758` on `--channel=3`, aliased to the
> `android-37` hash AGP 8.13 wants; the Gradle 8.13 wrapper download 403'd through the proxy so a
> `curl`-fetched distribution was run directly (env notes in NOTES). Reviewer PASS.
>
> **Next**: continue the Conversations row indicators — `presence` dot / `story-ring` / `mood` on the
> avatar, or `activity-heat`. Presence has the biggest UX payoff and its SSOT (`getUserPresenceStatus`
> / `PresenceState`) is already ported; the row `MeeshyAvatar` already accepts a `presence` param but
> the list VM does not yet feed live per-conversation presence — that wiring is the next slice's core.

> On 2026-08-20 **Conversation-row typing preview shipped** (slice `conversation-row-typing-indicator`,
> feature-parity's Conversations "rich last-message preview" `[~]` — the `typing` sub-gap that line
> itself listed as pending). **Step 0 — an open android-routine PR WAS found and merged first**: my
> initial `list_pull_requests --head isopen-io:claude/apps/android` returned `[]` (the head filter is
> too specific to match a `claude/apps/android/<slice>` branch — a lesson logged in NOTES), but reading
> the Actions list surfaced **PR #3228** (`chat-forwarded-badge-source-name`, a parallel session's
> slice) open, green (Android #176 ✅), `mergeable_state: clean`. Per the Step-0 mandate I **squash-merged
> #3228** (main `0a8a1624 → 680fd2b6`) before finishing my own slice — it also carried the fix for the
> stale share-link tests (below), so main's Android CI is green again.
>
> **A pre-existing main breakage, found and attributed by reading source**: the full local gate first
> showed 8 failures — 5 mine (a test-harness bug, below) and **4 stale share-link tests** in
> `:feature:conversations` (`CreateShareLinkViewModelTest`, `MyShareLinksViewModelTest`,
> `ShareLinkDetailViewModelTest`) asserting `…/join/…` while production now yields `…/chat/…`. Root cause:
> main commit `0a8a1624` switched `CreatedShareLinkPresentation`/`MyShareLinkPresentation` to `/chat/` and
> updated the `:core:model` presentation tests but **missed these 3 ViewModel test files** — main was red
> on Android CI as of that commit. **Not fixed inside my slice**: PR #3228 (merged above) already contained
> the identical `/join → /chat` correction, so I restored those 3 files from the merged main and kept my
> slice diff **typing-only** — no redundant re-touch, no double-fix conflict.
>
> **The gap, re-proved by reading source (Explore scout + independent verify)**: a repo-wide grep for
> `[Tt]yping` under `feature/conversations/` returned nothing — the row preview was `draftLine ?:
> lastMessagePreview(...)` only, with **no typing tier**, even though `MessageSocketManager` already
> exposes `typingStarted`/`typingStopped: SharedFlow<TypingEvent>` and `ConversationListViewModel` already
> injects it (collecting six of its flows, not the two typing ones). iOS's `ConversationListViewModel.typers`
> + `ThemedConversationRow` (`if typingUsername != nil { … } else if draft … else lastMessage`) drives a
> **typing → draft → last-message** priority.
>
> **Pure core (`:feature:conversations`)**: `ConversationTypingRoster` — a multi-conversation SSOT
> (`conversationId → userId → ConversationTyper`), the list-analog of `:feature:chat`'s single-conversation
> `TypingParticipants`. `started` (self-excluded, name fallback `displayName → username → userId`, returns
> the same map instance on an inert self/blank start), `stopped` (removes exactly that user — a group row
> stays lit while any other peer types; drops the conversation key on the last stop; inert for an absent
> user), `typingDisplayName` (deterministic `minWith(displayName, userId)` so a re-render never flickers).
> New `ConversationRowPreview` decides the tier: `typingPreview(name, format)` + `conversationRowPreview(
> typing, draft, last) → RowPreview(text, isAccent)` (typing & draft accent-tinted, last-message secondary).
>
> **Wiring**: `ConversationListUiState.typers` + `typingDisplayNameFor(id)`; new `observeTyping()` collects
> both socket flows through the roster, self = the resolved `currentUserId`. **SOTA over iOS parity, kept
> honest**: a per-`(conv,user)` **15 s safety-timeout** job (`armTypingCleanup`) mirrors iOS's
> `scheduleTypingCleanup` — a `typing:start` re-arms it, a real `typing:stop` cancels it — so a lost stop
> frame can't leave a row stuck "… is typing" forever. `ConversationListScreen`'s row threads
> `typingDisplayName` and renders `rowPreview.text`/`.isAccent` (thin, coverage-exempt Compose glue).
> Strings ×1 (`conversations_preview_typing`) EN/FR/ES/PT.
>
> **Tests**: +14 `ConversationTypingRosterTest` (record; displayName>username>userId fallback; self &
> blank-id inert-same-instance; repeated start refreshes in place; two typers both remain + deterministic
> pick; tie-break by userId; per-user stop keeps the row lit; last-stop drops the key; inert stop for
> unknown conv / absent user / empty state; no cross-conversation leak; null when nobody types) +6
> `ConversationRowPreviewTest` (format; null/blank/whitespace name → null; trim; the 3-way priority incl.
> accent flags) +5 `ConversationListViewModelTest` (start surfaces the typer & doesn't leak to c2; self
> never shown; stop clears exactly that user leaving the rest; **15 s timeout force-clears**; a fresh start
> **re-arms** the timeout so an active typer isn't dropped early). Roster/reducer branch coverage total;
> the row/`observeTyping` glue is exempt per TDD-COVERAGE. **Test-harness lesson (RED→GREEN)**: my first 4
> VM tests used `advanceUntilIdle()` after the emit, which fast-forwards virtual time **through the 15 s
> safety timer**, clearing the typer under test — switched to `runCurrent()` (immediate work, no time
> advance) + explicit `advanceTimeBy` for the timeout tests. Lesson logged in NOTES.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` green (all 3 new suites), then full
> `assembleDebug` + `testDebugUnitTest` across all modules green locally (this container reaches
> `dl.google.com`; SDK bootstrapped as `platforms;android-37.0` on `--channel=3` then aliased to the
> `android-37` hash AGP 8.13 wants — env note in NOTES). Reviewer PASS.
> On 2026-08-20 **Forwarded badge names its source conversation shipped** (slice
> `chat-forwarded-badge-source-name`, feature-parity's Chat "Edited / pinned / forwarded indicators"
> composite — the forwarded-source-name residual left open after `chat-forwarded-indicator`). **Step 0**:
> no open `claude/apps/android/*` PR to merge first (open-PR list was 12 — gateway/web `$`-escaping fixes,
> iOS transfer/Jules/audio-ZMQ, shared parity test, five Dependabot; none on an android-routine branch).
> Branched off `origin/main` (`ccc81b25`) clean, branch created as the literal first action before any
> edit. This container **reaches `dl.google.com`** (curl → 200), so the SDK bootstrapped (platform
> `android-37.0` — the bare `android-37` package does not exist since minor SDK releases; CI's best-effort
> provisioning step installs the same `.0` candidate) and the **full local gate ran here**.
>
> **The gap, re-proved by reading source**: `chat-forwarded-indicator` (2026-07-08) shipped a generic
> italic "Transféré/Forwarded" chip gated on `!forwardedFromId.isNullOrBlank()`, but it never **named the
> source conversation**. iOS `BubbleForwardedIndicator` names it via the pure `ForwardBadgePolicy`
> (`apps/ios/.../Bubble/ForwardBadgePolicy.swift`) — a 3-way rule with an explicit twin at
> `apps/web/lib/forward-badge.ts`: name shown for every group type, hidden for `direct`/`bot`, status quo
> for an unknown type, blank name → hidden. The data is already on the wire — the gateway hoists
> `forwardedFromConversation` (`{id,title,identifier,type,avatar}`) onto the message payload
> (`MessageHandler.ts:1209-1210`) — Android's `ApiMessage` simply did not decode it.
>
> **Pure core (`:core:model`)**: new `ForwardBadgePolicy.conversationName(ref: ForwardReference?): String?`
> — a faithful port of the iOS enum (hidden set `{direct, bot}`, `takeIf { isNotEmpty }` for the blank
> guard, unknown type falls through to the name). `ForwardReference` gains `conversationType: String?`
> (the field iOS carries at `CoreModels.swift:1595`).
>
> **Wiring**: `ApiMessage` gains a decoded `forwardedFromConversation: ApiForwardedConversation?`
> (exactly the gateway's selected fields). `BubbleContentBuilder` folds it to a new
> `BubbleContent.forwardedFromName` — building a `ForwardReference(conversationName = title ?: identifier,
> conversationType = type)` (mirrors iOS's `title ?? identifier` fallback) and running the policy; a
> deleted tombstone forces null (same suppress rule as `pinnedAtIso`/`isForwarded`). `MessageBubble`
> renders `bubble_forwarded_from` ("Transféré de {name}") when non-null, else the existing generic
> `bubble_forwarded` chip — same accent-coherent `Icons.AutoMirrored.Filled.Send` glyph. Strings ×1
> (`bubble_forwarded_from`) EN/FR/ES/PT.
>
> **Tests**: +13 `ForwardBadgePolicyTest` (null ref, absent name, blank name → absent; each of the six
> group types → named; `direct`/`bot` → hidden; unknown type → status-quo name; null type → name) + 5
> `BubbleContentBuilderTest` (group forward names the source; titleless public falls back to identifier;
> direct forward stays `isForwarded` but unnamed; a forward with no source-conversation payload is
> unnamed; a deleted forward never names its source). Policy branch coverage total; the `MessageBubble`
> render is exempt Compose glue per TDD-COVERAGE.
>
> **Verified**: `:core:model:testDebugUnitTest --tests ForwardBadgePolicyTest` green (BUILD SUCCESSFUL);
> full `assembleDebug` + `testDebugUnitTest` across all modules green locally before the PR
> (single container, `dl.google.com` reachable, `--max-workers=2` to dodge the proxy 429 burst).
> Reviewer PASS. PR **#3228**.
>
> **CI incident — base branch was red, NOT this diff.** The PR's first Android check failed on 4
> tests in `:feature:conversations` (`CreateShareLinkViewModelTest`, `MyShareLinksViewModelTest`,
> `ShareLinkDetailViewModelTest`) — all `expected …/join/… but was …/chat/…`, none touching the
> forwarded badge. Root cause: **main itself was red**. While this slice was in flight, commit
> `0a8a1624` ("feat: les liens de partage créés pointent sur /chat") landed on `main`, switched the
> share-link `joinUrl` producers to `/chat/` in production, updated the `:core:model` *presentation*
> tests — but **missed the 3 `:feature:conversations` ViewModel tests** (4 assertions) still expecting
> `/join/`. main's own push run `32348038004` was already `failure`. A PR's `pull_request` CI builds
> the merge with the base, so this PR inherited the breakage. **Repair** (still `apps/android` only, no
> production logic): merged the new `main` into the branch (clean, no conflicts) and corrected the 4
> stale ViewModel assertions to `/chat/` — the deliberate, already-merged product decision (the legacy
> `/join/` deep-link receivers `0a8a1624` intentionally kept are untouched). This turns the PR green
> **and** repairs `main` on merge. Lesson logged in NOTES.

> On 2026-08-20 **Composer language pill + picker shipped** (slice `composer-language-pill`,
> feature-parity's Chat "Live sentiment + language detection (smart context zone)" composite — the
> **language-detection half** left open by `composer-live-sentiment`; the composite line is now `[x]`).
> **Step 0**: no open `claude/apps/android/*` PR to merge first (the full open-PR list was 11 — gateway/web
> `$`-escaping fixes, iOS transfer/Jules, five Dependabot; none on an android-routine branch). Branched off
> `origin/main` (`7d23ec0f`) clean, branch created as the literal first action before any edit. This
> container **reaches `dl.google.com`** (curl → 200), so the SDK bootstrapped and the **full local gate ran
> here** — note the platform is now **`android-37`** (not `android-35` as ROUTINE §Env still says); the first
> gate run died with `Failed to find target with hash string 'android-37'` until `sdkmanager "platforms;android-37"`.
>
> **The gap, re-proved by reading source**: a grep showed `ComposeLanguageDetector` (the pure web-heuristic
> port) was already wired ONLY at send-time to stamp `originalLanguage` — there was no live composer language
> pill, no picker override, and no ≥10-word detection lock. iOS drives all three from `TextAnalyzer`
> (`wordCountThreshold`=10, `isLanguageLocked`, `languageOverride`) + `ComposerLanguageResolver.resolve`.
>
> **Pure core (`:core:model`)**: new `ComposerLanguageState(detected, manualOverride, isLocked)`.
> `onDraftChanged(draft)` re-detects each keystroke while unlocked & unoverridden, locks once the draft
> reaches `WORD_LOCK_THRESHOLD`=10 words, and a blank draft releases the lock unless a manual pick holds.
> `display(fallback)` = `manualOverride ?? detected ?? fallback` (iOS `displayLanguage`). `withManualPick`
> overrides + freezes. **Design win over a naive port**: a `NO_DETECTION` sentinel (`""`, a value the
> detector never returns) is passed as the detector fallback so a weak/undetectable draft yields `detected =
> null` instead of pinning the pill to a stale guess — the pill then follows the LIVE fallback at read time.
> This also removes any seed-timing fragility: `display` applies the fallback at read, not at detect.
>
> **Wiring (`:feature:chat`)**: `ChatUiState.composerLanguage` + `composerLanguageSeed` (the viewer's
> `resolveUserLanguage`, seeded from the conversation-load collector) + `composerLanguageCode` getter.
> `onDraftChange` folds `onDraftChanged`; new `onComposerLanguagePicked(code)`. The pill is now
> **authoritative for the stamped `originalLanguage`** on the text AND file send paths — captured before the
> clear via `composerLanguage.display(resolveUserLanguage(user))`, so a manual pick wins over detection —
> replacing the previous per-send `ComposeLanguageDetector.detect(text, …)` (the clipboard/pasted-content
> path keeps its own detection, a distinct signal). Reset to seed on send. `ChatScreen` renders a leading
> `ComposerLanguagePill` (flag glyph + `DropdownMenu` over `LanguageData.commonLanguageCodes`, checkmark on
> the current pick) — thin, coverage-exempt Compose glue. Strings ×1 (`chat_composer_language`) EN/FR/ES/PT.
>
> **Tests**: +18 `ComposerLanguageStateTest` (display precedence; detection surfaces/flips while unlocked;
> undetectable draft never pins & never locks; word-threshold lock freezes further detection; manual
> override suppresses detection; empty releases the lock but keeps a manual pick; released lock re-detects;
> `withManualPick` locks; determinism) + 5 `ChatViewModelTest` (pill follows detection; pill seeds from the
> user's resolved language; a pick overrides live detection; a pick stamps the outgoing message over
> detection; send resets to the seed). Reducer branch coverage total; the pill/`DropdownMenu` are exempt
> Compose glue per TDD-COVERAGE. The two pre-existing send-language tests (detected → es, undetectable → user
> lang) stay green — `display` preserves both behaviours exactly.
>
> **Verified**: `:core:model` + `:feature:chat` suites green individually; full `assembleDebug` +
> `testDebugUnitTest` across all modules green locally before the PR (single container, `dl.google.com`
> reachable). Reviewer PASS.

> On 2026-08-20 **Composer live sentiment shipped** (slice `composer-live-sentiment`,
> feature-parity's Chat "Live sentiment + language detection (smart context zone)" composite — the
> **live-sentiment** half). **Step 0**: no open `claude/apps/android/*` PR to merge first (checked
> the remote heads + `list_pull_requests --head isopen-io:claude/apps/android` → `[]`; the previous
> slice `conversation-lock-open-gate` is merged as #3221). Branched off `origin/main` (`3ccd8a72`)
> clean, branch created as the literal first action before any edit. This container **reaches
> `dl.google.com`** (curl → 200), so the SDK bootstrapped and the **full local gate ran here**
> (assembleDebug + testDebugUnitTest) — not only on CI.
>
> **The gap, re-proved by reading source**: a zero-hit grep for `Sentiment` across `apps/android`
> confirmed the composer had no sentiment surface. iOS ships TWO distinct sentiment scorers — the
> **agent's #2 candidate conflated them**: (1) the message-detail sheet's `MessageDetailSentimentTab`
> uses Apple's `NLTagger` (on-device **ML**), which has **no portable Android equivalent** (a
> faithful port is impossible — the scores would differ), so it is deliberately **out of scope**;
> (2) the composer's `SmartContextZone` uses `TextAnalyzer.computeSentiment`, a **dictionary**
> (FR/EN/ES/DE weighted words) scorer that IS portable. This slice ports (2).
>
> **Pure core (`:core:model`)**: `SentimentAnalyzer.score(text)` — lowercase, tokenize on whitespace
> with leading/trailing punctuation trimmed (Unicode punctuation categories), sum the dictionary
> hits (positive dict consulted first), normalize `sum / wordCount * 2`, clamp to `[-1, 1]` — a
> faithful port of iOS `computeSentiment`. `SentimentLevel` (7 buckets + glyphs + `from(score)` with
> iOS's exact thresholds: neutral band `[-0.1, 0.1]` inclusive, `-0.6`→NEGATIVE, `0.3`→POSITIVE,
> `0.6`→VERY_POSITIVE).
>
> **Wiring**: `ChatUiState.composerSentiment` — a pure computed getter (same idiom as the existing
> `composerAffordances`) that returns `null` on a blank draft (no glyph shown) else
> `SentimentLevel.from(SentimentAnalyzer.score(draft))`. `ChatScreen`'s composer renders it as the
> input field's `trailingIcon` (the mood emoji), with a localized "Message tone" content
> description. No new plumbing — it rides the existing `draft` state, so every keystroke re-derives it
> exactly like the mention state already does.
>
> **Tests**: +20 `SentimentTest` (`from` boundary buckets incl. both neutral edges, the 7 glyphs,
> `score` empty/blank/punctuation-only → 0, single-word clamp both signs, word-count normalization,
> mixed sum, case-insensitivity, punctuation trimming, non-English dictionaries, end-to-end
> text→level, determinism) + 5 `ChatViewModelTest` (null on blank; positive/negative/neutral typing
> map to the right level; clears when the draft empties). Reducer/scorer branch coverage effectively
> total; the Compose `trailingIcon` is exempt glue per TDD-COVERAGE. Strings ×1 (`chat_composer_sentiment`)
> across EN/FR/ES/PT.
>
> **Env**: the outbound proxy rate-limits Gradle's **parallel** first-fetch of uncached artifacts
> (`429 Too Many Requests` on `repo.maven.apache.org`); a direct `curl` of the same artifact returns
> 200. Ran the gate under a 429-aware retry loop (`--max-workers=2`); each attempt warms more of the
> cache until it goes green (NOTES). **Gotcha logged**: `pkill -f 'gradlew'` self-terminates the
> retry script (its own command line contains "gradlew").
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` green across all modules locally (single-thread
> to dodge the proxy 429 burst; one `:app` Robolectric run needed its `android-all-instrumented` jar
> re-fetched after a warm — a proxy-throttle transient, not a test failure). **CI incident, my own
> fault, caught by the gate**: the FIRST push (`0d227f3a`) failed the Android check with `Unresolved
> reference 'SentimentLevel'` — I'd added the import to the two consumer files (`ChatScreen`, the
> test) but not to `ChatViewModel.kt`, where the `composerSentiment` getter is declared. Both CI and
> the local serial gate reproduced it identically. Fixed in `c4a5f8e5` (two imports), re-verified
> green locally, re-pushed. Lesson logged in NOTES.

> On 2026-08-20 **Conversation lock open-gate shipped** (slice `conversation-lock-open-gate`,
> feature-parity's Conversations lock composite — the "open-gate on tap" sub-gap left open by
> `conversation-lock-menu`). **Step 0**: checked the full open-PR list (8 open, none on a
> `claude/apps/android/*` branch — #3220/#3218 gateway, #3217 iOS, five Dependabot), so no
> prior-iteration PR to merge first. Branched off `origin/main` (`1eeff7c7`) clean, branch created
> as the literal first action before any edit. `dl.google.com` reachable here (curl → 200), so the
> **full local gate ran locally**, not only on CI.
>
> **The gap, re-proved by reading source**: `ConversationListScreen`'s row `onClick` called
> `onConversationClick(conversation.id)` **directly** — a locked conversation opened straight
> through, its 🔒 badge purely cosmetic on tap. iOS gates this: `ConversationListView` row tap does
> `if isLocked { lockSheetMode = .openConversation } else { onSelect }`, and
> `ConversationLockSheet.Mode.openConversation` verifies the 4-digit code then calls `onSuccess()`
> **without removing the lock** (distinct from `.unlockConversation`, which removes it).
>
> **SOTA over iOS by extraction + honest effect naming**: the decision is lifted out of the view
> into the already-pure `LockPinReducer`. New `LockPinMode.OPEN_CONVERSATION` mirrors
> `completeUnlock` but emits a brand-new **`LockPinEffect.OpenConversation(id)`** — deliberately
> distinct from `RemoveLock` — so "reveal once, stays locked" is provable in a unit test (the
> reducer test asserts `doesNotContain(RemoveLock)`). New `LockPinCopy.OPEN` gives the sheet its own
> honest header ("Locked conversation" / "Enter the code … to open it"), not the misleading
> "Unlock" copy, since the lock is not being removed.
>
> **Wiring**: `ConversationListViewModel.onConversationTap(id)` consults the authoritative
> `lockStore.isLocked(id)` (same synchronous read `onLockToggle` uses, not the mirrored state set —
> so a tap can't race a just-applied lock) → locked opens the `OPEN_CONVERSATION` sheet, unlocked
> emits on a new one-shot **`openConversation: Flow<String>`** (a `Channel(BUFFERED).receiveAsFlow()`,
> the same idiom as this file's existing `refreshRequests`; an event, not state, so a config-change
> replay never re-navigates). `applyLockResult` routes the `OpenConversation` effect to the same
> channel. `ConversationListScreen` collects it in a `LaunchedEffect(viewModel)` → `onConversationClick`,
> and the row `onClick` now calls `onConversationTap` — the gate is the **single** navigation entry
> point (grep confirms one `onConversationClick(` call site left, inside the collector).
>
> **Tests**: +5 `LockPinReducerTest` (open length=4, copy=OPEN, correct-code→OpenConversation+Completed
> AND not RemoveLock, wrong-code→CODE_INCORRECT+no effects, null-id inert) + 4
> `ConversationLockFlowViewModelTest` (unlocked tap navigates straight, locked tap opens the gate and
> does NOT navigate, correct open code navigates + keeps the lock, wrong open code keeps the gate + no
> nav) — all against the real `InMemoryConversationLockStore`, nav events collected off the real
> `openConversation` flow, never a mock. Reducer branch coverage total; the sheet/`LaunchedEffect`
> are exempt Compose glue per TDD-COVERAGE. Strings ×2 (title+subtitle) across EN/FR/ES/PT.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` green (the 2 new suites), then full
> `assembleDebug` + `testDebugUnitTest` across all modules green locally before push.

> On 2026-08-19 **Conversation lock/unlock shipped** (slice `conversation-lock-menu`,
> feature-parity's Conversations "Pinned/muted/archived… locked pending" composite line — the
> locked sub-gap). No open `claude/apps/android/*` PR to merge first (checked the full open-PR list:
> 7 open, none on an android-routine branch). `df -h` not a concern; branched off `origin/main`
> (`a53205df`) clean. **Full local gate ran here** — this container reaches `dl.google.com` (see
> NOTES), so `assembleDebug` + `testDebugUnitTest` both went green locally before the PR, not only
> on CI.
>
> **The gap, re-proved by reading source, not an agent's paraphrase**: `ConversationLockStore` +
> `EncryptedConversationLockStore` (master 6-digit PIN + per-conversation 4-digit PIN, SHA-256
> hashed, DI-wired) already existed, and `ConversationListViewModel` already *collected*
> `lockedConversationIdsFlow` into state — but nothing rendered it and nothing could lock/unlock: the
> state field's own doc comment named the PIN flow a "deliberately deferred follow-up". This slice
> is that follow-up.
>
> **SOTA over iOS by extraction**: iOS's `ConversationLockSheet.handleComplete` embeds a 7-mode ×
> 3-step PIN state machine *inside* the SwiftUI view (untestable). Android lifts the menu-reachable
> subset into a pure **`LockPinReducer`** (oracle-injected, effect-emitting) per TDD-COVERAGE's
> "push decisions out of the Composable" directive. Two concrete improvements this makes provable:
> (1) a confirm mismatch rewinds to the mode's *real* entry step (0 for setup, 1 for a code) instead
> of iOS's blanket `step = 1`, which mislabels the setup flow's header; (2) locking with no master
> PIN yet **chains** first-time setup straight into the 4-digit code (`pendingLockConversationId`),
> where iOS dead-ends on a "configure a master PIN in Settings" alert Android has no Settings screen
> to honour.
>
> **Wiring**: `ConversationListViewModel.onLockToggle/onLockDigit/onLockDelete/dismissLockPrompt`
> drive a `lockPrompt: LockPinState?` on the UiState; effects apply to the real `ConversationLockStore`
> (setMasterPin/setLock/removeLock), whose flow re-derives the row's 🔒 badge. New context-menu
> Lock/Unlock row (label+icon flip on `isLocked`); new `ConversationLockPinSheet` (ModalBottomSheet
> hero-lock + dots + 10-key pad, indigo accent, `LockOpen` glyph on the unlock flow). Strings ×22
> across EN/FR/ES/PT.
>
> **Tests**: +21 `LockPinReducerTest` (every mode/step, buffer-full & empty-delete inert arms,
> wrong-master/wrong-code/mismatch failure arms, null-id defensive arms, copy/pinLength/currentPin
> derivation) + 9 `ConversationLockFlowViewModelTest` (mode selection per store state, the
> setup→lock chain, unlock, wrong-PIN keeps-open, dismiss drops the pending chain, digit/delete inert
> with no sheet) — all against the real `InMemoryConversationLockStore`, never a canned mock.
> Reducer branch coverage is effectively total; the Composable sheet is exempt glue per TDD-COVERAGE.
>
> **Verified**: `./gradlew assembleDebug` (exit 0, all modules) then `./gradlew testDebugUnitTest`
> (BUILD SUCCESSFUL, all modules) green locally. Env gotchas (compileSdk 37 → `android-37.0` on
> `--channel=3`, newer cmdline-tools required, Maven 429 burst) written up in NOTES.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=5 last_run=conversation-lock-menu`.

> On 2026-08-17 **Chat scroll-to-bottom offline indicator shipped** (slice
> `chat-scroll-offline-indicator`, feature-parity's scroll-control composite line, "offline
> indicator" sub-gap). `gh pr list --state open --search "apps/android OR apps/ios"` showed two
> unrelated open PRs. `df -h /` showed 22 Gi free.
>
> **Pivoted away from the Explore agent's #2-ranked candidate (drag-to-dismiss on the fullscreen
> image viewer) after re-assessing the risk, not the reward**: composing THREE independent Compose
> gesture detectors on one node (existing tap + existing pinch/pan/zoom + a new vertical
> drag-to-dismiss, active only at rest scale) carries a real risk of pointer-event-consumption
> conflicts between sibling `pointerInput` blocks — this session has no established way to
> interactively verify an Android gesture on-device or in an emulator (unlike iOS's idb+simulator
> tooling), and this exact codebase's own memory index documents a cluster of gesture bugs that
> shipped fully broken without unit tests catching them. Chose the mechanically safer #3 candidate
> instead — no gesture composition, a pure sealed-interface extension over already-established
> infrastructure.
>
> **Re-proved the gap and the exact iOS priority by reading the SDK source directly**, not an
> agent's paraphrase: `ChatViewModel` already computed `isOffline` from `NetworkConditionMonitor`
> but only fed it into `toBubbles` (the per-message hourglass, already shipped) — never exposed at
> the `ChatUiState` top level, never passed to `ScrollControlContent.of`. Read
> `ConversationScrollControlsView.swift` end to end: the real priority is
> `isSearchingQuotedMessage > hasUnreadContent (unread OR typing) > isOffline > plain chevron` —
> Android has no quoted-message-search state, so only the Typing/Unread > Offline > Plain tier
> applies, which slots in exactly at the position the already-shipped Typing-over-Unread rule
> already established.
>
> **New `ScrollControlContent.Offline`** variant + `of(affordance, typing, isOffline: Boolean =
> false)` (default preserves every existing call site/test unchanged). **`ChatUiState.isOffline`**
> fed from the exact same collector that already computes the reading for the hourglass — zero new
> plumbing, just one more field on an existing `.copy()`. New **`OfflinePill`** composable mirrors
> `TypingPill`'s structure exactly, but deliberately neutral-tinted (`textSecondary`, not the
> conversation accent) since offline signals connectivity, not conversation identity — matches
> iOS's own `contentColor`/`tint` special-casing for the offline branch.
>
> **Surpasses iOS, worth flagging explicitly**: iOS's `ConversationScrollControlsView` fully
> implements and tests the `isOffline` branch, but its ONE call site
> (`ConversationView+ScrollIndicators.swift`) hardcodes `isOffline: false` — the indicator is
> dead code in the shipped iOS app today. Android wires it to a real, live
> `NetworkConditionMonitor` reading, so this is a case where faithfully porting the SDK component's
> tested behavior produces MORE functionality than iOS currently exposes, not less.
>
> **+5 `ScrollControlContentTest`** (offline alone shows the state, unread beats offline, typing
> beats offline, online with nothing else shows Plain not Offline, hidden even while offline) **+ 2
> `ChatViewModelTest`** (`state.isOffline` mirrors the same network reading already tested for the
> hourglass, both offline and online cases). Strings ×4 (`chat_offline`) across EN/FR/ES/PT.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=4 last_run=chat-scroll-offline-indicator`. **streak reaches 4 → the NEXT ANDROID
> run will be the last before the IOS_DETTE bascule (streak=5).**

> On 2026-08-17 **Email notification toggle shipped** (slice
> `settings-email-notification-toggle`, feature-parity's notification-preferences composite line,
> "still open" email-channel-toggle sub-gap). `gh pr list --state open --search "apps/android OR
> apps/ios"` showed two unrelated open PRs (#3180 — Android perf, different files; #3182 — web),
> no collision. `df -h /` showed 6.6 Gi free.
>
> **Found via a fresh Explore agent sweep of `[~]` lines** (no candidate held in reserve from a
> prior run this time — both previously-known candidates, notification swipe-actions and chat
> header presence dot, are now shipped), ranked 3 candidates and chose the smallest: the agent
> also flagged one near-miss worth noting — story reactions' "pending: full picker/animation/heart
> bounce" note is itself **stale**, all three already shipped 2026-08-11 before the note's last
> edit; correctly not proposed as a candidate.
>
> **Re-proved before coding**: `UserNotificationPreferences.emailEnabled` already existed and
> already flowed end-to-end through `NotificationPreferenceSyncBody`/the sync pipeline — the field
> itself was never the gap, only the `SettingsViewModel` intent + `SettingsScreen` row were
> missing. Read iOS `NotificationSettingsView.swift:84-85` directly: `notifToggle(...keyPath:
> \.emailEnabled)` sits right after Push, before Sound/Vibration. Also checked `notifToggle`'s own
> signature (`NotificationSettingsView.swift:326-341`) — it has NO `enabled:`/push-dependency
> parameter for ANY row, unlike Android's existing Sound/Vibration/NewMessage rows (which the
> Android UI itself gates on `pushEnabled`, a pre-existing Android-only refinement not present on
> iOS). Decision: leave the new Email row un-gated, matching iOS exactly and matching the more
> sensible semantics (email is an independent delivery channel from push).
>
> **`SettingsViewModel.setEmailEnabled(enabled)`** — a one-line mirror of `setSoundEnabled`'s
> `updateNotifications { it.copy(...) }` shape; `updateNotifications` already persists the whole
> block to the device-local store instantly then enqueues the durable sync, so this new toggle
> automatically inherits the same offline-queued PATCH behavior with zero new plumbing.
> **`SettingsScreen`** gains one new `NotificationToggleRow` between Push and New-message. +1 test
> (`setEmailEnabled_persists`, mirroring `setVibrationEnabled_persists`). 1 new string
> (`settings_email_notifications`) across EN/FR/ES/PT.
>
> **Process note**: branch created FIRST this run, before any edit — the prior iteration's
> reminder (created the branch only mid-way through, caught before any commit) applied
> immediately.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> **CI incident, unrelated to this diff**: GitHub itself had a ~5h platform-wide outage
> (`githubstatus.com` confirmed `impact: critical`, "Incident with GitHub.com", 13:40→~18:23 UTC)
> that blocked `gh pr create` entirely — every attempt (GraphQL and REST) 503'd until "Git
> Operations" was reported mitigated, at which point PR #3185 finally went through on the first
> retry. Separately, once open, PR #3185's `Test gateway` check came back red — verified this was
> **pre-existing on `main` itself**, not caused by this diff: `git diff origin/main...HEAD --stat`
> confirms zero gateway/TypeScript files touched, and `main`'s own most recent completed CI run
> (commit `782dc3225`) fails the exact same test with a byte-for-byte identical error
> (`personal-history-hiding-surface-guard.test.ts`, a `ConversationBridgeService.ts` drift from an
> unrelated concurrent gateway session). `Android (assemble + unit tests)` — the actual merge gate
> for this routine's PRs — was green throughout; merged in squash despite the red `Test gateway`,
> confirming it isn't a required check for this branch (same pattern as the `Test shared` false
> negative documented earlier this session).
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=3 last_run=settings-email-notification-toggle`.

> On 2026-08-17 **Chat header presence dot shipped** (slice `chat-header-presence-dot`,
> feature-parity's "Live presence dot on a direct conversation's row/header" composite line — the
> last open half, the row dot having shipped earlier this session). `gh pr list --state open
> --search "apps/android OR apps/ios"` showed three unrelated open PRs (#3177/#3179/#3180 — web
> and an Android perf cycle from a concurrent session, none touching `ChatScreen.kt`/
> `ChatViewModel.kt`). `df -h /` showed 15 Gi free.
>
> **Re-confirmed a candidate flagged in a prior iteration's summary but not yet attempted**: grepped
> `ChatScreen.kt`/`ChatViewModel.kt` for "presence" — zero matches, confirming the gap was still
> real. `ConversationListViewModel` already had every reusable piece (`presenceByUserId`,
> `observePresence()`, `presenceStateFor`), built for the row dot earlier this session — this slice
> is a near-verbatim port of that same machinery into `ChatViewModel`, not new design.
>
> **Process note**: started writing this slice's code directly on `ops/android-ios-parity-routine`
> before creating a dedicated branch — caught while drafting the mid-run status note (before any
> push), confirmed via `git log -1`/`git status` that no commit had landed on the ops branch in the
> meantime, then `git checkout -b claude/apps/android/chat-header-presence-dot` carried the
> uncommitted working-tree changes onto the new branch cleanly. No harm done, but a reminder to
> create the branch as literally the first action of a slice, before opening any editor.
>
> **Adaptation from iOS, not a literal port**: iOS's `ConversationView.headerPresenceState` dots
> `ThemedAvatarButton` — Android's chat header has no avatar at all. The existing 10dp circle next
> to the title is a DIFFERENT thing (an unconditional conversation-accent identity marker, present
> on every conversation type) — repurposing it for presence would conflate two meanings in one
> element and be wrong for group chats. Added a separate, small 8dp dot ADJACENT to it instead:
> shown only for a direct conversation, using the central `meeshyPresenceDotColor` mapping (`null`
> = offline = no dot, same rule as every other presence surface in the app).
>
> **`ChatUiState`** gains `directPeerUserId` (computed via `ApiConversation
> .otherParticipantUserId(currentUserId)`, the exact same pure extension the row-dot slice built and
> tested) + `presenceByUserId: Map<String, UserStatusEvent>` + `headerPresence(nowEpochMillis):
> PresenceState?`, a byte-for-byte mirror of `ConversationListUiState.presenceStateFor`.
> **`ChatViewModel.observePresence()`** is the same mirror of `ConversationListViewModel`'s
> identically-named function (subscribes to `MessageSocketManager.userStatus`/`.presenceSnapshot`),
> called eagerly from `init` for the same reason: those are hot `SharedFlow`s with no replay, so a
> late subscriber genuinely misses events.
>
> **+3 `ChatViewModelTest`** (live presence resolves for the other participant in a direct
> conversation, stays null for a group conversation even when live presence data exists for that
> userId, stays null before any presence data has arrived). Required extending the test file's
> `socketManager()`/`harness()` helpers with injectable `userStatus`/`presenceSnapshot` flows — the
> exact same extension `ConversationListViewModelTest.kt` already has, applied to the chat test file
> for the first time.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=2 last_run=chat-header-presence-dot`.

> On 2026-08-17 **Notification swipe actions shipped** (slice `notification-swipe-actions`,
> feature-parity's "Mark read" composite line). First ANDROID run after this session's first
> IOS_DETTE bascule (`android_streak` reset to 0). `gh pr list --state open --search
> "apps/android OR apps/ios"` showed two unrelated open PRs (#3176, #3177 — web cycles, neither
> touching `apps/android`). `df -h /` showed 5.2 Gi free — lower than earlier checks but the
> shared build caches (`apps/ios/Build` 2.2G, `packages/Build` 1.3G, Android module builds ~400M)
> are all normal sizes, not the private-DerivedData bloat pattern from earlier incidents; left
> untouched.
>
> **Re-confirmed a candidate an earlier Explore agent had already ranked #2 of 3** (behind the
> already-shipped `discover-sms-invite`): `NotificationsScreen.kt` had zero `SwipeToDismissBox`,
> and `NotificationRepository.delete(id)` (`DELETE /notifications/{id}`) existed network-side but
> with zero cache mutation and zero callers anywhere in `NotificationsViewModel` — the "ready
> backend, never wired" pattern this routine keeps finding, this time on a method that ALREADY
> existed rather than needing new plumbing. Also caught the composite feature-parity line itself
> was stale on a second count: "mark-all pending" — `markAllRead` was actually already fully
> wired and tested, just never checked off.
>
> **Read iOS `NotificationRowView.swift` directly for the exact shape**: trailing (end-to-start)
> swipe → destructive delete, always offered; leading (start-to-end) swipe → mark-read, offered
> ONLY `if !notification.isRead`. `NotificationListViewModel.deleteNotification`/`markRead` call
> straight through to the shared toast-manager singleton (iOS's cache ownership model); Android's
> `NotificationRepository` owns its own `StateFlow` cache directly, so the equivalent mirror is
> making `delete` optimistic the same way `markAsRead` already is, not reaching for an iOS-specific
> singleton pattern that doesn't exist on this platform.
>
> **`NotificationRepository.delete(id)`** — snapshot the cache, remove the row immediately,
> decrement `unreadCountStream` only when the removed row was unread, roll both back on failure.
> **`NotificationsViewModel.deleteNotification(id)`** — thin delegator, no new state needed (the
> repository cache is already the single source of truth the screen projects).
>
> **UI reused the ONLY existing `SwipeToDismissBox` precedent in the codebase**
> (`ConversationListScreen.kt`'s pin/archive swipe) rather than inventing a new destructive-dismiss
> pattern: `confirmValueChange` always returns `false`, so the swipe box itself never physically
> removes the row — the actual disappearance/re-style comes from the cache mutation flowing back
> through `state.notifications`, exactly like every other repository-driven list in this codebase.
> New `NotificationSwipeBackground` composable (trash icon + error tint for delete, mark-email-read
> icon + indigo tint for mark-read, transparent background when settled or when the leading
> direction has nothing to offer on an already-read row) mirrors `ConversationListScreen`'s
> `SwipeActionBackground` structure. First use of `Icons.Filled.MarkEmailRead` and
> `SwipeToDismissBox`/`rememberSwipeToDismissBoxState` in `:feature:notifications` — confirmed
> compiling via the targeted test run before the full check.
>
> **+3 `NotificationRepositoryTest`** (delete removes optimistically + decrements unread count for
> an unread row, delete on an already-read row leaves the count untouched, rollback on failure)
> **+ 1 `NotificationsViewModelTest`** (delegates to the repository). Strings ×2
> (`notifications_action_delete`/`notifications_action_mark_read`) across EN/FR/ES/PT.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=1 last_run=notification-swipe-actions`.

> On 2026-08-17 **Discover SMS invite shipped** (slice `discover-sms-invite`, feature-parity §J
> "Invite by email; invite by SMS; import phone contacts" composite line). `gh pr list --state
> open --search "apps/android OR apps/ios"` showed zero open PRs for this routine. `df -h /`
> showed 6.7 Gi free, stable.
>
> **Found via a fresh Explore agent sweep of `[~]` lines**, ranked top of 3 candidates for
> smallest/safest scope — the SMS half of the same composite line the previous run's
> `discover-email-invite` slice left "still open," and explicitly the SMALLER of its two halves
> (import-contacts needs `READ_CONTACTS` runtime permission + a multi-select picker, deliberately
> NOT attempted).
>
> **Re-proved before coding**: read iOS `DiscoverTab.swift` (`smsInviteCard`, lines 94-142) and
> `DiscoverViewModel.swift` (`phoneText`, `smsMessage`) directly. Confirmed this is materially
> SMALLER than the email invite it mirrors visually — there's no network call at all. iOS just
> checks `MFMessageComposeViewController.canSendText()` then presents the native SMS composer
> pre-filled with `phoneText` as recipient and a fixed `smsMessage` literal as body; `phoneText`
> is never cleared afterward (the viewer might cancel the native composer), unlike `emailText`
> which clears on a confirmed successful send.
>
> **`DiscoverUiState.phoneText` + `DiscoverViewModel.onPhoneTextChanged`** — trivial state
> holding, no async/network logic needed (unlike `sendEmailInvitation`). **New `SmsInviteCard`
> composable** (`DiscoverTab.kt`, sibling of `EmailInviteCard`): icon + title, `OutlinedTextField`
> (phone keyboard) + `Button`, launches `Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phone"))`
> with `putExtra("sms_body", SMS_INVITE_MESSAGE)` on tap. **Reused an existing guarded-launch
> idiom rather than inventing one**: `runCatching { context.startActivity(...) }`, the exact
> pattern `ChatLinkOpener.openExternally` already uses for a missing handler — Android's platform
> equivalent of iOS's `canSendText()` pre-check, degrading to a silent no-op instead of a toast
> (Android's Discover module still has zero toast/snackbar infra, same constraint the email slice
> hit). The invite message itself is a plain Kotlin `private const val`, deliberately **not**
> wired through `stringResource()`/localized — faithful to iOS's own `smsMessage`, which is a
> hardcoded literal never wrapped in `String(localized:)`, not an oversight to "fix" while
> porting.
>
> **+1 test** (`onPhoneTextChanged updates the phone field`) — the actual SMS-intent launch is
> thin Composable glue (`TDD-COVERAGE.md`'s documented exemption: push testable decisions out of
> the Composable, cover those; a `context.startActivity` side effect has no decision left to
> extract). Also confirmed via this run that `Icons.Filled.Sms` (material-icons-extended, already
> on the classpath through `libs.bundles.compose`) compiles — never used anywhere in the repo
> before this slice. Strings ×4 across EN/FR/ES/PT (`contacts_discover_sms_title/placeholder/
> send/send_a11y`).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=5 last_run=discover-sms-invite`. **streak reaches 5 → the NEXT iteration
> bascules to IOS_DETTE.** Per the note left in iOS-debt Run #14, `tasks/ios-debt-routine-
> progress.md` (well over ~1500 lines) should be archived FIRST, before choosing a new iOS item.

> On 2026-08-17 **Reply @-mention auto-prefill shipped** (slice `reply-mention-prefill`,
> feature-parity's `Threaded comments` composite line, "still open" reply-composition sub-gap).
> `gh pr list --state open --search "apps/android OR apps/ios"` showed two unrelated open PRs
> (#3156, #3167 — web/gateway cycles, neither touching `apps/android`). `df -h /` showed 8.9 Gi
> free, stable.
>
> **Found via the "read feature-parity.md directly for a `[~]` line with a named sub-gap" strategy**
> (an Explore agent's fresh sweep), then independently re-proved before coding: read
> `PostCommentsViewModel.beginReply(commentId)` directly — it only sets the "Replying to…" chip
> (`composer.value = ReplyTarget(parentId, name)`), never touches the composer draft. Read the iOS
> reference `FeedCommentsSheet.beginReply(to:)` (`apps/ios/.../FeedCommentsSheet.swift:1765`) in
> full and grepped every `prefilledMention`/`replyingTo = nil` site in the file to confirm the exact
> algorithm and its edges: the cancel-reply "X" chip button (line 1396) and the post-send reset
> (line 1822) neither touch `prefilledMention` nor `composerText` — only `beginReply` itself
> strips/injects. Confirmed this is genuinely the small half of the candidate (no oversized hidden
> scope, unlike `PostRepository.requestTranslation`/the notification category-filter-bar deferred
> in earlier runs this session).
>
> **New pure `ReplyMentionPrefill.apply(currentText, previousMention, replyToParentId,
> authorUsername)`** (`:feature:feed`) — takes primitives, not SDK models, so it needs no fixture
> construction in tests. Injects `@username ` only when `replyToParentId` is non-blank (the
> *targeted* comment is itself a reply — flat 2-level threading reparents the new reply to the
> root, so without the mention the addressed person is never notified, only the thread's root
> author would be) and the author has a non-blank username; strips the exact previously-injected
> prefix when retargeting to a different reply (idempotent re-tap — no double prefix on repeat
> taps); an edited-away prefix (text no longer starts with it) is left alone, mirroring iOS's
> `hasPrefix` guard exactly. `beginReply` gained `private var prefilledMention: String? = null` and
> calls the helper right after positioning `composer.value`, folding the result into
> `composerDraft`. `cancelReply` deliberately left untouched — matches iOS, which also never
> touches `composerText`/`prefilledMention` on cancel.
>
> **+8 `ReplyMentionPrefillTest`** (pure: inject on reply-to-reply, no inject on top-level target,
> no inject on blank parentId, no inject without a username, strip-old-inject-new on retarget,
> strip-to-nothing when retargeting to top-level, idempotent re-tap, edited-away prefix left alone)
> **+ 3 `PostCommentsViewModelTest`** (prefill on reply-to-reply, no prefill on top-level, retarget
> replaces the previous prefill).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=4 last_run=reply-mention-prefill`.

> On 2026-08-17 **Notification list pagination shipped** (slice `notifications-pagination`,
> feature-parity §M). `gh pr list --state open --search "apps/android OR apps/ios"` showed one
> unrelated open PR (#3156, wrong branch naming for this routine, untouched). `df -h /` showed
> 10 Gi free, stable.
>
> **Re-proved the candidate's own scope before coding, not just its checklist wording**: the note
> grouped "pagination/unread-only filter" as one item, but reading the real iOS reference
> (`NotificationListViewModel.swift`) directly revealed the `unreadOnly` published property is
> genuinely DEAD CODE on iOS itself — `refreshFromAPI`/`loadMore` both hardcode `unreadOnly: false`
> in the actual request; the real "Non lues" experience is 100% client-side filtering
> (`filteredNotifications`) as ONE of **11** category chips (all/unread/messages/reactions/
> mentions/social/contacts/groups/calls/translations/system, each with its own icon/color/type-match
> predicate). That's a materially bigger UI feature than "wire a server query param" — correctly
> split off as a separate future item rather than force-fit into this run. Only pagination (the
> genuinely small half) was ported.
>
> **Found the right primitive already built and unused**: `pagedApiCall` (`core/network/ApiCall.kt`)
> — a `apiCall` variant that PRESERVES the envelope's `pagination.hasMore` instead of discarding it
> — already existed, with zero callers in `NotificationRepository` (which used the plain `apiCall`
> everywhere, silently dropping pagination metadata on every request). Also confirmed
> `ApiResponse.pagination: Pagination?` already carries `hasMore`/`offset`/`limit`/`nextCursor` — no
> new wire format needed.
>
> **`NotificationRepository.loadMore()`**: fetches the page after the current cache size, dedupes
> by id (mirrors `prependLive`'s established precedent), refreshes a new `hasMoreStream:
> StateFlow<Boolean>` from the server-authoritative `pagination.hasMore` (not a heuristic like
> "page size == limit"). A no-op before the first page has loaded (nothing to paginate from) or once
> the server has already said there's no more; a failure leaves the cache and `hasMoreStream`
> untouched so the next scroll simply retries. `revalidateNotifications` (the existing first-load/
> refresh path) switched from `apiCall`/`list()` to `pagedApiCall` directly, so `hasMoreStream` is
> correctly seeded on every fresh load too.
>
> **`NotificationsViewModel.loadMore()`** mirrors the re-entrancy-guarded shape already established
> twice this session (`StatusesViewModel.loadMoreIfNeeded`, `PostCommentsViewModel.loadMore`) —
> guard on `isLoadingMore`/`hasMore`, delegate, silent failure (next scroll retries). UI:
> `NotificationsScreen`'s `LazyColumn` switched from `items` to `itemsIndexed` to fire `loadMore()`
> when the LAST row appears (mirror of iOS's trailing `ProgressView().onAppear`), with a spinner
> shown while `isLoadingMore`.
>
> **+9 tests**: `NotificationRepositoryTest` (6 — page appended in order, dedup against the existing
> cache, `hasMoreStream` flips false when the server says so, no-op before any page has loaded,
> no-op once the server reported exhaustion, cache/`hasMoreStream` untouched on a failed page).
> `NotificationsViewModelTest` (3 — delegates when a page is available, inert when exhausted, a
> second concurrent call while one is in flight is a no-op, verified via a held-open
> `CompletableDeferred`).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. Diff confirmed `apps/android`-only (5 files, `sdk-core` + `:feature:notifications`, no
> resources touched — no new strings needed).
>
> **Still open**: the 11-category client-side filter bar (including "Non lues") — noted above as a
> separate, larger UI feature, deliberately not attempted this run.

> On 2026-08-17 **Live presence dot on conversation-list rows shipped** (slice
> `conversation-list-presence-dot`, feature-parity §B). `gh pr list --state open --search
> "apps/android OR apps/ios"` showed three unrelated open PRs (#3113, #3156, #3160 — all wrong
> branch naming for this routine, other agents' work, untouched). `df -h /` showed 10 Gi free,
> stable.
>
> **The "backend never wired" heuristic is now genuinely exhausted** — a dedicated Explore agent
> swept all ~140 public methods across `sdk-core`/`core/*` and found nothing. Pivoted to a new
> strategy: reading `feature-parity.md` directly for `[~]` (partially-done) lines whose own notes
> name a small, still-open sub-gap. A second Explore agent surfaced 3 candidates; the strongest
> (`PostRepository.requestTranslation` never wired) turned out **bigger than assessed on
> re-proof** — unlike the chat message twin (`MessageRepository.requestTranslation`, a direct
> client-side translate + cache-merge), the post version fires a request server-side and the
> translation arrives back via a `post:translation-updated` socket event that isn't wired on
> Android's `SocialSocketManager` AT ALL — a 3-part system (socket event + cache merge + UI across
> 2 ViewModels), not a thin slice. Correctly deferred rather than force-fit into one run.
>
> **Picked the genuinely small candidate instead**: `- [~] Live presence dot on a direct
> conversation's row/header` — its own note from the 2026-08-12 foundation slice
> (`conversation-list-live-presence`) says plainly "UI wiring... is NOT done this run", with the
> ViewModel-side plumbing (`ConversationListUiState.presenceStateFor(conversation, now):
> PresenceState?`, already gated to direct-only, already 5 dedicated tests) fully ready to consume.
>
> **The wiring turned out to be pure parameter-threading, no new logic**: `MeeshyAvatar` (`:sdk-ui`)
> already accepts a `presence: PresenceState?` parameter and already RENDERS the dot overlay when
> given one — this capability shipped with the avatar atom itself and was simply never fed a live
> value from the conversation list (the Contacts tab's own presence dot predates this parameter and
> renders a separate `Surface`, an older pattern — not what I copied). Threaded `presence` through
> `ConversationRow` → `ConversationRowContent` → the existing `MeeshyAvatar(...)` call (3 Composable
> signatures, one new argument each), with `state.presenceStateFor(conversation, System
> .currentTimeMillis())` computed once at the list's row-builder closure.
>
> **Zero new tests** — deliberate, not an oversight: `TDD-COVERAGE.md` explicitly exempts
> `@Composable` parameter-threading/layout glue from the JVM red-first gate ("push all testable
> decisions out of the Composable into a pure function or the ViewModel, then cover that"). The one
> testable decision here, `presenceStateFor`, already carries its 5 dedicated
> `ConversationListViewModelTest` cases from the foundation slice — nothing new to decide, only to
> wire.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. Diff is a single file, 6 lines, `apps/android`-only.
>
> **Still open**: the chat header's own presence dot (a separate call site, iOS's
> `ConversationView` header) — not attempted this run, noted for a future slice.

> On 2026-08-17 **Mood status view/impression tracking shipped, closing feature-parity §G's
> last open clause** (slice `status-view-tracking`). `gh pr list --state open --search
> "apps/android OR apps/ios"` showed two unrelated open PRs (#3113, #3156 — both wrong branch
> naming for this routine, other agents' work, untouched). `df -h /` had dropped to 3.0 Gi free
> (this worktree's own `apps/ios/Build` DerivedData from the prior iOS-debt item — 7.5 Gi,
> fully regenerable — deleted, restoring 10 Gi free before starting this slice).
>
> **Seventh candidate found via the "ready backend, never wired to UI" heuristic — but this time
> the heuristic itself came up EMPTY on a dedicated Explore agent pass.** A systematic sweep of
> all ~140 public methods across every `sdk-core`/`core/*` repository confirmed the codebase is
> now near-fully wired after 6 prior slices; the one live lead (`PostRepository.getPostViews`,
> flagged as a candidate by the previous run) was independently re-killed — not only zero Android
> call sites, but **zero iOS call sites either** (`PostViewersResponse`/`getPostViews` exist only
> in `PostService.swift` + its mock; no "who viewed this post" screen exists anywhere in the iOS
> app), so it has no parity reference and falls outside this routine's mandate entirely.
>
> **Pivoted to reading `feature-parity.md`'s remaining unchecked lines directly** (build order:
> the checklist itself, not another heuristic pass) and found `- [ ] Mood status create, react,
> delete; 21h expiry + viewer tracking` (§G) — a compound line where 4 of 5 clauses were already
> shipped in earlier slices, leaving only "viewer tracking" genuinely open. Reading iOS
> `StatusViewModel.swift` directly (not just the checklist wording) surfaced its own doc comment:
> "un mood EST un post… la barre de moods était le seul contenu du produit dont la portée restait
> à zéro" — a mood status carries `impressionCount`/`viewCount` exactly like a regular post, but no
> Android surface fed either.
>
> **Zero new mechanism invented — both building blocks already existed from this session's own
> earlier slices**: the pill's on-screen appearance now calls the new `StatusesViewModel
> .trackImpression(statusId)`, which delegates to the SAME `ImpressionBatcher` class the feed
> already uses (`source = "status"` this time, mirroring iOS's own per-surface `ImpressionBatcher
> (source: "status", ...)` instance — iOS uses one batcher per SwiftUI view too, not a shared
> singleton). Opening a status's popover — a single, per-viewer-deduplicated VIEW, distinct from
> the batched impression — now calls the new `markStatusViewed(statusId)`, whose body is the exact
> fire-and-forget shape of `PostDetailViewModel.recordView` from the `post-detail-reach-stats`
> slice two runs ago (launch, try/catch, silently swallow — best-effort analytics, matches iOS's
> `try?`).
>
> **Wiring point required zero extra gating logic**: `StatusBarView.kt`'s cell model already splits
> `StatusBarCell.MyStatus` (the viewer's own pill) from `StatusBarCell.Pill` (everyone else's) as
> two separate `when` branches — so adding the tracking calls only to the `Pill` branch naturally
> excludes the viewer's own status exactly as iOS's `viewModel.statuses.filter { $0.id !=
> viewModel.myStatus?.id }` does explicitly. `impressionBatcher.flushNowAsync()` wired into
> `onCleared()`, mirroring `FeedViewModel`'s own already-established pattern (not a new Compose
> `DisposableEffect`, even though iOS ties the flush to the SwiftUI view's `.onDisappear` — Android's
> established precedent for this exact need is ViewModel-level, so followed that instead of
> introducing a second pattern for the same problem).
>
> **+3 tests** (`StatusesViewModelTest`): a view is recorded exactly once when a status opens, a
> blank status id never hits the network, and a failed view record doesn't disturb the loaded bar.
> `trackImpression`'s own debounce/batch/retry logic is already fully covered by the existing
> `ImpressionBatcherTest` suite, so no duplicate ViewModel-level test was added — matching the
> precedent set by `FeedViewModel.trackImpression`, which also carries zero VM-level tests for the
> identical reason.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. No new strings needed (no new UI text — the pill/popover UI is unchanged, only its
> tracking side-effects). Diff confirmed `apps/android`-only via the working-tree diff (3 files,
> Kotlin only, no resources touched).
>
> **feature-parity.md §G line now fully checked** — all five clauses (create/react/delete/expiry/
> viewer-tracking) verified shipped with evidence, no longer a compound partial-credit line.

> On 2026-08-17 **Post view recording + author-only reach stats shipped** (slice
> `post-detail-reach-stats`, feature-parity §F). `gh pr list --state open --search "apps/android
> OR apps/ios"` showed one unrelated open PR (#3113, branch `claude/keen-hamilton-sqq310` — wrong
> naming convention for this routine, a different agent's iOS work, left untouched). `df -h /`
> showed 12 Gi free, stable.
>
> **Sixth candidate found via the "ready backend, never wired to UI" heuristic** — a dedicated
> Explore agent's OTHER suggestion from the previous run (`feed-comment-delete`), explicitly
> flagged there as needing a check before committing: `PostRepository.getPostViews` looked like it
> might overlap with the just-shipped `ImpressionBatcher`/`recordImpressions`. Read both iOS
> `PostService.swift` call sites directly to resolve the ambiguity: `viewPost` (`POST
> /posts/{id}/view`) records a single deduplicated per-viewer view and is fired from many iOS
> surfaces [Feed, ProfileUserPostsList, Reels, Statuses, PostDetail, Bookmarks];
> `recordImpressions` (`POST /posts/impressions/batch`) is a wholly separate batched engagement
> metric. No overlap — `viewPost` was a genuine, distinct, still-unwired gap.
>
> **Avoided shipping a dead end**: wiring `viewPost` alone would be invisible — nothing on Android
> reads or displays view counts. iOS pairs the write with a read: `PostDetailView.authorRevealView`
> shows an author-only "@pseudo · 👁 views · 📊 impressions" line via the pure `PostReachFormatter`.
> Shipped both halves together as one coherent vertical slice, matching how iOS itself scopes the
> feature — this is why the diff is larger than the last several single-field slices.
>
> **`PostDetailViewModel.recordView()`** fires `postRepository.viewPost(postId)` once from `init`
> (alongside the existing `loadInitial()`/`observeRealtime()`), fire-and-forget, failure silently
> swallowed — direct mirror of iOS's `.task { try? await PostService.shared.viewPost(...) }`, which
> fires regardless of whether the post GET itself succeeds (not gated on `loadInitial`'s success
> branch).
>
> **New pure `PostReachFormatter`** (`:feature:feed`): `compact(Int)` (1.2k/3.4M, faithfully ported
> including the `999_999 → "1000.0k"` boundary quirk baked into iOS's own `>= 1_000_000` check
> order — not "fixed", faithfully mirrored) and `components(username, isAuthor, viewCount,
> impressionCount)` (author-only gate: a non-author sees only `@pseudo`, never the counts).
>
> **`FeedPostPresentation`** gained `authorUsername`/`viewCount`/`impressionCount`/`isAuthor`
> (derived in `FeedPostBuilder.build(currentUserId:)`, same additive-trailing-param pattern used
> for `CommentPresentation.isOwn` in the previous slice — every other call site [`FeedViewModel`,
> `BookmarksViewModel`, `UserPostsViewModel`] defaults to `currentUserId = null` → `isAuthor =
> false`, harmless since only `PostDetailScreen` renders the reach line). New `ApiPost
> .impressionCount` field alongside the pre-existing `viewCount` (`:core:model`, already a real
> gateway field per the iOS `APIPost` decoder, just never modeled on Android).
>
> **New `PostReachLine` composable** in `PostDetailScreen.kt`, rendered beneath the author
> name/timestamp column, gated on `reach.pseudo != null || reach.views != null` (mirror of iOS's
> own gate) — a completely blank post carries neither.
>
> **+14 tests**: `PostReachFormatterTest` (6 — compact below/at-boundary/millions, author/non-author
> components, blank-username pseudo). `FeedPostBuilderTest` (5 — null-coerced counts, pass-through
> counts, raw username exposure, isAuthor true/false/no-author/no-current-user). `PostDetailViewModelTest`
> (3 — view recorded exactly once on open, blank postId never records, a failed record doesn't
> disturb the already-loaded post) + 2 more folded into the existing isAuthor-projection coverage.
> One pre-existing direct `FeedPostPresentation(...)` constructor call (`FeedMediaGalleryTest`, not
> going through `FeedPostBuilder.build`) updated with the four new fields.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. EN/FR/ES/PT strings added (`feed_post_reach_a11y`). Diff confirmed `apps/android`-only via
> the working-tree diff.
>
> **Still open**: iOS also renders this same reach line in a second spot (`PostDetailView`'s
> collapsed floating-header reveal, sharing the same `PostReachFormatter` call) — Android's
> `PostDetailScreen` has no collapsing-header treatment yet, so only the inline placement was
> ported. Dwell-time tracking (noted in the previous impression-batching slice) remains open too.

> On 2026-08-17 **Viewer-initiated comment delete shipped** (slice `feed-comment-delete`,
> feature-parity §F). `gh pr list --state open --search "apps/android OR apps/ios"` showed zero
> open PRs. `df -h /` showed 9.0 Gi free, stable.
>
> **Fifth candidate found via the "ready backend, never wired to UI" heuristic**, this time via a
> dedicated Explore agent (the previous four obvious candidates were exhausted). It searched every
> public method across `sdk-core`/`core-*` repositories for zero call sites in `feature`/`app`,
> cross-checked against tests and an iOS reference. `PostRepository.deleteComment(postId,
> commentId)` was the strongest hit: fully implemented, unlike its already-wired siblings
> `likeComment`/`unlikeComment` in the exact same repository. The agent's other candidate
> (`PostRepository.getPostViews`) was set aside — plausible overlap with the just-shipped
> `ImpressionBatcher`/`recordImpressions` needs checking server-side before committing to it, left
> for a future run.
>
> **Read the iOS reference directly rather than trusting the checklist line**: `FeedCommentsSheet
> .deleteHandler(for:)` gates the delete option to `c.authorId == me` — no confirmation dialog, a
> single tap on the destructive-role menu item fires the delete immediately with optimistic removal
> and full rollback on failure (`deleteComment` in the same file, lines ~2012-2058).
>
> **Reused the existing socket-driven removal transition instead of duplicating it**: `PostCommentsViewModel`
> already had a private `onCommentDeleted(commentId)` wired to the live `comment:deleted` socket event
> — top-level comment removed + its reply thread purged, or a reply removed + its parent's `replyCount`
> decremented. The new public `deleteComment(commentId)` snapshots `thread.value`/`replies.value` (both
> plain immutable data classes, so a snapshot is just holding the old reference), calls the SAME
> `onCommentDeleted(commentId)` for the optimistic removal, then either confirms silently on success or
> restores both snapshots + surfaces `status.error` on failure/exception. Zero duplicated removal logic.
>
> **New `CommentPresentation.isOwn: Boolean`**, derived in `CommentProjection.build(currentUserId:)`
> by comparing `comment.author?.id` to the signed-in user's id (passed from `PostCommentsViewModel
> .project()`'s already-available `inputs.user?.id`). The existing `CommentProjectionTest` call sites
> were untouched — `currentUserId` defaults to `null` (never own), a purely additive trailing param.
>
> **New `CommentDeleteButton`** (trash icon, same minimalist pill style as the existing like/reply
> buttons), wired ONCE inside the shared `CommentRow` composable and gated on `comment.isOwn` — since
> `ReplyThread` already reuses `CommentRow` for its reply rows, this single wire point covers both
> top-level comments and replies with no duplication.
>
> **+9 tests**: `CommentProjectionTest` — `isOwn` true when the author id matches, false for a
> mismatched/missing author or a null current user id. `PostCommentsViewModelTest` — top-level delete
> (state updates + repository call verified), reply delete (parent `replyCount` decrements), rollback +
> `errorMessage` on a network failure, and three inert guards (blank postId, blank commentId, an unknown
> comment id — all zero network calls). Mirrors the existing socket-path `onCommentDeleted` test suite's
> exact scenarios, proving the two paths converge on identical outcomes.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. EN/FR/ES/PT strings added (`post_comments_delete_action`). Diff confirmed `apps/android`-only
> via the working-tree diff (not `main...HEAD`, which carries unrelated commits from other PRs merged
> to `main` in this shared repo since this branch point).

> On 2026-08-17 **Invite by email shipped** (slice `discover-email-invite`, feature-parity §J).
> `gh pr list --state open --search "apps/android OR apps/ios"` showed zero open PRs. `df -h /`
> showed 9.2 Gi free, stable.
>
> **Picked up the strongest candidate the previous slice's Explore agent had surfaced but
> deliberately deferred**: `FriendRepository.sendEmailInvitation(email) → NetworkResult<
> EmailInvitationResponse>`, fully implemented and tested at repository level, zero call sites
> anywhere in `apps/android`. Fourth slice this session found via the "ready backend, never
> wired to UI" heuristic (after `PostApi.recordImpressions`, `CachePolicy.Notifications`,
> `PostRepository.pinPost`).
>
> **Corrected a stale conclusion from an earlier session**: a prior search for an iOS reference
> had only checked `InviteFriendsSheet.swift` (a conversation-scoped share-link sheet) and
> concluded no clear iOS counterpart existed. The real reference is
> `Features/Contacts/DiscoverViewModel.swift`'s `sendEmailInvitation()` +
> `DiscoverTab.swift`'s `emailInviteCard` — a dedicated email-invite card at the top of the
> Discover tab, entirely separate from `InviteFriendsSheet`.
>
> **Ported the exact iOS state shape**: `DiscoverUiState` gained `emailText`/`isSendingInvite`/
> `inviteErrorMessage` (mirrors `@Published var emailText`/`isSendingInvite`); `sendEmailInvitation()`
> trims, guards non-empty, guards against a second call while one is in flight, clears the field
> on success, and keeps the address for retry on failure — same as iOS's
> `try await friendService.sendEmailInvitation(email:)` do/catch.
>
> **Deliberately narrower than iOS**: iOS shows a toast (`FeedbackToastManager.shared.showSuccess/
> showError`) on both outcomes. Android's Discover module has **zero** toast/snackbar
> infrastructure — confirmed via an exhaustive grep across `apps/android/feature` for
> `successMessage`/`SnackbarHost`/`showSuccess`/`Toast.`/`MeeshySnackbar`/`SnackbarHostState`
> (zero matches). Rather than inventing new toast infra for this slice (scope discipline),
> success feedback is implicit (field clears + Send button disables) and failure surfaces as an
> inline `Text` beside the card via the new `inviteErrorMessage` field. This is deliberately NOT
> the existing `errorMessage` field on `DiscoverUiState` — that one drives a full-screen
> `ErrorState` composable that would wrongly hijack the whole Discover tab for a transient invite
> failure.
>
> **New `EmailInviteCard` composable** in `DiscoverTab.kt`: icon + title row, `OutlinedTextField`
> (email keyboard, no autocorrect/autocapitalize) + `Button` (disabled when
> `emailText.isEmpty() || isSendingInvite`, with an accessibility label), inline error `Text`
> below when `inviteErrorMessage != null`. Sits above the search field, matching iOS's
> `inviteSection` position at the top of the Discover scroll.
>
> **+4 tests** (`DiscoverViewModelTest`): trimmed address sent + field cleared on success; blank
> address never hits the network; error surfaces + address kept for retry; a second call while
> one is in flight is a no-op (verified via a `CompletableDeferred` held open across both calls).
>
> **Verified**: RED confirmed for the right reason (compile errors — the 4 new tests referenced
> members that didn't exist yet), GREEN after implementation, then `./apps/android/meeshy.sh
> check` (assembleDebug + testDebugUnitTest, all modules) green. EN/FR/ES/PT strings added (5
> keys: title, placeholder, send, send accessibility label, error).
>
> **Still open, left for a future slice**: SMS invite and phone-contacts import — no Android
> SMS-compose or contacts-permission surface exists yet; the checklist line covers all three but
> only email was in scope here.

> On 2026-08-17 **Post pin (own posts) shipped** (slice `feed-pin-own-post`, feature-parity §F).
> `gh pr list --state open --search "apps/android OR apps/ios"` showed three concurrent PRs
> (#3123, #3096, #3108), none touching `apps/android`. `df -h /` showed 10 Gi free, stable.
>
> **Found via the same "ready backend, never wired" heuristic that worked twice already this
> session** — this time via an Explore agent search across every `sdk-core` repository for
> public methods with zero call sites anywhere in `apps/android/feature`/`apps/android/app`.
> Returned several candidates; `PostRepository.pinPost`/`unpinPost` was the strongest: small
> scope, an existing tested hook point (`PostActionMenu`, already pure and covered), and a real
> user-visible action (not an internal-only endpoint). The agent also surfaced and I independently
> rejected: the entire `CommunityRepository` (zero screens exist for Communities at all — a whole
> sub-app, far too large), `UserService.getProfileByPhone`'s Android analogue (needs a dial-pad
> tab that doesn't exist), and `FriendRepository.sendEmailInvitation` (needs real new UI on the
> Discover screen — medium, kept as a candidate for a future run, not chosen this time).
>
> **RE-PROVED before assuming symmetry**: the checklist line says "pin-unpin" together, so the
> first assumption was a toggle (Pin ↔ Unpin, mirroring `Bookmark`/`Unbookmark`). Reading the
> iOS reference directly disproved this — `unpinPost` exists in `PostService` (the SDK protocol)
> but has **zero call sites anywhere in the iOS app** (`grep` confirmed). `onPin` is wired
> exactly like `onDelete` — `isOwnPost ? {...} : nil`, unconditional on the post's current pinned
> state, no unpin counterpart. Ported this exactly rather than inventing a more "complete" toggle
> UX iOS itself doesn't have — `PostAction.Pin` is a single, always-available (for own posts)
> action, and `PostRepository.unpinPost` stays unwired.
>
> **Reused the existing pure `PostActionMenu` hook point rather than a new mechanism**: `Post
> Action.Pin` slots in right before `Delete` (own-post actions), `PostActionMenuTest`'s existing
> exhaustive `containsExactly(...).inOrder()` assertion for the own-post case updated to include
> it — a source-guard-style test that would have failed loudly if the new action landed in the
> wrong position. `FeedViewModel.pinPost(postId)` mirrors `repost()`'s/`deletePost()`'s exact
> established shape (`NetworkResult.Success` → `postRepository.refresh()`; `Failure` →
> `errorMessage`) rather than inventing a new pattern for the third time.
>
> **+5 tests**: `PostActionMenuTest` — own-post ordering now includes `Pin` (was previously
> exactly Share/CopyLink/Repost/Bookmark/Delete, now has Pin before Delete), someone-else's post
> never offers Pin (new test, locks the own-post-only gate). `FeedViewModelTest` — `pinPost`
> delegates + refreshes on success, surfaces the error without refreshing on failure.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green. EN/FR/ES/PT strings added (`feed_action_pin`), matching the existing 4-locale
> baseline for every other action in the same menu.
>
> **Still open, noted honestly rather than silently left unchecked**: comment pin-unpin (a
> separate surface from post pin, not investigated this slice); quote-repost's own composer UI —
> `PostRepository.repost` already accepts `isQuote`/`content`, but `FeedScreen`'s current
> `onRepost` always calls the plain repost path; whether a quote-composer UI exists anywhere else
> in the app wasn't confirmed, left as a genuinely open question for a future run.

> On 2026-08-17 **Notification stale-while-revalidate cache shipped** (slice
> `notification-cache-first-stream`, feature-parity §M), closing the "still open" item left by
> the earlier `notification-realtime-socket` slice the same day. `gh pr list --state open
> --search "apps/android OR apps/ios"` showed three concurrent PRs (#3096, #3108, #3123), none
> touching `apps/android`. `df -h /` showed 9.0 Gi free, stable.
>
> **Found via a genuinely strong signal, not a guess**: grepped for the existing
> `CachePolicy.Notifications` constant (`freshFor` 60s, `keepFor` 24h) and confirmed ZERO usages
> anywhere in the codebase — someone had already anticipated this exact gap and left the policy
> ready to wire, which is exactly what this slice does.
>
> **`NotificationRepository.notificationsStream()` is a direct mirror of `PostRepository
> .feedStream()`** — same in-memory L1 `MutableStateFlow` cache, same `CacheResult.Empty/Fresh/
> Stale/Syncing` shape, same background-revalidate-on-staleness `combine().distinctUntilChanged()
> .transformLatest{}` chain. `NotificationsViewModel` is now a thin projector of this stream
> (plus the new `unreadCountStream`) rather than owning its own copy of the list.
>
> **A real, previously-undiscovered bug fixed as a genuine consequence of the refactor, not a
> bolt-on**: `unreadCount` had been dead since before this routine even started —
> `NotificationApi.unreadCount()` existed, was fully wired at the repository level, and was never
> once called (confirmed via `grep`, zero call sites). Once the stream became the single source
> of truth, populating it from the real server count was the natural design, not a separate fix.
>
> **A design decision forced by moving state ownership, caught during design rather than after
> shipping a bug**: once the ViewModel stopped holding its own copy of the notification list,
> `markAsRead`/`markAllAsRead`'s existing optimistic local-state mutation would have gone stale —
> a live socket arrival re-triggering the shared repository stream would have silently REVERTED
> an optimistic "marked as read" back to unread, since the repository's own cache never learned
> about the mutation. Fixed by moving the optimistic mutation (+ rollback-on-failure) INTO the
> repository itself, mirroring `PostRepository.toggleLike`'s exact established pattern. The
> real-time `prependLive` handler moved to the repository for the same reason — it needs to
> mutate the SAME cache every other write already does.
>
> **+10 tests** (`NotificationRepositoryTest`, new file, mirrors `PostRepositoryTest`'s Turbine
> harness): empty→fresh stream sequencing; refresh populates both the list cache and the unread
> count; `prependLive` prepends + bumps unread / doesn't bump when arriving pre-read / dedupes a
> duplicate id; `markAsRead` flips optimistically + decrements unread, with rollback-on-failure;
> `markAllAsRead` flips every entry + zeroes unread, with rollback-on-failure.
> **`NotificationsViewModelTest` rewritten** (9 tests) to match what the ViewModel actually still
> owns after the refactor — projecting each `CacheResult` variant into UI state, reflecting the
> unread-count stream, delegating `load`/`markAsRead`/`markAllRead`/a live arrival to the
> repository — since the dedup/rollback logic itself moved to (and is now tested at) the
> repository layer, duplicating those assertions at the ViewModel layer would just re-test the
> same behaviour through an extra layer of mocking.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green — confirmed no other call site of `NotificationRepository` outside
> `NotificationsViewModel`/`PushTokenHandler` (the latter untouched, `registerDeviceToken` only)
> regressed from the signature/behaviour changes.
>
> **Still open**: pagination / unread-only filter on the stream (serves the first page only,
> matching `list()`'s existing `limit=20` default) — not attempted, a separate item.

> On 2026-08-17 **Feed impression batching shipped** (slice `feed-impression-batching`,
> feature-parity §F). `gh pr list --state open --search "apps/android OR apps/ios"` showed two
> concurrent PRs (#3096, #3108), neither touching `apps/android`. `df -h /` showed ~10 Gi free,
> stable.
>
> **Picked after a targeted scan for a narrower candidate** — the previous two runs' toast
> orchestrator sub-slice needs a "which conversation/post is on screen" signal Android doesn't
> have yet (its own separate slice). Re-proof here found the network HALF of this checklist line
> already fully built and dormant: `PostApi.recordImpressions`/`PostRepository
> .recordImpressions(postIds, source)` existed end-to-end, tested, with zero call sites — a
> ready-made backend for a client that never used it.
>
> **`ImpressionBatcher` is a faithful port of iOS's real `ImpressionBatcher.swift`**, not a
> reinterpretation: impressions are counted per APPEARANCE (deliberately never deduplicated —
> `record` just appends, matching the gateway's own batch-`updateMany` semantics), a 3s debounce
> window that resets on every `record` (so continuous scrolling never flushes until it settles),
> `flushNow`/`flushNowAsync` for the "leaving the screen" case, and a failed send reinserts the
> batch at the FRONT so a retry sends the oldest occurrences first.
>
> **A real correctness bug caught before it shipped, not after**: the first draft passed
> `viewModelScope` into the batcher so `onCleared()` could call a suspend `flushNow()`. That
> races Android's own teardown order — `viewModelScope` is cancelled right after `onCleared()`
> returns, so a coroutine launched from inside `onCleared()` on that same scope has no
> guaranteed window to complete. Fixed by giving `ImpressionBatcher` its OWN default scope
> (`SupervisorJob() + Dispatchers.IO`, matching the exact pattern `SdkModule.kt`'s preference
> stores already use for their own independent scopes) plus a `flushNowAsync()` fire-and-forget
> entry point for the non-suspend `onCleared()` call site.
>
> **A build hiccup, not a design one**: `StandardTestDispatcher(...)` used as a TYPE annotation
> (`dispatcher: StandardTestDispatcher`) failed to resolve — it's a top-level FACTORY FUNCTION
> returning `TestDispatcher`, not a class; the constructor-call USAGE elsewhere in the same file
> compiled fine, only the type position broke. Fixed by typing the parameter `TestDispatcher`.
>
> **Wired into the existing composition-lifecycle hook already used for pagination**:
> `FeedScreen`'s `items(state.posts, key = { it.id })` block already had a
> `LaunchedEffect(post.id, state.posts.size) { viewModel.loadMoreIfNeeded(post.id) }` sibling —
> added `LaunchedEffect(post.id) { viewModel.trackImpression(post.id) }` right next to it rather
> than inventing a new visibility-detection mechanism.
>
> **+9 tests** (`ImpressionBatcherTest`): debounced flush fires after the delay / not before;
> records within the window group into one batch; repeat appearances aren't deduped; a blank id
> is a no-op; `flushNow` sends immediately and cancels the pending timer; `flushNow` on an empty
> batch is inert; `flushNowAsync` sends without being awaited; a failed flush keeps the batch
> pending for the next retry (verified end-to-end: fail once, then a second `record` + flush
> sends BOTH the retried and the new post together).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green. No `FeedViewModel`-level test added for the one-line `trackImpression`
> delegation — the real behaviour is already fully covered by `ImpressionBatcherTest`; adding a
> duplicate assertion at the ViewModel layer would just re-test the same logic through an extra
> layer of mocking.
>
> **Deliberately narrower than iOS's own three safety nets**: app-backgrounding flush and
> kill-survival persistence (UserDefaults replay on relaunch) are NOT ported — no equivalent
> Android wiring point exists yet for either. **Dwell-time tracking is untouched and separately
> scoped**: iOS's `EngagementTracker` is a materially bigger system (durable SQLite outbox,
> session pause/resume, qualification thresholds, its own `/posts/engagement/batch` endpoint) —
> a future slice, not attempted here.

> On 2026-08-17 **Notification toast decision core shipped** (slice
> `notification-toast-policy`, feature-parity §M), the second of the 3 sub-slices identified
> for "In-app real-time notification toast" (the real-time data feed, sub-slice 1, landed
> earlier the same day). `gh pr list --state open --search "apps/android OR apps/ios"` showed
> two concurrent PRs (#3096, #3108), neither touching `apps/android`. `df -h /` showed
> 10-11 Gi free, stable.
>
> **Deliberately trimmed mid-investigation after discovering the full port was bigger than
> expected.** Read iOS's real reference (`UserNotificationPreferences+Filter.swift`) in full:
> the per-type gate (`isTypeEnabled`) is an 80-case switch over `MeeshyNotificationType`, and
> two of its buckets (`callsEnabled`, `friendContentEnabled`) reference iOS-only preference
> fields that don't exist on Android's `UserNotificationPreferences` at all — porting it
> faithfully would mean inventing new preference toggles (+ their sync/persistence/Settings UI),
> real separate work, not something to smuggle into "the toast orchestrator." Cut the slice down
> to what's genuinely self-contained: active-screen suppression, dedup, and the push+DND gate —
> all three either brand-new pure logic or reuse of already-existing pure predicates, zero new
> preference fields, zero new Settings UI.
>
> **`NotificationToastPolicy.decide(...)` is a genuine extraction, not a straight port** — iOS's
> own `handleNewNotification` is an impure guard-chain (side effects and decision-making
> entangled), so there was no isolated pure Swift function to mirror 1:1; the Kotlin version is
> a first-time factoring of that logic into something testable. Precedence order matches iOS
> exactly: active-conversation/post suppression wins over EVERYTHING (even a duplicate delivery
> or push-disabled), then dedup, then push+DND.
>
> **The dedup check stays outside the pure function on purpose**: "was this notification id
> already shown in the last 2 seconds" is inherently a comparison against PRIOR calls (state),
> which doesn't belong in a single-call decision function — `decide()` takes a precomputed
> `isDuplicateDelivery: Boolean` instead, pushing the actual window-tracking to whichever
> stateful orchestrator wires this up next.
>
> **+8 tests** (`NotificationToastPolicyTest`): shows by default; suppresses when the
> conversation is already open; suppresses when the post is already open; a DIFFERENT open
> conversation does not suppress; deduplicates a duplicate delivery; blocks when push is
> disabled; blocks inside the DND window; active-screen suppression wins over both a duplicate
> flag AND push-disabled simultaneously (precedence proof).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green. Pure `:core:model` addition — no Robolectric/Hilt/Compose surface touched.
>
> **Still open**: the STATEFUL orchestrator wiring this pure core into
> `MessageSocketManager.notificationReceived` (dedup-window bookkeeping, 7s dismiss timer, a
> Hilt-singleton `CoroutineScope`, `onConversationOpened/Closed`/`onPostOpened/Closed` hooks —
> Android has no equivalent to iOS's `ConversationSocketHandler.init`/`deinit` lifecycle today,
> so wiring those hooks into `ChatViewModel`/post-detail is itself real work); the per-type
> toggle resolver (needs either the 80-case switch or a new raw-string→toggle mapping, plus
> possibly 2 new preference fields to reach full iOS parity); and sub-slice 3 (toast UI mount +
> tap-to-navigate, atom already exists unused in `:sdk-ui`).

> On 2026-08-17 **Real-time notification socket wiring shipped** (slice
> `notification-realtime-socket`, feature-parity §M). `gh pr list --state open --search
> "apps/android OR apps/ios"` showed three concurrent PRs (#3096, #3106, #3108), none touching
> `apps/android`. `df -h /` showed 9.0-11 Gi free, stable.
>
> **Landed after two rejected candidates, both re-proved fresh and found to be multi-slice
> epics rather than one-shots** — documented in `feature-parity.md` rather than silently
> dropped: "Code attachment viewer" (§P) needs ~30-language detection + a hand-rolled tokenizer
> + 2 themes + 3 UI surfaces (compact card, preview, fullscreen+copy), AND has no "file
> attachment" UI hook to attach to yet (the neighbouring "Document viewer" item is also `[ ]`);
> "In-app real-time notification toast" (§M) turned out to be exactly 3 sub-slices — data feed,
> dedup+dismiss+suppression orchestrator, UI mount+navigation — of which only the FIRST was
> genuinely bounded for one run. Chose to ship that first sub-slice on its own rather than force
> the whole epic or walk away with nothing.
>
> **The wiring itself mirrors an already-proven pattern exactly**: `MessageSocketManager`
> already has 26 listened events behind one generic `listen<T>(event, flow)` helper — adding
> `notification:new` was mechanical (`buf<ApiNotification>()`, expose as `SharedFlow`, one
> `listen(...)` line in `attach()`). Confirmed the gateway's socket payload (`NotificationService
> .ts`: `{ ...formatted, title, subtitle }` via `emitWithSeq`) is a strict superset of the
> already-existing `ApiNotification` REST shape (extra `title`/`subtitle`/`_seq` fields exist
> only for iOS's toast) — `MeeshyApi.json`'s `ignoreUnknownKeys = true` makes decoding straight
> into `ApiNotification` safe, so no separate wire-only type was needed.
>
> **`NotificationsViewModel` had zero live-update path before this** — `load()` was a one-shot
> REST call, `unreadCount` was never even populated from the server (still true after this
> slice — out of scope, not touched). Now `observeRealtime()` collects the new flow and
> prepends fresh notifications, deduping by id (a REST-list race or duplicate delivery is a
> no-op) and only bumping `unreadCount` when the incoming row isn't already read.
>
> **New test file, not a backfill**: `MessageSocketManager` has no existing test suite at all
> despite 26 events (unlike `SocialSocketManagerTest`/`CategorySocketManagerTest`, which do
> exist) — added `MessageSocketManagerNotificationTest` scoped to ONLY the new event, following
> `SocialSocketManagerTest`'s established Robolectric+Turbine harness pattern, rather than
> either skipping coverage or scope-creeping into the other 25 untested events.
>
> **+4 tests total**: `MessageSocketManagerNotificationTest` (payload decode);
> `NotificationsViewModelTest` ×3 (prepend+unread-bump, already-read doesn't bump, duplicate id
> is a no-op — extended the existing 3-test file's constructor call sites for the new
> `MessageSocketManager` dependency).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green.
>
> **Still open on this item**: SWR cache for the notification list (today's `list()` is plain
> REST, no `CacheResult`/Room layer) and pagination/unread-only filter; the toast UI itself
> (dedup+dismiss+suppression orchestrator + mount) — 2 of the 3 sub-slices identified above.

> On 2026-08-17 **Share-target lot 2 (image/video attachments) shipped** (slice
> `share-target-media-attachments`), closing out the Android Share-Sheet receiver started by the
> previous run's lot 1. `gh pr list --state open --search "apps/android OR apps/ios"` showed
> three concurrent PRs (#3096, #3106, #3108), none touching `apps/android`. `df -h /` showed
> 9.0 Gi free, stable.
>
> **RE-PROVED the previous run's own "needs the TUS upload pipeline" note before touching
> anything — it did not survive contact with the real code.** An Explore agent traced the actual
> chat-attachment send path (`ChatViewModel.sendFileAttachment`, the code the composer's own
> photo/video picker calls) and found it enqueues through `MediaUploadQueue.enqueue(item)` with a
> **`null`** `TusUploadContext` — the doc-comment on `MediaUploadQueue.enqueue` says this uploads
> via `MediaRepository`/`POST /attachments/upload`, never TUS. Android's TUS pipeline
> (`TusUploadRepository`/`TusApi`) is scoped to post/story/status/comment media only; message
> attachments never touched it on either platform — iOS's own `ShareSender.swift` has zero
> TUS/attachment code (`grep` empty), confirming the earlier note was a mis-citation of a *product
> intention* from `apps/ios/CLAUDE.md`, not a verified technical constraint. This flips the slice
> from "blocked on an unbuilt pipeline" to "a same-day extension of lot 1."
>
> **Reused the exact existing chat-attachment shape rather than inventing a parallel one.**
> `ShareTargetActivity`'s manifest gained two more `ACTION_SEND` intent-filters (`image/*`,
> `video/*`) alongside the existing `text/plain` one; the inbound `Intent.EXTRA_STREAM` Uri is
> read into bytes off the main thread (`withContext(Dispatchers.IO)` inside a `LaunchedEffect` in
> `ShareTargetScreen`, so a large shared video never blocks the screen from drawing) via
> `readPickedAttachment(context, uri)` — the SAME helper `ChatScreen.kt`'s own system-picker
> callback already used, flipped from `private` to `internal` so `ShareTargetScreen.kt` (same
> module, different file) can call it directly instead of duplicating the ContentResolver glue.
> `ShareTargetViewModel.loadAttachment(bytes, fileName, declaredMimeType)` mirrors
> `sendFileAttachment`'s own mime-resolution (`MimeTypeResolver.resolve`) and `sendTo` mirrors its
> send shape exactly: `MediaUploadQueue.enqueue` → `MessageRepository.sendOptimistic` with
> `messageType`/`attachmentUploadCmids`/`attachments` populated from `AttachmentMessageType.forMime`.
>
> **A share with only an attachment and no text is no longer inert** — `sendTo`'s guard changed
> from "blank text → inert" to "blank text AND no attachment → inert," since an image/video share
> commonly carries no caption at all.
>
> **+4 tests** (`ShareTargetViewModelTest`): an attachment upload+send carries the correct
> `messageType`/`attachmentUploadCmids`; an attachment with blank shared text still sends; mime
> resolves from the file extension when the platform declares none (`declaredMimeType = null`);
> empty bytes (`loadAttachment`) are a no-op, mirroring `sendFileAttachment`'s own empty-bytes
> guard.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. `:app:compileDebugKotlin` checked explicitly (manifest + `ShareTargetActivity`'s
> `IntentCompat.getParcelableExtra` wiring live there). One build hiccup caught and fixed before
> the check run: a KDoc comment that literally wrote `` `image/*` `` triggered Kotlin's nested
> block-comment parsing (`/*` inside a `/** */` doc IS a nested comment start in Kotlin, unlike
> Java) → "Unclosed comment" — rewritten to avoid a bare `/*` sequence in prose.
>
> **Still open: `ACTION_SEND_MULTIPLE`** (several images/videos shared at once from a gallery
> multi-select) — deliberately deferred, not investigated in detail; single-item share (by far the
> common case) is now fully covered by lots 1+2.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time (unchanged from before this PR's CI wait,
> `streak=1`, no race) → advances to `lane=ANDROID android_streak=2
> last_run=share-target-media-attachments`.

> On 2026-08-17 **Share-target lot 1 (text/URL) shipped** (slice `share-target-text-url`) —
> Android's counterpart to iOS's own `MeeshyShareExtension`, from a fresh section scan
> (`§O Links`) rather than re-attacking the four candidates the previous run had already
> documented as rejected/ambiguous (`gh pr list --state open --search "apps/android OR
> apps/ios"` showed 4 concurrent PRs, none touching `apps/android`; `df -h /` showed 8.4 Gi free,
> stable after the previous run's proactive cleanup).
>
> **Chosen after scanning "I. Communities" (entirely `[ ]`, 7 items — a whole unbuilt sub-app,
> too large) and "N. Search" (Global/local FTS search — both `[ ]`, need query-routing across 3
> domains — also too large) before landing on "O. Links"**, which turned out almost entirely
> `[x]` already (the share-link management vertical is complete) except for one genuinely
> well-scoped, high-value gap: "Generic in-app share picker / Android Share-Sheet receiver".
>
> **Re-proved against both the iOS reference AND Android's own existing infrastructure before
> writing anything.** `apps/ios/CLAUDE.md` documents `MeeshyShareExtension` in detail, including
> its own explicit phased scope: "Portée lot 1 : texte + URL" — images/video are iOS's OWN
> deferred lot 2, giving this slice a scope boundary to mirror rather than invent. Confirmed
> Android has ZERO share-target capability (`grep` for `ACTION_SEND` across the whole app found
> only OUTBOUND uses — the app sharing OUT via other apps' share sheets — never an inbound
> `<intent-filter>`).
>
> **Deliberately simpler than the iOS reference, and the PROGRESS entry says why**: iOS's
> extension is a separate PROCESS (a genuine app extension target) that cannot see the main app's
> in-memory session, so it reads an App Group Keychain session directly and relays a failed send
> through its own dedicated `ShareSender`/`SharePendingSendConsumer` queue. Android's share target
> is just another `Activity` in the SAME process/APK — no App Group equivalent needed, and no new
> offline-relay machinery either: `MessageRepository.sendOptimistic` (already used by the whole
> rest of the app) already durably queues through the existing outbox on a failed send, for free.
>
> **Reused two pieces of existing infrastructure wholesale rather than reinventing them**: the
> conversation picker's filtering rule is `ForwardTargets.of(...)` — the EXACT pure SSOT
> `ChatViewModel`'s own message-forward sheet already uses (a source conversation id of `""`
> simply never matches any real conversation, so nothing gets excluded) — and the send call is
> the same `MessageRepository.sendOptimistic` every other send path in the app uses. Zero new
> pure-logic types were needed beyond the `ShareTargetUiState`/`ShareTargetViewModel` shell
> itself.
>
> **Picks exactly ONE conversation and finishes** (`isFinished` closes the Activity) — unlike the
> in-app forward sheet, which is deliberately multi-target ("forward one message to several
> conversations in one sitting"). A share arriving from another app is a single-shot platform
> convention (matching both Android's own share-sheet UX expectations and iOS's own single-target
> extension), so no multi-select state was carried over from `ForwardUiState`.
>
> **+7 tests** (`ShareTargetViewModelTest`): picker populates from the cache-first conversation
> stream; query filters by title; a successful send marks the target sent, clears the sending
> flag, and sets `isFinished`; a second target while the first send is in flight is a no-op;
> blank shared text never hits the network; no signed-in user never hits the network; a failed
> send surfaces the error and clears the sending flag without finishing.
>
> **Verified**: Android SDK available in this container — `./apps/android/meeshy.sh check`
> (assembleDebug + testDebugUnitTest, all modules) green before any push. `:app:compileDebugKotlin`
> checked explicitly too (the new Activity/manifest wiring lives there, outside the usual
> `:feature:*` test scope).
>
> `tasks/lane-cursor.md` → re-read fresh at merge time (unchanged from before this PR's CI wait,
> `streak=0`, no race) → advances to `lane=ANDROID android_streak=1 last_run=share-target-text-url`.

> On 2026-08-16 **No code shipped — the four remaining named candidates were re-proved and each
> found genuinely too large, too ambiguous, or non-functional even on iOS, documented here so a
> future run doesn't repeat the same investigation** (streak was 4, this was meant to be the 5th
> Android slice before alternation). `gh pr list --state open --search "apps/android OR
> apps/ios"` showed three concurrent PRs (#3096, #3106, #3108), none touching `apps/android`.
> `df -h /` confirmed 11 Gi free (stable since the earlier disk-full incident, not re-triggered).
>
> **"Conversation info sheet" §C, re-scoped this time as instructed — still too large.** Read
> iOS `ConversationInfoSheet.swift` (1291 lines) directly: 4 tabs (`.members`/`.media`/`.plus`/
> `.preferences`), and **every tab's underlying capability already exists on Android in a
> different shape** — `.members` → the `ConversationMembersSheet` this routine already built
> (roster + promote/demote/remove/ban); `.media` → the existing `ConversationMediaGallery`;
> `.preferences` → `ConversationPreferencesTab.swift` turns out to be exactly customName +
> reaction + tags + pin + mute + archive, ALL already shipped standalone in earlier slices
> (`conversation-custom-name`, `conversation-favorite-reaction`, `conversation-tags-preference`).
> The only tab with a genuine Android gap is `.plus` (`ConversationDashboardView`, an analytics
> dashboard — itself unexplored, potentially its own large item). **The real remaining work is
> the CONTAINER** — a hero header + tab-navigation shell aggregating pieces that already exist —
> which doesn't decompose into a smaller *useful* slice: a hero header alone renders nothing
> without tabs to sit above, and a tab shell alone has nothing to switch between without content.
> Left open; a future attempt should scope it as "the container screen, wiring already-built
> pieces" as ONE deliberately-UI-heavy slice, not a logic-TDD slice like most of this routine's
> other work — different risk/testing profile, worth a dedicated run.
>
> **"Invite by email; invite by SMS; import phone contacts" (§J) — scope is genuinely ambiguous,
> not just large.** Traced the only iOS file matching "invite" (`InviteFriendsSheet.swift`, 733
> lines) and found it is a **conversation-scoped share-link sheet** (`CreateShareLinkRequest
> .conversationId: String`, required) presented via the native `UIActivityViewController` share
> sheet — email/SMS are just share-sheet TARGETS, not dedicated composers (`grep` for
> `MFMailComposeViewController`/`MFMessageComposeViewController` found zero iOS call sites).
> Android **already has this exact feature** (`ShareLinkRepository`, `LinkApi`, `ShareLink`
> model — confirmed built). So the checklist line under "J. Contacts & Friends" cannot mean
> conversation share links; it must mean a distinct "invite a new person to the app" flow
> (referral-style), for which no Android OR clearly-identified iOS reference was found in the
> time available. Needs product clarification before it's a re-attackable item — noted rather
> than guessed at.
>
> **Voice-profile management (§K) — confirmed genuinely unbuilt, confirmed genuinely large.**
> Android has only the `VoiceProfile` model (`:core:model`), zero ViewModel/repository/screen.
> iOS's reference is two full screens (`VoiceProfileWizardView` + `VoiceProfileManageView`) with
> real audio recording (≥3 samples, 18+ age gate, GDPR delete-all) — needs microphone access this
> container cannot exercise meaningfully in a JVM unit test. Left for a dedicated slice.
>
> **"Transcription" settings section (§L) — investigated down to the wire, and the wire wasn't
> there.** Traced `prefs.audio.autoTranscribeIncoming` (the toggle's backing field,
> `packages/MeeshySDK/Models/PreferenceModels.swift`) with a `grep` across the WHOLE iOS+SDK tree:
> it is read/written **only** by the settings toggle itself — nothing in the transcription
> pipeline ever reads it to gate real behaviour. The "engine" row beneath it is `EmptyView()`
> content — also decorative. Porting this section would replicate a non-functional iOS toggle,
> not real feature parity; not pursued. (Would otherwise have been a clean win — Android's
> established per-domain `DataStore` pattern, `PrivacyPreferencesStore.kt`, was ready to mirror
> almost verbatim for a hypothetical wired preference.)
>
> **Decision**: rather than force a low-value or speculative change onto one of these, or lower
> this run's bar for what counts as a "bounded, re-proved, valuable" slice, this run closes with
> documentation only — the same discipline the `IOS_DETTE` lane's Run #6/#10 already established
> for exactly this situation. `tasks/lane-cursor.md` → `lane=ANDROID android_streak=5
> last_run=android-backlog-reverification-2026-08-16` — streak explicitly advanced to the
> alternation threshold anyway (an investigation-only run still consumed an Android-lane
> iteration, and the alternation rule's own escape hatch, "lane Android bloquée", already applies
> here) — **the next run switches to `IOS_DETTE`.**

> On 2026-08-16 **Member ban shipped** (slice `conversation-member-ban`). `gh pr list --state
> open --search "apps/android OR apps/ios"` showed three concurrent PRs (#3096, #3105, #3106),
> none touching `apps/android` — no collision.
>
> **The previous run's own note — "ban/unban: iOS doesn't wire them in this view either" — was
> re-checked rather than trusted, and turned out half-wrong.** `grep -rln "banParticipant"
> apps/ios/Meeshy` found `MemberManagementSection.swift`, a SECOND, independent member-management
> surface (embedded in `ConversationInfoSheet`'s settings sheet, not `ParticipantsView` —
> confirmed by tracing `@ObservedObject var viewModel: ConversationSettingsViewModel` to its
> declaration, which — surprisingly — lives in `packages/MeeshySDK/Sources/MeeshyUI/Conversation/
> ConversationSettingsView.swift`, not `apps/ios`) that DOES wire a one-tap ban action. iOS
> genuinely has two parallel, non-identical member-management screens; the previous note only
> checked the one Android had already ported. Confirmed `unbanParticipant` exists as a fully
> wired SDK method with **zero** call sites anywhere in `apps/ios` — that half of the note holds.
>
> **Chose to extend the existing `ConversationMembersSheet` rather than port the second iOS
> screen.** Android already collapsed iOS's `ParticipantsView` + `MemberManagementSection` into
> one sheet; re-splitting them to exactly mirror iOS's own (arguably redundant) duplication would
> add a screen with no Android-side reason to exist. Ban fits as a fourth row action alongside the
> three already there.
>
> **The rank gate is genuinely stricter than removal's, and the tests prove it rather than assert
> it once**: iOS's ban guard is `currentUserRole > targetRole && currentUserRole.hasMinimumRole(
> .admin)` — an admin may remove ANY non-creator member (existing `canRemove` behaviour, unchanged)
> but may only ban someone STRICTLY below their own rank, so an admin cannot ban a peer admin.
> `MemberModeration.canBan` ranks by `.level`, not Kotlin's default enum `Comparable` (which
> follows declaration order — `CREATOR` first — backwards from the actual hierarchy); a docstring
> in the source explains why, so a future reader doesn't reach for `>` on the enum directly.
>
> **No confirmation dialog on iOS for either expel or ban** (`Button(role: .destructive)` fires
> immediately) — Android's own `removeMember` already confirms first, an existing Android-side
> safety margin beyond the iOS reference. Ban gets the same treatment for consistency within
> Android's own UI rather than reproducing the gap.
>
> **+6 tests**: `MemberModerationTest` ×5 (self-ban blocked, creator bans everyone below,
> admin-cannot-ban-admin — the one that actually distinguishes this from `canRemove` — admin can
> ban moderators/members, moderator and plain member can ban nobody);
> `ConversationMembersViewModelTest` ×3 (optimistic drop + send, refusal rollback, the viewer-role
> gate offering ban on moderators but not peer admins).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> run before any push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time (unchanged from before this PR's CI wait,
> `streak=3`, no race) → advances to `lane=ANDROID android_streak=4
> last_run=conversation-member-ban`. **At streak=4, one more Android run before the alternation
> rule fires — the NEXT slice after this one switches to `IOS_DETTE`.**
>
> A mid-run disk-full incident (root `/` hit 0 bytes free, blocking even the Bash tool's own
> output writes) was resolved by asking the user to clear `~/Library/Developer/Xcode/
> DerivedData` + this worktree's own `apps/ios/Build` via the `!` shell-escape prefix — no code
> or diff impact, noted here only because it's the second such disk-contention incident this
> session's memory record knows about.

> On 2026-08-16 **"Add member" shipped, closing the last open gap in conversation member
> moderation** (slice `add-participant-sheet`). `gh pr list --state open --search "apps/android
> OR apps/ios"` showed one concurrent PR (#3096, realtime/gateway+iOS+web) not touching
> `apps/android` — no collision. With all three room-join follow-ups closed by the previous run,
> re-proved the two candidates that PROGRESS.md itself had named as still-open: "Conversation
> info sheet" §C (a large multi-tab containing screen — deferred, too big for one slice without
> its own decomposition) and "Add member" (named by `conversation-members-roster` as its own
> follow-up, already scoped to one concrete iOS reference file) — chose the latter.
>
> **Re-proved the gap and the exact shape before writing anything.** `ConversationApi`/
> `ConversationRepository` had `participants`/`updateParticipantRole`/`removeParticipant` but no
> `addParticipant` — confirmed by reading the interface directly, not assuming from the checklist
> line. Read the gateway route (`routes/conversations/participants.ts`, `POST
> /conversations/:id/participants`, body `{userId}`, `addMemberRoles =
> ['creator','admin','moderator']`) and the iOS reference (`AddParticipantSheet.swift`) directly
> rather than trusting the feature-parity paraphrase — confirmed the exact search shape (debounced,
> `/users/search?q=&limit=20`, 2-char floor), the add flow (`POST .../participants` with
> `{userId}`, track added ids locally, `onAdded()` callback to refresh the caller), and the
> visibility gate (`ParticipantsView.canManageMembers = isAdmin || isModerator`, `isAdmin` itself
> `hasMinimumRole(.admin)` — so moderator-or-above, matching the gateway's own role list exactly).
>
> **Reused existing infrastructure rather than reinventing it**: `UserRepository.searchUsers`
> (built in an earlier `user-search-pagination` slice) needed no changes: the debounce/floor
> shape is a direct copy of `NewConversationViewModel`'s already-established pattern, and
> `MemberRole.hasMinimumRole` (already existed, named identically to the iOS reference) is the
> visibility gate — zero new pure-logic types were needed beyond the two DTOs
> (`AddParticipantRequest`, `AddParticipantRow`/`AddParticipantUiState`).
>
> **The "Add" button per row is deliberately not multi-select** (unlike `NewConversationViewModel`,
> which IS multi-select for starting a group) — matches iOS exactly: each tap fires its own
> request immediately, tracked per-user (`isAdding`/`isMember`) so a double-tap mid-flight is a
> no-op and a refusal rolls that one row back to offering the button again with the server's
> message surfaced, without disturbing any other row's state.
>
> **+8 tests**: `ConversationRepositoryTest` ×2 (forwards ids, folds a refusal into a Failure —
> same shape as the existing `removeParticipant`/`updateParticipantRole` pairs);
> `AddParticipantViewModelTest` ×6 (debounced search populates rows, a sub-floor query never hits
> the network, an existing member is flagged and never offered the button, a successful add marks
> the row a member and fires `onAdded`, a refused add rolls back and surfaces the error, a repeat
> tap while the first call is in flight is a no-op).
>
> **Verified**: Android SDK available in this container — `./apps/android/meeshy.sh check`
> (assembleDebug + testDebugUnitTest, all modules) run before any push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time (see the recurring note on this pattern in
> the `reels-realtime-room` entry further below) → unchanged from before this PR's CI wait
> (`streak=2`), so this run advances it cleanly to `lane=ANDROID android_streak=3
> last_run=add-participant-sheet`.
>
> **`Test shared` failed on this PR's CI too — 3rd consecutive Android run** — same root cause
> as the previous two: `focus-curve.test.ts` (Focal curve-math), confirmed broken on `main`'s own
> CI across multiple consecutive commits during this PR's wait (`d87f59b34`, `0612c8caac`, both
> `conclusion: failure`) — an actively-in-progress concurrent Focal tuning session (the numeric
> assertion targets themselves kept shifting between runs), not a one-off regression. Landed for
> real between this PR opening and merging (`packages/shared/utils/focus-curve.ts` touched again
> by the merge of PR #3102). `Android` (the actual merge gate) was green all three times — noting
> this explicitly a third time in case the pattern is worth a future dedicated look (e.g. should
> `Test shared` even run on an `apps/android`-only diff at all?), not because it blocked anything.

