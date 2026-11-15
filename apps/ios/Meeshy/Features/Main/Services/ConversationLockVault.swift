import Foundation
import Security

// MARK: - Le coffre

/// Où vivent les codes, leurs compteurs d'échecs et l'état d'enrôlement
/// biométrique. En production, le trousseau, propre à l'appareil.
@MainActor
protocol ConversationLockVault {
    func read(_ key: String) -> String?
    @discardableResult
    func write(_ value: String, for key: String) -> Bool
    func delete(_ key: String)
    /// Les comptes que le coffre tient ; `nil` quand il ne se laisse pas
    /// énumérer (trousseau avant le premier déverrouillage) : « aucun compte »
    /// et « illisible » ne se confondent pas.
    func accounts() -> [String]?
    /// Efface TOUT ce que le coffre tient : codes, compteurs, PIN maître,
    /// biométrie. `false` quand il ne s'efface pas (trousseau avant le premier
    /// déverrouillage, erreur du système) : la déconnexion rejoue alors
    /// l'effacement — et aussi après un `true` rendu sans données protégées,
    /// qui peut n'être qu'un « aucun élément » de trousseau scellé.
    @discardableResult
    func deleteAll() -> Bool
}

struct KeychainConversationLockVault: ConversationLockVault {
    let service: String

    init(service: String = "me.meeshy.app.conversation-locks") {
        self.service = service
    }

    private var serviceQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ]
    }

    private func itemQuery(_ key: String) -> [String: Any] {
        serviceQuery.merging([kSecAttrAccount as String: key]) { _, account in account }
    }

    func read(_ key: String) -> String? {
        let query = itemQuery(key).merging([
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]) { _, option in option }
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Mis à jour EN PLACE, ajouté seulement s'il n'existe pas : effacé
    /// d'abord, un ajout refusé laissait la conversation sans aucun code.
    ///
    /// La mise à jour pose aussi la classe d'accès : un élément des versions
    /// antérieures (`WhenUnlockedThisDeviceOnly`) passe en
    /// `AfterFirstUnlockThisDeviceOnly` à sa première réécriture. Un trousseau
    /// qui refuse l'attribut reçoit la seule valeur : l'élément n'est jamais
    /// effacé, rien ne garantissant que l'ajout suivrait.
    @discardableResult
    func write(_ value: String, for key: String) -> Bool {
        let data = Data(value.utf8)
        let migrated = update(key, with: [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ])
        switch migrated {
        case errSecSuccess:
            return true
        case errSecItemNotFound:
            return add(data, for: key)
        case errSecParam, errSecNoSuchAttr:
            return update(key, with: [kSecValueData as String: data]) == errSecSuccess
        default:
            return false
        }
    }

    private func update(_ key: String, with attributes: [String: Any]) -> OSStatus {
        SecItemUpdate(itemQuery(key) as CFDictionary, attributes as CFDictionary)
    }

    private func add(_ data: Data, for key: String) -> Bool {
        let item = itemQuery(key).merging([
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]) { _, attribute in attribute }
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    func delete(_ key: String) {
        SecItemDelete(itemQuery(key) as CFDictionary)
    }

    @discardableResult
    func deleteAll() -> Bool {
        let status = SecItemDelete(serviceQuery as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    func accounts() -> [String]? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status != errSecItemNotFound else { return [] }
        guard status == errSecSuccess, let items = result as? [[String: Any]] else { return nil }
        return items.compactMap { $0[kSecAttrAccount as String] as? String }
    }
}

/// Un coffre bâti sur trois fonctions : les tests de lecture paresseuse
/// (#11558) y comptent les lectures sans toucher le trousseau.
struct SecretsConversationLockVault: ConversationLockVault {
    let secrets: ConversationLockSecrets

    func read(_ key: String) -> String? { secrets.read(key) }

    @discardableResult
    func write(_ value: String, for key: String) -> Bool { secrets.save(key, value) }

    func delete(_ key: String) { secrets.delete(key) }

    /// Trois fonctions ne s'énumèrent pas : le coffre ne dit rien.
    func accounts() -> [String]? { nil }

    /// Ni ne s'effacent en bloc.
    @discardableResult
    func deleteAll() -> Bool { false }
}
