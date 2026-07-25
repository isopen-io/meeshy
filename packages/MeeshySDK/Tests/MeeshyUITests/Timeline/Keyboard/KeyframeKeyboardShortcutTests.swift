import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 64 — K shortcut adds keyframe at playhead on selected clip.
/// Exercises `addKeyframeAtPlayhead()` directly (the K shortcut invokes this on the ViewModel).
///
/// B22 — `test_kShortcut_runtimeDispatch_requiresUIWindow` previously read
/// `try XCTSkipIf(true, "... covered by Phase 4 XCUITest suite.")`
/// permanently — that suite never existed (see `HitTargetTests` /
/// `apps/ios/project.yml`). Unlike `TransportBarKeyboardTests` (whose Space
/// shortcut has a real `.keyboardShortcut(" ", ...)` in `TransportBar.swift`
/// to source-guard), a repo-wide search for a "K" keyboard binding
/// (`.keyboardShortcut(`, `UIKeyCommand`, `keyCommand`) across both
/// `packages/MeeshySDK/Sources` and `apps/ios/Meeshy` turns up NOTHING — the
/// only `.keyboardShortcut` call sites in the whole SDK are TransportBar's
/// two Space-bar ones. The "K adds a keyframe" interaction today is a plain
/// `Button(action: onAddKeyframe)` tap in `ClipInspector.swift` (line ~526);
/// there is no source-level keyboard wiring to point a structural test at.
/// Genuine debt, tracked honestly instead of behind a false "covered
/// elsewhere" claim: either the K-key binding still needs to be implemented,
/// or it needs to be found and documented if it lives somewhere this search
/// missed.
@MainActor
final class KeyframeKeyboardShortcutTests: XCTestCase {

    private func makeSUT() -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 8)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    // MARK: - K key behavior (unit-testable portion)

    func test_kShortcut_addsKeyframeAtCurrentPlayhead() async {
        let sut = makeSUT()
        await sut.awaitConfigured()

        sut.selectClip(id: "clip-1")
        sut.scrub(to: 3.0)

        // The K shortcut calls this method
        sut.addKeyframeAtPlayhead(x: 0.5, y: 0.5, scale: 1.0, opacity: 1.0)

        let clip = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(clip?.keyframes?.count, 1,
                       "K shortcut must add exactly one keyframe")
        XCTAssertEqual(Float(clip?.keyframes?.first?.time ?? -1), 3.0, accuracy: 0.01,
                       "Keyframe must be placed at the current playhead time (relative to clip start)")
    }

    func test_kShortcut_withNoSelection_doesNothing() async {
        let sut = makeSUT()
        await sut.awaitConfigured()

        // No clip selected
        sut.scrub(to: 2.0)
        sut.addKeyframeAtPlayhead(x: 0.5, y: 0.5)

        let clip = sut.project.mediaObjects.first
        XCTAssertNil(clip?.keyframes?.first,
                     "Without selection, K shortcut must not create a keyframe")
    }

    func test_kShortcut_runtimeDispatch_requiresUIWindow() throws {
        // Honest debt marker (was previously "covered by Phase 4 XCUITest
        // suite" — false, no such suite exists in this project). A repo-wide
        // search found no `.keyboardShortcut`/`UIKeyCommand` binding for "K"
        // anywhere in `packages/MeeshySDK/Sources` or `apps/ios/Meeshy` — the
        // interaction today is a plain tap Button in `ClipInspector.swift`.
        // There is no source-level wiring to structurally source-guard, and
        // no XCUITest target to exercise the real key dispatch. Tracked as
        // real, open debt rather than a false completeness claim.
        try XCTSkipIf(true,
            "No 'K' keyboard-shortcut wiring exists anywhere in the SDK or app (verified via repo-wide " +
            "grep for .keyboardShortcut/UIKeyCommand/keyCommand) — the interaction is currently a plain " +
            "tap Button in ClipInspector.swift, not a keyboard shortcut. This is open debt: implement the " +
            "binding (and re-enable this test against it) or confirm the feature was descoped.")
    }
}
