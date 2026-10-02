import SwiftUI
import MeeshySDK
import MeeshyUI

// **Ouvrir un objet de la scène pour l'ÉDITER** — le texte en ligne, l'éditeur
// d'objet, et la traduction entre les familles du modèle et du canvas.
// Extrait de `MeeshyComposerHost+Intake.swift` (#9138) : ce fichier y était à
// 1190 lignes, et ce qui OUVRE un objet n'est pas ce qui fait ENTRER de la
// matière.

extension MeeshyComposerHost {

    /// **LA façon d'éditer un texte — une seule, quelle que soit la porte**
    /// (#4634, directive porteur : « il faut préserver la même façon d'éditer un
    /// texte que celle de le créer »).
    ///
    /// Créer un texte et modifier un texte existant passaient tous deux par
    /// `enterTextEditingMode`, mais aboutissaient à des écrans différents : la
    /// création ouvrait l'édition en ligne avec une zone basse VIDE (aucun outil
    /// déplié), la modification la même chose. Les dix-huit styles, eux,
    /// n'étaient atteignables qu'APRÈS avoir refermé l'éditeur.
    ///
    /// Ce site unique ouvre l'éditeur plein écran dans les deux cas — et ferme
    /// le portail d'abord : `fullScreenCover` et `.sheet` se disputent le même
    /// présentateur, et fermer l'état invalide chez l'ÉCRIVAIN vaut mieux que le
    /// garder chez le lecteur.
    /// **Ouvre l'éditeur sur N'IMPORTE QUELLE famille** (#4937).
    ///
    /// Il posait `.text` en dur et entrait toujours en mode saisie — l'écran ne
    /// savait éditer qu'un texte. Taper un sticker ou un média ne faisait alors
    /// RIEN, ce qui se lit comme une scène morte plutôt que comme une limite.
    ///
    /// Le mode SAISIE reste réservé au texte, et c'est une distinction, pas une
    /// précaution : `enterTextEditingMode` ouvre le curseur en ligne sur le
    /// canvas. L'appeler sur un sticker mettrait l'écran dans un état qu'aucune
    /// vue ne rend.
    /// - Parameter section: la section sur laquelle OUVRIR — `nil` ⇒ celle que
    ///   la famille sert en premier. Elle vient des jetons de l'inspecteur
    ///   (2026-09-05), qui nomment chacun un réglage : l'auteur a désigné
    ///   « ALIGN ▭ » du doigt, l'écran ne doit pas lui demander de le
    ///   retrouver. Les autres portes — appui long, création, plan 2D — ne
    ///   désignent rien et passent `nil`.
    /// **Saisir un texte SUR la scène**, sans l'éditeur plein écran : le canvas
    /// ouvre sa saisie en ligne dès que `editingTextId` le désigne.
    func beginSceneTextEditing(_ id: String) {
        presentedPortal = nil
        selectedSceneItemId = id
        selectedSceneItemKind = .text
        viewModel.enterTextEditingMode(textId: id)
    }

    func openObjectEditor(_ id: String, section: ComposerObjectEditorSection? = nil) {
        // **Le FOND ne s'ouvre plus plein écran** (#8847) : ses outils au rail
        // droit, leurs contrôles sous la scène — quelle que soit la porte.
        if backgroundToolsRedirect(id, section: section) { return }
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
