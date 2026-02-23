import Foundation
import CryptoKit
import Security

@MainActor
class ConversationLockManager: ObservableObject {
    static let shared = ConversationLockManager()

    @Published private(set) var lockedConversationIds: Set<String> = []

    private let keychainService = "com.meeshy.app.conversation-locks"

    private init() {
        loadLockedIds()
    }

    // MARK: - Public API

    func isLocked(_ conversationId: String) -> Bool {
        lockedConversationIds.contains(conversationId)
    }

    func setLock(conversationId: String, password: String) {
        let hash = sha256(password)
        saveToKeychain(key: conversationId, value: hash)
        lockedConversationIds.insert(conversationId)
        saveLockedIds()
    }

    func removeLock(conversationId: String) {
        deleteFromKeychain(key: conversationId)
        lockedConversationIds.remove(conversationId)
        saveLockedIds()
    }

    func verifyPassword(conversationId: String, password: String) -> Bool {
        guard let storedHash = readFromKeychain(key: conversationId) else { return false }
        return sha256(password) == storedHash
    }

    // MARK: - Hashing

    private func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Keychain Operations

    private func saveToKeychain(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    private func readFromKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deleteFromKeychain(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Persist locked IDs list (UserDefaults for the ID set, passwords in Keychain)

    private func saveLockedIds() {
        UserDefaults.standard.set(Array(lockedConversationIds), forKey: "meeshy.lockedConversationIds")
    }

    private func loadLockedIds() {
        let ids = UserDefaults.standard.stringArray(forKey: "meeshy.lockedConversationIds") ?? []
        lockedConversationIds = Set(ids)
    }
}
