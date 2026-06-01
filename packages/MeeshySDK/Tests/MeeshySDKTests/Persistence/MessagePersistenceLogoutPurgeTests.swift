import XCTest
import GRDB
@testable import MeeshySDK

/// T6 — Logout must purge every on-device message table, not just the outbox.
///
/// `clearOutbox()` only ran `DELETE FROM outbox`, leaving the authoritative
/// `messages` table (plus translations / transcriptions / audio translations /
/// local attachments / pending_ids) populated. No table is userId-namespaced
/// and the DB file is shared across accounts, so user B logging in on the same
/// device read user A's message bodies via `MessageStore.loadInitialSnapshot`
/// before any REST refresh. `clearAllMessagesForLogout()` drops them all.
final class MessagePersistenceLogoutPurgeTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    private let tables = [
        "messages", "pending_ids", "message_translations", "message_transcriptions",
        "message_audio_translations", "local_attachments", "outbox"
    ]

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    private func seedOneRowPerTable() async throws {
        try await dbQueue.write { db in
            let now = Date()
            try db.execute(sql: "INSERT INTO messages (localId, conversationId, senderId, state, createdAt, updatedAt) VALUES ('m1','c1','uA','sent', ?, ?)", arguments: [now, now])
            try db.execute(sql: "INSERT INTO pending_ids (localId, serverId, conversationId) VALUES ('m1','s1','c1')")
            try db.execute(sql: "INSERT INTO message_translations (id, messageLocalId, targetLanguage, translatedContent, translationModel, receivedAt) VALUES ('t1','m1','en','hi','nllb', ?)", arguments: [now])
            try db.execute(sql: "INSERT INTO message_transcriptions (messageLocalId, language, text, receivedAt) VALUES ('m1','fr','bonjour', ?)", arguments: [now])
            try db.execute(sql: "INSERT INTO message_audio_translations (id, messageLocalId, targetLanguage, status, receivedAt) VALUES ('a1','m1','en','ready', ?)", arguments: [now])
            try db.execute(sql: "INSERT INTO local_attachments (localId, messageLocalId, type, mimeType, fileName, fileSize, localPath, createdAt) VALUES ('att1','m1','image','image/jpeg','f.jpg',100,'/tmp/f', ?)", arguments: [now])
            try db.execute(sql: "INSERT INTO outbox (id, kind, conversationId, payload, status, createdAt, updatedAt, nextAttemptAt) VALUES ('o1','sendMessage','c1', ?, 'pending', ?, ?, ?)", arguments: [Data(), now, now, now])
        }
    }

    private func counts() async throws -> [String: Int] {
        try await dbQueue.read { [tables] db in
            var result: [String: Int] = [:]
            for table in tables {
                result[table] = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM \(table)") ?? -1
            }
            return result
        }
    }

    func test_clearAllMessagesForLogout_purgesEveryMessageTable() async throws {
        try await seedOneRowPerTable()

        let before = try await counts()
        for table in tables {
            XCTAssertEqual(before[table], 1, "precondition: \(table) seeded with one row")
        }

        try await actor.clearAllMessagesForLogout()

        let after = try await counts()
        for table in tables {
            XCTAssertEqual(after[table], 0, "\(table) must be empty after logout purge")
        }
    }
}
