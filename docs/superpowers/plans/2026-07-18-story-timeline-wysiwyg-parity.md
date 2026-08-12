# Story Timeline WYSIWYG Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Story Timeline editor (Quick + Pro) show, as closely as practical, exactly what will be visualized at playback — closing the duration-drift, missing-transition-chrome, and false-dissolve-promise gaps, plus a horizontal-space layout bug (label gutter) found during hands-on validation.

**Architecture:** No new architecture. Every change follows patterns already established in this exact file tree: pure `static` functions for testable logic (`TimelineGeometry.effectiveClipDuration`, `ComposerControlsLayer.resolveEffectiveBandState`), thin SwiftUI views that consume them, `EditCommand` structs for undoable mutations, `@Published` one-shot events for ephemeral UI (toast).

**Tech Stack:** Swift 6, SwiftUI, XCTest, Swift Package (`packages/MeeshySDK`, target `MeeshyUI`).

## Global Constraints

- Every production line is written in response to a failing test first (RED → GREEN → REFACTOR). No exceptions.
- No `any` in shared package; strict typing throughout (project already strict-mode).
- Run tests via: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/<TestClass>` for a scoped run, drop `-only-testing` for the full suite before considering a task done.
- **Do not touch** `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerBottomBand.swift`, `Timeline/Views/Controls/TimelineToolbar.swift`, or `Timeline/Views/Controls/TransportBar.swift` in this plan — another session has uncommitted Liquid Glass work in progress on those exact files as of this writing. Re-check `git status --short` before Task 4 (the only task that touches a file near that area) in case that work has landed or is still in flight.
- Item "A" (background-loop visualization) from the design spec is **already implemented and tested** on this branch (`LoopRepeatOverlay.swift` + `LoopRepeatOverlayTests.swift`, commit `72cad46f4`) — no task for it here, just include it in the final manual verification pass.
- Item "E" (Pro panel default height) from the design spec is **deferred**, blocked on the uncommitted `ComposerBottomBand.swift` work above — not a task in this plan.

---

## Task 1: Shrink the track label column so the lane gets the width

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift:51` (label frame width) and `:66-100` (label body — drop the `Text(title)`, icon-only)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TrackBarView.labelColumnWidth: CGFloat` (new `public static let`, so `ProTimelineView`/`QuickTimelineView` — which currently hardcode `minLaneWidth: 320` independent of the label column — can reference the same constant if they need it later; not required by this task).

- [ ] **Step 1: Write the failing test — label column width shrinks, accessibility label unaffected**

```swift
// Add to TrackBarViewTests.swift
func test_labelColumnWidth_isNarrowIconOnlyColumn() {
    XCTAssertEqual(TrackBarView<Color>.labelColumnWidth, 32, accuracy: 0.01,
                   "Track label column must be icon-only width, not the old 72pt text+icon column — it was stealing horizontal space from the actual timeline (user report 2026-07-18).")
}

func test_accessibilityLabel_stillIncludesFullTitle_afterTextRemoval() {
    // Even though the on-screen label drops the Text, VoiceOver users must
    // still hear the full track name — accessibilityComposedLabel is
    // unaffected by the visual change.
    let view = TrackBarView(
        title: "Vidéo 1", isLocked: false, isSelected: false,
        tintHex: "6366F1", isDark: false, laneWidth: 600, laneHeight: 44,
        iconName: "video.fill"
    ) { Color.clear }
    XCTAssertEqual(view.accessibilityComposedLabel, "Vidéo 1")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TrackBarViewTests`
Expected: FAIL — `TrackBarView<Color>.labelColumnWidth` does not exist (compile error). The second test should already pass (it's asserting current, unrelated-to-this-change behavior) — that's fine, it exists so a future regression on the label text removal is caught if `accessibilityComposedLabel`'s logic is accidentally touched later.

- [ ] **Step 3: Implement — narrow the column to icon-only**

Replace the body of `TrackBarView.swift` from line 48 to the end of `label` (line 100) with:

```swift
    /// Width of the sticky leading column. Icon-only (no text) so the
    /// scrollable lane — the actual timeline content — gets the width back.
    /// Was 72pt with a text label; on a 402pt-wide phone that's ~18% of the
    /// sheet's width spent on a name already shown a second time inside the
    /// clip bar itself (`VideoClipBar.titleLabel` / `AudioClipBar.titleOverlay`)
    /// — pure redundancy (user report 2026-07-18: "le timeline doit occuper
    /// toute l'espace horizontal du sheet").
    public static let labelColumnWidth: CGFloat = 32

    public var body: some View {
        HStack(spacing: 0) {
            label
                .frame(width: Self.labelColumnWidth, height: laneHeight, alignment: .center)
                .background(isDark ? Color.black.opacity(0.25) : Color.white.opacity(0.6))

            ZStack(alignment: .leading) {
                laneBackground
                lane()
            }
            .frame(width: laneWidth, height: laneHeight, alignment: .leading)
            .clipped()
        }
        .frame(height: laneHeight)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityComposedLabel)
    }

    private var label: some View {
        Group {
            if isLocked {
                Image(systemName: "lock.fill")
                    .font(.caption2)
                    .foregroundStyle(MeeshyColors.warning)
            } else if let iconName {
                ZStack {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Color(hex: tintHex).opacity(isDark ? 0.30 : 0.18))
                        .frame(width: 18, height: 18)
                    Image(systemName: iconName)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Color(hex: tintHex))
                }
            }
        }
        .accessibilityHidden(true)
    }
```

Note `accessibilityComposedLabel` (unchanged, still combines `title` + lock suffix) is unaffected — it's what VoiceOver reads for the whole row via `.accessibilityLabel(accessibilityComposedLabel)` on the outer `HStack`, so removing the on-screen `Text(title)` loses nothing for accessibility.

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TrackBarViewTests`
Expected: PASS (3 tests: the 2 pre-existing + `test_labelColumnWidth_isNarrowIconOnlyColumn`; `test_accessibilityLabel_stillIncludesFullTitle_afterTextRemoval` also passes).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift
git commit -m "fix(sdk/timeline): shrink track label column to icon-only, reclaim width for the lane"
```

---

## Task 2: Merge "Dissolve" into "Crossfade" in the transition picker

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift:111-124` (replace `kindPicker`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionBadge.swift:51-61` (icon no longer branches on kind)
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeTests.swift` (update `test_init_dissolve_label` expectation)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/TransitionInspectorTests.swift`, `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeTests.swift`

**Interfaces:**
- Consumes: `StoryTransitionKind` (unchanged enum, `.crossfade`/`.dissolve` both still exist in `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:3359-3362` — **do not remove `.dissolve` from the enum**, legacy persisted data decodes into it).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing test — badge glyph is the same for both kinds**

```swift
// Replace test_init_dissolve_label in TransitionBadgeTests.swift with:
func test_init_dissolve_rendersIdenticallyToCrossfade() {
    // Dissolve degrades to a crossfade opacity ramp everywhere it's actually
    // rendered (editor preview, reader, MP4 export — see
    // ReaderTransitionResolver.liveRenderableTransition) — the badge must not
    // promise a distinct look nothing renders. A legacy .dissolve transition
    // reads exactly like a crossfade one now.
    let dissolveBadge = TransitionBadge(
        id: "t-2", kind: .dissolve, duration: 0.3,
        isSelected: false, isDark: false, anchorX: 200, laneHeight: 44,
        onTap: {}, onLongPress: {}, onDurationDelta: { _ in }
    )
    let crossfadeBadge = TransitionBadge(
        id: "t-1", kind: .crossfade, duration: 0.3,
        isSelected: false, isDark: false, anchorX: 200, laneHeight: 44,
        onTap: {}, onLongPress: {}, onDurationDelta: { _ in }
    )
    let expectedCrossfade = String(localized: "story.timeline.transition.kind.crossfade", bundle: .module)
    XCTAssertTrue(dissolveBadge.accessibilityComposed.contains(expectedCrossfade))
    XCTAssertEqual(dissolveBadge.accessibilityComposed, crossfadeBadge.accessibilityComposed)
}
```

Also add to `TransitionInspectorTests.swift`:

```swift
func test_kindPicker_onlyOffersCrossfade() {
    // The picker no longer exposes Dissolve as a selectable option — it
    // renders identically to Crossfade everywhere, so offering it as a
    // distinct choice was a false promise (design doc 2026-07-18).
    XCTAssertEqual(TransitionInspector.availableKinds, [.crossfade])
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TransitionBadgeTests -only-testing:MeeshyUITests/TransitionInspectorTests`
Expected: FAIL — `test_init_dissolve_rendersIdenticallyToCrossfade` fails (badge still shows the dissolve glyph/label), `test_kindPicker_onlyOffersCrossfade` fails to compile (`TransitionInspector.availableKinds` doesn't exist yet).

- [ ] **Step 3: Implement**

In `TransitionBadge.swift`, replace `accessibilityComposed` (lines 42-49) and the icon line (line 57):

```swift
    public var accessibilityComposed: String {
        // Both kinds render identically (dissolve degrades to a crossfade
        // opacity ramp — see ReaderTransitionResolver.liveRenderableTransition),
        // so both are labeled as crossfade. Prevents VoiceOver announcing a
        // "Dissolve" capability the app doesn't actually render.
        let kindLabel = String(localized: "story.timeline.transition.kind.crossfade", bundle: .module)
        return "\(kindLabel) — \(String(format: "%.2f", duration))s"
    }
```

```swift
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(.black)
                .accessibilityHidden(true)
```

(This replaces the `kind == .crossfade ? "arrow.triangle.2.circlepath" : "drop.fill"` ternary — always the crossfade glyph now.)

In `TransitionInspector.swift`, add a static property near `durationRange` (line 22):

```swift
    /// Selectable kinds in the picker. Dissolve is intentionally excluded —
    /// it renders identically to crossfade everywhere it's actually played
    /// (see `ReaderTransitionResolver.liveRenderableTransition`), so offering
    /// it as a distinct option was a false promise (design doc 2026-07-18).
    /// `.dissolve` itself stays in the `StoryTransitionKind` enum for Codable
    /// back-compat with already-published stories.
    public static let availableKinds: [StoryTransitionKind] = [.crossfade]
```

Replace `kindPicker` (lines 111-124) with a non-interactive label (there's nothing to pick between anymore):

```swift
    private var kindPicker: some View {
        HStack(spacing: 6) {
            Text(String(localized: "story.timeline.transition.crossfade", bundle: .module))
                .font(.subheadline.weight(.semibold))
            Spacer(minLength: 0)
        }
        .onAppear {
            // Legacy .dissolve transitions silently normalize to .crossfade
            // the first time their inspector is opened — same rendered
            // result, and it stops the stale kind from round-tripping
            // through further edits/undo history.
            if kind != .crossfade {
                kind = .crossfade
                onKindChanged(.crossfade)
            }
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TransitionBadgeTests -only-testing:MeeshyUITests/TransitionInspectorTests`
Expected: PASS, all tests including the pre-existing `test_kindChanged_emitsCallback` (still calls `simulateKindCommit(.dissolve)` directly — that helper still forwards any kind programmatically, unaffected by the UI picker change).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionBadge.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TransitionBadgeTests.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/TransitionInspectorTests.swift
git commit -m "fix(sdk/timeline): merge Dissolve into Crossfade — it rendered identically everywhere"
```

---

## Task 3: Extract a `TimelineProject`-callable duration rule (no behavior change)

Pure refactor enabling Task 4 — moves the existing "longest data wins" algorithm out of the `StorySlide`-only extension into a form both `StorySlide` and `TimelineProject` can call, without changing what it computes.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1061-1127` (`StorySlide.contentDerivedDuration()`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift` (confirmed home of existing `contentDerivedDuration`/`computedTotalDuration` coverage — append to this file, do not create a new one)

**Interfaces:**
- Produces: `StoryEffects.contentDerivedDuration(mediaObjects:audioPlayerObjects:textObjects:) -> TimeInterval` (new `static` func), consumed by Task 4's `TimelineProject.recomputedAutoDuration()`.

- [ ] **Step 1: Write the failing test**

Append to `StoryModelsExtensionsTests.swift`, matching the file's existing `StorySlide(id:effects:duration:order:)` construction pattern (see e.g. its `makeSlideForProject()` helper around line 335):

```swift
func test_staticContentDerivedDuration_matchesSlideInstanceMethod() {
    // The extracted static function must compute the exact same result as
    // the StorySlide instance method it now delegates to — this is a pure
    // refactor, not a behavior change.
    let media = [StoryMediaObject(id: "m1", mediaType: "video", aspectRatio: 1.0, startTime: 2, duration: 5)]
    var effects = StoryEffects()
    effects.mediaObjects = media
    let slide = StorySlide(id: "s1", effects: effects, duration: 10, order: 0)

    let viaInstance = slide.contentDerivedDuration()
    let viaStatic = StoryEffects.contentDerivedDuration(
        mediaObjects: media, audioPlayerObjects: nil, textObjects: []
    )
    XCTAssertEqual(viaInstance, viaStatic, accuracy: 0.001)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/StoryModelsExtensionsTests`
Expected: FAIL — `StoryEffects.contentDerivedDuration(mediaObjects:audioPlayerObjects:textObjects:)` doesn't exist (compile error).

- [ ] **Step 3: Implement — extract, delegate, zero behavior change**

Add this **new** static function on `StoryEffects` (place it right before the `extension StorySlide` block that currently starts around line 1044, i.e. inside `StoryEffects`'s own declaration or as a same-file extension — put it directly above `public func computedTotalDuration()` at line 1044):

```swift
extension StoryEffects {
    /// Core "longest data wins" rule, extracted from `StorySlide.contentDerivedDuration()`
    /// so `TimelineProject` (which carries the same three arrays but isn't a
    /// `StorySlide`) can call the identical algorithm during live editing —
    /// see `TimelineProject.recomputedAutoDuration()`. Pure function, no
    /// change in behavior versus the code it replaces.
    static func contentDerivedDuration(
        mediaObjects: [StoryMediaObject]?,
        audioPlayerObjects: [StoryAudioPlayerObject]?,
        textObjects: [StoryTextObject]
    ) -> TimeInterval {
        let bgVideoDur = mediaObjects?
            .first(where: { $0.isBackground && $0.kind == .video })?
            .duration
        let bgAudioDur = audioPlayerObjects?
            .first(where: { $0.isBackground == true })?
            .duration
            .map { Double($0) }

        let totalWords = textObjects.reduce(0) { acc, text in
            acc + text.text.split(separator: " ").count
        }
        let textDur: TimeInterval = {
            guard totalWords > StorySlide.longTextThresholdWords else {
                return StorySlide.defaultStaticDuration
            }
            let extraWords = totalWords - StorySlide.longTextThresholdWords
            return StorySlide.defaultStaticDuration
                + Double(extraWords) * StorySlide.longTextSecondsPerWord
        }()

        let mediaWindows = (mediaObjects ?? [])
            .compactMap { media in media.duration.map { (media.startTime ?? 0) + $0 } }
        let audioWindows = (audioPlayerObjects ?? [])
            .compactMap { audio in audio.duration.map { Double($0) + Double(audio.startTime ?? 0) } }
        let longestData = (mediaWindows + audioWindows).max() ?? 0

        let target = max(textDur, StorySlide.defaultStaticDuration, longestData)

        let bgLoopPeriods = [bgVideoDur, bgAudioDur].compactMap { $0 }.filter { $0 > 0.001 }
        let bgResult: TimeInterval = bgLoopPeriods.reduce(target) { effective, period in
            let extended = period >= target ? period : (target / period).rounded(.up) * period
            return max(effective, extended)
        }

        return max(bgResult, longestData)
    }
}
```

Then replace the body of `StorySlide.contentDerivedDuration()` (the whole block from line 1061's opening brace through line 1127's closing brace, keeping the doc comment and signature) with a one-line delegation:

```swift
    public func contentDerivedDuration() -> TimeInterval {
        StoryEffects.contentDerivedDuration(
            mediaObjects: effects.mediaObjects,
            audioPlayerObjects: effects.audioPlayerObjects,
            textObjects: effects.textObjects
        )
    }
```

`defaultStaticDuration`, `longTextThresholdWords`, `longTextSecondsPerWord` (currently `private`/`static let` on `StorySlide`, lines 1040-1042) must become `static let` **without `private`** (drop the access modifier, default `internal` is enough since both are in the same module) so the new `StoryEffects` extension can read them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/StoryModelsExtensionsTests`
Expected: PASS. Then run the FULL suite (no `-only-testing`) to confirm zero regression — every existing `contentDerivedDuration()`/`computedTotalDuration()` test must still pass unchanged, since this is a pure refactor.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "refactor(sdk/story): extract contentDerivedDuration core onto StoryEffects (no behavior change)"
```

---

## Task 4: Timeline duration always reflects current content (auto-recompute + toast)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (add `TimelineProject.recomputedAutoDuration()`, near `apply(to slide:)` at line 2353)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift` (add `durationDidAutoAdjust`, replace `extendSlideDurationIfNeeded`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift` (`trimClipStart`, `trimClipEnd`, `addMedia`, `addAudio`, `deleteClip`) + `TimelineViewModel.swift` (`splitSelectedAtPlayhead`, `endClipDrag`)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelSlideDurationTests.swift` (existing file — this is exactly where prior slide-duration behavior, `setSlideDuration`, is already covered; append here, do not create a new file)

**Interfaces:**
- Consumes: `StoryEffects.contentDerivedDuration(mediaObjects:audioPlayerObjects:textObjects:)` from Task 3. Test double: `MockStoryTimelineEngine` (`packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Mocks/MockStoryTimelineEngine.swift`), conforms to `TimelineEngineProviding`.
- Produces: `TimelineViewModel.durationDidAutoAdjust: (from: Float, to: Float)?` (new `@Published`, one-shot — consumer resets it to `nil` after presenting the toast; not wired to a visible toast view in this task, see note in Step 3).

- [ ] **Step 1: Write the failing tests**

Append to `TimelineViewModelSlideDurationTests.swift`, reusing its existing `makeSUT` helper (async, `MockStoryTimelineEngine`, `await vm.awaitConfigured()` — do not invent a new mock or a synchronous variant):

```swift
    private func makeSUT(mediaObjects: [StoryMediaObject]) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        let longestWindow = mediaObjects.compactMap { m in m.duration.map { (m.startTime ?? 0) + $0 } }.max() ?? 6
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: Float(max(6, longestWindow)),
                                              mediaObjects: mediaObjects, audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    func test_trimClipEnd_shrinkingBelowSlideDuration_recomputesSlideDuration() async {
        let media = StoryMediaObject(id: "m1", mediaType: "video", aspectRatio: 1.0, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)

        // Shrink the only clip from 10s to 4s — nothing else on the slide,
        // so the auto rule falls back to the 6s static floor.
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)

        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01,
                       "Duration must shrink to the new auto-computed value, not stay pinned at the old 10s.")
    }

    func test_trimClipEnd_recompute_firesDurationDidAutoAdjust_whenValueChanges() async {
        let media = StoryMediaObject(id: "m1", mediaType: "video", aspectRatio: 1.0, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: -6)
        XCTAssertNotNil(sut.durationDidAutoAdjust)
        XCTAssertEqual(sut.durationDidAutoAdjust?.from ?? -1, 10, accuracy: 0.01)
        XCTAssertEqual(sut.durationDidAutoAdjust?.to ?? -1, 6, accuracy: 0.01)
    }

    func test_trimClipEnd_recompute_doesNotFire_whenValueUnchanged() async {
        // Slide already at the auto-computed value (10s from a 10s clip) —
        // a trim that keeps the clip at 10s must not fire a no-op toast.
        let media = StoryMediaObject(id: "m1", mediaType: "video", aspectRatio: 1.0, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.trimClipEnd(id: "m1", deltaTimeSeconds: 0.0001) // effectively unchanged after clamping
        XCTAssertNil(sut.durationDidAutoAdjust)
    }

    func test_deleteClip_recomputesSlideDuration() async {
        let long = StoryMediaObject(id: "m1", mediaType: "video", aspectRatio: 1.0, startTime: 0, duration: 10)
        let short = StoryMediaObject(id: "m2", mediaType: "video", aspectRatio: 1.0, startTime: 0, duration: 3)
        let sut = await makeSUT(mediaObjects: [long, short])
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)

        sut.deleteClip(id: "m1")

        XCTAssertEqual(sut.project.slideDuration, 6, accuracy: 0.01,
                       "Only the 3s clip remains — auto duration falls back to the 6s static floor.")
    }

    func test_addMedia_extendsSlideDurationToNewLongestWindow() async {
        let sut = await makeSUT(mediaObjects: [])
        sut.addMedia(id: "m1", postMediaId: "pm1", kind: .video, startTime: 0, duration: 12)
        XCTAssertEqual(sut.project.slideDuration, 12, accuracy: 0.01)
    }

    func test_splitSelectedAtPlayhead_recomputesSlideDuration() async {
        let media = StoryMediaObject(id: "m1", mediaType: "video", aspectRatio: 1.0, startTime: 0, duration: 10)
        let sut = await makeSUT(mediaObjects: [media])
        sut.selectClip(id: "m1")
        sut.scrub(to: 4, precise: true)
        sut.splitSelectedAtPlayhead()
        // Splitting doesn't change total content span (4s + 6s = 10s) — duration unchanged.
        XCTAssertEqual(sut.project.slideDuration, 10, accuracy: 0.01)
    }
```

Note this file already has its OWN private `makeSUT(slideDuration:)` (no `mediaObjects` parameter) used by the 3 pre-existing tests — Swift allows both private overloads to coexist in the same type as long as parameter labels differ, so adding the second `makeSUT(mediaObjects:)` above does not conflict; both remain in the file, each test picks whichever it needs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TimelineViewModelSlideDurationTests`
Expected: FAIL — `durationDidAutoAdjust` doesn't exist yet (compile error), and even once stubbed, the duration-shrink tests fail since current code never shrinks `slideDuration`. The 3 pre-existing tests in this file must keep passing throughout.

- [ ] **Step 3: Implement**

In `TimelineViewModel.swift`, add the new published event near `errorMessage` (line 80):

```swift
    /// One-shot signal that `project.slideDuration` was just auto-recomputed
    /// to a NEW value by a content-mutating edit (trim/split/delete/add/move).
    /// `nil` after the consuming view presents its toast. Never fires when
    /// the recomputed value matches what was already on screen — see
    /// `recomputeSlideDuration()`.
    @Published public var durationDidAutoAdjust: (from: Float, to: Float)?
```

Replace `extendSlideDurationIfNeeded` (lines 356-365) with a full recompute that can also shrink, and have it fire the event:

```swift
    /// Recomputes `project.slideDuration` from the current content using the
    /// same "longest data wins" rule as `StorySlide.computedTotalDuration()`
    /// (via `StoryEffects.contentDerivedDuration`), so the ruler/track length
    /// always matches what will actually play — never left stale after a
    /// trim/split/delete/add/move. Fires `durationDidAutoAdjust` only when
    /// the value actually changes, so a no-op edit doesn't spam a toast.
    func recomputeSlideDuration() {
        let auto = Float(StoryEffects.contentDerivedDuration(
            mediaObjects: project.mediaObjects,
            audioPlayerObjects: project.audioPlayerObjects,
            textObjects: project.textObjects
        ))
        guard abs(auto - project.slideDuration) > 0.05 else { return }
        let old = project.slideDuration
        project.slideDuration = auto
        durationDidAutoAdjust = (from: old, to: auto)
        if currentTime > auto {
            scrub(to: auto, precise: true)
        }
    }
```

Update `applyClipPosition` (lines 333-354) to call `recomputeSlideDuration()` instead of `extendSlideDurationIfNeeded(elementEnd:)` at all three call sites — replace each:

```swift
            extendSlideDurationIfNeeded(
                elementEnd: newStartTime + Float(project.mediaObjects[i].duration ?? 0)
            )
```

with:

```swift
            recomputeSlideDuration()
```

(same substitution for the `audioPlayerObjects` and `textObjects` branches — drop the `elementEnd:` argument entirely, `recomputeSlideDuration()` takes none).

**Important — no toast mid-drag:** `applyClipPosition` runs on every `dragClipMoved` frame (many times per second during a drag). Firing a toast on every frame would spam the UI. Guard it: wrap the `durationDidAutoAdjust` assignment in `recomputeSlideDuration()` so it only actually publishes when NOT mid-drag. Add a check using the existing `selection.activeDrag` state — change the guard to:

```swift
    func recomputeSlideDuration() {
        let auto = Float(StoryEffects.contentDerivedDuration(
            mediaObjects: project.mediaObjects,
            audioPlayerObjects: project.audioPlayerObjects,
            textObjects: project.textObjects
        ))
        guard abs(auto - project.slideDuration) > 0.05 else { return }
        let old = project.slideDuration
        project.slideDuration = auto
        // Suppress the toast while a clip drag is still in flight — this
        // function runs on every drag frame via applyClipPosition, and a
        // toast per frame would spam the UI. The final value after
        // endClipDrag()'s recompute is what actually gets announced.
        if selection.activeDrag == nil {
            durationDidAutoAdjust = (from: old, to: auto)
        }
        if currentTime > auto {
            scrub(to: auto, precise: true)
        }
    }
```

Then add one more `recomputeSlideDuration()` call in `endClipDrag()` (right after `commandStack.push(.moveClip(cmd))` at line 292, before `selection.endDrag()`) so the toast (suppressed during the drag itself) fires once, with the final value, when the gesture ends:

```swift
        commandStack.push(.moveClip(cmd))
        recomputeSlideDuration()
        selection.endDrag()
```

In `TimelineViewModel+Plan4Helpers.swift`, add a `recomputeSlideDuration()` call right after `scheduleEngineReconfigure()` in each of: `trimClipStart` (after line 52), `trimClipEnd` (after line 82), `addMedia` (after line 99), `addAudio` (after line 113), `deleteClip` (after line 288).

Example for `trimClipStart` (lines 49-55 become):

```swift
        do {
            try cmd.apply(to: &project)
            commandStack.push(.trimClip(cmd))
            scheduleEngineReconfigure()
            recomputeSlideDuration()
        } catch {
            errorMessage = error.localizedDescription
        }
```

(Same pattern — one added line — for the other four call sites listed above.)

In `TimelineViewModel.swift`'s `splitSelectedAtPlayhead` (lines 476-482), add the same call after `scheduleEngineReconfigure()`:

```swift
        do {
            try cmd.apply(to: &project)
            commandStack.push(.splitClip(cmd))
            scheduleEngineReconfigure()
            recomputeSlideDuration()
        } catch {
            errorMessage = error.localizedDescription
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TimelineViewModelSlideDurationTests`
Expected: PASS (all 3 pre-existing + 6 new tests). Then run the full `MeeshyUITests` target — pay particular attention to any existing test asserting `extendSlideDurationIfNeeded`'s old grow-only behavior (search `grep -rn "extendSlideDurationIfNeeded" packages/MeeshySDK/Tests/`) — update any such test to assert the new (grow-or-shrink) behavior instead of deleting coverage.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelSlideDurationTests.swift
git commit -m "fix(sdk/timeline): slide duration always reflects current content, not a stale pin"
```

**Note on the toast UI itself:** this task wires the `durationDidAutoAdjust` signal on the ViewModel. Actually presenting a visible toast view (subscribing to it from `ProTimelineView`/`QuickTimelineView`, showing "Durée mise à jour → Xs", clearing the field after) is a small, separate SwiftUI-only follow-up — not included here to keep this task's diff reviewable and focused on the (higher-risk) duration-recompute logic itself. Add it as Task 4b if the plan reviewer wants it in the same pass; the ViewModel signal is fully testable and functional without it.

---

## Task 5: Inter-slide transition chrome lane (read-only)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:2317-2351` (`TimelineProject` struct — add two properties, populate in `init(from:)`)
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionChromeLane.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift` (mount the lane above the ruler)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift` (same)
- Test: new `packages/MeeshySDK/Tests/MeeshySDKTests/Models/TimelineProjectOpeningClosingTests.swift`, new `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Track/TransitionChromeLaneTests.swift`

**Interfaces:**
- Consumes: `StoryRenderer.slideTransitionDuration` (`packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift:562`, value `0.5`) — the fixed duration every opening/closing effect animates over, used to size both badges.
- Produces: `TimelineProject.openingEffect: StoryTransitionEffect?`, `TimelineProject.closingEffect: StoryTransitionEffect?` (read-only snapshots, not written back by `apply(to slide:)`).

- [ ] **Step 1: Write the failing test for the model**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Models/TimelineProjectOpeningClosingTests.swift`:

```swift
import XCTest
@testable import MeeshySDK

final class TimelineProjectOpeningClosingTests: XCTestCase {

    func test_initFromSlide_capturesOpeningAndClosingEffects() {
        var effects = StoryEffects()
        effects.opening = .fade
        effects.closing = .zoom
        let slide = StorySlide(id: "s1", effects: effects, duration: 6, order: 0)

        let project = TimelineProject(from: slide)

        XCTAssertEqual(project.openingEffect, .fade)
        XCTAssertEqual(project.closingEffect, .zoom)
    }

    func test_initFromSlide_nilEffects_yieldsNilProperties() {
        let slide = StorySlide(id: "s1", effects: StoryEffects(), duration: 6, order: 0)
        let project = TimelineProject(from: slide)
        XCTAssertNil(project.openingEffect)
        XCTAssertNil(project.closingEffect)
    }
}
```

(Construction pattern confirmed against `StoryModelsExtensionsTests.swift`'s existing `StorySlide(id:effects:duration:order:)` call sites — same file Task 3 touches.)

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/TimelineProjectOpeningClosingTests`
Expected: FAIL — `TimelineProject.openingEffect` doesn't exist (compile error).

- [ ] **Step 3: Implement the model change**

In `StoryModels.swift`, add two properties to `TimelineProject` (after `clipTransitions` at line 2323):

```swift
    /// Read-only snapshot of the slide's inter-slide entry/exit animation,
    /// captured at `init(from:)` for the Timeline chrome lane to display.
    /// NOT round-tripped by `apply(to:)` — editing opening/closing stays the
    /// job of `OpeningEffectChips` above the canvas, same as before this
    /// property existed. Purely informational here.
    public var openingEffect: StoryTransitionEffect?
    public var closingEffect: StoryTransitionEffect?
```

Add them to the memberwise `init` (lines 2325-2337) with `= nil` defaults:

```swift
    public init(slideId: String,
                slideDuration: Float,
                mediaObjects: [StoryMediaObject] = [],
                audioPlayerObjects: [StoryAudioPlayerObject] = [],
                textObjects: [StoryTextObject] = [],
                clipTransitions: [StoryClipTransition] = [],
                openingEffect: StoryTransitionEffect? = nil,
                closingEffect: StoryTransitionEffect? = nil) {
        self.slideId = slideId
        self.slideDuration = slideDuration
        self.mediaObjects = mediaObjects
        self.audioPlayerObjects = audioPlayerObjects
        self.textObjects = textObjects
        self.clipTransitions = clipTransitions
        self.openingEffect = openingEffect
        self.closingEffect = closingEffect
    }
```

And populate them in `init(from slide:)` (after line 2350):

```swift
        self.clipTransitions = slide.effects.clipTransitions ?? []
        self.openingEffect = slide.effects.opening
        self.closingEffect = slide.effects.closing
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/TimelineProjectOpeningClosingTests`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the chrome lane view**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Track/TransitionChromeLaneTests.swift`:

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TransitionChromeLaneTests: XCTestCase {

    func test_badgeWidth_matchesSlideTransitionDuration() {
        // Both opening and closing badges are sized to the SAME fixed
        // duration every effect actually animates over
        // (StoryRenderer.slideTransitionDuration = 0.5s) — not a
        // per-effect-configurable value, since none exists on the model.
        let geometry = TimelineGeometry(zoomScale: 1.0)
        XCTAssertEqual(
            TransitionChromeLane.badgeWidth(geometry: geometry),
            geometry.width(for: 0.5),
            accuracy: 0.01
        )
    }

    func test_init_noEffects_doesNotCrash() {
        let view = TransitionChromeLane(openingEffect: nil, closingEffect: nil,
                                        slideDuration: 10, geometry: TimelineGeometry(zoomScale: 1.0),
                                        isDark: false)
        _ = view.body
    }

    func test_init_bothEffects_doesNotCrash() {
        let view = TransitionChromeLane(openingEffect: .fade, closingEffect: .reveal,
                                        slideDuration: 10, geometry: TimelineGeometry(zoomScale: 1.0),
                                        isDark: false)
        _ = view.body
    }
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TransitionChromeLaneTests`
Expected: FAIL — `TransitionChromeLane` doesn't exist (compile error).

- [ ] **Step 7: Implement the view**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionChromeLane.swift`:

```swift
import SwiftUI
import MeeshySDK

/// Read-only chrome strip above the ruler showing the slide's inter-slide
/// opening (left edge) / closing (right edge) animation, if any — the
/// Timeline editor previously gave zero indication these would play, even
/// though `OpeningEffectChips` (above the canvas, not part of the Timeline)
/// lets the user configure them. Both badges are sized to the same fixed
/// `StoryRenderer.slideTransitionDuration` (0.5s) every effect actually
/// animates over — not editable here; tap-to-edit stays out of scope for
/// this pass (design doc 2026-07-18) to avoid duplicating
/// `OpeningEffectChips`' UI.
public struct TransitionChromeLane: View {
    public let openingEffect: StoryTransitionEffect?
    public let closingEffect: StoryTransitionEffect?
    public let slideDuration: Float
    public let geometry: TimelineGeometry
    public let isDark: Bool

    public init(openingEffect: StoryTransitionEffect?,
                closingEffect: StoryTransitionEffect?,
                slideDuration: Float,
                geometry: TimelineGeometry,
                isDark: Bool) {
        self.openingEffect = openingEffect
        self.closingEffect = closingEffect
        self.slideDuration = slideDuration
        self.geometry = geometry
        self.isDark = isDark
    }

    /// Width every badge occupies — both opening and closing effects
    /// animate over the same fixed window (`StoryRenderer.slideTransitionDuration`),
    /// so there's exactly one width to compute regardless of effect kind.
    public static func badgeWidth(geometry: TimelineGeometry) -> CGFloat {
        geometry.width(for: Float(StoryRenderer.slideTransitionDuration))
    }

    public var body: some View {
        HStack(spacing: 0) {
            if let openingEffect {
                badge(for: openingEffect, alignment: .leading)
            } else {
                Spacer(minLength: 0).frame(width: Self.badgeWidth(geometry: geometry))
            }
            Spacer(minLength: 0)
            if let closingEffect {
                badge(for: closingEffect, alignment: .trailing)
            }
        }
        .frame(width: geometry.width(for: slideDuration), height: 18)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func badge(for effect: StoryTransitionEffect, alignment: Alignment) -> some View {
        HStack(spacing: 3) {
            Image(systemName: effect.iconName)
                .font(.system(size: 8, weight: .semibold))
            Text(Self.displayName(effect))
                .font(.system(size: 8, weight: .semibold))
                .lineLimit(1)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .frame(width: Self.badgeWidth(geometry: geometry), alignment: alignment == .leading ? .leading : .trailing)
        .background(
            Capsule().fill(MeeshyColors.indigo500.opacity(isDark ? 0.30 : 0.18))
        )
        .foregroundStyle(MeeshyColors.indigo500)
        .accessibilityLabel(Self.displayName(effect))
    }

    static func displayName(_ effect: StoryTransitionEffect) -> String {
        switch effect {
        case .fade:   return String(localized: "story.composer.opening.fade", bundle: .module)
        case .zoom:   return String(localized: "story.composer.opening.zoom", bundle: .module)
        case .slide:  return String(localized: "story.composer.opening.slide", bundle: .module)
        case .reveal: return String(localized: "story.composer.opening.reveal", bundle: .module)
        }
    }
}
```

Before using those four localization keys, run: `grep -n "story.composer.opening" packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings` — `OpeningEffectChips` almost certainly already defines display names for these four cases; reuse its **exact existing keys** instead of the placeholders above (adjust `displayName(_:)` to whatever keys are found — do not introduce duplicate strings for the same four concepts).

- [ ] **Step 8: Run tests to verify they pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TransitionChromeLaneTests`
Expected: PASS.

- [ ] **Step 9: Wire the lane into both container views**

In `QuickTimelineView.swift`, find where the ruler is rendered (search `grep -n "RulerView(\|TimelineScrubArea(" packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift`) and add `TransitionChromeLane` immediately above it:

```swift
TransitionChromeLane(
    openingEffect: viewModel.project.openingEffect,
    closingEffect: viewModel.project.closingEffect,
    slideDuration: viewModel.project.slideDuration,
    geometry: geometry,
    isDark: colorScheme == .dark
)
```

(`geometry` and `colorScheme` are already in scope at that point — both are used by the surrounding ruler/track code in the same file.) Repeat the identical insertion in `ProTimelineView.swift` at its own ruler mount point.

- [ ] **Step 10: Run the full MeeshyUITests + MeeshySDKTests suites**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5'`
Expected: PASS, 0 failures, matching the ~5100+ baseline the other in-flight commits report.

- [ ] **Step 11: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionChromeLane.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/TimelineProjectOpeningClosingTests.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Track/TransitionChromeLaneTests.swift
git commit -m "feat(sdk/timeline): read-only chrome lane shows opening/closing transitions on the ruler"
```

---

## Task 6: End-to-end simulator validation (all items, including the already-shipped A)

**No new production code** — this task is manual/scripted verification only.

- [ ] **Step 1:** Build fresh: `./apps/ios/meeshy.sh build`, install to simulator `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`, launch.
- [ ] **Step 2:** Confirm `xcrun simctl addmedia` test assets from the design phase are still present (a color-bar test video + labeled test image); regenerate with `ffmpeg` if the simulator was erased since.
- [ ] **Step 3:** Build one slide covering the full matrix: background video shorter than the slide (loop — verify `LoopRepeatOverlay` tiles correctly with real footage, not just blank synthetic assets), a foreground clip starting at a non-zero offset, a crossfade transition between two foreground clips, an opening AND closing effect set via `OpeningEffectChips`.
- [ ] **Step 4:** In Pro mode, confirm: the track label column no longer eats visible width (Task 1), the transition chrome lane shows both badges positioned/sized correctly (Task 5), trimming the foreground clip shorter visibly shrinks the ruler with a toast-worthy `durationDidAutoAdjust` firing (Task 4 — check via a temporary breakpoint/log if the toast UI wasn't wired in Task 4b), the transition picker only offers "Fondu-enchaîné" (Task 2).
- [ ] **Step 5:** Scrub/play the slide and compare against the Timeline's own visual layout — confirm nothing drifts.
- [ ] **Step 6:** Report any discrepancy found as a new, separate finding — do not silently patch scope creep into this plan's already-committed tasks.
