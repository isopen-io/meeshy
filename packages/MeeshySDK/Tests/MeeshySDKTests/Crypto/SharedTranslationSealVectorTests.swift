import CryptoKit
import Foundation
import XCTest
@testable import MeeshySDK

/// Rejeu iOS des vecteurs du scellement d'une traduction partagée (#9899).
///
/// `packages/shared/fixtures/shared-translation/seal.vectors.json` est le
/// CONTRAT : le module TypeScript (`utils/shared-translation-seal.ts`) le produit
/// en s'EXÉCUTANT, nonce fixé, et le rejoue ; ce test le rejoue avec CryptoKit.
/// Il retrouve l'empreinte, la clé, les données associées et le JSON canonique,
/// rescelle avec le même nonce et doit retrouver le même `payload` octet pour
/// octet, ouvre chaque `payload` et n'ouvre aucun des refus. Sur divergence,
/// c'est le TypeScript qui a raison : le miroir bouge, jamais le vecteur.
final class SharedTranslationSealVectorTests: XCTestCase {

    private struct VectorFile: Decodable {
        let cases: [Vector]
        let rejections: [Rejection]
    }

    private struct Vector: Decodable {
        let label: String
        let input: Input
        let expected: Expected

        private enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private struct Input: Decodable {
        let kdf: SharedTranslationKdf
        let conversationId: String
        let messageId: String
        let targetLanguage: String
        let sourceContent: String
        let secret: String?
        let nonce: String
        let inner: SharedTranslationInner
    }

    private struct Expected: Decodable {
        let sourceDigest: String
        let key: String
        let aad: String
        let innerJson: String
        let payload: String
    }

    private struct Rejection: Decodable {
        let label: String
        let opening: Opening

        private enum CodingKeys: String, CodingKey {
            case label = "_label"
            case opening = "open"
        }
    }

    private struct Opening: Decodable {
        let kdf: SharedTranslationKdf
        let conversationId: String
        let messageId: String
        let targetLanguage: String
        let sourceContent: String
        let secret: String?
        let envelope: SharedTranslationEnvelope
    }

    // MARK: - Helpers

    private func loadVectors() throws -> VectorFile {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Crypto
            .deletingLastPathComponent() // MeeshySDKTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK
            .deletingLastPathComponent() // packages
            .appendingPathComponent("shared/fixtures/shared-translation/seal.vectors.json")
        return try JSONDecoder().decode(VectorFile.self, from: Data(contentsOf: url))
    }

    private func makeBinding(
        conversationId: String, messageId: String, targetLanguage: String, sourceContent: String
    ) -> SharedTranslationBinding {
        SharedTranslationBinding(
            conversationId: conversationId, messageId: messageId,
            targetLanguage: targetLanguage, sourceContent: sourceContent
        )
    }

    private func keySource(kdf: SharedTranslationKdf, secret: String?) throws -> SharedTranslationKeySource {
        switch kdf {
        case .messageContent:
            return .messageContent
        case .messageSecret:
            let encoded = try XCTUnwrap(secret, "un cas message-secret porte son secret")
            return .messageSecret(try XCTUnwrap(Data(base64Encoded: encoded)))
        }
    }

    private func bindingAndKey(_ input: Input) throws -> (SharedTranslationBinding, SharedTranslationKeySource) {
        let source = try keySource(kdf: input.kdf, secret: input.secret)
        let sealedBinding = makeBinding(
            conversationId: input.conversationId, messageId: input.messageId,
            targetLanguage: input.targetLanguage, sourceContent: input.sourceContent
        )
        return (sealedBinding, source)
    }

    // MARK: - Le fichier

    func test_vectorFile_carriesItsCasesAndRejections() throws {
        let file = try loadVectors()

        XCTAssertGreaterThanOrEqual(file.cases.count, 5, "jamais de vert silencieux")
        XCTAssertGreaterThanOrEqual(file.rejections.count, 10, "jamais de vert silencieux")
    }

    // MARK: - Les pièces, une à une

    func test_everyCase_sourceDigestIsTheNFCDigest() throws {
        for vector in try loadVectors().cases {
            XCTAssertEqual(
                SharedTranslationSeal.sourceDigest(vector.input.sourceContent), vector.expected.sourceDigest, vector.label
            )
        }
    }

    func test_everyCase_derivedKeyIsTheTypeScriptKey() throws {
        for vector in try loadVectors().cases {
            let (binding, source) = try bindingAndKey(vector.input)

            let key = try SharedTranslationSeal.derivedKey(binding: binding, key: source)

            XCTAssertEqual(key.withUnsafeBytes { Data($0) }.base64EncodedString(), vector.expected.key, vector.label)
        }
    }

    func test_everyCase_associatedDataIsTheTypeScriptOne() throws {
        for vector in try loadVectors().cases {
            let (binding, _) = try bindingAndKey(vector.input)

            XCTAssertEqual(
                SharedTranslationSeal.aad(binding: binding, kdf: vector.input.kdf), vector.expected.aad, vector.label
            )
        }
    }

    func test_everyCase_canonicalEncodingOfTheInnerIsTheTypeScriptJson() throws {
        for vector in try loadVectors().cases {
            XCTAssertEqual(
                try SharedTranslationSeal.canonicalInnerJSON(vector.input.inner), vector.expected.innerJson, vector.label
            )
        }
    }

    // MARK: - Le scellement et l'ouverture

    func test_everyCase_resealingTheTypeScriptJsonUnderTheSameNonceRendersTheSamePayload() throws {
        for vector in try loadVectors().cases {
            let (binding, source) = try bindingAndKey(vector.input)
            let nonce = try XCTUnwrap(Data(base64Encoded: vector.input.nonce), vector.label)

            let payload = try SharedTranslationSeal.sealedPayload(
                plaintext: Data(vector.expected.innerJson.utf8), binding: binding, key: source, nonce: nonce
            )

            XCTAssertEqual(payload, vector.expected.payload, vector.label)
        }
    }

    func test_everyCase_sealingTheInnerUnderTheSameNonceRendersTheSameEnvelope() throws {
        for vector in try loadVectors().cases {
            let (binding, source) = try bindingAndKey(vector.input)
            let nonce = try XCTUnwrap(Data(base64Encoded: vector.input.nonce), vector.label)

            let envelope = try SharedTranslationSeal.seal(
                binding: binding, key: source, inner: vector.input.inner, nonce: nonce
            )

            XCTAssertEqual(
                envelope,
                SharedTranslationEnvelope(kdf: vector.input.kdf, payload: vector.expected.payload),
                vector.label
            )
        }
    }

    func test_everyCase_opensAndRendersTheSealedTranslation() throws {
        for vector in try loadVectors().cases {
            let (binding, source) = try bindingAndKey(vector.input)
            let envelope = SharedTranslationEnvelope(kdf: vector.input.kdf, payload: vector.expected.payload)

            let opened = SharedTranslationSeal.open(binding: binding, key: source, envelope: envelope)

            XCTAssertEqual(opened, vector.input.inner, vector.label)
        }
    }

    /// Les trois refus de base64 (bits de remplissage non nuls, remplissage absent,
    /// retour à la ligne) désignent les OCTETS d'une enveloppe authentique : ce
    /// n'est pas le déchiffrement qui les refuse, c'est l'écriture.
    func test_theBase64Rejections_areRefusedByTheWritingNotByTheCipher() throws {
        let base64Rejections = try loadVectors().rejections.filter { $0.label.hasPrefix("un base64") }

        XCTAssertGreaterThanOrEqual(base64Rejections.count, 3, "jamais de vert silencieux")
        for rejection in base64Rejections {
            XCTAssertNil(
                SharedTranslationSeal.canonicalBytes(of: rejection.opening.envelope.payload), rejection.label
            )
        }
    }

    func test_noRejection_opens() throws {
        for rejection in try loadVectors().rejections {
            let opening = rejection.opening
            let source = try keySource(kdf: opening.kdf, secret: opening.secret)
            let refused = makeBinding(
                conversationId: opening.conversationId, messageId: opening.messageId,
                targetLanguage: opening.targetLanguage, sourceContent: opening.sourceContent
            )

            XCTAssertNil(
                SharedTranslationSeal.open(binding: refused, key: source, envelope: opening.envelope), rejection.label
            )
        }
    }
}
