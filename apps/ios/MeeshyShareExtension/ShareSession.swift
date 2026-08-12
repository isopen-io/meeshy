import Foundation
import Security

/// Session Meeshy vue depuis l'extension de partage.
///
/// L'extension tourne dans son propre process, sans `AuthManager` ni SDK : elle
/// reconstitue l'identité depuis les deux seules surfaces partagées avec l'app,
/// exactement comme `NSEDataSync.readAuthToken` le fait déjà en production —
/// l'App Group `UserDefaults` pour le `userId`, le trousseau partagé pour le JWT.
///
/// `nonisolated` sur le TYPE (et pas seulement sur les méthodes) : la cible
/// compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, tandis que le
/// bundle de tests qui compile ce même fichier utilise `nonisolated`. Sans
/// l'annotation au niveau du type, la conformance `Equatable` synthétisée et
/// les extensions divergeraient entre les deux contextes.
nonisolated struct ShareSession: Equatable, Sendable {
    let userId: String
    let token: String
    let apiBaseURL: String
}

/// `nonisolated` doit être répété sur l'EXTENSION : la marquer sur le type ne
/// suffit pas, une extension est un contexte de déclaration distinct qui hérite
/// sinon du `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` du projet.
nonisolated extension ShareSession {

    // MARK: - Contrat partagé avec l'app

    static let appGroupIdentifier = "group.me.meeshy.apps"
    static let activeUserIdKey = "meeshy_active_user_id"
    static let apiBaseURLKey = "meeshy_api_base_url"
    static let keychainService = "me.meeshy.app"

    /// Miroir exact de l'allowlist de `NSEDataSync` : les deux extensions
    /// lisent la MÊME clé App Group, écrite par l'app.
    static let allowedAPIBaseURLs: Set<String> = [
        "https://gate.meeshy.me",
        "https://gate.staging.meeshy.me",
        "http://localhost:3000"
    ]

    static let productionAPIBaseURL = "https://gate.meeshy.me"

    static func keychainAccount(for userId: String) -> String {
        "meeshy_token_\(userId)"
    }

    // MARK: - Résolution (pure, testable)

    /// Cœur de la résolution, sans aucune E/S : le trousseau est injecté.
    ///
    /// Renvoie `nil` dès qu'un des deux éléments d'identité manque. Cette
    /// absence est un état d'interface à part entière (« Connectez-vous »),
    /// jamais un prétexte à afficher des données de remplacement.
    static func resolve(
        activeUserId: String?,
        storedBaseURL: String?,
        readToken: (String) -> String?
    ) -> ShareSession? {
        guard let userId = activeUserId?.trimmingCharacters(in: .whitespacesAndNewlines),
              !userId.isEmpty else { return nil }

        guard let token = readToken(keychainAccount(for: userId))?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !token.isEmpty else { return nil }

        return ShareSession(
            userId: userId,
            token: token,
            apiBaseURL: resolveAPIBaseURL(storedBaseURL)
        )
    }

    /// Toute valeur hors allowlist retombe sur la production : suivre une URL
    /// arbitraire enverrait le contenu partagé, Bearer valide en en-tête, vers
    /// un hôte non contrôlé.
    static func resolveAPIBaseURL(_ stored: String?) -> String {
        guard let stored, allowedAPIBaseURLs.contains(stored) else {
            return productionAPIBaseURL
        }
        return stored
    }

    // MARK: - Résolution réelle

    /// Variante branchée sur les vraies surfaces système. Volontairement
    /// réduite au câblage : toute la politique est dans `resolve(…)`.
    static func resolveLive() -> ShareSession? {
        let defaults = UserDefaults(suiteName: appGroupIdentifier)
        return resolve(
            activeUserId: defaults?.string(forKey: activeUserIdKey),
            storedBaseURL: defaults?.string(forKey: apiBaseURLKey),
            readToken: readKeychainString
        )
    }

    private static func readKeychainString(account: String) -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        if let group = sharedKeychainAccessGroup {
            query[kSecAttrAccessGroup as String] = group
        }

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else { return nil }
        return value
    }

    /// Résout `<TEAMID>.me.meeshy.app` à l'exécution en demandant à iOS le
    /// groupe qu'il assigne à un item sonde, puis en rebasant sur
    /// `me.meeshy.app`.
    ///
    /// Sans `kSecAttrAccessGroup` explicite, le process d'extension retombe sur
    /// SON propre groupe de bundle et `SecItemCopyMatching` renvoie
    /// `errSecItemNotFound` en silence — l'extension paraîtrait alors
    /// « jamais connectée » alors que la session est valide.
    ///
    /// Recopié depuis `NSEDataSync` plutôt que factorisé : `NSEDecryptor` a
    /// déjà tranché explicitement en ce sens (le helper de `NSEDataSync` est
    /// privé et sa cible n'est pas compilée dans le bundle de tests).
    private static let sharedKeychainAccessGroup: String? = {
        let discoveryQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "_meeshy_share_seed_discovery",
            kSecAttrService as String: "_meeshy_share_seed_discovery",
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
}
