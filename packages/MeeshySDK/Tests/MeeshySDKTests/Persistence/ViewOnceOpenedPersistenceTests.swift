import XCTest
import GRDB
@testable import MeeshySDK

/// **« Déjà ouvert » vit dans GRDB, par lecteur, et le contenu n'y survit pas**
/// (#7579).
///
/// Le fil affiché ne lit que GRDB (`MessageStore.domainMessages` →
/// `MessageRecord.toMessage`). L'état « déjà ouvert » d'une vue unique doit donc
/// tenir dans la table : un redémarrage, une revalidation REST ou la destruction
/// annoncée par le serveur ne doivent ni rendre le contenu, ni retirer la bulle,
/// ni la dire supprimée. Les témoins passent par la chaîne produit — décodeur
/// réel, acteur de persistance réel, projection réelle.
final class ViewOnceOpenedPersistenceTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    private static let conversationId = "6ab16c0b67c87be0efa9a50e"
    private static let messageId = "6ab3e5ac5654dc8abab48f35"
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

    private static func payload(content: String = "SECRET-FIL-VU texte", consumedByMe: Bool? = nil) -> String {
        let consumed = consumedByMe.map { ",\"consumedByMe\":\($0)" } ?? ""
        return """
        {"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"\(senderId)",
         "content":"\(content)","messageType":"text","messageSource":"user",
         "isViewOnce":true,"isBlurred":false,"effectFlags":4,
         "isEncrypted":false\(consumed),
         "translations":[{"id":"t1","messageId":"\(messageId)","sourceLanguage":"fr","targetLanguage":"en","translatedContent":"SECRET translated"}],
         "createdAt":"2026-09-23T14:43:24.000Z","updatedAt":"2026-09-23T14:43:24.000Z"}
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

    private func translationCount() throws -> Int {
        try dbQueue.read { db in try TranslationRecord.fetchCount(db) }
    }

    func test_markViewOnceOpened_purgesContentAndPersistsTheOpenedColumn() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload())])

        try await actor.markViewOnceOpened(localId: Self.messageId)

        let message = try persistedMessage()
        XCTAssertNotNil(message.viewOnceOpenedAt, "l'état « déjà ouvert » vit dans la colonne GRDB")
        XCTAssertTrue(message.isViewOnceOpened)
        XCTAssertEqual(message.content, "", "le texte est purgé localement")
        XCTAssertEqual(try translationCount(), 0, "les traductions sont purgées avec lui")
    }

    func test_upsertFromAPIMessages_afterOpening_neverBringsTheContentBack() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload())])
        try await actor.markViewOnceOpened(localId: Self.messageId)

        try await actor.upsertFromAPIMessages([try decode(Self.payload())])

        let message = try persistedMessage()
        XCTAssertEqual(message.content, "", "le serveur servait encore le texte au consommateur (recette 2026-09-23)")
        XCTAssertTrue(message.isViewOnceOpened)
        XCTAssertEqual(try translationCount(), 0)
    }

    func test_upsertFromAPIMessages_consumedByMe_insertsAnOpenedEnvelope() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(consumedByMe: true))])

        let message = try persistedMessage()
        XCTAssertTrue(message.isViewOnceOpened, "le contrat #7578 : `consumedByMe` grave l'état « déjà ouvert »")
        XCTAssertEqual(message.content, "")
        XCTAssertEqual(try translationCount(), 0)
    }

    func test_upsertFromAPIMessages_notConsumedByMe_keepsItSealedNotOpened() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload(consumedByMe: false))])

        let message = try persistedMessage()
        XCTAssertFalse(message.isViewOnceOpened, "ce qu'un autre ouvre ne change rien chez moi")
        XCTAssertTrue(message.isViewOnceSealed)
    }

    func test_markDeleted_byServer_turnsAViewOnceIntoAlreadyOpened() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload())])

        try await actor.markDeleted(localId: Self.messageId, deletedAt: Date(), sparingOpenedViewOnce: true)

        let message = try persistedMessage()
        XCTAssertFalse(message.isDeleted, "la destruction serveur ne dit jamais « supprimé » d'une vue unique")
        XCTAssertTrue(message.isViewOnceOpened)
        XCTAssertEqual(message.content, "")
    }

    func test_markDeleted_byUser_stillDeletesAViewOnce() async throws {
        try await actor.upsertFromAPIMessages([try decode(Self.payload())])
        try await actor.markViewOnceOpened(localId: Self.messageId)

        try await actor.markDeleted(localId: Self.messageId, deletedAt: Date())

        XCTAssertTrue(try persistedMessage().isDeleted, "la suppression explicite par appui long retire la bulle")
    }

    func test_sealAsOpenedViewOnce_onAPhotoWhoseOnlyPieceWasViewOnce_keepsTheViewOnceFlag() {
        var record = MessageRecord(
            localId: "m", serverId: "m", conversationId: "c", senderId: "s",
            content: "légende", originalLanguage: "fr", messageType: "image", messageSource: "user",
            contentType: "text", state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil, forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil, expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0, isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil, senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil, deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil, createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: Data(#"[{"id":"a1","isViewOnce":true}]"#.utf8),
            reactionsJson: nil, reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil, cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil, cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        XCTAssertTrue(record.holdsViewOnce)

        record.sealAsOpenedViewOnce(at: Date())

        XCTAssertNil(record.content)
        XCTAssertNil(record.attachmentsJson)
        XCTAssertTrue(record.holdsViewOnce, "vidée, la ligne reste une vue unique — jamais un message ordinaire")
    }
}
