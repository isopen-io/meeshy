import Foundation
import GRDB

// MARK: - Public types

/// One queued mutation waiting for dispatch (or retry).
///
/// Persisted in SQLite so the queue survives app kill. Schema-versioned
/// so a row written by a newer build than the one currently running is
/// dropped at boot instead of crashing the outbox loader.
public struct OutboxTask: Sendable, Hashable {
    public let id: UUID
    public let convId: String
    public let mutation: UserStateMutation
    public let createdAt: Date
    public var attempts: Int
    public var nextRetryAt: Date?
    public let schemaVersion: Int

    /// Coalescing key derived from the mutation. Two tasks with the same
    /// (convId, key) collapse — the new one replaces the old in
    /// `enqueue`. `deleteForUser` / `leave` produce unique keys per call
    /// so they never coalesce.
    public var coalescingKey: String { mutation.coalescingKey }

    public static let currentSchemaVersion: Int = 1

    public init(
        id: UUID = UUID(),
        convId: String,
        mutation: UserStateMutation,
        createdAt: Date = Date(),
        attempts: Int = 0,
        nextRetryAt: Date? = nil,
        schemaVersion: Int = OutboxTask.currentSchemaVersion
    ) {
        self.id = id
        self.convId = convId
        self.mutation = mutation
        self.createdAt = createdAt
        self.attempts = attempts
        self.nextRetryAt = nextRetryAt
        self.schemaVersion = schemaVersion
    }
}

/// Tags returned by `flush` to tell the outbox whether to keep, retry,
/// or drop the task after dispatch.
public enum OutboxDispatchOutcome: Sendable {
    /// Server acknowledged — drop the task.
    case completed
    /// Permanent failure (4xx). Drop the task; the caller is expected to
    /// roll back the optimistic state upstream.
    case failedPermanent(reason: String)
    /// Transient failure (network, 5xx). Keep the task, bump attempts,
    /// schedule a retry.
    case failedTransient(reason: String)
}

/// Backoff schedule per design §4.5: `min(60s, 2^attempts × 5s)`.
public enum OutboxBackoff {
    public static let baseSeconds: TimeInterval = 5
    public static let capSeconds: TimeInterval = 60

    public static func nextDelay(forAttempts attempts: Int) -> TimeInterval {
        let exponent = max(0, attempts)
        let raw = pow(2.0, Double(exponent)) * baseSeconds
        return min(capSeconds, raw)
    }
}

// MARK: - Outbox actor

/// Append-and-flush queue for `UserStateMutation`s waiting on the
/// network. Persisted in SQLite (GRDB) under the SDK documents
/// directory so the queue survives app kill.
///
/// Concurrency model: an `actor`, so all mutating accesses serialize.
/// The persisted backing is a `DatabaseQueue` (write-serial too).
///
/// Local-only mutations (`UserStateMutation.isLocalOnly == true`) are
/// silently rejected by `enqueue` — they should be applied directly to
/// the Store without ever touching the network.
public actor ConversationStateOutbox {
    public static let shared = ConversationStateOutbox()

    private let db: DatabaseQueue
    private var pending: [UUID: OutboxTask] = [:]
    private var indexByCoalescingKey: [CoalescingKey: UUID] = [:]
    private let now: @Sendable () -> Date

    private struct CoalescingKey: Hashable {
        let convId: String
        let key: String
    }

    // MARK: Init

    private init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = dir.appendingPathComponent("meeshy_conversation_outbox.db").path
        let queue = Self.makeQueue(path: path)
        self.db = queue
        self.now = { Date() }
        let snapshot = Self.hydrateFromDisk(db: queue)
        self.pending = snapshot.pending
        self.indexByCoalescingKey = snapshot.index
    }

    /// Test-only init that allows injecting a path and a clock.
    public init(dbPath: String, clock: @escaping @Sendable () -> Date = { Date() }) {
        let queue = Self.makeQueue(path: dbPath)
        self.db = queue
        self.now = clock
        let snapshot = Self.hydrateFromDisk(db: queue)
        self.pending = snapshot.pending
        self.indexByCoalescingKey = snapshot.index
    }

    private static func makeQueue(path: String) -> DatabaseQueue {
        if let disk = try? DatabaseQueue(path: path) {
            try? Self.createSchema(in: disk)
            return disk
        }
        guard let fallback = try? DatabaseQueue() else {
            fatalError("[ConversationStateOutbox] Cannot create in-memory GRDB queue — out of memory")
        }
        try? Self.createSchema(in: fallback)
        return fallback
    }

    private static func createSchema(in db: DatabaseQueue) throws {
        try db.write { db in
            try db.create(table: "conversation_outbox_tasks", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("conv_id", .text).notNull().indexed()
                t.column("mutation_json", .text).notNull()
                t.column("created_at", .double).notNull()
                t.column("attempts", .integer).notNull().defaults(to: 0)
                t.column("next_retry_at", .double)
                t.column("schema_version", .integer).notNull()
                t.column("coalescing_key", .text).notNull()
            }
            // Raw SQL for indices — avoids version-dependent GRDB API
            // (`db.create(index:on:columns:)` signature shifted across
            // GRDB 6 / 7) and is supported on every SQLite build.
            try db.execute(sql: """
                CREATE INDEX IF NOT EXISTS idx_outbox_conv_coalescing
                  ON conversation_outbox_tasks (conv_id, coalescing_key)
                """)
            try db.execute(sql: """
                CREATE INDEX IF NOT EXISTS idx_outbox_retry
                  ON conversation_outbox_tasks (next_retry_at)
                """)
        }
    }

    /// Synchronous hydration called from `init`. Loading inline (rather
    /// than from a detached `Task`) avoids a race where the hydrator's
    /// suspension on `await db.read` released the actor, let subsequent
    /// `enqueue` calls mutate `pending` + DB, then the hydrator resumed
    /// with the stale snapshot and stomped over the live state.
    private static func hydrateFromDisk(
        db: DatabaseQueue
    ) -> (pending: [UUID: OutboxTask], index: [CoalescingKey: UUID]) {
        let rows: [Row] = (try? db.read { db in
            try Row.fetchAll(db, sql: "SELECT * FROM conversation_outbox_tasks")
        }) ?? []

        var pending: [UUID: OutboxTask] = [:]
        var index: [CoalescingKey: UUID] = [:]

        for row in rows {
            guard let task = decodeRow(row) else {
                // Schema mismatch (newer build wrote this row) or corrupt
                // JSON — drop it; the upstream optimistic UI will need to
                // be reconciled on the next list refresh.
                if let idStr: String = row["id"], let uuid = UUID(uuidString: idStr) {
                    _ = try? db.write { db in
                        try db.execute(
                            sql: "DELETE FROM conversation_outbox_tasks WHERE id = ?",
                            arguments: [uuid.uuidString]
                        )
                    }
                }
                continue
            }
            pending[task.id] = task
            index[CoalescingKey(convId: task.convId, key: task.coalescingKey)] = task.id
        }

        return (pending, index)
    }

    // MARK: - Public API

    /// Enqueue a mutation. Local-only mutations are silently rejected.
    /// Returns the task that ended up persisted (either the new one, or
    /// an overwritten existing one with the same coalescing key).
    @discardableResult
    public func enqueue(_ mutation: UserStateMutation, for convId: String) -> OutboxTask? {
        if mutation.isLocalOnly { return nil }

        let key = CoalescingKey(convId: convId, key: mutation.coalescingKey)

        if let existingId = indexByCoalescingKey[key], let existing = pending[existingId] {
            // Overwrite: same field already pending → replace mutation,
            // reset retry state (caller intent supersedes prior). UUID
            // is preserved; the flush loop guards against stale outcomes
            // on a coalesced task by comparing the dispatched mutation
            // against the post-dispatch pending state.
            let replaced = OutboxTask(
                id: existing.id,
                convId: convId,
                mutation: mutation,
                createdAt: existing.createdAt,
                attempts: 0,
                nextRetryAt: nil,
                schemaVersion: existing.schemaVersion
            )
            pending[existing.id] = replaced
            upsertRow(replaced)
            return replaced
        }

        let task = OutboxTask(convId: convId, mutation: mutation, createdAt: now())
        pending[task.id] = task
        indexByCoalescingKey[key] = task.id
        upsertRow(task)
        return task
    }

    /// Count of pending tasks for a conversation (drives the UI's
    /// "pending sync" affordance on the row).
    public func pendingCount(for convId: String) -> Int {
        pending.values.reduce(0) { $0 + ($1.convId == convId ? 1 : 0) }
    }

    public func allPending() -> [OutboxTask] {
        Array(pending.values).sorted { $0.createdAt < $1.createdAt }
    }

    public func markCompleted(_ id: UUID) {
        guard let task = pending.removeValue(forKey: id) else { return }
        indexByCoalescingKey.removeValue(forKey: CoalescingKey(convId: task.convId, key: task.coalescingKey))
        deleteRow(id: id)
    }

    public func markFailedPermanent(_ id: UUID, reason: String) {
        // Permanent failure: same as completed from a queue-state
        // perspective. The upstream Store handles the user-visible
        // rollback before calling this.
        markCompleted(id)
    }

    public func markFailedTransient(_ id: UUID, reason: String) {
        guard var task = pending[id] else { return }
        task.attempts += 1
        let delay = OutboxBackoff.nextDelay(forAttempts: task.attempts)
        task.nextRetryAt = now().addingTimeInterval(delay)
        pending[id] = task
        upsertRow(task)
    }

    /// Dispatch all tasks that are ready (`nextRetryAt == nil` or
    /// `<= now()`), in FIFO order, via the provided closure. The closure
    /// returns the outcome; the outbox applies it (drop / bump retry).
    ///
    /// Pass `force: true` to bypass the backoff gate and dispatch ALL
    /// pending tasks immediately — use this for explicit reconnect flushes
    /// where network availability is confirmed and backoff is no longer
    /// appropriate.
    ///
    /// Concurrency: tasks are dispatched sequentially. A future
    /// optimization could parallelize across distinct conversations,
    /// but the current scale (a handful of pending writes) does not
    /// justify the complexity.
    public func flush(
        force: Bool = false,
        via dispatch: @Sendable (OutboxTask) async -> OutboxDispatchOutcome
    ) async {
        let nowDate = now()
        let ready = pending.values
            .filter { task in
                if force { return true }
                guard let retry = task.nextRetryAt else { return true }
                return retry <= nowDate
            }
            .sorted { $0.createdAt < $1.createdAt }

        for task in ready {
            // The task could have been mutated by a concurrent enqueue
            // call between selection and dispatch; re-read.
            guard let current = pending[task.id] else { continue }
            let outcome = await dispatch(current)

            // Concurrency guard: if the task was overwritten while we
            // were on the network (same UUID, new mutation — coalescing
            // case), the dispatch outcome reflects the OLD mutation but
            // the queue now holds the NEW one. Keep the new task for the
            // next flush and discard the obsolete outcome.
            guard let postDispatch = pending[current.id],
                  postDispatch.mutation == current.mutation else {
                continue
            }

            switch outcome {
            case .completed:
                markCompleted(current.id)
            case .failedPermanent(let reason):
                markFailedPermanent(current.id, reason: reason)
            case .failedTransient(let reason):
                markFailedTransient(current.id, reason: reason)
            }
        }
    }

    // MARK: - Persistence helpers

    private func upsertRow(_ task: OutboxTask) {
        guard let json = encodeMutation(task.mutation) else { return }
        try? db.write { db in
            try db.execute(
                sql: """
                INSERT OR REPLACE INTO conversation_outbox_tasks
                  (id, conv_id, mutation_json, created_at, attempts, next_retry_at, schema_version, coalescing_key)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                arguments: [
                    task.id.uuidString,
                    task.convId,
                    json,
                    task.createdAt.timeIntervalSince1970,
                    task.attempts,
                    task.nextRetryAt?.timeIntervalSince1970,
                    task.schemaVersion,
                    task.coalescingKey,
                ]
            )
        }
    }

    private func deleteRow(id: UUID) {
        try? db.write { db in
            try db.execute(
                sql: "DELETE FROM conversation_outbox_tasks WHERE id = ?",
                arguments: [id.uuidString]
            )
        }
    }

    private func encodeMutation(_ mutation: UserStateMutation) -> String? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(mutation),
              let str = String(data: data, encoding: .utf8) else { return nil }
        return str
    }

    private static func decodeRow(_ row: Row) -> OutboxTask? {
        guard let idStr: String = row["id"], let id = UUID(uuidString: idStr),
              let convId: String = row["conv_id"],
              let mutationJSON: String = row["mutation_json"],
              let createdAtRaw: Double = row["created_at"],
              let attempts: Int = row["attempts"],
              let schemaVersion: Int = row["schema_version"]
        else { return nil }

        // Forward-incompatible row written by a newer build.
        if schemaVersion > OutboxTask.currentSchemaVersion {
            return nil
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let data = mutationJSON.data(using: .utf8),
              let mutation = try? decoder.decode(UserStateMutation.self, from: data)
        else { return nil }

        let nextRetryRaw: Double? = row["next_retry_at"]
        return OutboxTask(
            id: id,
            convId: convId,
            mutation: mutation,
            createdAt: Date(timeIntervalSince1970: createdAtRaw),
            attempts: attempts,
            nextRetryAt: nextRetryRaw.map { Date(timeIntervalSince1970: $0) },
            schemaVersion: schemaVersion
        )
    }
}
