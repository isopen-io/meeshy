import Foundation
import CryptoKit

/// Lightweight E2EE decryptor for the Notification Service Extension.
/// Mirrors the decrypt logic from E2EEService without importing MeeshySDK.
/// Uses AES-GCM via CryptoKit with session keys from the shared Keychain.
///
/// Key lookup (N3 fix, 2026-07-20): the app persists session keys NAMESPACED
/// by the active user — Keychain account
/// `{activeUserId}.me.meeshy.e2ee.session.{senderId}` (see
/// `KeychainManager.namespacedKey` + `SessionManager.persistSession`). The
/// NSE resolves `activeUserId` from the App Group `UserDefaults`
/// (`meeshy_active_user_id`, same source as `NSEDataSync.readAuthToken`) and
/// tries the namespaced account FIRST, falling back to the legacy
/// un-namespaced account for sessions persisted before namespacing. Queries
/// pin `kSecAttrAccessGroup` to the shared `<TEAMID>.me.meeshy.app` group —
/// without it the extension process may default to its own bundle group and
/// get `errSecItemNotFound` (same hazard as `NSEDataSync`).
///
/// This file is compiled into BOTH the NSE target and `MeeshyTests` (same
/// pattern as `NotificationPayloadHelpers`) so the lookup policy stays
/// unit-testable; the keychain read is injected as a closure.
enum NSEDecryptor {

    nonisolated private static let appGroupId = "group.me.meeshy.apps"
    nonisolated private static let keychainService = "me.meeshy.app"

    /// Attempt to decrypt an E2EE message from the push payload.
    /// Returns the decrypted plaintext, or nil if decryption fails
    /// (missing session key, corrupted ciphertext, etc.).
    nonisolated static func decrypt(
        encryptedBase64: String,
        senderUserId: String,
        activeUserId: String? = appGroupActiveUserId(),
        readKeychainData: (String) -> Data? = defaultKeychainRead
    ) -> String? {
        guard let sessionKey = loadSessionKey(
            senderUserId: senderUserId,
            activeUserId: activeUserId,
            readKeychainData: readKeychainData
        ) else { return nil }
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

    /// Ordered Keychain accounts to try for a sender's session key:
    /// namespaced (`{activeUserId}.me.meeshy.e2ee.session.{senderId}`) first,
    /// then the legacy un-namespaced account. Without an active user only the
    /// legacy account is meaningful.
    nonisolated static func sessionKeyAccountCandidates(
        activeUserId: String?,
        senderUserId: String
    ) -> [String] {
        let legacy = "me.meeshy.e2ee.session.\(senderUserId)"
        guard let activeUserId, !activeUserId.isEmpty else { return [legacy] }
        return ["\(activeUserId).\(legacy)", legacy]
    }

    /// Active user resolved from the App Group `UserDefaults` — written by
    /// `AuthManager` at login, same source `NSEDataSync.readAuthToken` uses
    /// for the JWT lookup.
    nonisolated static func appGroupActiveUserId() -> String? {
        UserDefaults(suiteName: appGroupId)?.string(forKey: "meeshy_active_user_id")
    }

    /// Builds the `SecItemCopyMatching` query for a session-key account.
    /// `accessGroup` (when resolvable) pins the query to the shared
    /// `<TEAMID>.me.meeshy.app` keychain group — the NSE process may
    /// otherwise default to its own bundle group and silently miss the item.
    nonisolated static func keychainQuery(
        account: String,
        accessGroup: String?
    ) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }

    /// Live keychain read used outside tests.
    nonisolated static func defaultKeychainRead(account: String) -> Data? {
        let query = keychainQuery(account: account, accessGroup: sharedKeychainAccessGroup)
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return data
    }

    /// Resolves the shared keychain access group at runtime by asking iOS for
    /// the group it assigns to a discovery item, then rebasing onto
    /// `me.meeshy.app`. Mirror of `NSEDataSync.sharedKeychainAccessGroup`
    /// (kept self-contained: `NSEDataSync` is not compiled into the test
    /// target, and its helper is private).
    nonisolated private static let sharedKeychainAccessGroup: String? = {
        let discoveryQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "_meeshy_nse_seed_discovery",
            kSecAttrService as String: "_meeshy_nse_seed_discovery",
            kSecReturnAttributes as String: true
        ]
        var result: AnyObject?
        var status = SecItemCopyMatching(discoveryQuery as CFDictionary, &result)
        if status == errSecItemNotFound {
            status = SecItemAdd(discoveryQuery as CFDictionary, &result)
        }
        guard status == errSecSuccess,
              let attributes = result as? [String: Any],
              let assignedGroup = attributes[kSecAttrAccessGroup as String] as? String,
              let teamPrefix = assignedGroup.components(separatedBy: ".").first,
              !teamPrefix.isEmpty else {
            return nil
        }
        return "\(teamPrefix).me.meeshy.app"
    }()

    /// Read the E2EE session key from the shared Keychain, trying the
    /// namespaced account first, then the legacy one. The stored value is the
    /// UTF-8 bytes of the base64-encoded raw `SymmetricKey`.
    private nonisolated static func loadSessionKey(
        senderUserId: String,
        activeUserId: String?,
        readKeychainData: (String) -> Data?
    ) -> SymmetricKey? {
        for account in sessionKeyAccountCandidates(
            activeUserId: activeUserId,
            senderUserId: senderUserId
        ) {
            guard let data = readKeychainData(account),
                  let base64String = String(data: data, encoding: .utf8),
                  let keyData = Data(base64Encoded: base64String)
            else { continue }
            return SymmetricKey(data: keyData)
        }
        return nil
    }
}
