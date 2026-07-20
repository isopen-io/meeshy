import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// P0 bug fix coverage — Audio/Text clip drag was calling `beginClipDrag`
/// inside every `.onChanged` callback. Each call reset `originalStartTime`
/// to the (already-mutated) clip start, so after N frames the position had
/// drifted N times the intended delta — exponential snowball.
///
/// The fix in `StoryTimelineView.clipBar` and `ProTimelineView.clipBar`:
///   1. Guard `beginClipDrag` behind `activeDrag?.clipId != id`
///   2. Compute rawTime from `drag.originalStartTime` (captured once), NOT
///      from the live `audio.startTime` / `text.startTime` (mutated each frame)
///   3. Wire `.onEnded` on the `DragGesture` to call `endClipDrag()` so the
///      MoveClipCommand is pushed and `activeDrag` is cleared.
///
/// These tests replay the closure logic at the ViewModel level — the SwiftUI
/// gesture pipeline itself cannot be driven from XCTest, but the contract
/// the closures depend on (guard + originalStartTime + endClipDrag wiring)
/// is fully exercised here.
@MainActor
final class AudioTextDragDriftTests: XCTestCase {

    // MARK: - Factories

    private func makeAudioSUT(
        clipId: String = "audio-1",
        startTime: Float = 0,
        duration: Float = 5
    ) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let audio = StoryAudioPlayerObject(
            id: clipId,
            postMediaId: clipId,
            startTime: startTime,
            duration: duration
        )
        let project = TimelineProject(
            slideId: "slide-1",
            slideDuration: 30,
            mediaObjects: [],
            audioPlayerObjects: [audio],
            textObjects: [],
            clipTransitions: []
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    private func makeTextSUT(
        clipId: String = "text-1",
        startTime: Double = 1.0,
        duration: Double = 4.0
    ) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let text = StoryTextObject(
            id: clipId,
            text: "hello",
            startTime: startTime,
            duration: duration
        )
        let project = TimelineProject(
            slideId: "slide-1",
            slideDuration: 30,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [text],
            clipTransitions: []
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    /// Replays the production closure body from StoryTimelineView /
    /// ProTimelineView `clipBar(for:)` for audio + text clips. Kept in one
    /// place so the test exercises the EXACT same pattern as production.
    private func simulateOnMoveDelta(
        viewModel: TimelineViewModel,
        clipId: String,
        cumulativeDeltaPx: CGFloat,
        geometry: TimelineGeometry
    ) {
        if viewModel.selection.activeDrag?.clipId != clipId {
            viewModel.beginClipDrag(clipId: clipId)
        }
        guard let drag = viewModel.selection.activeDrag else { return }
        viewModel.dragClipMoved(
            rawTime: drag.originalStartTime + Float(cumulativeDeltaPx) / Float(geometry.pixelsPerSecond),
            snapCandidates: []
        )
    }

    // MARK: - Snowball drift

    /// Driving the production closure for an audio clip across 10 frames with
    /// cumulative deltas 10, 20, ..., 100 px must land the clip at
    /// `originalStart + 100 / pps` — NOT at a position that compounds each
    /// frame's delta against the previous frame's already-applied position.
    func test_audioClipDrag_multipleFrames_doesNotSnowball() async {
        let sut = makeAudioSUT(startTime: 2.0)
        await sut.awaitConfigured()
        let geometry = TimelineGeometry(zoomScale: 1.0)
        let pps = geometry.pixelsPerSecond
        let originalStart: Float = 2.0
        let totalDeltaPx: CGFloat = 100  // 10 frames × +10px

        let frameDeltas: [CGFloat] = (1...10).map { CGFloat($0 * 10) }
        for delta in frameDeltas {
            simulateOnMoveDelta(
                viewModel: sut,
                clipId: "audio-1",
                cumulativeDeltaPx: delta,
                geometry: geometry
            )
        }

        let finalStart = sut.project.audioPlayerObjects.first?.startTime ?? -99
        let expected = originalStart + Float(totalDeltaPx / pps)
        XCTAssertEqual(
            finalStart, expected, accuracy: 0.001,
            "Audio clip startTime must equal originalStart + totalDelta/pps "
            + "(\(expected)) — snowball drift would have produced ~"
            + "\(originalStart + Float(frameDeltas.reduce(0, +) / pps)) or worse"
        )
        XCTAssertEqual(
            sut.selection.activeDrag?.originalStartTime ?? Float.nan, originalStart, accuracy: 0.001,
            "originalStartTime must be captured ONCE at first beginClipDrag — "
            + "subsequent .onChanged callbacks must NOT reset it"
        )
    }

    /// Same drift contract for text clips.
    func test_textClipDrag_multipleFrames_doesNotSnowball() async {
        let sut = makeTextSUT(startTime: 1.0)
        await sut.awaitConfigured()
        let geometry = TimelineGeometry(zoomScale: 1.0)
        let pps = geometry.pixelsPerSecond
        let originalStart: Float = 1.0
        let totalDeltaPx: CGFloat = 100

        let frameDeltas: [CGFloat] = (1...10).map { CGFloat($0 * 10) }
        for delta in frameDeltas {
            simulateOnMoveDelta(
                viewModel: sut,
                clipId: "text-1",
                cumulativeDeltaPx: delta,
                geometry: geometry
            )
        }

        let finalStart = Float(sut.project.textObjects.first?.startTime ?? -99)
        let expected = originalStart + Float(totalDeltaPx / pps)
        XCTAssertEqual(
            finalStart, expected, accuracy: 0.001,
            "Text clip startTime must equal originalStart + totalDelta/pps"
        )
    }

    // MARK: - endClipDrag wiring

    /// Once the gesture ends, `.onEnded` on the DragGesture must call
    /// `endClipDrag()` so the MoveClipCommand is pushed onto the undo stack
    /// AND `activeDrag` is cleared. Without this wiring (the pre-fix state
    /// for AudioClipBar / TextClipBar) the drag state leaks across gestures
    /// and the move is never undoable.
    func test_textClipDrag_endTriggersEndClipDrag() async {
        let sut = makeTextSUT(startTime: 1.0)
        await sut.awaitConfigured()
        let geometry = TimelineGeometry(zoomScale: 1.0)

        for delta in [CGFloat(10), 30, 60] {
            simulateOnMoveDelta(
                viewModel: sut,
                clipId: "text-1",
                cumulativeDeltaPx: delta,
                geometry: geometry
            )
        }
        XCTAssertNotNil(sut.selection.activeDrag,
                        "activeDrag must be set while the gesture is in flight")
        XCTAssertFalse(sut.canUndo,
                       "No MoveClipCommand should be on the stack until endClipDrag fires")

        // This is what `.onEnded { _ in onMoveEnded() }` triggers in production.
        sut.endClipDrag()

        XCTAssertNil(sut.selection.activeDrag,
                     "activeDrag must be cleared after endClipDrag — without this "
                     + "the next gesture's beginClipDrag-guard short-circuits and "
                     + "the new drag inherits the previous originalStartTime")
        XCTAssertTrue(sut.canUndo,
                      "endClipDrag must push a MoveClipCommand onto the undo stack")
    }

    /// Same end-of-gesture contract for audio clips.
    func test_audioClipDrag_endTriggersEndClipDrag() async {
        let sut = makeAudioSUT(startTime: 0.5)
        await sut.awaitConfigured()
        let geometry = TimelineGeometry(zoomScale: 1.0)

        simulateOnMoveDelta(viewModel: sut, clipId: "audio-1",
                            cumulativeDeltaPx: 20, geometry: geometry)
        simulateOnMoveDelta(viewModel: sut, clipId: "audio-1",
                            cumulativeDeltaPx: 80, geometry: geometry)
        XCTAssertNotNil(sut.selection.activeDrag)

        sut.endClipDrag()

        XCTAssertNil(sut.selection.activeDrag)
        XCTAssertTrue(sut.canUndo)
    }
}
