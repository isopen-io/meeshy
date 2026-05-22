import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Covers the millisecond-precision contracts added for the fullscreen
/// timeline edit mode:
///   - `setClipStartTime(id:startTime:)` quantises to 0.001s and pushes a
///     `MoveClipCommand` so the change participates in undo / redo.
///   - `setClipDuration(id:duration:)` quantises to 0.001s and pushes a
///     `TrimClipCommand`, auto-extending `project.slideDuration` when the
///     new tail outruns the current ceiling.
///   - `dragClipMoved(rawTime:snapCandidates:)` quantises the drag to the
///     same 0.001s grid so freeform gestures match the inspector field
///     resolution.
@MainActor
final class TimelineViewModelPrecisionTests: XCTestCase {

    private func makeSUT(
        startTime: Float = 0,
        duration: Float = 5,
        slideDuration: Float = 10
    ) -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        var project = TimelineProjectFactory.projectWithVideoClip(
            startTime: startTime, duration: duration
        )
        project.slideDuration = slideDuration
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    // MARK: - setClipStartTime quantisation

    func test_setClipStartTime_quantizesToMillisecond() async {
        let (sut, _) = makeSUT(startTime: 0)
        await sut.awaitConfigured()

        sut.setClipStartTime(id: "clip-1", startTime: 2.34749)

        let media = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertNotNil(media)
        XCTAssertEqual(Float(media?.startTime ?? 0), 2.347, accuracy: 0.0001,
                       "setClipStartTime must quantise to 3 decimal places")
        XCTAssertTrue(sut.canUndo,
                      "precise start edits push a command so they can be undone")
    }

    func test_setClipStartTime_negativeInput_clampsToZero() async {
        let (sut, _) = makeSUT(startTime: 1.5)
        await sut.awaitConfigured()

        sut.setClipStartTime(id: "clip-1", startTime: -0.5)

        let media = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(Float(media?.startTime ?? -1), 0, accuracy: 0.0001,
                       "Negative starts must clamp to zero")
    }

    func test_setClipStartTime_noOp_doesNotPushCommand() async {
        let (sut, _) = makeSUT(startTime: 2.5)
        await sut.awaitConfigured()
        let beforeDepth = sut.commandHistoryDepth

        // Same value (≤ 0.0005 delta after quantisation) — no command push.
        sut.setClipStartTime(id: "clip-1", startTime: 2.5001)

        XCTAssertEqual(sut.commandHistoryDepth, beforeDepth,
                       "Idle commits must not accumulate command stack noise")
    }

    func test_setClipStartTime_pastSlideDuration_extendsSlide() async {
        let (sut, _) = makeSUT(startTime: 0, duration: 5, slideDuration: 10)
        await sut.awaitConfigured()

        // Push the clip out so its tail (12.5 + 5 = 17.5) outruns slideDuration.
        sut.setClipStartTime(id: "clip-1", startTime: 12.5)

        XCTAssertEqual(sut.project.slideDuration, 17.5, accuracy: 0.001,
                       "Auto-extend must follow precise-start edits, not just drag")
    }

    // MARK: - setClipDuration quantisation

    func test_setClipDuration_quantizesToMillisecond() async {
        let (sut, _) = makeSUT(startTime: 0, duration: 5)
        await sut.awaitConfigured()

        sut.setClipDuration(id: "clip-1", duration: 3.14159)

        let media = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(Float(media?.duration ?? 0), 3.142, accuracy: 0.0001,
                       "setClipDuration must quantise to 3 decimal places")
        XCTAssertTrue(sut.canUndo, "precise duration edits push a TrimClipCommand")
    }

    func test_setClipDuration_nonPositive_isRejected() async {
        let (sut, _) = makeSUT(startTime: 0, duration: 5)
        await sut.awaitConfigured()

        sut.setClipDuration(id: "clip-1", duration: 0)
        sut.setClipDuration(id: "clip-1", duration: -1)

        let media = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(Float(media?.duration ?? 0), 5.0, accuracy: 0.0001,
                       "Zero / negative durations must be rejected (would crash AVPlayer)")
    }

    func test_setClipDuration_extendsSlideDuration() async {
        let (sut, _) = makeSUT(startTime: 4, duration: 3, slideDuration: 10)
        await sut.awaitConfigured()

        // Extend to 8s so the tail (4 + 8 = 12) outruns the current 10s ceiling.
        sut.setClipDuration(id: "clip-1", duration: 8)

        XCTAssertEqual(sut.project.slideDuration, 12.0, accuracy: 0.001,
                       "Auto-extend must follow precise-duration edits")
    }

    // MARK: - dragClipMoved quantisation

    func test_dragClipMoved_quantizesRawTimeToMillisecond() async {
        let (sut, _) = makeSUT(startTime: 0)
        await sut.awaitConfigured()

        sut.beginClipDrag(clipId: "clip-1")
        // Sub-ms input — must snap to the 0.001s grid before the snap engine
        // and the engine setter see it.
        sut.dragClipMoved(rawTime: 1.234567, snapCandidates: [])
        sut.endClipDrag()

        let media = sut.project.mediaObjects.first { $0.id == "clip-1" }
        XCTAssertEqual(Float(media?.startTime ?? 0), 1.235, accuracy: 0.0001,
                       "Drag input must be quantised to 0.001s")
    }
}
