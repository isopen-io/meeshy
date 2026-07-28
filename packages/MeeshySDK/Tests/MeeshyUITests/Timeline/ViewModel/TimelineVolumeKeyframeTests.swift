import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Poser un point de volume réutilise les commandes annulables existantes :
/// l'annulation doit fonctionner sans une ligne de code dédiée.
@MainActor
final class TimelineVolumeKeyframeTests: XCTestCase {

    private func makeSUT() -> TimelineViewModel {
        let project = TimelineProject(
            slideId: "s1",
            slideDuration: 10,
            audioPlayerObjects: [StoryAudioPlayerObject(id: "a1", postMediaId: "m1")]
        )
        let sut = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    func test_addKeyframeAtPlayhead_storesVolumeOnlyPoint() {
        let sut = makeSUT()
        sut.selectClip(id: "a1")
        sut.scrub(to: 3)
        sut.addKeyframeAtPlayhead(volume: 0.4)

        let frames = sut.project.audioPlayerObjects.first(where: { $0.id == "a1" })?.keyframes
        XCTAssertEqual(frames?.count, 1)
        XCTAssertEqual(frames?.first?.volume, 0.4)
        XCTAssertNil(frames?.first?.x, "Un point de volume ne pose aucune transformation")
        XCTAssertNil(frames?.first?.scale)
    }

    func test_addKeyframeAtPlayhead_clampsToCeiling() {
        let sut = makeSUT()
        sut.selectClip(id: "a1")
        sut.scrub(to: 1)
        sut.addKeyframeAtPlayhead(volume: 9)

        let frames = sut.project.audioPlayerObjects.first(where: { $0.id == "a1" })?.keyframes
        XCTAssertEqual(frames?.first?.volume, StoryVolume.maxGain)
    }

    func test_addKeyframeAtPlayhead_onAudioIsUndoable() {
        let sut = makeSUT()
        sut.selectClip(id: "a1")
        sut.scrub(to: 3)
        sut.addKeyframeAtPlayhead(volume: 0.4)
        sut.undo()

        let frames = sut.project.audioPlayerObjects.first(where: { $0.id == "a1" })?.keyframes
        XCTAssertTrue(frames?.isEmpty ?? true)
    }

    /// `deleteKeyframe` retournait sans rien faire sur un clip audio : ses
    /// points auraient été impossibles à retirer.
    func test_deleteKeyframe_worksOnAudioClips() {
        let sut = makeSUT()
        sut.selectClip(id: "a1")
        sut.scrub(to: 1)
        sut.addKeyframeAtPlayhead(volume: 1.0)
        sut.scrub(to: 4)
        sut.addKeyframeAtPlayhead(volume: 0.2)

        guard let first = sut.project.audioPlayerObjects
            .first(where: { $0.id == "a1" })?.keyframes?.first else {
            return XCTFail("aucun point posé")
        }
        sut.deleteKeyframe(clipId: "a1", keyframeId: first.id)

        let frames = sut.project.audioPlayerObjects.first(where: { $0.id == "a1" })?.keyframes
        XCTAssertEqual(frames?.count, 1)
    }

    /// Les points posés doivent être lus par le resolver — c'est le lien entre
    /// l'édition et ce qu'on entend.
    func test_postedPointsDriveTheResolver() {
        let sut = makeSUT()
        sut.selectClip(id: "a1")
        sut.scrub(to: 0)
        sut.addKeyframeAtPlayhead(volume: 1.0)
        sut.scrub(to: 4)
        sut.addKeyframeAtPlayhead(volume: 0.0)

        let audio = sut.project.audioPlayerObjects.first(where: { $0.id == "a1" })
        let mid = StoryVolumeResolver.effectiveVolume(
            base: 1.0, keyframes: audio?.keyframes, at: 2
        )
        XCTAssertEqual(mid, 0.5, accuracy: 0.05)
    }
}
