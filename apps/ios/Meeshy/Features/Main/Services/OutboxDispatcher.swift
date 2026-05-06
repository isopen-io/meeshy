import Foundation
import MeeshySDK

// MARK: - OutboxDispatcher

/// Real dispatcher that drives outbox rows directly to the network layer.
///
/// Each `sendMessage` row is decoded from its payload and sent via
/// `MessageService`. On success the flusher deletes the row; on failure it
/// schedules a backoff retry. Retries therefore live entirely in the outbox
/// table — no re-enqueueing to the in-memory queues.
struct OutboxDispatcher: OutboxDispatching {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func dispatch(_ record: OutboxRecord) async throws {
        switch record.kind {
        case .sendMessage:
            try await dispatchSendMessage(record)

        case .sendReaction, .editMessage, .deleteMessage:
            // Not yet implemented. Accept the dispatch so the flusher
            // deletes the row rather than retrying indefinitely.
            return
        }
    }

    // MARK: - Private

    private func dispatchSendMessage(_ record: OutboxRecord) async throws {
        if record.id.hasPrefix("ofq_") {
            guard let item = try? decoder.decode(OfflineQueueItem.self, from: record.payload) else {
                // Corrupt payload — accept to let the flusher remove the row.
                return
            }
            let request = SendMessageRequest(
                content: item.content,
                replyToId: item.replyToId,
                forwardedFromId: item.forwardedFromId,
                forwardedFromConversationId: item.forwardedFromConversationId,
                attachmentIds: item.attachmentIds
            )
            let response = try await MessageService.shared.send(
                conversationId: item.conversationId, request: request
            )
            // Reconcile the optimistic tempId in the message cache so the
            // incoming `message:new` socket event doesn't duplicate the row.
            await CacheCoordinator.shared.messages.mergeUpdate(for: item.conversationId) { cached in
                cached.filter { $0.id != item.tempId }
            }
            OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
                tempId: item.tempId,
                serverId: response.id,
                conversationId: item.conversationId
            ))

        } else if record.id.hasPrefix("mrq_") {
            guard let item = try? decoder.decode(RetryQueueItem.self, from: record.payload) else {
                return
            }
            let request = SendMessageRequest(
                content: item.content,
                originalLanguage: item.originalLanguage,
                replyToId: item.replyToId,
                attachmentIds: item.attachmentIds
            )
            let response = try await MessageService.shared.send(
                conversationId: item.conversationId, request: request
            )
            await CacheCoordinator.shared.messages.mergeUpdate(for: item.conversationId) { cached in
                cached.filter { $0.id != item.tempId }
            }
            MessageRetryQueue.shared.retrySucceeded.send(RetryQueueSuccess(
                tempId: item.tempId,
                serverId: response.id,
                conversationId: item.conversationId
            ))

        }
        // Unknown namespace prefix — stale row, accept so the flusher removes it.
    }
}
