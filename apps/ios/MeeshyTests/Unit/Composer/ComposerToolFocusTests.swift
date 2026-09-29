import XCTest
import MeeshyUI
@testable import Meeshy

/// **Un outil ouvert prend TOUTE la place** (#8652, directive porteur
/// 2026-09-29).
///
/// > « Actuellement la version actuelle ouvre le rail des outils de texte qui
/// > apparaissent à côté en surplus. Il faudrait enlever le rail d'en-tête (X)
/// > (…) etc., les tools de la scène principale laissent place aux tools de
/// > l'outil sélectionné avec (X), et le rail du bas audience, publication ;
/// > les (+) n'ont pas besoin d'être là quand un outil est ouvert ! »
///
/// Remplace les témoins de la colonne « à droite de la porte » (#8558), que
/// la directive révoque : ils gardaient exactement le surplus visé.
final class ComposerToolFocusTests: XCTestCase {

    private static let portesAvecOutils: [ComposerRailDoor] = [.media, .drawing, .text, .sticker]

    // MARK: - Le rail : les contrôleurs REMPLACENT les portes

    @MainActor
    func test_resolve_texteEnSaisie_remplaceLesPortesParSesReglages() {
        let mode = ComposerRailMode.resolve(drawing: false, textEditing: true,
                                            expandedDrawingTool: nil, expandedTextTool: .color,
                                            doors: Self.portesAvecOutils)
        guard case .tool(let controles) = mode else { return XCTFail("attendu : les réglages seuls, reçu \(mode)") }
        XCTAssertEqual(controles.map(\.id), TextEditTool.all.map { "text.\($0.rawValue)" })
        XCTAssertEqual(controles.filter(\.isExpanded).map(\.id), ["text.color"])
        XCTAssertTrue(mode.opensTool)
    }

    @MainActor
    func test_resolve_dessinPrimeSurLeTexte() {
        let mode = ComposerRailMode.resolve(drawing: true, textEditing: true,
                                            expandedDrawingTool: nil, expandedTextTool: nil,
                                            doors: Self.portesAvecOutils)
        guard case .tool(let controles) = mode else { return XCTFail("attendu : les réglages seuls, reçu \(mode)") }
        XCTAssertTrue(controles.allSatisfy { $0.id.hasPrefix("drawing.") })
    }

    @MainActor
    func test_resolve_sansOutilOuvert_rendLesPortes() {
        let mode = ComposerRailMode.resolve(drawing: false, textEditing: false,
                                            expandedDrawingTool: nil, expandedTextTool: nil,
                                            doors: Self.portesAvecOutils)
        XCTAssertEqual(mode, .doors(Self.portesAvecOutils))
        XCTAssertFalse(mode.opensTool)
    }

    // MARK: - Le chrome : une bascule, sans reste

    func test_isShown_outilOuvert_neLaisseQueSesControleurs() {
        let servis = ComposerToolFocus.Chrome.allCases.filter {
            ComposerToolFocus.isShown($0, toolIsOpen: true)
        }
        XCTAssertEqual(servis, [.toolControls],
                       "en-tête, portes, rail droit et ses (+), socle, trace du son et description cèdent")
    }

    func test_isShown_outilFerme_rendLeChromeDAvant_sansLesControleurs() {
        let servis = Set(ComposerToolFocus.Chrome.allCases.filter {
            ComposerToolFocus.isShown($0, toolIsOpen: false)
        })
        XCTAssertEqual(servis, Set(ComposerToolFocus.Chrome.allCases).subtracting([.toolControls]))
    }

    func test_transition_reduceMotion_coupeLeFondu() {
        XCTAssertNil(ComposerToolFocus.transition(reduceMotion: true))
        XCTAssertNotNil(ComposerToolFocus.transition(reduceMotion: false))
    }

    /// VoiceOver annonce les RÉGLAGES de l'outil quand ils occupent le rail —
    /// plus « Ajouter à la scène », qui serait faux à cet instant.
    @MainActor
    func test_leRail_occupeParUnOutil_sAnnonceCommeSesReglages() throws {
        XCTAssertNotEqual(ComposerRailCopy.toolRailLabel, ComposerRailCopy.railLabel)
        let rail = try source("Meeshy/Features/Main/Composer/ComposerLeadingRail.swift")
        XCTAssertTrue(rail.contains("mode.opensTool ? ComposerRailCopy.toolRailLabel : ComposerRailCopy.railLabel"))
    }

    // MARK: - Les sites de montage demandent à la règle

    func test_surface_neMonteAucuneColonneEnSurplus_etCedeSonChrome() throws {
        let surface = try source("Meeshy/Features/Main/Composer/ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("struct ComposerSceneSurface"), "le fichier lu n'est pas la surface")
        for interdit in ["flyoutColumn", "ComposerRailFlyoutAnchorKey", ".flyout("] {
            XCTAssertFalse(surface.contains(interdit), "la colonne en surplus est revenue : \(interdit)")
        }
        for question in [".topBar", ".trailingRail", ".description"] {
            XCTAssertTrue(surface.contains("ComposerToolFocus.isShown(\(question), toolIsOpen: toolIsOpen)"),
                          "\(question) doit céder à l'outil par la règle")
        }
        XCTAssertTrue(surface.contains("onExitTool: onRailExitTool"),
                      "le rail de gauche porte le (x) de l'outil")
    }

    func test_hote_effaceLeSocle_quandUnOutilDeLaSceneEstOuvert() throws {
        let hote = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(hote.contains("ComposerToolFocus.isShown(.socle, toolIsOpen: sceneToolOwnsScreen)"))
        XCTAssertTrue(hote.contains("railMode: sceneRailMode"),
                      "la surface et le socle lisent le MÊME mode")
        XCTAssertFalse(hote.contains("anchorsToDoor"))
    }

    // MARK: - La géométrie des boutons flottants (#8558, inchangée)

    func test_lesBoutonsFlottants_sontPlusPetits_etPlusHauts() {
        XCTAssertLessThan(ComposerRailGeometry.floatingButtonSize, ComposerRailGeometry.railWidth)
        XCTAssertEqual(ComposerRailGeometry.railWidth, 44, "la cible tactile ne rétrécit pas")
        XCTAssertGreaterThanOrEqual(ComposerRailGeometry.floatingBottomInset,
                                    ComposerRailGeometry.gutter + ComposerRailGeometry.railWidth)
    }

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }
}
