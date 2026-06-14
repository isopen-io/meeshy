import Foundation
import Combine
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
            // Decode the envelope loosely as a dictionary (same pattern as
            // `dispatchUpdateProfile` / `dispatchCreateConversation` above).
            // The mark-read response `data` carries a string `message` field,
            // so the previous `[String: Int]` decode threw a DecodingError on
            // an otherwise-successful 2xx — the read receipt looked like a
            // failure and was retried until exhausted for nothing.
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.request(
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

        // U1b — an OFFLINE media post carries local file paths; upload them via
        // TUS on reconnect, then create the post with the resulting ids. Faithful
        // twin of the message media replay (dispatchSendMessage). The within-
        // session TUS checkpoint resume fires automatically on re-upload (same
        // sha256 key), so a kill mid-upload resumes from the saved offset.
        var resolvedMediaIds = payload.attachmentIds
        var uploadedLocalPaths: [String] = []
        if let pendingMediaPaths = payload.localMediaPaths, !pendingMediaPaths.isEmpty {
            let serverOrigin = MeeshyConfig.shared.serverOrigin
            guard let baseURL = URL(string: serverOrigin),
                  let token = APIClient.shared.authToken else {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 401,
                    userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload post media"]
                )
            }
            let uploader = TusUploadManager(baseURL: baseURL)
            var uploadedIds: [String] = []
            for stored in pendingMediaPaths {
                let absolutePath = OfflineQueue.absoluteMediaPath(forStored: stored)
                guard FileManager.default.fileExists(atPath: absolutePath) else {
                    logger.error("Post media file missing on dispatch, path=\(stored, privacy: .public)")
                    continue
                }
                do {
                    let mime = MimeTypeResolver.mimeType(
                        forExtension: URL(fileURLWithPath: absolutePath).pathExtension)
                    let tusResult = try await uploader.uploadFile(
                        fileURL: URL(fileURLWithPath: absolutePath),
                        mimeType: mime,
                        token: token
                    )
                    uploadedIds.append(tusResult.id)
                    uploadedLocalPaths.append(absolutePath)
                } catch {
                    logger.error("Post media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                }
            }
            guard !uploadedIds.isEmpty else {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 503,
                    userInfo: [NSLocalizedDescriptionKey: "No media uploaded for offline post media dispatch"]
                )
            }
            resolvedMediaIds = uploadedIds + payload.attachmentIds
        }

        struct CreatePostBody: Encodable {
            let content: String?
            let mediaIds: [String]?
            let visibility: String
            let originalLanguage: String?
            /// Post type forwarded to `CreatePostSchema`. Omitted when nil so the
            /// gateway applies its `POST` default — keeps legacy rows (written
            /// before reel-offline carried no `type`) replaying as plain posts.
            let type: String?
            // STATUS/mood fields — only set for `type == "STATUS"` rows; omitted
            // (and ignored by the gateway) otherwise.
            let moodEmoji: String?
            let audioUrl: String?
            let audioDuration: Int?
            let visibilityUserIds: [String]?

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                if let content, !content.isEmpty { try container.encode(content, forKey: .content) }
                if let mediaIds, !mediaIds.isEmpty { try container.encode(mediaIds, forKey: .mediaIds) }
                try container.encode(visibility, forKey: .visibility)
                if let originalLanguage, !originalLanguage.isEmpty { try container.encode(originalLanguage, forKey: .originalLanguage) }
                if let type, !type.isEmpty { try container.encode(type, forKey: .type) }
                if let moodEmoji, !moodEmoji.isEmpty { try container.encode(moodEmoji, forKey: .moodEmoji) }
                if let audioUrl, !audioUrl.isEmpty { try container.encode(audioUrl, forKey: .audioUrl) }
                if let audioDuration { try container.encode(audioDuration, forKey: .audioDuration) }
                if let visibilityUserIds, !visibilityUserIds.isEmpty { try container.encode(visibilityUserIds, forKey: .visibilityUserIds) }
            }

            enum CodingKeys: String, CodingKey {
                case content, mediaIds, visibility, originalLanguage, type
                case moodEmoji, audioUrl, audioDuration, visibilityUserIds
            }
        }
        let body = CreatePostBody(
            content: payload.content,
            mediaIds: resolvedMediaIds.isEmpty ? nil : resolvedMediaIds,
            visibility: payload.visibility,
            originalLanguage: payload.originalLanguage,
            type: payload.type,
            moodEmoji: payload.moodEmoji,
            audioUrl: payload.audioUrl,
            audioDuration: payload.audioDuration,
            visibilityUserIds: payload.visibilityUserIds
        )
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            endpoint: "/posts",
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        for path in uploadedLocalPaths { try? FileManager.default.removeItem(atPath: path) }
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

    /// Durably reconciles a successful message send — independent of whether a
    /// `ConversationViewModel` is currently alive for the conversation.
    ///
    /// Fix A: before this, the optimistic→server transition (`serverAck`) ran
    /// ONLY from `ConversationViewModel`'s `retrySucceeded` Combine sink. When
    /// an outbox flush completed while the user was outside the conversation
    /// (the canonical "leave → reconnect → return" path), that transient
    /// `PassthroughSubject` event was dropped, the optimistic GRDB row stayed
    /// `.sending`, and a cold reload duplicated it against the real server
    /// message. Applying the `serverAck` here — at the always-alive dispatcher
    /// — guarantees the row flips to `.sent` and a `PendingIdRecord` is written
    /// regardless of UI state. When a VM IS alive its sink runs the same
    /// `applyEvent` again as a harmless no-op on the already-`.sent` record.
    private func reconcileSuccessfulMessageSend(
        clientMessageId: String,
        serverId: String,
        conversationId: String
    ) async {
        let persistence = await DependencyContainer.shared.messagePersistence
        _ = try? await persistence.applyEvent(
            localId: clientMessageId,
            event: .serverAck(serverId: serverId, at: Date())
        )
        await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { cached in
            cached.filter { $0.id != clientMessageId }
        }
        OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
            clientMessageId: clientMessageId,
            serverId: serverId,
            conversationId: conversationId,
            kind: .sendMessage
        ))
    }

    private func dispatchSendMessage(_ record: OutboxRecord) async throws {
        if record.id.hasPrefix("ofq_") {
            guard let item = try? decoder.decode(OfflineQueueItem.self, from: record.payload) else {
                // Corrupt payload — accept to let the flusher remove the row.
                logger.error("Corrupt OfflineQueueItem payload for record \(record.id, privacy: .public), dropping")
                return
            }

            // A3 — multi-track audio offline write-ahead replay path.
            // Task 4 routes single-audio enqueues through `enqueueAudios`, so
            // the canonical field is `localAudioPaths` (array). Legacy rows
            // written before Task 4 may still carry only `localAudioPath`
            // (scalar). Both are resolved here so the dispatcher handles every
            // row shape. Each track is uploaded via TUS independently; any
            // track whose file is missing or whose upload throws is skipped
            // (best-effort). All successfully-uploaded ids are sent in a
            // single `message:send-with-attachments` socket event so the
            // gateway runs Whisper transcription + NLLB translation +
            // Chatterbox TTS exactly like an online multi-track send.
            let pendingAudioPaths: [String] = {
                if let many = item.localAudioPaths, !many.isEmpty { return many }
                if let one = item.localAudioPath, !one.isEmpty { return [one] }
                return []
            }()

            if !pendingAudioPaths.isEmpty {
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
                var uploadedIds: [String] = []
                var uploadedPaths: [String] = []

                for stored in pendingAudioPaths {
                    let absolutePath = OfflineQueue.absoluteAudioPath(forStored: stored)
                    guard FileManager.default.fileExists(atPath: absolutePath) else {
                        logger.error("Audio file missing on dispatch, path=\(stored, privacy: .public)")
                        continue
                    }
                    do {
                        let tusResult = try await uploader.uploadFile(
                            fileURL: URL(fileURLWithPath: absolutePath),
                            mimeType: "audio/mp4",
                            token: token
                        )
                        uploadedIds.append(tusResult.id)
                        uploadedPaths.append(absolutePath)
                    } catch {
                        logger.error("Audio track TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                    }
                }

                guard !uploadedIds.isEmpty else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 503,
                        userInfo: [NSLocalizedDescriptionKey: "No audio track uploaded for offline audio dispatch"]
                    )
                }

                let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
                    conversationId: item.conversationId,
                    content: item.content.isEmpty ? nil : item.content,
                    attachmentIds: uploadedIds,
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

                // Best-effort cleanup of uploaded tracks. Failure here is
                // benign — skipped (failed-but-present) track files are
                // reclaimed by `OutboxFlusher.cleanupLocalFiles(for:)` when
                // the outbox record terminates (applied or exhausted), which
                // now sweeps both `localAudioPath` and `localAudioPaths`.
                for path in uploadedPaths { try? FileManager.default.removeItem(atPath: path) }

                await reconcileSuccessfulMessageSend(
                    clientMessageId: item.clientMessageId,
                    serverId: ack.messageId,
                    conversationId: item.conversationId
                )
                return
            }

            // S7b ST3 — offline VISUAL-media (photo/video) replay, the parity
            // twin of the audio branch above. Each pending file (relocated under
            // Documents/pending-media/ by enqueueMedia) is uploaded via TUS with
            // a MIME derived from its preserved extension (MimeTypeResolver —
            // the audio branch hardcodes audio/mp4), then all ids go out in one
            // message:send-with-attachments. The within-session TUS checkpoint
            // resume fires automatically on re-upload (same sha256 key), so a
            // kill mid-upload resumes from the saved offset (S8).
            if let pendingMediaPaths = item.localMediaPaths, !pendingMediaPaths.isEmpty {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = APIClient.shared.authToken else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 401,
                        userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload media"]
                    )
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                var uploadedIds: [String] = []
                var uploadedPaths: [String] = []

                for stored in pendingMediaPaths {
                    let absolutePath = OfflineQueue.absoluteMediaPath(forStored: stored)
                    guard FileManager.default.fileExists(atPath: absolutePath) else {
                        logger.error("Media file missing on dispatch, path=\(stored, privacy: .public)")
                        continue
                    }
                    do {
                        let mime = MimeTypeResolver.mimeType(
                            forExtension: URL(fileURLWithPath: absolutePath).pathExtension)
                        let tusResult = try await uploader.uploadFile(
                            fileURL: URL(fileURLWithPath: absolutePath),
                            mimeType: mime,
                            token: token
                        )
                        uploadedIds.append(tusResult.id)
                        uploadedPaths.append(absolutePath)
                    } catch {
                        logger.error("Media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                    }
                }

                guard !uploadedIds.isEmpty else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 503,
                        userInfo: [NSLocalizedDescriptionKey: "No media uploaded for offline media dispatch"]
                    )
                }

                let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
                    conversationId: item.conversationId,
                    content: item.content.isEmpty ? nil : item.content,
                    attachmentIds: uploadedIds,
                    replyToId: item.replyToId,
                    storyReplyToId: nil,
                    originalLanguage: item.originalLanguage,
                    clientMessageId: item.clientMessageId
                )
                guard let ack else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 502,
                        userInfo: [NSLocalizedDescriptionKey: "Socket ACK missing for offline media dispatch"]
                    )
                }

                for path in uploadedPaths { try? FileManager.default.removeItem(atPath: path) }

                await reconcileSuccessfulMessageSend(
                    clientMessageId: item.clientMessageId,
                    serverId: ack.messageId,
                    conversationId: item.conversationId
                )
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
            // Reconcile the optimistic clientMessageId durably (GRDB row +
            // PendingIdRecord + cache) so neither a `message:new` socket echo
            // nor a cold reload duplicates the row.
            await reconcileSuccessfulMessageSend(
                clientMessageId: item.clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId
            )

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
            await reconcileSuccessfulMessageSend(
                clientMessageId: clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId
            )
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
            },
            // BW1 — bandwidth gate (cf. MeeshyApp boot flusher).
            isNetworkReachable: { @Sendable in
                await MainActor.run { NetworkConditionMonitor.shared.isOnline }
            }
        )
        let nextRetry = await flusher.flush()
        OutboxRetryScheduler.shared.schedule(at: nextRetry)
    }
}

/// Possède l'unique timer de re-flush de l'outbox.
///
/// `OutboxFlusher` repousse `nextAttemptAt` sur échec (backoff exponentiel)
/// mais ne se rappelle jamais lui-même : sans ce planificateur, un record en
/// backoff attendait le prochain évènement de cycle de vie (boot, retour au
/// premier plan, enqueue, BGTask) pour être retenté. Ici, dès qu'un flush
/// laisse un record différé, on (ré)arme un timer unique qui rejoue le flush
/// pile à l'échéance. Le timer est dédupliqué : `schedule` annule toujours le
/// précédent, il n'y a donc jamais plus d'un timer en vol.
@MainActor
final class OutboxRetryScheduler {
    static let shared = OutboxRetryScheduler()
    private var timer: Task<Void, Never>?
    private var networkCancellable: AnyCancellable?
    private init() {}

    /// Réveille le flusher à chaque transition réseau offline→online (T10).
    ///
    /// `OutboxFlusher.flush()` est bandwidth-gated : une mutation enqueueée
    /// hors-ligne court-circuite, et comme rien n'est différé, AUCUN timer de
    /// backoff n'est armé (`schedule(at: nil)` annule le précédent). Sans ce
    /// trigger, elle resterait `pending` jusqu'à un évènement de cycle de vie
    /// incident (boot / retour au premier plan). On s'abonne à la MÊME source
    /// d'état réseau que le gate du flusher (`NetworkConditionMonitor`) pour
    /// garantir que trigger et gate s'accordent. Publisher + flush injectés
    /// pour la testabilité ; à appeler une fois au démarrage de l'app.
    func startObservingNetworkReconnect(
        conditionPublisher: AnyPublisher<NetworkCondition, Never> = NetworkConditionMonitor.shared.$condition.eraseToAnyPublisher(),
        flush: @escaping @MainActor () async -> Void = { await OutboxFlushTrigger.flushNow() }
    ) {
        networkCancellable = conditionPublisher
            .map { $0 != .offline }
            .removeDuplicates()
            .dropFirst()            // ignore la valeur courante rejouée à l'abonnement
            .filter { $0 }          // uniquement offline→online
            .sink { _ in Task { @MainActor in await flush() } }
    }

    /// (Ré)arme le timer pour rejouer un flush à `date`. `nil` annule le
    /// timer en attente (plus rien n'est différé).
    func schedule(at date: Date?) {
        timer?.cancel()
        guard let date else {
            timer = nil
            return
        }
        timer = Task {
            // Cap à 1 h : au-delà, un évènement de cycle de vie aura de toute
            // façon redéclenché un flush entre-temps.
            let delay = min(max(0, date.timeIntervalSinceNow), 3600)
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await OutboxFlushTrigger.flushNow()
        }
    }
}
