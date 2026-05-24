import Foundation
import Combine
import MeeshySDK
import MeeshyUI
import os

/// Logic for handling conversation-related actions and data flow.
@MainActor
public final class ConversationCommandHandler {
    private let state: ConversationStateStore
    private let conversationId: String
    private let messageService: MessageServiceProviding
    private let persistence: MessagePersistenceActor
    private let authManager: AuthManaging
    private let messageSocket: MessageSocketProviding
    private let reportService: ReportServiceProviding

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-commands")

    public init(
        state: ConversationStateStore,
        conversationId: String,
        messageService: MessageServiceProviding = MessageService.shared,
        persistence: MessagePersistenceActor,
        authManager: AuthManaging = AuthManager.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        reportService: ReportServiceProviding = ReportService.shared
    ) {
        self.state = state
        self.conversationId = conversationId
        self.messageService = messageService
        self.persistence = persistence
        self.authManager = authManager
        self.messageSocket = messageSocket
        self.reportService = reportService
    }

    // MARK: - Message Actions

    public func canDeleteForEveryone(_ message: Message, window: TimeInterval = 2 * 3600) -> Bool {
        guard message.isMe else { return false }
        return Date().timeIntervalSince(message.createdAt) <= window
    }

    public func deleteMessage(messageId: String, serverId: String, mode: ConversationViewModel.DeleteMode) async {
        switch mode {
        case .local:
            LocallyHiddenMessagesStore.shared.hide(messageId)
        case .everyone:
            try? await persistence.markDeleted(localId: messageId, deletedAt: Date())
            do {
                try await messageService.delete(conversationId: conversationId, messageId: serverId)
            } catch {
                try? await persistence.markUndeleted(localId: messageId)
                state.error = error.localizedDescription
            }
        }
    }

    public func editMessage(messageId: String, serverId: String, newContent: String) async {
        let trimmed = newContent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let originalContent = state.messages.first(where: { $0.id == messageId })?.content

        if let original = originalContent, original != trimmed {
            EditHistoryStore.shared.recordRevision(messageId: serverId, previousContent: original)
        }

        let editedAt = Date()
        try? await persistence.markEdited(localId: messageId, newContent: trimmed, editedAt: editedAt)
        state.editInProgress.insert(messageId)
        defer { state.editInProgress.remove(messageId) }

        do {
            _ = try await messageService.edit(messageId: serverId, content: trimmed)
        } catch {
            if let original = originalContent {
                try? await persistence.markEdited(localId: messageId, newContent: original, editedAt: editedAt)
                EditHistoryStore.shared.removeHistory(for: serverId)
            }
            state.error = error.localizedDescription
        }
    }

    public func togglePin(messageId: String, serverId: String, isPinned: Bool, currentUserId: String?) async {
        if isPinned {
            try? await persistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)
            do {
                try await messageService.unpin(conversationId: conversationId, messageId: serverId)
            } catch {
                state.error = error.localizedDescription
            }
        } else {
            let now = Date()
            try? await persistence.updatePinned(localId: messageId, pinnedAt: now, pinnedBy: currentUserId)
            do {
                try await messageService.pin(conversationId: conversationId, messageId: serverId)
            } catch {
                state.error = error.localizedDescription
            }
        }
    }

    public func reportMessage(messageId: String, serverId: String, reportType: String, reason: String?) async -> Bool {
        do {
            try await reportService.reportMessage(messageId: serverId, reportType: reportType, reason: reason)
            return true
        } catch {
            state.error = error.localizedDescription
            return false
        }
    }

    public func consumeViewOnce(messageId: String, serverId: String) async -> Bool {
        do {
            let result = try await messageService.consumeViewOnce(conversationId: conversationId, messageId: serverId)
            try? await persistence.updateViewOnceCount(localId: messageId, count: result.viewOnceCount)
            return true
        } catch {
            state.error = error.localizedDescription
            return false
        }
    }

    public func deleteAttachment(messageId: String, attachmentId: String, originalAttachments: [MessageAttachment], serverId: String) async {
        let updatedAttachments = originalAttachments.filter { $0.id != attachmentId }
        let updatedJson = try? JSONEncoder().encode(updatedAttachments)
        try? await persistence.updateAttachmentsJson(localId: messageId, attachmentsJson: updatedJson)

        do {
            try await AttachmentService.shared.delete(attachmentId: attachmentId)
        } catch {
            let originalJson = try? JSONEncoder().encode(originalAttachments)
            try? await persistence.updateAttachmentsJson(localId: messageId, attachmentsJson: originalJson)
            state.error = error.localizedDescription
        }
    }

    // MARK: - Status Actions

    public func markAsRead(lastMessageId: String) {
        state.currentConversationUnreadCount = 0
        Task { await ConversationSyncEngine.shared.markConversationReadLocally(conversationId) }
        NotificationCenter.default.post(name: .conversationMarkedRead, object: conversationId)

        guard UserPreferencesManager.shared.privacy.showReadReceipts else { return }

        Task {
            let cmid = ClientMutationId.generate()
            let payload = MarkAsReadPayload(
                clientMutationId: cmid,
                conversationId: conversationId,
                upToMessageId: lastMessageId
            )
            do {
                try await OfflineQueue.shared.enqueue(.markAsRead, payload: payload, conversationId: conversationId)
            } catch {
                await PendingStatusQueue.shared.enqueue(.init(
                    conversationId: conversationId, type: "read", timestamp: Date()
                ))
            }
        }
    }

    public func markAsReceived() {
        Task {
            do {
                try await ConversationService.shared.markAsReceived(conversationId: conversationId)
            } catch {
                Self.logger.warning("Failed to mark as received: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Star Actions

    public func toggleStar(message: Message, serverId: String, preview: String, conversationName: String?, conversationAccentColor: String?) -> Bool {
        let attachmentKind = message.attachments.first.map { att -> String in
            switch att.type {
            case .image: return "image"
            case .video: return "video"
            case .audio: return "audio"
            case .file: return "file"
            case .location: return "location"
            }
        }

        let snapshot = StarredMessageSnapshot(
            id: serverId,
            conversationId: conversationId,
            conversationName: conversationName,
            conversationAccentColor: conversationAccentColor,
            senderUserId: message.senderUserId,
            senderName: message.senderName ?? message.senderUsername,
            contentPreview: String(preview.prefix(280)),
            attachmentKind: attachmentKind,
            starredAt: Date(),
            sentAt: message.createdAt
        )
        return StarredMessagesStore.shared.toggle(snapshot)
    }

    // MARK: - Reaction Actions

    public func toggleReaction(messageId: String, serverId: String, emoji: String, participantId: String) {
        let alreadyReacted = state.messages.first(where: { $0.id == messageId })?.reactions.contains { $0.emoji == emoji && $0.participantId == participantId } ?? false

        if alreadyReacted {
            Task {
                try? await persistence.removeReaction(localId: messageId, emoji: emoji, participantId: participantId)
                try? await OfflineQueue.shared.enqueueReaction(messageId: serverId, emoji: emoji, action: .remove, conversationId: conversationId)
                await OutboxFlushTrigger.flushNow()
            }
        } else {
            Task {
                try? await persistence.appendReaction(localId: messageId, reactionId: UUID().uuidString, messageId: serverId, participantId: participantId, emoji: emoji)
                try? await OfflineQueue.shared.enqueueReaction(messageId: serverId, emoji: emoji, action: .add, conversationId: conversationId)
                await OutboxFlushTrigger.flushNow()
            }
        }
    }
}
