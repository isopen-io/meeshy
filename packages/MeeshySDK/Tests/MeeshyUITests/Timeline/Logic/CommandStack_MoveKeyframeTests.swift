import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Coalescing + transform-edit coverage for `MoveKeyframeCommand` — the
/// command that backs `KeyframeInspector`'s position / scale / opacity /
/// easing commits in `ProTimelineView`.
///
/// The legacy time-only behaviour is already covered by
/// `StoryModelsExtensionsTests.test_moveKeyframeCommand_*` in MeeshySDKTests
/// — this suite focuses on the multi-axis extension and on the new
/// `CommandStack` coalesce branch that prevents a 60fps slider drag from
/// saturating the FIFO cap.
@MainActor
final class CommandStack_MoveKeyframeTests: XCTestCase {

    // MARK: - Factories

    private func makeProjectWithKeyframe(id keyframeId: String = "kf1",
                                          time: Float = 1.0,
                                          x: CGFloat? = 0.4,
                                          y: CGFloat? = 0.6,
                                          scale: CGFloat? = 1.0,
                                          opacity: CGFloat? = 1.0,
                                          easing: StoryEasing? = .linear) -> TimelineProject {
        let kf = StoryKeyframe(id: keyframeId, time: time,
                               x: x, y: y, scale: scale, opacity: opacity,
                               easing: easing)
        let media = StoryMediaObject(id: "v1", postMediaId: "pm",
                                     mediaType: "video", placement: "media",
                                     aspectRatio: 1.0,
                                     startTime: 0, duration: 5)
        var mediaWithKf = media
        mediaWithKf.keyframes = [kf]
        return TimelineProject(
            slideId: "s1", slideDuration: 5,
            mediaObjects: [mediaWithKf],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
    }

    private func makeMoveKfCmd(clipId: String = "v1",
                               keyframeId: String = "kf1",
                               oldTime: Float = 1.0,
                               newTime: Float = 1.0,
                               oldX: CGFloat? = nil, newX: CGFloat? = nil,
                               oldY: CGFloat? = nil, newY: CGFloat? = nil,
                               oldScale: CGFloat? = nil, newScale: CGFloat? = nil,
                               oldOpacity: CGFloat? = nil, newOpacity: CGFloat? = nil,
                               oldEasing: StoryEasing? = nil, newEasing: StoryEasing? = nil,
                               timestamp: Date = Date()) -> AnyEditCommand {
        .moveKeyframe(MoveKeyframeCommand(
            id: UUID().uuidString,
            timestamp: timestamp,
            clipId: clipId, kind: .video,
            keyframeId: keyframeId,
            oldTime: oldTime, newTime: newTime,
            oldX: oldX, newX: newX,
            oldY: oldY, newY: newY,
            oldScale: oldScale, newScale: newScale,
            oldOpacity: oldOpacity, newOpacity: newOpacity,
            oldEasing: oldEasing, newEasing: newEasing
        ))
    }

    // MARK: - Position push + apply

    func test_moveKeyframe_position_pushesCommand() throws {
        // Inspector commits position → CommandStack records a single
        // moveKeyframe with the old/new x+y pair; project state ends up at
        // the new position.
        var project = makeProjectWithKeyframe(x: 0.4, y: 0.6)
        let stack = CommandStack()

        let cmd = MoveKeyframeCommand(
            clipId: "v1", kind: .video, keyframeId: "kf1",
            oldTime: 1.0, newTime: 1.0,
            oldX: 0.4, newX: 0.8,
            oldY: 0.6, newY: 0.2
        )
        try cmd.apply(to: &project)
        stack.push(.moveKeyframe(cmd))

        XCTAssertEqual(stack.count, 1)
        XCTAssertTrue(stack.canUndo)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.x, 0.8)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.y, 0.2)
    }

    // MARK: - Revert restores old transforms

    func test_moveKeyframe_revert_restoresOldPosition() throws {
        var project = makeProjectWithKeyframe(x: 0.4, y: 0.6)
        let cmd = MoveKeyframeCommand(
            clipId: "v1", kind: .video, keyframeId: "kf1",
            oldTime: 1.0, newTime: 1.0,
            oldX: 0.4, newX: 0.8,
            oldY: 0.6, newY: 0.2
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.x, 0.8)

        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.x, 0.4)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.y, 0.6)
    }

    // MARK: - Coalescing — 60fps drag

    func test_moveKeyframe_coalesces_during_drag() {
        // Simulates a position-slider drag pushing 10 commands in <200ms
        // (≈60fps). Without coalescing, the FIFO cap (default 50) would be
        // saturated in <1s and earlier history would be evicted.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 4_000_000)
        for i in 0..<10 {
            let prevX: CGFloat = CGFloat(i) * 0.05
            let newX: CGFloat = CGFloat(i + 1) * 0.05
            stack.push(makeMoveKfCmd(
                oldX: prevX, newX: newX,
                oldY: 0.5,   newY: 0.5,
                timestamp: t0.addingTimeInterval(Double(i) * 0.016)
            ))
        }
        XCTAssertEqual(stack.count, 1)

        // The merged command must roll all the way back to the pre-drag x
        // and apply forward to the most recent x.
        let undone = stack.undo()
        guard case let .moveKeyframe(merged) = undone else {
            XCTFail("Expected coalesced moveKeyframe command")
            return
        }
        XCTAssertEqual(merged.oldX, 0.0)
        XCTAssertEqual(merged.newX, 0.5)
    }

    // MARK: - Independent axes — same axis coalesces, different axis doesn't accidentally clear

    func test_moveKeyframe_scale_opacity_eachIndependent() {
        // A scale edit followed by an opacity edit on the same keyframe within
        // the coalesce window MUST merge (same target, same kind), and the
        // merged command must preserve BOTH the scale delta and the opacity
        // delta — neither axis erases the other.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 5_000_000)
        stack.push(makeMoveKfCmd(
            oldScale: 1.0, newScale: 2.0,
            timestamp: t0
        ))
        stack.push(makeMoveKfCmd(
            oldOpacity: 1.0, newOpacity: 0.4,
            timestamp: t0.addingTimeInterval(0.05)
        ))
        XCTAssertEqual(stack.count, 1)

        let undone = stack.undo()
        guard case let .moveKeyframe(merged) = undone else {
            XCTFail("Expected coalesced moveKeyframe command")
            return
        }
        XCTAssertEqual(merged.oldScale, 1.0)
        XCTAssertEqual(merged.newOpacity, 0.4)
    }

    // MARK: - Coalescing only applies within same keyframe id

    func test_moveKeyframe_differentKeyframe_doesNotCoalesce() {
        // Two consecutive edits on different keyframe ids within the
        // coalesce window MUST stay as separate undo steps. The coalesce
        // branch in CommandStack must compare keyframeId, not only clipId.
        let stack = CommandStack(coalesceWindow: 0.5)
        let t0 = Date(timeIntervalSinceReferenceDate: 6_000_000)
        stack.push(makeMoveKfCmd(
            keyframeId: "kfA",
            oldX: 0.1, newX: 0.2,
            timestamp: t0
        ))
        stack.push(makeMoveKfCmd(
            keyframeId: "kfB",
            oldX: 0.3, newX: 0.4,
            timestamp: t0.addingTimeInterval(0.05)
        ))
        XCTAssertEqual(stack.count, 2)
    }

    // MARK: - Easing edit applies + reverts

    func test_moveKeyframe_easing_applyAndRevert() throws {
        var project = makeProjectWithKeyframe(easing: .linear)
        let cmd = MoveKeyframeCommand(
            clipId: "v1", kind: .video, keyframeId: "kf1",
            oldTime: 1.0, newTime: 1.0,
            oldEasing: .linear, newEasing: .easeOut
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.easing, .easeOut)

        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.easing, .linear)
    }

    // MARK: - Codable roundtrip preserves transform deltas

    func test_moveKeyframe_codableRoundTrip_preservesAllDeltas() throws {
        let cmd = MoveKeyframeCommand(
            clipId: "v1", kind: .video, keyframeId: "kf1",
            oldTime: 0.5, newTime: 0.5,
            oldX: 0.1, newX: 0.9,
            oldY: 0.2, newY: 0.8,
            oldScale: 1.0, newScale: 2.5,
            oldOpacity: 1.0, newOpacity: 0.3,
            oldEasing: .linear, newEasing: .easeIn
        )
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(MoveKeyframeCommand.self, from: data)

        XCTAssertEqual(decoded.newX, 0.9)
        XCTAssertEqual(decoded.oldY, 0.2)
        XCTAssertEqual(decoded.newScale, 2.5)
        XCTAssertEqual(decoded.newOpacity, 0.3)
        XCTAssertEqual(decoded.newEasing, .easeIn)
    }
}
