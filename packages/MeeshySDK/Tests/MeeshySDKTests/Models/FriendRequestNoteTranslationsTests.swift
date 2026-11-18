import XCTest
@testable import MeeshySDK

/// #19460 (serveur #19258) — le mot d'une demande reçue voyage avec sa langue d'origine et ses traductions, et la
/// fiche d'un autre peut dire qu'il ferme les nouvelles demandes. Lus avec indulgence : absent ou mal formé ⇒ la
/// demande et la fiche se lisent comme avant.
final class FriendRequestNoteTranslationsTests: XCTestCase {

    private func decodeRequest(extra: String) throws -> FriendRequest {
        let json = """
        {"id": "r1", "senderId": "u-sofia", "receiverId": "me", "message": "التقينا في المهرجان!",
         "status": "pending", "createdAt": "2026-11-15T10:30:00Z"\(extra)}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(FriendRequest.self, from: Data(json.utf8))
    }

    func test_decode_sansChamps_neServeAucuneTraduction() throws {
        let request = try decodeRequest(extra: "")

        XCTAssertNil(request.messageOriginalLanguage)
        XCTAssertEqual(request.noteTranslations, [:])
    }

    func test_decode_carteDeTraductions_estLueParLangueEnMinuscules() throws {
        let request = try decodeRequest(extra: """
        , "messageOriginalLanguage": "ar", "messageTranslations": {"FR": " On s'est croisées au festival ! ", "en": ""}
        """)

        XCTAssertEqual(request.messageOriginalLanguage, "ar")
        XCTAssertEqual(request.noteTranslations, ["fr": "On s'est croisées au festival !"])
    }

    func test_decode_traductionUnique_estLue() throws {
        let request = try decodeRequest(extra: """
        , "messageOriginalLanguage": "ar", "messageTranslation": {"language": "fr", "text": "On s'est croisées au festival !"}
        """)

        XCTAssertEqual(request.noteTranslations, ["fr": "On s'est croisées au festival !"])
    }

    func test_decode_listeDeTraductions_estLue() throws {
        let request = try decodeRequest(extra: """
        , "messageTranslations": [{"targetLanguage": "fr", "translatedContent": "Salut"}, {"language": "en", "text": "Hi"}]
        """)

        XCTAssertEqual(request.noteTranslations, ["fr": "Salut", "en": "Hi"])
    }

    func test_decode_formeInattendue_garderLaDemandeSansTraduction() throws {
        let request = try decodeRequest(extra: """
        , "messageTranslations": 42, "messageTranslation": "fr"
        """)

        XCTAssertEqual(request.id, "r1")
        XCTAssertEqual(request.noteTranslations, [:])
    }

    func test_encodage_puisDecodage_garderLesTraductions() throws {
        let request = FriendRequest(id: "r1", senderId: "u-sofia", receiverId: "me", message: "مرحبا", status: "pending",
                                    createdAt: Date(timeIntervalSince1970: 1_000), messageOriginalLanguage: "ar",
                                    messageTranslations: FriendRequestNoteTranslations(["fr": "Salut"]))
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let decoded = try decoder.decode(FriendRequest.self, from: encoder.encode(request))

        XCTAssertEqual(decoded, request)
        XCTAssertEqual(decoded.noteTranslations, ["fr": "Salut"])
    }

    /// Repeindre l'émetteur (`user:updated`) ne fait perdre ni le cran visé, ni la langue du mot, ni ses traductions.
    func test_repeint_garderLeCranEtLesTraductionsDuMot() throws {
        let request = FriendRequest(
            id: "r1", senderId: "u-sofia", receiverId: "me", message: "مرحبا", status: "pending",
            sender: FriendRequestUser(id: "u-sofia", username: "sofia", avatar: "https://cdn/old.png"),
            createdAt: Date(timeIntervalSince1970: 0), targetLevel: "CLOSE", messageOriginalLanguage: "ar",
            messageTranslation: FriendRequestNoteTranslations(["en": "Hi"]),
            messageTranslations: FriendRequestNoteTranslations(["fr": "Salut"])
        )
        let event = try JSONDecoder().decode(
            UserUpdatedEvent.self, from: Data(#"{"userId":"u-sofia","changes":{"avatar":"https://cdn/new.png"}}"#.utf8)
        )

        let repainted = try XCTUnwrap(event.repainted(request))

        XCTAssertEqual(repainted.sender?.avatar, "https://cdn/new.png")
        XCTAssertEqual(repainted.targetLevel, "CLOSE")
        XCTAssertEqual(repainted.messageOriginalLanguage, "ar")
        XCTAssertEqual(repainted.noteTranslations, ["fr": "Salut", "en": "Hi"])
    }

    func test_profil_demandesFermees_seLitSeulementQuandServi() throws {
        let closed = try JSONDecoder().decode(
            MeeshyUser.self, from: Data(#"{"id": "u-sofia", "username": "sofia", "acceptsFriendRequests": false}"#.utf8)
        )
        let legacy = try JSONDecoder().decode(MeeshyUser.self, from: Data(#"{"id": "u-sofia", "username": "sofia"}"#.utf8))

        XCTAssertEqual(closed.acceptsFriendRequests, false)
        XCTAssertNil(legacy.acceptsFriendRequests)
    }

    func test_profil_demandesFermees_survitAuxCopies() {
        let user = MeeshyUser(id: "u-sofia", username: "sofia", acceptsFriendRequests: false)

        XCTAssertEqual(user.withProfileDecor(nil).acceptsFriendRequests, false)
    }
}
