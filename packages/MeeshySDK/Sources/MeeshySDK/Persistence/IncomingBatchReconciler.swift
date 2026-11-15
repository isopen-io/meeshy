import Foundation
import GRDB

/// Réconciliation d'un lot `IncomingMessageData` avec la table `messages`.
/// Règle pure de base : ne lit que ses entrées et la transaction qu'on lui remet.
enum IncomingBatchReconciler {
    /// Returns the conversations where a row was actually written, so the
    /// worker only posts refreshes for real changes — a re-delivered payload
    /// that matches the stored row must not dirty it (`changeVersion` bump)
    /// nor trigger the MessageStore → applySnapshot reconfigure cascade.
    static func reconcile(_ messages: [MessagePersistenceActor.IncomingMessageData], in db: Database) throws -> Set<String> {
        var changedConvIds: Set<String> = []
        for msg in messages {
            let existingLocalId = try PendingIdRecord
                .filter(Column("serverId") == msg.id)
                .fetchOne(db)?.localId

            if let localId = existingLocalId,
               var existing = try MessageRecord.fetchOne(db, key: localId) {
                let newState = max(existing.state, msg.computedState)
                // Le littéral servi d'un message chiffré ne remplace jamais le
                // texte de la ligne : le clair de l'expéditeur, ou le littéral (#12916).
                let rewritesContent = !msg.isEncrypted && existing.content != msg.content
                guard newState != existing.state || rewritesContent else {
                    continue
                }
                existing.state = newState
                if rewritesContent { existing.content = msg.content }
                existing.updatedAt = Date()
                existing.changeVersion += 1
                try existing.update(db)
                changedConvIds.insert(msg.conversationId)
            } else {
                let record = MessageRecord(
                    localId: msg.id, serverId: msg.id,
                    conversationId: msg.conversationId,
                    senderId: msg.senderId,
                    content: msg.persistedContent,
                    originalLanguage: "fr", messageType: msg.messageType,
                    messageSource: msg.messageSource, contentType: "text",
                    state: msg.computedState, retryCount: 0, lastError: nil,
                    isEncrypted: msg.isEncrypted, encryptionMode: msg.encryptionMode, encryptedPayload: nil,
                    replyToId: nil, storyReplyToId: nil,
                    forwardedFromId: nil, forwardedFromConversationId: nil,
                    replyToJson: nil, forwardedFromJson: nil,
                    expiresAt: msg.expiresAt, effectFlags: msg.effectFlags,
                    maxViewOnceCount: nil, viewOnceCount: 0,
                    isEdited: false, editedAt: nil, deletedAt: nil,
                    pinnedAt: nil, pinnedBy: nil,
                    senderName: nil, senderUsername: nil,
                    senderColor: nil, senderAvatarURL: nil,
                    deliveredCount: 0, readCount: 0,
                    deliveredToAllAt: nil, readByAllAt: nil,
                    createdAt: msg.createdAt, sentAt: nil,
                    deliveredAt: nil, readAt: nil, updatedAt: Date(),
                    attachmentsJson: nil, reactionsJson: nil,
                    reactionCount: 0, currentUserReactionsJson: nil,
                    mentionedUsersJson: nil,
                    cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                    cachedLastLineWidth: nil, cachedLineCount: nil,
                    cachedTimestampInline: nil,
                    layoutVersion: 0, layoutMaxWidth: nil,
                    cachedTimeString: MessageRecord.computeTimeString(for: msg.createdAt),
                    changeVersion: 0,
                    ephemeralDuration: msg.ephemeralDuration
                )
                try record.insert(db)
                changedConvIds.insert(msg.conversationId)
            }
        }
        return changedConvIds
    }
}
