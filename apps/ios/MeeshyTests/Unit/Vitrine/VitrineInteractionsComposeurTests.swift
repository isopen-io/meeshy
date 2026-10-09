import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Un sticker posé sur une scène du composeur (#9810) : le composeur s'ouvre depuis la rangée des stories, la photo du
/// kit entre comme le choix de la photothèque à l'ouverture, puis la porte du sticker s'ouvre par le rail et Mee et Meo
/// se posent par le choix même de la feuille.
@MainActor
final class VitrineInteractionsComposeurTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    private func fixtures() throws -> VitrineFixtures {
        try VitrineFixtures.decoder(Data(contentsOf: echantillon))
    }

    private var depot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ chemin: String) throws -> String {
        try String(contentsOf: depot.appendingPathComponent(chemin), encoding: .utf8)
    }

    func test_interactionSticker_parses_andWaitsForTheComposer() {
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "interaction-sticker"]), .interactionSticker)
        XCTAssertEqual(VitrineScene.interactionSticker.interaction, .sticker)
        XCTAssertTrue(VitrineScene.interactionSticker.ouvreUneSession)
        XCTAssertEqual(VitrineScene.interactionSticker.rendusAttendus(conversationId: nil, appareil: .iphone), [.composeur])
        XCTAssertEqual(VitrineScene.interactionSticker.rendusAttendus(conversationId: nil, appareil: .ipad), [.composeur])
    }

    /// La scène porte la photo du post le plus récent du kit — un portrait, fait pour la scène 9:16.
    func test_photoDeLaScene_isTheKitPostPhoto() throws {
        let f = try fixtures()
        let photo = try XCTUnwrap(VitrineInteractions.photoDeLaScene(f, dossier: URL(fileURLWithPath: "/medias")))
        let attendue = try XCTUnwrap(f.posts.first?.media?.first?.fileName)
        XCTAssertEqual(photo, URL(fileURLWithPath: "/medias").appendingPathComponent(attendue))
        XCTAssertEqual(photo.pathExtension, "jpg")
    }

    /// Mee et Meo ensemble : le sticker de la marque, celui que la feuille propose dans son onglet « duo ».
    func test_stickerDeLaScene_isAMeeAndMeoDuo() throws {
        guard case .mee(let sticker) = try XCTUnwrap(VitrineInteractions.stickerDeLaScene) else {
            return XCTFail("le sticker de la scène est un sticker Mee")
        }
        XCTAssertEqual(sticker.tab, .duo)
    }

    /// La porte s'ouvre par le rail (`handleRailDoor(.sticker)`), le choix passe par la fonction même de la feuille.
    func test_sticker_opensAndPicksThroughTheComposerItself() throws {
        let pickers = try source("apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Pickers.swift")
        XCTAssertEqual(pickers.components(separatedBy: "choisirDansLesStickers").count - 1, 3,
                       "la feuille et la vitrine choisissent par la même fonction, déclarée une fois")
        XCTAssertTrue(pickers.contains("VitrineRendu.shared.composeurAffiche { handleRailDoor(.sticker) }"))
        XCTAssertTrue(pickers.contains("openingPickFoundsScenes = true"), "la photo entre comme le choix d'ouverture")
        let portails = try source("apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Portals.swift")
        XCTAssertTrue(portails.contains(".onAppear { preterLeComposeurALaVitrine() }"))
    }

    func test_rendu_relaysTheComposerGestures_andHandsThePhotoOnce() {
        let rendu = VitrineRendu(actif: true)
        rendu.photoDuComposeur = URL(fileURLWithPath: "/p.jpg")
        var ouverte = false
        var choisi: StickerSheetChoice?

        let photo = rendu.composeurAffiche { ouverte = true }
        let seconde = rendu.composeurAffiche { ouverte = true }
        rendu.feuilleDeStickersAffichee { choisi = $0 }
        rendu.ouvrirLesStickers?()
        rendu.choisirUnSticker?(.emoji("🔥"))

        XCTAssertEqual(photo, URL(fileURLWithPath: "/p.jpg"))
        XCTAssertNil(seconde, "la photo d'ouverture n'entre qu'une fois")
        XCTAssertTrue(ouverte)
        guard case .emoji("🔥") = choisi else { return XCTFail("le choix relayé") }
        XCTAssertEqual(rendu.observes, [.composeur, .feuilleDeStickers])
    }
}
