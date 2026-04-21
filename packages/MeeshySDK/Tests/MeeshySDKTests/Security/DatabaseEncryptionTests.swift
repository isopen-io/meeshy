import XCTest
@testable import MeeshySDK

final class DatabaseEncryptionTests: XCTestCase {

    func test_encryptDecrypt_roundTrip() {
        let sut = DatabaseEncryption.shared
        let plaintext = "Hello, World! 🌍"
        guard let encrypted = sut.encryptString(plaintext) else {
            XCTFail("Encryption failed"); return
        }
        XCTAssertNotEqual(encrypted, Data(plaintext.utf8))
        let decrypted = sut.decryptString(encrypted)
        XCTAssertEqual(decrypted, plaintext)
    }

    func test_encryptDecrypt_emptyString() {
        let sut = DatabaseEncryption.shared
        guard let encrypted = sut.encryptString("") else {
            XCTFail("Encryption failed"); return
        }
        XCTAssertEqual(sut.decryptString(encrypted), "")
    }

    func test_encryptCodable_roundTrip() {
        struct TestData: Codable, Equatable {
            let id: String
            let value: Int
        }
        let sut = DatabaseEncryption.shared
        let original = TestData(id: "test1", value: 42)
        guard let encrypted = sut.encryptCodable(original) else {
            XCTFail("Encryption failed"); return
        }
        let decrypted = sut.decryptCodable(TestData.self, from: encrypted)
        XCTAssertEqual(decrypted, original)
    }

    func test_decrypt_invalidData_returnsNil() {
        let sut = DatabaseEncryption.shared
        let garbage = Data([0x00, 0x01, 0x02, 0x03])
        XCTAssertNil(sut.decrypt(garbage))
    }

    func test_encrypt_producesUniqueCiphertexts() {
        let sut = DatabaseEncryption.shared
        let plaintext = "same input"
        guard let enc1 = sut.encryptString(plaintext),
              let enc2 = sut.encryptString(plaintext) else {
            XCTFail("Encryption failed"); return
        }
        // AES-GCM uses random nonce, so ciphertexts differ even for same plaintext
        XCTAssertNotEqual(enc1, enc2)
    }
}
