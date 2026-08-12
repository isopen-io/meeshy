import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// L'atténuation automatique était le seul réglage du chantier volume à ne pas
/// avoir de bascule : le facteur 0,25 s'imposait, sans recours. La fiche est
/// l'endroit où on la coupe.
@MainActor
final class ClipInspectorDuckingTests: XCTestCase {

    // MARK: - Garde pure

    func test_videoOnSlideWithBackgroundAudio_offersTheToggle() {
        XCTAssertTrue(ClipInspector.supportsDucking(kind: .video,
                                                    slideHasBackgroundAudio: true))
    }

    /// Sans audio de fond, rien n'est atténué : l'interrupteur ne changerait
    /// rien à ce qu'on entend.
    func test_withoutBackgroundAudio_theToggleIsHidden() {
        XCTAssertFalse(ClipInspector.supportsDucking(kind: .video,
                                                     slideHasBackgroundAudio: false))
    }

    /// Un audio n'est jamais atténué — c'est LUI qu'on protège.
    func test_audioClipNeverOffersTheToggle() {
        XCTAssertFalse(ClipInspector.supportsDucking(kind: .audio,
                                                     slideHasBackgroundAudio: true))
    }

    func test_imageClipNeverOffersTheToggle() {
        XCTAssertFalse(ClipInspector.supportsDucking(kind: .image,
                                                     slideHasBackgroundAudio: true))
    }

    // MARK: - Résolution depuis le projet

    private func makeViewModel(project: TimelineProject) -> TimelineViewModel {
        let vm = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    private func videoProject(duckingDisabled: Bool? = nil,
                              withBackgroundAudio: Bool = true) -> TimelineProject {
        var media = StoryMediaObject(id: "v1", postMediaId: "m1", kind: .video,
                                     aspectRatio: 9.0 / 16.0)
        media.isDuckingDisabled = duckingDisabled
        let audios = withBackgroundAudio
            ? [StoryAudioPlayerObject(id: "a1", postMediaId: "m2", isBackground: true)]
            : []
        return TimelineProject(slideId: "s1", slideDuration: 20,
                               mediaObjects: [media], audioPlayerObjects: audios)
    }

    func test_snapshotCarriesTheFlagAndTheSlideContext() {
        let vm = makeViewModel(project: videoProject(duckingDisabled: true))
        vm.selectClip(id: "v1")

        let snapshot = TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)
        XCTAssertEqual(snapshot?.isDuckingDisabled, true)
        XCTAssertEqual(snapshot?.slideHasBackgroundAudio, true)
    }

    /// `nil` en base se présente comme « atténuation active ».
    func test_snapshotReadsAbsentFlagAsDuckingEnabled() {
        let vm = makeViewModel(project: videoProject())
        vm.selectClip(id: "v1")

        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?
            .isDuckingDisabled, false)
    }

    /// Un audio d'AVANT-PLAN ne déclenche pas l'atténuation : le contexte que
    /// la fiche annonce doit correspondre à celui que le canvas applique.
    func test_foregroundAudioDoesNotCountAsBackgroundContext() {
        let project = TimelineProject(
            slideId: "s1", slideDuration: 20,
            mediaObjects: [StoryMediaObject(id: "v1", postMediaId: "m1", kind: .video,
                                            aspectRatio: 1.0)],
            audioPlayerObjects: [StoryAudioPlayerObject(id: "a1", postMediaId: "m2",
                                                        isBackground: false)]
        )
        let vm = makeViewModel(project: project)
        vm.selectClip(id: "v1")

        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?
            .slideHasBackgroundAudio, false)
    }

    // MARK: - Bout-en-bout depuis la fiche

    func test_togglingFromTheInspectorPersistsAndUndoes() {
        let vm = makeViewModel(project: videoProject())
        vm.selectClip(id: "v1")

        vm.setClipDuckingDisabled(id: "v1", isDisabled: true)
        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?
            .isDuckingDisabled, true)

        vm.undo()
        XCTAssertEqual(TimelineInspectorHost.resolveClipSnapshot(viewModel: vm)?
            .isDuckingDisabled, false)
    }

    /// Le ducking ne concerne pas les audios : la commande ne doit pas empiler
    /// une annulation qui ne défait rien.
    func test_audioClipIgnoresTheCommand() {
        let project = TimelineProject(
            slideId: "s1", slideDuration: 20,
            audioPlayerObjects: [StoryAudioPlayerObject(id: "a1", postMediaId: "m1")]
        )
        let vm = makeViewModel(project: project)
        let undoDepthBefore = vm.canUndo

        vm.setClipDuckingDisabled(id: "a1", isDisabled: true)
        XCTAssertEqual(vm.canUndo, undoDepthBefore)
    }
}

/// Le bloc doit être RÉELLEMENT monté. Le gate PNG de `ClipInspector` n'a pas
/// réagi à l'ajout du bloc d'automation (cf. plan du 2026-07-28) : on mesure
/// plutôt que de faire confiance à une référence d'image.
@MainActor
final class ClipInspectorDuckingMountedTests: XCTestCase {

    private func height(kind: ClipInspector.ClipSnapshot.Kind,
                        slideHasBackgroundAudio: Bool) -> CGFloat {
        let clip = ClipInspector.ClipSnapshot(
            id: "c1", displayName: "clip", kind: kind,
            startTime: 0, duration: 5, volume: 1,
            fadeInDuration: 0, fadeOutDuration: 0,
            isLooping: false, isBackground: false,
            slideHasBackgroundAudio: slideHasBackgroundAudio
        )
        let host = UIHostingController(rootView: ClipInspector(
            presentation: .sheet, clip: clip,
            onVolumeChanged: { _ in }, onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in }, onLoopToggled: { _ in },
            onBackgroundToggled: { _ in }, onAddKeyframe: {}, onDelete: {}
        ).frame(width: 360))
        return host.sizeThatFits(in: CGSize(width: 360,
                                            height: CGFloat.greatestFiniteMagnitude)).height
    }

    func test_backgroundAudioGrowsTheVideoInspector() {
        let without = height(kind: .video, slideHasBackgroundAudio: false)
        let with = height(kind: .video, slideHasBackgroundAudio: true)
        XCTAssertGreaterThan(with, without,
                             "sans=\(without) avec=\(with) — l'interrupteur n'est pas rendu")
    }

    /// Un clip audio ne gagne rien : il n'est jamais atténué.
    func test_audioInspectorIsUnchangedByTheSlideContext() {
        XCTAssertEqual(height(kind: .audio, slideHasBackgroundAudio: true),
                       height(kind: .audio, slideHasBackgroundAudio: false),
                       accuracy: 0.5)
    }
}
