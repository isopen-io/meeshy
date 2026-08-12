import Foundation
import GRDB
import os

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
    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "engagement-outbox")

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
        do {
            queue = try DatabaseQueue(path: path)
        } catch {
            // Bascule mémoire : l'outbox fonctionne mais NE SURVIT PLUS aux
            // relancements — toute session non dépilée est perdue au kill.
            Self.logger.error("On-disk engagement outbox unavailable, falling back to memory (sessions will not survive relaunch): \(error.localizedDescription, privacy: .public)")
            do {
                queue = try DatabaseQueue()
            } catch {
                fatalError("[EngagementOutbox] Cannot create in-memory GRDB queue — out of memory: \(error)")
            }
        }
        do {
            try createSchema(in: queue)
        } catch {
            // Sans schéma, toutes les requêtes suivantes échoueront en cascade.
            Self.logger.fault("Engagement outbox schema creation failed — every subsequent query will fail: \(error.localizedDescription, privacy: .public)")
        }
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

    /// Encodes a session to its stored JSON text, logging instead of
    /// returning a bare `nil` — a dropped encode means the session never
    /// reaches the server and no counter would ever show it.
    private static func encodedText(_ session: EngagementSession, context: String) -> String? {
        do {
            let json = try encoder.encode(session)
            guard let text = String(data: json, encoding: .utf8) else {
                logger.error("\(context, privacy: .public): encoded session is not valid UTF-8, dropped [\(session.sessionId, privacy: .public)]")
                return nil
            }
            return text
        } catch {
            logger.error("\(context, privacy: .public): session encode failed, dropped [\(session.sessionId, privacy: .public)]: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    public func beginSession(_ session: EngagementSession) async {
        guard let text = Self.encodedText(session, context: "beginSession") else { return }
        let createdAt = now().timeIntervalSince1970
        do {
            try await db.write { db in
            try db.execute(sql: """
                INSERT OR REPLACE INTO engagement_sessions
                (session_id, lifecycle, payload_json, created_at, attempts, next_retry_at)
                VALUES (?, 'open', ?, ?, 0, NULL)
                """, arguments: [session.sessionId, text, createdAt])
            }
        } catch {
            Self.logger.error("beginSession not persisted for \(session.sessionId, privacy: .public) — a crash will lose this session: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func finalizeSession(_ session: EngagementSession) async {
        guard let text = Self.encodedText(session, context: "finalizeSession") else { return }
        do {
            try await db.write { db in
            // Only finalize rows still .open — never re-touch already-finalized (avoids double-finalize).
            try db.execute(sql: """
                UPDATE engagement_sessions
                SET lifecycle = 'finalized', payload_json = ?, next_retry_at = NULL
                WHERE session_id = ? AND lifecycle = 'open'
                """, arguments: [text, session.sessionId])
            }
        } catch {
            Self.logger.error("finalizeSession not persisted for \(session.sessionId, privacy: .public) — session stays .open and will be swept as truncated: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Persist the current dwell/watch into the open row (crash-resilience checkpoint).
    public func checkpoint(_ session: EngagementSession) async {
        guard let text = Self.encodedText(session, context: "checkpoint") else { return }
        do {
            try await db.write { db in
                try db.execute(sql: """
                    UPDATE engagement_sessions SET payload_json = ?
                    WHERE session_id = ? AND lifecycle = 'open'
                    """, arguments: [text, session.sessionId])
            }
        } catch {
            // Checkpoint = résilience au crash uniquement ; la session en
            // mémoire reste correcte.
            Self.logger.error("checkpoint not persisted for \(session.sessionId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// At boot, finalize orphan .open rows (crashed sessions) with truncated=true.
    public func bootSweep() async {
        do {
            try await db.write { db in
            let rows = try Row.fetchAll(db, sql: "SELECT session_id, payload_json FROM engagement_sessions WHERE lifecycle = 'open'")
            for row in rows {
                let id: String = row["session_id"]
                let text: String = row["payload_json"]
                guard let data = text.data(using: .utf8),
                      let s = Self.decoder.decodeOrLog(EngagementSession.self, from: data,
                                                       field: "engagement payload (bootSweep)",
                                                       id: id, logger: Self.logger) else { continue }
                let truncated = EngagementSession(
                    sessionId: s.sessionId, userId: s.userId, postId: s.postId,
                    contentType: s.contentType, surface: s.surface, startedAt: s.startedAt,
                    dwellMs: s.dwellMs, watchMs: s.watchMs, mediaDurationMs: s.mediaDurationMs,
                    completed: s.completed, truncated: true, consent: s.consent,
                    actions: s.actions, watchSamples: s.watchSamples
                )
                guard let newText = Self.encodedText(truncated, context: "bootSweep") else { continue }
                try db.execute(sql: """
                    UPDATE engagement_sessions SET lifecycle = 'finalized', payload_json = ?, next_retry_at = NULL
                    WHERE session_id = ?
                    """, arguments: [newText, id])
                }
            }
        } catch {
            // Les lignes orphelines restent `.open` : elles ne seront jamais
            // dépilées et occuperont la table jusqu'à la purge.
            Self.logger.error("bootSweep failed — orphan sessions stay .open and are never dispatched: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func purge(olderThan cutoff: Date, maxRows: Int) async {
        let cutoffTs = cutoff.timeIntervalSince1970
        do {
            try await db.write { db in
            try db.execute(sql: "DELETE FROM engagement_sessions WHERE lifecycle = 'finalized' AND created_at < ?", arguments: [cutoffTs])
            // Row cap — evict oldest finalized beyond maxRows.
            try db.execute(sql: """
                DELETE FROM engagement_sessions WHERE session_id IN (
                  SELECT session_id FROM engagement_sessions WHERE lifecycle = 'finalized'
                  ORDER BY created_at DESC LIMIT -1 OFFSET ?
                )
                """, arguments: [maxRows])
            }
        } catch {
            Self.logger.error("Engagement purge failed, table keeps growing: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func purgeAll() async {
        do {
            try await db.write { db in try db.execute(sql: "DELETE FROM engagement_sessions") }
        } catch {
            Self.logger.error("purgeAll failed, engagement rows retained: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func flush(via dispatch: @Sendable ([EngagementSession]) async -> EngagementDispatchOutcome) async {
        let nowTs = now().timeIntervalSince1970
        let ready: [(String, EngagementSession, Int)]
        do {
            ready = try await db.read { db -> [(String, EngagementSession, Int)] in
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
                      let s = Self.decoder.decodeOrLog(EngagementSession.self, from: data,
                                                       field: "engagement payload (flush)",
                                                       id: id, logger: Self.logger) else { return nil }
                return (id, s, attempts)
                }
            }
        } catch {
            Self.logger.error("Engagement flush read failed — nothing dispatched this pass: \(error.localizedDescription, privacy: .public)")
            ready = []
        }

        // Dispatch ALL ready rows as ONE batch. The endpoint accepts an array and
        // is rate-limited at 20/min per user — one POST for ≤50 sessions instead
        // of one-POST-per-session, which used to hammer /posts/engagement/batch
        // into 429s. A bounded caller (background transition) cancels this task
        // when its budget is spent: skip the dispatch, the rows stay `finalized`.
        guard !ready.isEmpty, !Task.isCancelled else { return }
        let sessions = ready.map { $0.1 }
        let ids = ready.map { $0.0 }

        switch await dispatch(sessions) {
        case .completed, .failedPermanent:
            let placeholders = databaseQuestionMarks(count: ids.count)
            do {
                try await db.write { db in
                    try db.execute(
                        sql: "DELETE FROM engagement_sessions WHERE session_id IN (\(placeholders))",
                        arguments: StatementArguments(ids))
                }
            } catch {
                // Le serveur a DÉJÀ accepté ce lot : les lignes non supprimées
                // seront renvoyées au prochain flush (doublons côté backend).
                Self.logger.error("Dispatched rows not deleted — \(ids.count, privacy: .public) session(s) will be re-sent as duplicates: \(error.localizedDescription, privacy: .public)")
            }
        case .failedTransient:
            let bumps: [(String, Double)] = ready.map { (id, _, attempts) in
                (id, now().addingTimeInterval(Self.backoff(attempts: attempts + 1)).timeIntervalSince1970)
            }
            do {
                try await db.write { db in
                    for (id, next) in bumps {
                        try db.execute(
                            sql: "UPDATE engagement_sessions SET attempts = attempts + 1, next_retry_at = ? WHERE session_id = ?",
                            arguments: [next, id])
                    }
                }
            } catch {
                // Sans le backoff persisté, le prochain flush retentera
                // immédiatement le même lot.
                Self.logger.error("Retry backoff not persisted, next flush will retry immediately: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
