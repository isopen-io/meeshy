# Story Timeline WYSIWYG Parity — Design

## Context

The story composer's Timeline editor (Quick/Pro) is meant to let a user see, on the
track lanes and ruler, exactly what the story will look like when played back —
transitions, total duration, a looping background clip, where foreground content
starts. A code audit (comparing the Timeline editor widget against the shared
`StoryRenderer` pipeline that actually drives the live canvas, the reader, and the
MP4 exporter) found that most of this **is** already WYSIWYG by design — the canvas
preview behind the Timeline sheet shares the exact same renderer as playback and
export. The gaps are specifically in the **Timeline widget's own visualization**
(ruler + track lanes + badges), which is hand-built from `TimelineProject`/
`StoryMediaObject` geometry and never claimed the same parity guarantee the canvas
has.

Four concrete representational gaps were found and validated with the user via
visual mockups (screens recorded under `.superpowers/brainstorm/`, not committed):

1. A looping background clip (e.g. a 3s video looping to fill a 12s slide) draws as
   one static 3s block followed by visually empty space — no indication it repeats.
2. Trimming/splitting/deleting a clip never resyncs the displayed slide duration to
   the "longest data wins" auto-rule; a stale duration can get silently baked in as
   a permanent override.
3. Inter-slide opening/closing transitions (fade/zoom/slide/reveal) have zero
   representation on the Timeline ruler — configured entirely outside the Timeline
   editor, invisible while editing tracks.
4. The "Dissolve" transition option in the picker renders identically to
   "Crossfade" everywhere it's actually played (editor preview, reader, MP4 export)
   — the picker offers a capability nothing currently renders.

A fifth, more urgent issue was found while manually testing different media types
in the simulator to validate the above (per explicit user request): on compact
phone screens, the Pro timeline's default panel height (280pt, shared across every
composer tool panel) leaves **zero** visible room for track lanes once Pro's extra
toolbar row is accounted for — a user who adds their first clip sees no track at
all unless they discover and drag the resize grabber. Quick mode is not affected
(no extra toolbar row), which is why this was easy to miss.

Goal of this round: close all five gaps so the Timeline widget is trustworthy —
what it shows is what will play.

## A — Background loop visualization — ALREADY IMPLEMENTED, no action needed

**Status update (discovered mid-design, before implementation started):** a
parallel work session landed this exact gap independently — commit `72cad46f4`
("fix(ios/timeline): composer chrome overlaps sheet + loop-fill visualization"),
already on the branch this spec is written against. It ships `LoopRepeatOverlay`
(`Timeline/Views/Track/LoopRepeatOverlay.swift`), rendering tiled, non-interactive,
dashed-border echoes of a looping background clip (video or audio) out to
`slideDuration` — visually equivalent to (in fact more thorough than) the
"source pleine + queue" treatment approved earlier in this design's brainstorm
(tiled repeats with a loop glyph per tile, vs. a single dashed tail). It's wired
into both `QuickTimelineView` and `ProTimelineView`'s `clipBar(for:...)`, covered
by `LoopRepeatOverlayTests.swift` (61 lines), and the commit message confirms a
full green SDK suite + simulator verification.

**Action for this round: verify only** (part of the end-to-end validation pass,
item 9 below) — confirm it holds up with the distinguishable test media generated
during design (real color-bar video, not the simulator's blank synthetic assets).
No new code for this item.

## B — Duration always reflects the current content

**Chosen treatment**: always auto-recompute, surfaced with a transient toast (no
persistent "pinned/locked" badge state).

- Every content-mutating Timeline operation — trim start, trim end, split, delete clip, add clip — immediately recomputes `project.slideDuration` using the same "longest data wins" rule as `StorySlide.computedTotalDuration()` (need a `TimelineProject`-scoped equivalent — see Open Questions), and the ruler animates to the new length in the same frame as the edit.
- If the recomputed value differs from what was on screen, fire a one-shot, transient toast: "Durée mise à jour → Xs" (new observable event on `TimelineViewModel`, e.g. `@Published var durationDidAutoAdjust: (from: Float, to: Float)?`, consumed by a toast view and reset after presentation — same one-shot pattern already used elsewhere in the composer for ephemeral UI events).
- The manual `DurationHandle` drag (`setSlideDuration`) is unaffected as an input — a user can still explicitly extend the slide (e.g. to leave trailing silence). What changes is that this is no longer a **permanent** override: a *subsequent* content-mutating edit is allowed to auto-recompute again and move the duration, exactly like any other edit would. There is no "locked forever" state to reason about or surface.
- `TimelineProject.apply()` keeps writing `effects.timelineDuration = slideDuration` at commit time (needed so the silence-padding use case above persists across sessions) — what changes is *when* `slideDuration` gets updated during editing, not the commit/persistence mechanism itself.

## C — Inter-slide transitions, read-only chrome lane

**Chosen treatment**: a thin, non-interactive "chrome" lane above the ruler in both
`QuickTimelineView` and `ProTimelineView`, showing a badge at the left edge (opening
effect) and right edge (closing effect), each sized to the effect's actual
duration.

- `TimelineProject` gains two read-only properties, `openingEffect` / `closingEffect: StoryTransitionEffect?`, captured from `slide.effects.opening` / `.closing` at `init(from:)` time. These are display-only snapshots — the Timeline editor does not become a second place to edit them.
- New view `TransitionChromeLane`, rendered above the existing ruler in both container views, with two badge regions positioned/sized against the same `TimelineGeometry` used for clips (so a 0.5s fade badge visually occupies 0.5s of ruler width, consistent with how clip bars are positioned).
- **Explicitly out of scope for this round**: making the chrome lane interactive (tapping to edit). Editing continues via the existing `OpeningEffectChips` UI above the canvas. If this turns out to be confusing (users expect to edit what they can see), that's a follow-up, not blocking this fix.

## D — Retire "Dissolve" as a distinct, false promise

**Chosen treatment**: merge into "Crossfade" in the UI; keep the enum case for data
compatibility.

- `TransitionInspector`'s kind picker offers only "Fondu-enchaîné" (crossfade) going forward — "Dissolve" is removed as a selectable option.
- `TransitionBadge` stops branching its icon by kind — always renders the crossfade glyph, since that's the only selectable kind and it's also what any legacy `.dissolve` transition actually renders as.
- `StoryClipTransitionKind.dissolve` **stays in the model** (Codable case preserved) purely so previously-published stories that serialized `kind: .dissolve` continue to decode without error. No rendering code changes here — `ReaderTransitionResolver.liveRenderableTransition` already degrades `.dissolve` to a crossfade opacity ramp; that behavior is correct and untouched.
- New regression test: decoding a fixture with `kind: .dissolve` doesn't throw, and the badge/inspector for that transition present identically to a `.crossfade` one.

## E — Pro mode's default panel height must show at least one track row

**Chosen treatment**: give the Timeline tool panel a taller starting height than
other composer tools, specifically for the Pro sub-mode, instead of sharing the
generic 280pt default meant for simpler panels (Text, Drawing, etc.).

- Root cause (confirmed by reading `ComposerBottomBand.swift` + `ProTimelineView.swift`, and by reproducing on-device with a controlled slow drag via `idb ui swipe --duration 1.0`): `composerBandHeight` defaults to 280pt for every tool panel. Quick mode's chrome (transport row only) leaves a thin but visible sliver for one track row at that height; Pro mode's chrome (an *additional* `TimelineToolbar` row for undo/redo/snap/ruler-resolution, plus the Simple/Pro switch itself) consumes enough extra height that zero pixels remain for the `TimelineScrubArea`'s `ScrollView` once at least one clip exists. The resize grabber **does work** (confirmed empirically) — the bug is purely a bad default, not a broken gesture.
- Fix: when the Timeline tool panel opens in Pro sub-mode (or the user switches Quick → Pro), bump `composerBandHeight` up to `max(composerBandHeight, ProTimelineView.minimumUsefulHeight)`, where `minimumUsefulHeight` is a small pure constant/function equal to the sum of Pro's fixed chrome rows (`proToolbarRow` + `transportRow` + the Simple/Pro switch row, each already a known fixed height in the layout code) plus one 40pt track lane. Switching back to Quick does not shrink it back down — the user's resize choice is preserved, same as today. Quick mode's own default is unaffected (already shows content at 280pt).
- User can still shrink it back down via the existing grabber; this only fixes the *default*, not the min/max clamp range.

## Testing approach (TDD, per area)

- **A**: `TimelineGeometryTests` (or a new `TimelineGeometry_BackgroundLoopSplitTests`) — pure function, table-driven: non-looping clip → nil, looping clip shorter than slide → correct (sourceWidth, tailWidth) pair, looping clip already ≥ slide duration → nil.
- **B**: `TimelineViewModelTests` additions — trim/split/delete each followed by an assertion that `project.slideDuration` matches a hand-computed expected value, and that `durationDidAutoAdjust` fired with the right (from, to) when the value changed (and did NOT fire when it didn't).
- **C**: a `TimelineProject` init test asserting `openingEffect`/`closingEffect` are captured correctly from `slide.effects`, plus a lightweight snapshot/geometry test on `TransitionChromeLane`'s badge sizing (mirrors existing `TransitionJunctionResolver` tests).
- **D**: decode-compatibility test for legacy `.dissolve` fixtures (no crash, renders as crossfade); `TransitionInspector` test asserting the kind picker's option set no longer includes `.dissolve`.
- **E**: a pure function for the computed default height (e.g. `ProTimelineView.minimumPanelHeight(chromeHeight:) -> CGFloat` or similar), unit-tested against known chrome-row heights; manual simulator verification (screenshot before/after adding a clip in Pro mode, confirming a track row is visible without dragging the grabber).

All five items follow existing extraction patterns already used in this exact file tree (`resolveEffectiveBandState`, `effectiveClipDuration`) — pure, testable functions consumed by thin view code, no new architecture introduced.

## Verification (end-to-end, in addition to unit tests)

- Build via `./apps/ios/meeshy.sh build`, install fresh, and manually validate in the simulator with **distinguishable, non-blank test media** (the simulator's default synthetic photo/video library is solid-color and cannot be used to visually confirm rendering — generate real test assets, e.g. via `ffmpeg testsrc` for video and a labeled `drawtext` image, and seed them with `xcrun simctl addmedia`).
- Test matrix: image/video/audio in background AND foreground, at least one combination with a background clip shorter than the slide (loop), one with a foreground clip starting at a non-zero offset, one slide with both an opening and a closing effect, one with a crossfade transition between two foreground clips.
- Confirm the Timeline (Quick and Pro) visually matches actual playback (scrub/play preview) for every case in the matrix.

## Open questions for implementation

- Item B needs a `TimelineProject`-scoped equivalent of `StorySlide.computedTotalDuration()`'s "longest data wins" rule (today it's only defined on `StorySlide`, requiring a full slide reconstruction to call). Simplest option found during design: reuse whatever conversion `TimelineProject.apply()` already does to build a transient `StorySlide` and call the existing function on it — avoids duplicating the rule in two places. Confirm this doesn't regress performance if called on every drag-frame (likely fine if only invoked on gesture *end*, not continuously during a drag).
