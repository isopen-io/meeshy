import XCTest
import GRDB
@testable import MeeshySDK

/// **#11375 — « modifié par un modérateur » survit à GRDB.** Décision porteur
/// du 2026-10-24 : un modérateur de plateforme qui modifie le message d'un
/// autre le fait à visage découvert. La passerelle sert `editedById` ; le fil
/// ne lit que GRDB, donc la mention doit traverser la table `messages` — par
/// la revalidation REST (upsert) ET par `message:edited` (`markEdited`).
/// L'auteur qui réécrit son message l'efface.
final class ModeratorEditAttributionPersistenceTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    private static let conversationId = "6ab16c0b67c87be0efa9a50e"
    private static let messageId = "6ab37099918d1dc34001a94d"
    private static let senderId = "6a9e11d7c2b84f0193ac55e1"
    private static let reader = "6a9e11d7c2b84f0193ac55e2"
    private static let moderator = "6a9e11d7c2b84f0193ac55e3"

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    override func tearDown() async throws {
        actor = nil
        dbQueue = nil
    }

    private static func payload(isEdited: Bool, editedById: String?) -> String {
        let editor = editedById.map { "\"editedById\":\"\($0)\",\"editedByRole\":\"MODERATOR\"," } ?? ""
        return """
        {"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"\(senderId)",
         "content":"Bonjour","messageType":"text","messageSource":"user",
         "isEdited":\(isEdited),\(editor)
         "isEncrypted":false,
         "createdAt":"2026-10-24T09:00:00.000Z","updatedAt":"2026-10-24T09:05:00.000Z"}
        """
    }

    private func decode(_ json: String) throws -> APIMessage {
        try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
    }

    private func persistedMessage() throws -> MeeshyMessage {
        let rows = try actor.messages(for: Self.conversationId, limit: 10)
        let row = try XCTUnwrap(rows.first, "la ligne doit exister en base")
        return row.toMessage(currentUserId: Self.reader)
    }

    func test_decode_moderatorEdit_carriesTheEditor() throws {
        let api = try decode(Self.payload(isEdited: true, editedById: Self.moderator))
        XCTAssertEqual(api.editedById, Self.moderator)
        XCTAssertTrue(api.toMessage(currentUserId: Self.reader).editedByModerator)
    }

    func test_upsert_moderatorEdit_survivesPersistence() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(isEdited: true, editedById: Self.moderator))])

        let message = try persistedMessage()
        XCTAssertEqual(message.editedById, Self.moderator)
        XCTAssertTrue(message.editedByModerator)
    }

    func test_upsert_authorRewrite_clearsTheMention() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(isEdited: true, editedById: Self.moderator))])
        try await actor.upsertFromAPIMessages([try decode(Self.payload(isEdited: true, editedById: nil))])

        XCTAssertFalse(try persistedMessage().editedByModerator)
    }

    func test_markEdited_servedEditor_isRecorded_thenClearedByTheAuthor() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(isEdited: false, editedById: nil))])

        try await actor.markEdited(localId: Self.messageId, newContent: "corrigé", editedAt: Date(), editedById: Self.moderator)
        XCTAssertTrue(try persistedMessage().editedByModerator)

        try await actor.markEdited(localId: Self.messageId, newContent: "réécrit", editedAt: Date().addingTimeInterval(1), editedById: nil)
        XCTAssertFalse(try persistedMessage().editedByModerator)
    }

    func test_markEdited_withoutServedEditor_keepsTheColumn() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(isEdited: true, editedById: Self.moderator))])

        try await actor.markEdited(localId: Self.messageId, newContent: "corrigé", editedAt: Date())

        XCTAssertTrue(try persistedMessage().editedByModerator, "un chemin qui ne porte pas l'auteur ne l'efface pas")
    }

    func test_editedByModerator_requiresAnEditedMessage() {
        let untouched = MeeshyMessage(conversationId: Self.conversationId, content: "x", isEdited: false, editedById: Self.moderator)
        let byAuthor = MeeshyMessage(conversationId: Self.conversationId, content: "x", isEdited: true)
        XCTAssertFalse(untouched.editedByModerator)
        XCTAssertFalse(byAuthor.editedByModerator)
    }
}
