import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ConversationMediaGalleryView.swift` (#16901), corps déplacé à l'identique : les actions du rail (Réagir, Répondre, Créer).
extension ConversationMediaGalleryView {
    @ViewBuilder
    func mediaActions(_ att: MessageAttachment) -> some View {
        // **« Réagir » est une ACTION, pas un ornement** : les réactions sur les
        // attachements en plein écran s'activent comme répondre ou composer, par
        // un bouton réagir (emoji +) qui affiche la traîne des emojis.
        //
        // Il rejoint donc CETTE rangée — même rang, même gabarit 40 pt, même
        // verre que Répondre et Composer — au lieu de poser sa rangée d'émojis
        // sur l'image en permanence.
        //
        // **La garde remonte d'un cran** : c'est l'EXISTENCE du bouton que la loi
        // décide, pas seulement celle de la rangée. Plus simple et plus sûr — une
        // pièce protégée n'a alors même pas d'entrée vers le geste, et il n'y a
        // plus qu'un endroit où la protection pourrait être oubliée.
        if AttachmentReactionOffer.offersReaction(surface: .fullscreen,
                                                  attachment: att,
                                                  hasHandler: onReactToMedia != nil && (reactableMedia?(att) ?? true)) {
            FullscreenActionButton.react(
                label: String(localized: "media.react.title",
                              defaultValue: "Réagir", bundle: .main),
                hint: String(localized: "media.react.hint",
                             defaultValue: "Affiche la rangée d'émojis pour réagir à ce média.",
                             bundle: .main),
                style: .disc(.adaptive),
                isOpen: reactionBarOpen
            ) {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    reactionBarOpen.toggle()
                }
            }
        }
        // **Un média PROTÉGÉ ne se cite pas** : la bannière de citation
        // porte la vignette du média, ce qui ferait sortir de la conversation
        // ce qu'une vue unique, un flou ou un chiffrement y retiennent. Le
        // prédicat est celui que le menu d'appui long lit déjà —
        // `ComposableAttachment.isProtected` — plutôt qu'une seconde écriture
        // des trois mêmes drapeaux.
        //
        // **La ROUTE décide, pas deux `if` côte à côte** : sans elle,
        // un hôte qui câble les deux rappels monterait la barre PENDANT que la
        // galerie se referme sous elle.
        let route = FullscreenReplyRoute.route(
            isProtected: ComposableAttachment.isProtected(att),
            hasInPlaceComposer: onSendReplyToMedia != nil && replyCitation != nil,
            // `replyableMedia` : un hôte de post ne relaie que ce qu'il
            // sait citer — jamais un média joint à un commentaire.
            hasThreadHandOff: onReplyToMedia != nil && (replyableMedia?(att) ?? true)
        )
        if route != .none {
            FullscreenActionButton.reply(
                label: String(localized: "media.reply.title",
                              defaultValue: "Répondre", bundle: .main),
                hint: route == .composeInPlace
                    ? String(localized: "media.reply.hint.inPlace",
                             defaultValue: "Ouvre la zone de saisie au-dessus de ce média, en le citant.",
                             bundle: .main)
                    : String(localized: "media.reply.hint",
                             defaultValue: "Cite le message qui porte ce média et revient au composer.",
                             bundle: .main),
                style: .disc(.adaptive)
            ) {
                HapticFeedback.light()
                switch route {
                case .composeInPlace:
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                        // **Les deux ouvertures ne partagent pas le bas de
                        // l'écran**. Elles vivent dans deux `@State`
                        // indépendants : rien dans le type ne les empêche
                        // d'être montées ensemble, et la traînée d'émojis
                        // flotterait alors au-dessus du champ de saisie. Le
                        // voile ne peut pas trancher cela — il ne fait que
                        // constater ce qui est monté ; c'est au geste qui ouvre
                        // la seconde de congédier la première.
                        reactionBarOpen = false
                        replyTarget = att
                    }
                case .handOffToThread:
                    onReplyToMedia?(att)
                case .none:
                    break
                }
            }
        }
        // `composableMedia` (#6709) : « Créer avec ce média » seulement sur une pièce qui a sa cible.
        if let onComposeWithMedia, composableMedia?(att) ?? true {
            FullscreenActionButton(
                systemImage: FullscreenChromeSymbol.compose,
                label: String(localized: "media.compose.title",
                              defaultValue: "Créer avec ce média", bundle: .main),
                hint: String(localized: "media.compose.hint",
                             defaultValue: "Ouvre le composer avec ce média posé.",
                             bundle: .main),
                style: .disc(.adaptive)
            ) {
                HapticFeedback.light()
                onComposeWithMedia(att)
            }
        }
    }
}
