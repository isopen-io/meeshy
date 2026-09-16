import SwiftUI
import UIKit

/// **CE QUE LA BARRE DE RÉPONSE DOIT AU CLAVIER** (#6751).
///
/// Constat porteur (2026-09-15) : répondre à un média ouvrait le clavier
/// PAR-DESSUS la barre — l'auteur écrivait ce qu'il ne voyait pas.
///
/// L'intention était pourtant déjà écrite : de toutes les couches du `ZStack`
/// de `ConversationMediaGalleryView`, `replyComposerLayer` est la seule à ne pas
/// porter `.ignoresSafeArea(.keyboard)`, et son doc-comment dit pourquoi —
/// « c'est elle qu'on tape ». **Ce qui manquait n'est pas l'intention, c'est que
/// l'ajustement automatique ne s'applique pas ici** : un `ZStack` prend la
/// taille de son plus grand enfant, quatre des cinq couches l'étendent à
/// l'écran entier (deux par un `.ignoresSafeArea()` NU), et une couche alignée
/// en bas d'un cadre pleine hauteur se pose derrière le clavier.
///
/// D'où une règle EXPLICITE plutôt qu'une délégation : la hauteur vient de
/// `KeyboardTransition` — le décodeur que la conversation utilise déjà, seul
/// site qui lit `keyboardWillShow`/`Hide` — et la vue l'APPLIQUE. Pure et
/// `nonisolated` : elle s'éprouve sans monter d'écran ni clavier.
nonisolated enum MediaReplyKeyboardInset {

    /// Réserve basse de la couche de saisie, en points.
    ///
    /// **Une hauteur minuscule reste un inset.** Un clavier matériel ne présente
    /// que sa barre de suggestions (~55 pt) ; la traiter comme « pas de clavier »
    /// rejouerait le défaut d'origine — plus rare, donc plus durable.
    ///
    /// Bornée à zéro par le bas : une frame hors écran (iPad en Slide Over) ne
    /// doit pas TIRER la barre sous le bord.
    static func bottomInset(for transition: KeyboardTransition?) -> CGFloat {
        max(0, transition?.height ?? 0)
    }

    /// Ce qu'un geste de la barre demande à l'écran. Une SUITE, pas un booléen :
    /// un booléen ne pourrait pas dire l'ordre, et l'ordre est ce qui distingue
    /// un geste d'un clignotement.
    enum Effect: Equatable { case dismissKeyboard, hideComposer }

    /// **L'ENVOI rend l'écran au média.** Le clavier d'abord : retirer la barre
    /// pendant que le clavier descend laisse voir un trou sous elle le temps du
    /// mouvement.
    static let sendEffects: [Effect] = [.dismissKeyboard, .hideComposer]

    /// **L'ANNULATION n'a pas de séquence.** Retirer la barre emporte son champ
    /// de saisie, donc le clavier avec — poser `dismissKeyboard` ici
    /// ajouterait un effet dont on ne saurait pas dire ce qu'il change.
    static let cancelEffects: [Effect] = [.hideComposer]

    /// L'idiome du dépôt pour résigner le premier répondeur, à UN endroit —
    /// `MeeshyComposerHost+Intake` et `ComposerObjectEditorView` le recopient
    /// chacun chez eux, ce qui en fait la troisième occurrence et donc le moment
    /// de le nommer.
    ///
    /// `UniversalComposerBar` ne sait pas RETIRER le focus : son `focusTrigger`
    /// ne lit que `if shouldFocus`, et son unique `isFocused = false` est sur le
    /// changement de `storyId`. Passer par le premier répondeur évite d'élargir
    /// le contrat d'un composant monté par une dizaine d'écrans pour le besoin
    /// d'un seul.
    @MainActor
    static func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                        to: nil, from: nil, for: nil)
    }

    /// Applique une suite d'effets. Le site UNIQUE qui les interprète : sans
    /// lui, chaque geste réécrirait sa propre séquence et les deux dériveraient.
    @MainActor
    static func apply(_ effects: [Effect], hideComposer: () -> Void) {
        for effect in effects {
            switch effect {
            case .dismissKeyboard: dismissKeyboard()
            case .hideComposer: hideComposer()
            }
        }
    }
}
