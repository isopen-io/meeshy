import Foundation
import Combine
import MeeshySDK
import MeeshyUI
import os

@MainActor
protocol ConversationCommandProviding: AnyObject {
    func canDeleteForEveryone(_ message: Message) -> Bool
    func consumeViewOnce(messageId: String, serverId: String) async -> Bool
    func markAsReceived()
    func consumeReactionToken() -> Bool
    func addReaction(localId: String, remoteId: String, participantId: String, emoji: String)
    func removeReaction(localId: String, remoteId: String, participantId: String, emoji: String)
    func deleteForMe(_ targets: [ForMeTarget], projection: ForMeProjection) async -> ConversationCommandFailure?
    func withdrawUnsent(messageId: String) async
    func deleteForEveryone(messageId: String, serverId: String) async -> ConversationCommandFailure?
    func removeForModeration(messageId: String, serverId: String, reason: String) async -> ConversationCommandFailure?
    func removeSelection(
        _ targets: [SelectionRemovalTarget], reason: String, discardUnsent: (String) async -> Void
    ) async -> ConversationCommandFailure?
    func removeAttachment(messageId: String, attachmentId: String, original: [MeeshyMessageAttachment]) async -> ConversationCommandFailure?
    func togglePin(messageId: String, serverId: String, previous: MessagePinState, currentUserId: String?) async -> ConversationCommandFailure?
    func editMessage(
        messageId: String, serverId: String, content: String, originalContent: String?,
        beforeOptimisticWrite: () -> Void
    ) async -> ConversationCommandFailure?
    func compensate(_ payload: OfflineRetryExhausted, currentUserId: String, serverId: (String) -> String) async
}

/// Un message de la sélection à retirer : son id serveur, la main qui l'a écrit (les messages des autres
/// portent le motif, les siens partent sans) et s'il n'a jamais atteint le serveur (`.failed`).
struct SelectionRemovalTarget: Equatable {
    let messageId: String
    let serverId: String
    let isMine: Bool
    let isUnsent: Bool
}

/// **Retirer une SÉLECTION de messages** (#11159) : lit le fil du view-model, confie la règle au
/// handler (`removeSelection`) et rend compte du refus. Hors du view-model : une responsabilité, un type.
@MainActor
struct ConversationSelectionRemoval {
    let viewModel: ConversationViewModel

    func run(_ ids: Set<String>, reason: String) async {
        let targets = viewModel.messages.filter { ids.contains($0.id) }.map {
            SelectionRemovalTarget(
                messageId: $0.id, serverId: viewModel.serverId(for: $0.id), isMine: $0.isMe,
                isUnsent: $0.isMe && viewModel.outgoingState(of: $0.id)?.isFailed == true
            )
        }
        let failure = await viewModel.commands.removeSelection(targets, reason: reason) {
            await viewModel.deleteMessage(messageId: $0, mode: .everyone)
        }
        if let failure { viewModel.error = failure.userMessage }
    }
}

@MainActor
final class ConversationCommandHandler: ConversationCommandProviding {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private let state: ConversationStateStore
    private let conversationId: String
    private let messageService: MessageServiceProviding
    private let persistence: any ConversationCommandPersisting
    private let offlineQueue: OfflineMessageQueueing
    private let networkMonitor: NetworkMonitorProviding
    private let reactionOutbox: any ReactionOutboxEnqueuing
    private let attachments: any AttachmentDeleting
    private let personalHiding: any PersonalMessageHiding
    private let now: () -> Date

    private static let logger = MeeshyLog.logger(.conversationCommands)
    private static let reactionMaxTokens: Double = 10
    private static let reactionRefillRate: Double = 3

    private var reactionTokens: Double = ConversationCommandHandler.reactionMaxTokens
    private var reactionLastRefill: Date

    init(
        state: ConversationStateStore,
        conversationId: String,
        messageService: MessageServiceProviding = MessageService.shared,
        persistence: any ConversationCommandPersisting,
        offlineQueue: OfflineMessageQueueing = OfflineQueue.shared,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared,
        reactionOutbox: any ReactionOutboxEnqueuing = LiveReactionOutbox(),
        attachments: any AttachmentDeleting = AttachmentService.shared,
        personalHiding: any PersonalMessageHiding = MessageService.shared,
        now: @escaping () -> Date = { Date() }
    ) {
        self.state = state
        self.conversationId = conversationId
        self.messageService = messageService
        self.persistence = persistence
        self.offlineQueue = offlineQueue
        self.networkMonitor = networkMonitor
        self.reactionOutbox = reactionOutbox
        self.attachments = attachments
        self.personalHiding = personalHiding
        self.now = now
        self.reactionLastRefill = now()
    }

    // MARK: - Message Actions

    /// `admitMessageDelete` (#11214) : l'auteur supprime pour tous SANS fenêtre —
    /// la passerelle n'en impose aucune, la fenêtre de 2 h n'existait qu'ici.
    func canDeleteForEveryone(_ message: Message) -> Bool {
        message.isMe && message.deletedAt == nil
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

    // MARK: - Reactions

    /// Seau à jetons contre le spam de réactions : rafale de 10, recharge de 3 par seconde.
    func consumeReactionToken() -> Bool {
        let current = now()
        let elapsed = current.timeIntervalSince(reactionLastRefill)
        reactionTokens = min(Self.reactionMaxTokens, reactionTokens + elapsed * Self.reactionRefillRate)
        reactionLastRefill = current
        guard reactionTokens >= 1 else { return false }
        reactionTokens -= 1
        return true
    }

    func addReaction(localId: String, remoteId: String, participantId: String, emoji: String) {
        ReactionAnimationGate.markAdded(messageId: localId, emoji: emoji)
        let reactionId = UUID().uuidString
        let persistence = persistence
        Task {
            try? await persistence.appendReaction(
                localId: localId, reactionId: reactionId, messageId: remoteId, participantId: participantId,
                emoji: emoji, maxCount: nil, ownerUserId: nil
            )
        }
        enqueueReaction(remoteId: remoteId, emoji: emoji, action: .add)
    }

    func removeReaction(localId: String, remoteId: String, participantId: String, emoji: String) {
        let persistence = persistence
        Task {
            try? await persistence.removeReaction(
                localId: localId, emoji: emoji, participantId: participantId, ownerUserId: nil,
                aggregateCount: nil, aggregateParticipantIds: nil
            )
        }
        enqueueReaction(remoteId: remoteId, emoji: emoji, action: .remove)
    }

    private func enqueueReaction(remoteId: String, emoji: String, action: ReactionAction) {
        let outbox = reactionOutbox
        let conversationId = conversationId
        Task {
            await outbox.enqueue(messageId: remoteId, emoji: emoji, action: action, conversationId: conversationId)
        }
    }

    // MARK: - Delete

    /// **« Supprimer pour moi » vaut PARTOUT** (#11221) : la route que le web
    /// appelle déjà, dont la passerelle diffuse le masquage aux autres appareils
    /// du lecteur. Optimiste DANS LA PROJECTION — le message quitte le fil avant
    /// la réponse, la base n'est purgée qu'après l'accord ; un refus lève le
    /// filtre et la base le rend, sans relecture réseau. Une sélection part en UNE
    /// requête. Hors ligne, refus dit : un masquage resté local reviendrait au
    /// prochain chargement, sans que rien l'explique.
    func deleteForMe(_ targets: [ForMeTarget], projection: ForMeProjection) async -> ConversationCommandFailure? {
        guard !targets.isEmpty else { return nil }
        guard networkMonitor.isOnline else { return Self.offlineRemovalRefusal }
        let localIds = targets.map(\.messageId)
        projection.conceal(localIds)
        do {
            try await hideOnServer(targets.map(\.serverId))
        } catch {
            await projection.reveal(localIds)
            return ConversationCommandFailure(error)
        }
        try? await persistence.purgeMessages(ids: localIds)
        targets.forEach { StarredMessagesStore.shared.remove(messageId: $0.serverId) }
        return nil
    }

    private func hideOnServer(_ serverIds: [String]) async throws {
        guard serverIds.count > 1 else {
            try await personalHiding.hideForMe(messageId: serverIds[0])
            return
        }
        try await personalHiding.hideForMe(messageIds: serverIds)
    }

    /// Un message `.failed` n'a jamais atteint le serveur : sa ligne d'outbox, même remise
    /// `.pending` par un retry média, est annulée puis effacée pour ne jamais partir après le retrait.
    func withdrawUnsent(messageId: String) async {
        await offlineQueue.cancelPendingSend(clientMessageId: messageId)
        await offlineQueue.clearSendMessageRow(clientMessageId: messageId)
    }

    func deleteForEveryone(messageId: String, serverId: String) async -> ConversationCommandFailure? {
        await eraseLocally(messageId: messageId, serverId: serverId, deletedAt: now())
        guard networkMonitor.isOnline else {
            try? await offlineQueue.enqueueDelete(OfflineDeletePayload(
                messageId: serverId, clientMessageId: messageId, conversationId: conversationId
            ))
            return nil
        }
        do {
            try await messageService.delete(conversationId: conversationId, messageId: serverId)
            return nil
        } catch {
            try? await persistence.markUndeleted(localId: messageId)
            return ConversationCommandFailure(error)
        }
    }

    /// Retrait du message d'un AUTRE, avec son motif : jamais par la file hors ligne, qui ne porte pas de motif.
    func removeForModeration(messageId: String, serverId: String, reason: String) async -> ConversationCommandFailure? {
        guard networkMonitor.isOnline else { return Self.offlineRemovalRefusal }
        await eraseLocally(messageId: messageId, serverId: serverId, deletedAt: now())
        do {
            try await messageService.delete(conversationId: conversationId, messageId: serverId, reason: reason)
            return nil
        } catch {
            try? await persistence.markUndeleted(localId: messageId)
            return ConversationCommandFailure(error)
        }
    }

    /// Retrait d'une SÉLECTION (#11159) : en ligne seulement ; les non-envoyés se retirent localement
    /// (`discardUnsent`), toute la sélection envoyée s'efface aussitôt, puis chaque refus ne ramène que
    /// son message. UN motif pour les messages des autres, les siens partent sans motif.
    func removeSelection(
        _ targets: [SelectionRemovalTarget], reason: String, discardUnsent: (String) async -> Void
    ) async -> ConversationCommandFailure? {
        guard networkMonitor.isOnline else { return Self.offlineRemovalRefusal }
        for target in targets where target.isUnsent { await discardUnsent(target.messageId) }
        let sent = targets.filter { !$0.isUnsent }
        let deletedAt = now()
        for target in sent { await eraseLocally(messageId: target.messageId, serverId: target.serverId, deletedAt: deletedAt) }
        var refusal: ConversationCommandFailure?
        for target in sent {
            do {
                try await messageService.delete(
                    conversationId: conversationId, messageId: target.serverId, reason: target.isMine ? nil : reason
                )
            } catch {
                try? await persistence.markUndeleted(localId: target.messageId)
                refusal = ConversationCommandFailure(error)
            }
        }
        return refusal
    }

    private static var offlineRemovalRefusal: ConversationCommandFailure {
        ConversationCommandFailure(userMessage: String(
            localized: "moderation.removal.offline",
            defaultValue: "Connectez-vous pour retirer ce contenu.",
            bundle: .main
        ))
    }

    private func eraseLocally(messageId: String, serverId: String, deletedAt: Date) async {
        try? await persistence.markDeleted(localId: messageId, deletedAt: deletedAt, sparingOpenedViewOnce: false, expired: false)
        StarredMessagesStore.shared.remove(messageId: serverId)
    }

    func removeAttachment(
        messageId: String, attachmentId: String, original: [MeeshyMessageAttachment]
    ) async -> ConversationCommandFailure? {
        let stored = EndToEndAttachmentOverlay.sealedForStorage(original)
        let remainingJson = try? JSONEncoder().encode(stored.filter { $0.id != attachmentId })
        let originalJson = try? JSONEncoder().encode(stored)
        try? await persistence.updateAttachmentsJson(localId: messageId, attachmentsJson: remainingJson)
        do {
            try await attachments.delete(attachmentId: attachmentId)
            return nil
        } catch {
            try? await persistence.updateAttachmentsJson(localId: messageId, attachmentsJson: originalJson)
            return ConversationCommandFailure(error)
        }
    }

    // MARK: - Pin

    func togglePin(
        messageId: String, serverId: String, previous: MessagePinState, currentUserId: String?
    ) async -> ConversationCommandFailure? {
        guard previous.isPinned else {
            try? await persistence.updatePinned(localId: messageId, pinnedAt: now(), pinnedBy: currentUserId)
            do {
                try await messageService.pin(conversationId: conversationId, messageId: serverId)
                return nil
            } catch {
                try? await persistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)
                return ConversationCommandFailure(error)
            }
        }
        try? await persistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)
        do {
            try await messageService.unpin(conversationId: conversationId, messageId: serverId)
            return nil
        } catch {
            try? await persistence.updatePinned(localId: messageId, pinnedAt: previous.pinnedAt, pinnedBy: previous.pinnedBy)
            return ConversationCommandFailure(error)
        }
    }

    // MARK: - Edit

    func editMessage(
        messageId: String, serverId: String, content: String, originalContent: String?,
        beforeOptimisticWrite: () -> Void
    ) async -> ConversationCommandFailure? {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let original = originalContent, original != trimmed {
            EditHistoryStore.shared.recordRevision(messageId: serverId, previousContent: original)
        }
        beforeOptimisticWrite()
        let editedAt = try? await persistence.markEditedLocally(localId: messageId, newContent: trimmed, now: now())
        guard networkMonitor.isOnline else {
            try? await offlineQueue.enqueueEdit(OfflineEditPayload(
                messageId: serverId, clientMessageId: messageId, content: trimmed, conversationId: conversationId
            ))
            return nil
        }
        do {
            _ = try await messageService.edit(messageId: serverId, content: trimmed)
            return nil
        } catch {
            if let original = originalContent, let editedAt {
                try? await persistence.markEdited(
                    localId: messageId, newContent: original, editedAt: editedAt, marksEdited: true, arrivalsNotice: nil
                )
                EditHistoryStore.shared.removeHistory(for: serverId)
            }
            return ConversationCommandFailure(error)
        }
    }

    // MARK: - Compensations de l'outbox

    func compensate(_ payload: OfflineRetryExhausted, currentUserId: String, serverId: (String) -> String) async {
        switch payload.kind {
        case .sendReaction:
            await compensateReaction(payload, currentUserId: currentUserId, serverId: serverId)
        case .editMessage:
            let canonicalId = serverId(payload.tempId)
            guard let original = EditHistoryStore.shared.revisions(for: canonicalId).last?.content else { return }
            _ = try? await persistence.markEditedLocally(localId: payload.tempId, newContent: original, now: now())
            EditHistoryStore.shared.removeHistory(for: canonicalId)
        case .deleteMessage:
            try? await persistence.markUndeleted(localId: payload.tempId)
        default:
            break
        }
    }

    private func compensateReaction(
        _ payload: OfflineRetryExhausted, currentUserId: String, serverId: (String) -> String
    ) async {
        guard let reaction = payload.reaction else { return }
        switch reaction.action {
        case .add:
            try? await persistence.removeReaction(
                localId: reaction.messageId, emoji: reaction.emoji, participantId: currentUserId,
                ownerUserId: nil, aggregateCount: nil, aggregateParticipantIds: nil
            )
        case .remove:
            try? await persistence.appendReaction(
                localId: reaction.messageId, reactionId: UUID().uuidString,
                messageId: serverId(reaction.messageId), participantId: currentUserId,
                emoji: reaction.emoji, maxCount: nil, ownerUserId: nil
            )
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
