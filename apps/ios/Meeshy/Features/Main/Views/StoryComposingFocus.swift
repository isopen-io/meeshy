import SwiftUI

// MARK: - Écrire un commentaire fait le SILENCE autour (#8601)
//
// Demande porteur du 2026-09-28 : « Lorsqu'on veut laisser un commentaire sur
// une story, il faut faire disparaître les boutons et décorateurs autour sauf
// les commentaires si affichés… Même chose pour les réponses aux attachements
// de commentaire et attachements de messages en plein écran etc. »
//
// La galerie plein écran des pièces jointes le fait depuis #6817
// (`MediaStageVeil`) : la barre de réponse montée, le plateau s'efface. Le
// lecteur de stories, lui, ne masquait rien — l'en-tête, le rail d'actions, la
// légende, les pastilles audio restaient peints autour du champ qu'on tape.
//
// ## Pourquoi un critère DISTINCT de `chromeVisible`
//
// `chromeVisible` est l'état d'IMMERSION du lecteur (tap, glissé, session plein
// écran) : il retire AUSSI le composeur (`composerLayer`), et c'est juste —
// en immersion, on regarde. Pendant la saisie, c'est l'inverse : le composeur
// est précisément ce qui doit rester. Poser `chromeVisible = false` à la
// focalisation ferait donc disparaître le champ qu'on vient de toucher. Le
// silence de la saisie est une AUTRE question, et elle a sa règle.

/// **Ce que le lecteur de stories peint pendant qu'on écrit — la règle, sans
/// vue.**
///
/// Deux familles, parce qu'elles ne répondent pas à la même question :
///
/// - le **chrome** (voiles, barres de progression, en-tête, `ReferenceNoteRow`,
///   rail d'actions) suit DÉJÀ l'immersion ; il suit désormais aussi la
///   saisie. La conjonction dit les deux.
/// - les **décorations du contenu** (légende, pastilles audio, cibles de lieu,
///   réactions en vol) restent peintes en immersion — c'est du contenu, pas du
///   chrome — mais se taisent pendant la saisie.
///
/// Ce qui n'y figure pas reste, et c'est la moitié de la demande : le média ou
/// la scène, le composeur, et la couche des commentaires si elle est ouverte.
nonisolated enum StoryComposingFocus {

    static func showsChrome(chromeVisible: Bool, isComposing: Bool) -> Bool {
        chromeVisible && !isComposing
    }

    static func showsContentDecorations(isComposing: Bool) -> Bool {
        !isComposing
    }

    /// Le fondu : court, sans ressort — on fait de la place, on n'annonce rien.
    static let fade = Animation.easeInOut(duration: 0.2)
}

extension View {

    /// **S'effacer en FONDU, et cesser d'intercepter le doigt.**
    ///
    /// L'opacité seule laisserait un bouton invisible répondre ; le retrait de
    /// la hiérarchie ferait sauter la couche au lieu de la fondre. Les deux
    /// ensemble, et l'animation portée par la VALEUR — jamais par la racine du
    /// lecteur, qui installerait une transaction animée sur tout l'arbre.
    func storyFocusFade(_ visible: Bool) -> some View {
        opacity(visible ? 1 : 0)
            .allowsHitTesting(visible)
            .accessibilityHidden(!visible)
            .animation(StoryComposingFocus.fade, value: visible)
    }
}

extension StoryCardView {

    /// Le chrome du lecteur — immersion ET saisie (#8601).
    var readerChromeShown: Bool {
        StoryComposingFocus.showsChrome(chromeVisible: chromeVisible, isComposing: isComposerEngaged)
    }

    /// Les décorations du contenu — tues pendant la saisie seulement (#8601).
    var readerDecorationsShown: Bool {
        StoryComposingFocus.showsContentDecorations(isComposing: isComposerEngaged)
    }
}
