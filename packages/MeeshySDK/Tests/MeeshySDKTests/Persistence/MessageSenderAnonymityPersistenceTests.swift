import XCTest
import GRDB
@testable import MeeshySDK

/// #10286 — « l'auteur n'a pas de compte » survit au cache GRDB.
///
/// Le fil ne lit que GRDB : sans colonne, `senderIsAnonymous` retombait à
/// `false` au premier rechargement, et l'adresse écrite par un invité anonyme
/// redevenait cliquable, en aperçu ou en carte de conversation.
final class MessageSenderAnonymityPersistenceTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    private func makeAPIMessage(id: String, conversationId: String, senderType: String?,
                                replyToSenderType: String? = nil) throws -> APIMessage {
        var json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": "participant_1",
            "content": "Vois https://exemple.com",
            "createdAt": "2026-10-12T10:00:00.000Z",
            "updatedAt": "2026-10-12T10:00:00.000Z",
        ]
        if let senderType {
            json["sender"] = ["id": "participant_1", "displayName": "Invité", "type": senderType]
        }
        if let replyToSenderType {
            json["replyTo"] = [
                "id": "quoted_1",
                "content": "https://exemple.com",
                "senderId": "participant_2",
                "sender": ["id": "participant_2", "displayName": "Autre", "type": replyToSenderType],
            ]
        }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: data)
    }

    private func row(_ serverId: String, in conversationId: String) throws -> MessageRecord {
        try XCTUnwrap(try actor.messages(for: conversationId, limit: 10).first { $0.serverId == serverId })
    }

    func test_upsertFromAPIMessages_anonymousSender_readsBackAsAnonymous() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_anon", conversationId: "conv_anon", senderType: "anonymous")
        ])

        let message = try row("srv_anon", in: "conv_anon").toMessage(currentUserId: "user_me")
        XCTAssertTrue(message.senderIsAnonymous)
    }

    func test_upsertFromAPIMessages_registeredSender_readsBackAsRegistered() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_user", conversationId: "conv_user", senderType: "user")
        ])

        let message = try row("srv_user", in: "conv_user").toMessage(currentUserId: "user_me")
        XCTAssertFalse(message.senderIsAnonymous)
    }

    func test_toMessage_senderAbsent_provesNoAccountButClaimsNoAnonymity() throws {
        let message = try makeAPIMessage(id: "srv_untyped", conversationId: "conv_untyped", senderType: nil)
            .toMessage(currentUserId: "user_me")

        XCTAssertFalse(message.senderHasAccount)
        XCTAssertFalse(message.senderIsAnonymous)
    }

    func test_upsertFromAPIMessages_registeredSender_readsBackWithProvenAccount() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_proven", conversationId: "conv_proven", senderType: "user")
        ])

        let message = try row("srv_proven", in: "conv_proven").toMessage(currentUserId: "user_me")
        XCTAssertTrue(message.senderHasAccount)
    }

    func test_toMessage_botSender_isNotAnonymous() throws {
        let message = try makeAPIMessage(id: "srv_bot", conversationId: "conv_bot", senderType: "bot")
            .toMessage(currentUserId: "user_me")

        XCTAssertFalse(message.senderIsAnonymous)
        XCTAssertTrue(message.senderHasAccount)
    }

    func test_toMessage_unknownAccountRowFromSomeoneElse_hasNoProvenAccount() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_unknown", conversationId: "conv_unknown", senderType: nil)
        ])
        let record = try row("srv_unknown", in: "conv_unknown")

        XCTAssertNil(record.senderHasAccount)
        XCTAssertFalse(record.toMessage(currentUserId: "user_me").senderHasAccount)
    }

    func test_toMessage_unknownAccountRowOfMine_keepsLinks() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_mine", conversationId: "conv_mine", senderType: nil)
        ])

        let message = try row("srv_mine", in: "conv_mine").toMessage(currentUserId: "participant_1")
        XCTAssertTrue(message.senderHasAccount)
    }

    func test_upsertFromAPIMessages_partialEchoWithoutSender_keepsProvenAccount() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_known", conversationId: "conv_known", senderType: "user")
        ])
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_known", conversationId: "conv_known", senderType: nil)
        ])

        let message = try row("srv_known", in: "conv_known").toMessage(currentUserId: "user_me")
        XCTAssertTrue(message.senderHasAccount)
    }

    func test_upsertFromAPIMessages_partialEchoWithoutSender_keepsAnonymity() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", senderType: "anonymous")
        ])
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", senderType: nil)
        ])

        let message = try row("srv_keep", in: "conv_keep").toMessage(currentUserId: "user_me")
        XCTAssertTrue(message.senderIsAnonymous)
    }

    func test_toReplyReference_anonymousQuotedAuthor_isDeclaredAnonymous() throws {
        let api = try makeAPIMessage(id: "srv_reply", conversationId: "conv_reply",
                                     senderType: "user", replyToSenderType: "anonymous")

        let reference = try XCTUnwrap(api.replyTo).toReplyReference(currentUserId: "user_me", preferredLanguages: [])

        XCTAssertEqual(reference.authorIsAnonymous, true)
    }

    func test_decode_legacyBlobFromSomeoneElse_hasNoProvenAccount() throws {
        let legacy = #"{"id":"m1","conversationId":"c1","senderId":"p1","content":"https://exemple.com","createdAt":0,"updatedAt":0,"isMe":false}"#

        let decoded = try JSONDecoder().decode(MeeshyMessage.self, from: Data(legacy.utf8))

        XCTAssertFalse(decoded.senderHasAccount)
    }

    func test_codableRoundTrip_anonymousSender_staysAnonymous() throws {
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "p1",
                                    content: "https://exemple.com", senderIsAnonymous: true)

        let decoded = try JSONDecoder().decode(MeeshyMessage.self, from: JSONEncoder().encode(message))

        XCTAssertTrue(decoded.senderIsAnonymous)
    }
}
