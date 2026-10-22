import XCTest
import MeeshySDK
@testable import Meeshy

/// **Les stickers et les cadres du jeu se vendent dans la vitrine unique** (#10711).
///
/// Avant : deux Boutiques propres (`StickerPackShopScreen`, un `PackShopView` sur le magasin des
/// cadres) qui ne lisaient ni le prix ni la possession servis par `/packs/shop`. Un pack payant
/// y aurait été « installable » gratuitement. Le témoin garde le LIEN : les Réglages routent ces
/// deux domaines vers `UnifiedShopView`, comme les fonds, contours et bannières.
@MainActor
final class PackShopUnifiedRoutingGuardTests: XCTestCase {

    private static let path = "Meeshy/Features/Main/Views/PacksSettingsView.swift"

    func test_lesReglagesRoutentStickersEtCadresVersLaVitrineUnique() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.path))
        XCTAssertTrue(source.contains("case .sticker, .wallpaper, .avatarRing, .banner, .bannerFrame:"),
                      "le domaine sticker doit passer par UnifiedShopView avec les autres (#10711)")
        XCTAssertFalse(source.contains("StickerPackShopScreen("),
                       "la seconde Boutique des stickers ne revient pas dans les Réglages (#10711)")
        XCTAssertTrue(source.contains("UnifiedShopView(initialDomain: .gloryFrame"),
                      "la page Boutique des cadres est la vitrine unique (#10711)")
        XCTAssertFalse(source.contains("store.toggle(slug: slug)"),
                       "les cadres ne s'installent plus par l'ancien magasin, sans prix ni possession (#10711)")
        XCTAssertTrue(source.contains("usageText: FrameUsageCopy.text"),
                      "la vitrine des cadres dit où chaque pack sert, comme le magasin qu'elle remplace (#10711)")
        XCTAssertTrue(source.contains("focusedSlug: focusedPack,\n                            language: PackShopScreen.language)"),
                      "la vitrine des Réglages nomme ses packs dans la langue du lecteur (#10711)")
        XCTAssertTrue(source.contains("focusedSlug: focusedPack, language: language,"),
                      "la vitrine des cadres nomme ses packs dans la langue du lecteur (#10711)")
    }

    func test_lesOngletsDeCadresSuiventCeQueLaVitrineInstalle() {
        let state = PackShopState().loaded(PackShopResponse(sections: [
            PackShopSection(domain: .gloryFrame, packs: [
                ShopPack(slug: "or", name: "Or", installed: true),
                ShopPack(slug: "argent", name: "Argent", installed: false),
            ]),
            PackShopSection(domain: .sticker, packs: [ShopPack(slug: "mee", name: "Mee", installed: true)]),
        ]))

        XCTAssertEqual(FramePackShopScreen.installedSlugs(in: state), ["or"])
    }
}
