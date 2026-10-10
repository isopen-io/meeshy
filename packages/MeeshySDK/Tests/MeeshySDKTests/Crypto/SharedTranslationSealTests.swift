import Foundation
import XCTest
@testable import MeeshySDK

/// #9899 — une traduction se scelle sur un appareil et s'ouvre sur un autre.
/// Miroir des tests de comportement de `shared-translation.test.ts` : ce que
/// l'enveloppe cache au serveur, à quoi elle est liée, ce qu'elle refuse.
final class SharedTranslationSealTests: XCTestCase {

    private func makeBinding(
        conversationId: String = "64f0c0ffee0000000000c0de",
        messageId: String = "64f0c0ffee0000000000a001",
        targetLanguage: String = "fr",
        sourceContent: String = "See you at the station at noon."
    ) -> SharedTranslationBinding {
        SharedTranslationBinding(
            conversationId: conversationId, messageId: messageId,
            targetLanguage: targetLanguage, sourceContent: sourceContent
        )
    }

    private func makeInner(
        text: String = "On se retrouve à la gare à midi.",
        sourceLanguage: String = "en",
        engine: String = "apple-translation"
    ) -> SharedTranslationInner {
        SharedTranslationInner(text: text, sourceLanguage: sourceLanguage, engine: engine)
    }

    private func makeSecret(fill: UInt8 = 9, count: Int = 32) -> SharedTranslationKeySource {
        .messageSecret(Data(repeating: fill, count: count))
    }

    // MARK: - Aller et retour

    func test_open_afterSealByContent_rendersTheTranslation() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        XCTAssertEqual(
            SharedTranslationSeal.open(binding: makeBinding(), key: .messageContent, envelope: envelope), makeInner()
        )
    }

    func test_open_afterSealBySecret_rendersTheTranslation() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: makeSecret(), inner: makeInner())

        XCTAssertEqual(envelope.kdf, .messageSecret)
        XCTAssertEqual(
            SharedTranslationSeal.open(binding: makeBinding(), key: makeSecret(), envelope: envelope), makeInner()
        )
    }

    func test_seal_envelopeShowsTheServerNothing() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        let wire = String(decoding: try JSONEncoder().encode(envelope), as: UTF8.self)
        let keys = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(wire.utf8)) as? [String: Any]
        ).keys.sorted()

        XCTAssertFalse(wire.contains("à midi"))
        XCTAssertFalse(wire.contains("apple-translation"))
        XCTAssertFalse(wire.contains("\"en\""))
        XCTAssertEqual(keys, ["alg", "kdf", "payload", "v"])
        XCTAssertEqual(envelope.v, 1)
        XCTAssertEqual(envelope.alg, "A256GCM")
    }

    func test_seal_drawsAFreshNonceEachTime() throws {
        let first = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())
        let second = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        XCTAssertNotEqual(first.payload, second.payload)
    }

    func test_open_whenTheSourceArrivesDecomposed_stillOpens() throws {
        let composed = "Le caf\u{00E9} est pr\u{00EA}t"
        let decomposed = "Le cafe\u{0301} est pre\u{0302}t"
        let envelope = try SharedTranslationSeal.seal(
            binding: makeBinding(sourceContent: composed), key: .messageContent, inner: makeInner()
        )

        XCTAssertEqual(
            SharedTranslationSeal.open(
                binding: makeBinding(sourceContent: decomposed), key: .messageContent, envelope: envelope
            ),
            makeInner()
        )
    }

    // MARK: - Ce à quoi l'enveloppe est liée

    func test_open_withAnotherTargetLanguage_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        XCTAssertNil(SharedTranslationSeal.open(
            binding: makeBinding(targetLanguage: "es"), key: .messageContent, envelope: envelope
        ))
    }

    func test_open_withAnotherMessage_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        XCTAssertNil(SharedTranslationSeal.open(
            binding: makeBinding(messageId: "64f0c0ffee0000000000a002"), key: .messageContent, envelope: envelope
        ))
    }

    func test_open_withAnotherConversation_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        XCTAssertNil(SharedTranslationSeal.open(
            binding: makeBinding(conversationId: "64f0c0ffee0000000000c0df"), key: .messageContent, envelope: envelope
        ))
    }

    func test_open_afterTheMessageWasEdited_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        XCTAssertNil(SharedTranslationSeal.open(
            binding: makeBinding(sourceContent: "See you at the station at one."),
            key: .messageContent, envelope: envelope
        ))
    }

    func test_open_withAnotherSecret_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: makeSecret(fill: 9), inner: makeInner())

        XCTAssertNil(SharedTranslationSeal.open(binding: makeBinding(), key: makeSecret(fill: 8), envelope: envelope))
    }

    func test_open_underAnotherDerivation_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: makeSecret(), inner: makeInner())
        let relabelled = SharedTranslationEnvelope(kdf: .messageContent, payload: envelope.payload)

        XCTAssertNil(SharedTranslationSeal.open(binding: makeBinding(), key: .messageContent, envelope: envelope))
        XCTAssertNil(SharedTranslationSeal.open(binding: makeBinding(), key: .messageContent, envelope: relabelled))
        XCTAssertNil(SharedTranslationSeal.open(binding: makeBinding(), key: makeSecret(), envelope: relabelled))
    }

    func test_open_withAWrongVersionOrAlgorithm_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        XCTAssertNil(SharedTranslationSeal.open(
            binding: makeBinding(), key: .messageContent,
            envelope: SharedTranslationEnvelope(v: 2, kdf: .messageContent, payload: envelope.payload)
        ))
        XCTAssertNil(SharedTranslationSeal.open(
            binding: makeBinding(), key: .messageContent,
            envelope: SharedTranslationEnvelope(alg: "none", kdf: .messageContent, payload: envelope.payload)
        ))
    }

    // MARK: - Ouvrir ne lève jamais

    func test_open_withATamperedTruncatedOrUnreadablePayload_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())
        var bytes = try XCTUnwrap(Data(base64Encoded: envelope.payload))
        let truncated = bytes.prefix(20)
        bytes[20] ^= 0xFF

        for payload in [bytes.base64EncodedString(), truncated.base64EncodedString(), "%%%", ""] {
            XCTAssertNil(
                SharedTranslationSeal.open(
                    binding: makeBinding(), key: .messageContent,
                    envelope: SharedTranslationEnvelope(kdf: .messageContent, payload: payload)
                ),
                "payload: \(payload.prefix(12))"
            )
        }
    }

    func test_open_withASecretOfTheWrongLength_rendersNilInsteadOfThrowing() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: makeSecret(), inner: makeInner())

        XCTAssertNil(SharedTranslationSeal.open(
            binding: makeBinding(), key: makeSecret(count: 16), envelope: envelope
        ))
    }

    // MARK: - Ce qu'un appareil refuse de sceller

    func test_seal_withoutSourceText_throws() {
        XCTAssertThrowsError(try SharedTranslationSeal.seal(
            binding: makeBinding(sourceContent: ""), key: .messageContent, inner: makeInner()
        )) { XCTAssertEqual($0 as? SharedTranslationSealError, .emptySourceContent) }
    }

    func test_seal_withASecretOfTheWrongLength_throws() {
        XCTAssertThrowsError(try SharedTranslationSeal.seal(
            binding: makeBinding(), key: makeSecret(count: 16), inner: makeInner()
        )) { XCTAssertEqual($0 as? SharedTranslationSealError, .invalidSecretLength) }
    }

    func test_seal_withABadNonce_throws() {
        XCTAssertThrowsError(try SharedTranslationSeal.seal(
            binding: makeBinding(), key: .messageContent, inner: makeInner(), nonce: Data(repeating: 0, count: 8)
        )) { XCTAssertEqual($0 as? SharedTranslationSealError, .invalidNonce) }
    }

    func test_seal_withAnEmptyTranslation_throws() {
        XCTAssertThrowsError(try SharedTranslationSeal.seal(
            binding: makeBinding(), key: .messageContent, inner: makeInner(text: "")
        )) { XCTAssertEqual($0 as? SharedTranslationSealError, .invalidInner) }
    }

    func test_seal_withAMalformedLanguageOrEngine_throws() {
        let longEngine = String(repeating: "e", count: SharedTranslationLimits.engineMaxLength + 1)

        for inner in [makeInner(sourceLanguage: "français"), makeInner(sourceLanguage: ""), makeInner(engine: ""), makeInner(engine: longEngine)] {
            XCTAssertThrowsError(try SharedTranslationSeal.seal(
                binding: makeBinding(), key: .messageContent, inner: inner
            )) { XCTAssertEqual($0 as? SharedTranslationSealError, .invalidInner) }
        }
    }

    func test_seal_theTextLimitIsCountedInUTF16Units() throws {
        let atTheLimit = String(repeating: "👋", count: SharedTranslationLimits.textMaxLength / 2)

        let envelope = try SharedTranslationSeal.seal(
            binding: makeBinding(), key: .messageContent, inner: makeInner(text: atTheLimit)
        )

        XCTAssertEqual(envelope.v, 1)
        XCTAssertThrowsError(try SharedTranslationSeal.seal(
            binding: makeBinding(), key: .messageContent, inner: makeInner(text: atTheLimit + "!")
        )) { XCTAssertEqual($0 as? SharedTranslationSealError, .invalidInner) }
    }

    func test_seal_whatTheGatewayWouldRefuseForItsSizeThrows() {
        let escapedControlCharacters = String(repeating: "\u{01}", count: SharedTranslationLimits.textMaxLength)

        XCTAssertThrowsError(try SharedTranslationSeal.seal(
            binding: makeBinding(), key: .messageContent, inner: makeInner(text: escapedControlCharacters)
        )) { XCTAssertEqual($0 as? SharedTranslationSealError, .payloadTooLong) }
    }

    func test_seal_whatItSealsRespectsTheGatewayPayloadBounds() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        XCTAssertGreaterThanOrEqual(envelope.payload.utf8.count, SharedTranslationLimits.payloadMinLength)
        XCTAssertLessThanOrEqual(envelope.payload.utf8.count, SharedTranslationLimits.payloadMaxLength)
    }
}
