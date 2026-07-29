import XCTest
@testable import MeeshySDK

// MARK: - SocialSocketPayloadDecodingTests
//
// Bug prouvé en prod (simu 2026-07-29, logs) : `offMainDecoder` — le décodeur
// utilisé par le chemin générique `decode<T>` pour TOUS les événements
// porteurs d'un post complet (story:updated, story:created, post:created,
// status:*) — était un `JSONDecoder()` NU, sans stratégie de date. La gateway
// émet des dates ISO 8601 → `typeMismatch(Double)` → événement temps réel
// silencieusement perdu, l'UI attendait le prochain refresh REST.
//
// Ces tests verrouillent la factory PARTAGÉE : tout décodeur de payload
// socket doit avaler les dates ISO (avec et sans fractions de seconde).
final class SocialSocketPayloadDecodingTests: XCTestCase {

    private func makeStoryJSON(engagementReset: Bool?) -> Data {
        var payload = """
        {
          "story": {
            "id": "6a6a411e5d93cc9a87bd60ac",
            "type": "STORY",
            "visibility": "ONLY",
            "content": "v4 flag check",
            "createdAt": "2026-07-29T18:06:22.250Z",
            "updatedAt": "2026-07-29T18:08:57.100Z",
            "contentEditedAt": "2026-07-29T18:08:57.081Z",
            "expiresAt": "2026-07-30T15:06:22.247Z",
            "viewCount": 0,
            "reactionCount": 0,
            "author": {"id": "a1", "username": "meeshy", "displayName": "Meeshy"}
          }
        """
        if let engagementReset {
            payload += ", \"engagementReset\": \(engagementReset)"
        }
        payload += "}"
        return Data(payload.utf8)
    }

    func test_socketPayloadDecoder_decodesStoryUpdated_withISODatesAndEngagementReset() throws {
        let decoder = SocialSocketManager.makeSocketPayloadDecoder()

        let decoded = try decoder.decode(SocketStoryUpdatedData.self, from: makeStoryJSON(engagementReset: true))

        XCTAssertEqual(decoded.story.id, "6a6a411e5d93cc9a87bd60ac")
        XCTAssertEqual(decoded.engagementReset, true)
        XCTAssertNotNil(decoded.story.contentEditedAt)
        XCTAssertEqual(
            decoded.story.createdAt.timeIntervalSince1970,
            1_785_348_382.250, accuracy: 0.01,
            "createdAt ISO fractionnel doit décoder — c'est LE champ qui faisait tout échouer"
        )
    }

    func test_socketPayloadDecoder_decodesStoryUpdated_withoutFlag() throws {
        let decoder = SocialSocketManager.makeSocketPayloadDecoder()
        let decoded = try decoder.decode(SocketStoryUpdatedData.self, from: makeStoryJSON(engagementReset: nil))
        XCTAssertNil(decoded.engagementReset)
    }

    func test_socketPayloadDecoder_decodesBasicISODate_withoutFractionalSeconds() throws {
        let decoder = SocialSocketManager.makeSocketPayloadDecoder()
        let json = Data("""
        {"story": {"id": "s1", "type": "STORY", "createdAt": "2026-07-29T18:06:22Z",
                   "author": {"id": "a1", "username": "meeshy", "displayName": "Meeshy"}}}
        """.utf8)
        let decoded = try decoder.decode(SocketStoryCreatedData.self, from: json)
        XCTAssertEqual(decoded.story.id, "s1")
    }

    /// Le décodeur off-main du chemin générique DOIT être construit par la
    /// même factory — garde de source : plus jamais de `JSONDecoder()` nu
    /// pour un payload socket.
    func test_offMainDecoder_sourceGuard_usesSharedFactory() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Sockets
            .deletingLastPathComponent()   // MeeshySDKTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshySDK/Sockets/SocialSocketManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            source.contains("static let offMainDecoder: JSONDecoder = makeSocketPayloadDecoder()"),
            "offMainDecoder doit venir de makeSocketPayloadDecoder() — un JSONDecoder() nu perd les dates ISO"
        )
        XCTAssertFalse(
            source.contains("offMainDecoder = JSONDecoder()"),
            "Régression interdite : offMainDecoder nu = story:updated/story:created silencieusement perdus"
        )
    }
}
