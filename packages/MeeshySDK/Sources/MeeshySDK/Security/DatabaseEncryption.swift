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
    /// Empreinte STABLE de l'identité de la clé courante (jamais la clé
    /// elle-même). Mélangée aux `contentHash` du cache GRDB pour qu'un
    /// changement de clé (perte Keychain, destroyKey) invalide toutes les
    /// empreintes : sans cela, le skip « payload identique » laisserait des
    /// rangées chiffrées sous l'ancienne clé, indéchiffrables pour toujours.
    var keyFingerprint: String { get }
}

public extension DatabaseEncryptionProviding {
    /// Défaut vide — les stubs de test et les stores non chiffrés n'ont pas
    /// d'identité de clé à faire concourir.
    var keyFingerprint: String { "" }
}

public final class DatabaseEncryption: DatabaseEncryptionProviding, @unchecked Sendable {
    public static let shared = DatabaseEncryption()

    private static let keychainKey = "meeshy_db_encryption_key"
    fileprivate static let logger = Logger(subsystem: "com.meeshy.sdk", category: "db-encryption")
    private var logger: Logger { Self.logger }
    private let key: SymmetricKey
    /// SHA-256 des octets de la clé, tronqué — identité de clé, pas un secret
    /// exploitable. Calculé une fois : la clé est stable pour tout le process.
    public let keyFingerprint: String

    private init() {
        let key = Self.loadOrCreateKey()
        self.key = key
        let keyData = key.withUnsafeBytes { Data($0) }
        self.keyFingerprint = SHA256.hash(data: keyData).prefix(8)
            .map { String(format: "%02x", $0) }.joined()
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
        do {
            try keychain.save(keyData.base64EncodedString(), forKey: keychainKey)
        } catch {
            // La clé n'a pas pu être persistée : elle reste valide pour cette
            // session, mais TOUT ce qui sera chiffré avec deviendra illisible
            // au prochain lancement (une nouvelle clé sera générée). `.fault`
            // pour que l'incident remonte dans les diagnostics.
            Self.logger.fault(
                "DB encryption key could not be persisted to Keychain — cache written this session will be unreadable after relaunch: \(error.localizedDescription, privacy: .public)"
            )
        }
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
        let json: Data
        do {
            json = try encoder.encode(value)
        } catch {
            logger.error(
                "Encode failed for \(String(describing: T.self), privacy: .public): \(error.localizedDescription, privacy: .public)"
            )
            return nil
        }
        return encrypt(json)
    }

    public func decryptCodable<T: Decodable>(_ type: T.Type, from ciphertext: Data) -> T? {
        guard let json = decrypt(ciphertext) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            return try decoder.decode(type, from: json)
        } catch {
            // Déchiffrement OK mais schéma incompatible : donnée écrite par une
            // version antérieure du modèle. Le nil est traité comme un cache miss.
            logger.error(
                "Decode failed for \(String(describing: type), privacy: .public) — stale cache schema: \(error.localizedDescription, privacy: .public)"
            )
            return nil
        }
    }

    /// Wipes the encryption key from Keychain. Called on account deletion
    /// so remnant cache data becomes unrecoverable.
    public func destroyKey() {
        KeychainManager.shared.delete(forKey: Self.keychainKey)
    }
}
