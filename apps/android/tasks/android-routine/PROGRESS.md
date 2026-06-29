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

Ordered by value:
1. **Text element styling** — per-element style picker (bold/neon/typewriter/handwriting/classic),
   colour, alignment, and per-style typography *rendering* on the canvas (the model already carries
   `style`/`color`/`align`; this slice renders them and adds the picker UI + VM intents
   `onTextElementStyle`/`onTextElementColor`/`onTextElementAlign`, each a one-line
   `deck.updateTextElement` wrapper, fully testable).
2. **In-place floating text editor** — tool bubbles over the selected element + keyboard-aware
   canvas shift (the editing-selection plumbing — `selectedTextElementId`/`editorText` — already
   exists; this is the floating UI + a pure "where to place the toolbar" helper).
3. **Canvas toolbar/FAB** — the bottom-band toolbar (Contenu/Effets) grouping add-text / add-media;
   glue-heavy, keep any mode decision in a pure helper or the VM.
4. After Stories richness is sufficient, advance to the **Calls** area
   (`feature-parity.md` §"Calls").

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
