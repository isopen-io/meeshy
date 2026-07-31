import XCTest
@testable import MeeshyUI

/// T3 — `ComposerChromePolicy.fullChromeVisible(_:)`, désormais fonction pure
/// d'UN SEUL argument.
///
/// Reprend les 7 comportements de feu `ComposerChromePolicyTests` (Swift
/// Testing) et y ajoute la garde qui rendait l'ancienne signature dangereuse :
/// elle prenait 6 paramètres dont un à valeur par défaut, si bien que le header
/// (6 arguments, état BRUT du band) et les FABs (5 arguments, état EFFECTIF)
/// prétendaient appliquer « les MÊMES conditions » en en appliquant deux
/// différentes. Avec un contexte unique, la divergence disparaît par typage.
final class ComposerChromePolicyContextTests: XCTestCase {

    private func visible(
        machineState: BandState = .hidden,
        isChromeHidden: Bool = false,
        isTextEditing: Bool = false,
        isDrawingActive: Bool = false,
        isDrawingImmersive: Bool = false,
        isViewportZoomed: Bool = false,
        isTimelineVisible: Bool = false
    ) -> Bool {
        ComposerChromePolicy.fullChromeVisible(
            ComposerChromeContext(
                machineState: machineState,
                isChromeHidden: isChromeHidden,
                isTextEditing: isTextEditing,
                isDrawingActive: isDrawingActive,
                isDrawingImmersive: isDrawingImmersive,
                isViewportZoomed: isViewportZoomed,
                isTimelineVisible: isTimelineVisible,
                isEmptyStatePickerVisible: false
            )
        )
    }

    func test_fullChromeVisible_idleFullCanvas_isTrue() {
        XCTAssertTrue(visible())
    }

    func test_fullChromeVisible_toolPanelOpen_isFalse() {
        XCTAssertFalse(visible(machineState: .toolPanel(.media)))
    }

    func test_fullChromeVisible_textEditing_isFalse() {
        XCTAssertFalse(visible(isTextEditing: true))
    }

    func test_fullChromeVisible_drawingActive_isFalse() {
        XCTAssertFalse(visible(isDrawingActive: true))
    }

    func test_fullChromeVisible_drawingImmersive_isFalse() {
        XCTAssertFalse(
            visible(isDrawingActive: true, isDrawingImmersive: true),
            "Band effectif .hidden MAIS tracé en cours : le terme !isDrawingActive reste indispensable."
        )
    }

    func test_fullChromeVisible_viewportZoomed_isFalse() {
        XCTAssertFalse(visible(isViewportZoomed: true))
    }

    func test_fullChromeVisible_chromeHiddenByUser_isFalse() {
        XCTAssertFalse(visible(isChromeHidden: true))
    }

    func test_fullChromeVisible_timelineVisible_isFalse() {
        XCTAssertFalse(visible(isTimelineVisible: true))
    }

    /// Garde de source : les seuls sites d'APPEL de la politique de chrome plein
    /// sont le site unique de construction du contexte (`+Chrome.swift`, pour le
    /// header et la colonne d'historique) et la barre de FABs. Le fichier de
    /// DÉCLARATION est exclu — il contient forcément la chaîne.
    func test_fullChromeVisible_headerAndFabs_readTheSameContext() throws {
        let declarationSite = "Controls/ComposerChromePolicy.swift"
        let callSites = try ComposerSourceGuard.allStorySources()
            .filter { $0.path != declarationSite }
            .filter { $0.code.contains("ComposerChromePolicy.fullChromeVisible(") }

        XCTAssertEqual(
            Set(callSites.map(\.path)),
            ["StoryComposerView+Chrome.swift", "Controls/ComposerControlsLayer.swift"]
        )
        for site in callSites {
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: "ComposerChromePolicy.fullChromeVisible(", in: site.code), 1,
                "\(site.path) doit appeler la politique une seule fois."
            )
        }
        let chromeExtension = try ComposerSourceGuard.source("StoryComposerView+Chrome.swift")
        XCTAssertTrue(chromeExtension.contains("ComposerChromePolicy.fullChromeVisible(chromeContext)"))
        let controls = try ComposerSourceGuard.source("Controls/ComposerControlsLayer.swift")
        XCTAssertTrue(controls.contains("ComposerChromePolicy.fullChromeVisible(chrome)"))
    }
}
