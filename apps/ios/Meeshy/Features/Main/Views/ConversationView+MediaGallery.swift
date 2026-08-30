import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le plein écran des médias de la conversation, et ce qu'on y déclenche

/// **Le montage du plein écran a quitté `ConversationView.body`** (#4014).
///
/// Deux raisons, et la première est mécanique : `ConversationView.swift` fait
/// plus de trois mille lignes et figure dans la dette héritée du cliquet de
/// taille — la directive du 2026-08-28 y interdit tout ajout. Câbler une action
/// de plus dans son corps était donc impossible avant d'en sortir quelque
/// chose. Ce modificateur emporte le cover ET son câblage : l'hôte y perd des
/// lignes au lieu d'en gagner.
///
/// La seconde est de fond : « ouvrir le composer depuis le plein écran » est
/// une SÉQUENCE de deux présentations, et une séquence a besoin d'un endroit
/// où se lire d'un seul tenant.
struct ConversationMediaGalleryLayer: ViewModifier {

    @ObservedObject var viewModel: ConversationViewModel
    /// `@Binding`, pas `@ObservedObject` : les deux états de l'hôte sont des
    /// STRUCTS tenues en `@State`. Les lier plutôt que les copier est ce qui
    /// fait que `armCompose` écrit bien chez l'hôte — une copie de valeur y
    /// aurait armé une cible que personne n'aurait promue.
    @Binding var scrollState: ConversationScrollState
    @Binding var composerState: ConversationComposerState
    let accentColor: String

    /// Le chemin de citation de l'hôte, passé en closure : `triggerReply` vit
    /// dans `ConversationView+MessageRow` et compose la `ReplyReference`
    /// complète — média représentatif, aperçu, avatar gravé. Le rappeler ici
    /// aurait été une SECONDE écriture de la citation, qui aurait divergé de la
    /// bannière du composer au premier ajustement de l'une.
    let onReply: (Message) -> Void

    func body(content: Content) -> some View {
        content.fullScreenCover(item: $scrollState.galleryStartAttachment,
                                onDismiss: promotePendingCompose) { startAttachment in
            ConversationMediaGalleryView(
                allAttachments: viewModel.allVisualAttachments,
                startAttachmentId: startAttachment.id,
                accentColor: accentColor,
                captionMap: viewModel.mediaCaptionMap,
                senderInfoMap: viewModel.mediaSenderInfoMap,
                onComposeWithMedia: armCompose,
                onReplyToMedia: replyToCarrier
            )
        }
    }

    /// **Armer, puis fermer** — jamais présenter tout de suite.
    ///
    /// Le meuble et la galerie sont deux `fullScreenCover` du même hôte : poser
    /// la cible pendant que la galerie est encore montée présenterait deux
    /// modaux à la fois, et SwiftUI n'en montre alors aucun. C'est exactement le
    /// motif que la feuille de transfert applique déjà quelques lignes plus haut
    /// dans `ConversationView` — `pendingComposeTarget` est SA case, réemployée
    /// ici plutôt que dupliquée : deux états pour une même attente auraient
    /// divergé au premier ajustement de l'un.
    ///
    /// Le porteur est résolu ICI parce que la galerie ne connaît que des pièces
    /// jointes. `ComposableMessageTarget.init?` applique la règle d'offre — vue
    /// unique, flouté, chiffré, lot — donc un média non composable n'arme rien,
    /// et le plein écran se referme simplement.
    private func armCompose(_ attachment: MessageAttachment) {
        let porteur = viewModel.messages.first { message in
            message.attachments.contains { $0.id == attachment.id }
        }
        composerState.pendingComposeTarget = porteur.flatMap(ComposableMessageTarget.init(message:))
        scrollState.galleryStartAttachment = nil
    }

    /// **Répondre au média, c'est répondre à son PORTEUR** (#4013).
    ///
    /// Le plein écran se referme et rend la main au composer, déjà armé de la
    /// citation. Rien n'est différé ici, contrairement à `armCompose` : la
    /// citation n'ouvre aucun second modal — elle pose une bannière dans un
    /// composer qui est déjà là, sous la galerie.
    private func replyToCarrier(_ attachment: MessageAttachment) {
        guard let porteur = viewModel.messages.first(where: { message in
            message.attachments.contains { $0.id == attachment.id }
        }) else { return }
        onReply(porteur)
        scrollState.galleryStartAttachment = nil
    }

    /// La galerie est DÉMONTÉE : le meuble peut prendre sa place.
    private func promotePendingCompose() {
        guard let attendue = composerState.pendingComposeTarget else { return }
        composerState.pendingComposeTarget = nil
        composerState.composeMediaTarget = attendue
    }
}
