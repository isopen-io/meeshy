import XCTest
import MeeshySDK
@testable import Meeshy

/// **Éditer le fond passe par les outils de droite, leurs contrôles s'affichent
/// sous la scène et masquent tout le reste** (#8847, directive porteur
/// 2026-09-30).
///
/// > « l'édition de la vidéo ou image de fond ne doit plus ouvrir l'ancien
/// > éditeur mais juste les outils de droite qui n'ouvrent pas non plus l'ancien
/// > éditeur mais affichent les contrôleurs en bas de la scène en masquant ce
/// > qui y serait […] Quand on a les outils de droite ouverts on n'a pas besoin
/// > d'afficher l'audience ou la publication étant dans un outil ! »
final class ComposerBackgroundToolsTests: XCTestCase {

    // MARK: - Ce que le fond sert EN LIGNE

    func test_sections_fondImage_filtreActionsDescription_sansTempsNiPlan() {
        XCTAssertEqual(ComposerBackgroundTools.sections(isVideo: false, hasTrimmableSource: false),
                       [.media(.filter), .media(.actions), .media(.altText)])
    }

    func test_sections_fondVideo_rognageActionsDescription_sansFiltre() {
        XCTAssertEqual(ComposerBackgroundTools.sections(isVideo: true, hasTrimmableSource: true),
                       [.media(.trim), .media(.actions), .media(.altText)],
                       "un fond dure la slide : ni fenêtre de temps ni plan 2D — des contrôles sans effet")
    }

    // MARK: - Toute porte d'édition du FOND devient une édition en ligne

    func test_redirect_fondSurLaScene_ouvreLesOutilsEnLigne_surLaSectionDemandee() {
        let sections = ComposerBackgroundTools.sections(isVideo: true, hasTrimmableSource: true)
        XCTAssertEqual(
            ComposerBackgroundTools.redirect(objectId: "bg", isBackground: true, onSceneSurface: true,
                                             requested: .media(.trim), served: sections),
            ComposerBackgroundEdit(objectId: "bg", openSection: .media(.trim)))
    }

    func test_redirect_sansSection_ouvreSeulementLeRailDroit() {
        let sections = ComposerBackgroundTools.sections(isVideo: false, hasTrimmableSource: false)
        XCTAssertEqual(
            ComposerBackgroundTools.redirect(objectId: "bg", isBackground: true, onSceneSurface: true,
                                             requested: nil, served: sections),
            ComposerBackgroundEdit(objectId: "bg", openSection: nil))
    }

    func test_redirect_sectionNonServieEnLigne_ouvreLeRailSansPanneau() {
        let sections = ComposerBackgroundTools.sections(isVideo: false, hasTrimmableSource: false)
        XCTAssertEqual(
            ComposerBackgroundTools.redirect(objectId: "bg", isBackground: true, onSceneSurface: true,
                                             requested: .timing, served: sections),
            ComposerBackgroundEdit(objectId: "bg", openSection: nil),
            "jamais l'ancien éditeur pour le fond, même demandé sur une section qu'il servait")
    }

    func test_redirect_horsFondOuHorsScene_laisseLEditeurDObjet() {
        let sections = ComposerBackgroundTools.sections(isVideo: false, hasTrimmableSource: false)
        XCTAssertNil(ComposerBackgroundTools.redirect(objectId: "t1", isBackground: false, onSceneSurface: true,
                                                      requested: nil, served: sections))
        XCTAssertNil(ComposerBackgroundTools.redirect(objectId: "bg", isBackground: true, onSceneSurface: false,
                                                      requested: nil, served: sections),
                     "le document garde son inspecteur")
    }

    // MARK: - Le rail : toucher un outil ouvre ses contrôles, le retoucher les range

    func test_tapped_ouvre_bascule_puisReferme() {
        let rail = ComposerBackgroundEdit(objectId: "bg", openSection: nil)
        let filtre = ComposerBackgroundTools.tapped(.media(.filter), in: rail)
        XCTAssertEqual(filtre.openSection, .media(.filter))
        XCTAssertEqual(ComposerBackgroundTools.tapped(.media(.actions), in: filtre).openSection, .media(.actions))
        XCTAssertNil(ComposerBackgroundTools.tapped(.media(.filter), in: filtre).openSection)
        XCTAssertEqual(ComposerBackgroundTools.tapped(.media(.filter), in: filtre).objectId, "bg")
    }

    // MARK: - L'édition ne survit pas à son fond

    func test_resolved_perdSonFond_seReferme() {
        let edition = ComposerBackgroundEdit(objectId: "bg", openSection: .media(.filter))
        XCTAssertEqual(ComposerBackgroundTools.resolved(edition, backgroundId: "bg", onSceneSurface: true), edition)
        XCTAssertNil(ComposerBackgroundTools.resolved(edition, backgroundId: nil, onSceneSurface: true),
                     "un fond supprimé (ou défait) ne laisse pas l'écran en mode outil")
        XCTAssertNil(ComposerBackgroundTools.resolved(edition, backgroundId: "autre", onSceneSurface: true))
        XCTAssertNil(ComposerBackgroundTools.resolved(edition, backgroundId: "bg", onSceneSurface: false))
        XCTAssertNil(ComposerBackgroundTools.resolved(nil, backgroundId: "bg", onSceneSurface: true))
    }

    // MARK: - La politique du chrome : scène / outil ouvert

    func test_toolFocus_editionDuFond_masqueToutSaufLeRailDroitEtSesControles() {
        let ouvert = ComposerToolFocus.toolIsOpen(railOpensTool: false, editsBackground: true)
        XCTAssertTrue(ouvert)
        let visibles = Set(ComposerToolFocus.Chrome.allCases.filter {
            ComposerToolFocus.isShown($0, toolIsOpen: ouvert)
        })
        XCTAssertEqual(visibles, [.trailingRail, .toolControls],
                       "audience, publication, en-tête, frise des scènes, portes, son et description cèdent à l'outil")
    }

    func test_toolFocus_retourALaScene_rendToutLeChrome() {
        let ouvert = ComposerToolFocus.toolIsOpen(railOpensTool: false, editsBackground: false)
        XCTAssertFalse(ouvert)
        let visibles = Set(ComposerToolFocus.Chrome.allCases.filter {
            ComposerToolFocus.isShown($0, toolIsOpen: ouvert)
        })
        XCTAssertEqual(visibles, Set(ComposerToolFocus.Chrome.allCases).subtracting([.toolControls]))
    }

    // MARK: - La colonne droite en édition du fond

    func test_trailingColumn_editionDuFond_lesOutilsDuFondPuisLeX_etLHistoriqueAuPied() {
        let sections = ComposerBackgroundTools.sections(isVideo: false, hasTrimmableSource: false)
        let focus = ComposerTrailingColumn.focus(
            railMode: .doors([]),
            selection: (sections: sections, actions: [.delete]),
            backgroundTools: (sections: sections, open: .media(.actions)))
        XCTAssertEqual(focus, .backgroundTools(sections: sections, open: .media(.actions)))
        XCTAssertEqual(ComposerTrailingColumn.options(for: focus), [
            .backgroundSection(.media(.filter), isOpen: false),
            .backgroundSection(.media(.actions), isOpen: true),
            .backgroundSection(.media(.altText), isOpen: false),
            .exitTool,
        ])
        XCTAssertEqual(ComposerTrailingColumn.foot(for: focus, timeServed: true), [.undo, .redo],
                       "annuler et rétablir restent pendant l'outil (#8712)")
    }

    func test_trailingColumn_unOutilDeDessinOuvert_lEmporteSurLeFond() {
        let controle = ComposerToolControl(id: "pen", symbolName: "pencil", label: "Stylo", isExpanded: false)
        let focus = ComposerTrailingColumn.focus(
            railMode: .tool([controle]),
            selection: nil,
            backgroundTools: (sections: [.media(.filter)], open: nil))
        XCTAssertEqual(focus, .tool([controle]))
    }

    func test_backgroundSection_peintSonEtatOuvert() {
        XCTAssertTrue(ComposerTrailingColumnPaint(.backgroundSection(.media(.filter), isOpen: true)).isOn)
        XCTAssertFalse(ComposerTrailingColumnPaint(.backgroundSection(.media(.filter), isOpen: false)).isOn)
    }

    // MARK: - Aucune porte vers l'ancien éditeur pour le fond

    func test_openObjectEditor_consulteLaRedirectionDuFond_avantDOuvrirLEcranPleinEcran() throws {
        let hote = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost+Intake.swift")
        let corps = try XCTUnwrap(hote.range(of: "func openObjectEditor(")
            .map { String(hote[$0.lowerBound...].prefix(900)) })
        let redirection = try XCTUnwrap(corps.range(of: "backgroundToolsRedirect("))
        let ecran = try XCTUnwrap(corps.range(of: "editedObject = ComposerEditedObject"))
        XCTAssertLessThan(redirection.lowerBound, ecran.lowerBound,
                          "le site unique d'ouverture doit rendre le fond aux outils en ligne")
    }

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }
}
