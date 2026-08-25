import Foundation
import GRDB
import os

private let outboxFlusherLog = Logger(subsystem: "me.meeshy.sdk", category: "outbox-flusher")

public protocol OutboxDispatching: Sendable {
    func dispatch(_ record: OutboxRecord) async throws
}

/// Helper that hydrates a `ReactionContext` from a `.sendReaction` outbox
/// row. Used by both `OutboxFlusher` (terminal failure → `retryExhausted`)
/// and `OutboxDispatcher` (permanent reject → `retryExhausted`). Returns
/// `nil` if the record is not a reaction or the payload fails to decode —
/// callers fall back to a `kind`-only exhausted event in that case.
@inline(__always)
internal func reactionContext(for record: OutboxRecord) -> OfflineRetrySuccess.ReactionContext? {
    guard record.kind == .sendReaction else { return nil }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let payload = decoder.decodeOrLog(
        ReactionOutboxPayload.self,
        from: record.payload,
        field: "sendReaction payload",
        id: record.id,
        logger: outboxFlusherLog
    ) else {
        return nil
    }
    return OfflineRetrySuccess.ReactionContext(
        messageId: payload.messageId,
        emoji: payload.emoji,
        action: payload.action
    )
}

/// A7+A8 — best-effort cleanup of local files referenced by an outbox
/// payload. Called when a record terminates (either `.applied` because the
/// server adopted the file via canonical URL, OR `.exhausted` because we
/// gave up retrying). Without this sweep, `Documents/pending-audio/` would
/// accumulate orphan `.m4a` files indefinitely for messages that never made
/// it to the server.
///
/// Covers `sendMessage` payloads carrying either a scalar `localAudioPath`
/// (single-track rows) or an array `localAudioPaths` (multi-track rows).
/// Both fields are swept; the now-empty per-message subdirectory is removed
/// as a best-effort final step. Other payload kinds either don't reference
/// local files, or their files (TUS upload checkpoints) are managed by
/// their own GC path.
@inline(__always)
internal func cleanupLocalFiles(for record: OutboxRecord) {
    guard record.kind == .sendMessage else { return }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let item = decoder.decodeOrLog(
        OfflineQueueItem.self,
        from: record.payload,
        field: "sendMessage payload (file sweep)",
        id: record.id,
        logger: outboxFlusherLog
    ) else { return }
    // S7b — sweep audio (pending-audio/) AND visual media (pending-media/)
    // paths; both relocate bytes under Documents/ and would leak if a
    // terminated row didn't clean them. `absoluteAudioPath` is a generic
    // Documents-relative resolver, so it resolves both correctly.
    let relativePaths: [String] = (
        [item.localAudioPath].compactMap { $0 }
        + (item.localAudioPaths ?? [])
        + (item.localMediaPaths ?? [])
    ).filter { !$0.isEmpty }
    guard !relativePaths.isEmpty else { return }
    var parentDirs = Set<String>()
    for rel in relativePaths {
        let abs = OfflineQueue.absoluteAudioPath(forStored: rel)
        // Un fichier déjà absent est nominal (envoi annulé, adoption
        // antérieure, autre passe de sweep) et reste silencieux ; toute AUTRE
        // erreur signifie que les octets fuient et doit se voir.
        FileManager.default.removeItemLogging(atPath: abs, context: "outbox terminal sweep")
        parentDirs.insert((abs as NSString).deletingLastPathComponent)
    }
    // Best-effort: remove the now-empty per-message subdir (pending-audio/<cid>/).
    for dir in parentDirs {
        // Répertoire déjà disparu = rien à réclamer.
        guard let contents = try? FileManager.default.contentsOfDirectory(atPath: dir) else { continue }
        guard contents.isEmpty else { continue }
        FileManager.default.removeItemLogging(atPath: dir, context: "outbox empty per-message dir")
    }
}

/// Drains the `outbox` table FIFO, dispatching each pending item via the
/// supplied `OutboxDispatching`. Failures schedule an exponential backoff
/// retry; after `maxAttempts` failures the item is marked `.exhausted`.
public actor OutboxFlusher {

    private let pool: any DatabaseWriter
    private let dispatcher: any OutboxDispatching
    private let maxAttempts: Int
    private let baseBackoff: TimeInterval
    private let maxBackoff: TimeInterval
    private let onOutcome: (@Sendable (OutboxOutcome) -> Void)?
    /// BW1 — optional gate so the flusher can short-circuit when the device
    /// is offline. Without it, a long airplane-mode session burns through
    /// every pending row's `maxAttempts` retries inside the URLSession
    /// timeout window — battery + (when service returns) noisy logs. The
    /// `Sendable` closure form lets call-sites inject the live `Network
    /// ConditionMonitor.shared.isOnline` getter from MainActor without the
    /// SDK Persistence layer importing UIKit/SwiftUI.
    private let isNetworkReachable: @Sendable () async -> Bool

    public init(
        pool: any DatabaseWriter,
        dispatcher: any OutboxDispatching,
        maxAttempts: Int = 5,
        baseBackoff: TimeInterval = 2,
        maxBackoff: TimeInterval = 30,
        onOutcome: (@Sendable (OutboxOutcome) -> Void)? = nil,
        isNetworkReachable: @escaping @Sendable () async -> Bool = { true }
    ) {
        self.pool = pool
        self.dispatcher = dispatcher
        self.maxAttempts = maxAttempts
        self.baseBackoff = baseBackoff
        self.maxBackoff = maxBackoff
        self.onOutcome = onOutcome
        self.isNetworkReachable = isNetworkReachable
    }

    /// Draine les records `.pending` dont le `nextAttemptAt` est échu.
    ///
    /// BW1 — Si `isNetworkReachable()` retourne `false`, le flush
    /// court-circuite (aucun fetch GRDB, aucun dispatch). Cela évite de
    /// brûler les `maxAttempts` retries en mode avion / 1G saturé, qui
    /// se mangent toute la batterie pendant le timeout URLSession (60s
    /// par défaut). Le re-flush est déclenché automatiquement par
    /// `OutboxRetryScheduler` au retour réseau (transition online).
    ///
    /// Retourne le `nextAttemptAt` le plus proche parmi les records encore
    /// `.pending` mais différés dans le futur (échec récent → backoff), ou
    /// `nil` si rien n'est différé. Le planificateur de re-flush s'en sert
    /// pour rejouer le flush à l'échéance plutôt que d'attendre un évènement
    /// de cycle de vie de l'app (boot / premier plan / enqueue / BGTask).
    /// Visibility timeout des claims : une row `.inflight` dont le claim
    /// (`updatedAt`, bumpé par `claimPending`) est plus vieux que cette
    /// fenêtre est un ORPHELIN (dispatch jamais conclu — Task annulée,
    /// crash post-claim) : comptée par `pendingCount` (bannière
    /// « Synchronisation… » allumée à vie) mais jamais reprise par le
    /// SELECT `.pending`. `bootRecovery` ne couvre que le boot et le
    /// retour foreground — le reclaim au flush ferme la fenêtre des
    /// longues sessions. 30 min > pire dispatch légitime (gros upload TUS
    /// sur réseau lent) ; un double-dispatch résiduel est neutralisé par
    /// l'idempotence cmid côté gateway.
    public static let staleInflightReclaimSeconds: TimeInterval = 30 * 60

    /// Délai de re-tentative quand le flush est court-circuité par le gate
    /// réseau. Assez long pour ne pas réveiller la radio en boucle en mode
    /// avion, assez court pour qu'un moniteur qui se trompe coûte une minute
    /// d'attente et non la session entière.
    public static let offlineRetrySeconds: TimeInterval = 60

    @discardableResult
    public func flush() async -> Date? {
        // BW1 — gate de bande passante : en mode avion / 1G saturé, dispatcher
        // brûlerait les `maxAttempts` en timeouts URLSession de 60 s chacun.
        //
        // Rendre `nil` ici était un piège : `nil` signifie « rien n'est
        // différé », et `OutboxRetryScheduler.schedule(at: nil)` ANNULE le
        // timer. La file ne comptait donc plus que sur le front montant
        // hors-ligne → en-ligne. Si ce front ne vient jamais — moniteur figé
        // sur une valeur fausse, ou front déjà passé avant l'abonnement — plus
        // rien ne réveille la file de toute la session. C'est ce qui laissait
        // « Synchronisation des vues story » tourner indéfiniment.
        //
        // On rend désormais une échéance : le front montant reste le chemin
        // RAPIDE, cette échéance est le filet. Un moniteur menteur coûte un
        // retard, plus un blocage.
        guard await isNetworkReachable() else {
            // Uniquement s'il y a réellement quelque chose à reprendre : armer
            // un réveil chaque minute sur une file VIDE ne ferait que réveiller
            // l'app pour rien, ce que le gate cherchait précisément à éviter.
            let hasWork = (try? await pool.read { db in
                try OutboxRecord
                    .filter([OutboxStatus.pending.rawValue, OutboxStatus.inflight.rawValue]
                        .contains(Column("status")))
                    .fetchCount(db)
            }) ?? 0
            return hasWork > 0 ? Date().addingTimeInterval(Self.offlineRetrySeconds) : nil
        }

        let now = Date()
        let reclaimCutoff = now.addingTimeInterval(-Self.staleInflightReclaimSeconds)
        do {
            _ = try await pool.write { db in
                try OutboxRecord
                    .filter(Column("status") == OutboxStatus.inflight.rawValue)
                    .filter(Column("updatedAt") < reclaimCutoff)
                    .updateAll(
                        db,
                        Column("status").set(to: OutboxStatus.pending.rawValue),
                        Column("updatedAt").set(to: now),
                        Column("nextAttemptAt").set(to: now)
                    )
            }
        } catch {
            // Sans ce reclaim, une ligne restée `.inflight` (app tuée en plein
            // envoi) n'est plus jamais rejouée : le message ne part pas.
            outboxFlusherLog.error("Stale-inflight reclaim failed, rows may stay stuck: \(error.localizedDescription, privacy: .public)")
        }
        // outbox-06 — paginer jusqu'à épuisement du backlog échu : une seule
        // page de 50 laissait les rows 51+ `.pending` échues, invisibles
        // d'`earliestDeferred` (qui ne regarde que le futur) → timer annulé,
        // backlog gelé jusqu'au prochain front réseau. `now` reste FIGÉ sur
        // toute la passe (pas d'aspiration de rows devenues éligibles en
        // cours de route) ; la borne de 20 passes (1000 rows) est une garde
        // anti-pathologie, pas une garantie zéro-stall à toute échelle.
        var pending: [OutboxRecord] = []
        var pass = 0
        repeat {
            do {
                pending = try await pool.read { db in
                    try OutboxRecord
                        .filter(Column("status") == OutboxStatus.pending.rawValue)
                        .filter(Column("nextAttemptAt") <= now)
                        .order(Column("createdAt").asc)
                        .limit(50)
                        .fetchAll(db)
                }
            } catch {
                outboxFlusherLog.error("Pending batch read failed — outbox not drained this pass: \(error.localizedDescription, privacy: .public)")
                pending = []
            }

            for record in pending {
                await processRecord(record)
            }
            pass += 1
        } while pending.count == 50 && pass < 20

        let earliestDeferred: OutboxRecord?
        do {
            earliestDeferred = try await pool.read { db in
                try OutboxRecord
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .filter(Column("nextAttemptAt") > Date())
                    .order(Column("nextAttemptAt").asc)
                    .fetchOne(db)
            }
        } catch {
            // Le scheduler ne sera pas ré-armé sur ce créneau ; les triggers
            // de cycle de vie (reconnexion, boot) restent le filet.
            outboxFlusherLog.error("Deferred-head read failed, retry not rescheduled: \(error.localizedDescription, privacy: .public)")
            earliestDeferred = nil
        }
        return earliestDeferred?.nextAttemptAt
    }

    /// S1 — atomically claim a pending row for dispatch. Flips pending→inflight
    /// ONLY while the row is still pending; returns false when another flusher
    /// already claimed it (the conditional UPDATE matched 0 rows). Because GRDB
    /// serializes writes, two concurrent flushers reduce to two sequential
    /// claims and exactly one wins — closing the double-dispatch race the old
    /// unconditional `update(db)` left open (multiple lifecycle triggers each
    /// build their own OutboxFlusher over the shared pool, so actor isolation
    /// alone did not serialize them).
    func claimPending(_ record: OutboxRecord) async -> Bool {
        let now = Date()
        do {
            return try await pool.write { db -> Bool in
                try OutboxRecord
                    .filter(Column("id") == record.id)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .updateAll(
                        db,
                        Column("status").set(to: OutboxStatus.inflight.rawValue),
                        Column("updatedAt").set(to: now)
                    ) == 1
            }
        } catch {
            // On renonce à dispatcher ce tour-ci : sans claim durable, un
            // envoi partirait sans que la ligne soit marquée `.inflight`,
            // ouvrant la porte au double-envoi.
            outboxFlusherLog.error("Claim failed for \(record.id, privacy: .public), dispatch skipped this pass: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// `MeeshyError.auth(...)` (typically a 401 mapped to `.sessionExpired`) is a
    /// transitory auth failure, NOT a permanent dispatch error. It must not consume
    /// the retry budget — otherwise a brief session expiry permanently exhausts every
    /// queued row before the app gets a chance to refresh the token.
    private static func isSessionExpiry(_ error: Error) -> Bool {
        if case MeeshyError.auth = error { return true }
        return false
    }

    /// P7-7 — codes URLError de TRANSPORT (réseau/serveur injoignable). Liste
    /// explicite : les URLError applicatifs synthétiques du chemin TUS
    /// (`.badServerResponse`, `.badURL`, `.cannotParseResponse`) doivent, eux,
    /// continuer à consommer le budget (erreur potentiellement permanente).
    private static let transportURLErrorCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost,
        .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed,
        .timedOut, .dataNotAllowed, .internationalRoamingOff,
    ]

    /// P7-7 — une panne gateway (connection refused, DNS, timeout) est un échec
    /// de TRANSPORT, pas applicatif : le budget d'attempts est réservé aux
    /// refus du serveur. Sans cette distinction, ~2 min d'outage (connection
    /// refused = échec instantané, seul le backoff espace les tentatives)
    /// consomment les 5 attempts → `.exhausted` → l'utilisateur doit re-taper
    /// Retry PAR message au lieu du flush FIFO automatique au reconnect
    /// (observé E2E 2026-07-02). Même principe que le gate BW1 (mode avion)
    /// et que l'exemption session-expiry ci-dessus.
    /// `MeeshyError.network` est la normalisation APIClient de tout URLError
    /// transport ; les URLError bruts couvrent le chemin TUS qui ne passe pas
    /// par cette normalisation.
    private static func isNetworkTransportError(_ error: Error) -> Bool {
        if case MeeshyError.network = error { return true }
        if let urlError = error as? URLError {
            return transportURLErrorCodes.contains(urlError.code)
        }
        return false
    }

    /// PERMANENT server rejections — a 4xx that will NEVER succeed on retry
    /// (malformed / forbidden / not found / too large / unprocessable). These
    /// dead-letter on the FIRST attempt instead of burning the whole retry
    /// budget + exponential backoff (≈1 min of ⏳ before the user sees "failed").
    ///
    /// Deliberately CONSERVATIVE — excludes anything that might recover:
    /// - 401 → session-expiry, deferred without consuming budget (above);
    /// - 408 / 429 / 503 → retryable (mirrors APIClient.retryableStatusCodes);
    /// - 5xx → the server may come back;
    /// - 409 → a conflict on a deduped clientMessageId can mean "already
    ///   delivered", which must NOT surface as a failure — left to the generic
    ///   path rather than dead-lettered.
    ///
    /// 410 Gone rejoint la liste avec le verrou d'idempotence du gateway
    /// (`withMutationLog`, `replayCost: 'diverges'`). Il ne dit PAS « je ne
    /// trouve pas » — il dit « ton cmid a bien été appliqué, et son résultat
    /// n'est plus là ». Rejouer ne le ramènera jamais : soit l'auteur a
    /// supprimé ce que la ligne avait créé, soit la source éphémère a expiré.
    /// Sans lui dans cette liste, la ligne brûlait ses cinq tentatives pour
    /// finir au même endroit, une minute de ⏳ plus tard.
    private static let permanentRejectionStatusCodes: Set<Int> = [400, 403, 404, 410, 413, 422]
    private static func isPermanentServerRejection(_ error: Error) -> Bool {
        // 403 is surfaced as a distinct `.forbidden` case by APIClient (resource
        // access loss, not a session problem) — a permanent reject all the same.
        if case MeeshyError.forbidden = error { return true }
        if case let MeeshyError.server(statusCode, _) = error {
            return permanentRejectionStatusCodes.contains(statusCode)
        }
        return false
    }

    /// Task 10, round 1 de revue (Critical) — combien de temps une ligne
    /// DÉPENDANTE (aujourd'hui : fan-out de partage,
    /// `OutboxDeferralError.waitingForFanoutOrigin`) peut légitimement
    /// ATTENDRE sa dépendance avant que l'exemption cesse de s'appliquer.
    ///
    /// Une exemption PERMANENTE — calquée telle quelle sur
    /// `isSessionExpiry`/`isNetworkTransportError` — serait un AUTRE bug ici :
    /// contrairement à une session (toujours rafraîchissable) ou un réseau
    /// (toujours susceptible de revenir), la ligne ATTENDUE peut échouer
    /// DÉFINITIVEMENT (rejet serveur permanent, épuisement de SON propre
    /// budget). Sans borne, la ligne dépendante attendrait éternellement une
    /// origine qui n'arrivera jamais — perte silencieuse déguisée en attente.
    ///
    /// Même ordre de grandeur que `staleInflightReclaimSeconds` : le pire cas
    /// crédible d'upload TUS sur réseau lent, déjà établi comme référence
    /// dans ce fichier. Passé ce délai, la ligne rejoint le chemin d'échec
    /// normal (consomme `attempts`, `.exhausted` en ~30s de plus avec les
    /// défauts prod) au lieu d'attendre indéfiniment.
    ///
    /// Round 2 de revue — mesurée depuis `OutboxRecord
    /// .waitingForFanoutOriginSince` (l'entrée RÉELLE de la ligne dans cette
    /// attente), jamais depuis `createdAt` : voir la doc de ce champ pour le
    /// POURQUOI (`createdAt`, pour une copie de fan-out, porte l'horodatage
    /// du partage posé par l'EXTENSION, potentiellement plusieurs jours avant
    /// que la ligne n'entre réellement dans cette file).
    public static let fanoutOriginWaitTimeout: TimeInterval = 30 * 60

    /// Round 2 de revue — vrai tant que `waitingSince` (le premier report RÉEL
    /// de cette ligne, pas sa naissance) est dans la fenêtre
    /// `fanoutOriginWaitTimeout`.
    private static func isWithinFanoutOriginWaitWindow(since waitingSince: Date, now: Date) -> Bool {
        now.timeIntervalSince(waitingSince) < fanoutOriginWaitTimeout
    }

    /// Journal des tentatives (spec 2026-07-08 message-send-failure-retry-flow) :
    /// chaque dispatch d'un record `.sendMessage` — succès comme échec — ajoute
    /// une ligne `send_attempts` keyed sur le `clientMessageId`, pour la carte
    /// « Historique d'envoi » de la vue détails. Best-effort : ne bloque jamais
    /// le flush.
    private func logSendAttempt(
        for record: OutboxRecord,
        startedAt: Date,
        outcome: SendAttemptRecord.Outcome,
        error: Error?
    ) async {
        guard record.kind == .sendMessage else { return }
        let cmid = record.clientMessageId
        let errorMessage = error.map { String(describing: $0) }
        do {
            try await pool.write { db in
                _ = try SendAttemptRecord.log(
                    db,
                    localId: cmid,
                    transport: .outbox,
                    startedAt: startedAt,
                    outcome: outcome,
                    errorMessage: errorMessage
                )
            }
        } catch {
            // Télémétrie seule : l'envoi lui-même n'est pas affecté.
            outboxFlusherLog.error("Send-attempt telemetry not recorded for \(cmid, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    private func processRecord(_ record: OutboxRecord) async {
        // S1 — claim atomically; skip dispatch if another flusher beat us to it.
        guard await claimPending(record) else { return }
        var current = record
        current.status = .inflight
        current.updatedAt = Date()
        let attemptStartedAt = Date()

        do {
            try await dispatcher.dispatch(current)
            await logSendAttempt(for: current, startedAt: attemptStartedAt, outcome: .success, error: nil)
            let idToDelete = current.id
            do {
                try await pool.write { db in
                    _ = try OutboxRecord.deleteOne(db, key: idToDelete)
                }
            } catch {
                outboxFlusherLog.error("Post-dispatch outbox delete failed for \(idToDelete, privacy: .public): \(error.localizedDescription, privacy: .public) — record may re-dispatch")
            }
            // A7+A8 — drop any local file the payload referenced. On the
            // happy path, MessagePersistenceActor.adoptSDKLevel already
            // moved the file into the typed media cache (cf. DiskCacheStore
            // .adopt's moveItem), so this is a defensive no-op for the
            // applied path. Real value is on `.exhausted` below.
            cleanupLocalFiles(for: current)
            onOutcome?(.applied(cmid: current.clientMessageId))
        } catch {
            await logSendAttempt(for: current, startedAt: attemptStartedAt, outcome: .failure, error: error)
            // 401 / session-expiry is TRANSITORY — the app's auth flow refreshes the
            // token (AuthManager.checkExistingSession on resume/reconnect). Treating it
            // like a normal failure burns the retry budget and PERMANENTLY exhausts
            // queued user actions (messages, reactions, read receipts) on a brief
            // expiry — observed in prod: a whole outbox marked `.exhausted` with
            // `auth(sessionExpired)`. Defer WITHOUT consuming the budget so the row
            // survives until re-auth, then flushes on the next scheduled attempt.
            // P7-7 — même exemption pour les échecs de TRANSPORT (gateway
            // injoignable réseau-up) : defer sans consommer le budget, le
            // flush au reconnect (NWPath / socket reconnect / boot) rejoue
            // la file en FIFO — l'ordre de composition est préservé.
            //
            if Self.isSessionExpiry(error) || Self.isNetworkTransportError(error) {
                current.lastError = String(describing: error)
                current.status = .pending
                current.updatedAt = Date()
                current.nextAttemptAt = Date().addingTimeInterval(maxBackoff)
                let deferredSnapshot = current
                do {
                    try await pool.write { db in
                        try deferredSnapshot.update(db)
                    }
                } catch {
                    // La ligne reste `.inflight` : elle ne sera rejouée qu'au
                    // prochain reclaim de périmés, pas au prochain flush.
                    outboxFlusherLog.error("Deferred state not persisted for \(current.id, privacy: .public), row left inflight: \(error.localizedDescription, privacy: .public)")
                }
                return
            }

            // Task 10, round 1 — même exemption pour une ligne qui ATTEND sa
            // dépendance (fan-out de partage), mais BORNÉE dans le temps,
            // contrairement aux deux précédentes : voir la doc de
            // `fanoutOriginWaitTimeout`.
            //
            // Round 2 de revue — la borne ne se mesure PLUS depuis
            // `current.createdAt` (défaut corrigé ici : voir la doc de
            // `OutboxRecord.waitingForFanoutOriginSince`). Premier report de
            // CETTE ligne pour cette raison → on marque l'instant, PERSISTÉ
            // avec la ligne (survit donc à un redémarrage). Les reports
            // suivants relisent le même instant plutôt que de le recalculer.
            if case OutboxDeferralError.waitingForFanoutOrigin = error {
                let now = Date()
                let waitingSince = current.waitingForFanoutOriginSince ?? now
                current.waitingForFanoutOriginSince = waitingSince
                if Self.isWithinFanoutOriginWaitWindow(since: waitingSince, now: now) {
                    current.lastError = String(describing: error)
                    current.status = .pending
                    current.updatedAt = now
                    current.nextAttemptAt = now.addingTimeInterval(maxBackoff)
                    let deferredSnapshot = current
                    do {
                        try await pool.write { db in
                            try deferredSnapshot.update(db)
                        }
                    } catch {
                        // La ligne reste `.inflight` : elle ne sera rejouée
                        // qu'au prochain reclaim de périmés, pas au prochain
                        // flush.
                        outboxFlusherLog.error("Deferred state not persisted for \(current.id, privacy: .public), row left inflight: \(error.localizedDescription, privacy: .public)")
                    }
                    return
                }
                // Passé la fenêtre : rejoint le chemin d'échec normal
                // ci-dessous — `attempts` recommence à être consommé.
            }

            current.attempts += 1
            current.lastError = String(describing: error)
            current.updatedAt = Date()

            // A permanent 4xx will never succeed — dead-letter now rather than
            // spin the full backoff schedule. Otherwise cap at `maxAttempts`.
            if Self.isPermanentServerRejection(error) || current.attempts >= maxAttempts {
                current.status = .exhausted
            } else {
                current.status = .pending
                let backoff = min(maxBackoff, baseBackoff * pow(2.0, Double(current.attempts - 1)))
                let jitter = Double.random(in: 0...0.5)
                current.nextAttemptAt = Date().addingTimeInterval(backoff + jitter)
            }

            let failedSnapshot = current
            do {
                try await pool.write { db in
                    try failedSnapshot.update(db)
                }
            } catch {
                // `attempts` n'est pas incrémenté : sans trace, la ligne peut
                // retenter indéfiniment sans jamais atteindre `.exhausted`.
                outboxFlusherLog.error("Failure state not persisted for \(failedSnapshot.id, privacy: .public), retry budget not consumed: \(error.localizedDescription, privacy: .public)")
            }

            // Wave 1 Task 3.6 + Phase 4 prereq — emit BOTH the outcome
            // callback (Phase 4 cmid→outcome correlation channel for one-shot
            // subscribers) AND the unified `retryExhausted` Combine signal
            // (Tier C — for active ViewModels reconciling optimistic rows).
            // The two are complementary: `onOutcome` is the cmid bridge,
            // `OfflineQueue.retryExhausted` carries the typed kind+reaction
            // context. Lives in the flusher because it owns the attempt-count
            // bookkeeping. `reactionContext(for:)` decodes the payload
            // best-effort and falls back to `nil` for non-reaction kinds or
            // corrupt rows.
            if current.status == .exhausted {
                // A7+A8 — terminal failure: the local payload file (e.g.,
                // pending-audio/.m4a) would otherwise leak forever. Best-
                // effort delete before emitting the exhausted outcome.
                cleanupLocalFiles(for: current)
                onOutcome?(.exhausted(cmid: current.clientMessageId))
                OfflineQueue.shared.emitRetryExhausted(OfflineRetryExhausted(
                    kind: current.kind,
                    clientMessageId: current.clientMessageId,
                    conversationId: current.conversationId,
                    reaction: reactionContext(for: current),
                    lastError: current.lastError
                ))
            }
        }
    }
}
