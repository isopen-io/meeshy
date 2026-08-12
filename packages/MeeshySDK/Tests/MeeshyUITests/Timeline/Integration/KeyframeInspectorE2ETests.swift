import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Plan 4 — Sprint 6 #62 — End-to-end coverage of the KeyframeInspector edit
/// flow wired up in P3-#1, #2 and #12.
///
/// The flow under test:
///   1. User selects a keyframe via `selection.selectedClipId`.
///   2. `KeyframeInspector` overlay surfaces snapshot data via
///      `TimelineInspectorHost.resolveKeyframeSnapshot(viewModel:)`.
///   3. User edits a transform/easing axis -> inspector calls
///      `TimelineViewModel.moveKeyframe(clipId:keyframeId:position:scale:
///      opacity:easing:)`.
///   4. `MoveKeyframeCommand` is applied to the project and pushed onto
///      `commandStack`, coalescing with the previous command when fired in a
///      single drag burst (same clipId + keyframeId + <0.5s).
///   5. `viewModel.undo()` reverts the merged command in one step.
///   6. `viewModel.redo()` re-applies the same merged delta.
///
/// These tests drive the ViewModel public API only — production wire-up is
/// not modified.
@MainActor
final class KeyframeInspectorE2ETests: XCTestCase {

    // MARK: - Factories

    private static let clipId = "media-clip-1"
    private static let keyframeId = "kf-edit-1"

    /// Builds a project containing a single video clip with one keyframe
    /// positioned at (0.3, 0.4), scale 1.0, opacity 1.0, easing linear.
    /// Mirrors what `resolveKeyframeSnapshot` would surface for an
    /// inspector-driven edit session.
    private func makeProject() -> TimelineProject {
        let keyframe = StoryKeyframe(
            id: Self.keyframeId,
            time: 1.0,
            x: 0.3,
            y: 0.4,
            scale: 1.0,
            opacity: 1.0,
            easing: .linear
        )
        var media = StoryMediaObject(
            id: Self.clipId,
            postMediaId: "pm-1",
            mediaType: "video",
            placement: "media",
            aspectRatio: 1.0,
            startTime: 0,
            duration: 5
        )
        media.keyframes = [keyframe]
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 5,
            mediaObjects: [media],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    /// Builds a TimelineViewModel bootstrapped with `project` and a
    /// MockStoryTimelineEngine that swallows configure() without spinning up
    /// AVFoundation. Selection is primed on the keyframe id so the
    /// inspector contract holds for the entire test.
    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let vm = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        vm.selection.select(Self.keyframeId)
        return vm
    }

    /// Convenience accessor for the (single) keyframe under test.
    private func currentKeyframe(_ vm: TimelineViewModel) -> StoryKeyframe {
        guard let kf = vm.project.mediaObjects.first?.keyframes?.first else {
            fatalError("Test fixture lost its keyframe — factory contract broken")
        }
        return kf
    }

    // MARK: - Single-axis edits

    func test_editKeyframePosition_pushesCommand_undoReverts() {
        let vm = makeViewModel(project: makeProject())

        // Baseline matches the factory contract — the inspector reads these
        // values via resolveKeyframeSnapshot before the edit fires.
        XCTAssertEqual(currentKeyframe(vm).x, 0.3)
        XCTAssertEqual(currentKeyframe(vm).y, 0.4)
        XCTAssertEqual(vm.commandHistoryDepth, 0)

        // Inspector commits a new position.
        vm.moveKeyframe(
            clipId: Self.clipId,
            keyframeId: Self.keyframeId,
            position: CGPoint(x: 0.6, y: 0.7)
        )

        XCTAssertEqual(currentKeyframe(vm).x, 0.6)
        XCTAssertEqual(currentKeyframe(vm).y, 0.7)
        XCTAssertEqual(vm.commandHistoryDepth, 1)
        XCTAssertTrue(vm.canUndo)

        // Undo restores the pre-edit snapshot.
        vm.undo()
        XCTAssertEqual(currentKeyframe(vm).x, 0.3)
        XCTAssertEqual(currentKeyframe(vm).y, 0.4)
        XCTAssertTrue(vm.canRedo)

        // Redo re-applies the committed position.
        vm.redo()
        XCTAssertEqual(currentKeyframe(vm).x, 0.6)
        XCTAssertEqual(currentKeyframe(vm).y, 0.7)
    }

    func test_editKeyframeScale_pushesCommand_undoReverts() {
        let vm = makeViewModel(project: makeProject())
        XCTAssertEqual(currentKeyframe(vm).scale, 1.0)

        vm.moveKeyframe(
            clipId: Self.clipId,
            keyframeId: Self.keyframeId,
            scale: 2.5
        )

        XCTAssertEqual(currentKeyframe(vm).scale, 2.5)
        XCTAssertEqual(vm.commandHistoryDepth, 1)

        // Position/opacity/easing axes MUST be untouched by a scale-only edit.
        XCTAssertEqual(currentKeyframe(vm).x, 0.3)
        XCTAssertEqual(currentKeyframe(vm).opacity, 1.0)
        XCTAssertEqual(currentKeyframe(vm).easing, .linear)

        vm.undo()
        XCTAssertEqual(currentKeyframe(vm).scale, 1.0)

        vm.redo()
        XCTAssertEqual(currentKeyframe(vm).scale, 2.5)
    }

    func test_editKeyframeOpacity_pushesCommand_undoReverts() {
        let vm = makeViewModel(project: makeProject())
        XCTAssertEqual(currentKeyframe(vm).opacity, 1.0)

        vm.moveKeyframe(
            clipId: Self.clipId,
            keyframeId: Self.keyframeId,
            opacity: 0.25
        )

        XCTAssertEqual(currentKeyframe(vm).opacity, 0.25)
        XCTAssertEqual(vm.commandHistoryDepth, 1)
        XCTAssertEqual(currentKeyframe(vm).x, 0.3)
        XCTAssertEqual(currentKeyframe(vm).scale, 1.0)

        vm.undo()
        XCTAssertEqual(currentKeyframe(vm).opacity, 1.0)

        vm.redo()
        XCTAssertEqual(currentKeyframe(vm).opacity, 0.25)
    }

    func test_editKeyframeEasing_pushesCommand_undoReverts() {
        let vm = makeViewModel(project: makeProject())
        XCTAssertEqual(currentKeyframe(vm).easing, .linear)

        vm.moveKeyframe(
            clipId: Self.clipId,
            keyframeId: Self.keyframeId,
            easing: .easeInOut
        )

        XCTAssertEqual(currentKeyframe(vm).easing, .easeInOut)
        XCTAssertEqual(vm.commandHistoryDepth, 1)

        vm.undo()
        XCTAssertEqual(currentKeyframe(vm).easing, .linear)

        vm.redo()
        XCTAssertEqual(currentKeyframe(vm).easing, .easeInOut)
    }

    // MARK: - Coalescing — single-axis 60fps drag

    func test_dragKeyframe_coalescesIntoOneCommand_undoSingleStep() {
        // Simulates 10 successive `onPositionChanged` callbacks fired by a
        // pan gesture at ~60fps. Each push uses `Date()` so they all fall
        // inside the default 0.5s coalesce window and merge into a single
        // command. Undo MUST roll back to the pre-drag position in one step.
        let vm = makeViewModel(project: makeProject())
        XCTAssertEqual(currentKeyframe(vm).x, 0.3)
        XCTAssertEqual(currentKeyframe(vm).y, 0.4)

        for step in 1...10 {
            let progress = CGFloat(step) / 10.0
            // x ramps from 0.3 -> 0.8, y ramps from 0.4 -> 0.9 across the drag.
            let newX = 0.3 + progress * 0.5
            let newY = 0.4 + progress * 0.5
            vm.moveKeyframe(
                clipId: Self.clipId,
                keyframeId: Self.keyframeId,
                position: CGPoint(x: newX, y: newY)
            )
        }

        // Final state matches the last drag sample.
        XCTAssertEqual(currentKeyframe(vm).x ?? 0, 0.8, accuracy: 0.0001)
        XCTAssertEqual(currentKeyframe(vm).y ?? 0, 0.9, accuracy: 0.0001)

        // 10 pushes coalesce into ONE undoable command — this is the whole
        // point of the .moveKeyframe coalesce branch in CommandStack.
        XCTAssertEqual(vm.commandHistoryDepth, 1, "10 drag samples must coalesce into 1 command")

        // Single undo reverts the entire drag.
        vm.undo()
        XCTAssertEqual(currentKeyframe(vm).x, 0.3)
        XCTAssertEqual(currentKeyframe(vm).y, 0.4)
        XCTAssertFalse(vm.canUndo)
        XCTAssertTrue(vm.canRedo)

        // Single redo re-applies the merged drag to its final sample.
        vm.redo()
        XCTAssertEqual(currentKeyframe(vm).x ?? 0, 0.8, accuracy: 0.0001)
        XCTAssertEqual(currentKeyframe(vm).y ?? 0, 0.9, accuracy: 0.0001)
    }

    // MARK: - Coalescing — multi-axis preserves both deltas

    func test_editMultipleAxes_sameKeyframe_coalesces() {
        // A position edit followed by a scale edit on the SAME keyframe within
        // the coalesce window MUST merge into a single command that carries
        // BOTH deltas. Neither axis is allowed to erase the other (per the
        // per-axis ?? merge rule in CommandStack.coalesce).
        let vm = makeViewModel(project: makeProject())
        XCTAssertEqual(currentKeyframe(vm).x, 0.3)
        XCTAssertEqual(currentKeyframe(vm).scale, 1.0)

        vm.moveKeyframe(
            clipId: Self.clipId,
            keyframeId: Self.keyframeId,
            position: CGPoint(x: 0.7, y: 0.8)
        )
        vm.moveKeyframe(
            clipId: Self.clipId,
            keyframeId: Self.keyframeId,
            scale: 3.0
        )

        // Both axes mutated, one command on the stack.
        XCTAssertEqual(currentKeyframe(vm).x, 0.7)
        XCTAssertEqual(currentKeyframe(vm).y, 0.8)
        XCTAssertEqual(currentKeyframe(vm).scale, 3.0)
        XCTAssertEqual(vm.commandHistoryDepth, 1)

        // Single undo rolls back BOTH axes — the merged command's revert()
        // must restore the pre-edit snapshot on every axis it touched.
        vm.undo()
        XCTAssertEqual(currentKeyframe(vm).x, 0.3)
        XCTAssertEqual(currentKeyframe(vm).y, 0.4)
        XCTAssertEqual(currentKeyframe(vm).scale, 1.0)

        // Single redo re-applies BOTH axes in one step.
        vm.redo()
        XCTAssertEqual(currentKeyframe(vm).x, 0.7)
        XCTAssertEqual(currentKeyframe(vm).y, 0.8)
        XCTAssertEqual(currentKeyframe(vm).scale, 3.0)
    }
}
