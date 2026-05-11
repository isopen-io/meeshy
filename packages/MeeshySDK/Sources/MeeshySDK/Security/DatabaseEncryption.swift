import Foundation
import CryptoKit
import os

/// Abstraction over `DatabaseEncryption.shared` so callers can inject a stub
/// in tests (e.g. one that simulates a corrupted Keychain key by returning
/// `nil` on encrypt). The shared singleton conforms by virtue of its public
/// `encrypt(_:)` / `decrypt(_:)` API.
public protocol DatabaseEncryptionProviding: Sendable {
    func encrypt(_ plaintext: Data) -> Data?
    func decrypt(_ ciphertext: Data) -> Data?
}

public final class DatabaseEncryption: DatabaseEncryptionProviding, @unchecked Sendable {
    public static let shared = DatabaseEncryption()

    private static let keychainKey = "meeshy_db_encryption_key"
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "db-encryption")
    private let key: SymmetricKey

    private init() {
        key = Self.loadOrCreateKey()
    }

    // MARK: - Key Management

    private static func loadOrCreateKey() -> SymmetricKey {
        let keychain = KeychainManager.shared

        if let existing = keychain.load(forKey: keychainKey),
           let data = Data(base64Encoded: existing),
           data.count == 32 {
            return SymmetricKey(data: data)
        }

        let newKey = SymmetricKey(size: .bits256)
        let keyData = newKey.withUnsafeBytes { Data($0) }
        try? keychain.save(keyData.base64EncodedString(), forKey: keychainKey)
        return newKey
    }

    // MARK: - Encrypt / Decrypt

    public func encrypt(_ plaintext: Data) -> Data? {
        do {
            let sealedBox = try AES.GCM.seal(plaintext, using: key)
            return sealedBox.combined
        } catch {
            logger.error("Encryption failed: \(error.localizedDescription)")
            return nil
        }
    }

    public func decrypt(_ ciphertext: Data) -> Data? {
        do {
            let sealedBox = try AES.GCM.SealedBox(combined: ciphertext)
            return try AES.GCM.open(sealedBox, using: key)
        } catch {
            logger.error("Decryption failed: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - String convenience

    public func encryptString(_ string: String) -> Data? {
        guard let data = string.data(using: .utf8) else { return nil }
        return encrypt(data)
    }

    public func decryptString(_ ciphertext: Data) -> String? {
        guard let data = decrypt(ciphertext) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - Codable convenience

    public func encryptCodable<T: Encodable>(_ value: T) -> Data? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let json = try? encoder.encode(value) else { return nil }
        return encrypt(json)
    }

    public func decryptCodable<T: Decodable>(_ type: T.Type, from ciphertext: Data) -> T? {
        guard let json = decrypt(ciphertext) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(type, from: json)
    }

    /// Wipes the encryption key from Keychain. Called on account deletion
    /// so remnant cache data becomes unrecoverable.
    public func destroyKey() {
        KeychainManager.shared.delete(forKey: Self.keychainKey)
    }
}
