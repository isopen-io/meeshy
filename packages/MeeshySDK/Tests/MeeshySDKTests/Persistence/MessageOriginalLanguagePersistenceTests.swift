import XCTest
import GRDB
@testable import MeeshySDK

/// #9191 — la langue d'origine d'une ligne suit la charge servie.
///
/// Une ligne née avec une origine PROVISOIRE (bulle de la NSE, réconciliation
/// depuis le cache, envoi optimiste) gardait cette origine pour toujours : la
/// mise à jour ne la touchait pas. Une lectrice fr/en voyait alors l'original
/// coréen dans le fil pendant que l'aperçu de liste servait le français.
final class MessageOriginalLanguagePersistenceTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    private func makeAPIMessage(id: String, conversationId: String, originalLanguage: String?) throws -> APIMessage {
        var json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": "participant_1",
            "content": "오늘 밤 한국어 연습할래?",
            "createdAt": "2026-10-02T20:00:00.000Z",
            "updatedAt": "2026-10-02T20:00:00.000Z",
        ]
        if let originalLanguage { json["originalLanguage"] = originalLanguage }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: data)
    }

    private func row(_ serverId: String, in conversationId: String) throws -> MessageRecord {
        try XCTUnwrap(try actor.messages(for: conversationId, limit: 10).first { $0.serverId == serverId })
    }

    func test_upsertFromAPIMessages_rowBornWithAProvisionalOrigin_adoptsTheServedOrigin() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_ko", conversationId: "conv_ko", originalLanguage: "fr")
        ])

        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_ko", conversationId: "conv_ko", originalLanguage: "ko")
        ])

        XCTAssertEqual(try row("srv_ko", in: "conv_ko").originalLanguage, "ko")
    }

    func test_upsertFromAPIMessages_payloadWithoutOrigin_keepsTheStoredOrigin() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", originalLanguage: "ko")
        ])

        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_keep", conversationId: "conv_keep", originalLanguage: nil)
        ])

        XCTAssertEqual(try row("srv_keep", in: "conv_keep").originalLanguage, "ko")
    }

    func test_upsertMutatedFieldsEqual_onlyTheOriginDiffers_reportsAChange() async throws {
        try await actor.upsertFromAPIMessages([
            try makeAPIMessage(id: "srv_eq", conversationId: "conv_eq", originalLanguage: "fr")
        ])
        let stored = try row("srv_eq", in: "conv_eq")
        var corrected = stored
        corrected.adoptServedOriginalLanguage("ko")

        XCTAssertFalse(upsertMutatedFieldsEqual(stored, corrected))
    }
}
