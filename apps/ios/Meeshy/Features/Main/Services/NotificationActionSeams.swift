import UIKit
import Combine
@preconcurrency import UserNotifications
import MeeshySDK
import os

// MARK: - Injection seams

/// Slice of `OfflineQueue` the handler needs: the durable message path
/// (kind `.sendMessage`) and the generic mutation path (`.createComment`, …).
nonisolated protocol NotificationReplyQueueing {
    func enqueue(_ item: OfflineQueueItem) async throws
    @discardableResult
    func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P,
        conversationId: String?
    ) async throws -> String
    /// La seule entrée d'un commentaire dans la file (#9743) : dans la base
    /// PROUVÉE de son auteur, et dans aucune autre.
    @discardableResult
    func enqueueComment(_ comment: CreateCommentPayload, ownerId: String?) async throws -> String
}

extension OfflineQueue: NotificationReplyQueueing {}

/// Optimistic-write slice of `MessagePersistenceActor`.
nonisolated protocol OptimisticMessagePersisting {
    func insertOptimistic(_ record: MessageRecord) async throws
    func markOptimisticFailed(localId: String, reason: String) async throws
}

extension MessagePersistenceActor: OptimisticMessagePersisting {}

@MainActor
protocol NotificationActionHandling {
    func handle(
        actionIdentifier: String,
        userInfo: [AnyHashable: Any],
        replyText: String?
    ) async
}
