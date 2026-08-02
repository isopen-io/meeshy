import XCTest
import GRDB
@testable import MeeshySDK

/// P1 (revue local-first 2026-08-01, fiche outbox-05) — le coalescing
/// latest-wins de `.markAsRead` détruisait les `messageIds` des lots
/// précédents : offline, seuls les messages du DERNIER lot affiché étaient
/// marqués lus au serveur — contrat read-exactness violé (les autres
/// repartaient non lus multi-device).
final class OfflineQueueMarkAsReadCoalescingTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private var pool: DatabaseQueue!

    override func setUp() async throws {
        try await super.setUp()
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await queue.configure(pool: pool)
        await queue.clearAll()
        try await pool.write { db in try db.execute(sql: "DELETE FROM outbox") }
    }

    override func tearDown() async throws {
        await queue.clearAll()
        try? await pool.write { db in try db.execute(sql: "DELETE FROM outbox") }
        pool = nil
        try await super.tearDown()
    }

    private func enqueueMarkAsRead(
        conv: String = "conv-read",
        upTo: String,
        messageIds: [String]?,
        languages: [String: String]? = nil
    ) async throws {
        let payload = MarkAsReadPayload(
            clientMutationId: ClientMutationId.generate(),
            conversationId: conv,
            upToMessageId: upTo,
            messageIds: messageIds,
            language: nil,
            messageLanguages: languages,
            caughtUpToMessageId: nil
        )
        try await queue.enqueue(.markAsRead, payload: payload, conversationId: conv)
    }

    private func storedPayload() async throws -> MarkAsReadPayload {
        let rows = try await pool.read { db in
            try OutboxRecord
                .filter(Column("kind") == OutboxKind.markAsRead.rawValue)
                .fetchAll(db)
        }
        XCTAssertEqual(rows.count, 1, "le coalescing doit laisser UNE seule row par conversation")
        return try JSONDecoder().decode(MarkAsReadPayload.self, from: rows[0].payload)
    }

    func test_enqueueMarkAsRead_twoOfflineBatches_unionsMessageIds() async throws {
        try await enqueueMarkAsRead(upTo: "m3", messageIds: ["m1", "m2", "m3"])
        try await enqueueMarkAsRead(upTo: "m7", messageIds: ["m7"])

        let merged = try await storedPayload()

        XCTAssertEqual(merged.messageIds, ["m1", "m2", "m3", "m7"],
                       "les reçus de lecture des lots précédents sont des faits, pas un état à jeter")
        XCTAssertEqual(merged.upToMessageId, "m7", "le curseur reste celui du lot le plus récent")
    }

    func test_enqueueMarkAsRead_staleInformedThenNewestNil_keepsInformedBatch() async throws {
        try await enqueueMarkAsRead(upTo: "m6", messageIds: ["m5", "m6"])
        try await enqueueMarkAsRead(upTo: "m9", messageIds: nil)

        let merged = try await storedPayload()

        XCTAssertEqual(merged.messageIds, ["m5", "m6"],
                       "un lot non-informé (nil) ne doit pas effacer les reçus exacts déjà accumulés")
    }

    func test_enqueueMarkAsRead_bothNil_staysNil() async throws {
        try await enqueueMarkAsRead(upTo: "m2", messageIds: nil)
        try await enqueueMarkAsRead(upTo: "m4", messageIds: nil)

        let merged = try await storedPayload()

        XCTAssertNil(merged.messageIds, "nil partout = client non informé, repli serveur historique préservé")
    }

    func test_enqueueMarkAsRead_mergesMessageLanguages() async throws {
        try await enqueueMarkAsRead(upTo: "m1", messageIds: ["m1"], languages: ["m1": "fr"])
        try await enqueueMarkAsRead(upTo: "m2", messageIds: ["m2"], languages: ["m2": "en"])

        let merged = try await storedPayload()

        XCTAssertEqual(merged.messageLanguages, ["m1": "fr", "m2": "en"])
    }
}
