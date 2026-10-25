import XCTest
import GRDB
@testable import MeeshySDK

/// Le clair d'un message chiffré de bout en bout ne s'écrit sur le disque que
/// dans le coffre libsignal (#12999) : ni la base des messages, ni le cache du
/// fil, ni celui des conversations. Modèle : appareil volé.
final class EndToEndDiskPlaintextLawTests: XCTestCase {
    private let secret = "le secret que seul le coffre garde"

    private func makeActor() throws -> (MessagePersistenceActor, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessagePersistenceActor(dbWriter: queue, currentUserId: "u-me"), queue)
    }

    private func storedContents(in queue: DatabaseQueue) throws -> [String] {
        try queue.read { db in try String.fetchAll(db, sql: "SELECT content FROM messages WHERE content IS NOT NULL") }
    }

    func test_anEndToEndRow_isWrittenWithTheLiteral_whateverItsWriterHolds() throws {
        let (_, queue) = try makeActor()
        var row = MessageRecordFactory.make(localId: "cid_1", content: secret)
        row.isEncrypted = true
        row.encryptionMode = E2EEWire.mode

        try queue.write { db in try row.insert(db) }
        row.content = secret + " modifié"
        try queue.write { db in try row.update(db) }

        XCTAssertEqual(try storedContents(in: queue), [E2EEWire.contentPlaceholder])
    }

    func test_aClearRow_andAServerEncryptedRow_keepTheirText() throws {
        let (_, queue) = try makeActor()
        var server = MessageRecordFactory.make(localId: "srv_2", content: "lisible par le serveur")
        server.isEncrypted = true
        server.encryptionMode = "server"

        try queue.write { db in
            try MessageRecordFactory.make(localId: "srv_1", content: "en clair").insert(db)
            try server.insert(db)
        }

        XCTAssertEqual(Set(try storedContents(in: queue)), ["en clair", "lisible par le serveur"])
    }

    func test_aMessageReadOnTheDevice_isCachedWithTheLiteral_andWithoutItsProvenance() throws {
        var message = MeeshyMessage(id: "srv_3", conversationId: "c1", content: E2EEWire.contentPlaceholder)
        message.isEncrypted = true
        message.encryptionMode = E2EEWire.mode
        message.adoptDecryptedContent(secret)
        XCTAssertTrue(message.isContentDecryptedOnDevice)

        let json = String(decoding: try JSONEncoder().encode(message), as: UTF8.self)
        let cached = try JSONDecoder().decode(MeeshyMessage.self, from: Data(json.utf8))

        XCTAssertFalse(json.contains(secret))
        XCTAssertEqual(cached.content, E2EEWire.contentPlaceholder)
        XCTAssertTrue(cached.isEncrypted)
        XCTAssertFalse(cached.isContentDecryptedOnDevice)
    }

    func test_aSealedFacet_carriesNoTextNorTranslation_andASealedNature() {
        let facet = LastMessageFacet.sent(id: "cid_4", text: secret, at: Date(), originalLanguage: "fr")

        let sealed = facet.sealedForEndToEnd(true)

        XCTAssertNil(sealed.preview)
        XCTAssertNil(sealed.translations)
        XCTAssertEqual(sealed.nature?.isEncrypted, true)
        XCTAssertEqual(sealed.id, "cid_4")
        XCTAssertEqual(sealed.senderName, facet.senderName)
        XCTAssertEqual(facet.sealedForEndToEnd(false).preview, facet.preview)
    }

    func test_resealing_rewritesTheLegacyRows_theirQuotes_andTheSearchIndex() async throws {
        let (actor, queue) = try makeActor()
        let quote = ReplyReference(messageId: "srv_5", authorName: "Moi", previewText: secret)
        var reply = MessageRecordFactory.make(localId: "srv_6", content: "réponse en clair")
        reply.replyToId = "srv_5"
        reply.replyToJson = try JSONEncoder().encode(quote)
        var legacy = MessageRecordFactory.make(localId: "cid_5", content: secret)
        legacy.serverId = "srv_5"
        let rows = [legacy, reply]
        try await queue.write { db in
            try rows.forEach { try $0.insert(db) }
            try MessageRecordFactory.make(localId: "srv_7", content: "autre conversation").insert(db)
        }

        let sealed = try await actor.endToEndRowSealer.seal(messageKeys: ["srv_5"])

        XCTAssertEqual(sealed, 1)
        XCTAssertEqual(Set(try storedContents(in: queue)), [E2EEWire.contentPlaceholder, "réponse en clair", "autre conversation"])
        let quotes = try await queue.read { db in try Data.fetchAll(db, sql: "SELECT replyToJson FROM messages WHERE replyToJson IS NOT NULL") }
        XCTAssertFalse(quotes.contains { String(decoding: $0, as: UTF8.self).contains(secret) })
        let hits = try await queue.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM messages_fts WHERE messages_fts MATCH 'coffre'")
        }
        XCTAssertEqual(hits, 0, "l'index plein texte ne retrouve plus le clair")
        let row = try await queue.read { db in try MessageRecord.fetchOne(db, key: "cid_5") }
        XCTAssertEqual(row?.isEncrypted, true)
        XCTAssertEqual(row?.encryptionMode, E2EEWire.mode)
    }
}
