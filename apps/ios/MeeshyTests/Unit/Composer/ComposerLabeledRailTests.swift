import XCTest
@testable import Meeshy

/// **Les deux rails libellés du grand écran** (#13839, L6, maquette du 2026-10-30).
///
/// À gauche, ce qu'on AJOUTE : Fermer · Texte · Média · Sticker · Son · Dessin · Fond · Mention · Lieu (#14050),
/// puis les entrées de ⋯ qui
/// tiennent dans la hauteur, puis « ⋯ Plus » pour le reste. Aucune entrée n'est perdue : ce que le rail ne pose pas,
/// Plus le sert. À droite, « SÉLECTION » : les actions de la barre de L5, vide sans sélection.
final class ComposerLabeledRailTests: XCTestCase {

    private let outils: [ComposerRestTool] = [.text, .media, .sticker, .sound, .drawing, .background, .mention,
                                              .place, .more]
    private let menu: [ComposerMoreMenuEntry] = [.addSlide, .animation, .slideDuration, .legend, .hashtags, .preview,
                                                 .saveToPhotos, .clearAll]

    private func layout(height: CGFloat, entries: [ComposerMoreMenuEntry]? = nil,
                        tools: [ComposerRestTool]? = nil) -> ComposerLabeledRailLayout.Layout {
        ComposerLabeledRailLayout.resolve(tools: tools ?? outils, moreEntries: entries ?? menu,
                                          availableHeight: height, rowHeight: 44, spacing: 4)
    }

    private func rowHeight(_ rows: Int) -> CGFloat { CGFloat(rows) * 44 + CGFloat(rows - 1) * 4 }

    // MARK: - L'ordre de la maquette

    func test_resolve_short_rail_servesCloseTheFiveToolsBackgroundMentionPlaceThenPlus() {
        let rail = layout(height: rowHeight(10))
        XCTAssertEqual(rail.rows, [.close, .tool(.text), .tool(.media), .tool(.sticker), .tool(.sound),
                                   .tool(.drawing), .tool(.background), .tool(.mention), .tool(.place), .plus])
    }

    func test_resolve_tallRail_promotesTheMoreEntriesThatFit_inTheirMenuOrder() {
        let rail = layout(height: rowHeight(13))
        XCTAssertEqual(Array(rail.rows.suffix(4)), [.more(.addSlide), .more(.slideDuration), .more(.legend), .plus])
    }

    func test_resolve_neverPromotesTheAnimationSubmenuNorTheDestructiveClearAll() {
        let rail = layout(height: 10_000)
        XCTAssertFalse(rail.rows.contains(.more(.animation)), "Animation est un sous-menu : il reste derrière Plus")
        XCTAssertFalse(rail.rows.contains(.more(.clearAll)), "Tout effacer demande sa confirmation, derrière Plus")
        XCTAssertEqual(rail.plus, [.animation, .clearAll])
        XCTAssertEqual(rail.rows.last, .plus)
    }

    func test_resolve_nothingIsLost_everyMoreEntryIsOnTheRailOrBehindPlus() {
        for height in stride(from: CGFloat(0), through: 900, by: 37) {
            let rail = layout(height: height)
            let posees = rail.rows.compactMap { entree -> ComposerMoreMenuEntry? in
                if case .more(let e) = entree { return e } else { return nil }
            }
            XCTAssertEqual(Set(posees + rail.plus), Set(menu), "hauteur \(height)")
            XCTAssertTrue(Set(posees).isDisjoint(with: Set(rail.plus)), "une entrée n'est jamais servie deux fois")
        }
    }

    func test_resolve_withABackgroundMedia_keepsFond_andItsEffectsMayFit() {
        let rail = layout(height: rowHeight(13), entries: [.transitions, .visualEffect, .backgroundFraming, .clearAll])
        XCTAssertTrue(rail.rows.contains(.tool(.background)), "Fond sélectionne alors le fond posé")
        XCTAssertEqual(Array(rail.rows.suffix(4)), [.more(.transitions), .more(.visualEffect),
                                                    .more(.backgroundFraming), .plus])
    }

    func test_resolve_withoutAnOfferedDoor_dropsItsTool() {
        let rail = layout(height: rowHeight(8), tools: [.text, .media, .more])
        XCTAssertEqual(Array(rail.rows.prefix(3)), [.close, .tool(.text), .tool(.media)])
        XCTAssertFalse(rail.rows.contains(.tool(.more)), "⋯ devient « Plus », jamais une rangée d'outil")
    }

    // MARK: - L'outil ouvert est surligné

    func test_openEntry_followsTheGestureInProgress() {
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: true, typing: false, portal: nil,
                                                           band: nil, effect: nil), .tool(.drawing))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: true, portal: nil,
                                                           band: nil, effect: nil), .tool(.text))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: .sticker,
                                                           band: nil, effect: nil), .tool(.sticker))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: .soundLibrary,
                                                           band: nil, effect: nil), .tool(.sound))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: .background,
                                                           band: nil, effect: nil), .tool(.background))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: .reference,
                                                           band: nil, effect: nil), .tool(.mention))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: .location,
                                                           band: nil, effect: nil), .tool(.place))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: nil,
                                                           band: .palette, effect: nil), .tool(.background))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: .slideDuration,
                                                           band: nil, effect: nil), .more(.slideDuration))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: nil,
                                                           band: .frame, effect: nil), .more(.backgroundFraming))
        XCTAssertEqual(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: nil,
                                                           band: nil, effect: .opening), .more(.transitions))
        XCTAssertNil(ComposerLabeledRailLayout.openEntry(drawing: false, typing: false, portal: nil,
                                                         band: nil, effect: nil), "au repos, rien n'est surligné")
    }

    // MARK: - Les rails se taisent sans libérer leur place

    func test_railsAreServed_silentWhileTypingOrAtTheViewfinder() {
        XCTAssertTrue(ComposerLabeledRailLayout.railsAreServed(writesText: false, cameraIsArmed: false),
                      "au repos, sous une feuille ou un outil, les rails parlent")
        XCTAssertFalse(ComposerLabeledRailLayout.railsAreServed(writesText: true, cameraIsArmed: false))
        XCTAssertFalse(ComposerLabeledRailLayout.railsAreServed(writesText: false, cameraIsArmed: true))
    }

    func test_railsSurface_staysInPlace_andAnswersEveryTool() throws {
        let surface = try ComposerSceneArrangementTests.source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("onTool: { onRestTool?($0) }"), "le rail ouvre ce que la colonne ouvrait")
        XCTAssertTrue(surface.contains("onMore: rails.onMore"))
        XCTAssertTrue(surface.contains("objectSelection: selectionColumn.map { ComposerSelectionRail(selection: $0) }"),
                      "les options de l'objet prennent la place du rail des outils, par le même relais (#13957)")
        XCTAssertTrue(surface.contains("selection: ComposerSelectionRail(selection: nil, onUndo: onUndo, onRedo: onRedo)"),
                      "le rail droit ne garde que l'historique")
        let feuille = try ComposerSceneArrangementTests.source("MeeshyComposerHost+AnchoredSheet.swift")
        XCTAssertTrue(feuille.contains(".frame(maxWidth: ComposerSceneArrangementRelay(host: host).sheetWidth)"),
                      "une feuille se pose dans la colonne de la scène, sans couvrir les rails")
        let couches = try ComposerSceneArrangementTests.source("MeeshyComposerHost+Layers.swift")
        XCTAssertTrue(couches.contains("host.socleSlot.frame(maxWidth: ComposerSceneArrangementRelay(host: host).publishWidth)"),
                      "Publier se pose sous la scène, à sa largeur ou au moins 300 pt")
        XCTAssertTrue(couches.contains("host.composerStage.modifier(ComposerSceneArrangementProbe(host: host))"),
                      "la racine du meuble nourrit la loi de sa taille")
    }

    // MARK: - Les mots

    func test_copy_plusAndSelectionAreLocalised() {
        XCTAssertFalse(ComposerLabeledRailCopy.plus.isEmpty)
        XCTAssertFalse(ComposerLabeledRailCopy.selection.isEmpty)
        XCTAssertEqual(ComposerLabeledRailCopy.label(.close), ComposerDocumentCopy.close)
        XCTAssertEqual(ComposerLabeledRailCopy.label(.tool(.sticker)), ComposerRestChromeCopy.label(.sticker))
        XCTAssertEqual(ComposerLabeledRailCopy.label(.more(.legend)), ComposerMoreMenuCopy.label(.legend))
        XCTAssertEqual(ComposerLabeledRailCopy.label(.plus), ComposerLabeledRailCopy.plus)
    }

    func test_title_isTheShortWordOfTheMockup_voiceOverKeepsTheSentence() {
        XCTAssertNotEqual(ComposerLabeledRailCopy.title(.tool(.media)), ComposerLabeledRailCopy.label(.tool(.media)),
                          "« Ajouter du contenu » ne tient pas dans 112 pt : le rail dit « Média »")
        for entree in [ComposerLabeledRailEntry.tool(.text), .tool(.media), .tool(.sticker), .tool(.sound),
                       .tool(.drawing), .tool(.background), .tool(.mention), .more(.hashtags), .tool(.place),
                       .more(.addSlide), .more(.saveToPhotos), .more(.share)] {
            XCTAssertLessThanOrEqual(ComposerLabeledRailCopy.title(entree).count, 12, "\(entree)")
        }
    }

    /// **Chaque rangée que le rail peut poser a son mot court, dans les sept langues** : un libellé de ⋯ repris tel
    /// quel (« Retirer le fond de la scène », « Vista previa ») ne tient pas dans 112 pt et se tronque.
    func test_title_everyRowTheRailMayServe_hasAShortWordInEveryLanguage() throws {
        let promouvables = ComposerMoreMenuEntry.allCases.filter { $0 != .animation && $0 != .clearAll }
        let cles = promouvables.map { "composer.rail.title.\($0.rawValue)" }
            + ["text", "media", "sticker", "sound", "drawing", "background", "mention", "place"]
                .map { "composer.rail.title.\($0)" }
        let catalogue = try Self.catalogue()
        for cle in cles {
            let valeurs = try XCTUnwrap(catalogue[cle], "\(cle) manque au catalogue")
            XCTAssertEqual(Set(valeurs.keys), ["fr", "en", "es", "de", "it", "pt-BR", "ar"], cle)
            for (langue, mot) in valeurs {
                XCTAssertLessThanOrEqual(mot.count, 11, "\(cle) [\(langue)] « \(mot) » se tronque dans le rail")
            }
        }
        for entree in promouvables {
            XCTAssertFalse(ComposerLabeledRailCopy.title(.more(entree)).isEmpty, "\(entree)")
            XCTAssertLessThanOrEqual(ComposerLabeledRailCopy.title(.more(entree)).count, 11, "\(entree)")
        }
    }

    private static func catalogue() throws -> [String: [String: String]] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let racine = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let chaines = racine?["strings"] as? [String: Any] ?? [:]
        return chaines.compactMapValues { entree -> [String: String]? in
            guard let langues = (entree as? [String: Any])?["localizations"] as? [String: Any] else { return nil }
            return langues.compactMapValues { (($0 as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String }
        }
    }

    // MARK: - Des titres au même corps (#13899)

    /// Chaque rangée rétrécissait SON mot jusqu'à 70 % pour le faire tenir :
    /// « Durée » restait à pleine taille, « Hashtags » et « Partager » fondaient
    /// chacun à sa mesure. Les titres gardent tous le même corps, et un mot
    /// trop long passe à la ligne.
    func test_row_keepsOneTypeSizeForEveryTitle_andWrapsALongOne() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let fichier = AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent("Meeshy/Features/Composer/ComposerLabeledRail.swift"), encoding: .utf8))
        let debut = try XCTUnwrap(fichier.range(of: "struct ComposerLabeledRailRow: View {"))
        let fin = try XCTUnwrap(fichier.range(of: "struct ComposerLabeledRail: View {"))
        let rangee = String(fichier[debut.upperBound..<fin.lowerBound])
        XCTAssertFalse(rangee.contains("minimumScaleFactor"), "un titre ne rétrécit plus seul")
        XCTAssertTrue(rangee.contains(".lineLimit(2)"), "un titre long passe à la ligne")
    }
}
