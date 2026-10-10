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
            sourceVersion: "2026-10-10T08:15:30.123Z",
            envelope: SharedTranslationEnvelope(kdf: .messageContent, payload: payload)
        )

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        )
        let envelope = try XCTUnwrap(object["envelope"] as? [String: Any])

        XCTAssertEqual(object.keys.sorted(), ["envelope", "messageId", "sourceVersion", "targetLanguage"])
        XCTAssertEqual(object["messageId"] as? String, "64f0c0ffee0000000000a001")
        XCTAssertEqual(object["targetLanguage"] as? String, "fr")
        XCTAssertEqual(object["sourceVersion"] as? String, "2026-10-10T08:15:30.123Z")
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

    // MARK: - La version du texte que l'appareil a traduit

    /// `sourceVersion` du contrat : `original`, ou l'instant au format `toISOString`.
    private func matchesTheGatewayPattern(_ version: String) -> Bool {
        version.range(
            of: #"^(?:original|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$"#,
            options: .regularExpression
        ) != nil
    }

    /// Ce que le décodeur du SDK fait d'une date du serveur.
    private func decoded(_ iso: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return try XCTUnwrap(formatter.date(from: iso), iso)
    }

    func test_sourceVersion_ofAMessageNeverEdited_isOriginal() {
        XCTAssertEqual(SharedTranslationSourceVersion.of(editedAt: nil), "original")
        XCTAssertEqual(SharedTranslationSourceVersion.original, "original")
    }

    func test_sourceVersion_ofAnEditedMessage_isTheInstantInUTCToTheMillisecond() throws {
        let editedAt = try decoded("2026-10-10T08:15:30.123Z")

        XCTAssertEqual(SharedTranslationSourceVersion.of(editedAt: editedAt), "2026-10-10T08:15:30.123Z")
    }

    func test_sourceVersion_writesAnotherTimezoneAsUTC() throws {
        let editedAt = try decoded("2026-10-10T10:15:30.100+02:00")

        XCTAssertEqual(SharedTranslationSourceVersion.of(editedAt: editedAt), "2026-10-10T08:15:30.100Z")
    }

    func test_sourceVersion_keepsEveryMillisecond() {
        for milliseconds in 0...999 {
            let date = Date(timeIntervalSince1970: 1_791_000_000 + Double(milliseconds) / 1000)

            let version = SharedTranslationSourceVersion.of(editedAt: date)

            XCTAssertEqual(version, "2026-10-03T04:00:00" + String(format: ".%03ldZ", milliseconds), "\(milliseconds)")
            XCTAssertTrue(matchesTheGatewayPattern(version), version)
        }
    }

    func test_sourceVersion_roundsTheMillisecondInsteadOfTruncatingIt() {
        let justBelowTheMillisecond = Date(timeIntervalSince1970: 1_791_620_130.1229999)

        XCTAssertEqual(
            SharedTranslationSourceVersion.of(editedAt: justBelowTheMillisecond), "2026-10-10T08:15:30.123Z"
        )
    }

    func test_sourceVersion_padsEveryFieldLikeToISOString() {
        XCTAssertEqual(
            SharedTranslationSourceVersion.of(editedAt: Date(timeIntervalSince1970: 951_782_400.007)),
            "2000-02-29T00:00:00.007Z"
        )
        XCTAssertEqual(
            SharedTranslationSourceVersion.of(editedAt: Date(timeIntervalSince1970: 1_709_164_799.5)),
            "2024-02-28T23:59:59.500Z"
        )
        XCTAssertEqual(
            SharedTranslationSourceVersion.of(editedAt: Date(timeIntervalSince1970: 4_102_444_800)),
            "2100-01-01T00:00:00.000Z"
        )
    }

    func test_sourceVersion_beforeTheEpoch_countsTheFractionUpwards() {
        XCTAssertEqual(
            SharedTranslationSourceVersion.of(editedAt: Date(timeIntervalSince1970: 0)), "1970-01-01T00:00:00.000Z"
        )
        XCTAssertEqual(
            SharedTranslationSourceVersion.of(editedAt: Date(timeIntervalSince1970: -0.5)), "1969-12-31T23:59:59.500Z"
        )
    }

    func test_sourceVersion_ofADateThatDoesNotRead_isNeverOriginal() {
        for unreadable in [Date(timeIntervalSince1970: .nan), Date(timeIntervalSince1970: .infinity)] {
            let version = SharedTranslationSourceVersion.of(editedAt: unreadable)

            XCTAssertNotEqual(version, "original")
            XCTAssertTrue(matchesTheGatewayPattern(version), version)
        }
    }

    // MARK: - Les refus du partage

    func test_shareRefusal_isReadFromTheCodeTheGatewayPosts() {
        XCTAssertEqual(SharedTranslationShareRefusal(code: "SHARED_TRANSLATION_READ_RECEIPTS_OFF"), .readReceiptsOff)
        XCTAssertEqual(SharedTranslationShareRefusal(code: "SHARED_TRANSLATION_STALE_SOURCE"), .staleSource)
    }

    func test_shareRefusal_ignoresEveryOtherCode() {
        let others: [String?] = [
            nil, "", "SHARED_TRANSLATION_BUDGET_EXCEEDED", "shared_translation_stale_source", "VALIDATION_ERROR"
        ]

        for code in others {
            XCTAssertNil(SharedTranslationShareRefusal(code: code), code ?? "nil")
        }
    }

    // MARK: - Le contrat TypeScript fait foi

    private func contractSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Models
            .deletingLastPathComponent() // MeeshySDKTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK
            .deletingLastPathComponent() // packages
            .appendingPathComponent("shared/types/shared-translation.ts")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `payloadMaxLength: 40_960,` → 40960 : la valeur que le contrat écrit.
    private func contractNumber(_ name: String, in source: String) throws -> Int {
        let range = try XCTUnwrap(source.range(of: "\(name): [0-9_]+,", options: .regularExpression), name)
        return try XCTUnwrap(Int(source[range].filter(\.isNumber)), name)
    }

    func test_limits_areTheOnesTheTypeScriptContractWrites() throws {
        let source = try contractSource()
        let mirrored: [(name: String, value: Int)] = [
            ("payloadMinLength", SharedTranslationLimits.payloadMinLength),
            ("payloadMaxLength", SharedTranslationLimits.payloadMaxLength),
            ("textMaxLength", SharedTranslationLimits.textMaxLength),
            ("engineMaxLength", SharedTranslationLimits.engineMaxLength),
            ("messageIdsMaxCount", SharedTranslationLimits.messageIdsMaxCount),
            ("languagesMaxCount", SharedTranslationLimits.languagesMaxCount),
            ("secretLength", SharedTranslationLimits.secretLength),
            ("nonceLength", SharedTranslationLimits.nonceLength),
            ("tagLength", SharedTranslationLimits.tagLength)
        ]

        for limit in mirrored {
            XCTAssertEqual(try contractNumber(limit.name, in: source), limit.value, limit.name)
        }
    }

    func test_refusalCodes_areWrittenInTheTypeScriptContract() throws {
        let source = try contractSource()

        XCTAssertFalse(SharedTranslationShareRefusal.allCases.isEmpty)
        for refusal in SharedTranslationShareRefusal.allCases {
            XCTAssertTrue(source.contains("'\(refusal.code)'"), refusal.code)
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
