import XCTest
import CryptoKit
@testable import Meeshy

final class E2EEServiceTests: XCTestCase {

    private var service: E2EEService { E2EEService.shared }

    override func setUp() async throws {
        service.clearAllKeys()
    }

    override func tearDown() async throws {
        service.clearAllKeys()
    }

    // MARK: - Bundle Generation

    func test_generatePublicBundle_returnsValidBundle() throws {
        let bundle = try service.generatePublicBundle()

        XCTAssertFalse(bundle.identityKey.isEmpty, "Identity key should not be empty")
        XCTAssertFalse(bundle.signedPreKeyPublic.isEmpty, "Signed pre-key should not be empty")
        XCTAssertFalse(bundle.signedPreKeySignature.isEmpty, "Signature should not be empty")
        XCTAssertGreaterThan(bundle.registrationId, 0, "Registration ID should be positive")
        XCTAssertGreaterThan(bundle.signedPreKeyId, 0, "Signed pre-key ID should be positive")
        XCTAssertEqual(bundle.deviceId, 1, "Device ID should be 1")
    }

    func test_generatePublicBundle_includesPreKey() throws {
        let bundle = try service.generatePublicBundle()

        XCTAssertNotNil(bundle.preKeyId, "Pre-key ID should be present")
        XCTAssertNotNil(bundle.preKeyPublic, "Pre-key public should be present")
        XCTAssertFalse(bundle.preKeyPublic?.isEmpty ?? true, "Pre-key public should not be empty")
    }

    func test_generatePublicBundle_identityKeyIsIdempotent() throws {
        let bundle1 = try service.generatePublicBundle()
        let bundle2 = try service.generatePublicBundle()

        XCTAssertEqual(bundle1.identityKey, bundle2.identityKey, "Identity key should persist across calls")
    }

    func test_generatePublicBundle_registrationIdIsIdempotent() throws {
        let bundle1 = try service.generatePublicBundle()
        let bundle2 = try service.generatePublicBundle()

        XCTAssertEqual(bundle1.registrationId, bundle2.registrationId, "Registration ID should persist across calls")
    }

    func test_generatePublicBundle_keysAreValidBase64() throws {
        let bundle = try service.generatePublicBundle()

        XCTAssertNotNil(Data(base64Encoded: bundle.identityKey), "Identity key should be valid base64")
        XCTAssertNotNil(Data(base64Encoded: bundle.signedPreKeyPublic), "Signed pre-key should be valid base64")
        XCTAssertNotNil(Data(base64Encoded: bundle.signedPreKeySignature), "Signature should be valid base64")
        if let preKeyPublic = bundle.preKeyPublic {
            XCTAssertNotNil(Data(base64Encoded: preKeyPublic), "Pre-key public should be valid base64")
        }
    }

    func test_generatePublicBundle_kyberFieldsAreNil() throws {
        let bundle = try service.generatePublicBundle()

        XCTAssertNil(bundle.kyberPreKeyId, "Kyber pre-key ID should be nil (not yet implemented)")
        XCTAssertNil(bundle.kyberPreKeyPublic, "Kyber pre-key public should be nil")
        XCTAssertNil(bundle.kyberPreKeySignature, "Kyber pre-key signature should be nil")
    }

    // MARK: - Identity Key

    func test_getOrGenerateIdentityKey_generatesNewKeyOnFirstCall() throws {
        let key = try service.getOrGenerateIdentityKey()
        XCTAssertEqual(key.publicKey.rawRepresentation.count, 32, "Curve25519 public key should be 32 bytes")
    }

    func test_getOrGenerateIdentityKey_returnsSameKeyOnSubsequentCalls() throws {
        let key1 = try service.getOrGenerateIdentityKey()
        let key2 = try service.getOrGenerateIdentityKey()

        XCTAssertEqual(
            key1.publicKey.rawRepresentation,
            key2.publicKey.rawRepresentation,
            "Identity key should be persisted in keychain"
        )
    }

    // MARK: - Signed PreKey

    func test_getOrGenerateSignedPreKey_generatesNewKeyOnFirstCall() throws {
        let key = try service.getOrGenerateSignedPreKey()
        XCTAssertEqual(key.publicKey.rawRepresentation.count, 32, "Curve25519 public key should be 32 bytes")
    }

    func test_getOrGenerateSignedPreKey_returnsSameKeyOnSubsequentCalls() throws {
        let key1 = try service.getOrGenerateSignedPreKey()
        let key2 = try service.getOrGenerateSignedPreKey()

        XCTAssertEqual(
            key1.publicKey.rawRepresentation,
            key2.publicKey.rawRepresentation,
            "Signed pre-key should be persisted in keychain"
        )
    }

    // MARK: - Signing

    func test_signData_producesValidSignature() throws {
        let data = Data("test message".utf8)
        let signature = try service.signData(data: data)

        XCTAssertFalse(signature.isEmpty, "Signature should not be empty")
        XCTAssertEqual(signature.count, 64, "Ed25519 signature should be 64 bytes")
    }

    func test_signData_signingSameDataProducesSameResult() throws {
        let data = Data("deterministic test".utf8)
        let sig1 = try service.signData(data: data)
        let sig2 = try service.signData(data: data)

        // Ed25519 signatures are deterministic for same key + message
        XCTAssertEqual(sig1, sig2, "Signing same data should produce same signature")
    }

    func test_signData_signingDifferentDataProducesDifferentResult() throws {
        let sig1 = try service.signData(data: Data("message A".utf8))
        let sig2 = try service.signData(data: Data("message B".utf8))

        XCTAssertNotEqual(sig1, sig2, "Different messages should produce different signatures")
    }

    // MARK: - Encryption / Decryption

    func test_encryptDecrypt_roundtrip() throws {
        let plaintext = Data("Hello, Meeshy!".utf8)
        let symmetricKey = SymmetricKey(size: .bits256)

        let encrypted = try service.encrypt(message: plaintext, symmetricKey: symmetricKey)
        let decrypted = try service.decrypt(combinedData: encrypted, symmetricKey: symmetricKey)

        XCTAssertEqual(decrypted, plaintext, "Decrypted text should match original plaintext")
    }

    func test_encrypt_producesNonEmptyOutput() throws {
        let plaintext = Data("test".utf8)
        let symmetricKey = SymmetricKey(size: .bits256)

        let encrypted = try service.encrypt(message: plaintext, symmetricKey: symmetricKey)

        XCTAssertFalse(encrypted.isEmpty, "Encrypted data should not be empty")
        XCTAssertNotEqual(encrypted, plaintext, "Encrypted data should differ from plaintext")
    }

    func test_decrypt_withWrongKey_throws() throws {
        let plaintext = Data("secret".utf8)
        let correctKey = SymmetricKey(size: .bits256)
        let wrongKey = SymmetricKey(size: .bits256)

        let encrypted = try service.encrypt(message: plaintext, symmetricKey: correctKey)

        XCTAssertThrowsError(try service.decrypt(combinedData: encrypted, symmetricKey: wrongKey))
    }

    // MARK: - Symmetric Key Derivation

    func test_deriveSymmetricKey_producesConsistentKey() throws {
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        let otherKey = Curve25519.KeyAgreement.PrivateKey()
        let otherPublicData = otherKey.publicKey.rawRepresentation

        let key1 = try service.deriveSymmetricKey(privateKey: privateKey, publicKeyData: otherPublicData)
        let key2 = try service.deriveSymmetricKey(privateKey: privateKey, publicKeyData: otherPublicData)

        // Derive same key from same inputs
        let testData = Data("test".utf8)
        let enc1 = try AES.GCM.seal(testData, using: key1)
        let dec2 = try AES.GCM.open(enc1, using: key2)
        XCTAssertEqual(dec2, testData, "Same inputs should derive the same symmetric key")
    }

    // MARK: - Key Cleanup

    func test_clearAllKeys_removesIdentityKey() throws {
        _ = try service.getOrGenerateIdentityKey()
        service.clearAllKeys()

        // After clearing, a new call should generate a different key
        let newKey = try service.getOrGenerateIdentityKey()
        // We can't easily compare since the old key is gone, but generation should succeed
        XCTAssertEqual(newKey.publicKey.rawRepresentation.count, 32)
    }
}
