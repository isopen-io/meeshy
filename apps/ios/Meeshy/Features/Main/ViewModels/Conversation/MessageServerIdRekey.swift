import Foundation
import MeeshySDK

/// Réécrit l'id des messages réconciliés (optimiste → serveur) avant de sauver le snapshot au cache, pour
/// qu'un démarrage à froid ne produise jamais de paire `temp_…` / id serveur. `Message.id` est un `let` :
/// la copie passe par l'init, champ par champ, À L'IDENTIQUE de ce que le cache a toujours reçu.
nonisolated enum MessageServerIdRekey {

    static func rewrite(_ messages: [Message], mapping: [String: String]) -> [Message] {
        messages.map { message in
            guard let serverId = mapping[message.id] else { return message }
            return Message(
                id: serverId,
                conversationId: message.conversationId,
                senderId: message.senderId,
                content: message.content,
                originalLanguage: message.originalLanguage,
                messageType: message.messageType,
                messageSource: message.messageSource,
                isEdited: message.isEdited,
                editedAt: message.editedAt,
                deletedAt: message.deletedAt,
                replyToId: message.replyToId,
                storyReplyToId: message.storyReplyToId,
                forwardedFromId: message.forwardedFromId,
                forwardedFromConversationId: message.forwardedFromConversationId,
                expiresAt: message.expiresAt,
                effects: message.effects,
                maxViewOnceCount: message.maxViewOnceCount,
                viewOnceCount: message.viewOnceCount,
                pinnedAt: message.pinnedAt,
                pinnedBy: message.pinnedBy,
                isEncrypted: message.isEncrypted,
                encryptionMode: message.encryptionMode,
                createdAt: message.createdAt,
                updatedAt: message.updatedAt,
                attachments: message.attachments,
                reactions: message.reactions,
                replyTo: message.replyTo,
                forwardedFrom: message.forwardedFrom,
                senderName: message.senderName,
                senderUsername: message.senderUsername,
                senderColor: message.senderColor,
                senderAvatarURL: message.senderAvatarURL,
                senderUserId: message.senderUserId,
                deliveryStatus: message.deliveryStatus,
                isMe: message.isMe,
                deliveredToAllAt: message.deliveredToAllAt,
                readByAllAt: message.readByAllAt,
                deliveredCount: message.deliveredCount,
                readCount: message.readCount
            )
        }
    }
}
