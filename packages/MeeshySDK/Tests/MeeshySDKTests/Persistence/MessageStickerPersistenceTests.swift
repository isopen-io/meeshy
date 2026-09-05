import XCTest
import GRDB
@testable import MeeshySDK

/// #4823 — le sticker d'un message survit au passage par le cache GRDB.
///
/// Le pipeline ne stocke jamais l'`APIMessage` brut, seulement des colonnes
/// dérivées : un sticker affiché en ligne mais jamais hissé dans `stickerJson`
/// disparaîtrait au prochain chargement du cache (relaunch, pull-to-refresh).
/// Premier témoin à passer un `APIMessage` décodé du JSON nu par `upsertFromAPIMessages` ; les témoins `locationJson` de `MessageRecordTests` ne couvrent que l'aller-retour du record.
final class MessageStickerPersistenceTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    private static let sticker = MessageSticker(templateId: "love.heartFrame",
                                                slots: ["caption": "Toi"],
                                                animation: .heartbeat,
                                                emoji: "❤️")

    /// Le décodeur est celui de la PRODUCTION (`APIClient.makeAPIPayloadDecoder`) :
    /// un `.iso8601` nu refuserait les fractions de seconde du gateway.
    private func makeAPIMessage(id: String, conversationId: String, sticker: [String: Any]?) throws -> APIMessage {
        var json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": "sender_1",
            "content": "",
            "createdAt": "2026-09-02T10:00:00.000Z",
            "updatedAt": "2026-09-02T10:00:00.000Z",
        ]
        if let sticker { json["sticker"] = sticker }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: data)
    }

    func test_upsertFromAPIMessages_persistsTheStickerAndReadsItBack() async throws {
        let api = try makeAPIMessage(id: "srv_sticker", conversationId: "conv_sticker", sticker: [
            "templateId": "love.heartFrame",
            "slots": ["caption": "Toi"],
            "animation": "heartbeat",
            "emoji": "❤️",
        ])

        try await actor.upsertFromAPIMessages([api])

        let row = try XCTUnwrap(
            try actor.messages(for: "conv_sticker", limit: 10).first { $0.serverId == "srv_sticker" }
        )
        XCTAssertNotNil(row.stickerJson, "la colonne dérivée doit être écrite à l'insertion")
        XCTAssertEqual(row.toMessage(currentUserId: "user_me").sticker, Self.sticker)
    }

    /// Coalescence, comme `locationJson` : un écho PARTIEL (socket allégé,
    /// gateway antérieur) sans `sticker` ne doit pas effacer celui qu'un
    /// instantané plus riche a déjà persisté.
    func test_upsertFromAPIMessages_partialEchoKeepsThePersistedSticker() async throws {
        let rich = try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", sticker: ["emoji": "❤️"])
        try await actor.upsertFromAPIMessages([rich])

        let partial = try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", sticker: nil)
        try await actor.upsertFromAPIMessages([partial])

        let row = try XCTUnwrap(
            try actor.messages(for: "conv_keep", limit: 10).first { $0.serverId == "srv_keep" }
        )
        XCTAssertEqual(row.toMessage(currentUserId: "user_me").sticker?.emoji, "❤️")
    }

    /// Un sticker qui CHANGE entre deux instantanés doit être vu comme un
    /// changement de ligne — sinon la correction du serveur n'atteint jamais
    /// la bulle (même défaut que `messageSource`, régression 2026-08-24).
    func test_upsertFromAPIMessages_aChangedStickerCountsAsARowChange() async throws {
        let first = try makeAPIMessage(id: "srv_change", conversationId: "conv_change", sticker: ["emoji": "❤️"])
        try await actor.upsertFromAPIMessages([first])
        let before = try XCTUnwrap(
            try actor.messages(for: "conv_change", limit: 10).first { $0.serverId == "srv_change" }
        )

        let second = try makeAPIMessage(id: "srv_change", conversationId: "conv_change", sticker: ["emoji": "🎉"])
        try await actor.upsertFromAPIMessages([second])
        let after = try XCTUnwrap(
            try actor.messages(for: "conv_change", limit: 10).first { $0.serverId == "srv_change" }
        )

        XCTAssertEqual(after.toMessage(currentUserId: "user_me").sticker?.emoji, "🎉")
        XCTAssertGreaterThan(after.changeVersion, before.changeVersion,
                             "un sticker différent doit bumper changeVersion, sinon MessageStore ne rafraîchit pas")
    }
}
