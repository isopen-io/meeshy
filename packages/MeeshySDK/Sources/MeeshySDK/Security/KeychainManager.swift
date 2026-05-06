import Foundation
import Security

public enum KeychainError: LocalizedError {
    case saveFailed(OSStatus)
    case loadFailed(OSStatus)
    case deleteFailed(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .saveFailed(let status):
            return "Keychain save failed: \(status)"
        case .loadFailed(let status):
            return "Keychain load failed: \(status)"
        case .deleteFailed(let status):
            return "Keychain delete failed: \(status)"
        }
    }
}

public final class KeychainManager: @unchecked Sendable {
    public static let shared = KeychainManager()

    private let service = "me.meeshy.app"

    private init() {}

    // MARK: - Namespace Helper

    /// Returns `"\(account).\(key)"` when `account` is non-nil and non-empty; returns
    /// the bare `key` otherwise. This ensures un-namespaced and namespaced entries are
    /// stored under distinct Keychain accounts so they cannot bleed across users.
    private func namespacedKey(_ key: String, account: String?) -> String {
        guard let account, !account.isEmpty else { return key }
        return "\(account).\(key)"
    }

    // MARK: - Save

    /// Saves `value` under `key`, optionally scoped to `account` (a userId).
    /// - Parameter account: When non-nil, the value is stored in an isolated per-user
    ///   namespace so that different users on the same device cannot access each other's data.
    ///   Pass `nil` (the default) to preserve backward-compatible un-namespaced behaviour.
    public func save(_ value: String, forKey key: String, account: String? = nil) throws {
        guard let data = value.data(using: .utf8) else { return }

        let resolvedKey = namespacedKey(key, account: account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: resolvedKey,
        ]

        let existingStatus = SecItemCopyMatching(query as CFDictionary, nil)

        if existingStatus == errSecSuccess {
            let attributes: [String: Any] = [
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            ]
            let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            guard status == errSecSuccess else { throw KeychainError.saveFailed(status) }
        } else {
            var addQuery = query
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let status = SecItemAdd(addQuery as CFDictionary, nil)
            guard status == errSecSuccess else { throw KeychainError.saveFailed(status) }
        }
    }

    // MARK: - Load

    /// Loads a value for `key`, optionally scoped to `account` (a userId).
    /// - Parameter account: When non-nil, only values stored under the user's namespace are
    ///   returned. A call with `account: nil` will NOT return namespaced values.
    public func load(forKey key: String, account: String? = nil) -> String? {
        let resolvedKey = namespacedKey(key, account: account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: resolvedKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }

        return value
    }

    // MARK: - Delete

    /// Deletes the value for `key`, optionally scoped to `account` (a userId).
    public func delete(forKey key: String, account: String? = nil) {
        let resolvedKey = namespacedKey(key, account: account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: resolvedKey,
        ]

        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Delete All

    public func deleteAll() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]

        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Async

    /// Loads a keychain value off the caller's actor queue to avoid blocking crypto actors.
    public func loadAsync(forKey key: String, account: String? = nil) async -> String? {
        await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                cont.resume(returning: self.load(forKey: key, account: account))
            }
        }
    }

    /// Saves a keychain value off the caller's actor queue to avoid blocking crypto actors.
    public func saveAsync(_ value: String, forKey key: String, account: String? = nil) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    try self.save(value, forKey: key, account: account)
                    cont.resume(returning: ())
                } catch {
                    cont.resume(throwing: error)
                }
            }
        }
    }

    // MARK: - Migration: Accessibility

    /// Migrate existing Keychain items from WhenUnlocked to AfterFirstUnlock accessibility.
    /// Items stored with WhenUnlocked are not readable by the NSE when the device is locked.
    /// This must be called once at app startup.
    public func migrateToAfterFirstUnlock() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecMatchLimit as String: kSecMatchLimitAll,
            kSecReturnAttributes as String: true,
            kSecReturnData as String: true,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let items = result as? [[String: Any]] else { return }

        let targetAccessibility = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String

        for item in items {
            guard let account = item[kSecAttrAccount as String] as? String,
                  let data = item[kSecValueData as String] as? Data else { continue }

            if let accessible = item[kSecAttrAccessible as String] as? String,
               accessible == targetAccessibility { continue }

            let deleteQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            SecItemDelete(deleteQuery as CFDictionary)

            var addQuery = deleteQuery
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    // MARK: - Migration: UserDefaults → Keychain

    public func migrateFromUserDefaults(keys: [String]) {
        let defaults = UserDefaults.standard

        for key in keys {
            guard load(forKey: key) == nil else { continue }

            if let stringValue = defaults.string(forKey: key) {
                try? save(stringValue, forKey: key)
                defaults.removeObject(forKey: key)
            } else if let dataValue = defaults.data(forKey: key),
                      let stringValue = String(data: dataValue, encoding: .utf8) {
                try? save(stringValue, forKey: key)
                defaults.removeObject(forKey: key)
            }
        }
    }

    // MARK: - Migration: Un-namespaced → Per-user Namespaced

    /// Copies values from un-namespaced keys to user-namespaced keys, then deletes
    /// the un-namespaced originals. Idempotent — safe to call on every boot.
    ///
    /// - Parameters:
    ///   - userId: The user ID to namespace keys under.
    ///   - keys: The legacy (un-namespaced) keys to migrate.
    ///
    /// Only migrates a key when:
    /// 1. An un-namespaced value exists for it, AND
    /// 2. No namespaced value already exists (to avoid clobbering newer writes).
    ///
    /// After migration the un-namespaced entry is deleted regardless of whether a
    /// namespaced slot already existed, preventing cross-user data leakage.
    public func migrateToNamespaced(userId: String, keys: [String]) {
        for key in keys {
            // Copy to namespaced slot if it doesn't already have a value
            if let legacy = load(forKey: key, account: nil),
               load(forKey: key, account: userId) == nil {
                try? save(legacy, forKey: key, account: userId)
            }
            // Always remove the un-namespaced original
            delete(forKey: key, account: nil)
        }
    }
}
