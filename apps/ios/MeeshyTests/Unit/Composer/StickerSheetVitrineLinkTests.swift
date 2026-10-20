import XCTest
@testable import Meeshy

/// **Le composeur de stickers mène à la vitrine unique** (#10712, spec § 9).
///
/// La feuille liste ce que je possède et ai installé (un onglet par pack) ; sa
/// Boutique propose « Plus dans la boutique », qui ouvre la vitrine unique
/// filtrée sur les stickers — le même lien que le web (`?volet=packs&domaine=sticker`).
/// La conversation l'offre ; la scène d'un composer non, partir vers Réglages
/// y laisserait la composition derrière une couverture.
@MainActor
final class StickerSheetVitrineLinkTests: XCTestCase {

    func test_leLienOuvreLaVitrineFiltreeSurLesStickers() {
        XCTAssertEqual(StickerPackShopScreen.vitrine, .packShop(domain: .sticker))
    }

    func test_leLienDeLaVitrineEstUnLienDeLaVitrine() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://settings/packs?domaine=sticker")!), .packShop(domain: .sticker))
    }

    func test_parDefautUneDestinationNOffrePasLaVitrine() {
        XCTAssertFalse(StickerSheetDestination(diesCut: false) { _ in }.leadsToVitrine)
    }

    func test_laConversationOffreLaVitrineEtLaSceneNon() throws {
        let conversation = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationLayers/ConversationComposerLayers.swift"))
        XCTAssertTrue(conversation.contains("StickerSheetDestination(diesCut: true, leadsToVitrine: true)"))
        let scene = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Composer/MeeshyComposerHost+Pickers.swift"))
        XCTAssertTrue(scene.contains("StickerSheetDestination(diesCut: false)"))
        XCTAssertFalse(scene.contains("leadsToVitrine: true"))
    }
}
