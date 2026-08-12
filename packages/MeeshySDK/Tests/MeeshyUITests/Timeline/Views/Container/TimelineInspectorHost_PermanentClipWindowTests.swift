import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Un clip PERMANENT (`duration == nil`) couvre la slide de son début jusqu'à
/// la fin — c'est la fenêtre que la piste dessine
/// (`TimelineGeometry.effectiveClipDuration`) et celle que le trim au doigt
/// matérialise.
///
/// L'inspecteur, lui, lisait `duration ?? 0` : sur un texte de 16 s il
/// affichait « DÉBUT 0,0 · FIN 0,0 · DURÉE 0,0 ». Trois mensonges d'un coup,
/// et un piège — un seul appui sur « + » de la durée faisait passer le clip
/// de 16 s à 0,1 s, alors que l'auteur croyait l'allonger.
///
/// La fiche doit donc annoncer la MÊME fenêtre que la piste.
@MainActor
final class TimelineInspectorHostPermanentClipWindowTests: XCTestCase {

    private static let slideDuration: Float = 16

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func project(mediaObjects: [StoryMediaObject] = [],
                         audioPlayerObjects: [StoryAudioPlayerObject] = [],
                         textObjects: [StoryTextObject] = []) -> TimelineProject {
        TimelineProject(
            slideId: "slide-1",
            slideDuration: Self.slideDuration,
            mediaObjects: mediaObjects,
            audioPlayerObjects: audioPlayerObjects,
            textObjects: textObjects,
            clipTransitions: []
        )
    }

    // MARK: - Texte

    func test_permanentText_reportsWindowUpToSlideEnd() {
        var text = StoryTextObject(id: "t1", text: "Salut la timeline")
        text.startTime = nil
        text.duration = nil
        let vm = makeViewModel(project: project(textObjects: [text]))
        vm.selectClip(id: "t1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)

        XCTAssertEqual(snapshot?.duration, Self.slideDuration)
    }

    func test_permanentTextStartingLate_reportsRemainingWindow() {
        var text = StoryTextObject(id: "t1", text: "Salut la timeline")
        text.startTime = 4
        text.duration = nil
        let vm = makeViewModel(project: project(textObjects: [text]))
        vm.selectClip(id: "t1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)

        XCTAssertEqual(snapshot?.startTime, 4)
        XCTAssertEqual(snapshot?.duration, Self.slideDuration - 4)
    }

    // MARK: - Média

    func test_permanentMedia_reportsWindowUpToSlideEnd() {
        var media = StoryMediaObject(id: "m1", postMediaId: "post-m1",
                                     kind: .image, aspectRatio: 1.0)
        media.startTime = nil
        media.duration = nil
        let vm = makeViewModel(project: project(mediaObjects: [media]))
        vm.selectClip(id: "m1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)

        XCTAssertEqual(snapshot?.duration, Self.slideDuration)
    }

    // MARK: - Audio

    func test_permanentAudio_reportsWindowUpToSlideEnd() {
        let audio = StoryAudioPlayerObject(
            id: "a1", postMediaId: "post-a1", placement: "overlay",
            x: 0.5, y: 0.8, volume: 0.8, waveformSamples: [],
            isBackground: false, backgroundAudioVariants: nil,
            startTime: 2, duration: nil, loop: false,
            fadeIn: 0, fadeOut: 0, sourceLanguage: nil
        )
        let vm = makeViewModel(project: project(audioPlayerObjects: [audio]))
        vm.selectClip(id: "a1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)

        XCTAssertEqual(snapshot?.duration, Self.slideDuration - 2)
    }

    // MARK: - Non-régression : une durée explicite reste intouchée

    func test_explicitDuration_isReportedVerbatim() {
        var media = StoryMediaObject(id: "m1", postMediaId: "post-m1",
                                     kind: .video, aspectRatio: 1.0)
        media.startTime = 1
        media.duration = 3
        let vm = makeViewModel(project: project(mediaObjects: [media]))
        vm.selectClip(id: "m1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)

        XCTAssertEqual(snapshot?.duration, 3)
    }
}
