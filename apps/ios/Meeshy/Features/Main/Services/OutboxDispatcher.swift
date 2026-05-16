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

        // Wave 1 Phase C — 9 of the 11 remaining kinds are now wired.
        // `publishStory` / `repostStory` stay in the existing
        // `StoryOfflineQueue` pipeline for now (Tier C queue merge will
        // unify them later) and surface here as a permanent failure so a
        // stray row doesn't loop in the flusher.
        case .markAsRead:
            try await dispatchMarkAsRead(record)

        case .createConversation:
            try await dispatchCreateConversation(record)

        case .updateConversation:
            try await dispatchUpdateConversation(record)

        case .updateSettings:
            try await dispatchUpdateSettings(record)

        case .createPost:
            try await dispatchCreatePost(record)

        case .toggleLikePost:
            try await dispatchToggleLikePost(record)

        case .createComment:
            try await dispatchCreateComment(record)

        case .deleteComment:
            try await dispatchDeleteComment(record)

        case .toggleLikeComment:
            try await dispatchToggleLikeComment(record)

        case .publishStory, .repostStory:
            // Story publish/repost remains routed through `StoryOfflineQueue`
            // until Tier C merges the two persistence stores. A row landing
            // here is a programming error — surface it loudly instead of
            // silently retrying forever.
            logger.error("OutboxDispatcher received \(record.kind.rawValue, privacy: .public) but story publish lives in StoryOfflineQueue (record \(record.id, privacy: .public))")
            throw NSError(
                domain: "OutboxDispatcher",
                code: 501,
                userInfo: [
                    NSLocalizedDescriptionKey: "Outbox kind '\(record.kind.rawValue)' is handled by StoryOfflineQueue, not OutboxDispatcher"
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

    // MARK: - Non-message mutation dispatch (Wave 1 Phase C)

    /// `POST /conversations/:id/mark-read` — the gateway treats read
    /// receipts as monotonic + idempotent at the storage layer (a higher
    /// cursor wins, a lower one is a no-op), so the route does NOT wrap
    /// through `MutationLog`. We still dispatch via the outbox so an
    /// offline mark survives an app kill ; we just don't forward the
    /// `X-Client-Mutation-Id` header (no server-side dedup to feed).
    /// A 404 means the conversation was deleted while the row was pending
    /// — swallow as success so the flusher removes the row.
    private func dispatchMarkAsRead(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: MarkAsReadPayload.self)
        do {
            let _: APIResponse<[String: Int]> = try await APIClient.shared.request(
                endpoint: "/conversations/\(payload.conversationId)/mark-read",
                method: "POST",
                body: nil,
                queryItems: nil
            )
            logger.info("markAsRead dispatched for conversation \(payload.conversationId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("markAsRead 404 for conversation \(payload.conversationId, privacy: .public) — conversation gone, accepting as success")
        }
    }

    /// `POST /conversations` — the gateway accepts the canonical
    /// `{ type, title?, participantIds }` shape. The route does not yet
    /// wrap through `MutationLog`, so the cmid is sent on a best-effort
    /// basis (gateway middleware records it but `withMutationLog` is not
    /// yet invoked) — a future gateway upgrade picks the dedup up for
    /// free without an iOS-side change.
    private func dispatchCreateConversation(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: CreateConversationPayload.self)
        struct CreateConversationBody: Encodable {
            let type: String
            let title: String?
            let participantIds: [String]
        }
        let body = CreateConversationBody(
            type: payload.type,
            title: payload.title,
            participantIds: payload.participantIds
        )
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/conversations",
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("createConversation dispatched cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `PUT /conversations/:id` — the gateway accepts a partial update
    /// shape ; we forward only the fields the payload carries non-nil.
    /// A 404 means the conversation was deleted while the row was
    /// pending — swallow as success so the flusher removes the row.
    private func dispatchUpdateConversation(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UpdateConversationPayload.self)
        struct UpdateConversationBody: Encodable {
            let title: String?
            let description: String?
            let avatar: String?

            enum CodingKeys: String, CodingKey { case title, description, avatar }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                if let title { try container.encode(title, forKey: .title) }
                if let description { try container.encode(description, forKey: .description) }
                if let avatar { try container.encode(avatar, forKey: .avatar) }
            }
        }
        let body = UpdateConversationBody(
            title: payload.title,
            description: payload.description,
            avatar: payload.avatarUrl
        )
        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                endpoint: "/conversations/\(payload.conversationId)",
                method: "PUT",
                body: try JSONEncoder().encode(body),
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("updateConversation dispatched for \(payload.conversationId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("updateConversation 404 for \(payload.conversationId, privacy: .public) — conversation gone, accepting as success")
        }
    }

    /// `PATCH /me/preferences/:category` — the gateway path is
    /// category-typed (`privacy`, `audio`, …) and dedupes via
    /// `kind = updateSettings:${category}`. The opaque `body` blob is
    /// the JSON-encoded category-specific preferences struct produced
    /// by the caller at enqueue time.
    private func dispatchUpdateSettings(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UpdateSettingsPayload.self)
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/me/preferences/\(payload.category)",
            method: "PATCH",
            body: payload.body,
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("updateSettings dispatched for category \(payload.category, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `POST /posts` — gateway wraps through `withMutationLog`. Body
    /// shape matches `CreatePostSchema` ; `attachmentIds` becomes
    /// `mediaIds` at the wire boundary to match the gateway field name.
    private func dispatchCreatePost(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: CreatePostPayload.self)
        struct CreatePostBody: Encodable {
            let content: String?
            let mediaIds: [String]?
            let visibility: String

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                if let content, !content.isEmpty { try container.encode(content, forKey: .content) }
                if let mediaIds, !mediaIds.isEmpty { try container.encode(mediaIds, forKey: .mediaIds) }
                try container.encode(visibility, forKey: .visibility)
            }

            enum CodingKeys: String, CodingKey {
                case content, mediaIds, visibility
            }
        }
        let body = CreatePostBody(
            content: payload.content,
            mediaIds: payload.attachmentIds.isEmpty ? nil : payload.attachmentIds,
            visibility: payload.visibility
        )
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/posts",
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("createPost dispatched cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `POST|DELETE /posts/:id/like` — gateway wraps through
    /// `withMutationLog`. Both directions are naturally idempotent at
    /// the storage layer, so a 404 ("post gone") is treated as success.
    private func dispatchToggleLikePost(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ToggleLikePostPayload.self)
        let method = payload.liked ? "POST" : "DELETE"
        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                endpoint: "/posts/\(payload.postId)/like",
                method: method,
                body: nil,
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("toggleLikePost \(payload.liked, privacy: .public) dispatched for \(payload.postId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("toggleLikePost 404 for \(payload.postId, privacy: .public) — post gone, accepting as success")
        }
    }

    /// `POST /posts/:id/comments` — gateway wraps through
    /// `withMutationLog`. Body matches `CreateCommentSchema` :
    /// `{ content, parentId? }`.
    private func dispatchCreateComment(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: CreateCommentPayload.self)
        struct CreateCommentBody: Encodable {
            let content: String
            let parentId: String?

            enum CodingKeys: String, CodingKey { case content, parentId }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encode(content, forKey: .content)
                if let parentId { try container.encode(parentId, forKey: .parentId) }
            }
        }
        let body = CreateCommentBody(
            content: payload.content,
            parentId: payload.parentCommentId
        )
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/posts/\(payload.postId)/comments",
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("createComment dispatched on \(payload.postId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `DELETE /posts/:postId/comments/:commentId` — gateway wraps
    /// through `withMutationLog`. The route needs `postId` so the
    /// payload carries it ; without it we'd have to look up the comment
    /// owner which defeats the offline-first invariant.
    /// 404 = comment gone (raced with another delete), accept as success.
    private func dispatchDeleteComment(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: DeleteCommentPayload.self)
        // `DeleteCommentPayload` only carries `commentId`. The gateway
        // route is `/posts/:postId/comments/:commentId`. We persist the
        // `postId` in `OutboxRecord.conversationId` at enqueue time so
        // the dispatcher can recover it here without re-introducing it
        // in the payload schema (which is shared with the gateway
        // `MutationLog` dedup key).
        let postId = record.conversationId
        guard postId != OfflineQueue.globalConversationSentinel else {
            logger.error("deleteComment record \(record.id, privacy: .public) missing postId in conversationId field — dropping")
            return
        }
        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                endpoint: "/posts/\(postId)/comments/\(payload.commentId)",
                method: "DELETE",
                body: nil,
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("deleteComment dispatched for \(payload.commentId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("deleteComment 404 for \(payload.commentId, privacy: .public) — comment gone, accepting as success")
        }
    }

    /// `POST|DELETE /posts/:postId/comments/:commentId/like` — like and
    /// unlike are naturally idempotent at the storage layer ; the route
    /// does NOT currently wrap through `MutationLog` (only the post-level
    /// like/unlike does), but we still send the cmid header so a future
    /// gateway upgrade picks it up for free.
    /// 404 = comment gone, accept as success.
    private func dispatchToggleLikeComment(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ToggleLikeCommentPayload.self)
        let postId = record.conversationId
        guard postId != OfflineQueue.globalConversationSentinel else {
            logger.error("toggleLikeComment record \(record.id, privacy: .public) missing postId in conversationId field — dropping")
            return
        }
        let method = payload.liked ? "POST" : "DELETE"
        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                endpoint: "/posts/\(postId)/comments/\(payload.commentId)/like",
                method: method,
                body: nil,
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("toggleLikeComment \(payload.liked, privacy: .public) dispatched for \(payload.commentId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("toggleLikeComment 404 for \(payload.commentId, privacy: .public) — comment gone, accepting as success")
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
            // Wave 1 Task 3.6 — `MessageRetryQueue` was removed but legacy
            // `mrq_*` rows may still live on user devices that upgraded mid-
            // queue. The payload format (`RetryQueueItem`) was a strict
            // superset of the fields we care about for replay (content,
            // originalLanguage, replyToId, attachmentIds, clientMessageId) ;
            // we hand-roll a minimal struct here so we don't need to keep
            // the deleted public types around just for legacy decoding.
            //
            // Decoded rows are sent through the SAME unified
            // `OfflineQueue.shared.retrySucceeded` signal as `ofq_*` rows so
            // ConversationViewModel reconciles via a single subscription.
            struct LegacyMrqPayload: Decodable {
                let conversationId: String
                let content: String
                let originalLanguage: String?
                let replyToId: String?
                let attachmentIds: [String]?
                let clientMessageId: String?
            }
            guard let item = try? decoder.decode(LegacyMrqPayload.self, from: record.payload),
                  let clientMessageId = item.clientMessageId else {
                logger.error("Corrupt legacy mrq_* payload for record \(record.id, privacy: .public), dropping")
                return
            }
            let request = SendMessageRequest(
                content: item.content,
                originalLanguage: item.originalLanguage ?? "fr",
                replyToId: item.replyToId,
                attachmentIds: item.attachmentIds,
                clientMessageId: clientMessageId
            )
            let response = try await MessageService.shared.send(
                conversationId: item.conversationId, request: request
            )
            await CacheCoordinator.shared.messages.mergeUpdate(for: item.conversationId) { cached in
                cached.filter { $0.id != clientMessageId }
            }
            OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
                clientMessageId: clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId,
                kind: .sendMessage
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
        do {
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
            // Wave 1 Task 3.6 — emit unified success. We don't have a
            // server-assigned id for reactions (the gateway broadcasts
            // `reaction:added` / `reaction:removed` over the socket which
            // the rest of the app already consumes), but the call still
            // carries enough context for any pending-indicator UI to clear
            // its hint. `serverId` is set to the reaction `clientMessageId`
            // as a stable placeholder so subscribers reading it never see
            // an empty string.
            OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
                clientMessageId: payload.clientMessageId,
                serverId: payload.clientMessageId,
                conversationId: payload.conversationId,
                kind: .sendReaction,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: payload.messageId,
                    emoji: payload.emoji,
                    action: payload.action
                )
            ))
        } catch APIError.serverError(let code, _) where code == 404 || code == 409 || code == 410 {
            // Permanent rejection — 404/410 (message gone) and 409 (state
            // conflict: already reacted / already removed). Replaying the
            // same request would bounce forever, so we treat the row as
            // exhausted right now, emit the unified signal so the optimistic
            // UI rolls back, and return success so the flusher deletes the
            // row instead of retrying.
            logger.warning("Reaction \(payload.action.rawValue, privacy: .public) \(payload.emoji, privacy: .public) on \(payload.messageId, privacy: .public) rejected (\(code, privacy: .public)) — dropping")
            OfflineQueue.shared.retryExhausted.send(OfflineRetryExhausted(
                kind: .sendReaction,
                clientMessageId: payload.clientMessageId,
                conversationId: payload.conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: payload.messageId,
                    emoji: payload.emoji,
                    action: payload.action
                ),
                lastError: "HTTP \(code)"
            ))
            // Returning normally drains the row. The flusher.deleteOne path
            // is the same as for a true success — gateway dedup means the
            // server-side outcome is already terminal regardless.
        }
    }
}

// MARK: - On-demand outbox drain

/// Triggers an immediate outbox drain. `OutboxFlusher.flush()` otherwise
/// only runs at app boot (`MeeshyApp`) and on background→foreground
/// transitions (`BackgroundTransitionCoordinator`) — so an optimistic
/// mutation enqueued mid-session (a reaction in particular, which has no
/// other send path) would sit `pending` in the outbox until one of those
/// events and never reach the server. Call this right after enqueueing so
/// the change leaves the device immediately.
@MainActor
enum OutboxFlushTrigger {
    static func flushNow() async {
        let flusher = OutboxFlusher(
            pool: DependencyContainer.shared.dbPool,
            dispatcher: OutboxDispatcher(),
            onOutcome: { @Sendable outcome in
                Task { await OfflineQueue.shared.publishOutcome(outcome) }
            }
        )
        await flusher.flush()
    }
}
