import Foundation
import os
import Security

/// Keychain-backed store for guest (link-based) session context.
///
/// A2 — `kSecAttrAccessible` upgraded from `WhenUnlockedThisDeviceOnly` to
/// `AfterFirstUnlockThisDeviceOnly` so the Notification Service Extension
/// can decrypt guest push payloads while the device is still on the
/// lockscreen. Behavior aligned with `KeychainVoIPTokenStore` (PR #280).
enum AnonymousSessionStore {

    private static let service = "me.meeshy.app.anonymous-session"
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "keychain")

    /// Accessibility class for the Keychain entries owned by this store.
    /// Exposed so tests can pin the invariant without performing live
    /// Keychain reads.
    static let accessibilityClass: CFString = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

    @discardableResult
    static func save(_ context: AnonymousSessionContext) -> Bool {
        guard let data = try? JSONEncoder().encode(context) else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: context.linkId,
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibilityClass
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            logger.debug("AnonymousSessionStore.save failed for linkId \(context.linkId): OSStatus \(status)")
        }
        return status == errSecSuccess
    }

    static func load(linkId: String) -> AnonymousSessionContext? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: linkId,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(AnonymousSessionContext.self, from: data)
    }

    static func delete(linkId: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: linkId
        ]
        SecItemDelete(query as CFDictionary)
    }
}
