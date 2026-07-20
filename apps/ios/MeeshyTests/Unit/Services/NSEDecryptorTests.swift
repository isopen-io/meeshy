import XCTest
import CryptoKit
@testable import Meeshy

/// N3 — the NSE must read the E2EE session key at the NAMESPACED Keychain
/// account written by the app (`{activeUserId}.me.meeshy.e2ee.session.{senderId}`,
/// see `KeychainManager.namespacedKey` + `SessionManager.persistSession`),
/// with a fallback on the legacy un-namespaced account for sessions persisted
/// before namespacing. `NSEDecryptor.swift` is compiled into BOTH the NSE
/// target and `MeeshyTests` (same pattern as `NotificationPayloadHelpers`) so
/// the lookup policy is unit-testable without the extension runtime; the
/// keychain read is injected as a closure.
final class NSEDecryptorTests: XCTestCase {

    // MARK: - Helpers

    /// `nonisolated` so `spy.read` converts to the plain `(String) -> Data?`
    /// parameter of `NSEDecryptor.decrypt` (a MainActor-isolated method
    /// reference would not). Single-threaded test usage — no synchronization.
    private nonisolated final class KeychainReaderSpy {
        private(set) var requestedAccounts: [String] = []
        var storage: [String: Data] = [:]

        func read(_ account: String) -> Data? {
            requestedAccounts.append(account)
            return storage[account]
        }
    }

    /// Encodes a session key exactly like `SessionManager.persistSession`:
    /// the Keychain item's data is the UTF-8 bytes of the base64-encoded raw key.
    private func keychainData(for key: SymmetricKey) -> Data {
        let raw = key.withUnsafeBytes { Data($0) }
        return Data(raw.base64EncodedString().utf8)
    }

    private func sealedBase64(_ plaintext: String, key: SymmetricKey) throws -> String {
        let sealed = try AES.GCM.seal(Data(plaintext.utf8), using: key)
        guard let combined = sealed.combined else {
            throw NSError(domain: "test", code: 1)
        }
        return combined.base64EncodedString()
    }

    // MARK: - sessionKeyAccountCandidates

    func test_sessionKeyAccountCandidates_withActiveUser_namespacedFirstThenLegacy() {
        let candidates = NSEDecryptor.sessionKeyAccountCandidates(
            activeUserId: "user1",
            senderUserId: "sender9"
        )
        XCTAssertEqual(candidates, [
            "user1.me.meeshy.e2ee.session.sender9",
            "me.meeshy.e2ee.session.sender9"
        ])
    }

    func test_sessionKeyAccountCandidates_nilActiveUser_legacyOnly() {
        let candidates = NSEDecryptor.sessionKeyAccountCandidates(
            activeUserId: nil,
            senderUserId: "sender9"
        )
        XCTAssertEqual(candidates, ["me.meeshy.e2ee.session.sender9"])
    }

    func test_sessionKeyAccountCandidates_emptyActiveUser_legacyOnly() {
        let candidates = NSEDecryptor.sessionKeyAccountCandidates(
            activeUserId: "",
            senderUserId: "sender9"
        )
        XCTAssertEqual(candidates, ["me.meeshy.e2ee.session.sender9"])
    }

    // MARK: - decrypt

    func test_decrypt_namespacedKeyPresent_returnsPlaintext() throws {
        let key = SymmetricKey(size: .bits256)
        let spy = KeychainReaderSpy()
        spy.storage["user1.me.meeshy.e2ee.session.sender9"] = keychainData(for: key)

        let decrypted = NSEDecryptor.decrypt(
            encryptedBase64: try sealedBase64("bonjour", key: key),
            senderUserId: "sender9",
            activeUserId: "user1",
            readKeychainData: spy.read
        )

        XCTAssertEqual(decrypted, "bonjour")
        XCTAssertEqual(
            spy.requestedAccounts,
            ["user1.me.meeshy.e2ee.session.sender9"],
            "Legacy account must not be queried when the namespaced key exists"
        )
    }

    func test_decrypt_namespacedMissing_fallsBackToLegacyKey() throws {
        let key = SymmetricKey(size: .bits256)
        let spy = KeychainReaderSpy()
        spy.storage["me.meeshy.e2ee.session.sender9"] = keychainData(for: key)

        let decrypted = NSEDecryptor.decrypt(
            encryptedBase64: try sealedBase64("héritage", key: key),
            senderUserId: "sender9",
            activeUserId: "user1",
            readKeychainData: spy.read
        )

        XCTAssertEqual(decrypted, "héritage")
        XCTAssertEqual(spy.requestedAccounts, [
            "user1.me.meeshy.e2ee.session.sender9",
            "me.meeshy.e2ee.session.sender9"
        ])
    }

    func test_decrypt_noSessionKey_returnsNil() throws {
        let key = SymmetricKey(size: .bits256)
        let spy = KeychainReaderSpy()

        let decrypted = NSEDecryptor.decrypt(
            encryptedBase64: try sealedBase64("perdu", key: key),
            senderUserId: "sender9",
            activeUserId: "user1",
            readKeychainData: spy.read
        )

        XCTAssertNil(decrypted)
    }

    func test_decrypt_wrongKey_returnsNil() throws {
        let sealingKey = SymmetricKey(size: .bits256)
        let otherKey = SymmetricKey(size: .bits256)
        let spy = KeychainReaderSpy()
        spy.storage["user1.me.meeshy.e2ee.session.sender9"] = keychainData(for: otherKey)

        let decrypted = NSEDecryptor.decrypt(
            encryptedBase64: try sealedBase64("secret", key: sealingKey),
            senderUserId: "sender9",
            activeUserId: "user1",
            readKeychainData: spy.read
        )

        XCTAssertNil(decrypted)
    }

    func test_decrypt_malformedBase64_returnsNil() {
        let key = SymmetricKey(size: .bits256)
        let spy = KeychainReaderSpy()
        spy.storage["user1.me.meeshy.e2ee.session.sender9"] = keychainData(for: key)

        let decrypted = NSEDecryptor.decrypt(
            encryptedBase64: "%%%not-base64%%%",
            senderUserId: "sender9",
            activeUserId: "user1",
            readKeychainData: spy.read
        )

        XCTAssertNil(decrypted)
    }

    // MARK: - keychainQuery

    func test_keychainQuery_withAccessGroup_setsKSecAttrAccessGroup() {
        let query = NSEDecryptor.keychainQuery(
            account: "user1.me.meeshy.e2ee.session.sender9",
            accessGroup: "TEAM123.me.meeshy.app"
        )
        XCTAssertEqual(query[kSecAttrAccessGroup as String] as? String, "TEAM123.me.meeshy.app")
        XCTAssertEqual(query[kSecAttrService as String] as? String, "me.meeshy.app")
        XCTAssertEqual(query[kSecAttrAccount as String] as? String, "user1.me.meeshy.e2ee.session.sender9")
    }

    func test_keychainQuery_withoutAccessGroup_omitsKSecAttrAccessGroup() {
        let query = NSEDecryptor.keychainQuery(
            account: "me.meeshy.e2ee.session.sender9",
            accessGroup: nil
        )
        XCTAssertNil(query[kSecAttrAccessGroup as String])
    }
}
