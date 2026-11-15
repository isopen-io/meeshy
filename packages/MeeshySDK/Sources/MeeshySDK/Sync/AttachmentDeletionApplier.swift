import Combine
import Foundation

/// `attachment:deleted` — la pièce quitte le message partout où l'appareil la garde : cache des messages, index des
/// médias, base du compte (par `realtimeMessagePersistor`, qui vérifie l'appartenance du message à la conversation
/// annoncée) et aperçu de la liste. Idempotent : un rejeu ne trouve plus la pièce et n'écrit rien.
///
/// Un type à part, pas une extension du moteur : le moteur est déjà bien au-delà du budget de cohésion.
struct AttachmentDeletionApplier {
    private let engine: ConversationSyncEngine

    init?(engine: ConversationSyncEngine?) {
        guard let engine else { return nil }
        self.engine = engine
    }

    func apply(_ event: AttachmentDeletedEvent) async {
        let removedAt = Date()
        let cache = engine.cache
        let cached = await cache.messages.load(for: event.conversationId).snapshot()?
            .first(where: { $0.id == event.messageId })
        let attachmentId = event.attachmentId
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            guard msg.attachments.contains(where: { $0.id == attachmentId }) else { return }
            msg.attachments.removeAll { $0.id == attachmentId }
            guard AttachmentRemoval.leavesNothing(
                text: msg.content, isEncrypted: msg.isEncrypted, remaining: msg.attachments.count
            ) else { return }
            msg.deletedAt = removedAt
            msg.content = ""
        }
        await cache.dropAttachmentFromConversationMedia(
            conversationId: event.conversationId, messageId: event.messageId, attachmentId: attachmentId)
        await engine.realtimeMessagePersistor?(.attachmentRemoved(
            messageId: event.messageId, conversationId: event.conversationId, attachmentId: attachmentId, at: removedAt))
        engine._messagesDidChange.send(event.conversationId)
        await refreshLastMessagePreview(event, fallbackAttachments: cached?.attachments ?? [])
    }

    private func refreshLastMessagePreview(
        _ event: AttachmentDeletedEvent, fallbackAttachments: [MeeshyMessageAttachment]
    ) async {
        let cache = engine.cache
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        let attachmentId = event.attachmentId, messageId = event.messageId, conversationId = event.conversationId
        switch ConversationListLastMessage.removingAttachment(
            attachmentId, ofMessage: messageId, conversationId: conversationId,
            fallbackAttachments: fallbackAttachments, in: list
        ) {
        case .unchanged:
            return
        case .emptied:
            await engine.recomputeLastMessagePreviewAfterDeletion(
                conversationId: conversationId, deletedMessageId: messageId)
        case .updated:
            await cache.conversations.update(for: "list") { conversations in
                guard case let .updated(next) = ConversationListLastMessage.removingAttachment(
                    attachmentId, ofMessage: messageId, conversationId: conversationId,
                    fallbackAttachments: fallbackAttachments, in: conversations
                ) else { return conversations }
                return next
            }
            engine._conversationsDidChange.send()
        }
    }
}
