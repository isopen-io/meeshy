import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// #4579 — **la porte sticker ouvre une palette de CONSTRUCTIONS.**
///
/// Les témoins portent sur les décisions PURES de la palette : quels onglets
/// elle offre, et ce qu'elle dit à VoiceOver. Le rendu de chaque vignette est
/// exercé par `StickerTemplateRendererTests` (#4718) — ici on ne re-teste pas
/// le dessin, on teste ce qui décide.
@MainActor
final class StickerPaletteTests: XCTestCase {

    // MARK: - La loi 4, onglet par onglet

    /// Emoji, amour et heure ne dépendent de RIEN : ni permission, ni magasin.
    /// Ils sont toujours là.
    func test_threeTabs_neverDependOnAProvider() {
        let nu = StickerPaletteTab.offered(hasLibrary: false, hasNearbyPlaces: false)
        XCTAssertEqual(nu, [.emoji, .love, .time])
    }

    /// **Un outil non servi est ABSENT, jamais grisé.** Un onglet « Mes
    /// stickers » peint sans magasin derrière promettrait une capacité que le
    /// site de montage ne possède pas.
    func test_libraryTab_absentWithoutItsStore() {
        XCTAssertFalse(
            StickerPaletteTab.offered(hasLibrary: false, hasNearbyPlaces: true).contains(.library))
        XCTAssertTrue(
            StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: true).contains(.library))
    }

    /// Idem pour le lieu : sans fournisseur (autorisation refusée), l'onglet
    /// n'existe pas. C'est distinct de « l'onglet existe et ne trouve rien »,
    /// que la vue rend par un état vide.
    func test_placeTab_absentWithoutItsProvider() {
        XCTAssertFalse(
            StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: false).contains(.place))
        XCTAssertTrue(
            StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: false).contains(.emoji),
            "retirer le lieu ne doit pas emporter les onglets voisins")
    }

    /// L'ordre est celui que les doigts apprennent : il vient de la liste
    /// canonique, jamais de l'ordre de déclaration de l'enum.
    func test_offeredTabs_keepTheCanonicalOrder() {
        let tous = StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: true)
        XCTAssertEqual(tous, StickerPaletteTab.canonicalOrder)
        XCTAssertEqual(tous, [.emoji, .love, .time, .place, .library])
    }

    func test_eachTab_mapsToTheRightTemplateFamily() {
        XCTAssertEqual(StickerPaletteTab.love.templateFamily, .love)
        XCTAssertEqual(StickerPaletteTab.time.templateFamily, .time)
        XCTAssertEqual(StickerPaletteTab.place.templateFamily, .location)
        XCTAssertNil(StickerPaletteTab.emoji.templateFamily)
        XCTAssertNil(StickerPaletteTab.library.templateFamily)
    }

    func test_eachTab_hasItsOwnGlyph() {
        let glyphes = StickerPaletteTab.allCases.map(\.symbolName)
        XCTAssertFalse(glyphes.contains(where: \.isEmpty))
        XCTAssertEqual(Set(glyphes).count, glyphes.count,
                       "Deux onglets qui partagent un glyphe sont deux choses qu'on ne distingue pas.")
    }

    // MARK: - Ce que la palette DIT

    /// Garde d'INVENTAIRE : chaque gabarit du catalogue a un nom traduisible.
    /// Elle balaie le catalogue, donc un dixième gabarit sans nom la fait
    /// rougir toute seule — elle ne se périme pas.
    func test_everyTemplate_hasANonEmptyName_andNoneFallsToTheGenericOne() {
        let générique = StickerPickerView.templateName("id.inconnu")
        for gabarit in StickerTemplateCatalog.all {
            let nom = StickerPickerView.templateName(gabarit.id)
            XCTAssertFalse(nom.isEmpty, "\(gabarit.id) — sans nom")
            XCTAssertNotEqual(nom, générique,
                              "\(gabarit.id) — retombe sur le libellé générique")
        }
    }

    func test_everyTab_hasANonEmptyTitle() {
        for onglet in StickerPaletteTab.allCases {
            XCTAssertFalse(StickerPickerView.tabTitle(onglet).isEmpty, "\(onglet.rawValue)")
        }
    }

    /// **Le label VoiceOver est construit À PART du texte dessiné.** Une chaîne
    /// qui sert l'œil ET le lecteur d'écran n'en sert qu'un : « 14:32 » seul ne
    /// dit pas de quoi il est l'heure.
    func test_accessibilityLabel_namesTheDecoration_andCarriesItsValue() {
        let gabarit = StickerTemplateCatalog.template(id: StickerTemplateCatalog.ID.timeDigital)!
        let étiquette = StickerPickerView.accessibilityLabel(
            for: gabarit,
            slots: [StickerSlotFiller.timeSlot: "14:32",
                    StickerSlotFiller.hourSlot: "14",
                    StickerSlotFiller.minuteSlot: "32"])
        XCTAssertTrue(étiquette.contains(StickerPickerView.templateName(gabarit.id)))
        XCTAssertTrue(étiquette.contains("14:32"))
    }

    /// Un gabarit sans emplacement (les deux cœurs) garde un label — son nom.
    func test_accessibilityLabel_slotlessTemplate_isStillNamed() {
        let gabarit = StickerTemplateCatalog.template(id: StickerTemplateCatalog.ID.loveDoubleHeart)!
        let étiquette = StickerPickerView.accessibilityLabel(for: gabarit, slots: [:])
        XCTAssertFalse(étiquette.isEmpty)
        XCTAssertEqual(étiquette, StickerPickerView.templateName(gabarit.id))
    }

    /// Et un gabarit dont les emplacements sont VIDES ne rend pas « Cadran — ».
    func test_accessibilityLabel_emptySlots_neverEndsWithADanglingSeparator() {
        let gabarit = StickerTemplateCatalog.template(id: StickerTemplateCatalog.ID.timeAnalog)!
        let étiquette = StickerPickerView.accessibilityLabel(
            for: gabarit, slots: [StickerSlotFiller.timeSlot: ""])
        XCTAssertEqual(étiquette, StickerPickerView.templateName(gabarit.id))
    }

    // MARK: - Quand la position se demande

    /// **La permission de localisation se demande à l'ENTRÉE dans l'onglet,
    /// jamais à l'ouverture de la palette.**
    ///
    /// Mesuré au simulateur `Meeshy-iOS26` : charger les lieux dans le `.task`
    /// de la feuille faisait surgir l'alerte système PAR-DESSUS la grille
    /// d'emoji, avant que l'auteur ait manifesté le moindre intérêt pour un
    /// lieu. Une permission demandée sans motif visible est une permission
    /// refusée — et un refus ferme l'onglet pour de bon, puisque l'injecteur
    /// ne sert plus le fournisseur.
    ///
    /// Garde de SOURCE parce que la règle vit dans un modificateur de vue :
    /// le `.task` ne doit pas nommer le fournisseur, et le gestionnaire
    /// d'onglet doit le nommer.
    func test_thePlaceProvider_isCalledOnTabEntry_notOnSheetOpen() throws {
        let code = Self.strippingComments(
            try String(contentsOf: Self.pickerSourceURL, encoding: .utf8))

        let task = try XCTUnwrap(Self.blockBody(after: ".task {", in: code),
                                 "Le bloc `.task` de la feuille est introuvable.")
        XCTAssertFalse(task.contains("nearbyPlaces"),
                       "La palette demande la position dès son ouverture — l'alerte système "
                        + "surgit par-dessus la grille d'emoji, sans motif visible.")

        let surOnglet = try XCTUnwrap(
            Self.blockBody(after: ".adaptiveOnChange(of: selectedTab)", in: code),
            "Le gestionnaire de changement d'onglet est introuvable.")
        XCTAssertTrue(surOnglet.contains("nearbyPlaces.nearby()"),
                      "Personne ne charge les lieux : l'onglet resterait vide à jamais.")
        XCTAssertTrue(surOnglet.contains("places.isEmpty"),
                      "Sans garde d'idempotence, revenir sur l'onglet relance une recherche.")
    }

    private static var pickerSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StickerPickerView.swift")
    }

    /// Le corps d'un bloc, isolé par équilibrage d'accolades depuis son entête.
    private static func blockBody(after entête: String, in code: String) -> String? {
        guard let début = code.range(of: entête),
              let ouvrante = code[début.lowerBound...].firstIndex(of: "{") else { return nil }
        var profondeur = 0
        var index = ouvrante
        while index < code.endIndex {
            if code[index] == "{" { profondeur += 1 }
            if code[index] == "}" {
                profondeur -= 1
                if profondeur == 0 {
                    return String(code[code.index(after: ouvrante)..<index])
                }
            }
            index = code.index(after: index)
        }
        return nil
    }

    /// Les commentaires sont retirés : celui qui explique POURQUOI la position
    /// ne se charge plus dans le `.task` nomme `nearbyPlaces`, et ferait
    /// rougir la garde tout seul.
    private static func strippingComments(_ source: String) -> String {
        source.split(separator: "\n", omittingEmptySubsequences: false)
            .map { ligne -> String in
                guard let borne = ligne.range(of: "//") else { return String(ligne) }
                return String(ligne[ligne.startIndex..<borne.lowerBound])
            }
            .joined(separator: "\n")
    }

    // MARK: - Les capsules de lieu

    func test_placeChip_namedPlace_showsItsName() {
        XCTAssertEqual(
            StickerPickerView.placeChipTitle(
                SharedPlace(latitude: 1, longitude: 1, name: "Le Marais", address: "Paris")),
            "Le Marais")
    }

    /// Un point posé à la main dont le géocodage n'a rien rendu garde une
    /// capsule lisible : une capsule vide serait intappable au doigt.
    func test_placeChip_namelessPlace_neverShowsAnEmptyChip() {
        XCTAssertFalse(
            StickerPickerView.placeChipTitle(
                SharedPlace(latitude: 1, longitude: 1, name: nil, address: nil)).isEmpty)
        XCTAssertEqual(
            StickerPickerView.placeChipTitle(
                SharedPlace(latitude: 1, longitude: 1, name: nil, address: "12 rue de Rivoli")),
            "12 rue de Rivoli")
    }
}
