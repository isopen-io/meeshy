import Foundation
import Security
import os

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

public final class KeychainManager: KeychainStoring, @unchecked Sendable {
    public static let shared = KeychainManager()

    private let service = "me.meeshy.app"
    private let logger = MeeshyLog.logger(.keychain, subsystem: .legacySDK)
    /// Les lectures du premier écran, faites d'avance hors du fil principal (#11587).
    let prefetch = KeychainPrefetch()
    private static let prefetchQueue = DispatchQueue(label: "me.meeshy.keychain.prefetch", qos: .userInitiated)

    private init() {}

    // MARK: - Lecture d'avance du premier écran

    /// Lance, sur une file à part, les lectures dont le premier écran a besoin
    /// (`ColdStartKeychainPlan`) : `load` ramassera leurs réponses au lieu
    /// d'aller-retours XPC synchrones sur le fil principal (#11587). Sans effet
    /// au second appel.
    public func prefetchColdStartSession() {
        let service = service
        prefetch.start(ColdStartKeychainPlan.plan, on: Self.prefetchQueue, lifetime: .seconds(30)) { key in
            Self.read(key, service: service)
        }
    }

    private static func read(_ resolvedKey: String, service: String) -> KeychainRead {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: resolvedKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return .absent }
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return .unavailable
        }
        return .value(value)
    }

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
        prefetch.invalidate(resolvedKey)
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
    ///
    /// Une réponse lue d'avance (`prefetchColdStartSession`) est ramassée une
    /// fois ; un trousseau indisponible n'en laisse aucune, et la lecture
    /// directe tranche.
    public func load(forKey key: String, account: String? = nil) -> String? {
        let resolvedKey = namespacedKey(key, account: account)
        switch prefetch.take(resolvedKey) {
        case .value(let value)?: return value
        case .absent?: return nil
        case .unavailable?, nil: break
        }
        guard case .value(let value) = Self.read(resolvedKey, service: service) else { return nil }
        return value
    }

    // MARK: - Delete

    /// Deletes the value for `key`, optionally scoped to `account` (a userId).
    public func delete(forKey key: String, account: String? = nil) {
        let resolvedKey = namespacedKey(key, account: account)
        prefetch.invalidate(resolvedKey)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: resolvedKey,
        ]

        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Delete All

    public func deleteAll() {
        prefetch.invalidateAll()
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
    ///
    /// The enumeration asks for ATTRIBUTES only: it runs on every cold start,
    /// on the launch path, and almost every item is already migrated. Asking
    /// for `kSecReturnData` made securityd decrypt and ship every secret each
    /// launch just to skip it; the data is now fetched only for an item that
    /// actually needs rewriting. Kept synchronous on purpose — the rewrite is a
    /// delete + add, and a token read landing between the two would find the
    /// item missing.
    ///
    /// Rend `true` quand plus AUCUN élément n'est à migrer — un trousseau vide
    /// compris. `false` quand un élément n'a pas pu être relu ni réécrit
    /// (appareil verrouillé) : la passe est à refaire.
    @discardableResult
    public func migrateToAfterFirstUnlock() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecMatchLimit as String: kSecMatchLimitAll,
            kSecReturnAttributes as String: true,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return true }
        guard status == errSecSuccess, let items = result as? [[String: Any]] else { return false }

        let targetAccessibility = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String
        var complete = true

        for item in items {
            guard let account = item[kSecAttrAccount as String] as? String else { continue }

            if let accessible = item[kSecAttrAccessible as String] as? String,
               accessible == targetAccessibility { continue }

            let itemQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            var dataQuery = itemQuery
            dataQuery[kSecReturnData as String] = true
            dataQuery[kSecMatchLimit as String] = kSecMatchLimitOne
            var dataResult: AnyObject?
            guard SecItemCopyMatching(dataQuery as CFDictionary, &dataResult) == errSecSuccess,
                  let data = dataResult as? Data else {
                complete = false
                continue
            }

            // La réécriture est une écriture : une lecture d'avance tombée entre
            // la suppression et l'ajout aurait lu « absent » (#11587).
            prefetch.invalidate(account)
            SecItemDelete(itemQuery as CFDictionary)

            var addQuery = itemQuery
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            if SecItemAdd(addQuery as CFDictionary, nil) != errSecSuccess { complete = false }
        }
        return complete
    }

    /// La migration d'accessibilité, UNE fois par installation (#11558).
    ///
    /// Elle énumérait tout le trousseau à CHAQUE démarrage à froid, sur le fil
    /// principal, avant le premier écran. Une passe complète suffit : chaque
    /// écriture du dépôt (`save`, `SecItemAdd`) pose déjà `AfterFirstUnlock`,
    /// aucun élément ne peut redevenir `WhenUnlocked`. Une passe incomplète se
    /// rejoue au lancement suivant.
    public func migrateToAfterFirstUnlockOnce(defaults: UserDefaults = .standard) {
        KeychainAccessibilityMigrationGate(defaults: defaults).runOnce { migrateToAfterFirstUnlock() }
    }

    // MARK: - Migration: UserDefaults → Keychain

    public func migrateFromUserDefaults(keys: [String]) {
        let defaults = UserDefaults.standard

        // Les préférences d'abord : elles sont en mémoire, alors que chaque
        // `load` est un aller-retour XPC — rejoué à chaque démarrage pour des
        // clés que plus personne n'a (#11558).
        for key in keys {
            let legacy = defaults.string(forKey: key)
                ?? defaults.data(forKey: key).flatMap { String(data: $0, encoding: .utf8) }
            guard let legacy, load(forKey: key) == nil else { continue }
            migrate(legacy, forKey: key, from: defaults)
        }
    }

    /// Moves one value into the Keychain, clearing the UserDefaults source **only**
    /// once the write succeeded. A failed write used to still wipe the origin,
    /// destroying the value with no trace.
    private func migrate(_ value: String, forKey key: String, from defaults: UserDefaults) {
        do {
            try save(value, forKey: key)
            defaults.removeObject(forKey: key)
        } catch {
            logger.error(
                "UserDefaults→Keychain migration failed for '\(key, privacy: .public)' — value kept in UserDefaults for the next attempt: \(error.localizedDescription, privacy: .public)"
            )
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
                do {
                    try save(legacy, forKey: key, account: userId)
                } catch {
                    // Le `delete` ci-dessous reste inconditionnel par choix de
                    // sécurité (anti-fuite cross-user) : la valeur est donc
                    // perdue, ce qui doit laisser une trace exploitable.
                    logger.error(
                        "Namespacing migration failed for '\(key, privacy: .public)' — legacy value dropped to prevent cross-user leakage: \(error.localizedDescription, privacy: .public)"
                    )
                }
            }
            // Always remove the un-namespaced original
            delete(forKey: key, account: nil)
        }
    }
}
