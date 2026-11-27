import SwiftUI
import MeeshySDK
import MeeshyUI

// **Ouvrir un objet de la scène pour l'ÉDITER** — le texte en ligne, l'éditeur
// d'objet, et la traduction entre les familles du modèle et du canvas.
// Extrait de `MeeshyComposerHost+Intake.swift` (#9138) : ce fichier y était à
// 1190 lignes, et ce qui OUVRE un objet n'est pas ce qui fait ENTRER de la
// matière.

extension MeeshyComposerHost {

    /// **Saisir un texte SUR la scène**, sans l'éditeur plein écran : le canvas
    /// ouvre sa saisie en ligne dès que `editingTextId` le désigne.
    func beginSceneTextEditing(_ id: String) {
        presentedPortal = nil
        selectedSceneItemId = id
        selectedSceneItemKind = .text
        viewModel.enterTextEditingMode(textId: id)
        // **Les réglages du texte collés au clavier** (#13839, L4) : Aa · Effet
        // · Langue · ● · ◯ · Cadre · Style du cadre · OK (#18781), et un panneau de la hauteur du clavier à sa place. La
        // colonne de droite se tait pendant la frappe (`Focus.typing`).
        keyboardDock.begin(session: .init(viewModel: viewModel,
                                          mentionBox: sceneMentionBox,
                                          onDone: { leaveInlineEdit() }))
        beginInlineEdit(id)
    }

    /// Chaque frappe sur la scène : le modèle, et la requête `@` de la bande
    /// collée au clavier (#13839, L4).
    func sceneInlineTextChanged(id: String, text: String) {
        viewModel.updateTextContent(id: id, text: text)
        sceneMentionBox.controller.handleQuery(in: text)
    }

    /// Le canvas dit que la saisie est finie ; le MODÈLE décide du sort d'une
    /// coquille vide — sauf quand l'éditeur plein écran possède l'édition
    /// (voir le câblage dans `sceneSurface`, #4634).
    func sceneInlineTextEnded() {
        guard editedObject == nil else { return }
        keyboardDock.end()
        viewModel.exitTextEditingMode()
    }

    /// **LE site unique d'ouverture d'un objet, quelle que soit la porte**
    /// (#4634, #4937) — menu du fond, vignette de slide, « Modifier », jetons,
    /// rognage.
    ///
    /// Sur la SCÈNE, il rend l'objet à l'édition en place (#9138) et
    /// l'éditeur plein écran ne s'ouvre plus. Ailleurs — l'atelier, le
    /// document —, il ouvre l'éditeur sur n'importe quelle famille, en fermant
    /// le portail d'abord : `fullScreenCover` et `.sheet` se disputent le même
    /// présentateur, et fermer l'état invalide chez l'ÉCRIVAIN vaut mieux que le
    /// garder chez le lecteur. Le mode SAISIE reste réservé au texte :
    /// `enterTextEditingMode` sur un sticker mettrait l'écran dans un état
    /// qu'aucune vue ne rend.
    ///
    /// - Parameter section: la section sur laquelle OUVRIR — `nil` ⇒ aucune
    ///   (sur la scène) ou celle que la famille sert en premier (ailleurs).
    ///   Elle vient des jetons et du rognage, qui nomment un réglage : l'auteur
    ///   l'a désigné du doigt, l'écran ne doit pas lui demander de le
    ///   retrouver.
    func openObjectEditor(_ id: String, section: ComposerObjectEditorSection? = nil) {
        // **Sur la scène, AUCUN objet ne s'ouvre plus plein écran** (#8847 pour
        // le fond, #9138 pour toutes les familles) : ses sous-outils au rail
        // droit, leurs options à droite depuis le haut — quelle que soit la
        // porte. L'éditeur plein écran ne reste que la destination de
        // l'atelier et du document.
        if beginInlineEdit(id, section: section) { return }
        presentedPortal = nil
        selectedSceneItemId = id
        let famille = viewModel.currentSlide.sceneObject(id: id)?.kind
        selectedSceneItemKind = famille.map(Self.canvasKind) ?? .text
        if famille == .text || famille == nil {
            viewModel.enterTextEditingMode(textId: id)
        }
        editedObject = ComposerEditedObject(id: id, section: section)
    }

    /// La traduction entre la famille du MODÈLE et le kind du CANVAS — deux
    /// énumérés qui portent les mêmes cinq familles depuis #4960, mais que Swift
    /// ne confond pas. Le `switch` est exhaustif : une sixième famille ne
    /// compilera pas tant qu'elle n'aura pas dit ce qu'elle est sur la toile.
    static func canvasKind(_ famille: MeeshySceneObject.Kind) -> StoryCanvasUIView.CanvasItemKind {
        switch famille {
        case .text:    return .text
        case .media:   return .media
        case .sticker: return .sticker
        case .place:   return .place
        case .audio:   return .audio
        }
    }

    /// Fermer rend la scène au doigt ET sort du mode d'édition — les deux, sans
    /// quoi le rail continuerait d'afficher les contrôleurs d'un texte qu'on
    /// n'édite plus. C'est le modèle qui décide du sort d'une coquille vide : il
    /// la supprime.
    func closeObjectEditor() {
        viewModel.exitTextEditingMode()
        editedObject = nil
    }

    var objectEditorPresenter: ComposerObjectEditorPresenter { ComposerObjectEditorPresenter(host: self) }
}

/// **L'éditeur d'objet plein écran, monté par le meuble** (#4634) — et ce qu'il
/// remet au meuble : supprimer l'objet ouvert, ou changer son plan (#5028).
@MainActor
struct ComposerObjectEditorPresenter {
    let host: MeeshyComposerHost

    func editor(for objet: ComposerEditedObject) -> ComposerObjectEditorView {
        ComposerObjectEditorView(
            viewModel: host.viewModel,
            // La MÊME boîte que la surface du dessous : le portail charge
            // ses candidats une fois (`.task` plus bas), et l'écran modal
            // — où la frappe a réellement lieu depuis #4634 — la reçoit.
            mentionBox: host.sceneMentionBox,
            objectId: objet.id,
            aspectRatio: host.viewModel.currentCanvasRatio,
            plateauTint: host.tint.color,
            sceneImages: host.viewModel.loadedImages,
            sceneStickerAnimations: host.viewModel.loadedStickerAnimations,
            sceneImagesVersion: host.viewModel.loadedImagesVersion,
            onClose: { host.closeObjectEditor() },
            // Le plan 2D peut désigner un autre objet : c'est le MEUBLE qui
            // possède « quel objet est ouvert », et deux sources pour ce
            // fait divergeraient au premier tap sur une barre voisine.
            onSelectObject: { id in host.editedObject = ComposerEditedObject(id: id) },
            // **La carte vit au MEUBLE** (#4756) : c'est lui qui greffe la
            // charge d'accessibilité sur ce que l'atelier remet au publieur
            // (`accessibilityCarryingComposerCaptions`). Un magasin tenu par
            // l'éditeur mourrait à sa fermeture — le défaut que la légende a
            // payé avant #4890.
            mediaAltText: host.mediaAltBinding(for: objet.id),
            // **La section par laquelle on ENTRE** (2026-09-05). Un jeton
            // de l'inspecteur nomme un réglage précis ; l'écran s'ouvre
            // dessus au lieu de le faire rechercher. `nil` pour les autres
            // portes — appui long, création, plan 2D — qui ne désignent
            // rien.
            //
            // L'ordre des arguments SUIT la déclaration : cette vue n'a pas
            // d'`init` écrit à la main, donc son init memberwise impose
            // l'ordre des propriétés.
            initialSection: objet.section,
            onObjectAction: { perform($0, on: objet.id) }
        )
    }

    /// Le même retrait que la corbeille de la scène, sans confirmation :
    /// l'historique global est le filet, comme sur la scène. Supprimer ferme
    /// l'écran — un éditeur sans sujet n'est pas un état.
    func perform(_ action: StoryCanvasContextAction, on objectId: String) {
        if action == .delete { remove(objectId) }
        if ComposerObjectEditorRail.closesEditor(after: action) { host.closeObjectEditor() }
    }

    private func remove(_ objectId: String) {
        host.retractMedia(objectIds: [objectId])
        guard host.selectedSceneItemId == objectId else { return }
        host.selectedSceneItemId = nil
        host.selectedSceneItemKind = nil
    }
}
