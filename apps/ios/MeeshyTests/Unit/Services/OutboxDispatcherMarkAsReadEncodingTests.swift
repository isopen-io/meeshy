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
    ///
    /// La fixture porte aussi `upToMessageId`, clé RETIRÉE du payload : une row
    /// persistée par une version antérieure doit continuer de se décoder, la
    /// clé devenue inconnue étant simplement ignorée.
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
    }

    // MARK: - Prisme linguistique

    /// Même raison que `messageIds` : un enregistrement sérialisé avant le
    /// prisme ne porte pas ces champs, et les rendre obligatoires perdrait les
    /// lectures en attente au décodage.
    func test_markAsReadPayload_decodesRecordWithoutLanguages() throws {
        let legacy = """
        {"clientMutationId":"cm-1","conversationId":"conv-1","upToMessageId":"m-1","messageIds":["\(idA)"]}
        """.data(using: .utf8)!

        let payload = try JSONDecoder().decode(MarkAsReadPayload.self, from: legacy)

        XCTAssertNil(payload.language)
        XCTAssertNil(payload.messageLanguages)
    }

    func test_markAsReadPayload_roundTripsLanguages() throws {
        let payload = MarkAsReadPayload(
            clientMutationId: "cm-1",
            conversationId: "conv-1",
            messageIds: [idA, idB],
            language: "en",
            messageLanguages: [idB: "fr"]
        )

        let data = try JSONEncoder().encode(payload)
        let decoded = try JSONDecoder().decode(MarkAsReadPayload.self, from: data)

        XCTAssertEqual(decoded.language, "en")
        XCTAssertEqual(decoded.messageLanguages, [idB: "fr"])
    }

    /// Une table vide ne dit rien et ferait voyager une clé pour rien.
    func test_emptyExceptionTable_isDroppedAtConstruction() throws {
        let payload = MarkAsReadPayload(
            clientMutationId: "cm-1",
            conversationId: "conv-1",
            messageIds: [idA],
            language: "en",
            messageLanguages: [:]
        )

        XCTAssertNil(payload.messageLanguages)
    }

    func test_markAsReadBody_encodesTheLanguages() throws {
        let json = try encodeToJSON(
            MarkAsReadBody(messageIds: [idA, idB], language: "en", messageLanguages: [idB: "fr"])
        )

        XCTAssertTrue(json.contains("\"language\":\"en\""))
        XCTAssertTrue(json.contains("messageLanguages"))
        XCTAssertTrue(json.contains("\"fr\""))
    }

    /// Le schéma n'accepte que des identifiants du lot : une clé écartée par le
    /// plafond ferait rejeter le corps ENTIER, donc perdre aussi les lectures
    /// réelles qui l'accompagnaient.
    func test_exceptions_areScopedToTheReportedBatch() throws {
        let scoped = MarkAsReadBody.scopedLanguages([idA: "fr", idB: "de"], to: [idA])

        XCTAssertEqual(scoped, [idA: "fr"])
    }

    func test_exceptions_becomeNilWhenNoneSurviveTheBatch() throws {
        XCTAssertNil(MarkAsReadBody.scopedLanguages([idB: "de"], to: [idA]))
        XCTAssertNil(MarkAsReadBody.scopedLanguages(nil, to: [idA]))
        XCTAssertNil(MarkAsReadBody.scopedLanguages([:], to: [idA]))
    }

    /// Sans langue, aucune clé ne doit apparaître : le schéma est `.strict()`,
    /// mais surtout une clé `null` n'apprendrait rien au serveur.
    func test_markAsReadBody_omitsLanguagesWhenAbsent() throws {
        let json = try encodeToJSON(MarkAsReadBody(messageIds: [idA]))

        XCTAssertFalse(json.contains("language"))
        XCTAssertFalse(json.contains("messageLanguages"))
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
