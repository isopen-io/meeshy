import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le repos posé sur la scène (#13839)

/// Les boutons du repos, ⋯ et la barre de dessin ouvrent ce que les rails
/// ouvraient, par les MÊMES fonctions : seule la géographie change. Le meuble
/// garde les points d'entrée ; leur logique vit dans `ComposerSceneRestRelay`.
extension MeeshyComposerHost {

    var sceneRestRelay: ComposerSceneRestRelay { ComposerSceneRestRelay(host: self) }
    var sceneRestTools: [ComposerRestTool] { sceneRestRelay.tools }
    func handleRestTool(_ tool: ComposerRestTool) { sceneRestRelay.handle(tool) }
    var sceneMoreEntries: [ComposerMoreMenuEntry] { sceneRestRelay.moreEntries }
    var sceneMoreMenu: AnyView { sceneRestRelay.moreMenu }
    func performMore(_ entree: ComposerMoreMenuEntry) { sceneRestRelay.perform(entree) }
    func addSceneSlide() { sceneRestRelay.addSlide() }
    var sceneDrawingBar: AnyView? { sceneRestRelay.drawingBar }
    func handleDrawingBarItem(_ item: ComposerDrawingBarItem) { sceneRestRelay.handleDrawingBarItem(item) }

    /// L'état masqué ne vaut que sur la scène au repos : le viseur armé ou une
    /// autre surface le lèvent sans qu'il faille le défaire (#17111).
    var sceneChromeIsConcealedServed: Bool {
        sceneChromeIsConcealed && mountedComposerView == .scene && sceneCameraStage == .off
    }

    /// La légende n'est jamais un champ permanent : le volet reste MONTÉ (sa
    /// requête d'édition doit l'atteindre), visible en écrivant ou écrite.
    var sceneLegendIsVisible: Bool {
        editsSceneDescription || !sceneDescriptionBinding.wrappedValue.isEmpty
    }
}

/// **Le relais du repos** : il lit l'état du meuble, le remet aux lois du repos
/// et ne garde rien — comme ceux de la sélection et du grand écran, il vit hors
/// du type du meuble.
@MainActor
struct ComposerSceneRestRelay {
    let host: MeeshyComposerHost

    /// La porte Caméra (#17111) n'est offerte que là où la scène sert la
    /// capture et où le format sert au moins un mode.
    var tools: [ComposerRestTool] {
        ComposerRestChrome.tools(offered: host.sceneDoors, hasBackgroundMedia: host.sceneBackgroundMedia != nil,
                                 cameraModes: host.sceneServesCapture
                                     ? ComposerSceneCamera.modes(for: host.selectedFormat) : [])
    }

    func handle(_ tool: ComposerRestTool) {
        if tool == .camera { return host.armSceneCamera() }
        if tool == .background, let fond = host.sceneBackgroundMedia?.id { return host.selectSceneBackground(fond) }
        if let door = tool.door { host.handleRailDoor(door) }
    }

    var moreEntries: [ComposerMoreMenuEntry] {
        ComposerMoreMenuPolicy.entries(.init(
            addsSlides: host.intent.origin.addsSlides,
            backgroundMedia: host.sceneEffectBackground,
            offeredDoors: host.sceneDoors,
            overflow: host.documentOverflowEntries,
            offersSoundReuse: ComposerSoundReuse.isOffered(slides: host.viewModel.slides),
            offersCommentSettings: ComposerCommentSettings.isOffered(format: host.selectedFormat,
                                                                     origin: host.intent.origin)))
    }

    var moreMenu: AnyView {
        let host = host
        return AnyView(
            ComposerSceneMoreMenu(label: ComposerOverflowCopy.menu, clearAllAsked: host.$sceneClearAllAsked,
                                  onClearAll: { host.perform(.clearAll) }) {
                ComposerSceneMoreMenuItems(
                    entries: moreEntries,
                    isAnimated: host.sceneIsAnimated,
                    onEntry: { host.performMore($0) },
                    onAnimation: { host.toggleSceneAnimation() },
                    onTimeline: { host.toggleSceneFrise() },
                    soundReuseAllowed: ComposerSoundReuse.isAllowed(host.soundExtractionChoice),
                    commentsDisabled: host.commentsDisabledChoice)
            }
        )
    }

    func perform(_ entree: ComposerMoreMenuEntry) {
        if let door = entree.door { return host.handleRailDoor(door) }
        switch entree {
        case .addSlide: addSlide()
        case .transitions: host.handleSceneTrailingOption(.sceneEffect(.opening, isOpen: host.activeSceneEffect == .opening))
        case .visualEffect: host.handleSceneTrailingOption(.sceneEffect(.visual, isOpen: host.activeSceneEffect == .visual))
        case .backgroundFraming: host.toggleFrameBand()
        case .legend: host.openSceneDescriptionEditing()
        case .preview: host.perform(.preview)
        case .pickBackground: host.perform(.pickBackground)
        case .removeBackground: host.perform(.removeBackground)
        case .saveToPhotos: host.perform(.saveToPhotos)
        case .share: host.perform(.share)
        case .clearAll: host.sceneClearAllAsked = true
        case .slideDuration: host.presentedPortal = .slideDuration
        case .soundReuse: host.soundExtractionChoice = ComposerSoundReuse.toggled(host.soundExtractionChoice)
        case .commentsOff: host.commentsDisabledChoice.toggle()
        case .animation, .hashtags: break
        }
    }

    /// Au plafond, le refus se DIT au lieu de se taire.
    func addSlide() {
        switch ComposerSceneAddition.outcome(canAddSlide: host.viewModel.canAddSlide) {
        case .added:
            host.viewModel.addSlide()
            HapticFeedback.light()
        case .refusedAtCap:
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(ComposerSlideRailCopy.capReached)
        }
    }

    var drawingBar: AnyView? {
        let viewModel = host.viewModel
        guard viewModel.isDrawingActive else { return nil }
        let host = host
        return AnyView(
            ComposerDrawingBar(brush: viewModel.activeBrushTool,
                               expanded: viewModel.drawingEditingMode.expandedTool,
                               canUndo: viewModel.canUndoStroke,
                               onItem: { host.handleDrawingBarItem($0) })
                .equatable()
        )
    }

    func handleDrawingBarItem(_ item: ComposerDrawingBarItem) {
        guard ComposerDrawingBarDispatch.apply(item, to: host.viewModel) else { return host.handleRailExitTool() }
    }

    /// **Le vide d'une scène habitée MASQUE le chrome, et le rend** (#17111).
    /// `true` quand le toucher est consommé par l'état masqué.
    func concealmentConsumes(_ issue: ComposerSceneEmptyTap.Outcome) -> Bool {
        let sceneHasContent = !ComposerSceneQuickCapture.sceneIsBlank(host.viewModel.currentSlide)
        switch ComposerChromeConcealment.tap(isConcealed: host.sceneChromeIsConcealed, emptyTap: issue,
                                             sceneHasContent: sceneHasContent) {
        case .reveal:
            host.sceneChromeIsConcealed = false
            return true
        case .conceal:
            host.selectedSceneItemId = nil
            host.inlineEdit = nil
            host.openSceneEffect = nil
            host.sceneChromeIsConcealed = true
            return true
        case .passThrough:
            return false
        }
    }
}
