import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Mute UN-BOUTON depuis la timeline : `toggleClipMute(id:)` écrit le MODÈLE
/// (`volume` 0 = muet, mémento de restauration) via la commande `.volume` —
/// donc undoable, et rejoué par l'engine au reconfigure.
@MainActor
final class TimelineViewModelMuteToggleTests: XCTestCase {

    private func makeSUT(project: TimelineProject) -> TimelineViewModel {
        let sut = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return sut
    }

    private func videoProject(volume: Float) -> TimelineProject {
        var media = StoryMediaObject(id: "clip-1", postMediaId: "clip-1", kind: .video, aspectRatio: 1.0)
        media.startTime = 0
        media.duration = 5
        media.volume = volume
        return TimelineProject(
            slideId: "slide-1", slideDuration: 10,
            mediaObjects: [media], audioPlayerObjects: [],
            textObjects: [], clipTransitions: []
        )
    }

    private func audioProject(volume: Float) -> TimelineProject {
        var audio = StoryAudioPlayerObject(id: "audio-1", postMediaId: "audio-1", volume: volume)
        audio.startTime = 0
        audio.duration = 4
        return TimelineProject(
            slideId: "slide-1", slideDuration: 10,
            mediaObjects: [], audioPlayerObjects: [audio],
            textObjects: [], clipTransitions: []
        )
    }

    func test_toggleClipMute_video_silencesThenRestoresAuthorLevel() async {
        let sut = makeSUT(project: videoProject(volume: 0.6))
        await sut.awaitConfigured()

        sut.toggleClipMute(id: "clip-1")
        XCTAssertEqual(sut.project.mediaObjects[0].volume, 0)
        XCTAssertEqual(sut.project.mediaObjects[0].mutedVolumeMemento, 0.6)

        sut.toggleClipMute(id: "clip-1")
        XCTAssertEqual(sut.project.mediaObjects[0].volume, 0.6, accuracy: 0.001,
                       "le second tap doit RESTAURER 0.6, pas forcer 1.0")
        XCTAssertNil(sut.project.mediaObjects[0].mutedVolumeMemento)
    }

    func test_toggleClipMute_audio_silencesThenRestoresAuthorLevel() async {
        let sut = makeSUT(project: audioProject(volume: 0.45))
        await sut.awaitConfigured()

        sut.toggleClipMute(id: "audio-1")
        XCTAssertEqual(sut.project.audioPlayerObjects[0].volume, 0)

        sut.toggleClipMute(id: "audio-1")
        XCTAssertEqual(sut.project.audioPlayerObjects[0].volume, 0.45, accuracy: 0.001)
    }

    func test_toggleClipMute_isUndoable() async {
        let sut = makeSUT(project: videoProject(volume: 0.7))
        await sut.awaitConfigured()

        sut.toggleClipMute(id: "clip-1")
        XCTAssertTrue(sut.canUndo)
        sut.undo()
        XCTAssertEqual(sut.project.mediaObjects[0].volume, 0.7, accuracy: 0.001)
        XCTAssertNil(sut.project.mediaObjects[0].mutedVolumeMemento)
    }

    func test_toggleClipMute_imageClip_isNoOp() async {
        var image = StoryMediaObject(id: "img-1", postMediaId: "img-1", kind: .image, aspectRatio: 1.0)
        image.startTime = 0
        image.duration = 3
        let project = TimelineProject(
            slideId: "slide-1", slideDuration: 10,
            mediaObjects: [image], audioPlayerObjects: [],
            textObjects: [], clipTransitions: []
        )
        let sut = makeSUT(project: project)
        await sut.awaitConfigured()

        sut.toggleClipMute(id: "img-1")
        XCTAssertFalse(sut.canUndo, "une image n'a rien à couper — aucune commande poussée")
        XCTAssertEqual(sut.project.mediaObjects[0].volume, 1.0)
    }

    func test_muteFromTimeline_isVisibleToLaneBadgeResolver() async {
        let sut = makeSUT(project: audioProject(volume: 1.0))
        await sut.awaitConfigured()

        sut.toggleClipMute(id: "audio-1")
        let audio = sut.project.audioPlayerObjects[0]
        XCTAssertTrue(TimelineInspectorHost.isMutedForAudio(globalMute: false, audio: audio),
                      "la barre audio doit afficher l'état coupé dès le tap")
    }
}
