import Foundation
import GRDB
import os

/// La file DURABLE des événements v2 (#10500) — jumelle d'`EngagementOutbox`,
/// jamais mêlée à elle : un refus de la v2 ne touche aucun comptage.
///
/// Chaque événement est rangé ENCODÉ sous son `eventId` : un rejeu renvoie
/// les mêmes octets, donc le même identifiant, que la passerelle dédoublonne.
/// La file appartient à un PROPRIÉTAIRE (l'id du compte, ou `visitor`) : un
/// événement du compte A ne part jamais sous le jeton du compte B.
///
/// Bornée : 5 000 lignes au plus (les plus anciennes partent), et rien de plus
/// vieux que 72 h ne part (la passerelle l'ignorerait).
public actor SocialEventsV2Outbox {
    public static let shared = SocialEventsV2Outbox()
    public static let visitorOwner = "visitor"
    public static let maxRows = 5_000

    private let storage: DatabaseQueue?
    private var db: DatabaseQueue {
        get throws {
            guard let storage else { throw DatabaseStorageUnavailable() }
            return storage
        }
    }
    private let now: @Sendable () -> Date
    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "social-events-v2-outbox")

    private static func backoff(attempts: Int) -> TimeInterval {
        min(300, pow(2.0, Double(max(0, attempts))) * 5)
    }

    public init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        self.init(storage: ResilientDatabaseQueue.open(path: dir.appendingPathComponent("meeshy_social_events_v2.db").path))
    }

    public init(dbPath: String?, clock: @escaping @Sendable () -> Date = { Date() }) {
        self.init(storage: ResilientDatabaseQueue.open(path: dbPath), clock: clock)
    }

    init(storage opened: OpenedDatabaseQueue, clock: @escaping @Sendable () -> Date = { Date() }) {
        self.storage = Self.prepare(opened)
        self.now = clock
    }

    private static func prepare(_ opened: OpenedDatabaseQueue) -> DatabaseQueue? {
        switch opened {
        case .persistent:
            break
        case .memoryFallback(_, let diskError):
            logger.error("On-disk social events v2 outbox unavailable, falling back to memory: \(diskError, privacy: .public)")
        case .unavailable(let diskError, let memoryError):
            logger.fault("Social events v2 outbox has no storage at all, events are dropped: disk=\(diskError, privacy: .public) memory=\(memoryError, privacy: .public)")
        }
        guard let queue = opened.queue else { return nil }
        createSchemaOrLog(in: queue)
        return queue
    }

    private static func createSchemaOrLog(in queue: DatabaseQueue) {
        do {
            try queue.write { db in
                try db.create(table: "social_events_v2", ifNotExists: true) { t in
                    t.column("event_id", .text).primaryKey()
                    t.column("owner", .text).notNull()
                    t.column("payload", .blob).notNull()
                    t.column("occurred_at", .double).notNull()
                    t.column("attempts", .integer).notNull().defaults(to: 0)
                    t.column("next_retry_at", .double)
                }
                try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_sev2_owner ON social_events_v2(owner, next_retry_at, occurred_at)")
            }
        } catch {
            logger.fault("Social events v2 outbox schema creation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Met en file. Un événement de plus de 2 Kio ou déjà présent (même
    /// `eventId`) n'entre pas. Rend le nombre d'événements ajoutés.
    @discardableResult
    public func enqueue(_ events: [SocialEventV2], owner: String) async -> Int {
        let rows: [(String, Data, Double)] = events.compactMap { event in
            guard let data = try? SocialEventsV2Wire.encode(event) else { return nil }
            return (event.eventId, data, event.occurredAt.timeIntervalSince1970)
        }
        return await insert(rows, owner: owner)
    }

    /// Des événements DÉJÀ encodés (la boîte de l'extension de notification) :
    /// identifiant et heure relus dans l'événement lui-même.
    @discardableResult
    public func enqueue(encoded payloads: [Data], owner: String) async -> Int {
        let rows: [(String, Data, Double)] = payloads.compactMap { data in
            guard data.count <= SocialEventsV2Wire.maxEventBytes,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = object["eventId"] as? String, !id.isEmpty,
                  let occurred = (object["occurredAt"] as? String).flatMap(SocialEventsV2Wire.date(fromISO:)) else { return nil }
            return (id, data, occurred.timeIntervalSince1970)
        }
        return await insert(rows, owner: owner)
    }

    private func insert(_ rows: [(String, Data, Double)], owner: String) async -> Int {
        guard !rows.isEmpty else { return 0 }
        do {
            return try await db.write { db -> Int in
                var inserted = 0
                for (id, data, occurredAt) in rows {
                    try db.execute(sql: """
                        INSERT OR IGNORE INTO social_events_v2 (event_id, owner, payload, occurred_at)
                        VALUES (?, ?, ?, ?)
                        """, arguments: [id, owner, data, occurredAt])
                    inserted += db.changesCount
                }
                try db.execute(sql: """
                    DELETE FROM social_events_v2 WHERE event_id IN (
                      SELECT event_id FROM social_events_v2 ORDER BY occurred_at DESC LIMIT -1 OFFSET ?
                    )
                    """, arguments: [Self.maxRows])
                return inserted
            }
        } catch {
            Self.logger.error("enqueue failed, \(rows.count, privacy: .public) v2 event(s) lost: \(error.localizedDescription, privacy: .public)")
            return 0
        }
    }

    public func pendingEventIds(owner: String) async -> [String] {
        (try? await db.read { db in
            try String.fetchAll(db, sql: "SELECT event_id FROM social_events_v2 WHERE owner = ? ORDER BY occurred_at ASC", arguments: [owner])
        }) ?? []
    }

    public func pendingCount(owner: String) async -> Int {
        (try? await db.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM social_events_v2 WHERE owner = ?", arguments: [owner]) ?? 0
        }) ?? 0
    }

    /// Envoie un lot (≤ 50) du propriétaire et range le résultat. `nil` : rien
    /// à envoyer.
    @discardableResult
    public func flush(
        owner: String,
        batchSize: Int = SocialEventsV2Wire.batchSize,
        via dispatch: @Sendable @concurrent ([Data]) async -> SocialEventsV2Outcome
    ) async -> SocialEventsV2Outcome? {
        let nowTs = now().timeIntervalSince1970
        let ready: [(String, Data, Int)]
        do {
            ready = try await db.write { db -> [(String, Data, Int)] in
                try db.execute(sql: "DELETE FROM social_events_v2 WHERE occurred_at < ?", arguments: [nowTs - SocialEventsV2Wire.maxAge])
                let rows = try Row.fetchAll(db, sql: """
                    SELECT event_id, payload, attempts FROM social_events_v2
                    WHERE owner = ? AND (next_retry_at IS NULL OR next_retry_at <= ?)
                    ORDER BY occurred_at ASC LIMIT ?
                    """, arguments: [owner, nowTs, batchSize])
                return rows.map { row -> (String, Data, Int) in
                    let id: String = row["event_id"]
                    let payload: Data = row["payload"]
                    let attempts: Int = row["attempts"]
                    return (id, payload, attempts)
                }
            }
        } catch {
            Self.logger.error("v2 flush read failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        guard !ready.isEmpty, !Task.isCancelled else { return nil }
        let outcome = await dispatch(ready.map(\.1))
        let ids = ready.map(\.0)
        do {
            try await db.write { db in
                switch outcome {
                case .delivered, .unsupported, .refused:
                    try db.execute(
                        sql: "DELETE FROM social_events_v2 WHERE event_id IN (\(databaseQuestionMarks(count: ids.count)))",
                        arguments: StatementArguments(ids))
                case .transient:
                    for (id, _, attempts) in ready {
                        try db.execute(
                            sql: "UPDATE social_events_v2 SET attempts = attempts + 1, next_retry_at = ? WHERE event_id = ?",
                            arguments: [nowTs + Self.backoff(attempts: attempts + 1), id])
                    }
                }
            }
        } catch {
            Self.logger.error("v2 flush bookkeeping failed: \(error.localizedDescription, privacy: .public)")
        }
        return outcome
    }

    /// Un refus de forme (400) : toute la file v2 est jetée, sans rejeu.
    public func dropAll(owner: String) async {
        _ = try? await db.write { db in
            try db.execute(sql: "DELETE FROM social_events_v2 WHERE owner = ?", arguments: [owner])
        }
    }

    /// À la déconnexion : la file d'un compte ne survit pas à son départ.
    public func purgeAll() async {
        _ = try? await db.write { db in try db.execute(sql: "DELETE FROM social_events_v2") }
    }
}
