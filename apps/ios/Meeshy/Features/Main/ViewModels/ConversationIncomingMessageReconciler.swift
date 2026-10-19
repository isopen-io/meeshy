import Foundation
import MeeshySDK
import os

/// Réconcilie un `message:new` entrant avec ce que le fil détient déjà :
/// écho d'une ligne optimiste, doublon, écho d'un autre appareil, message
/// d'un tiers (signaux d'interface + persistance). Possède la table de
/// déduplication — elle n'a pas d'autre lecteur.
///
/// Extrait de `ConversationSocketHandler` (qui garde l'abonnement et délègue
/// ici) : même isolation, même ordre des effets.
@MainActor
final class ConversationIncomingMessageReconciler {
    nonisolated deinit {}

    private let currentUserId: String
    private let delegateProvider: () -> ConversationSocketDelegate?
    private let persistenceProvider: () -> MessagePersistenceActor?
    private let onSenderStoppedTyping: (String) -> Void

    init(
        currentUserId: String,
        delegateProvider: @escaping () -> ConversationSocketDelegate?,
        persistenceProvider: @escaping () -> MessagePersistenceActor?,
        onSenderStoppedTyping: @escaping (String) -> Void
    ) {
        self.currentUserId = currentUserId
        self.delegateProvider = delegateProvider
        self.persistenceProvider = persistenceProvider
        self.onSenderStoppedTyping = onSenderStoppedTyping
    }

    // Message deduplication: combined count + time-based eviction.
    // Tracks messageId → timestamp so:
    //   • Entries older than dedupMaxAge are always evictable (prevents stale
    //     entries from blocking legitimate re-delivers after long gaps).
    //   • When the table exceeds dedupMaxSize the oldest half is pruned
    //     to keep memory bounded even during reconnect bursts.
    // TTL matches the server-side delivery queue retention (48h) so messages
    // queued while offline for up to 48h cannot replay after cache eviction.
    private static let dedupMaxSize: Int = 10_000
    private static let dedupMaxAge: TimeInterval = 48 * 60 * 60 // 48 hours — matches DELIVERY_QUEUE_TTL_SECONDS
    private var recentMessageTimestamps: [String: Date] = [:]

    // MARK: - Deduplication

    private func markSeen(_ messageId: String) {
        guard recentMessageTimestamps[messageId] == nil else { return }
        recentMessageTimestamps[messageId] = Date()
        if recentMessageTimestamps.count > Self.dedupMaxSize {
            evictDedup()
        }
    }

    private func wasSeen(_ messageId: String) -> Bool {
        recentMessageTimestamps[messageId] != nil
    }

    private func evictDedup() {
        let cutoff = Date().addingTimeInterval(-Self.dedupMaxAge)
        recentMessageTimestamps = recentMessageTimestamps.filter { $0.value > cutoff }
        guard recentMessageTimestamps.count > Self.dedupMaxSize else { return }
        let sorted = recentMessageTimestamps.sorted { $0.value < $1.value }
        let excessCount = recentMessageTimestamps.count - Self.dedupMaxSize / 2
        for (key, _) in sorted.prefix(excessCount) {
            recentMessageTimestamps.removeValue(forKey: key)
        }
    }

    // MARK: - Reconciliation

    func reconcile(_ apiMsg: APIMessage) async {
        guard let delegate = delegateProvider() else { return }
        let userId = currentUserId


        // RC2.3 — reconcile an optimistic echo by `clientMessageId`.
        // The optimistic row's localId IS the `cid_*` (Phase 4
        // contract), so `messageIndex(for: cid)` resolves it
        // directly — independent of `pendingServerIds`, which is
        // only populated AFTER the REST POST returns. A broadcast
        // that raced ahead of the ACK used to miss the map, fall
        // into the `senderId == userId` branch and get dropped
        // (Sprint 2 RC2.3b). The serverId scan stays as a
        // retro-compat fallback for payloads without a cid.
        let reconcileTempId: String? = {
            if let cid = apiMsg.clientMessageId, !cid.isEmpty,
               delegate.messageIndex(for: cid) != nil {
                return cid
            }
            return delegate.pendingServerIds.first(where: { $0.value == apiMsg.id })?.key
        }()

        // Atomic in-place upgrade of an optimistic row. We DO NOT
        // swap the SwiftUI `id` (that would unmount the bubble and
        // flash). Instead we mutate the server-derived fields on
        // the existing struct so the ForEach key stays the
        // optimistic `tempId`.
        if apiMsg.senderId == userId, let tempId = reconcileTempId,
           let optimisticIdx = delegate.messageIndex(for: tempId) {
            // Capture the optimistic plaintext BEFORE the await
            // below — `delegate.messages` (and therefore this
            // index) can change across the suspension point.
            let optimisticContent = delegate.messages[optimisticIdx].content
            let decoded = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username, preferredLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [])
            var msgArray = [decoded]
            await delegate.decryptMessagesIfNeeded(&msgArray)
            guard let serverMsg = msgArray.first else { return }
            // For an own E2EE message we keep the OPTIMISTIC
            // plaintext: the server echo only carries ciphertext,
            // and there is no E2EE session to decrypt our OWN
            // message with (sessions are keyed by the peer, never
            // self) — so `serverMsg.content` is still ciphertext.
            // An own message's content never legitimately changes
            // on server-ACK, so the optimistic row is the
            // authoritative readable copy. Without this the bubble
            // would flip plaintext → base64 ciphertext on echo.
            let reconciledContent: String? = (apiMsg.isEncrypted == true)
                ? optimisticContent
                : serverMsg.content
            // La correspondance `cid → serverId` AVANT l'écriture, comme l'envoi REST : la
            // publication suivante du store rend la ligne sous son id serveur, et sans elle
            // `mergeIntoMessages` gardait la ligne optimiste à côté — deux bulles pour un
            // message, jusqu'à la réponse REST (ou pour la session si elle échouait).
            delegate.pendingServerIds[tempId] = apiMsg.id
            // Persist server ACK (state machine) via actor — store
            // observation will surface the delivery-status change.
            if let persistence = persistenceProvider() {
                do {
                    _ = try await persistence.applyEvent(
                        localId: tempId,
                        event: .serverAck(serverId: apiMsg.id, at: serverMsg.updatedAt)
                    )
                    Logger.messages.info("SendFlow PENDING->SENT (socket broadcast) tempId=\(tempId, privacy: .public) serverId=\(apiMsg.id, privacy: .public) transport=broadcast")
                } catch {
                    Logger.messages.error("Persistence serverAck failed: \(error, privacy: .public) tempId=\(tempId, privacy: .public)")
                }
                // Persist server-confirmed content/attachments/reactions
                // so the store snapshot reflects ground-truth values.
                // `nil` attachments/reactions are preserved by
                // `updateServerAckedFields` (COALESCE) so a media
                // echo that races server-side processing never
                // blanks the optimistic preview.
                let attachmentsJson = serverMsg.attachments.isEmpty ? nil
                    : try? JSONEncoder().encode(serverMsg.attachments)
                let reactionsJson = serverMsg.reactions.isEmpty ? nil
                    : try? JSONEncoder().encode(serverMsg.reactions)
                do {
                    try await persistence.updateServerAckedFields(
                        localId: tempId,
                        content: reconciledContent,
                        attachmentsJson: attachmentsJson,
                        reactionsJson: reactionsJson,
                        pinnedAt: serverMsg.pinnedAt,
                        pinnedBy: serverMsg.pinnedBy,
                        isEdited: serverMsg.isEdited,
                        editedAt: serverMsg.editedAt,
                        deletedAt: serverMsg.deletedAt,
                        deliveredCount: serverMsg.deliveredCount,
                        readCount: serverMsg.readCount,
                        deliveredToAllAt: serverMsg.deliveredToAllAt,
                        readByAllAt: serverMsg.readByAllAt,
                        updatedAt: serverMsg.updatedAt
                    )
                } catch {
                    Logger.messages.error("Persistence updateServerAckedFields failed: \(error, privacy: .public) tempId=\(tempId, privacy: .public)")
                }
            }
            // Persist using server id so a future cold-start REST
            // fetch reconciles cleanly without duplicates.
            await delegate.persistMessagesUsingServerIds()
            return
        }

        if delegate.containsMessage(id: apiMsg.id) {
            if apiMsg.senderId == userId,
               let socketAttachments = apiMsg.attachments, !socketAttachments.isEmpty,
               let idx = delegate.messageIndex(for: apiMsg.id) {
                let existing = delegate.messages[idx]
                // `.slow` is a still-pending optimistic row (failed
                // once, retrying via the outbox) — like `.sending`,
                // its attachment data is local and must be refreshed
                // from the authoritative socket echo.
                let hasNewData = existing.attachments.count != socketAttachments.count
                    || existing.deliveryStatus == .sending
                    || existing.deliveryStatus == .slow
                if hasNewData, let persistence = persistenceProvider() {
                    // Write refreshed attachment data through persistence;
                    // store observation surfaces the update to the view.
                    let refreshed = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username, preferredLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [])
                    let attachmentsJson = try? JSONEncoder().encode(refreshed.attachments)
                    do {
                        try await persistence.updateAttachmentsJson(
                            localId: existing.id,
                            attachmentsJson: attachmentsJson
                        )
                    } catch {
                        Logger.messages.error("Persistence updateAttachmentsJson failed: \(error, privacy: .public) messageId=\(existing.id, privacy: .public)")
                    }
                }
            }
            return
        }

        if wasSeen(apiMsg.id) { return }
        markSeen(apiMsg.id)

        // An own echo reaching this point means no in-memory
        // optimistic row matched (branch A missed it).
        //  - WITH clientMessageId: safe to persist —
        //    `upsertFromAPIMessages` reconciles the GRDB optimistic
        //    row by cid (PK lookup), or inserts cleanly when it is a
        //    genuine send from another of this user's devices.
        //  - WITHOUT clientMessageId: an echo from the REST
        //    broadcast path (`MeeshySocketIOManager._broadcastNewMessage`
        //    omits the cid). Our optimistic row will be reconciled
        //    by the REST ACK; persisting here cannot match it and
        //    would insert a DUPLICATE row. Drop it — the legacy
        //    behaviour was correct for this specific case.
        let isOwnEcho = apiMsg.senderId == userId
        // System messages (e.g. call summaries) are server-generated.
        // The `message:new` socket BROADCAST omits `clientMessageId`
        // (MeeshySocketIOManager._broadcastNewMessage), yet the
        // initiator IS the attributed sender — so they'd be dropped
        // here as a cid-less own echo, leaving the caller without a
        // realtime call bubble until the next REST sync. They dedup by
        // serverId in upsertFromAPIMessages, so letting them through is
        // safe.
        let isSystemMessage = apiMsg.messageSource == "system"
        if isOwnEcho, !isSystemMessage, (apiMsg.clientMessageId ?? "").isEmpty {
            return
        }

        // RC2.2 — persist the FULL APIMessage through the same path
        // REST uses. `bufferIncomingAPIMessages` →
        // `upsertFromAPIMessages` writes attachments, reactions,
        // reply/forward refs, encryption flags and mentions. The
        // legacy 6-field `IncomingMessageData` dropped every one of
        // them — a media-only or encrypted message received via
        // socket rendered as an empty bubble.
        if let persistence = persistenceProvider() {
            await persistence.bufferIncomingAPIMessages([apiMsg], preferredLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser))
        }

        // Own message from another device — persisted above;
        // nothing is "unread" for us, so skip the badge / read.
        if isOwnEcho { return }

        // Inbound message from someone else. Decode + decrypt only
        // for the transient UI signals (scroll-to-bottom preview) —
        // the persisted row stays ciphertext on disk and the
        // display pipeline decrypts it.
        let decoded = apiMsg.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username, preferredLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [])
        var msgArray = [decoded]
        await delegate.decryptMessagesIfNeeded(&msgArray)
        guard let msg = msgArray.first else { return }

        // UI signals: unread badge anchor + auto mark-as-read.
        delegate.lastUnreadMessage = msg

        if let sender = apiMsg.sender {
            onSenderStoppedTyping(sender.id)
        }

        // Un message entrant n'est PAS marqué lu à l'arrivée, même
        // app active et viewport en bas : être abonné au socket dit
        // que l'utilisateur POUVAIT le voir, pas qu'il l'a vu. Sa
        // bulle passera par l'observateur de visibilité comme les
        // autres — seuil de présence, ou promotion immédiate quand
        // le bas est atteint (`MessageListViewController.flushSeenNow`).

        // mark-as-received is handled globally by ConversationListViewModel
    }
}
