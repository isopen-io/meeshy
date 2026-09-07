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
    ///
    /// **Le LIEU les a rejoints le 2026-09-05** (directive porteur) : ses dix
    /// styles n'ont pas besoin du GPS — seule la DONNÉE en a besoin. Une palette
    /// nue ne perd donc plus qu'un seul onglet, « Mes stickers », qui n'a
    /// littéralement rien à montrer sans son magasin. C'est le SEUL que la
    /// loi 4 retire encore ici, et le contraste est ce qui rend ce témoin
    /// lisible.
    func test_threeTabs_neverDependOnAProvider() {
        let nu = StickerPaletteTab.offered(hasLibrary: false, hasNearbyPlaces: false)
        XCTAssertEqual(nu, StickerPaletteTab.canonicalOrder.filter { $0 != .library })
        XCTAssertTrue(nu.contains(.emoji) && nu.contains(.text) && nu.contains(.love) && nu.contains(.time))
        XCTAssertTrue(nu.contains(.place), "les styles de lieu ne dépendent pas du GPS")
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

    /// **Le lieu fait exception, et c'est la loi 4 bien lue** (directive porteur
    /// 2026-09-05, inversion du contrat d'avant).
    ///
    /// Ce témoin exigeait l'inverse — pas de fournisseur, pas d'onglet — au nom
    /// de « un outil qu'on ne peut pas servir est absent, jamais grisé ». Le
    /// motif est juste ; il ne s'appliquait pas. **Les dix styles de lieu n'ont
    /// pas besoin du GPS : seule la DONNÉE en a besoin.** Autorisation refusée,
    /// simulateur sans position, intérieur d'un bâtiment — et le catalogue
    /// entier disparaissait, dessinateurs et traductions compris.
    ///
    /// > « On ne peut pas servir » et « on n'a pas encore de quoi remplir » sont
    /// > deux états différents, et un seul justifie une absence. Le second se
    /// > dit, il ne se cache pas.
    ///
    /// La bibliothèque, elle, garde l'ancienne règle : sans magasin derrière,
    /// « Mes stickers » ne peut rien montrer, jamais — c'est le contraste qui
    /// rend ce témoin lisible.
    func test_placeTab_staysOfferedWithoutItsProvider() {
        XCTAssertTrue(
            StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: false).contains(.place),
            "les styles de lieu ne dépendent pas du GPS — seule la donnée en dépend")
        XCTAssertTrue(
            StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: false).contains(.emoji),
            "et le lieu ne doit pas emporter les onglets voisins")
        XCTAssertFalse(
            StickerPaletteTab.offered(hasLibrary: false, hasNearbyPlaces: false).contains(.library),
            "la bibliothèque, elle, reste absente sans magasin : elle n'a RIEN à montrer")
    }

    /// L'ordre est celui que les doigts apprennent : il vient de la liste
    /// canonique, jamais de l'ordre de déclaration de l'enum.
    func test_offeredTabs_keepTheCanonicalOrder() {
        let tous = StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: true)
        XCTAssertEqual(tous, StickerPaletteTab.canonicalOrder)
        XCTAssertEqual(tous.first, .emoji, "l'emoji ouvre la marche")
        XCTAssertEqual(tous.last, .library, "« Mes stickers » ferme la marche")
        XCTAssertEqual(Set(tous), Set(StickerPaletteTab.allCases), "chaque onglet est servi quand tout est injecté")
    }

    func test_eachTab_mapsToTheRightTemplateFamily() {
        XCTAssertEqual(StickerPaletteTab.love.templateFamily, .love)
        XCTAssertEqual(StickerPaletteTab.time.templateFamily, .time)
        XCTAssertEqual(StickerPaletteTab.weather.templateFamily, .weather)
        XCTAssertEqual(StickerPaletteTab.text.templateFamily, .text)
        // Chaque famille du catalogue a son onglet, et un seul.
        for famille in StickerTemplateFamily.allCases {
            XCTAssertEqual(StickerPaletteTab.allCases.filter { $0.templateFamily == famille }.count, 1,
                           "\(famille.rawValue) — une famille, un onglet")
        }
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
    /// le `.task` ne doit pas nommer le fournisseur, et le déclencheur doit le
    /// nommer.
    ///
    /// **Le DÉCLENCHEUR a changé au #5012, la règle non.** Le ruban d'onglets
    /// est devenu une liste de sections : il n'y a plus d'« entrée dans
    /// l'onglet » à observer, et c'est l'apparition de la SECTION qui dit
    /// désormais l'intérêt — la `LazyVStack` ne la construit qu'en arrivant
    /// dessus. Ce témoin RE-VISE ; il ne s'allège pas, et il garde la moitié
    /// qui n'a pas bougé : le `.task` de la feuille ne doit toujours pas
    /// nommer le fournisseur.
    ///
    /// **Le déclencheur a de nouveau changé au #5407** : la garde
    /// d'idempotence (`nearbyPlaces.nearby()` + `places.isEmpty`) a quitté le
    /// corps du déclencheur pour un site UNIQUE, `chercheLesLieuxSiBesoin()`
    /// (`StickerPickerView+Templates.swift`), partagé par les deux moments où
    /// les lieux peuvent devenir chargeables (arrivée sur la section, arrivée
    /// tardive du fournisseur). Ce témoin suit le déplacement : il vérifie
    /// SÉPARÉMENT que le déclencheur de section APPELLE le site unique, et
    /// que le site unique porte toujours la garde.
    func test_thePlaceProvider_isCalledOnTabEntry_notOnSheetOpen() throws {
        let code = Self.strippingComments(
            try String(contentsOf: Self.pickerSourceURL, encoding: .utf8))

        let task = try XCTUnwrap(Self.blockBody(after: ".task {", in: code),
                                 "Le bloc `.task` de la feuille est introuvable.")
        XCTAssertFalse(task.contains("nearbyPlaces"),
                       "La palette demande la position dès son ouverture — l'alerte système "
                        + "surgit par-dessus la grille d'emoji, sans motif visible.")

        let sections = Self.strippingComments(
            try String(contentsOf: Self.verticalSourceURL, encoding: .utf8))

        // Le cas `.place` du switch qui construit chaque section porte le
        // déclencheur — la `LazyVStack` ne le construit qu'en arrivant dessus,
        // ce qui EST le motif visible que le doc-comment exige.
        let placeCase = try XCTUnwrap(Self.blockBody(after: "case .place:", in: sections),
                                       "Le déclencheur de la section Lieu est introuvable — personne ne chargerait les lieux.")
        XCTAssertTrue(placeCase.contains("chercheLesLieuxSiBesoin()"),
                      "Personne n'appelle le chargement des lieux à l'arrivée sur la section.")
        XCTAssertFalse(placeCase.contains("nearbyPlaces"),
                       "Le déclencheur devrait déléguer au site unique (#5407), pas relire le "
                        + "fournisseur directement — la garde d'idempotence vivrait à deux endroits.")

        // La garde d'idempotence elle-même vit au site UNIQUE #5407, partagé
        // par les deux déclencheurs (arrivée de section, arrivée du
        // fournisseur) — jamais recopiée à chaque appelant.
        let templates = Self.strippingComments(
            try String(contentsOf: Self.templatesSourceURL, encoding: .utf8))
        let chercheLesLieux = try XCTUnwrap(
            Self.blockBody(after: "func chercheLesLieuxSiBesoin() {", in: templates),
            "Le site unique de chargement des lieux (#5407) est introuvable.")
        XCTAssertTrue(chercheLesLieux.contains("nearbyPlaces.nearby()"),
                      "Personne ne charge les lieux : la section resterait vide à jamais.")
        XCTAssertTrue(chercheLesLieux.contains("places.isEmpty"),
                      "Sans garde d'idempotence, revenir sur la section relance une recherche.")

        // **Et le déclencheur ne remonte pas d'un cran.** Le poser sur la liste
        // entière, ou sur l'interrupteur de nature, ramènerait exactement le
        // défaut que ce témoin existe pour interdire : la position demandée
        // avant que l'auteur ait montré le moindre intérêt pour un lieu.
        XCTAssertFalse(Self.blockBody(after: "var tabbedContent: some View {", in: sections)?
                        .contains("nearbyPlaces") ?? false,
                       "Le chargement est remonté au conteneur : il se déclencherait "
                        + "dès l'affichage de la nature « sticker ».")
    }

    private static var verticalSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StickerPickerView+Vertical.swift")
    }

    private static var pickerSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StickerPickerView.swift")
    }

    private static var templatesSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StickerPickerView+Templates.swift")
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
