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

    func test_backgroundVideoIndex_findsTheBackgroundVideo() {
        let medias = [video(id: "fg", background: false), video(id: "bg", background: true)]
        XCTAssertEqual(StoryComposerView.backgroundVideoIndex(in: medias), 1)
    }

    func test_backgroundVideoIndex_ignoresForegroundVideos() {
        let medias = [video(id: "fg1", background: false), video(id: "fg2", background: false)]
        XCTAssertNil(StoryComposerView.backgroundVideoIndex(in: medias))
    }

    func test_backgroundVideoIndex_ignoresBackgroundImage() {
        // Une image de fond n'a pas de son : lui poser un bouton de coupure
        // serait un contrôle inerte.
        XCTAssertNil(StoryComposerView.backgroundVideoIndex(in: [image(id: "bg", background: true)]))
    }

    func test_backgroundVideoIndex_multipleBackgrounds_returnsTheFirstOnly() {
        // Le modèle ne contraint pas l'unicité du fond. Rendre un tableau
        // superposerait deux boutons au même coin du canvas.
        let medias = [video(id: "bg1", background: true), video(id: "bg2", background: true)]
        XCTAssertEqual(StoryComposerView.backgroundVideoIndex(in: medias), 0)
    }

    func test_backgroundVideoIndex_emptyList_isNil() {
        XCTAssertNil(StoryComposerView.backgroundVideoIndex(in: []))
    }

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
}
