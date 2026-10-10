import Foundation
import XCTest
@testable import MeeshySDK

/// #9899 — le contrat de la traduction partagée, vu du décodage : ce que la
/// passerelle sert (REST et `message:translation-shared`), ce que l'appareil
/// envoie, et les deux formes que le contrat valide par expression régulière.
final class SharedTranslationModelsTests: XCTestCase {

    private let payload = "AAECAwQFBgcICQoLIaP2d4BN5n7LZzhFfM5LMgef8yGgP//5NrcvJA9z36m/"

    private func sharedTranslationJSON(kdf: String = "message-content", id: String = "st1") -> String {
        """
        {
            "id": "\(id)",
            "conversationId": "64f0c0ffee0000000000c0de",
            "messageId": "64f0c0ffee0000000000a001",
            "targetLanguage": "fr",
            "envelope": { "v": 1, "alg": "A256GCM", "kdf": "\(kdf)", "payload": "\(payload)" },
            "sharedBy": "participant-7",
            "sharedAt": "2026-10-10T08:15:30.000Z"
        }
        """
    }

    private func makeSharedTranslation(id: String = "st1") -> SharedTranslation {
        SharedTranslation(
            id: id, conversationId: "64f0c0ffee0000000000c0de", messageId: "64f0c0ffee0000000000a001",
            targetLanguage: "fr", envelope: SharedTranslationEnvelope(kdf: .messageContent, payload: payload),
            sharedBy: "participant-7", sharedAt: "2026-10-10T08:15:30.000Z"
        )
    }

    // MARK: - Ce que la passerelle sert

    func test_sharedTranslation_decodesTheGatewayPayload() throws {
        let decoded = try JSONDecoder().decode(SharedTranslation.self, from: Data(sharedTranslationJSON().utf8))

        XCTAssertEqual(decoded, makeSharedTranslation())
        XCTAssertEqual(decoded.envelope.kdf, .messageContent)
    }

    func test_sharedTranslation_decodesTheSecretDerivation() throws {
        let decoded = try JSONDecoder().decode(
            SharedTranslation.self, from: Data(sharedTranslationJSON(kdf: "message-secret").utf8)
        )

        XCTAssertEqual(decoded.envelope.kdf, .messageSecret)
    }

    func test_sharedTranslation_withAnUnknownDerivation_doesNotDecode() {
        XCTAssertThrowsError(try JSONDecoder().decode(
            SharedTranslation.self, from: Data(sharedTranslationJSON(kdf: "message-future").utf8)
        ))
    }

    func test_sharedTranslationsResult_dropsWhatItCannotReadAndKeepsTheRest() throws {
        let json = """
        { "sharedTranslations": [
            \(sharedTranslationJSON(id: "st1")),
            \(sharedTranslationJSON(kdf: "message-future", id: "st2")),
            { "id": "st3" },
            \(sharedTranslationJSON(id: "st4"))
        ] }
        """

        let decoded = try JSONDecoder().decode(SharedTranslationsResult.self, from: Data(json.utf8))

        XCTAssertEqual(decoded.sharedTranslations.map(\.id), ["st1", "st4"])
    }

    func test_sharedTranslationsResult_withNoTranslation_isEmpty() throws {
        let decoded = try JSONDecoder().decode(SharedTranslationsResult.self, from: Data(#"{"sharedTranslations":[]}"#.utf8))

        XCTAssertTrue(decoded.sharedTranslations.isEmpty)
    }

    func test_shareTranslationResult_decodesWhetherItWasCreatedOrAlreadyThere() throws {
        let json = #"{"sharedTranslation": \#(sharedTranslationJSON()), "created": false}"#

        let decoded = try JSONDecoder().decode(ShareTranslationResult.self, from: Data(json.utf8))

        XCTAssertEqual(decoded, ShareTranslationResult(sharedTranslation: makeSharedTranslation(), created: false))
    }

    // MARK: - Ce que l'appareil envoie

    func test_shareTranslationBody_encodesTheContractShape() throws {
        let body = ShareTranslationBody(
            messageId: "64f0c0ffee0000000000a001", targetLanguage: "fr",
            envelope: SharedTranslationEnvelope(kdf: .messageContent, payload: payload)
        )

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        )
        let envelope = try XCTUnwrap(object["envelope"] as? [String: Any])

        XCTAssertEqual(object.keys.sorted(), ["envelope", "messageId", "targetLanguage"])
        XCTAssertEqual(object["messageId"] as? String, "64f0c0ffee0000000000a001")
        XCTAssertEqual(object["targetLanguage"] as? String, "fr")
        XCTAssertEqual(envelope.keys.sorted(), ["alg", "kdf", "payload", "v"])
        XCTAssertEqual(envelope["v"] as? Int, 1)
        XCTAssertEqual(envelope["alg"] as? String, "A256GCM")
        XCTAssertEqual(envelope["kdf"] as? String, "message-content")
        XCTAssertEqual(envelope["payload"] as? String, payload)
    }

    // MARK: - Les formes que le contrat valide

    func test_isObjectId_acceptsTwentyFourHexDigitsOnly() {
        XCTAssertTrue(SharedTranslationFormat.isObjectId("64f0c0ffee0000000000a001"))
        XCTAssertTrue(SharedTranslationFormat.isObjectId("64F0C0FFEE0000000000A001"))
        for refused in ["", "nope", "64f0c0ffee0000000000a00", "64f0c0ffee0000000000a0011", "64f0c0ffee0000000000a00g", "64f0c0ffee0000000000a00é"] {
            XCTAssertFalse(SharedTranslationFormat.isObjectId(refused), refused)
        }
    }

    func test_isLanguageCode_acceptsAPrimaryTagWithAnOptionalSubtag() {
        for accepted in ["fr", "fra", "pt-BR", "zh_Hant", "en-US", "bas", "zh-Hant1"] {
            XCTAssertTrue(SharedTranslationFormat.isLanguageCode(accepted), accepted)
        }
        for refused in ["", "f", "français", "fr-", "fr-X", "fr-US-x", "fr--US", "1r", "fr_US_1", "fr-é", "fr-123456789"] {
            XCTAssertFalse(SharedTranslationFormat.isLanguageCode(refused), refused)
        }
    }

    // MARK: - Les traductions du serveur, déplacées avec leur écouteur

    func test_translationEvent_decodesTheServerPayloadWithAndWithoutAConfidenceScore() throws {
        let json = """
        {
            "messageId": "msg1",
            "translations": [
                { "id": "t1", "messageId": "msg1", "sourceLanguage": "en", "targetLanguage": "fr",
                  "translatedContent": "Bonjour", "translationModel": "nllb-200", "confidenceScore": 0.93 },
                { "id": "t2", "messageId": "msg1", "sourceLanguage": "en", "targetLanguage": "es",
                  "translatedContent": "Hola", "translationModel": "nllb-200" }
            ]
        }
        """

        let event = try JSONDecoder().decode(TranslationEvent.self, from: Data(json.utf8))

        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertEqual(event.translations.map(\.targetLanguage), ["fr", "es"])
        XCTAssertEqual(event.translations.first?.confidenceScore, 0.93)
        XCTAssertNil(event.translations.last?.confidenceScore)
    }

    func test_translationData_buildsFromTheAppWithoutAConfidenceScore() {
        let data = TranslationData(
            id: "device:msg1:fr", messageId: "msg1", sourceLanguage: "en", targetLanguage: "fr",
            translatedContent: "Bonjour", translationModel: "apple-translation"
        )
        let event = TranslationEvent(messageId: "msg1", translations: [data])

        XCTAssertNil(data.confidenceScore)
        XCTAssertEqual(data.id, "device:msg1:fr")
        XCTAssertEqual(event.translations.map(\.translatedContent), ["Bonjour"])
    }
}
