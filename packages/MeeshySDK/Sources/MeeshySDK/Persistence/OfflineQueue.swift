import Foundation
import Combine
import GRDB
import os


// MARK: - Offline Queue

public actor OfflineQueue {
    public static let shared = OfflineQueue()

    public nonisolated let retrySucceeded = SendablePassthrough<OfflineRetrySuccess>()
    /// outbox-04 — émis en fin de CHAQUE enqueue qui écrit durablement une
    /// nouvelle row `.pending` (jamais sur un no-op de coalescing/dédup ni sur
    /// un échec). `OutboxRetryScheduler.startObservingMutationEnqueued` s'y
    /// abonne au boot (débounce ~250 ms) pour déclencher un flush immédiat
    /// sans câbler `flushNow()` dans chaque ViewModel.
    public nonisolated let mutationEnqueued = SendablePassthrough<Void>()
    /// Wave 1 Task 3.6 — unified terminal-failure signal. `OutboxFlusher`
    /// emits here when a record hits `maxAttempts`, and `OutboxDispatcher`
    /// emits here when it raises a permanent rejection (404/410/409 conflict
    /// for reactions) that the flusher would otherwise replay forever.
    public nonisolated let retryExhausted = SendablePassthrough<OfflineRetryExhausted>()
    /// Wave 1 Task 3.6 — emitted at enqueue time when the coalescing state
    /// machine collapses a reaction toggle (add+remove cancels). Lets the UI
    /// revert any "pending" hint without waiting for a server roundtrip.
    public nonisolated let retryDropped = SendablePassthrough<OfflineRetryDropped>()

    /// Backing subject for `pendingCountPublisher`. `nonisolated` so callers can
    /// read the publisher synchronously from any context (e.g. SwiftUI views)
    /// without awaiting the actor.
    nonisolated let pendingCountSubject = SendableCurrentValueSubject<Int>(0)

    /// Publishes the current pending outbox count and every subsequent update.
    /// Emits the latest value immediately on subscription (Combine
    /// `CurrentValueSubject` semantics) so SwiftUI bindings render correctly
    /// on first connect.
    public nonisolated var pendingCountPublisher: AnyPublisher<Int, Never> {
        pendingCountSubject.publisher
    }

    /// Backing subject for `nearCapacityPublisher`.
    nonisolated let nearCapacitySubject = SendableCurrentValueSubject<Bool>(false)

    /// Fires `true` when the queue is at or above 80% of `maxQueueSize` (400
    /// of 500 slots occupied), `false` once it drops back below the threshold.
    /// UI components should surface a warning so the user knows older messages
    /// may be evicted before connectivity is restored.
    public nonisolated var nearCapacityPublisher: AnyPublisher<Bool, Never> {
        nearCapacitySubject.publisher.removeDuplicates().eraseToAnyPublisher()
    }

    /// Synchronous snapshot — readable from any context without awaiting the actor.
    public nonisolated var isNearCapacity: Bool { nearCapacitySubject.value }

    /// Backing subject for `pendingUIItemsPublisher`. Mirrors the
    /// `.pending`/`.inflight`/`.failed` outbox rows as `OutboxUIItem` snapshots
    /// for the `SyncPill` UI. Kept `nonisolated` so SwiftUI bodies can read it
    /// without hopping into the actor.
    nonisolated let pendingUIItemsSubject = SendableCurrentValueSubject<[OutboxUIItem]>([])

    /// Cap on the number of `OutboxUIItem` snapshots surfaced through the
    /// publisher. The pill UI only renders the head of the queue; an unbounded
    /// fetch on a large backlog would burn memory and decode time for rows the
    /// user can never see.
    static let pendingUIItemsLimit = 50

    /// Publishes the current pending outbox UI snapshot and every subsequent
    /// change. Rows are ordered by `createdAt` ascending and filtered to
    /// `.pending` / `.inflight` / `.failed` statuses (drained rows are deleted
    /// from the table — there is no `.applied` status to exclude). Emits the
    /// latest value immediately on subscription.
    public nonisolated var pendingUIItemsPublisher: AnyPublisher<[OutboxUIItem], Never> {
        pendingUIItemsSubject.publisher
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    static let maxQueueSize = 500

    /// Statuts sous lesquels une row outbox est encore VIVANTE : elle sera
    /// livrée, ou l'est déjà. Un ré-enfilage du même `clientMessageId` doit
    /// alors RÉUTILISER la row, jamais en insérer une jumelle.
    ///
    /// `.pending` seul ne suffit pas : `OutboxFlusher` réclame une row en la
    /// basculant `pending → inflight` le temps de son envoi. Filtrer sur le
    /// seul `.pending` rendait donc la row invisible à la déduplication
    /// PENDANT TOUT SON VOL — et un ré-enfilage concurrent (retour en
    /// avant-plan qui rejoue `share_pending_sends`, retry manuel, catch du
    /// repli REST) insérait une seconde row pour le même message. Les deux
    /// vivaient alors indépendamment sous `OutboxFlusher` : la première à
    /// épuiser son budget émettait `retryExhausted`, ce qui faisait passer la
    /// bulle `.queued → .failed` — bandeau orange — pendant que la jumelle
    /// était ENCORE EN VOL, jusqu'à ce que son `serverAck` guérisse l'état
    /// (`(.failed, .serverAck) → .sent`). C'est la cause racine du flash
    /// orange, sur le chemin texte comme sur le chemin média.
    ///
    /// `.exhausted` en est volontairement exclu : il est TERMINAL, et un
    /// nouvel enfilage sur un message épuisé est un retry manuel légitime qui
    /// doit repartir sur une row neuve.
    ///
    /// Contrat de la spec 2026-07-08 règle 3 : `.failed` est un état terminal,
    /// jamais un état traversé pendant que des tentatives restent en cours.
    nonisolated static let liveStatuses: [String] = [
        OutboxStatus.pending.rawValue,
        OutboxStatus.inflight.rawValue
    ]

    /// Items-at-risk threshold: when the queue reaches this count the
    /// `nearCapacityPublisher` fires `true` so the UI can warn the user.
    /// Set at 80% of the max to give a meaningful heads-up before messages
    /// are silently evicted.
    static let nearCapacityThreshold = maxQueueSize * 4 / 5

    /// Subdirectory under `Documents/` that holds pending audio files referenced
    /// by `OfflineQueueItem.localAudioPath`. Created lazily.
    public static let pendingAudioDirectoryName = "pending-audio"

    // Legacy file names — kept only for deletion on first boot.
    private static let legacyFileName = "offline_queue.json"

    var items: [OfflineQueueItem] = []
    /// La première récupération du processus remet TOUT `.inflight` en attente : personne ne peut encore les
    /// porter. Les suivantes — retour au premier plan, processus vivant — ne réarment que les lignes en vol
    /// depuis plus de `OutboxFlusher.staleInflightReclaimSeconds` : un gros envoi en cours pendant un aller-retour
    /// d'arrière-plan repartait sinon en double, et le premier fini supprimait les fichiers sous l'autre.
    var hasRecoveredThisProcess = false

    /// Instant de lancement du processus (noyau). Une ligne `.inflight` mise à
    /// jour après lui a été réclamée par CE processus — elle n'est pas orpheline.
    /// Si le noyau ne répond pas, `distantFuture` : toute ligne en vol est alors
    /// reprise, comme avant.
    static let processLaunchDate: Date = {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&mib, u_int(mib.count), &info, &size, nil, 0) == 0, size > 0 else { return .distantFuture }
        let start = info.kp_proc.p_starttime
        return Date(timeIntervalSince1970: TimeInterval(start.tv_sec) + TimeInterval(start.tv_usec) / 1_000_000)
    }()

    /// Rend à la prochaine récupération son caractère « premier lancement » (tests).
    func resetRecoveryForTesting() { hasRecoveredThisProcess = false }
    var isRetrying = false
    var cancellables = Set<AnyCancellable>()
    let logger = Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
    /// Outbox pool — injected at boot via `configure(pool:)`. Nil until wired.
    /// `internal` (et non `private`) : les extensions de CE type vivant dans
    /// d'AUTRES fichiers (#5830) n'atteignent pas un `private`, qui reste borné
    /// au fichier — la frontière invisible que toute extraction franchit.
    var outboxPool: (any DatabaseWriter)?
    /// Per-`cmid` outcome subscribers (AsyncStream continuations). A single
    /// cmid may have multiple observers (e.g. one ViewModel + one banner) ;
    /// each receives the same terminal event before the stream finishes.
    /// Keyed par token de souscription : un consommateur annulé ne retire
    /// QUE sa propre continuation — l'ancien `[String: [Continuation]]`
    /// droppait tout le slot, orphelinant les autres observateurs (await
    /// éternel + rétention de leur Task/ViewModel).
    var outcomeContinuations: [String: [UUID: AsyncStream<OutboxOutcome>.Continuation]] = [:]
    /// Tombstones des outcomes déjà publiés (cap FIFO) : un abonné tardif
    /// reçoit l'outcome immédiatement au lieu d'attendre pour toujours un
    /// `publishOutcome` qui ne reviendra pas.
    var outcomeTombstones = BoundedFIFOMap<String, OutboxOutcome>(capacity: 200)

    let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    /// Called when retrying a queued message via the in-memory path. Returns
    /// the server-assigned message id on success so the queue can emit a
    /// `retrySucceeded` event that lets active ViewModels reconcile the
    /// optimistic `clientMessageId` with the authoritative `serverId` before
    /// the socket `message:new` broadcast arrives.
    public var onRetrySend: (@concurrent (OfflineQueueItem) async -> String?)?

    public func setRetrySend(_ handler: @escaping @Sendable (OfflineQueueItem) async -> String?) {
        onRetrySend = handler
    }

    /// Wires the outbox pool used for SQLite persistence.
    /// Must be called once at boot before any `enqueue` calls.
    public func configure(pool: any DatabaseWriter) {
        outboxPool = pool
        Task { await self.refreshPendingCount() }
    }

    private init() {
        Task { await self.observeConnection() }
        Task { await self.observeNetwork() }
    }

    // MARK: - Queue Operations

    /// Enqueues `item` into the in-memory mirror and writes a corresponding
    /// `OutboxRecord` to the SQLite outbox table, applying the coalescing
    /// state machine described in `docs/superpowers/specs/2026-05-08-…§6.3`.
    ///
    /// Both the SELECT-existing read and the INSERT/UPDATE/DELETE write happen
    /// in the same GRDB transaction — there is no race window between
    /// detection of an existing pending record for `clientMessageId` and the
    /// merge/replace decision.
    ///
    /// Throws `OfflineQueueError.poolNotConfigured` if `configure(pool:)` was
    /// never called, `payloadCodingFailed` if encoding the item fails, and
    /// `writeFailed` if the underlying transaction throws.
    public func enqueue(_ item: OfflineQueueItem) async throws {
        guard let pool = outboxPool else {
            logger.error("enqueue called before configure(pool:) — refusing to drop the message silently")
            throw OfflineQueueError.poolNotConfigured
        }

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            logger.error("Failed to encode OfflineQueueItem: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }

        let outboxId = "ofq_\(item.id)"
        let conversationId = item.conversationId
        let clientMessageId = item.clientMessageId
        let createdAt = item.createdAt

        do {
            try await pool.write { db in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Self.liveStatuses.contains(Column("status")))
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch (existing?.kind, OutboxKind.sendMessage) {
                case (.none, _):
                    // No existing live record — straight insert.
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        createdAt: createdAt
                    ).insert(db)

                case (.deleteMessage?, _):
                    // sendMessage after a pending delete on the same id — the
                    // user re-typed something for an already-deleted local
                    // message. Drop the new send (cannot resurrect a deleted
                    // optimistic) but log so this surfaces in instrumentation.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .warning("sendMessage after deleteMessage on \(clientMessageId, privacy: .public), dropping")

                case (.sendMessage?, _):
                    // Same sendMessage already live (idempotent re-enqueue,
                    // e.g. retry path). Reuse the row rather than inserting a
                    // twin. The payload is refreshed only while the row is
                    // still `.pending` — rewriting a row the flusher has
                    // already claimed would race its in-flight attempt.
                    if existing!.status == .pending {
                        try db.execute(sql: """
                            UPDATE outbox
                            SET payload = ?, updatedAt = ?, lastError = NULL
                            WHERE id = ?
                            """, arguments: [payload, Date(), existing!.id])
                    }

                case (.editMessage?, _), (.sendReaction?, _):
                    // A pending edit/reaction precedes a fresh send for the
                    // same id — INSERT the send but log the unusual sequence.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .warning("sendMessage for \(clientMessageId, privacy: .public) follows a pending \(String(describing: existing?.kind), privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        createdAt: createdAt
                    ).insert(db)

                default:
                    // Wave 1 Task 3.2 extended `OutboxKind` with 14 non-message
                    // kinds. They should never share a `clientMessageId` with a
                    // message row (different id-space: `cid_*` vs `cmid_*`), but
                    // if a collision happens, fall through to a clean INSERT and
                    // surface the anomaly in logs for diagnostics.
                    Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                        .error("sendMessage collides with non-message outbox kind \(String(describing: existing?.kind), privacy: .public) on \(clientMessageId, privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: payload,
                        status: .pending,
                        createdAt: createdAt
                    ).insert(db)
                }
            }
        } catch let error as OfflineQueueError {
            throw error
        } catch {
            logger.error("Outbox write failed: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        logger.info("Enqueued offline message for conversation \(item.conversationId, privacy: .public), queue size: \(self.items.count)")
        await refreshPendingCount()
        mutationEnqueued.send(())
    }

    // MARK: - Pending send row upsert (shared by the media/audio enqueues)

    /// Insère la row outbox `.sendMessage` du message, ou RÉUTILISE celle qui
    /// existe déjà pour le même `(conversationId, clientMessageId)` encore
    /// `.pending`, en rafraîchissant son payload.
    ///
    /// `enqueue` (chemin texte) déduplique depuis toujours ; `enqueueAudios` et
    /// `enqueueMedia` faisaient un INSERT sec. Deux rows vivaient donc pour un
    /// même message dès qu'un ré-enfilage suivait un premier échec d'upload, et
    /// `OutboxFlusher` les traitait indépendamment : la première à épuiser son
    /// budget émettait `retryExhausted`, ce qui basculait la bulle en `.failed`
    /// — bandeau orange — pendant que la jumelle était ENCORE EN VOL, jusqu'à
    /// ce que son `serverAck` guérisse l'état (`(.failed, .serverAck) → .sent`).
    /// C'est la cause racine du flash orange observé à l'envoi de médias.
    /// Contrat de la spec 2026-07-08 règle 3 : `.failed` est TERMINAL, jamais
    /// un état traversé pendant que des tentatives restent en cours.
    ///
    /// Renvoie l'id de la row EFFECTIVE : l'appelant doit s'en servir pour
    /// toute mise à jour ultérieure (phase B) et pour sa valeur de retour,
    /// sinon il écrirait sur une row inexistante.
    nonisolated static func upsertPendingSendRow(
        _ db: Database,
        preferredId: String,
        conversationId: String,
        clientMessageId: String,
        payload: Data,
        createdAt: Date
    ) throws -> String {
        let existing = try OutboxRecord
            .filter(Column("conversationId") == conversationId)
            .filter(Column("clientMessageId") == clientMessageId)
            .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
            .filter(liveStatuses.contains(Column("status")))
            .order(Column("createdAt").desc)
            .fetchOne(db)

        if let existing {
            if existing.status == .pending {
                try db.execute(sql: """
                    UPDATE outbox
                    SET payload = ?, updatedAt = ?, lastError = NULL
                    WHERE id = ?
                    """, arguments: [payload, Date(), existing.id])
            }
            return existing.id
        }

        try OutboxRecord(
            id: preferredId,
            kind: .sendMessage,
            conversationId: conversationId,
            messageLocalId: clientMessageId,
            clientMessageId: clientMessageId,
            payload: payload,
            status: .pending,
            createdAt: createdAt
        ).insert(db)
        return preferredId
    }

    // MARK: - Clear

    public func clearAll() async {
        let ids = items.map { $0.id }
        items.removeAll()
        // Wipe complet (logout, tests) : les tombstones d'une session ne
        // doivent pas pouvoir rejouer un outcome dans la suivante.
        outcomeTombstones.removeAll()
        // … et ses observateurs ne recevront jamais d'outcome : ils se terminent ici au lieu d'attendre
        // à vie (une mention, un abonnement, un blocage hors ligne puis la déconnexion).
        for cmid in Array(outcomeContinuations.keys) { endOutcomeObservers(for: cmid) }
        guard let pool = outboxPool else {
            await refreshPendingCount()
            return
        }
        do {
            try await pool.write { db in
                for id in ids {
                    _ = try OutboxRecord.deleteOne(db, key: "ofq_\(id)")
                }
            }
        } catch {
            logger.error("clearAll failed: \(error.localizedDescription, privacy: .public)")
        }
        await refreshPendingCount()
    }

    // MARK: - Outbox Migration (utility / testing)

    /// Copies pending in-memory items into an arbitrary `pool`. Idempotent —
    /// items already present (matched by prefixed id) are silently skipped.
    ///
    /// In production the outbox is already populated by `enqueue`. This method
    /// exists as a utility for migration testing and for legacy one-time boot
    /// migrations from old JSON files via `MigrateLegacyQueues`.
    public func migrateToOutbox(pool: any DatabaseWriter) async {
        let snapshot = items
        guard !snapshot.isEmpty else { return }

        let enc = encoder
        do {
            try await pool.write { db in
                for item in snapshot {
                    let outboxId = "ofq_\(item.id)"
                    guard try OutboxRecord.fetchOne(db, key: outboxId) == nil else { continue }
                    let payload: Data
                    do {
                        payload = try enc.encode(item)
                    } catch {
                        // Insérer un payload vide créerait un enregistrement
                        // que le flush ne pourra jamais décoder : le message
                        // serait définitivement perdu. On saute l'item — il
                        // reste dans `items` et la migration est idempotente.
                        Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")
                            .error("migrateToOutbox: skipping item \(item.id, privacy: .public) — payload encode failed: \(error.localizedDescription, privacy: .public)")
                        continue
                    }
                    try OutboxRecord(
                        id: outboxId,
                        kind: .sendMessage,
                        conversationId: item.conversationId,
                        messageLocalId: item.clientMessageId,
                        clientMessageId: item.clientMessageId,
                        payload: payload,
                        status: .pending,
                        attempts: 0,
                        lastError: nil,
                        createdAt: item.createdAt,
                        updatedAt: Date(),
                        nextAttemptAt: Date()
                    ).insert(db)
                }
            }
        } catch {
            logger.error("migrateToOutbox failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Legacy JSON File Deletion

    /// Deletes the legacy JSON persistence files from disk.
    /// Called once on first boot after migration to the outbox pipeline.
    ///
    /// Wave 1 Task 3.6 — also sweeps `message_retry_queue.json` and
    /// `reaction_queue.json`, the abandoned files owned by the deleted
    /// `MessageRetryQueue` and `ReactionQueue` actors. Failures are silent
    /// because the worst case is a few stale KB on disk that the next
    /// container migration will reclaim.
    public static func deleteLegacyFile() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        for name in [
            legacyFileName,
            "message_retry_queue.json",
            "reaction_queue.json"
        ] {
            let url = documents.appendingPathComponent("meeshy_cache/\(name)")
            FileManager.default.removeItemLogging(at: url, context: "legacy JSON queue file deletion")
        }
    }

#if DEBUG
    // MARK: - Test Seams
    //
    // Narrow helpers used by the publisher refresh tests. They short-circuit
    // the production drain paths (`OutboxFlusher`, `retryAll()`) which would
    // require a far heavier test rig for what we only need: prove the
    // publisher reacts when outbox rows are deleted or flipped to `.failed`.

    /// Forces a refresh of both `pendingCountSubject` and
    /// `pendingUIItemsSubject` from the current outbox table state. Used by
    /// tests that mutate the table directly (bypassing `enqueue`) and need to
    /// observe the resulting snapshot.
    public func refreshForTesting() async {
        await refreshPendingCount()
    }

    /// Exposes the configured outbox pool so tests can read back the persisted
    /// `OutboxRecord` rows (and decode their payloads) without reaching into
    /// the actor's private state.
    public var outboxPoolForTesting: (any DatabaseWriter)? {
        outboxPool
    }

    /// Deletes every outbox row whose `clientMessageId` matches `cmid`,
    /// simulating a successful drain (the production drain path in
    /// `OutboxFlusher` and `retryAll()` also deletes the row outright since
    /// `OutboxStatus` has no `.applied` case).
    public func deleteForTesting(clientMessageId cmid: String) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        try await pool.write { db in
            _ = try OutboxRecord
                .filter(Column("clientMessageId") == cmid)
                .deleteAll(db)
        }
        await refreshPendingCount()
    }

    /// Flips every outbox row whose `clientMessageId` matches `cmid` to
    /// `.failed`, stamping `lastError` with `reason`. Mirrors what
    /// `OutboxFlusher` does after exceeding the retry budget without
    /// requiring a full flusher setup in the test.
    public func markFailedForTesting(clientMessageId cmid: String, reason: String) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        try await pool.write { db in
            try db.execute(sql: """
                UPDATE outbox
                SET status = ?, lastError = ?, updatedAt = ?
                WHERE clientMessageId = ?
                """, arguments: [
                    OutboxStatus.failed.rawValue,
                    reason,
                    Date(),
                    cmid
                ])
        }
        await refreshPendingCount()
    }
#endif
}
