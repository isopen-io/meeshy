import Foundation
import Combine
import CryptoKit
import Security
import MeeshySDK

@MainActor
class ConversationLockManager: ObservableObject {
    static let shared = ConversationLockManager()

    @Published private(set) var lockedConversationIds: Set<String> = []
    @Published private(set) var masterPinConfigured: Bool = false

    private let keychainService = "me.meeshy.app.conversation-locks"
    private let masterPinKey = "meeshy_master_pin"
    private let lockedIdsDefaultsKey = "meeshy.lockedConversationIds"

    private var cancellables = Set<AnyCancellable>()

    private init() {
        loadLockedIds()
        masterPinConfigured = readFromKeychain(key: masterPinKey) != nil
        wireAuthLogoutHook()
    }

    /// P7-11 — pattern calqué sur `FeedbackToastManager.wireAuthLogoutHook` :
    /// à la déconnexion (`isAuthenticated` → false, valeur initiale ignorée),
    /// wipe des verrous + master PIN pour qu'aucun état de A ne s'applique à B.
    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.resetForLogout() }
            .store(in: &cancellables)
    }

    // MARK: - Master PIN (6 digits)

    func hasMasterPin() -> Bool {
        readFromKeychain(key: masterPinKey) != nil
    }

    func setMasterPin(_ pin: String) {
        saveToKeychain(key: masterPinKey, value: sha256(pin))
        masterPinConfigured = true
    }

    func verifyMasterPin(_ pin: String) -> Bool {
        guard let stored = readFromKeychain(key: masterPinKey) else { return false }
        return sha256(pin) == stored
    }

    /// Supprime le master PIN. Ne pas appeler si des conversations sont verrouillées.
    func removeMasterPin() {
        guard lockedConversationIds.isEmpty else { return }
        deleteFromKeychain(key: masterPinKey)
        masterPinConfigured = false
    }

    /// Force la suppression du master PIN (pour tests / unlock all).
    func forceRemoveMasterPin() {
        deleteFromKeychain(key: masterPinKey)
        masterPinConfigured = false
    }

    /// P7-11 — logout = purge cross-compte totale (invariant 9). Le keychain
    /// (`me.meeshy.app.conversation-locks`) survit au logout ET à la
    /// réinstallation, et n'est pas namespacé par compte : sans wipe, le
    /// master PIN et les verrous du compte A s'appliquent au compte B.
    /// Après logout les conversations elles-mêmes sont purgées (7 tables +
    /// prefs + URLCache) — leurs PINs n'ont plus d'objet.
    func resetForLogout() {
        removeAllLocks()
        forceRemoveMasterPin()
    }

    // MARK: - Per-conversation PIN (4 digits)

    func isLocked(_ conversationId: String) -> Bool {
        lockedConversationIds.contains(conversationId)
    }

    func setLock(conversationId: String, pin: String) {
        saveToKeychain(key: lockKey(conversationId), value: sha256(pin))
        lockedConversationIds.insert(conversationId)
        saveLockedIds()
    }

    func verifyLock(conversationId: String, pin: String) -> Bool {
        guard let stored = readFromKeychain(key: lockKey(conversationId)) else { return false }
        return sha256(pin) == stored
    }

    func removeLock(conversationId: String) {
        deleteFromKeychain(key: lockKey(conversationId))
        lockedConversationIds.remove(conversationId)
        saveLockedIds()
    }

    func removeAllLocks() {
        for id in lockedConversationIds {
            deleteFromKeychain(key: lockKey(id))
        }
        lockedConversationIds.removeAll()
        saveLockedIds()
    }

    // MARK: - Private helpers

    private func lockKey(_ conversationId: String) -> String {
        "meeshy_lock_\(conversationId)"
    }

    private func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Keychain

    @discardableResult
    private func saveToKeychain(key: String, value: String) -> Bool {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
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

    // MARK: - Persistence

    private func saveLockedIds() {
        UserDefaults.standard.set(Array(lockedConversationIds), forKey: lockedIdsDefaultsKey)
    }

    private func loadLockedIds() {
        let ids = UserDefaults.standard.stringArray(forKey: lockedIdsDefaultsKey) ?? []
        lockedConversationIds = Set(ids)
    }
}
