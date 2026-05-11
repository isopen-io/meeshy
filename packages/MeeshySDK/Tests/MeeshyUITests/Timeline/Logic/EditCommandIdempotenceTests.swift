import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Integration sweep: verifies that for every concrete EditCommand,
/// the cycle `apply -> revert -> apply` returns the project to the same
/// state as `apply` alone (i.e., revert is a true inverse of apply).
///
/// This is what CommandStack.undo() relies on: undoing then redoing must
/// yield the same project state.
///
/// Field names below match Plan 1's actual init signatures (StoryModels.swift),
/// not the placeholder names in the original plan draft.
final class EditCommandIdempotenceTests: XCTestCase {

    // MARK: - Factories

    private func makeBaseProject(slideId: String = "s1",
                                 slideDuration: Float = 10) -> TimelineProject {
        var p = TimelineProject(
            slideId: slideId,
            slideDuration: slideDuration,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
        p.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm1",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 0, duration: 5),
            StoryMediaObject(id: "v2", postMediaId: "pm2",
                             mediaType: "video", placement: "media",
                             aspectRatio: 1.0,
                             startTime: 5, duration: 5)
        ]
        p.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pma",
                                   placement: "overlay", volume: 1.0,
                                   waveformSamples: [],
                                   startTime: 0, duration: 5)
        ]
        p.textObjects = [
            StoryTextObject(id: "t1", text: "hi",
                            startTime: 1, duration: 3)
        ]
        return p
    }

    /// Encodes a project to JSON for stable equality check via byte comparison.
    private func canonicalJSON(_ project: TimelineProject) throws -> Data {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return try enc.encode(project)
    }

    /// Asserts apply -> revert -> apply produces the same final state as apply alone.
    private func assertRoundTrip(_ command: AnyEditCommand,
                                 base: TimelineProject,
                                 file: StaticString = #filePath,
                                 line: UInt = #line) throws {
        var directApply = base
        try command.underlying.apply(to: &directApply)
        let directJSON = try canonicalJSON(directApply)

        var roundTrip = base
        try command.underlying.apply(to: &roundTrip)
        try command.underlying.revert(from: &roundTrip)
        try command.underlying.apply(to: &roundTrip)
        let roundTripJSON = try canonicalJSON(roundTrip)

        XCTAssertEqual(directJSON, roundTripJSON,
                       "apply -> revert -> apply must equal apply",
                       file: file, line: line)

        var pingPong = base
        try command.underlying.apply(to: &pingPong)
        try command.underlying.revert(from: &pingPong)
        let pingPongJSON = try canonicalJSON(pingPong)
        let baseJSON = try canonicalJSON(base)
        XCTAssertEqual(pingPongJSON, baseJSON,
                       "revert must be the inverse of apply",
                       file: file, line: line)
    }

    // MARK: - 12 commands

    func test_addClipCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .addClip(AddClipCommand(
            clipId: "v3", postMediaId: "pm3", kind: .video,
            startTime: 7, duration: 2
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_deleteClipCommand_applyRevertRoundTrip() throws {
        let base = makeBaseProject()
        let cmd: AnyEditCommand = .deleteClip(DeleteClipCommand(
            clipId: "v1", kind: .video,
            snapshotMedia: base.mediaObjects[0],
            snapshotAudio: nil,
            snapshotText: nil,
            insertionIndex: 0
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_moveClipCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .moveClip(MoveClipCommand(
            clipId: "v1", kind: .video,
            oldStartTime: 0, newStartTime: 3
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_trimClipCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .trimClip(TrimClipCommand(
            clipId: "v1", kind: .video,
            oldStartTime: 0, oldDuration: 5,
            newStartTime: 1, newDuration: 4
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_splitClipCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .splitClip(SplitClipCommand(
            clipId: "v1", kind: .video,
            splitAtRelativeTime: 2.5,
            leftId: "v1L",
            rightId: "v1R"
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_addTransitionCommand_applyRevertRoundTrip() throws {
        let transition = StoryClipTransition(
            id: "tr1", fromClipId: "v1", toClipId: "v2",
            kind: .crossfade, duration: 0.5
        )
        let cmd: AnyEditCommand = .addTransition(AddTransitionCommand(transition: transition))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_removeTransitionCommand_applyRevertRoundTrip() throws {
        let transition = StoryClipTransition(
            id: "tr1", fromClipId: "v1", toClipId: "v2",
            kind: .crossfade, duration: 0.5
        )
        var base = makeBaseProject()
        base.clipTransitions = [transition]
        let cmd: AnyEditCommand = .removeTransition(RemoveTransitionCommand(
            transitionId: "tr1",
            snapshot: transition,
            insertionIndex: 0
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_changeTransitionCommand_applyRevertRoundTrip() throws {
        let oldT = StoryClipTransition(id: "tr1", fromClipId: "v1", toClipId: "v2",
                                       kind: .crossfade, duration: 0.5)
        let newT = StoryClipTransition(id: "tr1", fromClipId: "v1", toClipId: "v2",
                                       kind: .dissolve, duration: 1.0)
        var base = makeBaseProject()
        base.clipTransitions = [oldT]
        let cmd: AnyEditCommand = .changeTransition(ChangeTransitionCommand(
            transitionId: "tr1",
            previous: oldT,
            updated: newT
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_addKeyframeCommand_applyRevertRoundTrip() throws {
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        let cmd: AnyEditCommand = .addKeyframe(AddKeyframeCommand(
            clipId: "v1",
            kind: .video,
            keyframe: kf
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_moveKeyframeCommand_applyRevertRoundTrip() throws {
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        var base = makeBaseProject()
        base.mediaObjects[0].keyframes = [kf]
        let cmd: AnyEditCommand = .moveKeyframe(MoveKeyframeCommand(
            clipId: "v1",
            kind: .video,
            keyframeId: "kf1",
            oldTime: 1.0,
            newTime: 2.0
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_deleteKeyframeCommand_applyRevertRoundTrip() throws {
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        var base = makeBaseProject()
        base.mediaObjects[0].keyframes = [kf]
        let cmd: AnyEditCommand = .deleteKeyframe(DeleteKeyframeCommand(
            clipId: "v1",
            kind: .video,
            keyframeId: "kf1",
            snapshot: kf,
            insertionIndex: 0
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_setClipPropertyCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .setClipProperty(SetClipPropertyCommand(
            clipId: "a1",
            kind: .audio,
            property: .volume(old: 1.0, new: 0.5)
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }
}
