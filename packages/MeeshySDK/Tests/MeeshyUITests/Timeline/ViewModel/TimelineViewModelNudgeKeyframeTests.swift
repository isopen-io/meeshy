import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// `moveKeyframe(clipId:keyframeId:newTime:)` existait — et n'avait AUCUN
/// appelant. Toutes les surfaces d'édition passaient par la surcharge
/// « propriétés », qui code en dur `newTime: snapshot.time` : position,
/// échelle, opacité et easing étaient réglables, mais l'INSTANT du keyframe
/// était figé à celui de sa pose. Un keyframe mal placé ne pouvait que se
/// supprimer et se reposer.
@MainActor
final class TimelineViewModelNudgeKeyframeTests: XCTestCase {

    private func makeSUT(clipStart: Double = 2, clipDuration: Double = 6,
                         keyframeTimes: [Float] = [1]) async -> TimelineViewModel {
        var m = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        m.startTime = clipStart
        m.duration = clipDuration
        m.keyframes = keyframeTimes.enumerated().map { index, t in
            StoryKeyframe(id: "kf\(index)", time: t)
        }
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 20,
                                              mediaObjects: [m], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    private func time(of keyframeId: String, in vm: TimelineViewModel) -> Float? {
        vm.project.mediaObjects.first?.keyframes?.first(where: { $0.id == keyframeId })?.time
    }

    // MARK: - Le défaut

    func test_nudge_movesTheKeyframeInTime() async {
        let sut = await makeSUT(keyframeTimes: [1])

        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf0", by: 0.5)

        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 1.5, accuracy: 0.0001,
                       "L'instant d'un keyframe doit être réglable, pas figé à sa pose.")
    }

    func test_nudgeBackwards_movesTheKeyframeEarlier() async {
        let sut = await makeSUT(keyframeTimes: [2])
        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf0", by: -0.5)
        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 1.5, accuracy: 0.0001)
    }

    // MARK: - Bornes : un keyframe reste DANS la fenêtre de son clip

    /// Un keyframe hors de la fenêtre de son clip ne serait jamais interpolé :
    /// il disparaîtrait de la lecture tout en restant listé.
    func test_nudgeBeforeTheClipStart_clampsToZero() async {
        let sut = await makeSUT(clipStart: 2, clipDuration: 6, keyframeTimes: [0.2])
        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf0", by: -1)
        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 0, accuracy: 0.0001)
    }

    func test_nudgePastTheClipEnd_clampsToTheClipDuration() async {
        let sut = await makeSUT(clipStart: 2, clipDuration: 6, keyframeTimes: [5.8])
        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf0", by: 1)
        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 6, accuracy: 0.0001,
                       "La borne haute est la durée du clip, pas celle de la slide.")
    }

    // MARK: - No-op et entrées invalides

    func test_nudgeAtTheBoundary_pushesNoCommand() async {
        let sut = await makeSUT(keyframeTimes: [0])
        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf0", by: -0.5)
        XCTAssertFalse(sut.canUndo)
    }

    func test_nudgeWithANonFiniteDelta_isIgnored() async {
        let sut = await makeSUT(keyframeTimes: [1])
        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf0", by: .infinity)
        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 1, accuracy: 0.0001)
        XCTAssertFalse(sut.canUndo)
    }

    func test_nudgeOnAnUnknownKeyframe_isIgnored() async {
        let sut = await makeSUT(keyframeTimes: [1])
        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "ghost", by: 0.5)
        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 1, accuracy: 0.0001)
        XCTAssertFalse(sut.canUndo)
    }

    // MARK: - Historique

    func test_nudgeIsUndoable_andRedoable() async {
        let sut = await makeSUT(keyframeTimes: [1])

        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf0", by: 0.5)
        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 1.5, accuracy: 0.0001)

        sut.undo()
        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 1, accuracy: 0.0001)

        sut.redo()
        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 1.5, accuracy: 0.0001)
    }

    /// Déplacer un keyframe ne doit toucher QUE lui — les autres gardent leur
    /// instant, sinon toute l'animation dériverait.
    func test_nudgeLeavesTheOtherKeyframesWhereTheyAre() async {
        let sut = await makeSUT(keyframeTimes: [1, 3, 5])

        sut.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf1", by: 0.5)

        XCTAssertEqual(time(of: "kf0", in: sut) ?? -1, 1, accuracy: 0.0001)
        XCTAssertEqual(time(of: "kf1", in: sut) ?? -1, 3.5, accuracy: 0.0001)
        XCTAssertEqual(time(of: "kf2", in: sut) ?? -1, 5, accuracy: 0.0001)
    }

    /// Les propriétés du keyframe survivent au déplacement temporel : on
    /// déplace l'instant, on ne réinitialise pas l'animation.
    func test_nudgePreservesTheKeyframeProperties() async {
        var m = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        m.startTime = 0
        m.duration = 6
        m.keyframes = [StoryKeyframe(id: "kf0", time: 1, x: 0.25, y: 0.75, scale: 2, opacity: 0.5)]
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 20,
                                              mediaObjects: [m], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()

        vm.nudgeKeyframeTime(clipId: "m1", keyframeId: "kf0", by: 0.5)

        let kf = vm.project.mediaObjects.first?.keyframes?.first
        XCTAssertEqual(kf?.time ?? -1, 1.5, accuracy: 0.0001)
        XCTAssertEqual(kf?.x ?? -1, 0.25, accuracy: 0.0001)
        XCTAssertEqual(kf?.y ?? -1, 0.75, accuracy: 0.0001)
        XCTAssertEqual(kf?.scale ?? -1, 2, accuracy: 0.0001)
        XCTAssertEqual(kf?.opacity ?? -1, 0.5, accuracy: 0.0001)
    }
}
