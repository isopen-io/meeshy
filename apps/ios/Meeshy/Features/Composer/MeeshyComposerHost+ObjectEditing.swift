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
        // **Les sous-outils du texte à droite, comme toute famille** (#9138) :
        // la saisie et l'édition en place sont le MÊME état, clavier en plus.
        beginInlineEdit(id)
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
}
