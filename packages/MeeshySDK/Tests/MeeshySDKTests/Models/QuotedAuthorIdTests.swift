import XCTest
@testable import MeeshySDK

/// #9371 — une citation et une référence de transfert GRAVENT, à la
/// réception, l'identifiant d'UTILISATEUR de la personne qu'elles nomment. La
/// passerelle le sert déjà (`replyTo.sender.userId`, `forwardedFrom.sender
/// .userId`, REST et socket) ; le client le lisait pour `isMe`, puis le jetait.
/// Sans lui, `user:updated` ne pouvait pas apparier la citation : la bulle de
/// l'auteur se repeignait, sa citation juste dessous gardait l'ancien nom.
final class QuotedAuthorIdTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(type, from: Data(json.utf8))
    }

    private func apiMessage(_ extra: String) throws -> APIMessage {
        try decode(APIMessage.self, """
        {"id":"m-reply","conversationId":"c1","senderId":"p-alice","content":"ma réponse",
         "createdAt":"2026-10-04T10:00:00Z","updatedAt":"2026-10-04T10:00:00Z",\(extra)}
        """)
    }

    // MARK: - Rétro-compatibilité des blobs gravés

    func test_decodeReplyReference_blobGravedBeforeTheId_decodesWithoutIt() throws {
        let legacy = ##"{"messageId":"q1","authorName":"Bob","authorColor":"#31B6BA","previewText":"Salut","isMe":false,"isStoryReply":false}"##

        let quote = try decode(ReplyReference.self, legacy)

        XCTAssertEqual(quote.authorName, "Bob")
        XCTAssertNil(quote.authorUserId)
    }

    func test_decodeForwardReference_blobGravedBeforeTheId_decodesWithoutIt() throws {
        let legacy = #"{"originalMessageId":"f1","senderName":"Bob","previewText":"hello"}"#

        let forward = try decode(ForwardReference.self, legacy)

        XCTAssertEqual(forward.senderName, "Bob")
        XCTAssertNil(forward.senderUserId)
    }

    func test_encodeThenDecode_replyReference_keepsTheAuthorId() throws {
        let quote = ReplyReference(messageId: "q1", authorName: "Bob", previewText: "Salut", authorUserId: "u-bob")

        let reread = try decode(ReplyReference.self, String(decoding: try JSONEncoder().encode(quote), as: UTF8.self))

        XCTAssertEqual(reread.authorUserId, "u-bob")
    }

    func test_encodeThenDecode_forwardReference_keepsTheSenderId() throws {
        let forward = ForwardReference(originalMessageId: "f1", senderName: "Bob", previewText: "hello", senderUserId: "u-bob")

        let reread = try decode(ForwardReference.self, String(decoding: try JSONEncoder().encode(forward), as: UTF8.self))

        XCTAssertEqual(reread.senderUserId, "u-bob")
    }

    // MARK: - Gravé à la réception

    func test_toReplyReference_senderServesItsUserId_gravesIt() throws {
        let reply = try decode(APIMessageReplyTo.self,
                               #"{"id":"q1","content":"Salut","senderId":"p-bob","sender":{"id":"p-bob","userId":"u-bob","displayName":"Bob"}}"#)

        XCTAssertEqual(reply.toReplyReference(currentUserId: "u-alice", preferredLanguages: []).authorUserId, "u-bob")
    }

    func test_toReplyReference_userIdOnlyOnTheNestedUser_gravesIt() throws {
        let reply = try decode(APIMessageReplyTo.self,
                               #"{"id":"q1","content":"Salut","sender":{"id":"p-bob","displayName":"Bob","user":{"id":"u-bob","username":"bob"}}}"#)

        XCTAssertEqual(reply.toReplyReference(currentUserId: "u-alice", preferredLanguages: []).authorUserId, "u-bob")
    }

    func test_toReplyReference_onlyTheParticipantIdServed_gravesNothing() throws {
        let reply = try decode(APIMessageReplyTo.self, #"{"id":"q1","content":"Salut","senderId":"p-bob"}"#)

        XCTAssertNil(reply.toReplyReference(currentUserId: "u-alice", preferredLanguages: []).authorUserId,
                     "`replyTo.senderId` est l'appartenance à la conversation, jamais la personne")
    }

    func test_toReplyReference_quotedMessageDeleted_keepsTheAuthorId() throws {
        let reply = try decode(APIMessageReplyTo.self,
                               #"{"id":"q1","content":"","deletedAt":"2026-10-04T09:00:00Z","sender":{"id":"p-bob","userId":"u-bob","displayName":"Bob"}}"#)

        let quote = reply.toReplyReference(currentUserId: "u-alice", preferredLanguages: [])

        XCTAssertTrue(quote.isQuotedMessageDeleted)
        XCTAssertEqual(quote.authorUserId, "u-bob", "le nom reste sur la citation scellée, son id aussi")
    }

    func test_withPreviewText_keepsTheAuthorId() {
        let quote = ReplyReference(messageId: "q1", authorName: "Bob", previewText: "Salut", authorUserId: "u-bob")

        XCTAssertEqual(quote.withPreviewText("Message supprimé").authorUserId, "u-bob")
    }

    func test_toMessage_replyTo_gravesTheQuotedAuthorId() throws {
        let api = try apiMessage(#""replyToId":"q1","replyTo":{"id":"q1","content":"Salut","sender":{"id":"p-bob","userId":"u-bob","displayName":"Bob"}}"#)

        XCTAssertEqual(api.toMessage(currentUserId: "u-alice").replyTo?.authorUserId, "u-bob")
    }

    func test_toMessage_forwardedFrom_gravesTheOriginalSenderId() throws {
        let api = try apiMessage(#""forwardedFromId":"f1","forwardedFrom":{"id":"f1","content":"hello","sender":{"id":"p-bob","userId":"u-bob","displayName":"Bob"}}"#)

        XCTAssertEqual(api.toMessage(currentUserId: "u-alice").forwardedFrom?.senderUserId, "u-bob")
    }

    func test_toMessage_forwardedFromWithoutSender_gravesNothing() throws {
        let api = try apiMessage(#""forwardedFromId":"f1","forwardedFrom":{"id":"f1","content":"hello"}"#)

        XCTAssertNil(api.toMessage(currentUserId: "u-alice").forwardedFrom?.senderUserId)
    }
}
