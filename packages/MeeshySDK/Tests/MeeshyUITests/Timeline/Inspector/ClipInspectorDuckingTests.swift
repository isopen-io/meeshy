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

    // MARK: - Bout-en-bout depuis la fiche

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
