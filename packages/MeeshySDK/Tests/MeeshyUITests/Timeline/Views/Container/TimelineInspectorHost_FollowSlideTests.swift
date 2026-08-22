import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// `resolveClipSnapshot` porte `isFollowingSlide` (D3) — vrai UNIQUEMENT
/// quand `startTime` ET `duration` sont `nil` au modèle (O4 : `timing == nil`
/// dit « suit la slide »), jamais un défaut déguisé en choix. Même règle,
/// vérifiée sur les quatre familles temporisées, que `Plan2DLayout.bar(...)`
/// (D1) applique côté plan.
@MainActor
final class TimelineInspectorHostFollowSlideTests: XCTestCase {

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    func test_resolveClipSnapshot_media_withExplicitTiming_isNotFollowingSlide() {
        var media = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        media.startTime = 1; media.duration = 3
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [media], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let vm = makeViewModel(project: project)
        vm.selectClip(id: "m1")
        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?.isFollowingSlide, false)
    }

    func test_resolveClipSnapshot_media_withoutTiming_isFollowingSlide() {
        let media = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [media], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let vm = makeViewModel(project: project)
        vm.selectClip(id: "m1")
        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?.isFollowingSlide, true)
    }

    func test_resolveClipSnapshot_audio_withoutTiming_isFollowingSlide() {
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "a1")
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [], audioPlayerObjects: [audio],
                                      textObjects: [], clipTransitions: [])
        let vm = makeViewModel(project: project)
        vm.selectClip(id: "a1")
        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?.isFollowingSlide, true)
    }

    func test_resolveClipSnapshot_text_withoutTiming_isFollowingSlide() {
        let text = StoryTextObject(id: "t1", text: "Salut")
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [], audioPlayerObjects: [],
                                      textObjects: [text], clipTransitions: [])
        let vm = makeViewModel(project: project)
        vm.selectClip(id: "t1")
        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?.isFollowingSlide, true)
    }

    func test_resolveClipSnapshot_sticker_withExplicitTiming_isNotFollowingSlide() {
        var sticker = StorySticker(id: "st1", emoji: "☺")
        sticker.startTime = 0; sticker.duration = 2
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [], audioPlayerObjects: [],
                                      textObjects: [], stickerObjects: [sticker],
                                      clipTransitions: [])
        let vm = makeViewModel(project: project)
        vm.selectClip(id: "st1")
        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?.isFollowingSlide, false)
    }

    /// Un DÉBUT posé sans durée est un choix (court jusqu'à la fin de la
    /// slide) — pas un fantôme. `isFollowingSlide` doit rester `false`.
    func test_resolveClipSnapshot_startWithoutDuration_isNotFollowingSlide() {
        var media = StoryMediaObject(id: "m1", postMediaId: "m1", kind: .video, aspectRatio: 1.0)
        media.startTime = 4
        let project = TimelineProject(slideId: "s", slideDuration: 10,
                                      mediaObjects: [media], audioPlayerObjects: [],
                                      textObjects: [], clipTransitions: [])
        let vm = makeViewModel(project: project)
        vm.selectClip(id: "m1")
        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?.isFollowingSlide, false)
    }
}
