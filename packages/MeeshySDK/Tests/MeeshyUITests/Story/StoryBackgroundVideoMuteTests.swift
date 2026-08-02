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

    // MARK: - Garde de source du montage

    /// Une vue SwiftUI ne s'inspecte pas : on ancre le câblage sur le texte de
    /// la source, commentaires retirés — sans ce filtrage, une simple mention
    /// du nom en prose suffirait à faire passer la garde.
    ///
    /// Quatre `deletingLastPathComponent` depuis `Tests/MeeshyUITests/Story/`
    /// pour atteindre la racine du paquet. Ce nombre se COMPTE depuis le
    /// fichier réel, il ne se recopie pas : un test un niveau plus bas en
    /// demanderait cinq, et un compte erroné ne rougit pas — il fait passer la
    /// garde par son `XCTSkip`.
    func test_videoMuteOverlay_mountsTheBackgroundButton() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
        let file = root.appendingPathComponent(
            "Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift")
        guard let raw = try? String(contentsOf: file, encoding: .utf8) else {
            throw XCTSkip("source introuvable : \(file.path)")
        }
        let code = raw
            .replacingOccurrences(of: "(?s)/\\*.*?\\*/", with: "", options: .regularExpression)
            .replacingOccurrences(of: "(?m)//.*$", with: "", options: .regularExpression)

        XCTAssertTrue(code.contains("var backgroundVideoBinding"),
                      "le binding du fond doit exister")

        // Le binding doit être CONSOMMÉ par l'overlay, pas seulement déclaré.
        guard let overlayStart = code.range(of: "var videoMuteOverlay")?.lowerBound else {
            return XCTFail("videoMuteOverlay introuvable")
        }
        let overlay = String(code[overlayStart...].prefix(900))
        XCTAssertTrue(overlay.contains("backgroundVideoBinding"),
                      "videoMuteOverlay doit monter le bouton du fond")
    }
}
