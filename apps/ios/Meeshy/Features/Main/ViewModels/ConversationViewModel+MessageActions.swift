import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes, et ne change AUCUN
// comportement — les corps sont déplacés à l'identique.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : les ACTIONS de l'utilisateur sur un message déjà
// posé — expiration, favori, réactions (message et pièce jointe, avec leur
// limiteur de jetons), suppression, épinglage, consommation d'un message à vue
// unique, édition, signalement — et le partage de position en direct. Toutes
// écrivent d'abord dans `MessagePersistenceActor` : c'est l'observation du
// magasin qui les fait remonter à l'écran, jamais une mutation directe du
// tableau.

extension ConversationViewModel {

    // MARK: - Handle Expired Messages

    func removeExpiredMessages() {
        let now = Date()
        let persistence = messagePersistence
        Task.detached(priority: .utility) {
            // Delete expired rows from GRDB; the store observation removes them
            // from `messages` automatically — no direct removeAll needed.
            try? await persistence.deleteExpiredEphemeral(before: now)
        }
    }

    // MARK: - Star / Bookmark

    /// Toggle the starred state for a message. Local-only (the backend
    /// doesn't expose a message-level star endpoint yet); the snapshot
    /// captured here is what the `StarredMessagesView` renders, so the
    /// row survives edits, `.local` deletions, and conversation archives
    /// without needing to re-hydrate the original bubble.
    @discardableResult
    func toggleStar(messageId: String, conversationName: String? = nil, conversationAccentColor: String? = nil) -> Bool {
        guard let idx = messageIndex(for: messageId) else { return false }
        let msg = messages[idx]
        let canonicalId = serverId(for: messageId)

        // `AttachmentType` est un `String` enum : son `rawValue` EST le
        // vocabulaire sérialisé de l'instantané (« image », « video »…).
        let attachmentKind = msg.attachments.first?.type.rawValue

        // Prefer the active translation for the user's preferred language so
        // the starred preview matches what the user actually read, not the
        // raw original content.
        let preview: String = {
            if let translation = preferredTranslation(for: messageId),
               !translation.translatedContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return translation.translatedContent
            }
            if msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                guard let kind = attachmentKind.flatMap(MediaKindLabel.kind(forAttachmentRawValue:)) else { return "" }
                return MediaKindLabel.summary(kind)
            }
            return msg.content
        }()

        let snapshot = StarredMessageSnapshot(
            id: canonicalId,
            conversationId: conversationId,
            conversationName: conversationName,
            conversationAccentColor: conversationAccentColor,
            senderUserId: msg.senderUserId,
            senderName: msg.senderName ?? msg.senderUsername,
            contentPreview: String(preview.prefix(280)),
            attachmentKind: attachmentKind,
            starredAt: Date(),
            sentAt: msg.createdAt
        )
        return StarredMessagesStore.shared.toggle(snapshot)
    }

    func isStarred(messageId: String) -> Bool {
        StarredMessagesStore.shared.isStarred(messageId: serverId(for: messageId))
    }

    // MARK: - Toggle Reaction

    func toggleReaction(messageId: String, emoji: String) {
        guard consumeReactionToken() else { return }
        guard let idx = messageIndex(for: messageId) else { return }
        // Un message systeme n'est pas reactable : l'overlay menu gate deja
        // l'affordance, l'action gate aussi pour couvrir tout autre call site
        // (le gateway rejette en 400 en derniere barriere).
        guard messages[idx].messageSource != .system else { return }

        // Own reactions are ALWAYS keyed by the `currentUserId` sentinel — the
        // canonical "my reaction" marker that `summarizeReactions` and
        // `reconstructFromSummary` agree on. Keying the optimistic row by the
        // resolved `Participant.id` instead (the old `_resolvedParticipantId`
        // path) broke the "I reacted" highlight for the 2nd+ reaction in a
        // conversation, because the badge ownership check is `== currentUserId`.
        let participantId = currentUserId
        let alreadyReacted = messages[idx].reactions.contains { $0.emoji == emoji && $0.participantId == participantId }
        let convId = conversationId
        // Resolve the canonical server id so the queue replays against the
        // real backend message, not the optimistic in-memory placeholder.
        let remoteId = serverId(for: messageId)

        if alreadyReacted {
            Task { [weak self] in
                try? await self?.messagePersistence.removeReaction(
                    localId: messageId, emoji: emoji, participantId: participantId
                )
            }
            // Wave 1 Task 3.6 — unified outbox replaces the legacy
            // ReactionQueue. `enqueueReaction` preserves the coalescing state
            // machine (add+remove cancels, idempotent dedup) and the
            // `OutboxFlusher` drives retry on the next reconnect tick.
            Task {
                try? await OfflineQueue.shared.enqueueReaction(
                    messageId: remoteId, emoji: emoji, action: .remove, conversationId: convId
                )
                // Draine l'outbox tout de suite : sans ca la reaction reste
                // `pending` jusqu'au prochain lancement / retour avant-plan de
                // l'app (seuls moments ou le flusher tourne) et n'atteint
                // jamais le serveur.
                await OutboxFlushTrigger.flushNow()
            }
        } else {
            // Multi-reactions (2026-08-18) : poser un emoji different S'EMPILE
            // avec mes reactions precedentes — plus jamais de swap (la cle
            // unique serveur porte le triplet message/participant/emoji). Le
            // retrait reste PAR emoji, via la branche alreadyReacted.
            // Marque la reaction comme "nouvelle" AVANT l'ecriture async : quand
            // le store observe l'ajout et re-rend la bulle, la nouvelle pill
            // verra `shouldAnimate == true` et jouera la comete. Un scroll
            // ulterieur (hors fenetre) ne la re-animera pas.
            ReactionAnimationGate.markAdded(messageId: messageId, emoji: emoji)
            let reactionId = UUID().uuidString
            Task { [weak self] in
                try? await self?.messagePersistence.appendReaction(
                    localId: messageId, reactionId: reactionId,
                    messageId: remoteId, participantId: participantId, emoji: emoji
                )
            }
            Task {
                try? await OfflineQueue.shared.enqueueReaction(
                    messageId: remoteId, emoji: emoji, action: .add, conversationId: convId
                )
                // Draine l'outbox tout de suite : sans ca la reaction reste
                // `pending` jusqu'au prochain lancement / retour avant-plan de
                // l'app (seuls moments ou le flusher tourne) et n'atteint
                // jamais le serveur.
                await OutboxFlushTrigger.flushNow()
            }
        }

    }

    // MARK: - Attachment Reactions (BUG2 A')

    /// Réagit à UNE image d'un message multi-images. Optimiste in-memory + emit
    /// direct socket (parité offline-queue différée, cf. spec) ; le cold-load REST
    /// re-fournit les réactions persistées. Cap 1 emoji/user/PJ (miroir
    /// message-level). La mutation de `messages` déclenche le reconfigure diffable
    /// → re-render de la bulle avec le nouveau reactionSummary.
    func toggleAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        guard let mIdx = messageIndex(for: messageId),
              let aIdx = messages[mIdx].attachments.firstIndex(where: { $0.id == attachmentId }) else { return }
        var summary = messages[mIdx].attachments[aIdx].reactionSummary ?? [:]
        var mine = messages[mIdx].attachments[aIdx].currentUserReactions ?? []
        let remoteId = serverId(for: messageId)

        if mine.contains(emoji) {
            summary[emoji] = max(0, (summary[emoji] ?? 1) - 1)
            if summary[emoji] == 0 { summary.removeValue(forKey: emoji) }
            mine.removeAll { $0 == emoji }
            messageSocket.removeAttachmentReaction(attachmentId: attachmentId, messageId: remoteId, emoji: emoji)
        } else {
            // Multi-reactions (2026-08-18) : les emojis s'empilent, par piece
            // jointe comme partout — plus jamais de swap. Le retrait reste par
            // emoji via la branche alreadyReacted.
            summary[emoji] = (summary[emoji] ?? 0) + 1
            mine.append(emoji)
            messageSocket.addAttachmentReaction(attachmentId: attachmentId, messageId: remoteId, emoji: emoji)
        }
        messages[mIdx].attachments[aIdx].reactionSummary = summary.isEmpty ? nil : summary
        messages[mIdx].attachments[aIdx].currentUserReactions = mine.isEmpty ? nil : mine
        // Persist the optimistic attachment-reaction through GRDB so it survives
        // a cold reload of the conversation — parité avec les réactions
        // message-level (appendReaction/removeReaction). Sans ce write-through la
        // pill optimiste vit uniquement en mémoire et disparaît dès que la conv
        // est rechargée (avant que le serveur ne re-broadcast le delta).
        persistAttachmentReactions(messageId: messageId, attachments: messages[mIdx].attachments)
    }

    /// Applique un delta serveur : remplace le reactionSummary (comptes
    /// autoritaires) de la pièce jointe. `currentUserReactions` reste géré côté
    /// client (optimiste) — limite multi-device connue, comme message-level.
    /// Lookup par `attachmentId` (server-unique), robuste au mapping local/server id.
    func applyAttachmentReactionDelta(attachmentId: String, reactionSummary: [String: Int]) {
        guard let mIdx = messages.firstIndex(where: { $0.attachments.contains { $0.id == attachmentId } }),
              let aIdx = messages[mIdx].attachments.firstIndex(where: { $0.id == attachmentId }) else { return }
        messages[mIdx].attachments[aIdx].reactionSummary = reactionSummary.isEmpty ? nil : reactionSummary
        // Le delta serveur est lui aussi persisté pour que le compte autoritaire
        // soit servi tel quel au prochain cold-load (sans attendre un refetch REST).
        persistAttachmentReactions(messageId: messages[mIdx].id, attachments: messages[mIdx].attachments)
    }

    /// Write-through des réactions par-image vers GRDB. Encode l'array
    /// d'attachments complet (les réactions sont des champs Codable de
    /// `MeeshyMessageAttachment`) et le passe à `updateAttachmentsJson`. Fire-and-forget
    /// (miroir du chemin `appendReaction`/`deleteAttachment`) : un échec d'écriture
    /// retombe sur la source de vérité serveur au prochain refetch.
    private func persistAttachmentReactions(messageId: String, attachments: [MeeshyMessageAttachment]) {
        let json = try? JSONEncoder().encode(attachments)
        Task { [weak self] in
            try? await self?.messagePersistence.updateAttachmentsJson(localId: messageId, attachmentsJson: json)
        }
    }

    // MARK: - Fetch Reaction Details

    func fetchReactionDetails(messageId: String) async {
        isLoadingReactions = true
        defer { isLoadingReactions = false }
        do {
            let result = try await reactionService.fetchDetails(messageId: serverId(for: messageId))
            reactionDetails = result.reactions
        } catch {
            reactionDetails = []
        }
    }

    // MARK: - Delete Message

    /// Matches the WhatsApp semantics: `local` hides the message for this
    /// device only (no server round-trip), `everyone` soft-deletes on the
    /// backend and broadcasts `message:deleted` to all recipients. The UI
    /// gates the `everyone` option on sender+time-window rules via
    /// `canDeleteForEveryone(_:)`.
    enum DeleteMode {
        case local
        case everyone
    }

    /// Pure predicate — delegated to `commandHandler` so the policy
    /// (own message + within the 2h window) lives in one place.
    func canDeleteForEveryone(_ message: Message, window: TimeInterval = 2 * 3600) -> Bool {
        commandHandler.canDeleteForEveryone(message, window: window)
    }

    func deleteMessage(messageId: String, mode: DeleteMode = .everyone) async {
        switch mode {
        case .local:
            // Optimistic: hide locally. LocallyHiddenMessagesStore persists
            // the hidden id; messagesByDate filters it out on next evaluation.
            // Reversible — an "Undo" affordance can call .unhide(messageId)
            // without any network round-trip.
            LocallyHiddenMessagesStore.shared.hide(messageId)
            // Invalidate the date-group cache so the next messagesByDate
            // recomputes without the hidden row.
            _messagesByDate = nil
        case .everyone:
            // A `.failed` message never reached the server — it has no real
            // serverId (`serverId(for:)` falls back to the local optimistic
            // id). A REST delete below would target that bogus id, get
            // rejected, and the catch's `markUndeleted` rollback would
            // resurrect the very message the user just tried to remove.
            // Route straight to the local-only purge instead.
            if let idx = messageIndex(for: messageId), messages[idx].deliveryStatus == .failed {
                // `retryMessage`'s media-retry path resets the message's
                // outbox row back to `.pending` while it (re)uploads, so a
                // `.failed` bubble can have a live pending send in flight at
                // the moment the user taps delete. Cancel it FIRST — a purely
                // local purge with no cancellation would let that pending row
                // dispatch and reach the server/other participants after the
                // sender believes the message is gone. No-op when there is no
                // pending row (the common case).
                await offlineQueue.cancelPendingSend(clientMessageId: messageId)
                // #4043 — `cancelPendingSend` only ever touches a `.pending`
                // row (the narrow in-flight-reset case above). The COMMON
                // case is a row already `.failed`/`.exhausted` (the original
                // send never succeeded, e.g. a location-only message,
                // #4039) — `cancelPendingSend` is a no-op for it, leaving it
                // to linger in the SyncPill forever even after the bubble
                // itself is gone. `clearSendMessageRow` reaches it too.
                await offlineQueue.clearSendMessageRow(clientMessageId: messageId)
                removeFailedMessage(messageId: messageId)
                return
            }
            // Optimistic: mark as deleted locally + blank content
            try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date())
            // Drop the starred snapshot so the Starred Messages list doesn't keep
            // surfacing a message that was deleted for everyone. Keyed by the
            // server id (StarredMessageSnapshot.id is the canonical message id).
            StarredMessagesStore.shared.remove(messageId: serverId(for: messageId))
            // Offline: route the delete through the durable outbox (flushed on
            // reconnect, T10) instead of losing it. `clientMessageId` is the
            // message's local id so deleting a still-unsent offline message
            // cancels its pending send (no wasted roundtrip). The delete sticks
            // locally and reconciles when online — no rollback on the offline path.
            if !networkMonitor.isOnline {
                try? await offlineQueue.enqueueDelete(OfflineDeletePayload(
                    messageId: serverId(for: messageId),
                    clientMessageId: messageId,
                    conversationId: conversationId
                ))
                return
            }
            do {
                try await messageService.delete(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Rollback: restore the message to a non-deleted state
                try? await messagePersistence.markUndeleted(localId: messageId)
                self.error = userFacingMessage(for: error)
            }
        }
    }

    // MARK: - Delete Attachment

    func deleteAttachment(messageId: String, attachmentId: String) async {
        guard let msgIdx = messageIndex(for: messageId) else { return }
        let message = messages[msgIdx]
        let isLastAttachment = message.attachments.count <= 1
        let hasTextContent = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        // If it's the only attachment AND no text content → delete the whole message
        if isLastAttachment && !hasTextContent {
            await deleteMessage(messageId: messageId)
            return
        }

        // Optimistic: remove attachment from local message via persistence
        let originalAttachments = message.attachments
        let updatedAttachments = originalAttachments.filter { $0.id != attachmentId }
        let updatedJson = try? JSONEncoder().encode(updatedAttachments)
        try? await messagePersistence.updateAttachmentsJson(localId: messageId, attachmentsJson: updatedJson)

        do {
            try await AttachmentService.shared.delete(attachmentId: attachmentId)
        } catch {
            // Revert on failure
            let originalJson = try? JSONEncoder().encode(originalAttachments)
            try? await messagePersistence.updateAttachmentsJson(localId: messageId, attachmentsJson: originalJson)
            self.error = userFacingMessage(for: error)
        }
    }

    // MARK: - Pin / Unpin Message

    func togglePin(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let wasPinned = messages[idx].pinnedAt != nil
        let previousPinnedAt = messages[idx].pinnedAt
        let previousPinnedBy = messages[idx].pinnedBy

        if wasPinned {
            // Optimistic unpin
            try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)

            do {
                try await messageService.unpin(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Revert
                try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: previousPinnedAt, pinnedBy: previousPinnedBy)
                self.error = userFacingMessage(for: error)
            }
        } else {
            // Optimistic pin
            let now = Date()
            let pinnedById = authManager.currentUser?.id
            try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: now, pinnedBy: pinnedById)

            do {
                try await messageService.pin(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Revert
                try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)
                self.error = userFacingMessage(for: error)
            }
        }
    }

    // MARK: - Consume View-Once Message

    /// View-once consumption. Delegates to `commandHandler` with the
    /// resolved server id — the handler runs the network call and the
    /// persistence write under one optimistic transaction. Returns `true`
    /// on success so the view can advance its UI (reveal + auto-dismiss
    /// timer); `false` keeps the bubble blurred.
    func consumeViewOnce(messageId: String) async -> Bool {
        await commandHandler.consumeViewOnce(messageId: messageId, serverId: serverId(for: messageId))
    }

    func evictViewOnceMedia(message: Message) {
        for attachment in message.attachments {
            let urls = [attachment.fileUrl, attachment.thumbnailUrl].compactMap { $0 }.filter { !$0.isEmpty }
            for urlStr in urls {
                Task {
                    let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString ?? urlStr
                    await CacheCoordinator.shared.images.remove(for: resolved)
                }
            }
        }
    }

    func markMessageAsConsumed(messageId: String) {
        // Write through persistence; the store observation will surface the
        // updated effectFlags (blurred) and cleared content to the view.
        Task { [weak self] in
            try? await self?.messagePersistence.markConsumed(localId: messageId)
        }
    }

    // MARK: - Edit Message

    func editMessage(messageId: String, newContent: String) async {
        let trimmed = newContent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Snapshot original content for rollback and edit history before
        // writing the optimistic update through persistence.
        let originalContent: String? = messageIndex(for: messageId).map { messages[$0].content }

        // Record history entry before overwriting (the backend does not
        // expose edit history, so we maintain it locally).
        if let original = originalContent, original != trimmed {
            EditHistoryStore.shared.recordRevision(
                messageId: serverId(for: messageId),
                previousContent: original
            )
        }

        // Le contenu change : ses traductions décrivent un texte qui n'existe
        // plus. Évincées AVANT l'optimiste pour que la bulle ne se re-rende
        // jamais avec le nouveau texte SOUS l'ancienne traduction.
        invalidateTranslations(for: messageId)

        // Optimistic update: write through persistence so the store
        // observation surfaces the change without a direct messages mutation.
        let editedAt = Date()
        try? await messagePersistence.markEdited(localId: messageId, newContent: trimmed, editedAt: editedAt)

        // Offline: route the edit through the durable outbox (flushed on
        // reconnect, T10) instead of losing it on the failed REST call.
        // `clientMessageId` is the message's local id so an edit of a
        // still-unsent offline message merges into its pending send. The
        // optimistic content + recorded history stay applied (no rollback).
        if !networkMonitor.isOnline {
            try? await offlineQueue.enqueueEdit(OfflineEditPayload(
                messageId: serverId(for: messageId),
                clientMessageId: messageId,
                content: trimmed,
                conversationId: conversationId
            ))
            return
        }

        editInProgress.insert(messageId)
        defer { editInProgress.remove(messageId) }

        do {
            _ = try await messageService.edit(messageId: serverId(for: messageId), content: trimmed)
        } catch {
            // Revert on failure — both the persisted content AND the history
            // entry we just wrote (so the user doesn't see a phantom
            // revision that never actually reached the server).
            if let original = originalContent {
                try? await messagePersistence.markEdited(localId: messageId, newContent: original, editedAt: editedAt)
                EditHistoryStore.shared.removeHistory(for: serverId(for: messageId))
            }
            self.error = userFacingMessage(for: error)
        }
    }

    /// History of prior revisions for a message, for the MessageDetailSheet
    /// "View edits" list. Resolves through `serverId(for:)` so the history
    /// keyed on the canonical id survives tempId → serverId reconciliation.
    func editRevisions(for messageId: String) -> [EditRevision] {
        EditHistoryStore.shared.revisions(for: serverId(for: messageId))
    }

    func isEditSaving(messageId: String) -> Bool {
        editInProgress.contains(messageId)
    }

    // MARK: - Report Message

    func reportMessage(messageId: String, reportType: String, reason: String?) async -> Bool {
        do {
            try await reportService.reportMessage(messageId: serverId(for: messageId), reportType: reportType, reason: reason)
            return true
        } catch {
            self.error = userFacingMessage(for: error)
            return false
        }
    }

    // MARK: - Location Sharing

    func startLiveLocation(latitude: Double, longitude: Double, durationMinutes: Int) {
        LocationService.shared.startLiveLocation(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            durationMinutes: durationMinutes
        )
    }

    func stopLiveLocation() {
        LocationService.shared.stopLiveLocation(conversationId: conversationId)
    }

    func updateLiveLocation(latitude: Double, longitude: Double, speed: Double? = nil, heading: Double? = nil) {
        LocationService.shared.updateLiveLocation(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            speed: speed, heading: heading
        )
    }
}
