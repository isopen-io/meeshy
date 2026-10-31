import SwiftUI
import MeeshySDK
import MeeshyUI

// **La géographie des rails de la scène, côté meuble** (#8713, #8714 —
// directive porteur 2026-09-29).
//
// La règle vit dans `ComposerSceneColumns.swift` ; ce fichier lui FOURNIT
// l'état du meuble (outil ouvert, objet touché, fond, mode Animé) et relaie ses
// entrées vers les primitives qui existaient déjà. Aucune action n'est neuve :
// la colonne droite ouvre l'éditeur d'objet, empile, duplique ou supprime par
// les mêmes chemins que l'appui long et le double toucher.
@MainActor
extension MeeshyComposerHost {

    // MARK: - La nouvelle scène vit dans ⋯ (#13839)
    //
    // Le `(+)` de la barre haute est parti avec elle : « ⋯ › Ajouter une
    // diapo » appelle `addSceneSlide()` (`MeeshyComposerHost+Rest.swift`).

    // MARK: - L'éclair et le Cadre vivent dans ⋯ (#13839)
    //
    // « ⋯ › Animation » appelle `toggleSceneAnimation()` / `toggleSceneFrise()`,
    // « ⋯ › Cadrage du fond » appelle `toggleFrameBand()`.

    // MARK: - Le rail droit : les options du moment (#8713, #8714)

    var sceneTrailingFocus: ComposerTrailingColumn.Focus {
        ComposerTrailingColumn.focus(
            railMode: sceneRailMode,
            objectIsEdited: activeInlineEdit != nil,
            effects: sceneEffects,
            openEffect: activeSceneEffect,
            typing: sceneTypesInline)
    }

    /// ↶ de la scène : `nil` quand il n'y a rien à défaire, ou quand le pied
    /// du focus ne le porte pas — la frappe n'en sert pas (#13839, L4).
    var sceneUndo: (() -> Void)? {
        guard composerServesHistory, viewModel.canUndoGlobal,
              ComposerTrailingColumn.servesHistory(.undo, for: sceneTrailingFocus) else { return nil }
        return { performHistoryUndo() }
    }

    var sceneRedo: (() -> Void)? {
        guard composerServesHistory, viewModel.canRedoGlobal,
              ComposerTrailingColumn.servesHistory(.redo, for: sceneTrailingFocus) else { return nil }
        return { performHistoryRedo() }
    }

    var sceneTrailingOptions: [ComposerTrailingColumn.Entry] {
        ComposerTrailingColumn.options(for: sceneTrailingFocus)
    }

    // MARK: - Les effets d'une scène à fond média (#8712)

    /// Le fond MÉDIA de la slide — image ou vidéo. Une couleur n'en est pas un.
    var sceneEffectBackground: ComposerSceneEffects.Background? {
        guard let fond = viewModel.currentSlide.effects.mediaObjects?.first(where: \.isBackground) else {
            return nil
        }
        return fond.kind == .video ? .video : .image
    }

    var sceneEffects: [ComposerSceneEffect] {
        ComposerSceneEffects.served(background: sceneEffectBackground)
    }

    /// Le carrousel RÉELLEMENT ouvert — la règle le referme dès que la scène
    /// cesse de le servir.
    var activeSceneEffect: ComposerSceneEffect? {
        guard mountedComposerView == .scene else { return nil }
        return ComposerSceneEffects.carousel(open: openSceneEffect,
                                             served: sceneEffects,
                                             objectSelected: activeInlineEdit != nil || sceneSelectionRelay.current != nil,
                                             toolIsOpen: sceneToolOwnsScreen)
    }

    /// **Le carrousel, en bas, à la place de l'audience et de Publier.** Les
    /// contenus sont les briques du SDK : les puces d'entrée et de sortie, et
    /// la grille des effets visuels dont chaque tuile est le fond COURANT, filtre
    /// appliqué (`StoryFilterThumbnails`, rendu hors du fil principal).
    func sceneEffectCarousel(_ effet: ComposerSceneEffect) -> some View {
        ComposerSceneEffectCarousel(effect: effet,
                                    plateauTint: tint.color,
                                    onClose: { openSceneEffect = nil }) {
            switch effet {
            case .opening:
                ComposerSceneTransitionRows(opening: sceneTransitions.opening,
                                            closing: sceneTransitions.closing) { choix in
                    chooseSceneEffect(choix)
                }
            case .visual:
                StoryFilterGridView(viewModel: viewModel,
                                    previewImage: viewModel.currentSlideBackgroundImage,
                                    onChoose: { chooseSceneEffect(.visual($0)) })
            }
        }
    }

    /// Les transitions de la slide COURANTE, lues sur la slide — pas sur l'état
    /// global de l'atelier, qui ne suit pas un changement de slide fait au meuble.
    var sceneTransitions: ComposerSceneEffects.Transitions {
        let effets = viewModel.currentSlide.effects
        return ComposerSceneEffects.Transitions(opening: effets.opening, closing: effets.closing)
    }

    /// **Chaque choix met la scène à jour ET rejoue l'ouverture puis la
    /// fermeture** (#8792) — sur le canvas de la scène, par le même pont que la
    /// frise, sans quitter le carrousel.
    func chooseSceneEffect(_ choix: ComposerSceneEffects.Choice) {
        let avant = sceneTransitions
        let apres = ComposerSceneEffects.transitions(after: choix, from: avant)
        if apres != avant {
            viewModel.setSlideTransitions(opening: apres.opening, closing: apres.closing)
        }
        guard let plan = ComposerSceneEffects.rehearsal(after: choix, from: avant) else { return }
        // Un tour de boucle APRÈS le choix : le premier effet visuel fait
        // paraître le curseur d'intensité, la scène se recadre et SwiftUI peut
        // remonter son canvas — une répétition lancée avant jouerait sur
        // l'ancien, hors de l'écran (mesuré au simulateur).
        let pont = viewModel.canvasTimelineBridge
        DispatchQueue.main.async {
            pont.rehearseTransitions(opening: plan.opening, closing: plan.closing)
        }
    }

    /// **Chaque entrée retombe sur la primitive qui existait déjà.**
    func handleSceneTrailingOption(_ entry: ComposerTrailingColumn.Entry) {
        switch entry {
        case .sceneEffect(let effet, _):
            openSceneEffect = ComposerSceneEffects.toggled(effet, open: activeSceneEffect)
        case .toolControl(let control):
            handleRailToolControl(control)
        case .exitTool:
            // Terminer un outil rend la SCÈNE : le texte que la porte vient de
            // poser ne reste pas sélectionné derrière le `(x)`, sans quoi un
            // second `(x)` serait nécessaire pour retrouver les rails.
            handleRailExitTool()
            selectedSceneItemId = nil
            selectedSceneItemKind = nil
        }
    }

    /// **« Modifier » — le double toucher, l'appui long et la barre de la
    /// sélection ouvrent la MÊME édition** (#4074, #8680, #13839 L5).
    ///
    /// Le `switch` est exhaustif pour que l'ajout d'un éditeur oblige à passer
    /// ici ET à élargir `editableSceneKinds` : servir l'un sans l'autre rendrait
    /// « Modifier » offert et inerte.
    func editSceneItem(_ id: String, kind: StoryCanvasUIView.CanvasItemKind) {
        switch kind {
        case .text:
            // La MÊME édition que la porte TEXTE (#8680) : la frappe, barre
            // collée au clavier (L4).
            beginSceneTextEditing(id)
            HapticFeedback.medium()
        case .audio:
            // « Création audio » SUR ce son (#4671).
            editSceneSound(id)
        case .media, .sticker, .place:
            // **Tout objet s'édite EN PLACE** (#9138, #13840) : un média par sa
            // feuille non destructive, un sticker et un lieu par leur feuille
            // (`modifySceneItem`). Textes, stickers et sons posés par-dessus
            // restent mobiles jusqu'à la publication.
            sceneSelectionRelay.modifySceneItem(id)
        }
    }

    // MARK: - Un média de premier plan devient le fond (#8716)

    /// **Le média devient le fond ; l'ancien fond est RETIRÉ, pas perdu.**
    ///
    /// L'ordre compte : `toggleBackground` d'abord — il marque le nouveau et
    /// démarque l'ancien —, le retrait ensuite. Retiré en premier, l'ancien
    /// laisserait le nouveau devenir le fond IMPLICITE de la slide, et la
    /// bascule le rendrait alors au premier plan. Le retrait passe par le
    /// meuble (#6577), et l'historique rend les deux d'un seul « annuler ».
    func makeSceneBackground(_ id: String) {
        let ancien = viewModel.currentSlide.effects.mediaObjects?
            .first { $0.isBackground && $0.id != id }?.id
        viewModel.toggleBackground(id: id)
        if let ancien { retractMedia(objectIds: [ancien]) }
        selectedSceneItemId = nil
        selectedSceneItemKind = nil
        HapticFeedback.medium()
    }
}
