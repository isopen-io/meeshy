import SwiftUI
import MeeshySDK

// MARK: - StoryComposerView + Chrome

extension StoryComposerView {

    /// SEUL site de construction du contexte de chrome. Header, colonne
    /// annuler/rétablir, barre de FABs, chips de couche et tap sur le fond du
    /// canvas le consomment tous — plus aucun appel de la politique ne peut
    /// omettre un terme. La divergence header/FABs (l'un lisait l'état BRUT du
    /// band, l'autre son état EFFECTIF, sous une doc-comment qui promettait « les
    /// MÊMES conditions ») disparaît par typage.
    var chromeContext: ComposerChromeContext {
        ComposerChromeContext(
            machineState: bandStateMachine.state,
            isChromeHidden: bandStateMachine.isChromeHidden,
            isTextEditing: viewModel.textEditingMode != .inactive,
            isDrawingActive: viewModel.drawingEditingMode.isActive,
            isDrawingImmersive: viewModel.isDrawingImmersive,
            isViewportZoomed: viewModel.isCanvasZoomed,
            isTimelineVisible: viewModel.isTimelineVisible,
            isEmptyStatePickerVisible: shouldShowEmptyStateLargePicker,
            isComposerEmpty: isComposerEmpty
        )
    }

    /// C-DIR2 (d)+(c) : le header suit EXACTEMENT les conditions des FABs —
    /// visible uniquement canvas plein écran au repos (aucun panneau, aucune
    /// édition texte/dessin, pas de zoom). L'ancienne règle le gardait affiché
    /// pendant l'édition (`|| activeTool != nil || selectedElementId != nil`),
    /// à rebours de « n'afficher que l'utile à l'instant t ».
    var showTopBar: Bool {
        ComposerChromePolicy.fullChromeVisible(chromeContext)
    }

    /// Outil dont le panneau est EFFECTIVEMENT ouvert dans le band — overrides
    /// dessin/timeline compris. `nil` quand le band est replié ou affiche un
    /// panneau de format.
    var activeBandTool: StoryToolMode? { chromeContext.activeBandTool }

    /// Les chips « Arrière-plan » / « Premier plan » n'existent que là où leur
    /// override change réellement la couche manipulée (cf.
    /// `ComposerChromePolicy.layerIndicatorVisible`).
    var showsCanvasLayerIndicator: Bool {
        ComposerChromePolicy.layerIndicatorVisible(
            chromeContext,
            hasBackgroundContent: StoryCanvasUIView.hasBackgroundContent(viewModel.currentEffects),
            hasForegroundContent: StoryCanvasUIView.hasForegroundContent(viewModel.currentEffects)
        )
    }

    // MARK: - Actions

    /// Routage UNIQUE du tap sur le fond du canvas. Avant, il basculait
    /// inconditionnellement un drapeau que la politique n'observait plus dès
    /// qu'un panneau était ouvert : le geste n'avait aucun effet visible, puis
    /// « Retour » découvrait un écran nu.
    func handleCanvasBackgroundTap() {
        switch ComposerChromePolicy.backgroundTapAction(chromeContext) {
        case .ignore:
            return
        case .toggleChrome:
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                bandStateMachine.toggleChrome()
            }
        case .dismissPanel:
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                dismissActiveBandPanel()
            }
        }
    }

    /// UNIQUE applicateur de « fermer le panneau actif », partagé par les quatre
    /// chemins de sortie : chevron « Retour », swipe-down sur le band, grabber
    /// tiré sous le minimum, tap sur le fond du canvas. La décision vit dans
    /// `ComposerChromePolicy.dismissing` (fonction pure, testable de bout en
    /// bout) ; ici on ne fait qu'appliquer.
    ///
    /// `showChrome()` est répété après `closeAnyPanel()` — qui le fait déjà —
    /// parce que c'est l'applicateur qui porte le CONTRAT de sortie : une
    /// évolution future de la machine ne pourra pas réintroduire un écran nu par
    /// ce chemin.
    func dismissActiveBandPanel() {
        let outcome = ComposerChromePolicy.dismissing(chromeContext)
        if outcome.clearActiveTool { viewModel.activeTool = nil }
        if outcome.clearTimeline { viewModel.isTimelineVisible = false }
        if outcome.clearSelection { viewModel.selectedElementId = nil }
        bandStateMachine.closeAnyPanel()
        bandStateMachine.showChrome()
    }
}
