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

        // Wave 1 Task 3.2 — 14 new OutboxKind cases were added for the
        // upcoming non-message mutation outbox. Their dispatch handlers
        // land in Tier B (gateway wiring) ; until then, no caller should
        // be inserting these rows through paths that reach this dispatcher.
        // Throw rather than silently no-op so a stray insertion surfaces
        // immediately in CI rather than being swallowed.
        case .markAsRead, .sendFriendRequest, .respondFriendRequest,
             .blockUser, .unblockUser, .createConversation,
             .updateConversation, .updateProfile, .updateSettings,
             .publishStory, .repostStory, .createPost,
             .toggleLikePost, .createComment, .deleteComment,
             .toggleLikeComment:
            logger.error("OutboxDispatcher received \(record.kind.rawValue, privacy: .public) but Tier B handler is not wired yet (record \(record.id, privacy: .public))")
            throw NSError(
                domain: "OutboxDispatcher",
                code: 501,
                userInfo: [
                    NSLocalizedDescriptionKey: "Outbox kind '\(record.kind.rawValue)' not implemented yet (Wave 1 Tier B pending)"
                ]
            )
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

            // Phase 4 §6.3 audio offline write-ahead replay path. If the item
            // carries a `localAudioPath`, the audio bytes were preserved at
            // enqueue time under `Documents/pending-audio/<cid>.m4a`. The
            // dispatcher uploads them via TUS first (REST does NOT trigger
            // the gateway audio pipeline — only `message:send-with-attachments`
            // over the socket does), then sends through `sendWithAttachmentsAsync`
            // so the gateway runs Whisper transcription + NLLB translation +
            // Chatterbox TTS like an online send. The local file is deleted
            // after the ACK lands.
            if let localAudioPath = item.localAudioPath, !localAudioPath.isEmpty {
                let absolutePath = OfflineQueue.absoluteAudioPath(forStored: localAudioPath)
                guard FileManager.default.fileExists(atPath: absolutePath) else {
                    logger.error("Audio file missing on dispatch for record \(record.id, privacy: .public), path=\(localAudioPath, privacy: .public)")
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 404,
                        userInfo: [NSLocalizedDescriptionKey: "Audio file missing for offline send: \(localAudioPath)"]
                    )
                }

                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = APIClient.shared.authToken else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 401,
                        userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload audio"]
                    )
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                let audioFileURL = URL(fileURLWithPath: absolutePath)
                let tusResult = try await uploader.uploadFile(
                    fileURL: audioFileURL,
                    mimeType: "audio/mp4",
                    token: token
                )

                let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
                    conversationId: item.conversationId,
                    content: item.content.isEmpty ? nil : item.content,
                    attachmentIds: [tusResult.id],
                    replyToId: item.replyToId,
                    storyReplyToId: nil,
                    originalLanguage: item.originalLanguage,
                    clientMessageId: item.clientMessageId
                )
                guard let ack else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 502,
                        userInfo: [NSLocalizedDescriptionKey: "Socket ACK missing for offline audio dispatch"]
                    )
                }

                // Best-effort cleanup of the persisted audio. Failure here is
                // benign — the file is harmless extra bytes and a future
                // `OfflineQueue.cleanupOrphanFiles()` sweep will reclaim it.
                try? FileManager.default.removeItem(atPath: absolutePath)

                await CacheCoordinator.shared.messages.mergeUpdate(for: item.conversationId) { cached in
                    cached.filter { $0.id != item.clientMessageId }
                }
                OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
                    clientMessageId: item.clientMessageId,
                    serverId: ack.messageId,
                    conversationId: item.conversationId
                ))
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
