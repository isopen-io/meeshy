import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les Instants de Mee et Meo sur iOS** (#9069) — les stickers qui écrivent
/// un message, l'heure, le lieu ou la météo saisis à l'envoi.
///
/// Le dessin vient du web (`apps/web/src/lib/mee/catalog-instants.ts`), filmé
/// SANS son texte par `apps/web/scripts/mee-ios-instants.ts` ; iOS redessine le
/// texte en natif. Ces témoins gardent les règles que le natif REJOUE du web :
/// ce qui part au fil, ce qui s'affiche, la coupe, le bandeau, la taille.
@MainActor
final class MeeInstantCatalogTests: XCTestCase {

    private func instant(_ id: String) throws -> MeeInstant {
        try XCTUnwrap(MeeInstantCatalog.instant(forTemplateID: "mee.\(id)"))
    }

    // MARK: - L'index et ses films

    func test_everyInstant_hasItsFilmInTheBundle() {
        XCTAssertEqual(MeeInstantCatalog.all.count, 100)
        let sansFilm = MeeInstantCatalog.all.filter { MeeStickerCatalog.fileURL(id: $0.id) == nil }
        XCTAssertEqual(sansFilm.map(\.id), [])
    }

    /// Les sections de « Personnalisés », dans l'ordre du web, jamais vides.
    func test_sections_followTheWebOrder_andHoldEveryInstant() {
        let sections = MeeInstantCatalog.sections
        XCTAssertEqual(sections.map(\.kind), [.message, .moment, .lieu, .meteo])
        XCTAssertTrue(sections.allSatisfy { !$0.instants.isEmpty })
        XCTAssertEqual(sections.flatMap(\.instants).count, MeeInstantCatalog.all.count)
    }

    /// Un Instant n'est pas un personnage, et réciproquement : chaque
    /// catalogue ne répond que de ses propres identifiants.
    func test_templateID_resolvesInItsOwnCatalogOnly() throws {
        let plage = try instant("instant-plage")
        XCTAssertEqual(plage.templateId, "mee.instant-plage")
        XCTAssertNil(MeeStickerCatalog.sticker(forTemplateID: "mee.instant-plage"))
        XCTAssertNil(MeeInstantCatalog.instant(forTemplateID: "mee.mee-coucou"))
        XCTAssertNil(MeeInstantCatalog.instant(forTemplateID: "love.heart"))
        XCTAssertNil(MeeInstantCatalog.instant(forTemplateID: nil))
    }

    // MARK: - Ce qui part au fil, ce qui s'affiche

    /// La règle du web (`meeSlotsFor`) : seuls les emplacements DÉCLARÉS et
    /// non vides partent, débarrassés de leurs espaces.
    func test_sentSlots_keepOnlyDeclaredNonEmptyValues() throws {
        let plage = try instant("instant-plage")
        XCTAssertEqual(plage.sentSlots([.place: "  Biarritz ", .weather: "Pluie", .message: "   "]), [.place: "Biarritz"])
    }

    /// Le descripteur est celui que le web redessine : gabarit, emplacements, repli.
    func test_messageSticker_isTheWebContract() throws {
        let plage = try instant("instant-plage")
        XCTAssertEqual(plage.messageSticker(slots: [.place: "Biarritz"]),
                       MessageSticker(templateId: "mee.instant-plage", slots: ["place": "Biarritz"], emoji: "🏝️"))
    }

    /// Ce qui s'AFFICHE : la valeur saisie, sinon la valeur par défaut du
    /// sticker — et rien pour un emplacement facultatif laissé vide.
    func test_shownValue_isTheTypedOne_elseTheDefault_elseNothing() throws {
        let plage = try instant("instant-plage")
        XCTAssertEqual(plage.shown(.place, in: [.place: "Biarritz"]), "Biarritz")
        XCTAssertEqual(plage.shown(.place, in: [:]), "À la plage")
        XCTAssertNil(plage.shown(.message, in: [:]))
    }

    /// Les emplacements relus d'un message reçu : les clés inconnues tombent.
    func test_slotsOfAMessage_dropUnknownKeys() {
        XCTAssertEqual(MeeSlot.slots(of: ["place": "Biarritz", "date": "1er octobre"]), [.place: "Biarritz"])
    }

    // MARK: - Les règles du dessin, rejouées

    /// `clip` du web : on retire les espaces, et au-delà de `max` on garde
    /// `max - 1` caractères suivis d'une ellipse.
    func test_clip_isTheWebRule() {
        XCTAssertEqual(MeeInstantText.clip("  abc  ", max: 4), "abc")
        XCTAssertEqual(MeeInstantText.clip("abcdef", max: 4), "abc…")
        XCTAssertEqual(MeeInstantText.clip("ab cdef", max: 4), "ab…")
    }

    /// `kit.band` du web : une ligne quand la ligne douce manque, deux sinon ;
    /// la ligne forte rétrécit au-delà de quatorze caractères.
    func test_bandLayout_isTheWebRule() {
        let une = MeeInstantBandLayout(main: "Biarritz", sub: nil)
        XCTAssertEqual(une.rect, CGRect(x: 14, y: 158, width: 172, height: 34))
        XCTAssertEqual(une.cornerRadius, 17)
        XCTAssertEqual(une.mainSize, 19)
        XCTAssertEqual(une.mainBaseline, 181)
        XCTAssertNil(une.sub)

        let longue = MeeInstantBandLayout(main: "Saint-Jean-de-Luz", sub: "")
        XCTAssertEqual(longue.mainSize, 15)
        XCTAssertEqual(longue.mainBaseline, 179)

        let deux = MeeInstantBandLayout(main: "Biarritz", sub: "On se baigne ?")
        XCTAssertEqual(deux.rect, CGRect(x: 14, y: 148, width: 172, height: 46))
        XCTAssertEqual(deux.cornerRadius, 16)
        XCTAssertEqual(deux.mainBaseline, 169)
        XCTAssertEqual(deux.sub, "On se baigne ?")
        XCTAssertEqual(deux.subSize, 11.5)
        XCTAssertEqual(deux.subBaseline, 186)

        XCTAssertEqual(MeeInstantBandLayout(main: String(repeating: "a", count: 25), sub: nil).main.count, 20)
    }

    /// La taille d'un texte libre suit la table SONDÉE par le générateur.
    func test_freeTextSize_followsTheProbedTable() {
        let texte = MeeInstant.FreeText(slot: .message, x: 0, y: 0, rotation: 0, scale: 1, anchor: .middle,
                                        weight: 800, fill: 0x1C1941, opacity: 1,
                                        sizes: [.init(from: 1, size: 14), .init(from: 19, size: 11)], max: nil)
        XCTAssertEqual(texte.size(forLength: 5), 14)
        XCTAssertEqual(texte.size(forLength: 19), 11)
        XCTAssertEqual(texte.size(forLength: 40), 11)
    }

    /// Chaque Instant porte au moins un texte : un bandeau ou un texte libre.
    func test_everyInstant_drawsSomeText() {
        XCTAssertEqual(MeeInstantCatalog.all.filter { $0.band == nil && $0.texts.isEmpty }.map(\.id), [])
    }
}
