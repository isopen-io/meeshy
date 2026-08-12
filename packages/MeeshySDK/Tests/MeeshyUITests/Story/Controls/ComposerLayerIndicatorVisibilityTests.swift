import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// T5 — les chips « Arrière-plan » / « Premier plan » ne sont montés que là où
/// ils SERVENT.
///
/// AVANT : montés sans aucune garde, donc affichés sur une slide vierge où
/// `resolveManipulationLayer(for:override:)` ignore l'override — deux boutons
/// décoratifs, en permanence, sur le flanc gauche.
///
/// APRÈS : la règle est propre au CANVAS, pas au chrome. Le canvas reste
/// manipulable pendant qu'un panneau d'outil est ouvert et pendant le zoom
/// (`canvasComposerLayer` ne coupe le hit-testing que pour le tracé immersif),
/// donc les chips y restent : les assujettir à `fullChromeVisible` les aurait
/// retirés précisément dans leur état d'usage (panneau « Fond » ouvert, viewport
/// zoomé sur le média de fond).
@MainActor
final class ComposerLayerIndicatorVisibilityTests: XCTestCase {

    private func context(
        machineState: BandState = .hidden,
        isChromeHidden: Bool = false,
        isTextEditing: Bool = false,
        isDrawingActive: Bool = false,
        isDrawingImmersive: Bool = false,
        isViewportZoomed: Bool = false,
        isTimelineVisible: Bool = false
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

    private func visible(
        _ ctx: ComposerChromeContext,
        bg: Bool = true,
        fg: Bool = true
    ) -> Bool {
        ComposerChromePolicy.layerIndicatorVisible(
            ctx, hasBackgroundContent: bg, hasForegroundContent: fg)
    }

    // MARK: - États du chrome

    func test_layerIndicatorVisible_idleWithBothLayersPopulated_isTrue() {
        XCTAssertTrue(visible(context()))
    }

    func test_layerIndicatorVisible_toolPanelOpen_isTrue() {
        XCTAssertTrue(
            visible(context(machineState: .toolPanel(.texture))),
            "Panneau « Fond » ouvert = l'utilisateur édite l'arrière-plan : le chip doit rester à portée."
        )
    }

    func test_layerIndicatorVisible_viewportZoomed_isTrue() {
        XCTAssertTrue(
            visible(context(isViewportZoomed: true)),
            "Le zoom est l'état où l'on ajuste le cadrage du fond — retirer le chip y serait une régression."
        )
    }

    func test_layerIndicatorVisible_textEditing_isFalse() {
        XCTAssertFalse(visible(context(isTextEditing: true)))
    }

    func test_layerIndicatorVisible_drawingImmersive_isFalse() {
        XCTAssertFalse(visible(context(isDrawingActive: true, isDrawingImmersive: true)))
    }

    func test_layerIndicatorVisible_chromeHiddenByUser_isFalse() {
        XCTAssertFalse(visible(context(isChromeHidden: true)))
    }

    // MARK: - Contenu des couches

    func test_layerIndicatorVisible_onlyBackgroundContent_isFalse() {
        XCTAssertFalse(visible(context(), bg: true, fg: false))
    }

    func test_layerIndicatorVisible_onlyForegroundContent_isFalse() {
        XCTAssertFalse(visible(context(), bg: false, fg: true))
    }

    func test_layerIndicatorVisible_emptySlide_isFalse() {
        XCTAssertFalse(visible(context(), bg: false, fg: false))
    }

    /// Preuve exhaustive que la garde ne retire aucune affordance UTILE : sur les
    /// 4 combinaisons (fond × premier plan) de vraies `StoryEffects`, les chips
    /// sont montés SSI l'override qu'ils posent change réellement la couche
    /// manipulée. Avec une seule couche peuplée, l'auto-dérivation gagne et les
    /// chips sont décoratifs.
    func test_layerIndicatorVisible_matchesManipulationOverrideEffectiveness() {
        for bg in [false, true] {
            for fg in [false, true] {
                let effects = Self.effects(background: bg, foreground: fg)
                let auto = StoryCanvasUIView.resolveManipulationLayer(for: effects)
                let overridden = StoryCanvasUIView.resolveManipulationLayer(
                    for: effects, override: .background)
                let overrideIsEffective = overridden != auto

                XCTAssertEqual(
                    visible(context(),
                            bg: StoryCanvasUIView.hasBackgroundContent(effects),
                            fg: StoryCanvasUIView.hasForegroundContent(effects)),
                    overrideIsEffective,
                    "bg=\(bg) fg=\(fg) : les chips ne s'affichent que là où ils ont une fonction."
                )
            }
        }
    }

    private static func effects(background: Bool, foreground: Bool) -> StoryEffects {
        var medias: [StoryMediaObject] = []
        if background {
            medias.append(StoryMediaObject(id: "bg", aspectRatio: 0.5625, isBackground: true))
        }
        if foreground {
            medias.append(StoryMediaObject(id: "fg", aspectRatio: 1.0, isBackground: false))
        }
        return StoryEffects(mediaObjects: medias.isEmpty ? nil : medias)
    }
}
