import Foundation
import Combine
import MeeshySDK
import MeeshyUI
import os

/// Logic for handling conversation-related actions and data flow.
@MainActor
final class ConversationCommandHandler {
    private let state: ConversationStateStore
    private let conversationId: String
    private let messageService: MessageServiceProviding
    private let persistence: MessagePersistenceActor

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-commands")

    init(
        state: ConversationStateStore,
        conversationId: String,
        messageService: MessageServiceProviding = MessageService.shared,
        persistence: MessagePersistenceActor
    ) {
        self.state = state
        self.conversationId = conversationId
        self.messageService = messageService
        self.persistence = persistence
    }

    // MARK: - Message Actions

    func canDeleteForEveryone(_ message: Message, window: TimeInterval = 2 * 3600) -> Bool {
        guard message.isMe else { return false }
        return Date().timeIntervalSince(message.createdAt) <= window
    }

    func consumeViewOnce(messageId: String, serverId: String) async -> Bool {
        do {
            let result = try await messageService.consumeViewOnce(conversationId: conversationId, messageId: serverId)
            try? await persistence.updateViewOnceCount(localId: messageId, count: result.viewOnceCount)
            return true
        } catch {
            state.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Status Actions

    func markAsReceived() {
        Task {
            do {
                try await ConversationService.shared.markAsReceived(conversationId: conversationId)
            } catch {
                Self.logger.warning("Failed to mark as received: \(error.localizedDescription)")
            }
        }
    }
}
