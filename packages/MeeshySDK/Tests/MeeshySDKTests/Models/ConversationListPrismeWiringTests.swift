import XCTest
@testable import MeeshySDK

/// Le Prisme Linguistique de la ligne de liste, câblé de bout en bout.
///
/// `MeeshyConversation.resolvedLastMessagePreview` et sa batterie de témoins
/// (`ConversationPrismeResolutionTests`) existent depuis longtemps — mais le
/// résolveur ne recevait JAMAIS de données par le chemin REST : `APIConversation`
/// n'avait aucun champ à décoder, et `GET /conversations` n'en expédiait aucun.
/// Au démarrage à froid, chaque ligne restait donc dans la langue de
/// l'expéditeur, quel que soit le prisme du lecteur.
///
/// Ces témoins épinglent le câblage manquant : la carte d'aperçu et la langue
/// d'origine doivent traverser `toConversation(currentUserId:)` intactes pour
/// atteindre le résolveur.
final class ConversationListPrismeWiringTests: XCTestCase {

    // MARK: - Factory

    private func decodeConversation(_ payload: [String: Any]) throws -> APIConversation {
        let data = try JSONSerialization.data(withJSONObject: payload)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversation.self, from: data)
    }

    private func payload(
        lastMessageContent: String = "Hello",
        translations: [String: String]? = ["fr": "Bonjour"],
        originalLanguage: String? = "en"
    ) -> [String: Any] {
        var body: [String: Any] = [
            "id": "conv1",
            "type": "direct",
            "createdAt": "2026-08-10T10:00:00Z",
            "lastMessage": [
                "id": "m1",
                "content": lastMessageContent,
                "createdAt": "2026-08-10T10:00:00Z"
            ]
        ]
        if let translations { body["lastMessageTranslations"] = translations }
        if let originalLanguage { body["lastMessageOriginalLanguage"] = originalLanguage }
        return body
    }

    // MARK: - Wire → domain

    func test_toConversation_carriesPreviewTranslationsToTheResolver() throws {
        let api = try decodeConversation(payload())

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.lastMessageTranslations, ["fr": "Bonjour"])
        XCTAssertEqual(conversation.lastMessageOriginalLanguage, "en")
        XCTAssertEqual(
            conversation.resolvedLastMessagePreview(preferredLanguages: ["fr"]),
            "Bonjour",
            "le prisme doit s'appliquer à la ligne de liste dès le premier chargement REST"
        )
    }

    func test_toConversation_lowercasesLanguageKeys() throws {
        let api = try decodeConversation(payload(translations: ["FR": "Bonjour"]))

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.lastMessageTranslations, ["fr": "Bonjour"])
    }

    func test_toConversation_noTranslations_leavesResolverOnTheOriginal() throws {
        let api = try decodeConversation(payload(translations: nil))

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertNil(conversation.lastMessageTranslations)
        XCTAssertEqual(conversation.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Hello")
    }

    /// Une carte vide n'est pas une carte : la laisser passer ferait échouer le
    /// `guard !translations.isEmpty` du résolveur pour rien, et sérialiserait
    /// `{}` dans le cache disque à chaque ligne.
    func test_toConversation_emptyTranslationMap_staysNil() throws {
        let api = try decodeConversation(payload(translations: [:]))

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertNil(conversation.lastMessageTranslations)
    }

    /// Rétrocompatibilité : une gateway antérieure n'envoie ni l'une ni l'autre
    /// clé. La ligne doit rester lisible, pas planter au décodage.
    func test_toConversation_legacyPayloadWithoutTheFields_decodesAndFallsBack() throws {
        let api = try decodeConversation(payload(translations: nil, originalLanguage: nil))

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertNil(conversation.lastMessageTranslations)
        XCTAssertNil(conversation.lastMessageOriginalLanguage)
        XCTAssertEqual(conversation.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Hello")
    }

    /// Règle #3 du Prisme : quand le message EST déjà dans la langue du lecteur,
    /// l'aperçu canonique est l'original. C'est `lastMessageOriginalLanguage`
    /// qui rend cette distinction possible — sans lui, le résolveur ne peut pas
    /// séparer « pas de traduction » de « déjà dans ma langue ».
    func test_toConversation_originalLanguageIsTheViewerLanguage_returnsRawPreview() throws {
        let api = try decodeConversation(
            payload(
                lastMessageContent: "Bonjour",
                translations: ["en": "Hello"],
                originalLanguage: "fr"
            )
        )

        let conversation = api.toConversation(currentUserId: "u1")

        XCTAssertEqual(conversation.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Bonjour")
    }
}
