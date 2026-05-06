import Foundation
import GRDB

public protocol OutboxDispatching: Sendable {
    func dispatch(_ record: OutboxRecord) async throws
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

    public init(
        pool: any DatabaseWriter,
        dispatcher: any OutboxDispatching,
        maxAttempts: Int = 5,
        baseBackoff: TimeInterval = 2,
        maxBackoff: TimeInterval = 30
    ) {
        self.pool = pool
        self.dispatcher = dispatcher
        self.maxAttempts = maxAttempts
        self.baseBackoff = baseBackoff
        self.maxBackoff = maxBackoff
    }

    public func flush() async {
        let now = Date()
        let pending: [OutboxRecord] = (try? await pool.read { db in
            try OutboxRecord
                .filter(Column("status") == OutboxStatus.pending.rawValue)
                .filter(Column("nextAttemptAt") <= now)
                .order(Column("createdAt").asc)
                .limit(50)
                .fetchAll(db)
        }) ?? []

        for record in pending {
            await processRecord(record)
        }
    }

    private func processRecord(_ record: OutboxRecord) async {
        var current = record
        current.status = .inflight
        current.updatedAt = Date()
        let inflightSnapshot = current
        try? await pool.write { db in
            try inflightSnapshot.update(db)
        }

        do {
            try await dispatcher.dispatch(current)
            let idToDelete = current.id
            try? await pool.write { db in
                try OutboxRecord.deleteOne(db, key: idToDelete)
            }
        } catch {
            current.attempts += 1
            current.lastError = String(describing: error)
            current.updatedAt = Date()

            if current.attempts >= maxAttempts {
                current.status = .exhausted
            } else {
                current.status = .pending
                let backoff = min(maxBackoff, baseBackoff * pow(2.0, Double(current.attempts - 1)))
                let jitter = Double.random(in: 0...0.5)
                current.nextAttemptAt = Date().addingTimeInterval(backoff + jitter)
            }

            let failedSnapshot = current
            try? await pool.write { db in
                try failedSnapshot.update(db)
            }
        }
    }
}
