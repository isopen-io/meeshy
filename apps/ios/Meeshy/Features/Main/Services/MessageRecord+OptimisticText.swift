import Foundation
import MeeshySDK

extension MessageRecord {
    /// La langue d'une réponse rapide qui n'en déclare aucune.
    static let optimisticFallbackLanguage = "fr"

    /// La bulle d'une réponse écrite hors du fil vers une conversation chiffrée
    /// de bout en bout (#13067) : le clair est au coffre, la ligne ne porte que
    /// le littéral servi, et elle naît en échec avec sa raison — le fil la
    /// renvoie scellée.
    static func sealedFailedText(item: OfflineQueueItem, senderId: String, reason: String) -> MessageRecord {
        var record = optimisticText(item: item, senderId: senderId, replyToId: item.replyToId)
        record.content = E2EEWire.contentPlaceholder
        record.isEncrypted = true
        record.encryptionMode = E2EEWire.mode
        record.state = .failed
        record.lastError = reason
        return record
    }

    static func optimisticText(
        item: OfflineQueueItem,
        senderId: String,
        replyToId: String?
    ) -> MessageRecord {
        MessageRecord(
            localId: item.clientMessageId, serverId: nil,
            conversationId: item.conversationId, senderId: senderId,
            content: item.content,
            originalLanguage: item.originalLanguage ?? optimisticFallbackLanguage,
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sending, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: replyToId, storyReplyToId: item.storyReplyToId,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 0
        )
    }
}
