import Foundation
import MeeshySDK

// MARK: - OutboxDispatcher

/// Bridges the unified outbox table back to the legacy queue retry pipelines.
///
/// Items written to the outbox (either by direct enqueue or by MigrateLegacyQueues)
/// are dispatched here based on their `kind` and id namespace prefix.
///
/// During the transitional Phase 2, this dispatcher delegates to the existing
/// queues' send handlers. Phase 2.5+ will replace this with direct
/// MessageService calls and full retire of the JSON-file queues.
struct OutboxDispatcher: OutboxDispatching {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func dispatch(_ record: OutboxRecord) async throws {
        switch record.kind {
        case .sendMessage:
            if record.id.hasPrefix("ofq_") {
                if let item = try? decoder.decode(OfflineQueueItem.self, from: record.payload) {
                    await OfflineQueue.shared.enqueue(item)
                }
            } else if record.id.hasPrefix("mrq_") {
                if let item = try? decoder.decode(RetryQueueItem.self, from: record.payload) {
                    await MessageRetryQueue.shared.enqueue(item)
                }
            }
            // Unknown namespace prefix — stale item, accept dispatch (row will be deleted)

        case .sendReaction, .editMessage, .deleteMessage:
            // Phase 2.5+ will implement these kinds. Accept the dispatch so
            // the flusher deletes the row rather than retrying indefinitely.
            return
        }
    }
}
