import XCTest
@testable import MeeshyUI

/// T4 — routage du tap sur le FOND du canvas.
///
/// AVANT : `areFabsVisible.toggle()`, inconditionnel et sans feedback. Avec un
/// panneau ouvert, il basculait un drapeau que la politique de chrome
/// n'observait plus (`bandHidden == false` masquait déjà le header) : l'action
/// n'avait AUCUN effet visible, puis le « Retour » du panneau découvrait un
/// écran nu.
///
/// APRÈS (arbitrage 2026-07-31) : trois issues, évaluées sur l'état EFFECTIF.
/// Un éditeur qui POSSÈDE le canvas (texte inline, dessin liste ou immersif,
/// zoom d'inspection, timeline) garde son tap ; un panneau d'outil se ferme
/// (« tap hors zone » du standard) ; sinon le chrome bascule (D4).
final class ComposerBackgroundTapActionTests: XCTestCase {

    private func action(
        machineState: BandState = .hidden,
        isChromeHidden: Bool = false,
        isTextEditing: Bool = false,
        isDrawingActive: Bool = false,
        isDrawingImmersive: Bool = false,
        isViewportZoomed: Bool = false,
        isTimelineVisible: Bool = false,
        isEmptyStatePickerVisible: Bool = false
    ) -> ComposerBackgroundTapAction {
        ComposerChromePolicy.backgroundTapAction(
            ComposerChromeContext(
                machineState: machineState,
                isChromeHidden: isChromeHidden,
                isTextEditing: isTextEditing,
                isDrawingActive: isDrawingActive,
                isDrawingImmersive: isDrawingImmersive,
                isViewportZoomed: isViewportZoomed,
                isTimelineVisible: isTimelineVisible,
                isEmptyStatePickerVisible: isEmptyStatePickerVisible
            )
        )
    }

    func test_backgroundTapAction_bandHiddenNothingActive_togglesChrome() {
        XCTAssertEqual(action(), .toggleChrome)
    }

    func test_backgroundTapAction_toolPanelOpen_dismissesPanel() {
        XCTAssertEqual(
            action(machineState: .toolPanel(.media)), .dismissPanel,
            "Le tap ne bascule plus un drapeau invisible : il ferme le panneau."
        )
    }

    func test_backgroundTapAction_formatPanelOpen_dismissesPanel() {
        XCTAssertEqual(action(machineState: .formatPanel(.text, elementId: "t")), .dismissPanel)
    }

    func test_backgroundTapAction_timelineOpen_isIgnored() {
        XCTAssertEqual(
            action(isTimelineVisible: true), .ignore,
            "La timeline possède le canvas (scrub/preview) — fermer sur un tap serait destructif."
        )
    }

    func test_backgroundTapAction_drawingListMode_isIgnored() {
        XCTAssertEqual(
            action(isDrawingActive: true), .ignore,
            "Le dessin possède le canvas en mode LISTE aussi : un tap de désélection ne doit pas quitter l'outil."
        )
    }

    func test_backgroundTapAction_textEditing_isIgnored() {
        XCTAssertEqual(action(isTextEditing: true), .ignore)
    }

    func test_backgroundTapAction_drawingImmersive_isIgnored() {
        XCTAssertEqual(action(isDrawingActive: true, isDrawingImmersive: true), .ignore)
    }

    func test_backgroundTapAction_viewportZoomed_isIgnored() {
        XCTAssertEqual(action(isViewportZoomed: true), .ignore)
    }

    func test_backgroundTapAction_emptyStatePicker_isIgnored() {
        XCTAssertEqual(
            action(isEmptyStatePickerVisible: true), .ignore,
            """
            Composer vierge : le picker géant remplace `ComposerControlsLayer`, donc \
            la poignée de récupération n'existe PAS dans l'arbre. Masquer le chrome \
            y produirait un écran sans « Fermer », sans « Publier » et sans affordance \
            de retour.
            """
        )
    }

    func test_backgroundTapAction_chromeAlreadyHidden_togglesChromeBack() {
        XCTAssertEqual(
            action(isChromeHidden: true), .toggleChrome,
            "Un tap simple restaure TOUJOURS un chrome volontairement masqué (D4)."
        )
    }
}
