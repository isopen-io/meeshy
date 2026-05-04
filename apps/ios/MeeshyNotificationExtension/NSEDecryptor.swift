import Foundation
import CryptoKit

/// Lightweight E2EE decryptor for the Notification Service Extension.
/// Mirrors the decrypt logic from E2EEService without importing MeeshySDK.
/// Uses AES-GCM via CryptoKit with session keys from the shared Keychain.
enum NSEDecryptor {

    /// Attempt to decrypt an E2EE message from the push payload.
    /// Returns the decrypted plaintext, or nil if decryption fails
    /// (missing session key, corrupted ciphertext, etc.).
    static func decrypt(
        encryptedBase64: String,
        senderUserId: String
    ) -> String? {
        guard let sessionKey = loadSessionKey(for: senderUserId) else { return nil }
        guard let combinedData = Data(base64Encoded: encryptedBase64) else { return nil }

        // AES-GCM combined format: nonce (12 bytes) + ciphertext + tag (16 bytes)
        guard combinedData.count > 28 else { return nil }

        do {
            let sealedBox = try AES.GCM.SealedBox(combined: combinedData)
            let decryptedData = try AES.GCM.open(sealedBox, using: sessionKey)
            return String(data: decryptedData, encoding: .utf8)
        } catch {
            return nil
        }
    }

    /// Read the E2EE session key from the shared Keychain.
    /// Key format matches SessionManager: base64-encoded SymmetricKey raw bytes
    /// stored at account "me.meeshy.e2ee.session.{userId}" with service "me.meeshy.app".
    private static func loadSessionKey(for userId: String) -> SymmetricKey? {
        let account = "me.meeshy.e2ee.session.\(userId)"
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "me.meeshy.app",
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let base64String = String(data: data, encoding: .utf8),
              let keyData = Data(base64Encoded: base64String)
        else { return nil }

        return SymmetricKey(data: keyData)
    }
}
