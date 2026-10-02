import XCTest
import GRDB
@testable import MeeshySDK

/// #9104 — la carte `url → token` d'un message survit au cache GRDB.
///
/// Le fil ne lit que GRDB : sans colonne, une URL brute suivie ressortait du
/// cache sans token et s'affichait en entier au lieu de `m+<token>`.
final class MessageTrackedLinksPersistenceTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    private func makeAPIMessage(id: String, conversationId: String, trackingLinks: [[String: String]]?) throws -> APIMessage {
        var json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": "sender_1",
            "content": "Vois https://example.com/a",
            "createdAt": "2026-10-02T10:00:00.000Z",
            "updatedAt": "2026-10-02T10:00:00.000Z",
        ]
        if let trackingLinks { json["metadata"] = ["trackingLinks": trackingLinks] }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: data)
    }

    private func row(_ serverId: String, in conversationId: String) async throws -> MessageRecord {
        try XCTUnwrap(try await actor.messages(for: conversationId, limit: 10).first { $0.serverId == serverId })
    }

    func test_upsertFromAPIMessages_persistsTheTrackedLinkMapAndReadsItBack() async throws {
        let api = try makeAPIMessage(id: "srv_link", conversationId: "conv_link",
                                     trackingLinks: [["url": "https://example.com/a", "token": "tok123"]])

        try await actor.upsertFromAPIMessages([api])

        let message = try await row("srv_link", in: "conv_link").toMessage(currentUserId: "user_me")
        XCTAssertEqual(message.trackedLinkMap, ["https://example.com/a": "tok123"])
    }

    func test_upsertFromAPIMessages_partialEchoKeepsThePersistedMap() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep",
                               trackingLinks: [["url": "https://example.com/a", "token": "tok123"]])
        ])
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", trackingLinks: nil)
        ])

        let message = try await row("srv_keep", in: "conv_keep").toMessage(currentUserId: "user_me")
        XCTAssertEqual(message.trackedLinkMap["https://example.com/a"], "tok123")
    }

    func test_upsertFromAPIMessages_aMapArrivingLaterCountsAsARowChange() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_late", conversationId: "conv_late", trackingLinks: nil)
        ])
        let before = try await row("srv_late", in: "conv_late")

        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_late", conversationId: "conv_late",
                               trackingLinks: [["url": "https://example.com/a", "token": "tok123"]])
        ])
        let after = try await row("srv_late", in: "conv_late")

        XCTAssertEqual(after.toMessage(currentUserId: "user_me").trackedLinkMap["https://example.com/a"], "tok123")
        XCTAssertGreaterThan(after.changeVersion, before.changeVersion,
                             "une carte qui arrive doit bumper changeVersion, sinon MessageStore ne rafraîchit pas")
    }

    func test_sealAsOpenedViewOnce_dropsTheTrackedLinks() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_once", conversationId: "conv_once",
                               trackingLinks: [["url": "https://example.com/a", "token": "tok123"]])
        ])
        var record = try await row("srv_once", in: "conv_once")

        record.sealAsOpenedViewOnce(at: Date())

        XCTAssertNil(record.trackedLinksJson, "une vue unique ouverte ne garde pas les adresses qu'elle portait")
    }
}
