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

    let logger = MeeshyLog.logger(.outboxDispatcher, subsystem: .legacyIOS)

    // `internal` et non `private` : la famille « messages » vit dans
    // `OutboxDispatcher+Messages.swift` depuis l'extraction du budget, et une
    // propriété `private` n'est visible que dans SON fichier — pas dans une
    // extension du même type ailleurs. C'est la frontière invisible que toute
    // extraction franchit, et qui ne se voit qu'à la compilation.
    let decoder: JSONDecoder = {
        let d = MeeshyCoders.decoder(.persistence)
        return d
    }()

    let messageService: any MessageServiceProviding
    let persistence: @Sendable @concurrent () async -> MessagePersistenceActor

    init(
        messageService: any MessageServiceProviding = MessageService.shared,
        persistence: @escaping @Sendable @concurrent () async -> MessagePersistenceActor = { DependencyContainer.shared.messagePersistence }
    ) {
        self.messageService = messageService
        self.persistence = persistence
    }

    /// #10502 — une mutation ENVOYÉE qui est une interaction avec un contenu
    /// (réaction, repost, commentaire, blocage) s'émet en événement v2, daté
    /// de son enfilement. Un échec ne s'émet pas : le rejeu le fera.
    func dispatch(_ record: OutboxRecord) async throws {
        try await route(record)
        if let event = SocialInteractionEvents.event(forDelivered: record) {
            SocialEventsV2Hub.shared.emit(event)
        }
    }

    private func route(_ record: OutboxRecord) async throws {
        switch record.kind {
        case .sendMessage:
            try await dispatchSendMessageRecordingFailure(record)

        case .editMessage:
            try await dispatchEditMessage(record)

        case .deleteMessage:
            try await dispatchDeleteMessage(record)

        case .sendReaction:
            try await dispatchSendReaction(record)

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

        case .markAsRead:
            try await dispatchMarkAsRead(record)

        case .markStoryViewed:
            try await dispatchMarkStoryViewed(record)

        case .consumeAfterRead:
            try await dispatchConsumeAfterRead(record)

        case .reportContentCapture:
            try await dispatchReportContentCapture(record)

        case .reportAttachmentStatus:
            try await dispatchReportAttachmentStatus(record)

        case .createConversation:
            try await dispatchCreateConversation(record)

        case .updateConversation:
            try await dispatchUpdateConversation(record)

        case .updateSettings:
            try await dispatchUpdateSettings(record)

        case .createPost:
            try await dispatchCreatePost(record)

        case .toggleLikePost, .toggleBookmarkPost:
            try await dispatchPostEngagement(record)

        case .createComment:
            try await dispatchCreateComment(record)

        case .deleteComment:
            try await dispatchDeleteComment(record)

        case .toggleLikeComment:
            try await dispatchToggleLikeComment(record)

        case .repostPost:
            try await dispatchRepostPost(record)

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

    // MARK: - Payload decoding

    /// Decoded the typed payload from `record.payload`. Treats a decode
    /// failure as permanent so the flusher escalates to `.exhausted` after
    /// the next attempt instead of looping forever on a corrupt row.
    ///
    /// Throws a typed `MeeshyError.server(statusCode: 400, _)` — not a raw
    /// `NSError` — so `OutboxFlusher.isPermanentServerRejection` (which
    /// pattern-matches on `MeeshyError`) recognizes a corrupt local payload
    /// as permanent and dead-letters it on the first attempt, the same as
    /// any other 4xx rejection, instead of burning the full retry budget
    /// (~1 min of exponential backoff) on a row that can never succeed.
    func decodePayload<P: Decodable>(_ record: OutboxRecord, as type: P.Type) throws -> P {
        do {
            return try decoder.decode(P.self, from: record.payload)
        } catch {
            logger.error("Failed to decode \(String(describing: P.self), privacy: .public) for outbox \(record.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw MeeshyError.server(
                statusCode: 400,
                message: "Corrupt \(record.kind.rawValue) payload for \(record.id)"
            )
        }
    }
}
