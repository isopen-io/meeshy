import XCTest
@testable import MeeshyUI

/// T2 — `ComposerChromeContext`, valeur pure qui porte les entrées BRUTES du
/// chrome et en DÉRIVE l'état effectif du band.
///
/// Reprend intégralement les 5 comportements de feu
/// `ComposerControlsLayerEffectiveBandStateTests` : la résolution a changé de
/// domicile (de `ComposerControlsLayer` vers le contexte) parce que la politique
/// de chrome, le carding du canvas et l'ouverture du band doivent lire la MÊME
/// résolution — la divergence brut/effectif était la seconde vérité du chrome.
final class ComposerChromeContextTests: XCTestCase {

    private func context(
        machineState: BandState = .hidden,
        isChromeHidden: Bool = false,
        isTextEditing: Bool = false,
        isDrawingActive: Bool = false,
        isDrawingImmersive: Bool = false,
        isViewportZoomed: Bool = false,
        isTimelineVisible: Bool = false,
    ) -> ComposerChromeContext {
        ComposerChromeContext(
            machineState: machineState,
            isChromeHidden: isChromeHidden,
            isTextEditing: isTextEditing,
            isDrawingActive: isDrawingActive,
            isDrawingImmersive: isDrawingImmersive,
            isViewportZoomed: isViewportZoomed,
            isTimelineVisible: isTimelineVisible
        )
    }

    func test_effectiveBandState_hiddenMachineNoOverride_staysHidden() {
        XCTAssertEqual(context().effectiveBandState, .hidden)
    }

    func test_effectiveBandState_timelineVisibleAndHiddenMachine_forcesTimelinePanel() {
        XCTAssertEqual(context(isTimelineVisible: true).effectiveBandState, .toolPanel(.timeline))
    }

    func test_effectiveBandState_timelineVisibleAndAnotherToolOpen_keepsThatTool() {
        XCTAssertEqual(
            context(machineState: .toolPanel(.text), isTimelineVisible: true).effectiveBandState,
            .toolPanel(.text),
            "Basculer sur un autre outil pendant que la timeline est ouverte doit montrer CET outil."
        )
    }

    func test_effectiveBandState_drawingActive_takesPrecedenceOverTimeline() {
        XCTAssertEqual(
            context(isDrawingActive: true, isTimelineVisible: true).effectiveBandState,
            .toolPanel(.drawing)
        )
    }

    func test_effectiveBandState_drawingImmersive_hidesBandRegardlessOfTimeline() {
        XCTAssertEqual(
            context(isDrawingActive: true, isDrawingImmersive: true, isTimelineVisible: true).effectiveBandState,
            .hidden
        )
    }

    func test_activeBandTool_formatPanelOpen_isNil() {
        XCTAssertNil(context(machineState: .formatPanel(.text, elementId: "t")).activeBandTool)
    }

    func test_activeBandTool_timelineOverride_isTimeline() {
        XCTAssertEqual(context(isTimelineVisible: true).activeBandTool, .timeline)
    }

    func test_isBandHidden_drawingImmersive_isTrue() {
        XCTAssertTrue(context(isDrawingActive: true, isDrawingImmersive: true).isBandHidden)
    }
}
