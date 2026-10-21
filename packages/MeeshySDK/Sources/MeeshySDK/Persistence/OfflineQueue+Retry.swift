import Foundation
import Combine
import GRDB
import os

extension OfflineQueue {
    // MARK: - Manual Retry (Phase 4 prereq)

    /// Manually retries an outbox row that has previously failed or exhausted
    /// its retry budget. Resets `attempts` to 0, clears `lastError`, flips
    /// `status` back to `.pending`, and schedules `nextAttemptAt` for
    /// immediate retry on the flusher's next pass.
    ///
    /// Throws `OfflineQueueError.itemNotFound` if no row exists for
    /// `outboxId`. Throws `OfflineQueueError.poolNotConfigured` if
    /// `configure(pool:)` was never called.
    public func retryItem(_ outboxId: String) async throws {
        guard let pool = outboxPool else {
            throw OfflineQueueError.poolNotConfigured
        }

        // Une panne de lecture est propagée telle quelle : la faire passer
        // pour `.itemNotFound` mentait à l'appelant sur la cause réelle.
        let record = try await pool.read { db in
            try OutboxRecord.fetchOne(db, key: outboxId)
        }

        guard let record else {
            throw OfflineQueueError.itemNotFound
        }
        // **Une ligne de commentaire ne se réarme que par sa porte** (#9743,
        // M3) : sous le compte que le JETON désigne, auteur de la ligne, dans
        // sa base prouvée — jamais par cette relance générique.
        if record.kind == .createComment {
            let payload = try decoder.decode(CreateCommentPayload.self, from: record.payload)
            try await retryCreateComment(clientMutationId: payload.clientMutationId,
                                         ownerId: CommentOwnership.userId(inToken: APIClient.shared.authToken))
            return
        }
        // Le retry ré-arme la ligne avec le MÊME cmid : sans cette purge, un
        // abonné post-retry (`outcomeStream(for:)`) recevait instantanément
        // le tombstone `.exhausted` périmé pour une mutation encore en vol.
        forgetOutcome(for: record.clientMessageId)

        let now = Date()
        do {
            try await pool.write { db in
                try db.execute(sql: """
                    UPDATE outbox
                    SET status = ?, attempts = 0, lastError = NULL,
                        updatedAt = ?, nextAttemptAt = ?
                    WHERE id = ?
                    """, arguments: [
                        OutboxStatus.pending.rawValue,
                        now,
                        now,
                        outboxId
                    ])
            }
        } catch {
            logger.error("retryItem write failed: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        await refreshPendingCount()
        // **Une ligne RÉ-ARMÉE est, pour le flusher, exactement une ligne
        // fraîchement enfilée** (#5830) — et sans ce signal il ne le sait pas.
        // `nextAttemptAt = now` ne réveille personne : le flusher tourne au
        // boot, au retour de premier plan, au retour du réseau, et sur CE
        // signal (`OutboxRetryScheduler.startObservingMutationEnqueued`,
        // débounce 250 ms). Sans lui, toucher « Réel non publié » aurait fait
        // exactement ce que le défaut faisait déjà : changer un statut sans
        // que rien ne parte, jusqu'au prochain événement de cycle de vie —
        // un contrôle qui a l'air d'agir. C'est le piège que ce lot ferme,
        // rejoué une couche plus bas.
        mutationEnqueued.send(())
    }

    /// Convenience wrapper for UI surfaces (e.g. failed-message bubbles) that
    /// only know the `clientMessageId` of the optimistic message and not the
    /// underlying outbox row id. Resolves the latest matching row by
    /// `clientMessageId`, then delegates to `retryItem(_:)`.
    ///
    /// Throws `OfflineQueueError.itemNotFound` if no row exists for `cmid`.
    public func retryByClientMessageId(_ cmid: String) async throws {
        guard let pool = outboxPool else {
            throw OfflineQueueError.poolNotConfigured
        }
        let row: OutboxRecord? = try await pool.read { db in
            try OutboxRecord
                .filter(Column("clientMessageId") == cmid)
                .order(Column("createdAt").desc)
                .fetchOne(db)
        }
        guard let row else {
            throw OfflineQueueError.itemNotFound
        }
        try await retryItem(row.id)
    }

    /// See `OfflineMessageQueueing.cancelPendingSend(clientMessageId:)`.
    /// Only ever DELETEs an existing `.pending` `.sendMessage` row — never
    /// inserts a `.deleteMessage` row, unlike `enqueueDelete`, so it stays
    /// safe to call unconditionally even when nothing is pending.
    public func cancelPendingSend(clientMessageId cmid: String) async {
        guard let pool = outboxPool else { return }
        do {
            try await pool.write { db in
                if let existing = try OutboxRecord
                    .filter(Column("clientMessageId") == cmid)
                    .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .fetchOne(db) {
                    _ = try OutboxRecord.deleteOne(db, key: existing.id)
                }
            }
        } catch {
            logger.error("cancelPendingSend failed: \(error.localizedDescription, privacy: .public)")
        }
        // Le message annulé ne publiera jamais d'outcome : ses observateurs se terminent.
        endOutcomeObservers(for: cmid)
        // Le miroir mémoire suit la ligne : `retryAll()` rejoue `items` sans relire l'outbox, et un message
        // annulé ou supprimé y restait — il repartait à la reconnexion suivante.
        items.removeAll { $0.clientMessageId == cmid }
        await refreshPendingCount()
    }

    /// See `OfflineMessageQueueing.clearSendMessageRow(clientMessageId:)`.
    /// Deletes in ANY status except `.inflight` — the whole point being to
    /// also reach `.failed`/`.exhausted` rows that `cancelPendingSend`
    /// (deliberately `.pending`-only) cannot.
    public func clearSendMessageRow(clientMessageId cmid: String) async {
        guard let pool = outboxPool else { return }
        do {
            try await pool.write { db in
                // `deleteAll` rend le nombre de lignes supprimées ; ici il ne
                // porte aucune décision — zéro ligne signifie « déjà nettoyé »,
                // ce qui est un succès. Le `_ =` le dit AU SITE plutôt que de
                // laisser la valeur remonter jusqu'à l'appelant, qui n'en
                // saurait pas plus quoi faire.
                _ = try OutboxRecord
                    .filter(Column("clientMessageId") == cmid)
                    .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                    .filter(Column("status") != OutboxStatus.inflight.rawValue)
                    .deleteAll(db)
            }
        } catch {
            logger.error("clearSendMessageRow failed: \(error.localizedDescription, privacy: .public)")
        }
        // Même règle que `cancelPendingSend` : supprimé ou déjà parti, il ne se rejoue plus.
        items.removeAll { $0.clientMessageId == cmid }
        await refreshPendingCount()
    }

    // MARK: - Retry Logic

    public func retryAll() async {
        guard !isRetrying, !items.isEmpty else { return }
        // Avec une outbox, le flusher est l'UNIQUE émetteur. Ce chemin hérité
        // courait en parallèle sans réclamer la ligne, et sa requête (contenu,
        // langue, réponse, pièces) perdait la protection, l'autocollant, la
        // réponse à une story et la copie des pièces d'un partage multiple : un
        // message vue unique écrit hors ligne partait permanent. Il ne fait
        // plus que retirer du miroir mémoire les lignes que l'outbox n'a plus.
        if let pool = outboxPool {
            await dropItemsWithoutOutboxRow(pool)
            return
        }
        guard let retrySend = onRetrySend else {
            logger.warning("No retry handler set, skipping retry")
            return
        }

        isRetrying = true
        logger.info("Retrying \(self.items.count) queued messages")

        var successIds: [String] = []
        var successPayloads: [OfflineRetrySuccess] = []

        for (index, item) in items.enumerated() {
            // Items carrying local files belong exclusively to the
            // OutboxFlusher — only it knows how to upload them via TUS.
            // Replaying them here would POST the caption as text-only and
            // delete the outbox row on success: the files would never be
            // uploaded (silent media loss).
            if !(item.localMediaPaths ?? []).isEmpty
                || !(item.localAudioPaths ?? []).isEmpty
                || !(item.localAudioPath ?? "").isEmpty {
                continue
            }
            if index > 0 {
                // Brief jitter to avoid a thundering-herd on the gateway when
                // draining a large backlog — kept short so the user sees their
                // messages confirmed quickly (was 100–500 ms, now 50–150 ms).
                guard await cancellableSleep(for: .milliseconds(Int.random(in: 50...150))) else { break }
            }
            if let serverId = await retrySend(item) {
                successIds.append(item.id)
                successPayloads.append(OfflineRetrySuccess(
                    clientMessageId: item.clientMessageId,
                    serverId: serverId,
                    conversationId: item.conversationId
                ))
            } else {
                // Pas de `break` : un échec ne doit PAS bloquer la file.
                // Avec `break`, un item définitivement cassé en tête (ex :
                // conversation supprimée → 4xx permanent) bloquait tous les
                // items suivants — ils n'étaient jamais tentés. On passe au
                // suivant ; l'item échoué reste en file (non retiré) et sera
                // retenté au prochain cycle (front socket/réseau, backoff).
                continue
            }
        }

        let pool = outboxPool
        for id in successIds {
            items.removeAll { $0.id == id }
            if let pool {
                let outboxId = "ofq_\(id)"
                do {
                    try await pool.write { db in
                        _ = try OutboxRecord.deleteOne(db, key: outboxId)
                    }
                } catch {
                    logger.error("Failed to delete outbox record \(outboxId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        isRetrying = false

        // Clean the optimistic rows out of the persisted message cache so an
        // inactive ConversationViewModel (loaded later) doesn't show a ghost
        // optimistic row alongside the authoritative server message that
        // arrives via the socket `message:new` broadcast.
        for payload in successPayloads {
            await CacheCoordinator.shared.messages.mergeUpdate(for: payload.conversationId) { cached in
                cached.filter { $0.id != payload.clientMessageId }
            }
            retrySucceeded.send(payload)
            publishOutcome(.applied(cmid: payload.clientMessageId))
        }

        if !successIds.isEmpty {
            logger.info("Successfully retried \(successIds.count) messages, \(self.items.count) remaining")
        }
        await refreshPendingCount()
    }

    private func dropItemsWithoutOutboxRow(_ pool: any DatabaseWriter) async {
        // Par `clientMessageId` : les envois avec média ont des lignes `ofqm_…`
        // ou à identifiant aléatoire, pas `ofq_<item.id>`.
        let cmids = items.map(\.clientMessageId)
        let live: Set<String>
        do {
            live = try await pool.read { db in
                Set(try String.fetchAll(db, OutboxRecord
                    .select(Column("clientMessageId"))
                    .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                    .filter(cmids.contains(Column("clientMessageId")))))
            }
        } catch {
            logger.error("retryAll: outbox read failed — memory mirror kept: \(error.localizedDescription, privacy: .public)")
            return
        }
        items.removeAll { !live.contains($0.clientMessageId) }
        await refreshPendingCount()
    }
}
