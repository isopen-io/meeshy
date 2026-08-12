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
            isBlankAuthoringSlide: ComposerChromePolicy.isBlankAuthoringSlide(
                currentSlideIsEmpty: currentSlideIsEmpty,
                isEditingExistingStory: isEditingExistingStory,
                isDraftResumePresented: draftResume.isBannerVisible
            ),
            isDraftResumePresented: draftResume.isBannerVisible
        )
    }

    /// Les amorces de contenu (indice « Touchez pour écrire », capsule Caméra,
    /// vignette de la dernière photo) ne vivent que sur une page blanche au repos.
    var offersContentStarters: Bool {
        ComposerChromePolicy.offersContentStarters(
            chromeContext,
            isPartialSystemSheetPresented: presentedSystemSheetFraction != nil
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
        case .dismissDraftResume:
            // Le bandeau se range, le brouillon RESTE en magasin : tant que rien
            // de réel n'est créé, `composerHasContent` ferme l'autosave et la
            // même offre revient à l'ouverture suivante
            // (`mayOverwriteStoredDraft`). Seul « Recommencer » le jette.
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                draftResume.hideBanner()
            }
        case .startTextComposition:
            startTextCompositionOnBlankCanvas()
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

    /// Applicateur de `ComposerChromePolicy.rangesDraftResumeBanner` : le tap sur
    /// le canvas n'est pas le seul geste d'authoring, et le bandeau ne doit
    /// flotter au-dessus d'aucun panneau. Sans haptique — l'utilisateur en reçoit
    /// déjà une pour l'action qui a ouvert le panneau, deux d'affilée se lisent
    /// comme un bug.
    func rangeDraftResumeBannerIfNeeded() {
        guard ComposerChromePolicy.rangesDraftResumeBanner(chromeContext) else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            draftResume.hideBanner()
        }
    }

    /// UNIQUE point d'entrée « écrire sur la page blanche », partagé par le tap
    /// sur le canvas, le tap sur le letterbox, le tap sur l'indice et le
    /// swipe-down des amorces (directive user 2026-07-31). Emprunte EXACTEMENT
    /// le chemin de l'ancienne tuile « Texte » : `addText()` pose l'objet et
    /// `activeTool = .text`, `enterTextEditingMode` ouvre l'éditeur flottant.
    /// Un texte laissé vide est auto-supprimé à la sortie
    /// (`StoryComposerViewModel+TextEditing`) : la page redevient blanche et les
    /// amorces reviennent — aucun résidu, aucun cul-de-sac.
    func startTextCompositionOnBlankCanvas() {
        HapticFeedback.light()
        guard let text = viewModel.addText() else { return }
        viewModel.enterTextEditingMode(textId: text.id)
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
