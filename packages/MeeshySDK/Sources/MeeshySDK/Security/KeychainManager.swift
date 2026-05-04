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

    // MARK: - Save

    public func save(_ value: String, forKey key: String) throws {
        guard let data = value.data(using: .utf8) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
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

    public func load(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
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

    public func delete(forKey key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
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

    // MARK: - Migration

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
}
