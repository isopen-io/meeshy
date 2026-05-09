import Foundation
import MeeshySDK
import os

// MARK: - OutboxDispatcher

/// Real dispatcher that drives outbox rows directly to the network layer.
///
/// Each row is decoded from its `kind`-typed payload and sent via the
/// matching `MessageService` / `ReactionService` call. On success the
/// flusher deletes the row; on failure it schedules a backoff retry.
/// Retries therefore live entirely in the outbox table — no re-enqueueing
/// to the in-memory queues.
struct OutboxDispatcher: OutboxDispatching {

    private let logger = Logger(subsystem: "com.meeshy.ios", category: "outbox-dispatcher")

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func dispatch(_ record: OutboxRecord) async throws {
        switch record.kind {
        case .sendMessage:
            try await dispatchSendMessage(record)

        case .editMessage:
            try await dispatchEditMessage(record)

        case .deleteMessage:
            try await dispatchDeleteMessage(record)

        case .sendReaction:
            try await dispatchSendReaction(record)
        }
    }

    // MARK: - Send Message

    private func dispatchSendMessage(_ record: OutboxRecord) async throws {
        if record.id.hasPrefix("ofq_") {
            guard let item = try? decoder.decode(OfflineQueueItem.self, from: record.payload) else {
                // Corrupt payload — accept to let the flusher remove the row.
                logger.error("Corrupt OfflineQueueItem payload for record \(record.id, privacy: .public), dropping")
                return
            }
            let request = SendMessageRequest(
                content: item.content,
                replyToId: item.replyToId,
                forwardedFromId: item.forwardedFromId,
                forwardedFromConversationId: item.forwardedFromConversationId,
                attachmentIds: item.attachmentIds,
                clientMessageId: item.clientMessageId
            )
            let response = try await MessageService.shared.send(
                conversationId: item.conversationId, request: request
            )
            // Reconcile the optimistic clientMessageId in the message cache so
            // the incoming `message:new` socket event doesn't duplicate the row.
            await CacheCoordinator.shared.messages.mergeUpdate(for: item.conversationId) { cached in
                cached.filter { $0.id != item.clientMessageId }
            }
            OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
                clientMessageId: item.clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId
            ))

        } else if record.id.hasPrefix("mrq_") {
            guard let item = try? decoder.decode(RetryQueueItem.self, from: record.payload) else {
                logger.error("Corrupt RetryQueueItem payload for record \(record.id, privacy: .public), dropping")
                return
            }
            let request = SendMessageRequest(
                content: item.content,
                originalLanguage: item.originalLanguage,
                replyToId: item.replyToId,
                attachmentIds: item.attachmentIds,
                clientMessageId: item.clientMessageId
            )
            let response = try await MessageService.shared.send(
                conversationId: item.conversationId, request: request
            )
            await CacheCoordinator.shared.messages.mergeUpdate(for: item.conversationId) { cached in
                cached.filter { $0.id != item.clientMessageId }
            }
            MessageRetryQueue.shared.retrySucceeded.send(RetryQueueSuccess(
                clientMessageId: item.clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId
            ))
        }
        // Unknown namespace prefix — stale row, accept so the flusher removes it.
    }

    // MARK: - Edit Message

    private func dispatchEditMessage(_ record: OutboxRecord) async throws {
        guard let payload = try? decoder.decode(OfflineEditPayload.self, from: record.payload) else {
            logger.error("Corrupt OfflineEditPayload for record \(record.id, privacy: .public), dropping")
            return
        }
        _ = try await MessageService.shared.edit(
            messageId: payload.messageId,
            content: payload.content
        )
        logger.info("Edit dispatched for message \(payload.messageId, privacy: .public)")
    }

    // MARK: - Delete Message

    private func dispatchDeleteMessage(_ record: OutboxRecord) async throws {
        guard let payload = try? decoder.decode(OfflineDeletePayload.self, from: record.payload) else {
            logger.error("Corrupt OfflineDeletePayload for record \(record.id, privacy: .public), dropping")
            return
        }
        try await MessageService.shared.delete(
            conversationId: payload.conversationId,
            messageId: payload.messageId
        )
        logger.info("Delete dispatched for message \(payload.messageId, privacy: .public)")
    }

    // MARK: - Send Reaction

    private func dispatchSendReaction(_ record: OutboxRecord) async throws {
        guard let payload = try? decoder.decode(ReactionOutboxPayload.self, from: record.payload) else {
            logger.error("Corrupt ReactionOutboxPayload for record \(record.id, privacy: .public), dropping")
            return
        }
        switch payload.action {
        case .add:
            try await ReactionService.shared.add(
                messageId: payload.messageId,
                emoji: payload.emoji
            )
        case .remove:
            try await ReactionService.shared.remove(
                messageId: payload.messageId,
                emoji: payload.emoji
            )
        }
        logger.info("Reaction \(payload.action.rawValue, privacy: .public) \(payload.emoji, privacy: .public) dispatched for message \(payload.messageId, privacy: .public)")
    }
}
