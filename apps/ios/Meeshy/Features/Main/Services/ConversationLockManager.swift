import Foundation
import Combine
import CryptoKit
import Security
import MeeshySDK

/// Où vivent les empreintes des PIN : le trousseau en production, un double en test.
struct ConversationLockSecrets {
    let read: (String) -> String?
    let save: (String, String) -> Bool
    let delete: (String) -> Void
}

@MainActor
class ConversationLockManager: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = ConversationLockManager()

    @Published private(set) var lockedConversationIds: Set<String> = []
    private let secrets: ConversationLockSecrets
    private let masterPinKey = "meeshy_master_pin"
    private let lockedIdsDefaultsKey = "meeshy.lockedConversationIds"

    private var cancellables = Set<AnyCancellable>()

    private convenience init() {
        self.init(secrets: .keychain(service: "me.meeshy.app.conversation-locks"))
    }

    init(secrets: ConversationLockSecrets) {
        self.secrets = secrets
        loadLockedIds()
        wireAuthLogoutHook()
    }

    /// Le PIN maître est-il posé ? Lu au trousseau au PREMIER besoin (#11558) :
    /// le gestionnaire est construit pendant le rendu des premières lignes de
    /// la liste, et la valeur ne sert qu'au geste de verrouillage et aux Réglages.
    var masterPinConfigured: Bool {
        if let knownMasterPin { return knownMasterPin }
        let configured = secrets.read(masterPinKey) != nil
        knownMasterPin = configured
        return configured
    }
    /// `nil` : le trousseau n'a pas encore été lu.
    private var knownMasterPin: Bool?

    private func noteMasterPin(_ configured: Bool) {
        objectWillChange.send()
        knownMasterPin = configured
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
        secrets.read(masterPinKey) != nil
    }

    func setMasterPin(_ pin: String) {
        _ = secrets.save(masterPinKey, sha256(pin))
        noteMasterPin(true)
    }

    func verifyMasterPin(_ pin: String) -> Bool {
        guard let stored = secrets.read(masterPinKey) else { return false }
        return sha256(pin) == stored
    }

    /// Supprime le master PIN. Ne pas appeler si des conversations sont verrouillées.
    func removeMasterPin() {
        guard lockedConversationIds.isEmpty else { return }
        secrets.delete(masterPinKey)
        noteMasterPin(false)
    }

    /// Force la suppression du master PIN (pour tests / unlock all).
    func forceRemoveMasterPin() {
        secrets.delete(masterPinKey)
        noteMasterPin(false)
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
        _ = secrets.save(lockKey(conversationId), sha256(pin))
        lockedConversationIds.insert(conversationId)
        saveLockedIds()
    }

    func verifyLock(conversationId: String, pin: String) -> Bool {
        guard let stored = secrets.read(lockKey(conversationId)) else { return false }
        return sha256(pin) == stored
    }

    func removeLock(conversationId: String) {
        secrets.delete(lockKey(conversationId))
        lockedConversationIds.remove(conversationId)
        saveLockedIds()
    }

    func removeAllLocks() {
        for id in lockedConversationIds {
            secrets.delete(lockKey(id))
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

    // MARK: - Persistence

    private func saveLockedIds() {
        UserDefaults.standard.set(Array(lockedConversationIds), forKey: lockedIdsDefaultsKey)
    }

    private func loadLockedIds() {
        let ids = UserDefaults.standard.stringArray(forKey: lockedIdsDefaultsKey) ?? []
        lockedConversationIds = Set(ids)
    }
}

extension ConversationLockSecrets {
    static func keychain(service: String) -> ConversationLockSecrets {
        ConversationLockSecrets(
            read: { key in
                let query: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: service,
                    kSecAttrAccount as String: key,
                    kSecReturnData as String: true,
                    kSecMatchLimit as String: kSecMatchLimitOne
                ]
                var result: AnyObject?
                let status = SecItemCopyMatching(query as CFDictionary, &result)
                guard status == errSecSuccess, let data = result as? Data else { return nil }
                return String(data: data, encoding: .utf8)
            },
            save: { key, value in
                let query: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: service,
                    kSecAttrAccount as String: key,
                    kSecValueData as String: Data(value.utf8),
                    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                ]
                SecItemDelete(query as CFDictionary)
                return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
            },
            delete: { key in
                let query: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: service,
                    kSecAttrAccount as String: key
                ]
                SecItemDelete(query as CFDictionary)
            }
        )
    }
}
