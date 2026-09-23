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
                                onDismiss: handleGalleryDismiss) { startAttachment in
            ConversationMediaGalleryView(
                allAttachments: viewModel.allVisualAttachments,
                startAttachmentId: startAttachment.id,
                accentColor: accentColor,
                captionMap: viewModel.mediaCaptionMap,
                senderInfoMap: viewModel.mediaSenderInfoMap,
                onComposeWithMedia: armCompose,
                onReplyToMedia: replyToCarrier,
                onSendReplyToMedia: sendReplyToMedia,
                replyCitation: { viewModel.fullscreenReplyCitation(for: $0.id) },
                onReactToMedia: reactToMedia
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
    /// jointes. `ComposerSeedTarget.init?` applique la règle d'offre — vue
    /// unique, flouté, chiffré, lot — donc un média non composable n'arme rien,
    /// et le plein écran se referme simplement.
    private func armCompose(_ attachment: MessageAttachment) {
        let porteur = viewModel.messages.first { message in
            message.attachments.contains { $0.id == attachment.id }
        }
        composerState.pendingComposeTarget = porteur.flatMap(ComposerSeedTarget.init(message:))
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

    /// **Répondre à la pièce SANS quitter son plein écran** (#6165, directive
    /// porteur 2026-09-12).
    ///
    /// Ce chemin remplace `replyToCarrier` dès qu'il est câblé — la bascule vit
    /// dans `FullscreenReplyRoute`, côté galerie. Deux différences, et la
    /// seconde n'était pas possible avant #6164 :
    ///
    /// 1. **rien ne se referme.** `scrollState.galleryStartAttachment` n'est
    ///    PAS remis à `nil` : on parle de la pièce en la regardant. C'est
    ///    l'inverse exact de `replyToCarrier`, et c'est tout l'objet du lot ;
    /// 2. **la citation NOMME la pièce regardée.** `sendReplyToAttachment`
    ///    résout le porteur, applique la garde de protection et grave l'ancre
    ///    (`metadata.attachmentReplyTo`) — répondre à la troisième photo d'un
    ///    carrousel de cinq cite la troisième.
    ///
    /// Le composer du FIL n'est pas armé au passage : ce serait poser une
    /// citation que l'utilisateur n'a pas demandée sous une galerie qu'il n'a
    /// pas quittée, et qu'il retrouverait armée en sortant.
    private func sendReplyToMedia(_ attachment: MessageAttachment,
                                  _ text: String,
                                  _ language: String) {
        Task {
            await viewModel.sendReplyToAttachment(
                attachmentId: attachment.id, text: text, language: language
            )
        }
    }

    /// **Réagir au MÉDIA, c'est réagir à la PIÈCE — jamais à son porteur**
    /// (#6084, critère 2).
    ///
    /// Le chemin est celui que le fil emprunte déjà pour la réaction par-image
    /// (`onReactToAttachment` → `toggleAttachmentReaction`) : optimiste, écrit
    /// en base, poussé par `attachment:reaction-add`. La galerie RESTE ouverte —
    /// à la différence de `armCompose` et de `replyToCarrier`, qui partent
    /// ailleurs : on réagit à plusieurs pièces d'affilée en feuilletant, et
    /// refermer après chaque émoji ferait de la barre un aller-retour.
    ///
    /// Le porteur n'est résolu que pour son `messageId`, que le socket exige
    /// (`AttachmentReaction` est indexée sur le couple pièce + message). Il ne
    /// devient jamais la CIBLE : `toggleReaction(messageId:)` — la réaction du
    /// message — n'est pas appelée ici.
    private func reactToMedia(_ attachment: MessageAttachment, _ emoji: String) {
        guard let porteur = viewModel.messages.first(where: { message in
            message.attachments.contains { $0.id == attachment.id }
        }) else { return }
        viewModel.toggleAttachmentReaction(attachmentId: attachment.id,
                                           messageId: porteur.id,
                                           emoji: emoji)
    }

    /// La galerie est DÉMONTÉE : le meuble peut prendre sa place.
    private func promotePendingCompose() {
        guard let attendue = composerState.pendingComposeTarget else { return }
        composerState.pendingComposeTarget = nil
        composerState.composeMediaTarget = attendue
    }

    /// **C'est en SORTANT qu'on a vu** (#7499).
    ///
    /// Une vue unique s'ouvre au toucher et se consomme à la fermeture de son
    /// plein écran — jamais à l'ouverture, qui détruisait le contenu sans
    /// l'avoir montré. Ce site est le seul de la chaîne qui voie la SORTIE : la
    /// bulle sait qu'on ouvre, la galerie sait ce qu'on regarde, l'hôte seul
    /// sait quand le plein écran se referme.
    ///
    /// `takeAll()` vide dans le même geste : deux fermetures — un `onDismiss`
    /// rejoué, un retour suivi d'un passage en arrière-plan — ne consomment
    /// qu'une fois, et le serveur COMPTE les ouvertures.
    private func consumeOpenedViewOnce() {
        let ouvertes = scrollState.pendingViewOnceConsumption.takeAll()
        guard !ouvertes.isEmpty else { return }
        Task {
            for messageId in ouvertes {
                _ = await viewModel.consumeViewOnce(messageId: messageId)
            }
        }
    }

    /// Les deux gestes de la fermeture, dans l'ordre où ils comptent : on
    /// consomme ce qu'on vient de regarder, puis on promeut la composition
    /// différée. Les enchaîner dans UNE fermeture plutôt que d'en passer deux
    /// au `onDismiss` évite qu'un ajout futur en oublie une.
    private func handleGalleryDismiss() {
        consumeOpenedViewOnce()
        promotePendingCompose()
    }
}
