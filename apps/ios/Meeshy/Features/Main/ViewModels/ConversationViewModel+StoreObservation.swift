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
        let rewritten = MessageServerIdRekey.rewrite(messages, mapping: mapping)
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

    /// Re-clé les métadonnées audio LOCALES quand l'écho serveur donne son id définitif à une bulle
    /// optimiste (#4948) : sans cela le karaoké disparaît à l'instant où le message est confirmé. La table
    /// parcourue est `pendingServerIds` (les envois de cette session), renseignée AVANT l'écriture GRDB.
    func rekeyLocalAudioMetadataToServerIds() {
        guard !pendingServerIds.isEmpty else { return }
        adoptAudioMetadata(AttachmentAudioMetadata.rekeyed(audioMetadataState, mapping: pendingServerIds))
    }

    /// Fusionne le snapshot du store dans `messages` (`ConversationMessageMerge`), puis repose les révélations
    /// de vue unique et les combustions en cours, qui vivent chez l'hôte.
    private func mergeIntoMessages(_ incoming: [Message]) -> [Message] {
        let outcome = ConversationMessageMerge.merge(current: messages, incoming: incoming, pendingServerIds: pendingServerIds)
        let result = applyingEphemeralBurns(applyingViewOnceReveals(outcome.messages))
        let drops = ConversationMessageMerge.drops(before: messages, after: result, superseded: outcome.superseded)
        guard !drops.all.isEmpty else { return result }
        if !drops.unexpected.isEmpty {
            Logger.messages.error("[ConversationViewModel][BUG1] merge DROPPED \(drops.unexpected.count) display row(s) before=\(self.messages.count) incoming=\(incoming.count) result=\(result.count) inFlightOrSent=\(drops.inFlightOrSent) ids=\(drops.unexpected.sorted().prefix(8).joined(separator: ","))")
        }
        if !outcome.superseded.isEmpty {
            Logger.messages.info("[ConversationViewModel] merge suppressed \(outcome.superseded.count) superseded optimistic row(s) after server-ack id-flip ids=\(outcome.superseded.sorted().prefix(8).joined(separator: ","))")
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
        guard payload.kind != .sendMessage else {
            _ = try? await messagePersistence.applyEvent(localId: payload.tempId, event: .retryExhausted)
            return
        }
        await commands.compensate(payload, currentUserId: currentUserId, serverId: { self.serverId(for: $0) })
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
        let resultsByMessageId = Dictionary(results.map { ($0.messageId, $0) }, uniquingKeysWith: { first, _ in first })

        for i in msgs.indices {
            if let plaintext = resultsByMessageId[msgs[i].id]?.plaintext {
                msgs[i].content = plaintext
            }
        }
        DecryptedMessageLedger.shared.record(results.filter { $0.plaintext != nil }.map(\.messageId))
    }
}
