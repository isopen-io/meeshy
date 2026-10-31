import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le repos posé sur la scène (#13839)

/// Les six boutons, ⋯ et la barre de dessin ouvrent ce que les rails ouvraient,
/// par les MÊMES fonctions : seule la géographie change.
extension MeeshyComposerHost {

    var sceneRestTools: [ComposerRestTool] { ComposerRestChrome.tools(offered: sceneDoors) }

    func handleRestTool(_ tool: ComposerRestTool) {
        if let door = tool.door { handleRailDoor(door) }
    }


    var sceneMoreEntries: [ComposerMoreMenuEntry] {
        ComposerMoreMenuPolicy.entries(.init(
            addsSlides: intent.origin.addsSlides,
            backgroundMedia: sceneEffectBackground,
            offeredDoors: sceneDoors,
            offersPostBody: socleServesPostText,
            overflow: documentOverflowEntries))
    }

    var sceneMoreMenu: AnyView {
        AnyView(
            ComposerSceneMoreMenu(label: ComposerOverflowCopy.menu, clearAllAsked: $sceneClearAllAsked,
                                  onClearAll: { perform(.clearAll) }) {
                ComposerSceneMoreMenuItems(
                    entries: sceneMoreEntries,
                    isAnimated: sceneIsAnimated,
                    duration: TimeInterval(viewModel.currentSlideDuration),
                    onEntry: { performMore($0) },
                    onAnimation: { toggleSceneAnimation() },
                    onTimeline: { toggleSceneFrise() },
                    onDuration: { viewModel.currentSlideDuration = Float($0) })
            }
        )
    }

    func performMore(_ entree: ComposerMoreMenuEntry) {
        if let door = entree.door { return handleRailDoor(door) }
        switch entree {
        case .addSlide: addSceneSlide()
        case .background: handleRailDoor(.background)
        case .transitions: handleSceneTrailingOption(.sceneEffect(.opening, isOpen: activeSceneEffect == .opening))
        case .visualEffect: handleSceneTrailingOption(.sceneEffect(.visual, isOpen: activeSceneEffect == .visual))
        case .backgroundFraming: toggleFrameBand()
        case .legend: openSceneDescriptionEditing()
        case .preview: perform(.preview)
        case .pickBackground: perform(.pickBackground)
        case .removeBackground: perform(.removeBackground)
        case .saveToPhotos: perform(.saveToPhotos)
        case .share: perform(.share)
        case .clearAll: sceneClearAllAsked = true
        case .animation, .slideDuration, .writePost, .mention, .hashtags, .place: break
        }
    }

    /// Au plafond, le refus se DIT au lieu de se taire.
    func addSceneSlide() {
        switch ComposerSceneAddition.outcome(canAddSlide: viewModel.canAddSlide) {
        case .added:
            viewModel.addSlide()
            HapticFeedback.light()
        case .refusedAtCap:
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(ComposerSlideRailCopy.capReached)
        }
    }

    /// La légende n'est jamais un champ permanent : le volet reste MONTÉ (sa
    /// requête d'édition doit l'atteindre), visible en écrivant ou écrite.
    var sceneLegendIsVisible: Bool {
        editsSceneDescription || !sceneDescriptionBinding.wrappedValue.isEmpty
    }

    var sceneDrawingBar: AnyView? {
        guard viewModel.isDrawingActive else { return nil }
        return AnyView(
            ComposerDrawingBar(brush: viewModel.activeBrushTool,
                               expanded: viewModel.drawingEditingMode.expandedTool,
                               canUndo: viewModel.canUndoStroke,
                               onItem: { handleDrawingBarItem($0) })
                .equatable()
        )
    }

    func handleDrawingBarItem(_ item: ComposerDrawingBarItem) {
        guard ComposerDrawingBarDispatch.apply(item, to: viewModel) else { return handleRailExitTool() }
    }
}
