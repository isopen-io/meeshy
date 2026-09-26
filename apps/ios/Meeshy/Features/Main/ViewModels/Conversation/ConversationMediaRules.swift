import Foundation
import MeeshySDK

// MARK: - Ce qui entre dans la galerie d'une conversation, et ce qu'on en dit (#8095)
//
// Des fonctions PURES, partagées par les deux sources de la galerie : la
// fenêtre de messages du `ConversationViewModel` (ses projections
// `mediaCaptionMap` / `mediaSenderInfoMap`) et l'INDEX persisté des porteurs de
// médias (`ConversationMediaCatalog`). Une seule règle de légende, une seule
// fiche d'auteur, une seule règle d'admission : deux copies auraient divergé au
// premier ajustement de l'une, et la même photo se serait présentée
// différemment selon qu'elle était chargée ou non.

enum ConversationMediaRules {

    /// Les natures qu'on feuillette en plein écran. L'audio a sa propre galerie.
    static func isVisual(_ attachment: MessageAttachment) -> Bool {
        attachment.type == .image || attachment.type == .video
    }

    /// **Un porteur a-t-il sa place dans le défilement ?**
    ///
    /// - la vue unique n'y entre JAMAIS (#7618) : défense en profondeur, même
    ///   quand le serveur l'exclut déjà de `view=media` ;
    /// - un message supprimé ou échu n'y entre plus — l'index persisté peut
    ///   en garder une copie que la fenêtre a déjà retirée ;
    /// - un message masqué « pour moi » non plus.
    static func admits(_ message: MeeshyMessage, now: Date, isHidden: (String) -> Bool) -> Bool {
        guard message.deletedAt == nil, !message.holdsViewOnce, !isHidden(message.id) else { return false }
        if let expiresAt = message.expiresAt, expiresAt <= now { return false }
        return message.attachments.contains(where: isVisual)
    }

    /// La fiche d'auteur d'une pièce — la même pour un message chargé ou indexé.
    static func senderInfo(of message: MeeshyMessage) -> ConversationViewModel.MediaSenderInfo {
        ConversationViewModel.MediaSenderInfo(
            senderName: message.senderName ?? "?",
            senderAvatarURL: message.senderAvatarURL,
            senderColor: message.senderColor ?? "#999",
            sentAt: message.createdAt,
            isMe: message.isMe
        )
    }

    /// **Les légendes des pièces d'un message.**
    ///
    /// La légende propre de la pièce gagne ; à défaut, un visuel SEUL hérite du
    /// texte du message — `servedText`, c'est-à-dire le texte que le Prisme
    /// sert au lecteur (traduction préférée, sinon l'original). Le résoudre est
    /// l'affaire de l'appelant : la fenêtre a ses bascules manuelles, l'index sa
    /// descente depuis les traductions de la page.
    static func captions(of message: MeeshyMessage, servedText: @autoclosure () -> String) -> [String: String] {
        let visuals = message.attachments.filter(isVisual)
        return visuals.reduce(into: [String: String]()) { map, attachment in
            if let caption = attachment.caption, !caption.isEmpty {
                map[attachment.id] = caption
            } else if visuals.count == 1, !message.content.isEmpty {
                let served = servedText()
                if !served.isEmpty { map[attachment.id] = served }
            }
        }
    }
}
