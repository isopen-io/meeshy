import XCTest
import GRDB
@testable import MeeshySDK

/// **#14369 — l'identifiant client SERVI survit à GRDB.** Le fil ne lit que la
/// table `messages`, dont la ligne ne portait pas `clientMessageId` : la couche
/// appareil d'un message hybride exige l'identifiant client des DEUX côtés pour
/// se rattacher à son message, et restait donc toujours invérifiable. La
/// colonne `servedClientMessageId` le garde, et une revalidation qui ne le sert
/// pas ne l'efface pas.
final class ServedClientMessageIdPersistenceTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    private static let conversationId = "6ab16c0b67c87be0efa9a50e"
    private static let messageId = "6ab37099918d1dc34001a94d"
    private static let senderId = "6a9e11d7c2b84f0193ac55e1"
    private static let reader = "6a9e11d7c2b84f0193ac55e2"

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    override func tearDown() async throws {
        actor = nil
        dbQueue = nil
    }

    private static func payload(clientMessageId: String?, updatedAt: String = "2026-11-02T09:05:00.000Z") -> String {
        let cid = clientMessageId.map { "\"clientMessageId\":\"\($0)\"," } ?? ""
        return """
        {"id":"\(messageId)",\(cid)"conversationId":"\(conversationId)","senderId":"\(senderId)",
         "content":"Bonjour","messageType":"text","messageSource":"user","encryptionMode":"hybrid",
         "isEncrypted":false,
         "createdAt":"2026-11-02T09:00:00.000Z","updatedAt":"\(updatedAt)"}
        """
    }

    private func decode(_ json: String) throws -> APIMessage {
        try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: Data(json.utf8))
    }

    private func persistedMessage() throws -> MeeshyMessage {
        let rows = try actor.messages(for: Self.conversationId, limit: 10)
        let row = try XCTUnwrap(rows.first, "la ligne doit exister en base")
        return row.toMessage(currentUserId: Self.reader)
    }

    func test_upsert_servedClientMessageId_survivesPersistence() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(clientMessageId: "cid_1"))])

        XCTAssertEqual(try persistedMessage().servedClientMessageId, "cid_1")
    }

    func test_revalidationWithoutTheKey_keepsTheServedClientMessageId() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(clientMessageId: "cid_1"))])
        try await actor.upsertFromAPIMessages([try decode(Self.payload(clientMessageId: nil, updatedAt: "2026-11-02T09:06:00.000Z"))])

        XCTAssertEqual(try persistedMessage().servedClientMessageId, "cid_1")
    }

    func test_aRowWithoutServedKey_hasNoServedClientMessageId() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(clientMessageId: nil))])

        XCTAssertNil(try persistedMessage().servedClientMessageId)
    }
}
