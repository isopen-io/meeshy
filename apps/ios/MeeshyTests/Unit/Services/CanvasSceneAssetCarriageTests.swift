import XCTest
import MeeshySDK
@testable import Meeshy

/// **#8521 — le son de fond et le sticker de bibliothèque d'un post partent AVEC
/// leur fichier, pré-téléversement abouti ou non.**
///
/// Le canal document ne téléverse que `localMedia`. Un son posé sur la scène ou
/// un sticker importé n'y figuraient pas : ils ne partaient que si la pré-montée
/// avait abouti. Hors ligne, en échec, ou sous le seuil de la pré-montée, le
/// `file://` du son était annulé par le sanitizer et le sticker retombait sur
/// son emoji — une publication amputée, sans que rien ne le dise.
///
/// Le brouillon durable emporte désormais ces fichiers (`ComposerSceneAssetCarriage`)
/// et le canvas ADOPTE leurs identités serveur (`CanvasMediaAdoption.adopting`),
/// exactement comme les médias visuels.
final class CanvasSceneAssetCarriageTests: XCTestCase {

    // MARK: - Fabriques

    private func son(_ id: String, postMediaId: String = "", url: String?) -> StoryAudioPlayerObject {
        var o = StoryAudioPlayerObject(id: id, postMediaId: postMediaId, name: "Son")
        o.mediaURL = url
        return o
    }

    private func slide(sons: [StoryAudioPlayerObject] = [], stickers: [StorySticker] = []) -> StorySlide {
        var s = StorySlide()
        s.effects.audioPlayerObjects = sons.isEmpty ? nil : sons
        s.effects.stickerObjects = stickers.isEmpty ? nil : stickers
        return s
    }

    // MARK: - Ce que le brouillon doit emporter

    func test_pending_sonLocalNonMonte_estEmporte() {
        let slides = [slide(sons: [son("son-1", url: "file:///tmp/son-1.m4a")])]
        XCTAssertEqual(ComposerSceneAssetCarriage.pending(slides: slides, stickerBitmapIds: []),
                       [.init(objectId: "son-1", source: .file(URL(fileURLWithPath: "/tmp/son-1.m4a")))])
    }

    func test_pending_sonDejaMonte_nEstPasEmporte() {
        let slides = [slide(sons: [son("son-1", postMediaId: "pm-1", url: "https://cdn/son.m4a")])]
        XCTAssertTrue(ComposerSceneAssetCarriage.pending(slides: slides, stickerBitmapIds: []).isEmpty)
    }

    func test_pending_sonEmprunteALaBibliotheque_nEstPasEmporte() {
        let slides = [slide(sons: [son("son-1", url: "https://cdn/bibliotheque.m4a")])]
        XCTAssertTrue(ComposerSceneAssetCarriage.pending(slides: slides, stickerBitmapIds: []).isEmpty)
    }

    func test_pending_stickerDeBibliothequeNonMonte_estEmporte_surToutesLesScenes() {
        let slides = [slide(),
                      slide(stickers: [StorySticker(id: "st-1", emoji: "🖼️")])]
        XCTAssertEqual(ComposerSceneAssetCarriage.pending(slides: slides, stickerBitmapIds: ["st-1"]),
                       [.init(objectId: "st-1", source: .stickerBitmap)])
    }

    func test_pending_stickerEmojiSansImage_nEstPasEmporte() {
        let slides = [slide(stickers: [StorySticker(id: "st-1", emoji: "🔥")])]
        XCTAssertTrue(ComposerSceneAssetCarriage.pending(slides: slides, stickerBitmapIds: []).isEmpty)
    }

    // MARK: - Le canvas adopte leurs identités serveur

    func test_adopting_sonSansAucunMediaVisuel_recoitSonIdentiteEtSonAdresse() {
        var effets = StoryEffects()
        effets.audioPlayerObjects = [son("son-1", url: "file:///tmp/son-1.m4a")]

        let adopte = CanvasMediaAdoption.adopting(effets,
                                                  objectIdsBySourceIndex: ["son-1"],
                                                  idsBySourceIndex: [0: "pm-son"],
                                                  urlsBySourceIndex: [0: "https://cdn/son-1.m4a"])

        XCTAssertEqual(adopte?.audioPlayerObjects?.first?.postMediaId, "pm-son")
        XCTAssertEqual(adopte?.audioPlayerObjects?.first?.mediaURL, "https://cdn/son-1.m4a")
        XCTAssertEqual(adopte?.sanitizedForServerPublish().audioPlayerObjects?.first?.mediaURL,
                       "https://cdn/son-1.m4a",
                       "Adopté, le son ne porte plus de file:// : le sanitizer n'a plus rien à annuler.")
    }

    func test_adopting_stickerDeBibliotheque_recoitSonIdentite() {
        var effets = StoryEffects()
        effets.stickerObjects = [StorySticker(id: "st-1", emoji: "🖼️")]

        let adopte = CanvasMediaAdoption.adopting(effets,
                                                  objectIdsBySourceIndex: [nil, "st-1"],
                                                  idsBySourceIndex: [0: "pm-photo", 1: "pm-sticker"],
                                                  urlsBySourceIndex: [:])

        XCTAssertEqual(adopte?.stickerObjects?.first?.postMediaId, "pm-sticker")
    }

    func test_adopting_sonDUneSceneSuivante_estAdopteDansLeCanvas() {
        var effets = StoryEffects()
        effets.canvasV3 = CanvasV3(v: 3, scenes: [
            SceneV3(id: "s2", objects: [
                ObjectV3(id: "son-2", kind: .audio, anchor: .free(x: 0.5, y: 0.5), plane: .content, z: 0,
                         transform: TransformV3(),
                         payload: ["postMediaId": .null, "mediaURL": .string("file:///tmp/son-2.m4a")])
            ])
        ])

        let adopte = CanvasMediaAdoption.adopting(effets,
                                                  objectIdsBySourceIndex: ["son-2"],
                                                  idsBySourceIndex: [0: "pm-son-2"],
                                                  urlsBySourceIndex: [0: "https://cdn/son-2.m4a"])

        let objet = adopte?.canvasV3?.scenes.first?.objects.first
        XCTAssertEqual(objet?.payload["postMediaId"], .string("pm-son-2"))
        XCTAssertEqual(objet?.payload["mediaURL"], .string("https://cdn/son-2.m4a"))
    }
}
