import XCTest
import SwiftUI
@testable import Meeshy
@testable import MeeshyUI

/// **Un objet sélectionné prend le chrome** (#13957, spec R6, décision porteur
/// du 2026-10-31) : tant qu'un objet de la scène est sélectionné, ni l'audience,
/// ni Publier, ni Fermer ; le rail des outils cède sa place, au même endroit, aux
/// options d'édition de l'objet ; toucher une option ouvre ses propriétés EN BAS,
/// la scène se réduisant au-dessus ; désélectionner rend tout. Le fond n'entre
/// jamais dans cette règle.
final class ComposerSelectionChromeTests: XCTestCase {

    private func etat(selected: Bool = false, tool: Bool = false,
                      writes: Bool = false, camera: Bool = false, panel: Bool = false) -> ComposerRestChrome.State {
        ComposerRestChrome.State(toolIsOpen: tool, writesText: writes, cameraIsArmed: camera,
                                 bottomPanelIsOpen: panel, timelineIsOpen: false,
                                 objectIsSelected: selected)
    }

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    // MARK: - Qui prend le chrome

    func test_ownsChrome_everyPlacedFamily_ownsItFromItsSelection() {
        for famille in [ComposerInlineFamily.text, .image, .video, .audio, .sticker, .place] {
            XCTAssertTrue(ComposerSelectionChrome.ownsChrome(family: famille, isEditing: false, typing: false),
                          "\(famille)")
        }
    }

    func test_ownsChrome_theBackground_onlyWhileItsEditionIsOpen() {
        XCTAssertFalse(ComposerSelectionChrome.ownsChrome(family: .background(isVideo: false), isEditing: false,
                                                          typing: false), "toucher le fond n'est pas l'éditer")
        XCTAssertTrue(ComposerSelectionChrome.ownsChrome(family: .background(isVideo: true), isEditing: true,
                                                         typing: false), "appui long › Modifier (#13974)")
    }

    func test_ownsChrome_nothingSelectedOrTyping_neverOwnsIt() {
        XCTAssertFalse(ComposerSelectionChrome.ownsChrome(family: nil, isEditing: false, typing: false))
        XCTAssertFalse(ComposerSelectionChrome.ownsChrome(family: .text, isEditing: true, typing: true),
                       "la frappe a sa barre collée au clavier (L4)")
    }

    // MARK: - Ce qui disparaît, ce qui remplace

    func test_selectedObject_hidesCloseAndTheToolRail_showsTheSelectionColumnInItsPlace() {
        let selection = etat(selected: true)
        XCTAssertFalse(ComposerRestChrome.closeIsShown(selection), "Fermer disparaît")
        XCTAssertFalse(ComposerRestChrome.toolColumnIsShown(selection), "le rail canonique cède")
        XCTAssertTrue(ComposerRestChrome.selectionColumnIsShown(selection), "au même endroit, les options")
        XCTAssertTrue(ComposerRestChrome.historyIsShown(selection), "↶ ↷ restent")
    }

    func test_atRest_showsCloseAndTheToolRail_neverTheSelectionColumn() {
        let repos = etat()
        XCTAssertTrue(ComposerRestChrome.closeIsShown(repos))
        XCTAssertTrue(ComposerRestChrome.toolColumnIsShown(repos))
        XCTAssertFalse(ComposerRestChrome.selectionColumnIsShown(repos))
    }

    /// Les propriétés d'une option ne sont pas un outil ouvert : la surface
    /// les sert sélection posée, outil fermé.
    func test_propertiesOpen_keepTheSelectionColumn_andStillHideClose() {
        let proprietes = etat(selected: true)
        XCTAssertTrue(ComposerRestChrome.selectionColumnIsShown(proprietes),
                      "une autre option se touche sans revenir en arrière")
        XCTAssertFalse(ComposerRestChrome.closeIsShown(proprietes))
        XCTAssertFalse(ComposerRestChrome.toolColumnIsShown(proprietes))
    }

    func test_selectionColumn_yieldsToTypingCameraAndABottomPanel() {
        XCTAssertFalse(ComposerRestChrome.selectionColumnIsShown(etat(selected: true, writes: true)))
        XCTAssertFalse(ComposerRestChrome.selectionColumnIsShown(etat(selected: true, camera: true)))
        XCTAssertFalse(ComposerRestChrome.selectionColumnIsShown(etat(selected: true, panel: true)))
    }

    func test_publication_hiddenWhileAnObjectIsSelected_backAfterwards() {
        XCTAssertFalse(ComposerSelectionChrome.publicationIsShown(toolOwnsScreen: false, objectIsSelected: true),
                       "ni audience ni Publier")
        XCTAssertFalse(ComposerSelectionChrome.publicationIsShown(toolOwnsScreen: true, objectIsSelected: false))
        XCTAssertTrue(ComposerSelectionChrome.publicationIsShown(toolOwnsScreen: false, objectIsSelected: false))
    }

    // MARK: - La pile des niveaux (#13974)

    func test_stack_selectingAnObject_posesItsActions_anOptionPosesItsLevelOnTop() {
        XCTAssertEqual(ComposerEditRailStack.of(family: .image, editing: nil, typing: false).levels, [.actions])
        XCTAssertEqual(ComposerEditRailStack.of(family: .image, editing: .modify, typing: false).levels,
                       [.actions, .options(.modify)])
        XCTAssertEqual(ComposerEditRailStack.of(family: .text, editing: .time, typing: false).top, .options(.time))
    }

    func test_stack_theBackground_entersDirectlyIntoItsEdition() {
        XCTAssertEqual(ComposerEditRailStack.of(family: .background(isVideo: false), editing: nil, typing: false),
                       .rest)
        XCTAssertEqual(ComposerEditRailStack.of(family: .background(isVideo: false), editing: .modify,
                                                typing: false).levels, [.options(.modify)])
    }

    func test_stack_nothingOrTyping_isTheRest() {
        XCTAssertFalse(ComposerEditRailStack.of(family: nil, editing: nil, typing: false).isEditing)
        XCTAssertFalse(ComposerEditRailStack.of(family: .text, editing: nil, typing: true).isEditing)
    }

    func test_back_closesThePropertiesFirst_thenOneLevelAtATime_thenTheEdition() {
        let pile = ComposerEditRailStack.of(family: .image, editing: .modify, typing: false)
        XCTAssertEqual(pile.back(propertiesAreOpen: true), .closeProperties, "OK referme la feuille, le niveau reste")
        XCTAssertEqual(pile.back(propertiesAreOpen: false), .popLevel)
        let base = ComposerEditRailStack.of(family: .image, editing: nil, typing: false)
        XCTAssertEqual(base.back(propertiesAreOpen: false), .leaveEditing)
        XCTAssertEqual(ComposerEditRailStack.rest.back(propertiesAreOpen: false), .nothing)
    }

    func test_railBack_descendsOneLevel_withItsSheet() {
        let pile = ComposerEditRailStack.of(family: .image, editing: .modify, typing: false)
        XCTAssertEqual(pile.railBack(), .popLevel, "le ‹ du rail ne s'arrête pas à la feuille")
        let fond = ComposerEditRailStack.of(family: .background(isVideo: false), editing: .modify, typing: false)
        XCTAssertEqual(fond.railBack(), .leaveEditing, "le seul niveau du fond rend la scène")
    }

    func test_items_firstLevel_isTheActions_anUpperLevelOpensWithBack() {
        let actions: [ComposerSelectionAction] = [.modify, .duplicate, .time, .remove]
        XCTAssertEqual(ComposerEditRailItems.items(for: .actions, actions: actions, sections: [.plan],
                                                   extras: [.makeSticker], keyframes: true),
                       actions.map(ComposerEditRailItem.action))
        XCTAssertEqual(ComposerEditRailItems.items(for: .options(.time), actions: actions,
                                                   sections: [.timing, .plan], extras: [], keyframes: true),
                       [.back, .section(.timing), .section(.plan), .keyframes])
        XCTAssertEqual(ComposerEditRailItems.items(for: .options(.modify), actions: actions,
                                                   sections: [.media(.filter)], extras: [.setAsBackground],
                                                   keyframes: false),
                       [.back, .section(.media(.filter)), .extra(.setAsBackground)])
    }

    func test_items_onlyTheOpenSectionIsLit() {
        XCTAssertTrue(ComposerEditRailItems.isOn(.section(.timing), openSection: .timing))
        XCTAssertFalse(ComposerEditRailItems.isOn(.section(.plan), openSection: .timing))
        XCTAssertFalse(ComposerEditRailItems.isOn(.back, openSection: .timing))
        XCTAssertTrue(ComposerEditRailItem.action(.remove).isDestructive)
        XCTAssertFalse(ComposerEditRailItem.back.isDestructive)
    }

    func test_levelKeys_areDistinct() {
        let cles = [ComposerEditRailLevel.actions, .options(.modify), .options(.time)].map(ComposerEditRailStack.levelKey)
        XCTAssertEqual(Set(cles).count, 3)
    }

    func test_lowZone_propertiesTakeTheBottom_andLiftTheScene() {
        XCTAssertEqual(ComposerLowZone.resolve(toolIsOpen: false, band: .palette, properties: true), .properties)
        XCTAssertEqual(ComposerLowZone.resolve(toolIsOpen: true, band: nil, properties: true), .properties)
        XCTAssertTrue(ComposerSceneLift.panelIsOpen(lowZone: .properties, toolOptionsServed: false),
                      "la scène se réduit au-dessus : rien ne la recouvre")
    }

    func test_propertiesSheet_neverTakesMoreThanHalfTheWindow() {
        for hauteur in [568.0, 667, 844, 932, 1366] as [CGFloat] {
            let plafond = ComposerPropertiesSheetLayout.maxHeight(windowHeight: hauteur)
            XCTAssertLessThanOrEqual(plafond, hauteur / 2, "\(hauteur)")
            XCTAssertGreaterThanOrEqual(plafond, ComposerPropertiesSheetLayout.minimumHeight)
        }
    }

    // MARK: - Un seul mouvement, coupé sous Réduire les animations

    func test_transitions_areCutUnderReduceMotion() {
        XCTAssertNil(ComposerSelectionChrome.transition(reduceMotion: true))
        XCTAssertNotNil(ComposerSelectionChrome.transition(reduceMotion: false))
        XCTAssertNil(ComposerSelectionChrome.propertiesAnimation(reduceMotion: true))
        XCTAssertNotNil(ComposerSelectionChrome.propertiesAnimation(reduceMotion: false))
    }

    // MARK: - Une option du rail d'édition n'est pas un outil

    func test_inlineEdit_fromTheEditRail_isALevel_notATool() {
        XCTAssertFalse(ComposerSelectionChrome.inlineEditOpensTool(editsInline: true, objectIsSelected: true),
                       "posée par-dessus le rail d'édition, l'option garde le rail, Défaire et Refaire")
        XCTAssertTrue(ComposerSelectionChrome.inlineEditOpensTool(editsInline: true, objectIsSelected: false))
        XCTAssertFalse(ComposerSelectionChrome.inlineEditOpensTool(editsInline: false, objectIsSelected: false))
        XCTAssertFalse(ComposerToolFocus.toolIsOpen(
            railOpensTool: false,
            editsInline: ComposerSelectionChrome.inlineEditOpensTool(editsInline: true, objectIsSelected: true)))
    }

    // MARK: - Le grand écran

    func test_rails_theLeadingRailBecomesTheSelection() {
        XCTAssertEqual(ComposerSelectionChrome.leadingRail(objectIsSelected: true), .editing)
        XCTAssertEqual(ComposerSelectionChrome.leadingRail(objectIsSelected: false), .tools)
    }

    // MARK: - Le montage

    func test_overlay_mountsNoSelectionBarAtTheBottom() throws {
        let chrome = try source("ComposerSceneOverlayChrome.swift")
        XCTAssertFalse(chrome.contains("selectionBar"), "aucune barre flottante en plus du rail")
        XCTAssertTrue(chrome.contains("ComposerRestChrome.selectionColumnIsShown(state)"))
        XCTAssertTrue(chrome.contains("ComposerRestChrome.closeIsShown(state)"))
    }

    func test_socle_isGatedByTheSelection() throws {
        let hote = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(hote.contains("ComposerSelectionChrome.publicationIsShown("),
                      "audience et Publier lisent la loi de la sélection")
        XCTAssertTrue(hote.contains("ComposerSelectionChrome.publicationIsShown(toolOwnsScreen: toolOwnsScreen, objectIsSelected: stack.isEditing)"))
    }

    func test_surface_docksThePropertiesAtTheBottom() throws {
        let surface = try source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("case .properties:"), "les propriétés vivent dans les étages du bas")
        XCTAssertTrue(surface.contains("sheet.transition(ComposerSelectionChrome.propertiesTransition(reduceMotion: reduceMotion))"),
                      "elles montent du bas par la règle, sans glisser sous Réduire les animations")
        let panneau = try source("ComposerInlineToolPanel.swift")
        XCTAssertFalse(panneau.contains("ComposerTrailingOptionsPlate(plateauTint: plateauTint,\n                                     holdsGesture"),
                       "plus rien en haut à droite")
        XCTAssertTrue(panneau.contains("ComposerPropertiesSheetPlate(plateauTint: plateauTint"))
    }
}
