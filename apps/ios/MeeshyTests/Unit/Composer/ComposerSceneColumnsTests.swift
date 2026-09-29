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
        let story = ComposerSceneFloatingRail.sideRow(
            from: ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors, format: .story, allowsCapture: true),
            format: .story)
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

    // MARK: - Un objet touché : ses options à droite, terminées par (x) (#8714)

    func test_focus_outilOuvert_lEmporteSurUneSelection() {
        let controles = [control("drawing.tool")]
        let focus = ComposerTrailingColumn.focus(railMode: .tool(controles),
                                                 selection: (sections: [.timing], actions: [.delete]))
        XCTAssertEqual(focus, .tool(controles))
    }

    func test_focus_selectionSansOutil_rendLObjet() {
        let focus = ComposerTrailingColumn.focus(railMode: .doors([.media]),
                                                 selection: (sections: [.timing], actions: [.delete]))
        XCTAssertEqual(focus, .object(sections: [.timing], actions: [.delete]))
        XCTAssertEqual(ComposerTrailingColumn.focus(railMode: .doors([]), selection: nil), .scene(effects: [], open: nil))
    }

    func test_options_objet_modifierPuisSectionsPuisActionsPuisSortie() {
        let options = ComposerTrailingColumn.options(for: .object(
            sections: [.media(.filter), .timing],
            actions: [.edit, .duplicate, .delete]))
        XCTAssertEqual(options, [
            .objectAction(.edit),
            .editorSection(.media(.filter)), .editorSection(.timing),
            .objectAction(.duplicate), .objectAction(.delete),
            .exitObject
        ])
        XCTAssertEqual(options.last, .exitObject, "le (x) est TOUJOURS la dernière entrée")
    }

    func test_options_objetAvecRognage_neLeMontreQuUneFois() {
        let options = ComposerTrailingColumn.options(for: .object(
            sections: [.media(.trim), .timing],
            actions: [.trim, .delete]))
        XCTAssertFalse(options.contains(.objectAction(.trim)))
        XCTAssertTrue(options.contains(.editorSection(.media(.trim))))
    }

    /// **Aucune seconde liste** : ce que la colonne offre pour un texte sort
    /// des inventaires existants, composés — jamais d'un littéral.
    func test_options_texteReel_composeLesInventairesExistants() {
        let texte = StoryTextObject(id: "t1", text: "salut")
        var effets = StoryEffects()
        effets.textObjects = [texte]
        let slide = StorySlide(id: "s1", effects: effets)
        let sections = ComposerObjectEditorRail.entries(for: .text)
        let actions = ComposerTrailingRailPolicy.actions(slide: slide, selectedId: "t1",
                                                         served: ComposerTrailingColumn.servedActions,
                                                         hasEditor: true, canLeaveScene: false)
        let options = ComposerTrailingColumn.options(for: .object(sections: sections, actions: actions))
        XCTAssertEqual(options.first, .objectAction(.edit))
        XCTAssertTrue(options.contains(.objectAction(.delete)))
        XCTAssertEqual(options.filter { if case .editorSection = $0 { return true }; return false }.count,
                       sections.count)
        XCTAssertFalse(options.contains(.objectAction(.leaveScene)), "sortir de la scène attend #4038")
    }

    func test_isExit_seulesLesSortiesEchappentAuDefilement() {
        XCTAssertTrue(ComposerTrailingColumn.Entry.exitTool.isExit)
        XCTAssertTrue(ComposerTrailingColumn.Entry.exitObject.isExit)
        XCTAssertFalse(ComposerTrailingColumn.Entry.objectAction(.delete).isExit)
        XCTAssertFalse(ComposerTrailingColumn.Entry.editorSection(.timing).isExit)
    }

    func test_entryIds_sontUniquesDansUneColonne() {
        let options = ComposerTrailingColumn.options(for: .object(
            sections: ComposerObjectEditorRail.entries(for: .text),
            actions: [.edit, .duplicate, .bringForward, .sendBackward, .delete]))
        XCTAssertEqual(Set(options.map(\.id)).count, options.count)
    }

    // MARK: - Les effets d'une scène à fond média (#8712)

    func test_served_fondImage_filtresPuisOuverture() {
        XCTAssertEqual(ComposerSceneEffects.served(background: .image), [.filter, .opening])
    }

    func test_served_fondVideo_sansFiltre() {
        XCTAssertEqual(ComposerSceneEffects.served(background: .video), [.opening],
                       "le filtre ne se cuit que dans une image : sur une vidéo il serait inerte")
    }

    func test_served_sansFondMedia_aucuneColonne() {
        XCTAssertEqual(ComposerSceneEffects.served(background: nil), [])
    }

    func test_options_sceneAFondMedia_effetsDeHautEnBas_ouvertMarque() {
        let options = ComposerTrailingColumn.options(for: ComposerTrailingColumn.focus(
            railMode: .doors([]), selection: nil,
            effects: [.filter, .opening], openEffect: .opening))
        XCTAssertEqual(options, [.sceneEffect(.filter, isOpen: false), .sceneEffect(.opening, isOpen: true)])
        XCTAssertFalse(options.contains(where: \.isExit), "la scène n'a pas de mode à quitter")
    }

    func test_focus_effetOuvertNonServi_nEstPasMarque() {
        XCTAssertEqual(ComposerTrailingColumn.focus(railMode: .doors([]), selection: nil,
                                                    effects: [.opening], openEffect: .filter),
                       .scene(effects: [.opening], open: nil))
    }

    func test_focus_objetTouche_remplaceLesEffets() {
        let focus = ComposerTrailingColumn.focus(railMode: .doors([]),
                                                 selection: (sections: [.timing], actions: [.delete]),
                                                 effects: [.filter], openEffect: .filter)
        XCTAssertEqual(focus, .object(sections: [.timing], actions: [.delete]))
    }

    func test_toggled_retoucherLEffetOuvert_leReferme() {
        XCTAssertEqual(ComposerSceneEffects.toggled(.filter, open: nil), .filter)
        XCTAssertNil(ComposerSceneEffects.toggled(.filter, open: .filter))
        XCTAssertEqual(ComposerSceneEffects.toggled(.opening, open: .filter), .opening)
    }

    func test_carousel_neVitQueSurUneSceneLibre() {
        XCTAssertEqual(ComposerSceneEffects.carousel(open: .filter, served: [.filter],
                                                     objectSelected: false, toolIsOpen: false), .filter)
        XCTAssertNil(ComposerSceneEffects.carousel(open: .filter, served: [.opening],
                                                   objectSelected: false, toolIsOpen: false),
                     "un fond devenu vidéo referme le carrousel des filtres")
        XCTAssertNil(ComposerSceneEffects.carousel(open: .filter, served: [.filter],
                                                   objectSelected: true, toolIsOpen: false))
        XCTAssertNil(ComposerSceneEffects.carousel(open: .filter, served: [.filter],
                                                   objectSelected: false, toolIsOpen: true))
    }

    // MARK: - La scène REMONTE, jamais ne descend (#8712)

    func test_bottomInset_panneauOuvert_remonteDeSaHauteur() {
        XCTAssertEqual(ComposerSceneLift.bottomInset(panelIsOpen: true, panelHeight: 96), 96)
    }

    func test_bottomInset_auRepos_garderSaMarge() {
        XCTAssertEqual(ComposerSceneLift.bottomInset(panelIsOpen: false, panelHeight: 96),
                       ComposerSceneLift.restingInset)
    }

    func test_panelIsOpen_reglagesDeLOutilOuBandeSurTelephone() {
        XCTAssertTrue(ComposerSceneLift.panelIsOpen(lowZone: .toolOptions, toolOptionsServed: true, roomy: false))
        XCTAssertFalse(ComposerSceneLift.panelIsOpen(lowZone: .toolOptions, toolOptionsServed: false, roomy: false),
                       "un outil sans panneau (le texte) ne pousse rien")
        XCTAssertTrue(ComposerSceneLift.panelIsOpen(lowZone: .band(.frame), toolOptionsServed: false, roomy: false))
        XCTAssertFalse(ComposerSceneLift.panelIsOpen(lowZone: .band(.frame), toolOptionsServed: false, roomy: true),
                       "sur grand écran la bande flotte en carte, à côté du rail")
        XCTAssertFalse(ComposerSceneLift.panelIsOpen(lowZone: .nothing, toolOptionsServed: true, roomy: false))
    }

    func test_bottomInset_neDescendJamaisSousLeRepos() {
        for hauteur in [-20.0, 0, 1, 3, 250] as [CGFloat] {
            XCTAssertGreaterThanOrEqual(ComposerSceneLift.bottomInset(panelIsOpen: true, panelHeight: hauteur),
                                        ComposerSceneLift.restingInset)
        }
    }
}
