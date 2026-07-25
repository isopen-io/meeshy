import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Contrat de sérialisation du marquage de lecture.
///
/// Le gateway ne marque plus comme lus que les messages qu'un client lui nomme.
/// `dispatchMarkAsRead` postait `body: nil` et jetait tout identifiant : sans
/// corps, le serveur retombe sur son chemin historique par fenêtre temporelle,
/// qui déclare lus des messages jamais affichés.
///
/// `MarkReadBodySchema` est `.strict()` côté gateway : une clé non déclarée ou
/// un identifiant mal formé rejette la requête ENTIÈRE en 400 — donc perd aussi
/// les lectures réelles du même lot.
///
/// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
final class OutboxDispatcherMarkAsReadEncodingTests: XCTestCase {

    private let idA = "507f1f77bcf86cd799439011"
    private let idB = "507f1f77bcf86cd799439012"

    private func encodeToJSON<T: Encodable>(_ value: T) throws -> String {
        let data = try JSONEncoder().encode(value)
        return try XCTUnwrap(String(data: data, encoding: .utf8))
    }

    // MARK: - Payload persisté

    /// Les enregistrements d'outbox déjà en base ont été sérialisés SANS ce
    /// champ. Le rendre non-optionnel casserait leur décodage après mise à
    /// jour de l'app : les lectures en attente seraient perdues en silence.
    func test_markAsReadPayload_decodesLegacyRecordWithoutMessageIds() throws {
        let legacy = """
        {"clientMutationId":"cm-1","conversationId":"conv-1","upToMessageId":"m-1"}
        """.data(using: .utf8)!

        let payload = try JSONDecoder().decode(MarkAsReadPayload.self, from: legacy)

        XCTAssertEqual(payload.conversationId, "conv-1")
        XCTAssertNil(payload.messageIds)
    }

    func test_markAsReadPayload_roundTripsReportedIds() throws {
        let payload = MarkAsReadPayload(
            clientMutationId: "cm-1",
            conversationId: "conv-1",
            upToMessageId: idB,
            messageIds: [idA, idB]
        )

        let data = try JSONEncoder().encode(payload)
        let decoded = try JSONDecoder().decode(MarkAsReadPayload.self, from: data)

        XCTAssertEqual(decoded.messageIds, [idA, idB])
    }

    // MARK: - Corps HTTP

    func test_markAsReadBody_encodesTheReportedIds() throws {
        let json = try encodeToJSON(MarkAsReadBody(messageIds: [idA, idB]))

        XCTAssertTrue(json.contains("messageIds"))
        XCTAssertTrue(json.contains(idA))
        XCTAssertTrue(json.contains(idB))
    }

    /// Le schéma est `.strict()` : toute clé supplémentaire 400 la requête.
    func test_markAsReadBody_encodesNothingElse() throws {
        let json = try encodeToJSON(MarkAsReadBody(messageIds: [idA]))

        XCTAssertFalse(json.contains("conversationId"))
        XCTAssertFalse(json.contains("clientMutationId"))
        XCTAssertFalse(json.contains("upToMessageId"))
    }

    // MARK: - Choix du corps

    func test_reportedIds_areCappedAtTheServerLimit() throws {
        let many = (0..<250).map { String(format: "%024x", $0) }

        let capped = MarkAsReadBody.cap(many)

        XCTAssertEqual(capped.count, 200)
        // On garde les PLUS RÉCENTS : ce sont ceux que l'utilisateur vient de voir.
        XCTAssertEqual(capped.last, many.last)
    }

    func test_reportedIds_belowTheLimit_arePreserved() throws {
        XCTAssertEqual(MarkAsReadBody.cap([idA, idB]), [idA, idB])
    }
}
