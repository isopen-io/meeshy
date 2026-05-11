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

        // Wave 1 Phase B — 5 of the 14 new mutation kinds are now wired
        // through to their REST endpoints with X-Client-Mutation-Id header
        // for gateway-side MutationLog dedup.
        case .blockUser:
            try await dispatchBlockUser(record)

        case .unblockUser:
            try await dispatchUnblockUser(record)

        case .sendFriendRequest:
            try await dispatchSendFriendRequest(record)

        case .respondFriendRequest:
            try await dispatchRespondFriendRequest(record)

        case .updateProfile:
            try await dispatchUpdateProfile(record)

        // Wave 1 Phase C — remaining kinds land in a later wave. Throw so
        // a stray insertion surfaces in CI instead of being swallowed.
        case .markAsRead, .createConversation, .updateConversation,
             .updateSettings, .publishStory, .repostStory, .createPost,
             .toggleLikePost, .createComment, .deleteComment,
             .toggleLikeComment:
            logger.error("OutboxDispatcher received \(record.kind.rawValue, privacy: .public) but Phase C handler is not wired yet (record \(record.id, privacy: .public))")
            throw NSError(
                domain: "OutboxDispatcher",
                code: 501,
                userInfo: [
                    NSLocalizedDescriptionKey: "Outbox kind '\(record.kind.rawValue)' not implemented yet (Wave 1 Phase C pending)"
                ]
            )
        }
    }

    // MARK: - Non-message mutation dispatch (Wave 1 Phase B)

    /// Decoded the typed payload from `record.payload`. Treats a decode
    /// failure as permanent so the flusher escalates to `.exhausted` after
    /// the next attempt instead of looping forever on a corrupt row.
    private func decodePayload<P: Decodable>(_ record: OutboxRecord, as type: P.Type) throws -> P {
        do {
            return try decoder.decode(P.self, from: record.payload)
        } catch {
            logger.error("Failed to decode \(String(describing: P.self), privacy: .public) for outbox \(record.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw NSError(
                domain: "OutboxDispatcher",
                code: 400,
                userInfo: [
                    NSLocalizedDescriptionKey: "Corrupt \(record.kind.rawValue) payload for \(record.id)"
                ]
            )
        }
    }

    /// 4xx responses from the gateway are NOT transient — replaying the
    /// same request will produce the same error. We rethrow as-is so the
    /// flusher escalates to `.exhausted` once `maxAttempts` is reached.
    /// 5xx and network errors are also rethrown but those are inherently
    /// transient and the flusher's exponential backoff will retry.
    private func dispatchBlockUser(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: BlockUserPayload.self)
        let _: APIResponse<BlockActionResponse> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/users/\(payload.targetUserId)/block",
            method: "POST",
            body: try JSONEncoder().encode([String: String]()),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("blockUser dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    private func dispatchUnblockUser(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UnblockUserPayload.self)
        let _: APIResponse<[String: Bool]> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/users/\(payload.targetUserId)/block",
            method: "DELETE",
            body: nil,
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("unblockUser dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// POST /friend-requests — gateway expects `{ receiverId, message? }`.
    /// The iOS payload uses `targetUserId` to match the consumer-facing
    /// naming ; we translate at the wire boundary.
    private func dispatchSendFriendRequest(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: SendFriendRequestPayload.self)
        struct SendFriendRequestBody: Encodable {
            let receiverId: String
        }
        let body = SendFriendRequestBody(receiverId: payload.targetUserId)
        let _: APIResponse<FriendRequest> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/friend-requests",
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("sendFriendRequest dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// PATCH /friend-requests/:id — gateway expects `{ status: "accepted"|"rejected" }`.
    /// Translate `accept|reject` → `accepted|rejected`.
    private func dispatchRespondFriendRequest(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: RespondFriendRequestPayload.self)
        struct RespondBody: Encodable {
            let status: String
        }
        let status = payload.action == .accept ? "accepted" : "rejected"
        let body = RespondBody(status: status)
        let _: APIResponse<FriendRequest> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/friend-requests/\(payload.friendRequestId)",
            method: "PATCH",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("respondFriendRequest dispatched for \(payload.friendRequestId, privacy: .public) status=\(status, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// PATCH /users/me — only sends fields that are non-nil. The gateway
    /// schema accepts displayName, bio, avatarUrl among others ; we
    /// forward exactly what the payload carries.
    private func dispatchUpdateProfile(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UpdateProfilePayload.self)
        struct UpdateProfileBody: Encodable {
            let displayName: String?
            let bio: String?
            let avatar: String?

            enum CodingKeys: String, CodingKey { case displayName, bio, avatar }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                if let displayName { try container.encode(displayName, forKey: .displayName) }
                if let bio { try container.encode(bio, forKey: .bio) }
                if let avatar { try container.encode(avatar, forKey: .avatar) }
            }
        }
        let body = UpdateProfileBody(
            displayName: payload.displayName,
            bio: payload.bio,
            avatar: payload.avatarUrl
        )
        // The /users/me response wraps the updated user under `data.user`,
        // which doesn't match `APIResponse<MeeshyUser>`. We don't need the
        // result (caller refreshes via AuthManager.checkExistingSession()
        // after enqueue), so decode the envelope shape loosely as a dictionary.
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/users/me",
            method: "PATCH",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("updateProfile dispatched cmid=\(payload.clientMutationId, privacy: .public)")
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
