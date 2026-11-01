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

    /// **On écrit SUR la scène** (#13839, L4) : la barre collée au clavier porte
    /// les réglages, la colonne de droite se tait.
    var sceneTypesInline: Bool {
        sceneTextEditing && mountedComposerView == .scene
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

    /// **L'indication grise de la capture rapide** (#8653) — la question du
    /// toucher (`handleSceneQuickTap`), après la relecture de l'ouverture (#13899).
    var sceneQuickCaptureHint: ComposerSceneQuickCapture.Hint? {
        guard autosave.didBind, ComposerSceneQuickCapture.offers(
            sceneIsBlank: ComposerSceneQuickCapture.sceneIsBlank(viewModel.currentSlide),
            format: selectedFormat,
            stage: sceneCameraStage,
            toolIsOpen: sceneToolOwnsScreen) else { return nil }
        return ComposerSceneQuickCapture.hint(format: selectedFormat)
    }
}
