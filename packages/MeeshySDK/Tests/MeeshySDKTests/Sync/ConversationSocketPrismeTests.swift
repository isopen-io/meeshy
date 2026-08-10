import Foundation
import XCTest
@testable import MeeshySDK

/// Le Prisme de la ligne de liste sur le chemin SOCKET.
///
/// `GET /conversations` construit sa carte d'aperçu côté serveur
/// (`buildLastMessagePreviewTranslations`, gateway) avec quatre exclusions
/// nommées : hors prisme du lecteur, langue d'origine, traduction chiffrée,
/// texte inexploitable — puis plafonne chaque aperçu à 300 points de code.
/// `ConversationSyncEngine.previewTranslations` dérive LA MÊME carte du
/// `message:new`, et n'appliquait aucune des quatre.
///
/// La troisième exclusion est la seule qui change le texte affiché : le
/// `translatedContent` d'une traduction chiffrée est un CRYPTOGRAMME, et la
/// clé de déchiffrement ne transite pas par ce chemin. Sans le filtre, la
/// ligne de liste rend du base64 là où la même conversation servie par REST
/// rend l'original. Les trois autres n'alourdissent « que » le cache — d'autant
/// de langues que la conversation en compte.
///
/// Témoins jumeaux : `last-message-prisme.test.ts` (gateway).
final class ConversationSocketPrismeTests: XCTestCase {

    // MARK: - Factory

    /// `message:new` tel que le gateway le pose sur le fil — les traductions y
    /// sont un TABLEAU (`transformTranslationsToArray`), pas la carte Mongo.
    private func makeAPIMessage(
        originalLanguage: String? = "en",
        translations: [[String: Any]]?
    ) throws -> APIMessage {
        var body: [String: Any] = [
            "id": "m1",
            "conversationId": "conv1",
            "senderId": "u2",
            "content": "Hello",
            "createdAt": "2026-08-10T10:00:00Z"
        ]
        if let originalLanguage { body["originalLanguage"] = originalLanguage }
        if let translations { body["translations"] = translations }
        let data = try JSONSerialization.data(withJSONObject: body)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIMessage.self, from: data)
    }

    private func translation(
        language: String,
        content: String,
        isEncrypted: Bool? = nil
    ) -> [String: Any] {
        var entry: [String: Any] = [
            "id": "m1-\(language)",
            "messageId": "m1",
            "targetLanguage": language,
            "translatedContent": content,
            "translationModel": "basic"
        ]
        if let isEncrypted { entry["isEncrypted"] = isEncrypted }
        return entry
    }

    // MARK: - Exclusion #3 — traduction chiffrée

    func test_previewTranslations_dropsEncryptedTranslation() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "fr", content: "U2FsdGVkX1+base64==", isEncrypted: true)
        ])

        let map = ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"])

        XCTAssertNil(
            map,
            "un cryptogramme ne décrit aucun aperçu — la ligne doit retomber sur l'original"
        )
    }

    func test_previewTranslations_keepsClearTranslationBesideAnEncryptedOne() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "fr", content: "U2FsdGVkX1+base64==", isEncrypted: true),
            translation(language: "es", content: "Hola")
        ])

        let map = ConversationSyncEngine.previewTranslations(
            from: message, viewerLanguages: ["fr", "es"])

        XCTAssertEqual(map, ["es": "Hola"],
                       "le filtre porte sur l'entrée chiffrée, pas sur toute la carte")
    }

    func test_previewTranslations_keepsTranslationExplicitlyNotEncrypted() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "fr", content: "Bonjour", isEncrypted: false)
        ])

        let map = ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"])

        XCTAssertEqual(map, ["fr": "Bonjour"])
    }

    // MARK: - Exclusion #1 — hors prisme du lecteur

    func test_previewTranslations_keepsOnlyTheViewerLanguages() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "fr", content: "Bonjour"),
            translation(language: "es", content: "Hola"),
            translation(language: "de", content: "Hallo")
        ])

        let map = ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"])

        XCTAssertEqual(map, ["fr": "Bonjour"],
                       "le résolveur n'affiche qu'UNE valeur — les autres langues n'alourdissent que le cache")
    }

    func test_previewTranslations_returnsNilWhenViewerHasNoLanguages() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "fr", content: "Bonjour")
        ])

        XCTAssertNil(ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: []))
    }

    // MARK: - Exclusion #2 — langue d'origine

    func test_previewTranslations_dropsTheOriginalLanguage() throws {
        let message = try makeAPIMessage(originalLanguage: "en", translations: [
            translation(language: "en", content: "Hello"),
            translation(language: "fr", content: "Bonjour")
        ])

        let map = ConversationSyncEngine.previewTranslations(
            from: message, viewerLanguages: ["en", "fr"])

        XCTAssertEqual(map, ["fr": "Bonjour"],
                       "la langue d'origine EST déjà lastMessagePreview — la republier double l'octet pour rien")
    }

    /// Règle #3 du Prisme : la langue d'origine concourt à son RANG. Retirer sa
    /// clé de la carte ne doit JAMAIS rétrograder le lecteur vers une langue de
    /// rang inférieur — `resolvedLastMessagePreview` rend l'original en
    /// atteignant ce rang, grâce à `lastMessageOriginalLanguage` que la facette
    /// socket transporte.
    func test_resolver_stillServesTheOriginalAtItsOwnRank_afterExclusion() throws {
        let message = try makeAPIMessage(originalLanguage: "en", translations: [
            translation(language: "en", content: "Hello"),
            translation(language: "fr", content: "Bonjour")
        ])
        let map = ConversationSyncEngine.previewTranslations(
            from: message, viewerLanguages: ["en", "fr"])

        var conversation = TestFactories.makeConversation(id: "conv1")
        conversation.lastMessagePreview = "Hello"
        conversation.lastMessageTranslations = map
        conversation.lastMessageOriginalLanguage = "en"

        XCTAssertEqual(
            conversation.resolvedLastMessagePreview(preferredLanguages: ["en", "fr"]),
            "Hello",
            "prisme ['en','fr'] sur un message anglais : l'anglais gagne à son rang 1"
        )
        XCTAssertEqual(
            conversation.resolvedLastMessagePreview(preferredLanguages: ["fr", "en"]),
            "Bonjour",
            "prisme ['fr','en'] : la primaire française gagne, jamais l'original"
        )
    }

    // MARK: - Exclusion #4 — texte inexploitable

    func test_previewTranslations_dropsBlankTranslation() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "fr", content: "   \n ")
        ])

        XCTAssertNil(
            ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"]),
            "une entrée blanche ne décrit aucun aperçu"
        )
    }

    // MARK: - Plafond d'aperçu

    func test_previewTranslations_truncatesToThePreviewCap() throws {
        let long = String(repeating: "é", count: 500)
        let message = try makeAPIMessage(translations: [
            translation(language: "fr", content: long)
        ])

        let map = ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"])

        XCTAssertEqual(map?["fr"]?.count, String.meeshyPreviewMaxLength,
                       "le REST plafonne chaque aperçu traduit — sinon le poids de la ligne dépend de la langue du lecteur")
    }

    // MARK: - Invariants conservés

    func test_previewTranslations_lowercasesLanguageKeys() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "FR", content: "Bonjour")
        ])

        let map = ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"])

        XCTAssertEqual(map, ["fr": "Bonjour"],
                       "`resolvedLastMessagePreview` résout en minuscules — une clé « FR » ne serait jamais trouvée")
    }

    func test_previewTranslations_returnsNilNeverAnEmptyMap() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "de", content: "Hallo")
        ])

        XCTAssertNil(
            ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"]),
            "nil est l'état « aucune traduction utile » que le résolveur distingue de la carte vide"
        )
    }

    func test_previewTranslations_returnsNilWithoutTranslations() throws {
        let message = try makeAPIMessage(translations: nil)

        XCTAssertNil(ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"]))
    }

    /// Le prisme est ORDONNÉ, et la carte doit le refléter entrée par entrée :
    /// deux entrées pour la même langue (payload dégradé) gardent la dernière,
    /// comme avant le correctif.
    func test_previewTranslations_lastEntryWinsForADuplicateLanguage() throws {
        let message = try makeAPIMessage(translations: [
            translation(language: "fr", content: "Salut"),
            translation(language: "fr", content: "Bonjour")
        ])

        let map = ConversationSyncEngine.previewTranslations(from: message, viewerLanguages: ["fr"])

        XCTAssertEqual(map, ["fr": "Bonjour"])
    }
}
