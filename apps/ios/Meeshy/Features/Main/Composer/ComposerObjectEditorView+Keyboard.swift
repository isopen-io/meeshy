import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le clavier du canvas et le panneau d'options s'excluent** (#6156, directive
/// porteur 2026-09-12 — cas 2 et 3 de la loi #6132).
///
/// > « Ici on a clairement une composition visuelle non désirée ! C'est soit le
/// > clavier soit les choix de police… Pour avoir le clavier il faut toucher le
/// > texte en édition, et si on veut changer le style ça enlève le focus. »
///
/// ## Ce que la capture montrait
///
/// Clavier levé ET grille des dix-huit polices dépliée. Le texte en cours
/// d'édition — la seule chose que l'auteur regarde — tenait dans une carte
/// d'environ 200 × 330 pt en haut d'un écran de 874. Deux contrôleurs se
/// partageaient le bas, aucun des deux n'était entier, et la chose éditée était
/// la plus petite à l'écran.
///
/// ## Pourquoi un modifieur, et pas deux lignes dans le `body`
///
/// Deux raisons, et la seconde est la vraie.
///
/// La première tient au budget : `ComposerObjectEditorView.swift` est à 1164
/// lignes pour un plafond DUR de 1200. Ce qui s'ajoute s'ajoute ailleurs.
///
/// La seconde tient à la doctrine du dépôt : **une condition posée dans un
/// `body` est invisible aux tests, et c'est ainsi qu'une règle produit se met à
/// exister en deux exemplaires.** Le prédicat vit donc chez
/// `ComposerObjectEditorRail`, avec les autres règles pures de cet écran ; ce
/// fichier ne fait que le BRANCHER.
struct ComposerObjectEditorKeyboardExclusion: ViewModifier {

    @Binding var keyboardTransition: KeyboardTransition?
    @Binding var optionsAreCollapsed: Bool

    /// La section OUVERTE — c'est elle qui décide, parce que c'est elle qui
    /// possède (ou non) le champ que le clavier sert.
    let section: ComposerObjectEditorSection

    func body(content: Content) -> some View {
        content
            .observingKeyboardTransition($keyboardTransition)
            .adaptiveOnChange(of: keyboardTransition) { _, transition in
                rangerSiLeClavierMonte(transition)
            }
    }

    /// **`height > 0` est la seule lecture de « le clavier monte » disponible
    /// ici** : `KeyboardTransition` ne STOCKE pas `isPresenting` — son init le
    /// consomme pour décider quelle hauteur retenir, et pose 0 à la descente.
    /// Lire la hauteur, c'est donc lire l'intention, pas la deviner.
    private func rangerSiLeClavierMonte(_ transition: KeyboardTransition?) {
        guard let transition, transition.height > 0 else { return }
        guard ComposerObjectEditorRail.collapsesWhenKeyboardRises(section) else { return }
        guard !optionsAreCollapsed else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            optionsAreCollapsed = true
        }
    }
}

extension View {

    /// Tient l'exclusion : le clavier qui sert le CANVAS range le panneau, celui
    /// qui sert un champ DU panneau le laisse ouvert.
    func excludingOptionsWhileTyping(keyboardTransition: Binding<KeyboardTransition?>,
                                     optionsAreCollapsed: Binding<Bool>,
                                     section: ComposerObjectEditorSection) -> some View {
        modifier(ComposerObjectEditorKeyboardExclusion(
            keyboardTransition: keyboardTransition,
            optionsAreCollapsed: optionsAreCollapsed,
            section: section))
    }
}
