import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK

extension ConversationListViewModel {

    // MARK: - Toggle Pin

    func togglePin(for conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let newValue = !conversations[index].userState.isPinned
        // Strategy B: the store owns the optimistic update, outbox-backed
        // offline replay and rollback. The result lands back on the row via
        // `observeStore` (merge sink). `try?` — a 4xx rollback is already
        // reflected by the store's publisher; a transient failure keeps the
        // optimistic value and retries via the outbox.
        try? await store.apply(.setPinned(newValue), for: conversationId)
    }

    // MARK: - Toggle Mute

    func toggleMute(for conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let newValue = !conversations[index].userState.isMuted
        try? await store.apply(.setMuted(newValue), for: conversationId)
    }

    // MARK: - Rename

    /// Renomme une conversation (groupes / communautés). Enqueue via l'outbox
    /// (`PUT /conversations/:id`) ; le nouveau nom se propage au retour serveur
    /// via l'event socket `conversationUpdated` déjà observé par ce VM.
    func renameConversation(conversationId: String, title: String) async {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let payload = UpdateConversationPayload(
            clientMutationId: ClientMutationId.generate(),
            conversationId: conversationId,
            title: trimmed,
            description: nil,
            avatarUrl: nil
        )
        do {
            try await OfflineQueue.shared.enqueue(.updateConversation, payload: payload, conversationId: conversationId)
        } catch {
            Logger.messages.error("[Rename] enqueue failed id=\(conversationId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Mark as Read

    /// Le geste « Marquer comme lu » de la liste, seul chemin de lecture qui
    /// porte AUSSI une mutation serveur annulable. Il n'emprunte donc PAS
    /// `ConversationReadSignal` : le compteur affiché doit rester la propriété
    /// de `store.apply(.markAsRead)`, qui le remet à sa valeur d'avant sur un
    /// 4xx. Passer par le bus poserait un zéro hors du store, que le rollback
    /// ne saurait plus reprendre. Les autres surfaces (rattrapage du fil,
    /// quick-action push, widget) ne mutent rien côté serveur par ce chemin et
    /// utilisent le signal partagé.
    func markAsRead(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        // Local-first read sync (cache + frontière de lecture GRDB).
        await syncEngine.markConversationReadLocally(conversationId)
        // Badge d'icône + widget : le store ne les touche pas, et sans cette
        // ligne le compte de l'icône restait au chiffre d'avant jusqu'à un
        // `read-status:updated` serveur.
        NotificationCoordinator.shared.markConversationRead(conversationId)
        guard Self.shouldDispatchListMarkAsRead(
            conversationId: conversationId,
            // iPad multi-fenêtre : ouverte dans une fenêtre détachée, la
            // conversation a déjà son marquage précis, même si elle n'est pas
            // la plus récente.
            activeConversationId: NotificationToastManager.shared.isConversationOpen(conversationId)
                ? conversationId
                : messageSocket.activeConversationId
        ) else {
            clearUnreadLocally(conversationId)
            return
        }
        // Server mark-read via the store: optimistic unreadCount=0 + outbox
        // offline replay. The gateway gates the read-RECEIPT broadcast to the
        // sender by the user's `showReadReceipts` preference (see
        // routes/conversations/messages.ts → broadcastReadStatus), so the old
        // client-side `showReadReceipts` gate was redundant for privacy.
        // Dropping it also fixes cross-device unread sync when receipts are off
        // (the server now records the read position regardless).
        try? await store.apply(.markAsRead, for: conversationId)
    }

    /// La conversation OUVERTE possède déjà son chemin de marquage, qui NOMME
    /// au gateway les messages réellement affichés. Celui de la liste poste un
    /// mark-read sans corps : le gateway y retombe sur son repli par fenêtre
    /// temporelle, qui déclare lus des messages jamais montrés — un mensonge
    /// aux expéditeurs. En split-view iPad les deux surfaces sont visibles en
    /// même temps ; laisser la grossière doubler la précise annulerait
    /// exactement ce que la seconde garantit.
    nonisolated static func shouldDispatchListMarkAsRead(
        conversationId: String,
        activeConversationId: String?
    ) -> Bool {
        conversationId != activeConversationId
    }

    /// Efface la pastille de la ligne dans l'état publié courant. Le cache est
    /// déjà à jour, mais son signal est débouncé : sans cette pose immédiate,
    /// le geste resterait sans effet visible pendant deux dixièmes de seconde.
    func clearUnreadLocally(_ conversationId: String) {
        guard let idx = convIndex(for: conversationId) else { return }
        conversations[idx].userState.unreadCount = 0
        for i in 0..<groupedConversations.count {
            if let rowIdx = groupedConversations[i].conversations.firstIndex(where: { $0.id == conversationId }) {
                groupedConversations[i].conversations[rowIdx].userState.unreadCount = 0
                break
            }
        }
    }

    // MARK: - Mark as Unread

    func markAsUnread(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        // iPad : la conversation ouverte se DÉSÉLECTIONNE (Mail, Messages) — sa sortie ne rattrape pas.
        ExplicitUnreadMarks.note(conversationId); conversationLeavesDetail.send(conversationId)
        // Frontière de lecture locale effacée : sinon `reconcileUnread` reclamperait le compteur à 0.
        await syncEngine.markConversationUnreadLocally(conversationId)
        // Store sets unreadCount ≥ 1 optimistically + dispatches markUnread.
        try? await store.apply(.markAsUnread, for: conversationId)
    }

    // MARK: - Archive Conversation

    func archiveConversation(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        try? await store.apply(.setArchived(true), for: conversationId)
    }

    // MARK: - Unarchive Conversation

    func unarchiveConversation(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        try? await store.apply(.setArchived(false), for: conversationId)
    }

    // MARK: - Delete Conversation

    func deleteConversation(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        // `.deleteForUser` sets userState.deletedForUserAt (soft delete)
        // optimistically + dispatches deleteForMe via the outbox. The row
        // disappears because `filterConversations` hides deletedForUserAt != nil;
        // on a 4xx the store clears deletedForUserAt and the row reappears.
        do { try await store.apply(.deleteForUser, for: conversationId); conversationLeavesDetail.send(conversationId) } catch {}
        await sweepLocalCallTranscripts(forConversation: conversationId)
    }

    /// Every local call transcript for this conversation, swept alongside the
    /// (optimistic, rollback-capable) conversation delete. No secondary index
    /// needed — the existing local messages cache already carries each call
    /// message's `callSummary.callId`, which IS the join from "this
    /// conversation" to "its calls". Accepted, low-severity edge case: a
    /// rolled-back delete (4xx) doesn't un-sweep already-invalidated
    /// transcripts — same risk class already accepted for other local-cache-only
    /// invalidations elsewhere in the app. See
    /// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md.
    private func sweepLocalCallTranscripts(forConversation conversationId: String) async {
        let messages = await CacheCoordinator.shared.messages.load(for: conversationId).snapshot() ?? []
        for callId in messages.compactMap(\.callSummary?.callId) {
            await CallTranscriptStore.shared.invalidate(for: callId)
        }
    }

    // MARK: - Move to Section

    func moveToSection(conversationId: String, sectionId: String) {
        guard convIndex(for: conversationId) != nil else { return }
        let newSectionId: String? = sectionId.isEmpty ? nil : sectionId
        Task { [store] in
            try? await store.apply(.setSection(categoryId: newSectionId), for: conversationId)
        }
    }

    // MARK: - Favorite Reaction

    func setFavoriteReaction(conversationId: String, emoji: String?) async {
        guard convIndex(for: conversationId) != nil else { return }
        try? await store.apply(.setReaction(emoji), for: conversationId)
    }
}
