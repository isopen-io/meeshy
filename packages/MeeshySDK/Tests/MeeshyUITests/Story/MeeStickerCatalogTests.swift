import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Mee et Meo sur iOS** (#9053).
///
/// Le dessin n'a qu'une source — `apps/web/src/lib/mee/` — et iOS en reçoit un
/// FILM par sticker (`apps/web/scripts/mee-ios-stickers.ts`). Ces témoins
/// gardent le contrat entre les deux : chaque entrée de l'index a son film, un
/// `templateId` du web désigne le même sticker ici, et les onglets n'existent
/// que là où un sticker peut partir.
@MainActor
final class MeeStickerCatalogTests: XCTestCase {

    // MARK: - L'index et ses films

    /// Trois onglets de personnages (#9058) : Mee, Meo, Mee & Meo.
    func test_catalog_servesThreeCharacterTabs() {
        XCTAssertFalse(MeeStickerCatalog.stickers(of: .mee).isEmpty)
        XCTAssertFalse(MeeStickerCatalog.stickers(of: .meo).isEmpty)
        XCTAssertFalse(MeeStickerCatalog.stickers(of: .duo).isEmpty)
        XCTAssertTrue(MeeStickerCatalog.stickers(of: .duo).allSatisfy { $0.id.hasPrefix("duo-") })
    }

    /// Les sections sont des INTENTIONS, dans l'ordre du web, sans section vide.
    func test_sections_followTheIntentOrder_andAreNeverEmpty() {
        for character in [MeeSticker.Character.mee, .meo, .duo] {
            let sections = MeeStickerCatalog.sections(of: character)
            let order = sections.map(\.intent)
            XCTAssertEqual(order, MeeStickerCatalog.intentOrder.filter(order.contains))
            XCTAssertTrue(sections.allSatisfy { !$0.stickers.isEmpty })
        }
    }

    /// Chaque intention a un titre ET une explication — sinon la section se
    /// lirait comme un mot-clé, pas comme un « quand l'employer ».
    func test_everyIntent_hasATitleAndAHint() {
        for intent in MeeStickerCatalog.intentOrder {
            XCTAssertFalse(intent.title.isEmpty)
            XCTAssertFalse(intent.hint.isEmpty)
            XCTAssertNotEqual(intent.title, intent.hint)
        }
    }

    /// Une entrée sans film rendrait une case vide dans la feuille ET un
    /// sticker que personne ne peut voir : le générateur a été interrompu, ou
    /// un fichier a été retiré à la main.
    func test_everyIndexedSticker_hasItsFilmInTheBundle() {
        let sansFilm = MeeStickerCatalog.all.filter { MeeStickerCatalog.fileURL(for: $0) == nil }
        XCTAssertEqual(sansFilm.map(\.id), [])
    }

    func test_film_decodes_andAnimatesWhenDeclaredAnimated() throws {
        let anime = try XCTUnwrap(MeeStickerCatalog.all.first(where: \.animated))
        let decoded = try XCTUnwrap(MeeStickerCatalog.decoded(anime, maxPixelSize: 120))
        XCTAssertGreaterThan(decoded.frames.count, 1)
        XCTAssertNotNil(decoded.stillImage)
    }

    // MARK: - Le contrat du message

    func test_templateID_isTheWebContract() {
        let sticker = MeeStickerCatalog.all[0]
        XCTAssertEqual(sticker.templateId, "mee.\(sticker.id)")
        XCTAssertEqual(MeeStickerCatalog.sticker(forTemplateID: sticker.templateId), sticker)
    }

    func test_unknownOrForeignTemplateID_isNotAMeeSticker() {
        XCTAssertNil(MeeStickerCatalog.sticker(forTemplateID: "mee.n-existe-pas"))
        XCTAssertNil(MeeStickerCatalog.sticker(forTemplateID: "love.heart"))
        XCTAssertNil(MeeStickerCatalog.sticker(forTemplateID: nil))
    }

    func test_messageSticker_carriesTemplateAndFallbackEmoji_withoutSlots() {
        let sticker = MeeStickerCatalog.all[0]
        XCTAssertEqual(sticker.messageSticker,
                       MessageSticker(templateId: "mee.\(sticker.id)", emoji: sticker.emoji))
    }

    // MARK: - Les onglets de la feuille

    /// Loi 4 : un onglet n'existe que s'il a un effet. Sans hôte capable
    /// d'ENVOYER un Mee (la scène d'une story ne sait pas le poser), les deux
    /// onglets ne sont pas rendus — jamais grisés.
    func test_sheetTabs_offerMeeAndMeo_onlyWhenAHostSendsThem() {
        XCTAssertFalse(StickerSheetTab.offered(hasMee: false).contains(.mee))
        XCTAssertFalse(StickerSheetTab.offered(hasMee: false).contains(.meo))
        XCTAssertFalse(StickerSheetTab.offered(hasMee: false).contains(.meeAndMeo))
        XCTAssertEqual(StickerSheetTab.offered(hasMee: false),
                       [.search, .favorites, .recents, .custom, .smileys])
        XCTAssertEqual(StickerSheetTab.offered(hasMee: true),
                       [.search, .favorites, .recents, .mee, .meo, .meeAndMeo, .custom, .smileys])
    }

    /// Mee et Meo ne portent aucune famille de palette : leur contenu vient de
    /// leur propre catalogue, comme Favoris vient du magasin d'usage.
    func test_meeTabs_borrowNoPaletteFamily() {
        let toutes = StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: true)
        XCTAssertEqual(StickerSheetTab.sections(of: .mee, offered: toutes), [])
        XCTAssertEqual(StickerSheetTab.sections(of: .meo, offered: toutes), [])
        XCTAssertEqual(StickerSheetTab.sections(of: .meeAndMeo, offered: toutes), [])
    }
}

/// **La grille anime sans faire exploser la mémoire** (#9059).
@MainActor
final class MeeStickerGridFilmTests: XCTestCase {

    func test_gridCell_decodesAtTheGridCap_notAtTheScreenScale() {
        XCTAssertEqual(MeeStickerFilmView.decodePixelSize(side: 96, scale: 3, cap: MeeStickerFilmView.gridPixelCap), 180)
    }

    func test_bubble_decodesAtScreenScale_capedByTheFilm() {
        XCTAssertEqual(MeeStickerFilmView.decodePixelSize(side: 100, scale: 2, cap: 360), 200)
        XCTAssertEqual(MeeStickerFilmView.decodePixelSize(side: 160, scale: 3, cap: 360), 360)
    }
}
