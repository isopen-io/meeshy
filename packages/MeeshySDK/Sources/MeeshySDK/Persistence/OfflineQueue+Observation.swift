import Foundation
import Combine
import GRDB
import os

extension OfflineQueue {
    // MARK: - Outcome Observation (Phase 4 prereq)

    /// Returns an `AsyncStream` that emits the terminal `OutboxOutcome` for
    /// the given `cmid` (clientMessageId or clientMutationId) — exactly one
    /// `.applied` or `.exhausted` event, then the stream completes.
    ///
    /// Callers that subscribe AFTER the outcome has already fired receive
    /// that outcome immediately from the tombstone map (bounded FIFO), then
    /// the stream completes. The expected lifecycle is : subscribe BEFORE
    /// issuing the mutation, then `await` the next iterator element to
    /// observe completion.
    public func outcomeStream(for cmid: String) -> AsyncStream<OutboxOutcome> {
        if let fired = outcomeTombstones[cmid] {
            return AsyncStream { continuation in
                continuation.yield(fired)
                continuation.finish()
            }
        }
        let token = UUID()
        return AsyncStream { continuation in
            self.outcomeContinuations[cmid, default: [:]][token] = continuation
            continuation.onTermination = { [weak self] _ in
                guard let self else { return }
                Task { await self.dropContinuation(for: cmid, token: token) }
            }
        }
    }

    /// Emits an outcome to every observer registered for `outcome.cmid`,
    /// finishes their streams, and clears the registry slot.
    ///
    /// Called from `retryAll()` (sendMessage success), from the
    /// `OutboxFlusher.onOutcome` callback (generic dispatch success /
    /// exhaustion), and from `retryItem(_:)` if the row is missing.
    /// Oublie l'issue mémorisée d'un identifiant que l'on vient de réarmer :
    /// sans cela, un abonné recevrait aussitôt le `.exhausted` périmé.
    func forgetOutcome(for cmid: String) {
        outcomeTombstones.removeValue(forKey: cmid)
    }

    /// **Témoins seulement** : joué entre la saisie du triplet d'une opération
    /// de commentaire et sa transaction — pour y rebrancher la file et prouver
    /// que l'opération n'agit que sur ce qu'elle a saisi.
    var commentTransactionHook: (@Sendable @concurrent () async -> Void)?

    func setCommentTransactionHook(_ hook: (@Sendable @concurrent () async -> Void)?) {
        commentTransactionHook = hook
    }

    public func publishOutcome(_ outcome: OutboxOutcome) {
        // Le flusher vient de supprimer (.applied) ou d'épuiser (.exhausted)
        // la ligne outbox de ce cmid — le nombre de writes en attente a changé.
        // `refreshPendingCount` ne tourne sinon que sur enqueue / retry, jamais
        // sur le chemin de drainage : sans ce rafraîchissement le compteur
        // reste figé sur sa valeur du boot et le bandeau « Synchronisation… »
        // ne se referme jamais une fois la file vidée.
        Task { await self.refreshPendingCount() }

        // Le miroir mémoire suit la ligne : appliquée ou épuisée par le flusher,
        // elle n'a plus rien à rejouer.
        items.removeAll { $0.clientMessageId == outcome.cmid }

        outcomeTombstones[outcome.cmid] = outcome
        guard let observers = outcomeContinuations.removeValue(forKey: outcome.cmid) else {
            return
        }
        for continuation in observers.values {
            continuation.yield(outcome)
            continuation.finish()
        }
    }

    /// Termine, SANS outcome, les observateurs d'une mutation qui n'en aura jamais : sa ligne a été
    /// retirée de la file (annulation, déconnexion). Leur `for await` se termine — sinon chaque
    /// observateur gardait sa tâche, sa continuation et sa closure de rollback pour la vie du processus.
    func endOutcomeObservers(for cmid: String) {
        guard let observers = outcomeContinuations.removeValue(forKey: cmid) else { return }
        for continuation in observers.values { continuation.finish() }
    }

    /// Nombre de mutations encore observées — témoin de la purge (tests).
    var observedOutcomeCount: Int { outcomeContinuations.count }

    /// Internal: removes the single continuation identified by `token` after
    /// its consumer cancelled (Task cancellation, scope exit). Idempotent —
    /// if the slot was already cleared by `publishOutcome`, this is a no-op.
    /// Surtout : ne touche PAS aux autres continuations du même cmid.
    private func dropContinuation(for cmid: String, token: UUID) {
        guard var slot = outcomeContinuations[cmid] else { return }
        slot.removeValue(forKey: token)
        if slot.isEmpty {
            outcomeContinuations.removeValue(forKey: cmid)
        } else {
            outcomeContinuations[cmid] = slot
        }
    }

    // MARK: - Pending Count

    /// Raw `OutboxKind` values that MUST NOT keep the « Synchronisation… »
    /// indicator visible (`countsTowardSyncIndicator == false`). Shared by the
    /// count query AND the SyncPill UI-items query so the badge count and the
    /// rotating pill can never disagree about which rows are user-relevant — a
    /// `markAsRead` that lingers must be invisible in BOTH, not counted out of
    /// one while still rotating in the other.
    private static let syncIndicatorExcludedKinds: [String] = OutboxKind.allCases
        .filter { !$0.countsTowardSyncIndicator }
        .map(\.rawValue)

    /// Counts rows currently in `.pending` or `.inflight` state and updates
    /// `pendingCountSubject`. Called after every enqueue/dequeue/retryItem
    /// touchpoint. Falls back to the in-memory mirror if no pool is wired.
    /// Also refreshes the `pendingUIItemsSubject` snapshot so the SyncPill UI
    /// re-renders on the same touchpoints.
    /// `internal` et non `private` : `OfflineQueue+TerminalRetention.swift` en
    /// est une extension du MÊME type, séparée par le seul budget de taille de
    /// fichier — pas par une frontière de responsabilité.
    func refreshPendingCount() async {
        guard let pool = outboxPool else {
            let inMemoryCount = items.count
            pendingCountSubject.send(inMemoryCount)
            nearCapacitySubject.send(inMemoryCount >= Self.nearCapacityThreshold)
            pendingUIItemsSubject.send([])
            return
        }
        // Seules les opérations qui justifient l'indicateur « Synchronisation… »
        // sont comptées — un accusé de lecture (`markAsRead`) coincé ne doit
        // pas maintenir le bandeau alors que la conversation est synchronisée.
        let excludedKinds = Self.syncIndicatorExcludedKinds
        // Échec de lecture GRDB → 0, PAS le miroir mémoire `items` : le
        // flusher draine la table SANS toucher le miroir (il devient périmé
        // après tout drain) et `refreshPendingUIItems` retombe déjà sur `[]`
        // — un fallback divergent affichait la bannière « Synchronisation »
        // générique (pendingCount > 0, pendingUIItems vide) en permanence.
        // Cohérence : pendingCount == 0 ⟺ pendingUIItems == [] en dégradé.
        let count: Int
        do {
            count = try await pool.read { db in
                try OutboxRecord
                    .filter([OutboxStatus.pending.rawValue, OutboxStatus.inflight.rawValue]
                        .contains(Column("status")))
                    .filter(!excludedKinds.contains(Column("kind")))
                    .fetchCount(db)
            }
        } catch {
            logger.error("refreshPendingCount read failed — reporting 0 to keep the degraded invariant: \(error.localizedDescription, privacy: .public)")
            count = 0
        }
        pendingCountSubject.send(count)
        nearCapacitySubject.send(count >= Self.nearCapacityThreshold)
        await refreshPendingUIItems()
    }

    /// Reads the head of the outbox table (rows in `.pending`, `.inflight`,
    /// `.failed` or `.exhausted` ordered by `createdAt` ascending, capped at
    /// `pendingUIItemsLimit`) and pushes the corresponding `OutboxUIItem`
    /// snapshots onto `pendingUIItemsSubject`. Decoding cost is paid once on
    /// each outbox mutation, never on the SwiftUI render path.
    ///
    /// Applies the SAME `syncIndicatorExcludedKinds` filter as the count query
    /// (`refreshPendingCount`): a `markAsRead` row is a background read receipt,
    /// not a user-initiated operation. Without this filter the SyncPill rotated
    /// through "Synchronisation des lus" for every conversation merely opened —
    /// phantom operations the user never started — while the badge count (which
    /// already excludes them) read zero. The pill must surface only rows that
    /// represent real work the user is waiting on.
    private func refreshPendingUIItems() async {
        guard let pool = outboxPool else {
            pendingUIItemsSubject.send([])
            return
        }
        let limit = Self.pendingUIItemsLimit
        let excludedKinds = Self.syncIndicatorExcludedKinds
        // Une ligne de commentaire ne se montre que sous preuve (#9743, M3) :
        // compte du jeton, auteur de la ligne, base prouvée dans CETTE lecture.
        let commentContext = CommentOwnership.userId(inToken: APIClient.shared.authToken).map {
            CommentContext(ownerId: $0, serverOrigin: MeeshyConfig.shared.persistedServerOrigin, pool: pool)
        }
        let records: [OutboxRecord]
        do {
            records = try await pool.read { db in
                let baseProven = try commentContext?.proves(db) ?? false
                return try OutboxRecord
                    .filter([
                        OutboxStatus.pending.rawValue,
                        OutboxStatus.inflight.rawValue,
                        OutboxStatus.failed.rawValue,
                        // T14b — surface permanently-failed (`.exhausted`) rows so the
                        // SyncPill can show a non-message mutation that gave up; the
                        // T14 GC bounds how long they linger.
                        OutboxStatus.exhausted.rawValue
                    ].contains(Column("status")))
                    .filter(!excludedKinds.contains(Column("kind")))
                    .order(Column("createdAt").asc)
                    .limit(limit)
                    .fetchAll(db)
                    .filter { record in
                        guard record.kind == .createComment else { return true }
                        guard baseProven, let owner = commentContext?.ownerId,
                              let payload = try? JSONDecoder().decode(CreateCommentPayload.self, from: record.payload) else {
                            return false
                        }
                        return CommentOwnership.mayHandle(payload, ownerId: owner, baseIsHis: true)
                    }
            }
        } catch {
            logger.error("refreshPendingUIItems read failed — reporting [] to keep the degraded invariant: \(error.localizedDescription, privacy: .public)")
            records = []
        }
        let items = records.map(OutboxUIItem.from(record:))
        pendingUIItemsSubject.send(items)
    }

    // MARK: - Connection Observer

    func observeConnection() {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    // Brief delay to let the socket handshake complete before
                    // draining the outbox — avoids sending on an unhealthy pipe
                    // while keeping the UX snappy (was 2 000 ms, now 200 ms).
                    try? await Task.sleep(for: .milliseconds(200))
                    await self.retryAll()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Network Observer

    /// Symétrique de `observeConnection()`, mais piloté par la connectivité
    /// réseau et non par le socket. Au front montant (`isOffline` repasse à
    /// `false` — le réseau est revenu), on draine l'outbox. C'est un filet de
    /// sécurité indépendant du socket : si la reconnexion Socket.IO tarde ou
    /// n'a pas lieu, le simple retour du réseau suffit à repartir, `retryAll`
    /// envoyant en REST.
    func observeNetwork() {
        NetworkMonitor.shared.$isOffline
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    // Même délai que la voie socket : laisser la pile réseau
                    // se stabiliser avant de réémettre.
                    try? await Task.sleep(for: .milliseconds(200))
                    await self.retryAll()
                }
            }
            .store(in: &cancellables)
    }
}
