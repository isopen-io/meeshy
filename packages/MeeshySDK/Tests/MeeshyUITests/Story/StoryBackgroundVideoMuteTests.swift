import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La vidéo de FOND — le cas le plus courant — n'avait aucun bouton de coupure
/// du son : `foregroundVideoBindings` filtre sur `isBackground == false`
/// (`StoryComposerView+Canvas.swift`). Son volume était pourtant bien lu au
/// rendu (`StoryCanvasUIView+Rendering.swift`), donc il ne manquait que
/// l'affordance.
final class StoryBackgroundVideoMuteTests: XCTestCase {

    private func video(id: String, background: Bool) -> StoryMediaObject {
        StoryMediaObject(id: id, kind: .video, aspectRatio: 1.0,
                         volume: 1.0, isBackground: background)
    }

    private func image(id: String, background: Bool) -> StoryMediaObject {
        StoryMediaObject(id: id, kind: .image, aspectRatio: 1.0,
                         volume: 1.0, isBackground: background)
    }

    // MARK: - Résolution pure du fond vidéo

    // MARK: - Le toggle atteint bien le modèle du fond

    func test_toggleMute_onBackgroundVideo_silencesAndRestores() {
        var bg = video(id: "bg", background: true)
        bg.volume = 0.8
        bg.toggleMute()
        XCTAssertEqual(bg.volume, 0)
        XCTAssertEqual(bg.mutedVolumeMemento, 0.8)
        bg.toggleMute()
        XCTAssertEqual(bg.volume, 0.8, accuracy: 0.001,
                       "l'unmute restaure le niveau de l'auteur, il ne force pas 1.0")
        XCTAssertNil(bg.mutedVolumeMemento)
    }

    // MARK: - Garde de source du montage

}
