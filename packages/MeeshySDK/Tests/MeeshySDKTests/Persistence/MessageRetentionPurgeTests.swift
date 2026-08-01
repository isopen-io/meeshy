import XCTest
import GRDB
@testable import MeeshySDK

/// grdb-02 — la rétention 6 mois était un no-op silencieux à 100 % : le
/// DELETE visait `translation_cache` (table de l'AUTRE base, meeshy.sqlite)
/// → « no such table » → rollback de TOUTE la transaction, avalé par le
/// `try?` de l'appelant ; et le DELETE des traductions visait la colonne
/// `messageId` (le schéma réel est `messageLocalId`). Croissance illimitée
/// de la base. Test d'intégration sur schéma RÉELLEMENT migré — l'absence
/// d'un tel test est précisément ce qui a laissé vivre ce bug.
final class MessageRetentionPurgeTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    private func count(_ table: String) async throws -> Int {
        try await dbQueue.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM \(table)") ?? -1
        }
    }

    func test_purgeOldMessages_messageOlderThanRetention_deletesRowAndChildren() async throws {
        let sevenMonthsAgo = Calendar.current.date(byAdding: .month, value: -7, to: Date())!
        let old = MessageRecordFactory.make(
            localId: "old_1", conversationId: "conv_ret", createdAt: sevenMonthsAgo
        )
        let recent = MessageRecordFactory.make(localId: "recent_1", conversationId: "conv_ret")
        try await actor.insertOptimistic(old)
        try await actor.insertOptimistic(recent)
        try await dbQueue.write { db in
            let now = Date()
            try db.execute(sql: "INSERT INTO message_translations (id, messageLocalId, targetLanguage, translatedContent, translationModel, receivedAt) VALUES ('t1','old_1','en','hi','nllb', ?)", arguments: [now])
            try db.execute(sql: "INSERT INTO message_transcriptions (messageLocalId, language, text, receivedAt) VALUES ('old_1','fr','bonjour', ?)", arguments: [now])
            try db.execute(sql: "INSERT INTO message_audio_translations (id, messageLocalId, targetLanguage, status, receivedAt) VALUES ('a1','old_1','en','ready', ?)", arguments: [now])
            try db.execute(sql: "INSERT INTO pending_ids (localId, serverId, conversationId) VALUES ('old_1','srv_old','conv_ret')")
            try db.execute(sql: "INSERT INTO send_attempts (localId, attemptNumber, transport, startedAt, outcome) VALUES ('old_1', 1, 'rest', ?, 'failed')", arguments: [now])
        }

        let deleted = try await actor.purgeOldMessages()

        XCTAssertEqual(deleted, 1, "seul le message de 7 mois part")
        let remaining = try await dbQueue.read { db in
            try String.fetchAll(db, sql: "SELECT localId FROM messages")
        }
        XCTAssertEqual(remaining, ["recent_1"], "le message récent survit")
        for table in ["message_translations", "message_transcriptions", "message_audio_translations", "pending_ids", "send_attempts"] {
            let c = try await count(table)
            XCTAssertEqual(c, 0, "\(table) doit être purgée en cascade avec son message")
        }
    }

    func test_purgeOldMessages_nothingExpired_returnsZeroWithoutThrowing() async throws {
        let recent = MessageRecordFactory.make(localId: "recent_only", conversationId: "conv_ret2")
        try await actor.insertOptimistic(recent)

        let deleted = try await actor.purgeOldMessages()

        XCTAssertEqual(deleted, 0)
        let c = try await count("messages")
        XCTAssertEqual(c, 1)
    }
}
