import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Chaque famille de la feuille se POSE sur la scène** (#9189) — emoji,
/// gabarit, lieu décoré, bibliothèque, et désormais Mee/Meo (film animé), les
/// Instants et les stickers de pack, que la scène ne savait pas recevoir.
///
/// Les poses passent par le VIEWMODEL (`currentEffects` est la seule source de
/// vérité de la scène) : c'est ce qu'éprouvent ces témoins, sans monter d'écran.
@MainActor
final class SceneStickerPoseTests: XCTestCase {

    private func stickers(_ vm: StoryComposerViewModel) -> [StorySticker] {
        vm.currentEffects.stickerObjects ?? []
    }

    func test_anEmoji_posesAStickerAtThePosedScale() throws {
        let vm = StoryComposerViewModel()
        let id = try XCTUnwrap(SceneStickerPose.pose(.emoji("🎉"), on: vm))
        let posé = try XCTUnwrap(stickers(vm).first { $0.id == id })
        XCTAssertEqual(posé.emoji, "🎉")
        XCTAssertEqual(posé.scale, StorySticker.posedScale)
    }

    func test_aTemplate_posesADecoration() throws {
        let vm = StoryComposerViewModel()
        let gabarit = try XCTUnwrap(StickerTemplateCatalog.templates(family: .love).first)
        let id = try XCTUnwrap(SceneStickerPose.pose(.template(gabarit, slots: [:]), on: vm))
        XCTAssertEqual(stickers(vm).first { $0.id == id }?.templateId, gabarit.id)
    }

    /// Un lieu décoré reste un `StoryLocationObject` : lui seul porte les
    /// coordonnées que la plateforme lit.
    func test_aDecoratedPlace_staysALocationObject() throws {
        let vm = StoryComposerViewModel()
        let gabarit = try XCTUnwrap(StickerTemplateCatalog.templates(family: .location).first)
        let lieu = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris")
        let id = try XCTUnwrap(SceneStickerPose.pose(.locationTemplate(lieu, gabarit), on: vm))
        XCTAssertTrue(vm.currentEffects.locationObjects.contains { $0.id == id })
        XCTAssertTrue(stickers(vm).isEmpty)
    }

    /// **Un Mee se pose ANIMÉ** : sa première image comme bitmap, et les octets
    /// du film sous le même id — sans eux, la scène le figerait.
    func test_aMee_posesItsStillAndItsFilm() throws {
        let vm = StoryComposerViewModel()
        let mee = try XCTUnwrap(MeeStickerCatalog.all.first { $0.animated })
        let id = try XCTUnwrap(SceneStickerPose.pose(.mee(mee), on: vm))
        let posé = try XCTUnwrap(stickers(vm).first { $0.id == id })
        XCTAssertEqual(posé.provider, SceneStickerPose.meeProvider)
        XCTAssertNotNil(vm.loadedImages[id], "la première image du film")
        XCTAssertNotNil(vm.loadedStickerAnimations[id], "le film, pour que la scène l'anime")
    }

    /// Un Instant se pose avec le texte saisi DESSINÉ dans son image.
    func test_anInstant_posesItsImageWithTheTypedText() throws {
        let vm = StoryComposerViewModel()
        let instant = try XCTUnwrap(MeeInstantCatalog.all.first)
        let id = try XCTUnwrap(SceneStickerPose.pose(.instant(instant, slots: [.message: "Coucou"]), on: vm))
        XCTAssertNotNil(vm.loadedImages[id])
        XCTAssertEqual(stickers(vm).first { $0.id == id }?.provider, SceneStickerPose.meeProvider)
    }

    /// Un sticker de pack attend ses octets : la pose synchrone ne rend rien,
    /// et rien n'est posé tant qu'ils ne sont pas là.
    func test_aPackSticker_waitsForItsBytes() {
        let vm = StoryComposerViewModel()
        let item = StickerPackItem(key: "a", title: "A", emoji: "✨", kind: .still,
                                   mimeType: "image/png", fileUrl: "/f/a.png", width: 1, height: 1)
        let pack = StickerPack(slug: "chats", name: "Chats", items: [item])
        XCTAssertNil(SceneStickerPose.pose(.packItem(pack, item), on: vm))
        XCTAssertTrue(stickers(vm).isEmpty)
    }

    /// Une fois chargé, un sticker CINÉMATIQUE garde son mouvement ; un fixe
    /// n'en porte aucun.
    func test_aLoadedPackSticker_keepsItsMotionOnlyWhenCinematic() throws {
        let vm = StoryComposerViewModel()
        let image = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).image { _ in }
        let octets = Data([0x52, 0x49, 0x46, 0x46])

        let anime = SceneStickerPose.posePackSticker(
            StickerPackItemImages.Loaded(image: image, data: octets, isAnimated: true), on: vm)
        let fixe = SceneStickerPose.posePackSticker(
            StickerPackItemImages.Loaded(image: image, data: octets, isAnimated: false), on: vm)

        XCTAssertEqual(vm.loadedStickerAnimations[anime], octets)
        XCTAssertNil(vm.loadedStickerAnimations[fixe])
        XCTAssertEqual(stickers(vm).first { $0.id == fixe }?.provider, SceneStickerPose.packProvider)
    }

    /// **Un sticker cinématique PART animé** (#9210) : le fichier du pack tel
    /// quel, avec son type — le contrat du web (`packStickerFile`). Réencodé en
    /// PNG depuis sa première image, il arrivait figé chez tout le monde. Un
    /// fixe garde le chemin PNG d'hier.
    func test_aCinematicPackSticker_sendsItsOriginalBytes_aStillOneItsPNG() {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).image { _ in }
        let octets = Data([0x47, 0x49, 0x46, 0x38])
        let anime = StickerPackItemImages.Loaded(image: image, data: octets, isAnimated: true,
                                                 mimeType: "image/gif")
        let fixe = StickerPackItemImages.Loaded(image: image, data: octets, isAnimated: false,
                                                mimeType: "image/png")
        XCTAssertEqual(anime.outgoingFile, StickerSendPipeline.OriginalFile(data: octets, mimeType: "image/gif"))
        XCTAssertNil(fixe.outgoingFile)
    }

    /// Le chargement d'un sticker de pack retient le type de son fichier : c'est
    /// lui qui nomme le fichier envoyé et qui part à l'upload.
    func test_packStickerLoading_keepsTheItemMimeType() throws {
        let code = try appSource("Meeshy/Features/Main/Composer/SceneStickerPose.swift")
        XCTAssertTrue(code.contains("isAnimated:item.isAnimated,mimeType:item.mimeType"),
                      "le chargement doit porter le genre et le type du fichier du pack")
        let envoi = try appSource("Meeshy/Features/Main/Views/ConversationView+StickerSheet.swift")
        XCTAssertTrue(envoi.contains("original:loaded.outgoingFile"),
                      "l'envoi d'un sticker de pack doit joindre le fichier d'origine quand il anime")
    }

    private func appSource(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }
}
