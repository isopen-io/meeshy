import SwiftUI
import MeeshySDK
import MeeshyUI

// **Ce que la scène DÉRIVE de ses états** — les lectures à site unique que la
// surface, le socle et le rail partagent. Extraites de
// `MeeshyComposerHost+Surfaces.swift` : elles ne montent rien, elles répondent.

extension MeeshyComposerHost {

    /// L'unique lecture du juge de l'historique. Le socle posait la même
    /// question à deux endroits ; le rail la pose une fois.
    var composerServesHistory: Bool {
        ComposerHistoryService.servesHistory(on: mountedComposerView)
    }

    /// **Les jetons de l'objet sélectionné — un site unique.** Trois
    /// consommateurs les lisent (la rangée, le jeton encadré, le geste), et
    /// trois résolutions du même jeu peuvent diverger.
    var sceneObjectChips: [ComposerObjectChips.Chip] {
        ComposerObjectChips.chips(forSelected: selectedSceneItemId,
                                  in: viewModel.currentSlide)
    }

    /// **Les bandes qu'on peut OUVRIR à cet instant** — un site unique.
    ///
    /// Elle servait deux consommateurs par deux appels séparés : la bande
    /// elle-même, et les jetons de l'inspecteur qui doivent savoir si leur
    /// destination mène quelque part. Deux calculs du même jeu peuvent
    /// diverger, et le jour où ils divergent le jeton s'illumine sur une bande
    /// que `opened` refuse — un contrôle inerte qui a l'air vivant, c'est-à-dire
    /// exactement le défaut que ce câblage vient de fermer.
    var openableSceneBands: Set<ComposerSceneBand> {
        ComposerSceneCapabilities.bands
    }

    /// **Un texte se saisit-il SUR la scène ?** L'état d'édition existe aussi
    /// pendant que l'éditeur plein écran est monté (`openObjectEditor`) — la
    /// scène, couverte, n'a alors rien à montrer.
    var sceneTextEditing: Bool {
        viewModel.textEditingMode.activeTextId != nil && editedObject == nil
    }

    /// **Les portes servies sur la scène.** La porte « Fond » peint une
    /// COULEUR : sous un média de fond, elle n'a plus d'objet — le Cadre du
    /// rail droit prend le relais.
    var sceneDoors: [ComposerRailDoor] {
        let offertes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                                format: selectedFormat,
                                                allowsCapture: profile.allowsCapture)
        return sceneHasBackgroundMedia ? offertes.filter { $0 != .background } : offertes
    }

    /// **Ce que le rail de la scène montre** — un site unique, lu par la
    /// surface ET par le socle : les deux doivent céder au MÊME outil ouvert.
    var sceneRailMode: ComposerRailMode {
        ComposerRailMode.resolve(
            drawing: viewModel.isDrawingActive,
            // Un texte en ÉDITION EN PLACE montre ses sous-outils par la
            // colonne de l'objet (#9138), jamais par le mode du rail.
            textEditing: ComposerFirstView.railShowsTextTools(
                textEditing: sceneTextEditing && activeInlineEdit == nil),
            expandedDrawingTool: viewModel.drawingEditingMode.expandedTool,
            expandedTextTool: viewModel.textEditingMode.expandedTool,
            doors: sceneDoors)
    }

    /// **Un outil de la SCÈNE occupe-t-il l'écran ?** (#8652) Faux sous toute
    /// autre surface : le document et l'humeur gardent leur socle.
    var sceneToolOwnsScreen: Bool {
        mountedComposerView == .scene
            && ComposerToolFocus.toolIsOpen(railOpensTool: sceneRailMode.opensTool,
                                             editsInline: activeInlineEdit != nil)
    }

    /// **L'indication grise de la capture rapide** (#8653) — la MÊME question
    /// que celle que le toucher pose (`handleSceneQuickTap`) : l'indication ne
    /// promet jamais un geste que la scène refuserait.
    var sceneQuickCaptureHint: ComposerSceneQuickCapture.Hint? {
        guard ComposerSceneQuickCapture.offers(
            sceneIsBlank: ComposerSceneQuickCapture.sceneIsBlank(viewModel.currentSlide),
            format: selectedFormat,
            stage: sceneCameraStage,
            toolIsOpen: sceneToolOwnsScreen) else { return nil }
        return ComposerSceneQuickCapture.hint(format: selectedFormat)
    }
}
