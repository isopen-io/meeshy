import XCTest
@testable import MeeshySDK

/// #4716 — un sticker peut porter un GABARIT, et sa donnée est FIGÉE à la pose.
///
/// Les témoins portent sur le COMPORTEMENT, jamais sur la forme du catalogue :
/// ajouter un dixième gabarit ne doit faire tomber aucun d'eux — sauf la garde
/// d'inventaire, qui BALAIE le catalogue et le vérifie donc au complet.
final class StickerTemplateTests: XCTestCase {

    // MARK: - Le rang du kind

    /// `templateId` gagne sur `postMediaId`, qui gagne sur l'emoji.
    ///
    /// Le témoin porte un sticker qui remplit LES DEUX : au cas nominal (un
    /// seul champ rempli), un mauvais ordre et le bon rendent le même verdict —
    /// le témoin ne pourrait pas tomber.
    func test_kind_templateIdWins_evenWhenPostMediaIdIsAlsoSet() {
        let sticker = StorySticker(emoji: "❤️",
                                   postMediaId: "media-1",
                                   templateId: "love.heartFrame")
        XCTAssertEqual(sticker.kind, .template)
    }

    func test_kind_postMediaIdWins_overEmoji_whenNoTemplate() {
        let sticker = StorySticker(emoji: "❤️", postMediaId: "media-1")
        XCTAssertEqual(sticker.kind, .image)
    }

    func test_kind_emojiOnly_staysEmoji() {
        XCTAssertEqual(StorySticker(emoji: "❤️").kind, .emoji)
    }

    // MARK: - Ce que voit un lecteur ancien

    /// Un lecteur qui ne sait pas rendre un gabarit lit `emoji`. Un sticker
    /// gabarit posé SANS emoji lui servirait un vide — d'où le repli du
    /// catalogue, sur le patron de `imageFallbackEmoji`.
    func test_wireEmoji_templateWithoutEmoji_servesCatalogFallback() {
        let sticker = StorySticker(emoji: "", templateId: "time.digital")
        let repli = StickerTemplateCatalog.template(id: "time.digital")?.fallbackEmoji
        XCTAssertEqual(sticker.wireEmoji, repli)
        XCTAssertFalse(sticker.wireEmoji.isEmpty)
    }

    /// Un gabarit inconnu — publié par une version plus récente — ne rend
    /// jamais une chaîne vide : il retombe sur le repli image générique.
    func test_wireEmoji_unknownTemplateWithoutEmoji_neverEmpty() {
        let sticker = StorySticker(emoji: "", templateId: "venu.du.futur")
        XCTAssertFalse(sticker.wireEmoji.isEmpty)
    }

    // MARK: - Codage : l'ancien ne bouge pas, le neuf fait l'aller-retour

    func test_decode_legacyPayload_hasNeitherTemplateNorSlots() throws {
        let json = Data("""
        {"id":"s1","emoji":"❤️","x":0.5,"y":0.5,"scale":1,"rotation":0}
        """.utf8)
        let sticker = try JSONDecoder().decode(StorySticker.self, from: json)
        XCTAssertEqual(sticker.templateId, "")
        XCTAssertTrue(sticker.slots.isEmpty)
        XCTAssertEqual(sticker.kind, .emoji)
    }

    /// Un brouillon emoji déjà sur disque se réencode EXACTEMENT comme avant —
    /// même règle que `postMediaId`, qui est omis quand il est vide.
    func test_encode_stickerWithoutTemplate_omitsBothKeys() throws {
        let data = try JSONEncoder().encode(StorySticker(emoji: "❤️"))
        let objet = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        XCTAssertNil(objet["templateId"])
        XCTAssertNil(objet["slots"])
    }

    func test_roundTrip_templateSticker_preservesTemplateAndSlots() throws {
        let posé = StorySticker(emoji: "🕐",
                                templateId: "time.digital",
                                slots: ["time": "14:32", "hour": "14", "minute": "32"])
        let relu = try JSONDecoder().decode(
            StorySticker.self, from: JSONEncoder().encode(posé)
        )
        XCTAssertEqual(relu.templateId, "time.digital")
        XCTAssertEqual(relu.slots["time"], "14:32")
        XCTAssertEqual(relu.slots["hour"], "14")
        XCTAssertEqual(relu.kind, .template)
    }

    // MARK: - Le catalogue

    func test_catalog_unknownId_returnsNil() {
        XCTAssertNil(StickerTemplateCatalog.template(id: "n.existe.pas"))
    }

    /// Garde d'INVENTAIRE : elle balaie le catalogue, donc elle ne se périme
    /// pas quand un gabarit s'ajoute — c'est ce qui la distingue d'un témoin
    /// qui énumère et se périme à chaque capacité nouvelle.
    func test_catalog_everyTemplate_isServableToAnOldReader() {
        for gabarit in StickerTemplateCatalog.all {
            XCTAssertFalse(gabarit.id.isEmpty, "id vide")
            XCTAssertFalse(gabarit.fallbackEmoji.isEmpty,
                           "\(gabarit.id) — un lecteur ancien lirait un vide")
            XCTAssertGreaterThan(gabarit.posedScale, 0,
                                 "\(gabarit.id) — échelle de pose nulle")
        }
    }

    func test_catalog_idsAreUnique() {
        let ids = StickerTemplateCatalog.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count)
    }

    func test_catalog_everyFamily_hasAtLeastOneTemplate() {
        for famille in StickerTemplateFamily.allCases {
            XCTAssertFalse(StickerTemplateCatalog.templates(family: famille).isEmpty,
                           "\(famille.rawValue) — famille vide")
        }
    }

    /// Le premier lot ne livre AUCUN emplacement de prose : le type existe pour
    /// que la question du Prisme soit posée (#4721), pas pour être utilisé tout
    /// de suite. Ce témoin tombera le jour où le premier gabarit de prose
    /// arrive — et c'est exactement à ce moment qu'il faut relire le Prisme.
    func test_catalog_firstLot_shipsNoProseSlot() {
        let prose = StickerTemplateCatalog.all
            .flatMap(\.slots)
            .filter { $0.nature == .prose }
        XCTAssertTrue(prose.isEmpty,
                      "un emplacement de prose est arrivé — traiter #4721 avant de livrer")
    }

    /// **`posedScale` d'un gabarit n'est PAS `StorySticker.posedScale`.**
    /// Le 2,2 existant agrandit un GLYPHE NU ; un gabarit porte déjà sa mise en
    /// page et déborderait de la scène.
    func test_catalog_posedScale_isNeverTheBareGlyphScale() {
        for gabarit in StickerTemplateCatalog.all {
            XCTAssertNotEqual(gabarit.posedScale, StorySticker.posedScale,
                              "\(gabarit.id) — un gabarit ne se pose pas comme un emoji nu")
        }
    }

    // MARK: - Le gel de la donnée

    /// La donnée est FIGÉE à la pose : le remplissage est une fonction PURE de
    /// l'instant reçu. Rien dans la chaîne ne lit l'horloge — c'est ce qui
    /// garantit qu'un lecteur voit ce que l'auteur a composé.
    func test_slotFiller_time_isAPureFunctionOfTheGivenInstant() {
        let instant = Date(timeIntervalSince1970: 1_756_000_000)
        let calendrier = Calendar(identifier: .gregorian)
        let fuseau = TimeZone(identifier: "Europe/Paris")!

        let a = StickerSlotFiller.timeSlots(at: instant, calendar: calendrier, timeZone: fuseau)
        let b = StickerSlotFiller.timeSlots(at: instant, calendar: calendrier, timeZone: fuseau)
        XCTAssertEqual(a, b, "deux appels au même instant doivent rendre la même valeur")

        let plusTard = StickerSlotFiller.timeSlots(at: instant.addingTimeInterval(3600),
                                                   calendar: calendrier, timeZone: fuseau)
        XCTAssertNotEqual(a[StickerSlotFiller.hourSlot], plusTard[StickerSlotFiller.hourSlot],
                          "une heure plus tard doit rendre une heure différente")
    }

    /// Le cadran analogique dessine des AIGUILLES : il lui faut des nombres, pas
    /// une chaîne à ré-analyser. Les trois gabarits d'heure lisent donc les
    /// mêmes emplacements, remplis une fois.
    func test_slotFiller_time_carriesBothTheDisplayStringAndItsNumbers() {
        let calendrier = Calendar(identifier: .gregorian)
        let fuseau = TimeZone(identifier: "Europe/Paris")!
        var composantes = DateComponents()
        composantes.year = 2026; composantes.month = 9; composantes.day = 1
        composantes.hour = 14; composantes.minute = 32
        var c = calendrier; c.timeZone = fuseau
        let instant = c.date(from: composantes)!

        let emplacements = StickerSlotFiller.timeSlots(at: instant, calendar: calendrier, timeZone: fuseau)
        XCTAssertEqual(emplacements[StickerSlotFiller.hourSlot], "14")
        XCTAssertEqual(emplacements[StickerSlotFiller.minuteSlot], "32")
        XCTAssertNotNil(emplacements[StickerSlotFiller.timeSlot])
    }

    /// Un lieu sans nom — un point posé à la main dont le géocodage inverse n'a
    /// rien rendu — ne doit pas produire un cartouche VIDE.
    func test_slotFiller_place_namelessPlace_fallsBackToItsAddress() {
        let lieu = SharedPlace(latitude: 48.86, longitude: 2.35, name: nil, address: "12 rue de Rivoli")
        let emplacements = StickerSlotFiller.placeSlots(for: lieu)
        XCTAssertEqual(emplacements[StickerSlotFiller.placeNameSlot], "12 rue de Rivoli")
    }

    func test_slotFiller_place_namedPlace_keepsNameAndAddressApart() {
        let lieu = SharedPlace(latitude: 48.86, longitude: 2.35, name: "Le Marais", address: "Paris")
        let emplacements = StickerSlotFiller.placeSlots(for: lieu)
        XCTAssertEqual(emplacements[StickerSlotFiller.placeNameSlot], "Le Marais")
        XCTAssertEqual(emplacements[StickerSlotFiller.placeDetailSlot], "Paris")
    }
}
