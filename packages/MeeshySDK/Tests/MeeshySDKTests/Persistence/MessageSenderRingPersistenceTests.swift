import XCTest
import GRDB
@testable import MeeshySDK

/// #10713 — le contour d'avatar de l'AUTEUR voyage avec son message
/// (`sender.profileDecor.avatarRing`, REST et `message:new`) et survit au cache
/// GRDB : le fil ne lit que la base, et il le peint dès la réouverture sans réseau.
final class MessageSenderRingPersistenceTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    private static var filet: [String: Any] { ["pack": "contours-essentiels", "item": "filet", "origin": "builtin", "contract": NSNull()] }

    private func makeAPIMessage(id: String, conversationId: String, sender: [String: Any]?) throws -> APIMessage {
        var json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": "participant_1",
            "content": "Bonjour",
            "createdAt": "2026-10-16T10:00:00.000Z",
            "updatedAt": "2026-10-16T10:00:00.000Z",
        ]
        if let sender { json["sender"] = sender }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: data)
    }

    private func sender(decor: Any?) -> [String: Any] {
        var sender: [String: Any] = ["id": "participant_1", "displayName": "Ama", "type": "user"]
        if let decor { sender["profileDecor"] = decor }
        return sender
    }

    private func row(_ serverId: String, in conversationId: String) throws -> MessageRecord {
        try XCTUnwrap(try actor.messages(for: conversationId, limit: 10).first { $0.serverId == serverId })
    }

    func test_toMessage_servedRing_reachesTheDomainMessage() throws {
        let message = try makeAPIMessage(id: "m1", conversationId: "c1", sender: sender(decor: ["avatarRing": Self.filet]))
            .toMessage(currentUserId: "user_me")

        XCTAssertEqual(message.senderRing, ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin))
    }

    func test_decode_withoutProfileDecor_staysCompatible() throws {
        let message = try makeAPIMessage(id: "m2", conversationId: "c2", sender: sender(decor: nil))
            .toMessage(currentUserId: "user_me")

        XCTAssertNil(message.senderRing)
        XCTAssertEqual(message.senderName, "Ama")
    }

    func test_decode_unreadableProfileDecor_neverBreaksTheMessage() throws {
        let message = try makeAPIMessage(id: "m3", conversationId: "c3", sender: sender(decor: "illisible"))
            .toMessage(currentUserId: "user_me")

        XCTAssertNil(message.senderRing)
        XCTAssertEqual(message.content, "Bonjour")
    }

    func test_upsert_servedRing_readsBackFromTheCache() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_ring", conversationId: "conv_ring", sender: sender(decor: ["avatarRing": Self.filet]))
        ])

        let message = try row("srv_ring", in: "conv_ring").toMessage(currentUserId: "user_me")
        XCTAssertEqual(message.senderRing?.item, "filet")
    }

    func test_upsert_partialEchoWithoutSender_keepsTheRing() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", sender: sender(decor: ["avatarRing": Self.filet]))
        ])
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", sender: nil)
        ])

        XCTAssertEqual(try row("srv_keep", in: "conv_keep").toMessage(currentUserId: "user_me").senderRing?.item, "filet")
    }

    func test_upsert_senderServedWithoutRing_removesTheRing() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_off", conversationId: "conv_off", sender: sender(decor: ["avatarRing": Self.filet]))
        ])
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_off", conversationId: "conv_off", sender: sender(decor: nil))
        ])

        XCTAssertNil(try row("srv_off", in: "conv_off").toMessage(currentUserId: "user_me").senderRing)
    }

    func test_codableRoundTrip_keepsTheRing() throws {
        let ring = ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin)
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "p1", content: "Salut", senderRing: ring)

        let decoded = try JSONDecoder().decode(MeeshyMessage.self, from: JSONEncoder().encode(message))

        XCTAssertEqual(decoded.senderRing, ring)
    }
}
