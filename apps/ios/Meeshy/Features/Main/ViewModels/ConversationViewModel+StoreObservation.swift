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
// Responsabilité tenue ici : le PONT entre GRDB et `@Published var messages` —
// l'abonnement à `messageStore.messagesDidChange`, la fusion qui préserve les
// lignes optimistes non encore vues par l'instantané (`mergeIntoMessages`), la
// réconciliation `tempId → serverId` de l'outbox, le déchiffrement E2EE en
// mémoire et la cartographie `[APIMessage] → [Message]` hors acteur principal.
// C'est le SEUL site autorisé à écrire le tableau entier `messages`
// (`SingleSourceOfTruthTests` le mesure).

extension ConversationViewModel {

    // MARK: - Réconciliation des ids serveur

    /// Resolve the authoritative server id for an in-memory message. Falls
    /// back to the supplied id when no mapping exists (the message id is
    /// already a server id, e.g. messages received from other users).
    func serverId(for messageId: String) -> String {
        pendingServerIds[messageId] ?? messageId
    }

    /// Persist the current `messages` snapshot to the cache using server ids
    /// for every reconciled optimistic row, so a future cold-start REST fetch
    /// reconciles cleanly without producing duplicate `temp_…` / server-id
    /// pairs. Called after the socket reconciliation in `ConversationSocketHandler`.
    func persistMessagesUsingServerIds() async {
        let convId = conversationId
        let mapping = pendingServerIds
        // S11 — re-key any "Delete for me" hidden ids from the optimistic temp id
        // to the reconciled server id. The row's display id flips temp→server at
        // ack (toMessage = serverId ?? localId); without this the hidden-set
        // still holds the temp id, the filter (keyed on message.id) stops
        // matching, and the hidden message reappears (in-memory + at cold start).
        for (tempId, serverId) in mapping {
            LocallyHiddenMessagesStore.shared.migrate(from: tempId, to: serverId)
        }
        let snapshot = messages
        let rewritten: [Message] = snapshot.map { msg -> Message in
            guard let serverId = mapping[msg.id] else { return msg }
            // Message.id is `let` — copy via init with overridden id.
            return Message(
                id: serverId,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                content: msg.content,
                originalLanguage: msg.originalLanguage,
                messageType: msg.messageType,
                messageSource: msg.messageSource,
                isEdited: msg.isEdited,
                editedAt: msg.editedAt,
                deletedAt: msg.deletedAt,
                replyToId: msg.replyToId,
                storyReplyToId: msg.storyReplyToId,
                forwardedFromId: msg.forwardedFromId,
                forwardedFromConversationId: msg.forwardedFromConversationId,
                expiresAt: msg.expiresAt,
                effects: msg.effects,
                maxViewOnceCount: msg.maxViewOnceCount,
                viewOnceCount: msg.viewOnceCount,
                pinnedAt: msg.pinnedAt,
                pinnedBy: msg.pinnedBy,
                isEncrypted: msg.isEncrypted,
                encryptionMode: msg.encryptionMode,
                createdAt: msg.createdAt,
                updatedAt: msg.updatedAt,
                attachments: msg.attachments,
                reactions: msg.reactions,
                replyTo: msg.replyTo,
                forwardedFrom: msg.forwardedFrom,
                senderName: msg.senderName,
                senderUsername: msg.senderUsername,
                senderColor: msg.senderColor,
                senderAvatarURL: msg.senderAvatarURL,
                senderUserId: msg.senderUserId,
                deliveryStatus: msg.deliveryStatus,
                isMe: msg.isMe,
                deliveredToAllAt: msg.deliveredToAllAt,
                readByAllAt: msg.readByAllAt,
                deliveredCount: msg.deliveredCount,
                readCount: msg.readCount
            )
        }
        try? await CacheCoordinator.shared.messages.save(rewritten, for: convId)
    }

    // MARK: - MessageStore Observation (Task 1.3)

    /// Subscribes to `messageStore.messagesDidChange` so that GRDB-driven
    /// inserts/updates (optimistic sends, offline queue reconciliation) are
    /// reflected in `messages` without an explicit assignment at the call site.
    ///
    /// When the store emits a change, this method maps the `[MessageRecord]`
    /// snapshot to `[MeeshyMessage]`, replaces `messages`, and calls
    /// `objectWillChange` so SwiftUI re-renders.
    func subscribeToMessageStore() {
        storeObservation = messageStore.messagesDidChange
            .sink { [weak self] in
                // Defer to a fresh runloop tick via DispatchQueue.main.async — a
                // synchronous .receive(on: DispatchQueue.main) handler can fire
                // mid-view-update on the SwiftUI render runloop, which trips
                // "Publishing changes from within view updates" when @Published
                // self.messages is mutated. async-dispatch from any thread
                // guarantees the @Published mutation lands on a fresh runloop
                // iteration AFTER the current view body evaluation completes.
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.storeRefreshGeneration &+= 1
                    let generation = self.storeRefreshGeneration
                    let userId = self.currentUserId
                    let mapped = self.messageStore.domainMessages(currentUserId: userId)
                    // E2EE: encrypted DMs are persisted as ciphertext — the
                    // socket and REST ingestion paths both store `api.content`
                    // verbatim, so cleartext never touches disk. Decrypt the
                    // mapped snapshot in memory so every store-driven refresh
                    // surfaces readable content. Meeshy E2EE uses a per-peer
                    // symmetric key, so re-decrypting the same ciphertext on
                    // each refresh is idempotent and cheap.
                    let needsDecryption = self.isDirect
                        && mapped.contains { $0.isEncrypted && !$0.content.isEmpty }
                    guard needsDecryption else {
                        // Même slice, aucun `await` entre les deux : les
                        // métadonnées suivent l'id que la bulle vient de prendre.
                        self.rekeyLocalAudioMetadataToServerIds()
                        self.messages = self.mergeIntoMessages(mapped)
                        return
                    }
                    Task { @MainActor [weak self] in
                        guard let self else { return }
                        var decrypted = mapped
                        await self.decryptMessagesIfNeeded(&decrypted)
                        // Drop a stale decrypt that lost the race to a newer refresh.
                        guard generation == self.storeRefreshGeneration else { return }
                        self.rekeyLocalAudioMetadataToServerIds()
                        self.messages = self.mergeIntoMessages(decrypted)
                    }
                }
            }
    }

    /// Re-clé les métadonnées audio LOCALES quand l'écho serveur donne son id
    /// définitif à une bulle optimiste (#4948).
    ///
    /// La transcription faite SUR L'APPAREIL à l'arrêt de l'enregistrement est
    /// posée sous le `tempId` de la bulle (`attachLocalTranscriptions`). À
    /// l'accusé, `MessageRecord.toMessage` expose `serverId ?? localId` : la
    /// bulle mono-audio lit alors `messageTranscriptions[message.id]` sous l'id
    /// SERVEUR, la clé `tempId` n'est plus jamais consultée — et le karaoké
    /// disparaissait à l'instant précis où le message était confirmé, pour ne
    /// revenir qu'avec la transcription Whisper, plusieurs secondes plus tard.
    ///
    /// Ce sont les MÊMES métadonnées vues sous un autre nom : on RECOPIE, on
    /// n'écrase pas — une transcription serveur déjà arrivée sous l'id serveur
    /// fait autorité. Idempotent, donc rejouable à chaque publication.
    ///
    /// La table parcourue est `pendingServerIds` (une entrée par envoi de cette
    /// session), jamais la fenêtre : le coût est celui des envois, pas celui de
    /// l'historique affiché. Elle est renseignée AVANT l'écriture GRDB qui
    /// déclenche cette publication (`finalizeSuccessfulSend`, l'accusé socket,
    /// `OfflineQueue.retrySucceeded`), donc la correspondance est toujours là
    /// quand on en a besoin. `messageTranscriptionsByAttachment` n'a rien à
    /// re-clé : un `attachmentId` ne change pas.
    func rekeyLocalAudioMetadataToServerIds() {
        guard !pendingServerIds.isEmpty else { return }
        for (localId, serverId) in pendingServerIds where localId != serverId {
            if messageTranscriptions[serverId] == nil,
               let localTranscription = messageTranscriptions[localId] {
                messageTranscriptions[serverId] = localTranscription
            }
            if messageTranslatedAudios[serverId] == nil,
               let localAudios = messageTranslatedAudios[localId] {
                messageTranslatedAudios[serverId] = localAudios
            }
        }
    }

    /// Merges `incoming` messages into the current `messages` array, preserving
    /// any in-memory messages not yet reflected in the GRDB snapshot (e.g., a
    /// socket delivery that raced the REST load). Deduplicates by `id` so a
    /// message received from both the initial REST response and the socket
    /// never appears twice. Result is sorted by `createdAt`.
    ///
    /// Duplicate prevention: when a server ACK flips a message's display id from
    /// localId (e.g. "cid_…") to serverId (e.g. "mongo_…"), `incoming` contains
    /// the server-id version but the OLD optimistic row is still in `messages`
    /// under its original id. Without correction, the preserve-logic keeps the
    /// old row alongside the new one → duplicate bubble. `pendingServerIds`
    /// maps localId → serverId synchronously before `applyEvent` fires the GRDB
    /// refresh, so it is always populated in time.
    private func mergeIntoMessages(_ incoming: [Message]) -> [Message] {
        let incomingIds = Set(incoming.map(\.id))

        // Detect optimistic rows superseded by a server-ack id-flip:
        // if pendingServerIds maps msg.id → some id that IS in incoming, the
        // old optimistic row must not be preserved (it would duplicate the
        // acked row, which is already in incoming under the server id).
        let supersededIds = Set(messages.compactMap { msg -> String? in
            guard let sid = pendingServerIds[msg.id], incomingIds.contains(sid) else { return nil }
            return msg.id
        })

        let preserved = messages.filter { !incomingIds.contains($0.id) && !supersededIds.contains($0.id) }
        let result = preserved.isEmpty ? incoming : (incoming + preserved).sorted { $0.createdAt < $1.createdAt }

        // Diagnostic: log when a message disappears from the display unexpectedly.
        // Superseded rows (known id-flip) are EXPECTED drops and logged at info.
        // Unknown drops are bugs and logged at error.
        let beforeIds = Set(messages.map(\.id))
        let resultIds = Set(result.map(\.id))
        let allDroppedIds = beforeIds.subtracting(resultIds)
        if !allDroppedIds.isEmpty {
            let trueDrops = allDroppedIds.subtracting(supersededIds)
            if !trueDrops.isEmpty {
                let inFlight = messages.filter { trueDrops.contains($0.id) }
                    .filter { m in
                        let s = String(describing: m.deliveryStatus)
                        return s.contains("sending") || s.contains("clock") || s.contains("failed") || s.contains("sent") || s.contains("queued")
                    }
                Logger.messages.error("[ConversationViewModel][BUG1] merge DROPPED \(trueDrops.count) display row(s) before=\(self.messages.count) incoming=\(incoming.count) result=\(result.count) inFlightOrSent=\(inFlight.count) ids=\(trueDrops.sorted().prefix(8).joined(separator: ","))")
            }
            if !supersededIds.isEmpty {
                Logger.messages.info("[ConversationViewModel] merge suppressed \(supersededIds.count) superseded optimistic row(s) after server-ack id-flip ids=\(supersededIds.sorted().prefix(8).joined(separator: ","))")
            }
        }
        return result
    }

    /// Reconcile optimistic messages with their server-assigned ids when the
    /// unified `OfflineQueue` finally lands the send, and flip rows to
    /// `.failed` when the retry budget is exhausted. Without this mapping a
    /// `message:new` socket broadcast arrives with an unknown id and the
    /// optimistic row would stay stuck in `.sending` forever while a duplicate
    /// appears.
    ///
    /// Wave 1 Task 3.6 — collapsed onto the unified `OfflineQueue.retrySucceeded` /
    /// `.retryExhausted` / `.retryDropped` signals, replacing the legacy
    /// per-queue publishers from `MessageRetryQueue` and `ReactionQueue`.
    func subscribeToQueueReconciliation() {
        // Wave 1 Task 3.6 — unified `OfflineQueue.retrySucceeded` covers both
        // message-centric (sendMessage/edit/delete) and reaction
        // (sendReaction) outbox kinds. We only act on `.sendMessage` here
        // because that's the only kind that produces a server-assigned id
        // worth reconciling with the optimistic local id. Reaction success
        // is a no-op at the ViewModel level — the `reaction:added` /
        // `reaction:removed` socket broadcast keeps every client in sync.
        OfflineQueue.shared.retrySucceeded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self, payload.conversationId == self.conversationId else { return }
                guard payload.kind == .sendMessage else { return }
                pendingServerIds[payload.tempId] = payload.serverId
                let localId = payload.tempId
                let serverId = payload.serverId
                Task { [weak self] in
                    _ = try? await self?.messagePersistence.applyEvent(
                        localId: localId,
                        event: .serverAck(serverId: serverId, at: Date())
                    )
                }
            }
            .store(in: &cancellables)

        // Unified terminal-failure signal — fires both for message sends
        // exhausted by `OutboxFlusher` (5 attempts) and for reactions that
        // the dispatcher rejected permanently (404/409/410). We dispatch on
        // `kind` to apply the right rollback strategy.
        OfflineQueue.shared.retryExhausted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                Task { [weak self] in await self?.handleRetryExhausted(payload) }
            }
            .store(in: &cancellables)
    }

    /// Reconcile an outbox row that the `OutboxFlusher` escalated to
    /// `.exhausted` (5 attempts, or a permanent dispatcher rejection). We
    /// dispatch on `kind` to apply the right rollback so the optimistic local
    /// state does not diverge from the server forever. Scoped to THIS
    /// conversation. Extracted from the Combine sink so it is directly
    /// awaitable in tests.
    func handleRetryExhausted(_ payload: OfflineRetryExhausted) async {
        guard payload.conversationId == self.conversationId else { return }
        switch payload.kind {
        case .sendMessage:
            _ = try? await messagePersistence.applyEvent(
                localId: payload.tempId, event: .retryExhausted
            )
        case .sendReaction:
            guard let reaction = payload.reaction else { return }
            // Same canonical sentinel the optimistic add used (see toggleReaction):
            // the rollback must match the key that was actually written.
            let participantId = currentUserId
            let localId = reaction.messageId
            let emoji = reaction.emoji
            switch reaction.action {
            case .add:
                // Optimistic add failed permanently — remove the reaction we wrote.
                try? await messagePersistence.removeReaction(
                    localId: localId, emoji: emoji, participantId: participantId
                )
            case .remove:
                // Optimistic remove failed permanently — restore the reaction we erased.
                let remoteId = serverId(for: localId)
                try? await messagePersistence.appendReaction(
                    localId: localId, reactionId: UUID().uuidString,
                    messageId: remoteId, participantId: participantId, emoji: emoji
                )
            }
        case .editMessage:
            // S3 — an offline edit that exhausted its retries never reached the
            // server; restore the pre-edit content (captured in EditHistoryStore
            // when the edit was applied) and drop the phantom revision. Mirrors
            // the online edit rollback in `editMessage`.
            let localId = payload.tempId
            let canonicalId = serverId(for: localId)
            if let original = EditHistoryStore.shared.revisions(for: canonicalId).last?.content {
                try? await messagePersistence.markEdited(
                    localId: localId, newContent: original, editedAt: Date()
                )
                EditHistoryStore.shared.removeHistory(for: canonicalId)
            }
        case .deleteMessage:
            // S3 — an offline delete that exhausted never reached the server;
            // un-delete locally so the message stops showing as deleted on this
            // device only. Mirrors the online delete rollback (`markUndeleted`).
            try? await messagePersistence.markUndeleted(localId: payload.tempId)
        default:
            // Other outbox kinds (blockUser, friendRequest, etc.) reconcile
            // through their own dedicated ViewModels.
            break
        }
    }

    // MARK: - Message Processing Pipeline

    func processAPIMessages(_ apiMessages: [APIMessage]) async -> [Message] {
        let userId = currentUserId
        let username = currentUsername
        // Le prisme ORDONNÉ du lecteur, par lequel la CITATION portée par
        // chaque message descend le Prisme au moment de la conversion (#4945).
        // Lu ICI, sur le MainActor : ce qui traverse vers la tâche fille est
        // un `[String]` (Sendable), jamais le modèle.
        let readerPrism = preferredLanguages
        // Decode + map the API payload off the main actor. `toMessage` decodes
        // each message's translations / attachments / reactions; for a
        // multi-hundred-message conversation load that is real CPU that would
        // otherwise stutter the UI. `[APIMessage]` in and `[MeeshyMessage]` out
        // are both Sendable, so the hop is clean.
        var msgs = await Task.detached(priority: .userInitiated) {
            apiMessages.reversed().map {
                $0.toMessage(
                    currentUserId: userId, currentUsername: username,
                    preferredLanguages: readerPrism
                )
            }
        }.value
        await decryptMessagesIfNeeded(&msgs)
        extractAttachmentTranscriptions(from: apiMessages)
        extractTextTranslations(from: apiMessages)
        return msgs
    }

    // MARK: - Decryption

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        guard isDirect else { return }

        let payloads: [DecryptionPayload] = msgs.compactMap { msg in
            guard msg.isEncrypted, !msg.senderId.isEmpty,
                  !msg.content.isEmpty,
                  let data = Data(base64Encoded: msg.content)
            else { return nil }
            return DecryptionPayload(messageId: msg.id, senderId: msg.senderId, ciphertext: data)
        }
        guard !payloads.isEmpty else { return }

        let results = await decryptionActor.decrypt(payloads)
        let resultsByMessageId = Dictionary(uniqueKeysWithValues: results.map { ($0.messageId, $0) })

        for i in msgs.indices {
            if let plaintext = resultsByMessageId[msgs[i].id]?.plaintext {
                msgs[i].content = plaintext
            }
        }
    }
}
