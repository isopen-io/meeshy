import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Le strip compact hisse en tête la piste du clip sélectionné pour qu'elle
/// reste visible quand il y a plus de pistes que de places.
///
/// Il le faisait AUSSI quand tout tenait déjà à l'écran : sur une slide à deux
/// pistes pour trois places, sélectionner un clip suffisait à faire permuter
/// les deux lanes sous le doigt. Rien n'était gagné — la piste était déjà
/// visible — et le repère spatial de l'auteur sautait à chaque sélection.
@MainActor
final class StoryTimelineViewHoistOrderTests: XCTestCase {

    /// Deux pistes : une vidéo de FOND, un texte. L'ordre attendu est celui des
    /// sections — fond d'abord, avant-plan ensuite.
    private func twoTrackProject() -> TimelineProject {
        var video = StoryMediaObject(id: "v1", postMediaId: "v1",
                                     kind: .video, aspectRatio: 1.0)
        video.isBackground = true
        video.startTime = 0
        video.duration = 1
        return TimelineProject(slideId: "s", slideDuration: 16,
                               mediaObjects: [video],
                               audioPlayerObjects: [],
                               textObjects: [StoryTextObject(id: "t1", text: "Salut")],
                               clipTransitions: [])
    }

    private func ids(selectedClipId: String?, maxCount: Int) -> [String] {
        StoryTimelineView.resolveCompactTracks(project: twoTrackProject(),
                                               selectedClipId: selectedClipId,
                                               maxCount: maxCount).map(\.id)
    }

    func test_everythingFits_orderIsIndependentOfSelection() {
        let unselected = ids(selectedClipId: nil, maxCount: 3)

        XCTAssertEqual(ids(selectedClipId: "t1", maxCount: 3), unselected)
        XCTAssertEqual(ids(selectedClipId: "v1", maxCount: 3), unselected)
    }

    func test_everythingFits_sectionOrderIsPreserved() {
        XCTAssertEqual(ids(selectedClipId: "t1", maxCount: 3), ["bg-video-1", "text-1"])
    }

    /// La place manque : hisser reprend tout son sens, c'est la seule façon de
    /// garder sous les yeux la piste qu'on règle.
    func test_roomIsTight_selectedTrackIsStillHoisted() {
        XCTAssertEqual(ids(selectedClipId: "t1", maxCount: 1), ["text-1"])
    }
}
