import SwiftUI
import MeeshySDK
import MeeshyUI

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

    /// Les décorations du contenu — tues pendant la saisie (#8601) et pendant
    /// la lecture des commentaires (#8642).
    var readerDecorationsShown: Bool {
        StorySceneFocus.showsContentDecorations(isComposing: isComposerEngaged, commentsOpen: showCommentsOverlay)
    }

    /// Ce que le composeur occupe depuis le bas de l'écran — clavier ou zone
    /// sûre, plus la plaque mesurée. `nil` hors saisie : la scène garde alors
    /// son cadrage de lecture (#8642).
    var composingSceneReserve: CGFloat? {
        guard isComposerEngaged, let block = composerBlockHeight else { return nil }
        return composerBottomPadding(geometry) + block
    }
}

// MARK: - Lire les commentaires FLOUTE la scène ; écrire la RÉDUIT (#8642)
//
// Demande porteur du 2026-09-29 : « Lorsqu'on affiche les commentaires d'une
// story, floute un peu toute la scène histoire de permettre [la lecture].
// Lorsqu'on ouvre pour créer un commentaire il faut réduire la scène pour que ce
// soit visible entièrement au-dessus du Universal Composer bar ! »
//
// Les deux gestes répondent à la même question — que garder en vue pendant
// l'opération ? — par deux réponses opposées, parce que les deux opérations ne
// regardent pas la même chose :
//
// - LIRE des commentaires regarde la liste : la scène recule (un flou léger) et
//   ses décorations se taisent, elles se posaient au même bas d'écran ;
// - ÉCRIRE un commentaire regarde la scène qu'on commente : elle ne doit plus
//   disparaître sous le clavier et la plaque, elle se RÉDUIT pour tenir entière
//   au-dessus d'eux, ancrée en haut, avec les coins de la carte.

/// **La scène d'une story pendant qu'on lit ou qu'on écrit ses commentaires —
/// la règle, sans vue.** Le cadrage réduit n'est pas un second solveur : il
/// remet à `StoryCanvasFraming.resolve` une région plus courte, et c'est la loi
/// de la carte qui rend l'échelle.
nonisolated enum StorySceneFocus {

    /// « Un peu » : la scène se devine encore sous la liste.
    static let commentsBlurRadius: CGFloat = 6

    /// L'air laissé entre la carte réduite et ses bornes — zone sûre en haut,
    /// plaque de verre en bas.
    static let composingGap: CGFloat = 8

    static func blurRadius(commentsOpen: Bool) -> CGFloat {
        commentsOpen ? commentsBlurRadius : 0
    }

    static func showsContentDecorations(isComposing: Bool, commentsOpen: Bool) -> Bool {
        StoryComposingFocus.showsContentDecorations(isComposing: isComposing) && !commentsOpen
    }

    /// En saisie, la scène est une CARTE, même en session plein écran : une
    /// scène qui couvre le viewport ne peut pas tenir au-dessus du clavier.
    static func presentation(resting: StoryCanvasFraming.Presentation,
                             isComposing: Bool) -> StoryCanvasFraming.Presentation {
        isComposing ? .carded : resting
    }

    /// **La région de la carte pendant la saisie** : de la zone sûre au haut de
    /// la plaque, ancrée en haut. Sans réserve mesurée, le cadrage de lecture
    /// reste intact.
    static func framingInput(resting: StoryCanvasFraming.Input,
                             topInset: CGFloat,
                             composerReserve: CGFloat?) -> StoryCanvasFraming.Input {
        guard let reserve = composerReserve, reserve > 0 else { return resting }
        return StoryCanvasFraming.Input(
            viewport: resting.viewport,
            headerInset: topInset + composingGap,
            bottomInset: reserve + composingGap,
            sideInset: resting.sideInset,
            state: .carded,
            cardedCornerRadius: resting.cardedCornerRadius,
            verticalAlignment: .top,
            canvasRatio: resting.canvasRatio)
    }

    /// Le ressort de la carte ; sous Reduce Motion, la scène se pose sans
    /// mouvement.
    static func reframeAnimation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(response: 0.36, dampingFraction: 0.86)
    }

    static func blurAnimation(reduceMotion: Bool) -> Animation {
        .easeInOut(duration: reduceMotion ? 0.12 : 0.25)
    }
}

private struct StoryCommentsReadingBlur: ViewModifier {
    let commentsOpen: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .blur(radius: StorySceneFocus.blurRadius(commentsOpen: commentsOpen))
            .animation(StorySceneFocus.blurAnimation(reduceMotion: reduceMotion), value: commentsOpen)
    }
}

extension View {

    /// Le flou de lecture des commentaires (#8642) — posé sur la carte telle
    /// qu'elle est rendue, coins compris.
    func storyCommentsReadingBlur(_ commentsOpen: Bool) -> some View {
        modifier(StoryCommentsReadingBlur(commentsOpen: commentsOpen))
    }
}
