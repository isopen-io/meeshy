import Foundation
import GRDB

public enum EngagementDispatchOutcome: Sendable, Equatable {
    case completed
    case failedPermanent
    case failedTransient
}

/// Durable append-only outbox for engagement sessions.
/// Modeled on `ConversationStateOutbox`: a dedicated `DatabaseQueue`, a single
/// table, and a `flush(via:)` drain. Two-state lifecycle (`open`/`finalized`):
/// only `finalized` rows are dispatched, so a session persisted at `begin()`
/// survives a crash and is recovered by `bootSweep()`.
public actor EngagementOutbox {
    public static let shared = EngagementOutbox()

    private let db: DatabaseQueue
    private let now: @Sendable () -> Date

    /// Backoff identique au pattern existant : min(60s, 2^attempts × 5s).
    private static func backoff(attempts: Int) -> TimeInterval {
        min(60, pow(2.0, Double(max(0, attempts))) * 5)
    }

    public init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = dir.appendingPathComponent("meeshy_engagement_outbox.db").path
        self.db = Self.makeQueue(path: path)
        self.now = { Date() }
    }

    /// Test-only / injectable init.
    public init(dbPath: String, clock: @escaping @Sendable () -> Date = { Date() }) {
        self.db = Self.makeQueue(path: dbPath)
        self.now = clock
    }

    private static func makeQueue(path: String) -> DatabaseQueue {
        let queue: DatabaseQueue
        if let disk = try? DatabaseQueue(path: path) {
            queue = disk
        } else if let mem = try? DatabaseQueue() {
            queue = mem
        } else {
            fatalError("[EngagementOutbox] Cannot create in-memory GRDB queue — out of memory")
        }
        try? createSchema(in: queue)
        return queue
    }

    private static func createSchema(in db: DatabaseQueue) throws {
        try db.write { db in
            try db.create(table: "engagement_sessions", ifNotExists: true) { t in
                t.column("session_id", .text).primaryKey()       // idempotence
                t.column("lifecycle", .text).notNull()           // "open" | "finalized"
                t.column("payload_json", .text).notNull()        // EngagementSession encodé
                t.column("created_at", .double).notNull()
                t.column("attempts", .integer).notNull().defaults(to: 0)
                t.column("next_retry_at", .double)
            }
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_eng_lifecycle ON engagement_sessions(lifecycle, next_retry_at)")
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_eng_created ON engagement_sessions(created_at)")
        }
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; e.dateEncodingStrategy = .iso8601; return e
    }()
    private static let decoder: JSONDecoder = {
        let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d
    }()

    public func beginSession(_ session: EngagementSession) async {
        guard let json = try? Self.encoder.encode(session),
              let text = String(data: json, encoding: .utf8) else { return }
        let createdAt = now().timeIntervalSince1970
        try? await db.write { db in
            try db.execute(sql: """
                INSERT OR REPLACE INTO engagement_sessions
                (session_id, lifecycle, payload_json, created_at, attempts, next_retry_at)
                VALUES (?, 'open', ?, ?, 0, NULL)
                """, arguments: [session.sessionId, text, createdAt])
        }
    }

    public func finalizeSession(_ session: EngagementSession) async {
        guard let json = try? Self.encoder.encode(session),
              let text = String(data: json, encoding: .utf8) else { return }
        try? await db.write { db in
            // Only finalize rows still .open — never re-touch already-finalized (avoids double-finalize).
            try db.execute(sql: """
                UPDATE engagement_sessions
                SET lifecycle = 'finalized', payload_json = ?, next_retry_at = NULL
                WHERE session_id = ? AND lifecycle = 'open'
                """, arguments: [text, session.sessionId])
        }
    }

    /// Persist the current dwell/watch into the open row (crash-resilience checkpoint).
    public func checkpoint(_ session: EngagementSession) async {
        guard let json = try? Self.encoder.encode(session),
              let text = String(data: json, encoding: .utf8) else { return }
        try? await db.write { db in
            try db.execute(sql: """
                UPDATE engagement_sessions SET payload_json = ?
                WHERE session_id = ? AND lifecycle = 'open'
                """, arguments: [text, session.sessionId])
        }
    }

    /// At boot, finalize orphan .open rows (crashed sessions) with truncated=true.
    public func bootSweep() async {
        try? await db.write { db in
            let rows = try Row.fetchAll(db, sql: "SELECT session_id, payload_json FROM engagement_sessions WHERE lifecycle = 'open'")
            for row in rows {
                let id: String = row["session_id"]
                let text: String = row["payload_json"]
                guard let data = text.data(using: .utf8),
                      let s = try? Self.decoder.decode(EngagementSession.self, from: data) else { continue }
                let truncated = EngagementSession(
                    sessionId: s.sessionId, userId: s.userId, postId: s.postId,
                    contentType: s.contentType, surface: s.surface, startedAt: s.startedAt,
                    dwellMs: s.dwellMs, watchMs: s.watchMs, mediaDurationMs: s.mediaDurationMs,
                    completed: s.completed, truncated: true, consent: s.consent,
                    actions: s.actions, watchSamples: s.watchSamples
                )
                guard let json = try? Self.encoder.encode(truncated),
                      let newText = String(data: json, encoding: .utf8) else { continue }
                try db.execute(sql: """
                    UPDATE engagement_sessions SET lifecycle = 'finalized', payload_json = ?, next_retry_at = NULL
                    WHERE session_id = ?
                    """, arguments: [newText, id])
            }
        }
    }

    public func purge(olderThan cutoff: Date, maxRows: Int) async {
        let cutoffTs = cutoff.timeIntervalSince1970
        try? await db.write { db in
            try db.execute(sql: "DELETE FROM engagement_sessions WHERE lifecycle = 'finalized' AND created_at < ?", arguments: [cutoffTs])
            // Row cap — evict oldest finalized beyond maxRows.
            try db.execute(sql: """
                DELETE FROM engagement_sessions WHERE session_id IN (
                  SELECT session_id FROM engagement_sessions WHERE lifecycle = 'finalized'
                  ORDER BY created_at DESC LIMIT -1 OFFSET ?
                )
                """, arguments: [maxRows])
        }
    }

    public func purgeAll() async {
        try? await db.write { db in try db.execute(sql: "DELETE FROM engagement_sessions") }
    }

    public func flush(via dispatch: @Sendable (EngagementSession) async -> EngagementDispatchOutcome) async {
        let nowTs = now().timeIntervalSince1970
        let ready: [(String, EngagementSession, Int)] = (try? await db.read { db -> [(String, EngagementSession, Int)] in
            let rows = try Row.fetchAll(db, sql: """
                SELECT session_id, payload_json, attempts FROM engagement_sessions
                WHERE lifecycle = 'finalized' AND (next_retry_at IS NULL OR next_retry_at <= ?)
                ORDER BY created_at ASC LIMIT 50
                """, arguments: [nowTs])
            return rows.compactMap { row in
                let id: String = row["session_id"]
                let text: String = row["payload_json"]
                let attempts: Int = row["attempts"]
                guard let data = text.data(using: .utf8),
                      let s = try? Self.decoder.decode(EngagementSession.self, from: data) else { return nil }
                return (id, s, attempts)
            }
        }) ?? []

        for (id, session, attempts) in ready {
            let outcome = await dispatch(session)
            switch outcome {
            case .completed:
                try? await db.write { db in try db.execute(sql: "DELETE FROM engagement_sessions WHERE session_id = ?", arguments: [id]) }
            case .failedPermanent:
                try? await db.write { db in try db.execute(sql: "DELETE FROM engagement_sessions WHERE session_id = ?", arguments: [id]) }
            case .failedTransient:
                let next = now().addingTimeInterval(Self.backoff(attempts: attempts + 1)).timeIntervalSince1970
                try? await db.write { db in
                    try db.execute(sql: "UPDATE engagement_sessions SET attempts = attempts + 1, next_retry_at = ? WHERE session_id = ?", arguments: [next, id])
                }
            }
        }
    }
}
