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

    /// Une enveloppe dont le base64 se termine par `==` : c'est là que des bits de
    /// remplissage peuvent se glisser. Trois longueurs de texte consécutives, dont
    /// une produit toujours ce remplissage.
    private func makePaddedEnvelope() throws -> (envelope: SharedTranslationEnvelope, inner: SharedTranslationInner) {
        let sealed = try (1...3).map { count -> (envelope: SharedTranslationEnvelope, inner: SharedTranslationInner) in
            let inner = makeInner(text: String(repeating: "x", count: count))
            let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: inner)
            return (envelope, inner)
        }
        return try XCTUnwrap(
            sealed.first { $0.envelope.payload.hasSuffix("==") },
            "aucune longueur ne produit un remplissage double"
        )
    }

    /// Ce qu'un décodeur indulgent lit comme les mêmes octets : bits de remplissage
    /// non nuls, remplissage absent, blanc glissé au milieu, blanc en tête.
    private func nonCanonicalVariants(of payload: String) -> [String] {
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")
        let characters = Array(payload)
        let last = characters[characters.count - 3]
        let dirtied = alphabet[(alphabet.firstIndex(of: last) ?? 0) + 1]
        return [
            String(characters.dropLast(3)) + String(dirtied) + "==",
            String(payload.dropLast(2)),
            String(payload.prefix(8)) + "\n" + String(payload.dropFirst(8)),
            " " + payload
        ]
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

    // MARK: - Les champs liés ne peuvent pas se confondre

    private func malformedBindings() -> [(label: String, binding: SharedTranslationBinding)] {
        [
            ("une conversation qui n'est pas un identifiant", makeBinding(conversationId: "64f0c0ffee0000000000c0de|x")),
            ("une conversation vide", makeBinding(conversationId: "")),
            ("une conversation trop courte", makeBinding(conversationId: "64f0c0ffee0000000000c0d")),
            ("un message qui n'est pas un identifiant", makeBinding(messageId: "a001")),
            ("un message hors de l'hexadécimal", makeBinding(messageId: "64f0c0ffee0000000000a00g")),
            ("une langue qui n'en est pas une", makeBinding(targetLanguage: "fr|es")),
            ("une langue écrite en toutes lettres", makeBinding(targetLanguage: "français")),
            ("une langue vide", makeBinding(targetLanguage: ""))
        ]
    }

    func test_seal_withABindingThatIsNotWellFormed_throws() {
        for (label, binding) in malformedBindings() {
            XCTAssertThrowsError(
                try SharedTranslationSeal.seal(binding: binding, key: .messageContent, inner: makeInner()), label
            ) { XCTAssertEqual($0 as? SharedTranslationSealError, .invalidBinding, label) }
        }
    }

    func test_open_withABindingThatIsNotWellFormed_rendersNil() throws {
        let envelope = try SharedTranslationSeal.seal(binding: makeBinding(), key: .messageContent, inner: makeInner())

        for (label, binding) in malformedBindings() {
            XCTAssertNil(SharedTranslationSeal.open(binding: binding, key: .messageContent, envelope: envelope), label)
        }
    }

    func test_sealAndOpen_withTheWholeVocabularyOfIdentifiersAndLanguages_stillRoundTrip() throws {
        let bindings = [
            makeBinding(conversationId: "64F0C0FFEE0000000000C0DE", messageId: "64F0C0FFEE0000000000A001"),
            makeBinding(targetLanguage: "fra"),
            makeBinding(targetLanguage: "pt-BR"),
            makeBinding(targetLanguage: "zh_Hant")
        ]

        for binding in bindings {
            let envelope = try SharedTranslationSeal.seal(binding: binding, key: .messageContent, inner: makeInner())

            XCTAssertEqual(
                SharedTranslationSeal.open(binding: binding, key: .messageContent, envelope: envelope),
                makeInner(),
                binding.targetLanguage
            )
        }
    }

    // MARK: - Un seul base64 : le canonique

    func test_open_theCanonicalWriting_stillOpens() throws {
        let (envelope, inner) = try makePaddedEnvelope()

        XCTAssertTrue(envelope.payload.hasSuffix("=="))
        XCTAssertEqual(
            SharedTranslationSeal.open(binding: makeBinding(), key: .messageContent, envelope: envelope), inner
        )
    }

    func test_open_theSameBytesWrittenAnotherWay_rendersNil() throws {
        let (envelope, _) = try makePaddedEnvelope()
        let variants = nonCanonicalVariants(of: envelope.payload)

        XCTAssertGreaterThanOrEqual(variants.count, 3)
        for payload in variants {
            XCTAssertNil(
                SharedTranslationSeal.open(
                    binding: makeBinding(), key: .messageContent,
                    envelope: SharedTranslationEnvelope(kdf: .messageContent, payload: payload)
                ),
                "payload: …\(payload.suffix(6))"
            )
        }
    }

    func test_canonicalBytes_keepsOnlyTheWritingTheSealProduces() {
        XCTAssertEqual(SharedTranslationSeal.canonicalBytes(of: "AAEC"), Data([0, 1, 2]))
        XCTAssertEqual(SharedTranslationSeal.canonicalBytes(of: "AA=="), Data([0]))
        XCTAssertEqual(SharedTranslationSeal.canonicalBytes(of: "AAE="), Data([0, 1]))
        for refused in ["AB==", "AA", "AA\n==", " AA==", "AAF=", "A", "%%%"] {
            XCTAssertNil(SharedTranslationSeal.canonicalBytes(of: refused), refused)
        }
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

    /// La plus longue traduction admise, dans l'écriture qui pèse le plus (trois
    /// octets UTF-8 par unité UTF-16) : l'enveloppe tient sous la borne que la
    /// passerelle fait respecter, et s'ouvre.
    func test_seal_aFullTextInAThreeByteScript_fitsUnderTheGatewayPayloadBound() throws {
        let cjk = String(repeating: "中", count: SharedTranslationLimits.textMaxLength)

        let envelope = try SharedTranslationSeal.seal(
            binding: makeBinding(), key: .messageContent, inner: makeInner(text: cjk)
        )

        XCTAssertLessThanOrEqual(envelope.payload.utf8.count, SharedTranslationLimits.payloadMaxLength)
        XCTAssertEqual(
            SharedTranslationSeal.open(binding: makeBinding(), key: .messageContent, envelope: envelope)?.text, cjk
        )
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
