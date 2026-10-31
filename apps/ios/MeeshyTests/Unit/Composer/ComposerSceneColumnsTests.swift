import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La géographie des rails de la scène plein écran** (#8713, #8714 —
/// directive porteur 2026-09-29).
final class ComposerSceneColumnsTests: XCTestCase {

    private func control(_ id: String) -> ComposerToolControl {
        ComposerToolControl(id: id, symbolName: "pencil.tip", label: id, isExpanded: false)
    }

    // MARK: - Rail gauche : l'éclair puis le Cadre, après le lieu (#8713)

    func test_served_eclairPuisCadre_dansCetOrdre() {
        XCTAssertEqual(ComposerLeadingSceneToggles.served(animated: true, frame: true), [.animated, .frame])
        XCTAssertEqual(ComposerLeadingSceneToggles.served(animated: true, frame: false), [.animated])
        XCTAssertEqual(ComposerLeadingSceneToggles.served(animated: false, frame: true), [.frame],
                       "sans média de fond, pas de Cadre ; sans éclair, le Cadre garde sa place relative")
        XCTAssertEqual(ComposerLeadingSceneToggles.served(animated: false, frame: false), [])
    }

    func test_anchor_rangeeQuiPorteLeLieu_seRangeApresLeLieu() {
        let story = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors, format: .story, allowsCapture: true)
            .filter { $0.level(for: .story).appearsOnCanvas }
        XCTAssertTrue(story.contains(.place), "prémisse : en Story, le lieu vit à gauche")
        XCTAssertEqual(ComposerLeadingSceneToggles.anchor(in: story), .place)
    }

    func test_anchor_rangeeSansLieu_seRangeApresLaDernierePorte() {
        XCTAssertEqual(ComposerLeadingSceneToggles.anchor(in: [.media, .text, .drawing]), .drawing)
        XCTAssertNil(ComposerLeadingSceneToggles.anchor(in: []))
    }

    func test_symbol_eclairEtCadre_gardentLeursGlyphes() {
        XCTAssertEqual(ComposerSceneToggle.animated.symbol, "bolt.fill")
        XCTAssertEqual(ComposerSceneToggle.frame.symbol, "crop")
    }

    // MARK: - Rail droit : l'historique TOUJOURS en bas (#8713)

    func test_foot_outilOuvert_garderLHistorique_sansTemps() {
        XCTAssertEqual(ComposerTrailingColumn.foot(for: .tool([control("drawing.tool")]), timeServed: true),
                       [.undo, .redo])
    }

    func test_foot_sceneAnimee_tempsAuDessusDeLHistorique() {
        XCTAssertEqual(ComposerTrailingColumn.foot(for: .scene(effects: [], open: nil), timeServed: true), [.time, .undo, .redo])
        XCTAssertEqual(ComposerTrailingColumn.foot(for: .scene(effects: [], open: nil), timeServed: false), [.undo, .redo])
    }

    func test_options_outilOuvert_sesControleursPuisSaSortie() {
        let controles = [control("drawing.tool"), control("drawing.color")]
        XCTAssertEqual(ComposerTrailingColumn.options(for: .tool(controles)),
                       [.toolControl(controles[0]), .toolControl(controles[1]), .exitTool])
    }

    func test_options_sceneAuRepos_aucuneOption() {
        XCTAssertEqual(ComposerTrailingColumn.options(for: .scene(effects: [], open: nil)), [])
    }

    func test_toolFocus_outilOuvert_leRailDroitResteLesPortesSEffacent() {
        XCTAssertTrue(ComposerToolFocus.isShown(.trailingRail, toolIsOpen: true),
                      "undo/redo restent en bas même quand le dessin est ouvert")
        XCTAssertTrue(ComposerToolFocus.isShown(.trailingRail, toolIsOpen: false))
        XCTAssertFalse(ComposerToolFocus.isShown(.sceneDoors, toolIsOpen: true))
        XCTAssertTrue(ComposerToolFocus.isShown(.toolControls, toolIsOpen: true))
    }

    func test_historyReserve_gardeLaPlaceDesBoutonsServis() {
        XCTAssertEqual(ComposerRailGeometry.historyReserve(undo: false, redo: false), 0)
        XCTAssertEqual(ComposerRailGeometry.historyReserve(undo: true, redo: true),
                       2 * (ComposerRailGeometry.railWidth + ComposerRailGeometry.floatingEntrySpacing))
    }

    // MARK: - Un objet en édition : la colonne se tait (#13839, L5)
    //
    // Le rail de 8 à 15 glyphes sans libellé et son ✕ « Quitter l'objet » sont
    // partis : les actions d'un élément vivent dans la barre de la sélection
    // (`ComposerSelectionActions`), ses réglages dans la feuille Modifier.

    func test_focus_outilOuvert_lEmporteSurUneSelection() {
        let controles = [control("drawing.tool")]
        let focus = ComposerTrailingColumn.focus(railMode: .tool(controles), objectIsEdited: true)
        XCTAssertEqual(focus, .tool(controles))
    }

    func test_focus_objetEnEditionSansOutil_rendLObjet() {
        XCTAssertEqual(ComposerTrailingColumn.focus(railMode: .doors([.media]), objectIsEdited: true), .object)
        XCTAssertEqual(ComposerTrailingColumn.focus(railMode: .doors([]), objectIsEdited: false),
                       .scene(effects: [], open: nil))
    }

    func test_options_objetEnEdition_aucuneOptionAuRail() {
        XCTAssertEqual(ComposerTrailingColumn.options(for: .object), [],
                       "ni glyphe sans libellé, ni ✕ collé à la corbeille")
    }

    func test_foot_objetEnEdition_garderLHistorique() {
        XCTAssertEqual(ComposerTrailingColumn.foot(for: .object, timeServed: true), [.undo, .redo])
    }

    func test_isExit_seuleLaSortieDOutilEchappeAuDefilement() {
        XCTAssertTrue(ComposerTrailingColumn.Entry.exitTool.isExit)
        XCTAssertFalse(ComposerTrailingColumn.Entry.sceneEffect(.visual, isOpen: false).isExit)
    }

    // MARK: - Les effets d'une scène à fond média (#8712, #8792)

    func test_served_fondImage_ouvertureEtEffetVisuel_deuxFamilles() {
        XCTAssertEqual(ComposerSceneEffects.served(background: .image), [.opening, .visual],
                       "deux familles nettes : l'effet d'ouverture (et sa fermeture) puis l'effet visuel")
    }

    func test_served_fondVideo_sansEffetVisuel() {
        XCTAssertEqual(ComposerSceneEffects.served(background: .video), [.opening],
                       "le filtre ne se cuit que dans une image : sur une vidéo il serait inerte")
    }

    func test_served_sansFondMedia_aucuneColonne() {
        XCTAssertEqual(ComposerSceneEffects.served(background: nil), [])
    }

    func test_symbol_deuxFamilles_deuxIcones() {
        XCTAssertNotEqual(ComposerSceneEffect.opening.symbol, ComposerSceneEffect.visual.symbol)
    }

    func test_label_deuxFamilles_deuxNoms() {
        XCTAssertNotEqual(ComposerSceneEffectCopy.label(.opening), ComposerSceneEffectCopy.label(.visual))
    }

    func test_options_sceneAFondMedia_effetsDeHautEnBas_ouvertMarque() {
        let options = ComposerTrailingColumn.options(for: ComposerTrailingColumn.focus(
            railMode: .doors([]), objectIsEdited: false,
            effects: [.opening, .visual], openEffect: .opening))
        XCTAssertEqual(options, [.sceneEffect(.opening, isOpen: true), .sceneEffect(.visual, isOpen: false)])
        XCTAssertFalse(options.contains(where: \.isExit), "la scène n'a pas de mode à quitter")
    }

    func test_focus_effetOuvertNonServi_nEstPasMarque() {
        XCTAssertEqual(ComposerTrailingColumn.focus(railMode: .doors([]), objectIsEdited: false,
                                                    effects: [.opening], openEffect: .visual),
                       .scene(effects: [.opening], open: nil))
    }

    func test_focus_objetTouche_remplaceLesEffets() {
        let focus = ComposerTrailingColumn.focus(railMode: .doors([]), objectIsEdited: true,
                                                 effects: [.visual], openEffect: .visual)
        XCTAssertEqual(focus, .object)
    }

    func test_toggled_retoucherLEffetOuvert_leReferme() {
        XCTAssertEqual(ComposerSceneEffects.toggled(.visual, open: nil), .visual)
        XCTAssertNil(ComposerSceneEffects.toggled(.visual, open: .visual))
        XCTAssertEqual(ComposerSceneEffects.toggled(.opening, open: .visual), .opening)
    }

    func test_carousel_neVitQueSurUneSceneLibre() {
        XCTAssertEqual(ComposerSceneEffects.carousel(open: .visual, served: [.visual],
                                                     objectSelected: false, toolIsOpen: false), .visual)
        XCTAssertNil(ComposerSceneEffects.carousel(open: .visual, served: [.opening],
                                                   objectSelected: false, toolIsOpen: false),
                     "un fond devenu vidéo referme le carrousel des effets visuels")
        XCTAssertNil(ComposerSceneEffects.carousel(open: .visual, served: [.visual],
                                                   objectSelected: true, toolIsOpen: false))
        XCTAssertNil(ComposerSceneEffects.carousel(open: .visual, served: [.visual],
                                                   objectSelected: false, toolIsOpen: true))
    }

    // MARK: - Choisir un effet REJOUE l'ouverture puis la fermeture (#8792)

    private let courant = ComposerSceneEffects.Transitions(opening: .zoom, closing: .fade)

    func test_transitions_choisirUneOuverture_gardeLaFermeture() {
        XCTAssertEqual(ComposerSceneEffects.transitions(after: .opening(.slide), from: courant),
                       .init(opening: .slide, closing: .fade))
    }

    func test_transitions_choisirUneFermeture_gardeLOuverture() {
        XCTAssertEqual(ComposerSceneEffects.transitions(after: .closing(.reveal), from: courant),
                       .init(opening: .zoom, closing: .reveal))
        XCTAssertEqual(ComposerSceneEffects.transitions(after: .closing(nil), from: courant),
                       .init(opening: .zoom, closing: nil))
    }

    func test_transitions_choisirUnEffetVisuel_neToucheAucuneTransition() {
        XCTAssertEqual(ComposerSceneEffects.transitions(after: .visual("bw"), from: courant), courant)
    }

    func test_rehearsal_chaqueChoix_rejoueLOuvertureSelectionneePuisLaFermeture() {
        XCTAssertEqual(ComposerSceneEffects.rehearsal(after: .opening(.slide), from: courant),
                       StoryTransitionRehearsal(opening: .slide, closing: .fade))
        XCTAssertEqual(ComposerSceneEffects.rehearsal(after: .visual("bw"), from: courant),
                       StoryTransitionRehearsal(opening: .zoom, closing: .fade),
                       "un effet visuel se montre EN SITUATION : la scène rejoue son entrée et sa sortie")
    }

    func test_rehearsal_aucuneTransition_rienARejouer() {
        XCTAssertNil(ComposerSceneEffects.rehearsal(after: .visual("bw"),
                                                    from: .init(opening: nil, closing: nil)))
    }

    // MARK: - La scène REMONTE, jamais ne descend (#8712)

    func test_bottomInset_panneauOuvert_remonteDeSaHauteur() {
        XCTAssertEqual(ComposerSceneLift.bottomInset(panelIsOpen: true, panelHeight: 96), 96)
    }

    func test_bottomInset_auRepos_garderSaMarge() {
        XCTAssertEqual(ComposerSceneLift.bottomInset(panelIsOpen: false, panelHeight: 96),
                       ComposerSceneLift.restingInset)
    }

    func test_panelIsOpen_reglagesDeLOutilOuBande_surToutEcran() {
        XCTAssertTrue(ComposerSceneLift.panelIsOpen(lowZone: .toolOptions, toolOptionsServed: true))
        XCTAssertFalse(ComposerSceneLift.panelIsOpen(lowZone: .toolOptions, toolOptionsServed: false),
                       "un outil sans panneau (le texte) ne pousse rien")
        XCTAssertTrue(ComposerSceneLift.panelIsOpen(lowZone: .band(.frame), toolOptionsServed: false),
                      "la bande se pose sous la scène sur tout écran, grand écran compris (#13839, L6) : elle la réduit")
        XCTAssertFalse(ComposerSceneLift.panelIsOpen(lowZone: .nothing, toolOptionsServed: true))
    }

    func test_bottomInset_neDescendJamaisSousLeRepos() {
        for hauteur in [-20.0, 0, 1, 3, 250] as [CGFloat] {
            XCTAssertGreaterThanOrEqual(ComposerSceneLift.bottomInset(panelIsOpen: true, panelHeight: hauteur),
                                        ComposerSceneLift.restingInset)
        }
    }
}
