//
//  E2EEncryptionService.swift
//  Meeshy
//
//  End-to-end encryption service using CryptoKit
//  Provides AES-256-GCM encryption for message content
//  Minimum iOS 16+
//
//  IMPORTANT: This service handles local encryption/decryption.
//  Key exchange and key management between participants should be
//  handled separately via a secure key exchange protocol.
//

import Foundation
import CryptoKit

// MARK: - Encrypted Payload

/// Represents an encrypted message payload
struct EncryptedPayload: Codable, Hashable, Sendable {
    /// Base64 encoded ciphertext
    let ciphertext: String

    /// Base64 encoded initialization vector (nonce)
    let iv: String

    /// Base64 encoded authentication tag (GCM tag)
    let authTag: String

    /// Encryption mode: "e2ee", "server", "hybrid"
    let mode: String

    // MARK: - Computed Properties

    /// Decode ciphertext from Base64
    var ciphertextData: Data? {
        Data(base64Encoded: ciphertext)
    }

    /// Decode IV from Base64
    var ivData: Data? {
        Data(base64Encoded: iv)
    }

    /// Decode auth tag from Base64
    var authTagData: Data? {
        Data(base64Encoded: authTag)
    }

    /// Check if this payload uses E2E encryption
    var isE2EEncrypted: Bool {
        mode == "e2ee" || mode == "hybrid"
    }

    // MARK: - Initialization

    init(ciphertext: String, iv: String, authTag: String, mode: String = "e2ee") {
        self.ciphertext = ciphertext
        self.iv = iv
        self.authTag = authTag
        self.mode = mode
    }

    /// Create from raw data components
    init(ciphertextData: Data, ivData: Data, authTagData: Data, mode: String = "e2ee") {
        self.ciphertext = ciphertextData.base64EncodedString()
        self.iv = ivData.base64EncodedString()
        self.authTag = authTagData.base64EncodedString()
        self.mode = mode
    }
}

// MARK: - Encryption Errors

enum E2EEncryptionError: LocalizedError {
    case keyGenerationFailed
    case keyNotFound
    case keyStorageFailed
    case keyRetrievalFailed
    case encryptionFailed(String)
    case decryptionFailed(String)
    case invalidPayload
    case invalidKey
    case messageEncodingFailed
    case messageDecodingFailed

    var errorDescription: String? {
        switch self {
        case .keyGenerationFailed:
            return "Failed to generate encryption key"
        case .keyNotFound:
            return "Encryption key not found for this conversation"
        case .keyStorageFailed:
            return "Failed to store encryption key securely"
        case .keyRetrievalFailed:
            return "Failed to retrieve encryption key"
        case .encryptionFailed(let reason):
            return "Encryption failed: \(reason)"
        case .decryptionFailed(let reason):
            return "Decryption failed: \(reason)"
        case .invalidPayload:
            return "Invalid encrypted payload"
        case .invalidKey:
            return "Invalid encryption key"
        case .messageEncodingFailed:
            return "Failed to encode message for encryption"
        case .messageDecodingFailed:
            return "Failed to decode decrypted message"
        }
    }
}

// MARK: - E2E Encryption Service

/// Service for end-to-end encryption of messages using AES-256-GCM
/// Keys are stored securely in the iOS Keychain via KeychainService
@MainActor
final class E2EEncryptionService: ObservableObject, Sendable {
    // MARK: - Singleton

    static let shared = E2EEncryptionService()

    // MARK: - Properties

    private let keychainService = KeychainService.shared

    /// Key prefix for conversation keys in keychain
    private let keyPrefix = "e2e_key_"

    /// AES-256-GCM requires 256-bit (32 byte) keys
    private let keySize = 32

    // MARK: - Published Properties

    /// Cache of loaded keys to avoid repeated keychain access
    /// Keys are SymmetricKey wrapped in a Sendable container
    @Published private var keyCache: [String: SymmetricKeyWrapper] = [:]

    // MARK: - Initialization

    private init() {}

    // MARK: - Public API: Encryption

    /// Encrypt a message for a specific conversation
    /// - Parameters:
    ///   - message: The plaintext message content
    ///   - conversationId: The conversation ID (used for key lookup)
    /// - Returns: An EncryptedPayload containing the ciphertext, IV, and auth tag
    func encrypt(_ message: String, for conversationId: String) async throws -> EncryptedPayload {
        // Get or create the encryption key for this conversation
        let key = try await getOrCreateKey(for: conversationId)

        // Convert message to UTF-8 data
        guard let messageData = message.data(using: .utf8) else {
            throw E2EEncryptionError.messageEncodingFailed
        }

        // Generate a random nonce (12 bytes for AES-GCM)
        let nonce = AES.GCM.Nonce()

        do {
            // Encrypt using AES-256-GCM
            let sealedBox = try AES.GCM.seal(messageData, using: key, nonce: nonce)

            // Extract components
            // Note: In AES-GCM, the ciphertext and tag are combined in the sealed box
            // We need to separate them for the payload format
            guard let combined = sealedBox.combined else {
                throw E2EEncryptionError.encryptionFailed("Failed to get combined sealed data")
            }

            // AES-GCM combined format: nonce (12 bytes) + ciphertext + tag (16 bytes)
            // We store them separately for clarity and interoperability
            let nonceData = Data(nonce)
            let tagData = sealedBox.tag
            let ciphertextData = sealedBox.ciphertext

            return EncryptedPayload(
                ciphertextData: Data(ciphertextData),
                ivData: nonceData,
                authTagData: tagData,
                mode: "e2ee"
            )
        } catch let error as E2EEncryptionError {
            throw error
        } catch {
            throw E2EEncryptionError.encryptionFailed(error.localizedDescription)
        }
    }

    // MARK: - Public API: Decryption

    /// Decrypt an encrypted payload for a specific conversation
    /// - Parameters:
    ///   - payload: The encrypted payload to decrypt
    ///   - conversationId: The conversation ID (used for key lookup)
    /// - Returns: The decrypted plaintext message
    func decrypt(_ payload: EncryptedPayload, for conversationId: String) async throws -> String {
        // Verify this is an E2E encrypted payload
        guard payload.isE2EEncrypted else {
            throw E2EEncryptionError.invalidPayload
        }

        // Decode payload components
        guard let ciphertextData = payload.ciphertextData,
              let ivData = payload.ivData,
              let tagData = payload.authTagData else {
            throw E2EEncryptionError.invalidPayload
        }

        // Get the encryption key for this conversation
        let key = try await getOrCreateKey(for: conversationId)

        do {
            // Reconstruct the nonce from IV data
            let nonce = try AES.GCM.Nonce(data: ivData)

            // Reconstruct the sealed box
            // AES.GCM.SealedBox requires nonce + ciphertext + tag
            let sealedBox = try AES.GCM.SealedBox(
                nonce: nonce,
                ciphertext: ciphertextData,
                tag: tagData
            )

            // Decrypt
            let decryptedData = try AES.GCM.open(sealedBox, using: key)

            // Convert back to string
            guard let decryptedMessage = String(data: decryptedData, encoding: .utf8) else {
                throw E2EEncryptionError.messageDecodingFailed
            }

            return decryptedMessage
        } catch let error as E2EEncryptionError {
            throw error
        } catch {
            throw E2EEncryptionError.decryptionFailed(error.localizedDescription)
        }
    }

    // MARK: - Public API: Key Management

    /// Get or create an encryption key for a conversation
    /// Keys are stored in the keychain and cached in memory
    /// - Parameter conversationId: The conversation ID
    /// - Returns: The symmetric key for this conversation
    func getOrCreateKey(for conversationId: String) async throws -> SymmetricKey {
        let keychainKey = "\(keyPrefix)\(conversationId)"

        // Check memory cache first
        if let cachedWrapper = keyCache[conversationId] {
            return cachedWrapper.key
        }

        // Try to load from keychain
        if let storedKeyString = keychainService.load(forKey: keychainKey),
           let keyData = Data(base64Encoded: storedKeyString) {
            // Validate key size
            guard keyData.count == keySize else {
                throw E2EEncryptionError.invalidKey
            }

            let key = SymmetricKey(data: keyData)

            // Cache the key
            keyCache[conversationId] = SymmetricKeyWrapper(key: key)

            return key
        }

        // Generate a new key
        let newKey = SymmetricKey(size: .bits256)

        // Store in keychain
        let keyData = newKey.withUnsafeBytes { Data($0) }
        let keyString = keyData.base64EncodedString()

        guard keychainService.save(keyString, forKey: keychainKey) else {
            throw E2EEncryptionError.keyStorageFailed
        }

        // Cache the key
        keyCache[conversationId] = SymmetricKeyWrapper(key: newKey)

        return newKey
    }

    /// Check if a key exists for a conversation
    /// - Parameter conversationId: The conversation ID
    /// - Returns: True if a key exists
    func hasKey(for conversationId: String) -> Bool {
        let keychainKey = "\(keyPrefix)\(conversationId)"
        return keychainService.exists(forKey: keychainKey)
    }

    /// Delete the encryption key for a conversation
    /// - Parameter conversationId: The conversation ID
    func deleteKey(for conversationId: String) {
        let keychainKey = "\(keyPrefix)\(conversationId)"
        keychainService.delete(forKey: keychainKey)
        keyCache.removeValue(forKey: conversationId)
    }

    /// Clear all encryption keys from memory cache
    /// Keys remain in keychain for persistence
    func clearKeyCache() {
        keyCache.removeAll()
    }

    /// Import an existing key for a conversation (e.g., received via key exchange)
    /// - Parameters:
    ///   - keyData: The raw key data (must be 32 bytes for AES-256)
    ///   - conversationId: The conversation ID
    func importKey(_ keyData: Data, for conversationId: String) throws {
        // Validate key size
        guard keyData.count == keySize else {
            throw E2EEncryptionError.invalidKey
        }

        let keychainKey = "\(keyPrefix)\(conversationId)"
        let keyString = keyData.base64EncodedString()

        guard keychainService.save(keyString, forKey: keychainKey) else {
            throw E2EEncryptionError.keyStorageFailed
        }

        let key = SymmetricKey(data: keyData)
        keyCache[conversationId] = SymmetricKeyWrapper(key: key)
    }

    /// Export the key for a conversation (e.g., for key exchange)
    /// - Parameter conversationId: The conversation ID
    /// - Returns: The raw key data
    func exportKey(for conversationId: String) async throws -> Data {
        let key = try await getOrCreateKey(for: conversationId)
        return key.withUnsafeBytes { Data($0) }
    }
}

// MARK: - SymmetricKey Wrapper

/// Wrapper to make SymmetricKey work with @Published
/// SymmetricKey is not Sendable, so we wrap it
private struct SymmetricKeyWrapper: Sendable {
    let key: SymmetricKey

    // SymmetricKey is immutable and thread-safe internally
    // This wrapper allows us to store it in a @Published dictionary
    init(key: SymmetricKey) {
        self.key = key
    }
}

// MARK: - Convenience Extensions

extension EncryptedPayload {
    /// Create a JSON string representation of the payload
    var jsonString: String? {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(self),
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }
        return string
    }

    /// Parse from JSON string
    static func from(jsonString: String) -> EncryptedPayload? {
        guard let data = jsonString.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(EncryptedPayload.self, from: data)
    }
}

// MARK: - Preview/Testing Support

#if DEBUG
extension E2EEncryptionService {
    /// Generate a test key for unit testing
    static func generateTestKey() -> SymmetricKey {
        SymmetricKey(size: .bits256)
    }

    /// Encrypt with a specific key (for testing)
    func encryptWithKey(_ message: String, key: SymmetricKey) throws -> EncryptedPayload {
        guard let messageData = message.data(using: .utf8) else {
            throw E2EEncryptionError.messageEncodingFailed
        }

        let nonce = AES.GCM.Nonce()
        let sealedBox = try AES.GCM.seal(messageData, using: key, nonce: nonce)

        let nonceData = Data(nonce)
        let tagData = sealedBox.tag
        let ciphertextData = sealedBox.ciphertext

        return EncryptedPayload(
            ciphertextData: Data(ciphertextData),
            ivData: nonceData,
            authTagData: tagData,
            mode: "e2ee"
        )
    }

    /// Decrypt with a specific key (for testing)
    func decryptWithKey(_ payload: EncryptedPayload, key: SymmetricKey) throws -> String {
        guard let ciphertextData = payload.ciphertextData,
              let ivData = payload.ivData,
              let tagData = payload.authTagData else {
            throw E2EEncryptionError.invalidPayload
        }

        let nonce = try AES.GCM.Nonce(data: ivData)
        let sealedBox = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertextData, tag: tagData)
        let decryptedData = try AES.GCM.open(sealedBox, using: key)

        guard let message = String(data: decryptedData, encoding: .utf8) else {
            throw E2EEncryptionError.messageDecodingFailed
        }

        return message
    }
}
#endif
