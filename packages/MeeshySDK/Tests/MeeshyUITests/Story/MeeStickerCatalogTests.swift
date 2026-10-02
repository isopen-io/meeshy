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

    /// Trois distributions (#9058) : Mee, Meo, Mee & Meo — rangées ensemble
    /// dans un seul onglet depuis #9068.
    func test_catalog_servesThreeCharacters() {
        XCTAssertFalse(MeeStickerCatalog.stickers(of: .mee).isEmpty)
        XCTAssertFalse(MeeStickerCatalog.stickers(of: .meo).isEmpty)
        XCTAssertFalse(MeeStickerCatalog.stickers(of: .duo).isEmpty)
        XCTAssertTrue(MeeStickerCatalog.stickers(of: .duo).allSatisfy { $0.id.hasPrefix("duo-") })
    }

    /// **UN onglet, rangé par intention** (directive porteur 2026-10-02,
    /// #9068) : Mee, Meo et leurs duos se cherchent par ce qu'ils DISENT, pas
    /// par qui les joue. Chaque section suit l'ordre du web, n'est jamais vide,
    /// et range ses stickers Mee, puis Meo, puis les duos.
    func test_sections_mixEveryCharacter_byIntent_meeThenMeoThenDuo() {
        let sections = MeeStickerCatalog.sections
        let order = sections.map(\.intent)
        XCTAssertEqual(order, MeeStickerCatalog.intentOrder.filter(order.contains))
        XCTAssertTrue(sections.allSatisfy { !$0.stickers.isEmpty })
        XCTAssertEqual(sections.flatMap(\.stickers).count, MeeStickerCatalog.all.count)
        let rang: [MeeSticker.Character: Int] = [.mee: 0, .meo: 1, .duo: 2]
        for section in sections {
            let rangs = section.stickers.map { rang[$0.tab] ?? -1 }
            XCTAssertEqual(rangs, rangs.sorted(), "\(section.intent) : Mee, puis Meo, puis les duos")
        }
    }

    /// **La planche défile en RANGÉES, pas en grilles imbriquées** (retour
    /// porteur 2026-10-02 : « quand je défile sur toute la planche, ça plante
    /// et le défilement ne fonctionne plus »). Une grille paresseuse par
    /// intention, dans la pile paresseuse de la feuille, créait toutes ses
    /// cases d'un coup et faisait osciller la hauteur du contenu sans fin.
    /// Chaque ligne de la pile est désormais un titre OU une rangée d'au plus
    /// `columns` stickers — l'ordre des sections, sans rien perdre ni doubler.
    func test_rows_areATitleThenRowsOfAtMostThreeStickers_inSectionOrder() {
        let rows = MeeStickerCatalog.rows(columns: 3)
        var attendu: [MeeStickerCatalog.Row] = []
        for section in MeeStickerCatalog.sections {
            attendu.append(.title(section.intent))
            attendu += stride(from: 0, to: section.stickers.count, by: 3).map {
                .stickers(Array(section.stickers[$0..<min($0 + 3, section.stickers.count)]))
            }
        }
        XCTAssertEqual(rows, attendu)
        XCTAssertEqual(Set(rows.map(\.id)).count, rows.count, "un identifiant par ligne, sinon la pile recycle la mauvaise")
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

    // MARK: - Favoris et récents (#9067)

    /// **Un Mee s'épingle comme les autres stickers** : un RENVOI vers son
    /// identifiant, qui survit à l'aller-retour du magasin.
    func test_usageEntry_ofAMee_isARoundTrippableReference() throws {
        let sticker = MeeStickerCatalog.all[0]
        let entree = StickerUsageEntry.mee(sticker)
        XCTAssertEqual(entree.kind, .mee)
        XCTAssertEqual(entree.value, sticker.id)
        let relu = try JSONDecoder().decode(StickerUsageEntry.self, from: JSONEncoder().encode(entree))
        XCTAssertEqual(relu, entree)
        XCTAssertEqual(MeeStickerCatalog.sticker(for: relu), sticker)
    }

    /// Un favori dont le Mee a quitté le catalogue est ignoré, jamais purgé ;
    /// une entrée d'une autre nature n'est pas un Mee.
    func test_usageEntry_resolvesOnlyAKnownMee() {
        XCTAssertNil(MeeStickerCatalog.sticker(for: StickerUsageEntry(kind: .mee, value: "n-existe-pas")))
        XCTAssertNil(MeeStickerCatalog.sticker(for: .emoji("😀")))
    }

    /// Loi 4 dans les onglets d'usage : là où aucun hôte ne sait ENVOYER un
    /// Mee (la scène d'une story), ses favoris ne s'affichent pas — ils
    /// restent au magasin pour la conversation.
    func test_usageMees_showOnlyWhereAHostSendsThem() {
        let entrees: [StickerUsageEntry] = [.mee(MeeStickerCatalog.all[0]), .emoji("😀"),
                                            .mee(MeeStickerCatalog.all[1])]
        XCTAssertEqual(MeeStickerCatalog.stickers(in: entrees, hasMee: true),
                       [MeeStickerCatalog.all[0], MeeStickerCatalog.all[1]])
        XCTAssertEqual(MeeStickerCatalog.stickers(in: entrees, hasMee: false), [])
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

    /// Loi 4 : sans hôte capable d'envoyer ou de poser un Mee, aucun pack
    /// intégré n'a d'onglet. Depuis #9190, un onglet par PACK installé
    /// (`StickerSheetPage`) remplace l'onglet unique « Mee & Meo » (#9068).
    func test_sheetPages_offerTheBuiltinPacks_onlyWhenAHostSendsThem() {
        XCTAssertFalse(StickerSheetPage.offered(hasMee: false, installed: nil, hasPackPick: false, hasShop: false)
                        .contains(where: \.isPack))
        XCTAssertEqual(StickerSheetPage.offered(hasMee: true, installed: nil, hasPackPick: false, hasShop: false)
                        .filter(\.isPack), [.pack("mee"), .pack("meo"), .pack("mee-et-meo")])
        XCTAssertFalse(StickerSheetPage.offered(hasMee: true, installed: nil, hasPackPick: false, hasShop: false)
                        .contains(.fixed(.meeAndMeo)))
    }

    /// Mee et Meo ne portent aucune famille de palette : leur contenu vient de
    /// leur propre catalogue, comme Favoris vient du magasin d'usage.
    func test_meeTabs_borrowNoPaletteFamily() {
        let toutes = StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: true)
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
