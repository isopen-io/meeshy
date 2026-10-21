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

    /// Favori LOCAL (le backend n'expose pas d'étoile au niveau du message) : l'instantané est celui que
    /// `StarredMessagesView` rend, avec la traduction que le lecteur a réellement sous les yeux.
    @discardableResult
    func toggleStar(messageId: String, conversationName: String? = nil, conversationAccentColor: String? = nil) -> Bool {
        guard let idx = messageIndex(for: messageId) else { return false }
        return StarredMessagesStore.shared.toggle(StarredSnapshotFactory.snapshot(
            of: messages[idx],
            canonicalId: serverId(for: messageId),
            conversationId: conversationId,
            conversationName: conversationName,
            conversationAccentColor: conversationAccentColor,
            translatedPreview: preferredTranslation(for: messageId)?.translatedContent,
            now: Date()
        ))
    }

    func isStarred(messageId: String) -> Bool {
        StarredMessagesStore.shared.isStarred(messageId: serverId(for: messageId))
    }

    // MARK: - Toggle Reaction

    func toggleReaction(messageId: String, emoji: String) {
        guard commands.consumeReactionToken() else { return }
        // Un message système n'est pas réactable (le gateway rejette aussi en 400).
        guard let idx = messageIndex(for: messageId), messages[idx].messageSource != .system else { return }

        // Mes réactions sont TOUJOURS clées par la sentinelle `currentUserId` : c'est ce que
        // `summarizeReactions` et `reconstructFromSummary` comparent pour le « j'ai réagi ».
        let participantId = currentUserId
        // L'id serveur canonique, pour que la file rejoue contre le vrai message.
        let remoteId = serverId(for: messageId)
        let alreadyReacted = messages[idx].reactions.contains { $0.emoji == emoji && $0.participantId == participantId }
        guard alreadyReacted else {
            commands.addReaction(localId: messageId, remoteId: remoteId, participantId: participantId, emoji: emoji)
            return
        }
        commands.removeReaction(localId: messageId, remoteId: remoteId, participantId: participantId, emoji: emoji)
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
        // Multi-reactions (2026-08-18) : les emojis s'empilent, par piece
        // jointe comme partout — plus jamais de swap. La bascule vit dans
        // `AttachmentReactionToggle`, partagée avec la pièce hors fenêtre (#9910).
        let outcome = AttachmentReactionToggle.apply(
            emoji,
            summary: messages[mIdx].attachments[aIdx].reactionSummary,
            mine: messages[mIdx].attachments[aIdx].currentUserReactions
        )
        emitAttachmentReaction(outcome, attachmentId: attachmentId, remoteMessageId: serverId(for: messageId), emoji: emoji)
        messages[mIdx].attachments[aIdx].reactionSummary = outcome.summary
        messages[mIdx].attachments[aIdx].currentUserReactions = outcome.mine
        derived.invalidateVisualAttachments()
        // Persist the optimistic attachment-reaction through GRDB so it survives
        // a cold reload of the conversation — parité avec les réactions
        // message-level (appendReaction/removeReaction). Sans ce write-through la
        // pill optimiste vit uniquement en mémoire et disparaît dès que la conv
        // est rechargée (avant que le serveur ne re-broadcast le delta).
        persistAttachmentReactions(messageId: messageId, attachments: messages[mIdx].attachments)
    }

    /// **Réagir à une pièce que SEUL l'index des médias porte** (#9910) — son
    /// porteur est hors de la fenêtre chargée, donc absent de `messages`. La
    /// bascule est la MÊME ; l'émission part sur l'identifiant serveur du
    /// porteur (l'index ne tient que des messages servis). La bascule est
    /// rendue à l'hôte, qui repeint l'index (`ConversationMediaCatalog`).
    @discardableResult
    func toggleAttachmentReaction(outOfWindow piece: MessageAttachment, carrierId: String, emoji: String) -> AttachmentReactionToggle.Outcome {
        let outcome = AttachmentReactionToggle.apply(emoji, summary: piece.reactionSummary, mine: piece.currentUserReactions)
        emitAttachmentReaction(outcome, attachmentId: piece.id, remoteMessageId: carrierId, emoji: emoji)
        return outcome
    }

    private func emitAttachmentReaction(_ outcome: AttachmentReactionToggle.Outcome, attachmentId: String,
                                        remoteMessageId: String, emoji: String) {
        if outcome.added {
            messageSocket.addAttachmentReaction(attachmentId: attachmentId, messageId: remoteMessageId, emoji: emoji)
        } else {
            messageSocket.removeAttachmentReaction(attachmentId: attachmentId, messageId: remoteMessageId, emoji: emoji)
        }
    }

    /// Applique un delta serveur : remplace le reactionSummary (comptes
    /// autoritaires) de la pièce jointe. `currentUserReactions` reste géré côté
    /// client (optimiste) — limite multi-device connue, comme message-level.
    /// Lookup par `attachmentId` (server-unique), robuste au mapping local/server id.
    func applyAttachmentReactionDelta(attachmentId: String, reactionSummary: [String: Int]) {
        guard let mIdx = messages.firstIndex(where: { $0.attachments.contains { $0.id == attachmentId } }),
              let aIdx = messages[mIdx].attachments.firstIndex(where: { $0.id == attachmentId }) else { return }
        messages[mIdx].attachments[aIdx].reactionSummary = reactionSummary.isEmpty ? nil : reactionSummary
        derived.invalidateVisualAttachments()
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

    /// `local` retire le message de la vue de CE lecteur, sur tous ses appareils (#11221) ; `everyone` le supprime côté
    /// serveur et diffuse `message:deleted`. L'UI conditionne `everyone` à `canDeleteForEveryone(_:)`.
    typealias DeleteMode = MessageDeleteMode

    func canDeleteForEveryone(_ message: Message) -> Bool {
        commands.canDeleteForEveryone(message)
    }

    func deleteMessage(messageId: String, mode: DeleteMode = .everyone) async {
        // Un message `.failed` n'a pas d'id serveur : une requête viserait un id bidon et son
        // rollback ressusciterait le message. Retrait local seulement, outbox annulée d'abord.
        guard outgoingState(of: messageId)?.isFailed != true else {
            await commands.withdrawUnsent(messageId: messageId)
            removeFailedMessage(messageId: messageId)
            return
        }
        switch mode {
        case .local:
            report(await commands.deleteForMe(messageId: messageId, serverId: serverId(for: messageId)) { await self.restoreMessagesForMe(ids: [$0]) })
        case .everyone:
            report(await commands.deleteForEveryone(messageId: messageId, serverId: serverId(for: messageId)))
        }
    }

    /// **Retirer le message d'un AUTRE, avec son motif** (#11151).
    func removeMessage(messageId: String, reason: String) async {
        report(await commands.removeForModeration(
            messageId: messageId, serverId: serverId(for: messageId), reason: reason
        ))
    }

    private func report(_ failure: ConversationCommandFailure?) {
        guard let failure else { return }
        error = failure.userMessage
    }

    // MARK: - Delete Attachment

    func deleteAttachment(messageId: String, attachmentId: String) async {
        guard let msgIdx = messageIndex(for: messageId) else { return }
        let message = messages[msgIdx]
        let hasTextContent = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard message.attachments.count > 1 || hasTextContent else {
            await deleteMessage(messageId: messageId)
            return
        }
        report(await commands.removeAttachment(
            messageId: messageId, attachmentId: attachmentId, original: message.attachments
        ))
    }

    // MARK: - Pin / Unpin Message

    func togglePin(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let previous = MessagePinState(pinnedAt: messages[idx].pinnedAt, pinnedBy: messages[idx].pinnedBy)
        report(await commands.togglePin(
            messageId: messageId, serverId: serverId(for: messageId),
            previous: previous, currentUserId: authManager.currentUser?.id
        ))
    }

    // MARK: - Consume View-Once Message

    /// View-once consumption. Delegates to `commands` with the
    /// resolved server id — the handler runs the network call and the
    /// persistence write under one optimistic transaction. Returns `true`
    /// on success so the view can advance its UI (reveal + auto-dismiss
    /// timer); `false` keeps the bubble blurred.
    ///
    /// #7579 — l'ouverture se grave D'ABORD sur cet appareil, contenu purgé :
    /// ce lecteur a vu le message, et ce qu'il a vu ne doit plus être relisible
    /// ici, que le serveur réponde ou non.
    func consumeViewOnce(messageId: String) async -> Bool {
        await markViewOnceOpenedLocally(messageId: messageId)
        return await commands.consumeViewOnce(messageId: messageId, serverId: serverId(for: messageId))
    }

    func evictViewOnceMedia(message: Message) {
        for attachment in message.attachments {
            let urls = [attachment.fileUrl, attachment.thumbnailUrl].compactMap { $0 }.filter { !$0.isEmpty }
            for urlStr in urls {
                Task {
                    let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString ?? urlStr
                    await CacheCoordinator.shared.images.remove(for: resolved)
                    await CacheCoordinator.shared.video.remove(for: resolved)
                    await CacheCoordinator.shared.audio.remove(for: resolved)
                }
            }
        }
    }


    // MARK: - Edit Message

    func editMessage(messageId: String, newContent: String) async {
        let originalContent = messageIndex(for: messageId).map { messages[$0].content }
        report(await commands.editMessage(
            messageId: messageId, serverId: serverId(for: messageId), content: newContent,
            originalContent: originalContent,
            beforeOptimisticWrite: { self.invalidateTranslations(for: messageId) }
        ))
    }

    /// History of prior revisions for a message, for the MessageDetailSheet
    /// "View edits" list. Resolves through `serverId(for:)` so the history
    /// keyed on the canonical id survives tempId → serverId reconciliation.
    func editRevisions(for messageId: String) -> [EditRevision] {
        EditHistoryStore.shared.revisions(for: serverId(for: messageId))
    }

    // MARK: - Report Message

    func reportMessage(messageId: String, reportType: String, reason: String?) async -> Bool {
        do {
            try await reportService.reportMessage(messageId: serverId(for: messageId), reportType: reportType, reason: reason)
            return true
        } catch {
            self.error = ConversationErrorText.message(for: error)
            return false
        }
    }
}
