import XCTest
import GRDB
@testable import MeeshySDK

/// P0 (revue local-first 2026-08-01, fiche outbox-01) — `retryAll()`, le
/// chemin chaud hérité qui rejoue le miroir mémoire sur chaque front
/// socket/réseau, ne doit JAMAIS rejouer un item porteur de fichiers locaux :
/// seul l'OutboxFlusher sait les uploader via TUS. Le rejouer ici envoyait la
/// légende seule en REST puis supprimait la row outbox sur succès — les
/// fichiers n'étaient plus jamais uploadés (perte média silencieuse).
final class OfflineQueueRetryAllMediaGuardTests: XCTestCase {

    private actor CallCounter {
        private(set) var count = 0
        func increment() { count += 1 }
    }

    private var pool: DatabaseQueue!
    private var queue: OfflineQueue { OfflineQueue.shared }

    override func setUp() async throws {
        try await super.setUp()
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await queue.configure(pool: pool)
        await queue.clearAll()
        try await pool.write { db in try db.execute(sql: "DELETE FROM outbox") }
    }

    override func tearDown() async throws {
        await queue.setRetrySend { @Sendable _ in nil }
        await queue.clearAll()
        try? await pool.write { db in try db.execute(sql: "DELETE FROM outbox") }
        pool = nil
        try await super.tearDown()
    }

    private func outboxRowCount() async throws -> Int {
        try await pool.read { db in try OutboxRecord.fetchCount(db) }
    }

    func test_retryAll_itemWithLocalMediaPaths_keepsRowAndSkipsSend() async throws {
        let item = OfflineQueueItem(
            conversationId: "conv-media",
            content: "légende à préserver",
            localMediaPaths: ["/tmp/pending-media/fake.jpg"]
        )
        try await queue.enqueue(item)

        let counter = CallCounter()
        await queue.setRetrySend { @Sendable _ in
            await counter.increment()
            return "server-should-never-happen"
        }

        await queue.retryAll()

        let sends = await counter.count
        XCTAssertEqual(sends, 0, "retryAll ne doit pas rejouer un item média en texte-only")
        let rows = try await outboxRowCount()
        XCTAssertEqual(rows, 1, "la row outbox doit survivre pour le flusher (upload TUS)")
    }

    func test_retryAll_itemWithLocalAudioPaths_skipped() async throws {
        let multi = OfflineQueueItem(
            conversationId: "conv-audio",
            content: "",
            localAudioPaths: ["/tmp/pending-media/a.m4a"]
        )
        let single = OfflineQueueItem(
            conversationId: "conv-audio",
            content: "",
            localAudioPath: "/tmp/pending-media/b.m4a"
        )
        try await queue.enqueue(multi)
        try await queue.enqueue(single)

        let counter = CallCounter()
        await queue.setRetrySend { @Sendable _ in
            await counter.increment()
            return "server-should-never-happen"
        }

        await queue.retryAll()

        let sends = await counter.count
        XCTAssertEqual(sends, 0, "ni localAudioPaths ni localAudioPath ne doivent partir en texte-only")
        let rows = try await outboxRowCount()
        XCTAssertEqual(rows, 2, "les deux rows audio doivent survivre pour le flusher")
    }

    func test_retryAll_textItemWithoutMedia_stillSent() async throws {
        let item = OfflineQueueItem(conversationId: "conv-text", content: "hello")
        try await queue.enqueue(item)

        let counter = CallCounter()
        await queue.setRetrySend { @Sendable _ in
            await counter.increment()
            return "server-text-1"
        }

        await queue.retryAll()

        let sends = await counter.count
        XCTAssertEqual(sends, 1, "un item texte pur reste rejoué par le chemin chaud (non-régression)")
        let rows = try await outboxRowCount()
        XCTAssertEqual(rows, 0, "la row d'un envoi réussi est bien supprimée")
    }
}
