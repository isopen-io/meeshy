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

    // MARK: - La barre haute : le (+) d'une nouvelle scène (#8713)

    /// **Le `(+)` prend la place de l'éclair** : un bouton rond de verre, au
    /// gabarit de la croix et du `⋯` qu'il voisine.
    var sceneAddSlideButton: AnyView {
        AnyView(
            Button {
                viewModel.addSlide()
                HapticFeedback.light()
            } label: {
                Image(systemName: "plus")
                    .font(.footnote.weight(.bold))
                    .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                    .frame(width: ComposerControlMetrics.visualDiameter,
                           height: ComposerControlMetrics.visualDiameter)
                    .contentShape(Circle())
                    .adaptiveGlass(in: Circle(), tint: tint.color.opacity(0.55))
                    .frame(minWidth: ComposerRailGeometry.railWidth,
                           minHeight: ComposerRailGeometry.railWidth)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(ComposerTrailingRailCopy.addSlide))
        )
    }

    // MARK: - Le rail gauche : l'éclair puis le Cadre, après le lieu (#8713)

    var sceneToggleEntries: [ComposerSceneToggleEntry] {
        ComposerLeadingSceneToggles.served(animated: !returnsToConversation,
                                           frame: sceneHasBackgroundMedia)
            .map { bouton in
                switch bouton {
                case .animated:
                    return ComposerSceneToggleEntry(toggle: bouton, isOn: sceneIsAnimated) {
                        toggleSceneAnimation()
                    }
                case .frame:
                    return ComposerSceneToggleEntry(toggle: bouton, isOn: requestedSceneBand == .frame) {
                        toggleFrameBand()
                    }
                }
            }
    }

    // MARK: - Le rail droit : les options du moment (#8713, #8714)

    /// **Ce que l'objet touché offre** — ses sections d'éditeur et ses actions,
    /// lues des DEUX inventaires qui existent. `nil` ⇒ rien de sélectionné, ou
    /// un identifiant qui ne désigne plus rien (un objet supprimé pendant que
    /// la sélection tenait).
    var sceneSelectionInventory: (sections: [ComposerObjectEditorSection],
                                  actions: [StoryCanvasContextAction])? {
        let slide = viewModel.currentSlide
        guard let id = selectedSceneItemId, let objet = slide.sceneObject(id: id) else { return nil }
        // **Le FOND n'offre que ses outils EN LIGNE** (#8847) : aucune entrée
        // de la colonne ne mène plus à l'éditeur plein écran pour lui.
        let sections = id == sceneBackgroundMedia?.id
            ? sceneBackgroundTools
            : ComposerObjectEditorRail.entries(
                for: objet.kind,
                hasTrimmableSource: viewModel.sourceTrim(id: id) != nil,
                offersFilter: Self.offersFilter(objet))
        let actions = ComposerTrailingRailPolicy.actions(
            slide: slide,
            selectedId: id,
            served: ComposerTrailingColumn.servedActions,
            hasEditor: editableSceneKindsServed.contains(Self.canvasKind(objet.kind)),
            canLeaveScene: false)
        return (sections, actions)
    }

    /// Le filtre d'un objet se cuit dans son IMAGE : une vidéo posée n'en rend
    /// aucun — la même question que l'éditeur pose (`objectOffersFilter`).
    private static func offersFilter(_ objet: MeeshySceneObject) -> Bool {
        guard case .media(let media) = objet else { return true }
        return media.kind != .video
    }

    private var editableSceneKindsServed: Set<StoryCanvasUIView.CanvasItemKind> {
        ComposerSceneSurface.defaultEditableSceneKinds
    }

    var sceneTrailingOptions: [ComposerTrailingColumn.Entry] {
        ComposerTrailingColumn.options(for: ComposerTrailingColumn.focus(
            railMode: sceneRailMode,
            selection: sceneSelectionInventory,
            effects: sceneEffects,
            openEffect: activeSceneEffect,
            backgroundTools: activeBackgroundEdit.map { (sections: sceneBackgroundTools, open: $0.openSection) }))
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
                                             objectSelected: sceneSelectionInventory != nil,
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
        case .backgroundSection(let section, _):
            tapBackgroundTool(section)
        case .exitTool where activeBackgroundEdit != nil && !sceneRailMode.opensTool:
            leaveBackgroundEdit()
        case .exitTool:
            // Terminer un outil rend la SCÈNE : le texte que la porte vient de
            // poser ne reste pas sélectionné derrière le `(x)`, sans quoi un
            // second `(x)` serait nécessaire pour retrouver les rails.
            handleRailExitTool()
            selectedSceneItemId = nil
            selectedSceneItemKind = nil
        case .editorSection(let section):
            guard let id = selectedSceneItemId else { return }
            openObjectEditor(id, section: section)
        case .objectAction(.edit):
            guard let id = selectedSceneItemId, let kind = selectedSceneItemKind else { return }
            editSceneItem(id, kind: kind)
        case .objectAction(let action):
            handleTrailingRailAction(action)
        case .exitObject:
            // Le `(x)` d'une sélection ne détruit rien : il rend les rails de
            // la scène.
            selectedSceneItemId = nil
            selectedSceneItemKind = nil
        }
    }

    /// **« Modifier » — le double toucher, l'appui long et la colonne droite
    /// ouvrent la MÊME édition** (#4074, #8680, #8714).
    ///
    /// Le `switch` est exhaustif pour que l'ajout d'un éditeur oblige à passer
    /// ici ET à élargir `editableSceneKinds` : servir l'un sans l'autre rendrait
    /// « Modifier » offert et inerte.
    func editSceneItem(_ id: String, kind: StoryCanvasUIView.CanvasItemKind) {
        switch kind {
        case .text:
            // La MÊME édition que la porte TEXTE (#8680) : scène réduite,
            // outils du texte et `(x)` au rail.
            beginSceneTextEditing(id)
            HapticFeedback.medium()
        case .audio:
            // « Création audio » SUR ce son (#4671) — le même écran que les
            // deux autres surfaces qui portent un son.
            editSceneSound(id)
        case .media, .sticker, .place:
            // L'éditeur d'objet sert les cinq familles (#4937).
            openObjectEditor(id)
            HapticFeedback.medium()
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
