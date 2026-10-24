import CryptoKit
import Foundation
import Security

// MARK: - Le secret qui scelle la provenance d'un clair déchiffré (#11402)

/// Ce que le trousseau rend pour la clé de provenance.
enum ContentOriginKeyRead: Equatable, Sendable {
    case value(Data)
    case absent
    /// Verrouillé depuis le démarrage, entitlement absent, valeur abîmée :
    /// la clé gardée existe peut-être — rien ne l'écrase.
    case unavailable
}

/// Ce qu'une première écriture de la clé a donné.
enum ContentOriginKeyAdd: Equatable, Sendable {
    case stored
    /// Un autre processus (l'extension de notification) l'a écrite d'abord.
    case duplicate
    case failed
}

/// Où la clé de provenance est gardée.
protocol ContentOriginKeyVault: Sendable {
    func read() -> ContentOriginKeyRead
    func add(_ key: Data) -> ContentOriginKeyAdd
}

/// **La clé HMAC de `MessageContentOrigin` est un secret de CET appareil.**
///
/// #11382 la dérivait de l'id du message — une donnée publique : la
/// passerelle, ou quiconque réécrit le cache local, recalculait l'empreinte
/// d'un texte forgé. Elle est tirée au hasard (256 bits) UNE fois par
/// appareil et gardée dans le trousseau partagé de l'app et de ses extensions,
/// `AfterFirstUnlockThisDeviceOnly` : jamais sauvegardée, jamais synchronisée,
/// jamais transmise. Une sauvegarde restaurée ailleurs n'emporte donc aucune
/// provenance vérifiable.
///
/// Un trousseau indisponible n'est jamais écrasé : le processus scelle avec
/// une clé éphémère, et ce qu'elle scelle ne se vérifie plus après lui
/// (fail-closed — le message redevient scellé, son texte reste affiché).
enum ContentOriginDeviceKey {
    static let byteCount = 32

    /// La clé de ce processus, résolue une fois.
    static let current: Data = resolve(using: KeychainContentOriginVault(), generate: ContentOriginDeviceKey.generate)

    static func resolve(using vault: some ContentOriginKeyVault, generate: () -> Data) -> Data {
        switch vault.read() {
        case .value(let stored): return stored
        case .unavailable: return generate()
        case .absent: return store(generate(), in: vault)
        }
    }

    static func generate() -> Data {
        SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
    }

    private static func store(_ fresh: Data, in vault: some ContentOriginKeyVault) -> Data {
        guard vault.add(fresh) == .duplicate, case .value(let stored) = vault.read() else { return fresh }
        return stored
    }
}

/// Le trousseau, hors du service des jetons (`KeychainManager`) : ni sa
/// purge ni sa migration d'accessibilité ne touchent la clé.
struct KeychainContentOriginVault: ContentOriginKeyVault {
    private static let service = "me.meeshy.app.content-origin"
    private static let account = "device-key.v2"

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func read() -> ContentOriginKeyRead {
        var query = Self.baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return .absent }
        guard status == errSecSuccess,
              let data = result as? Data,
              data.count == ContentOriginDeviceKey.byteCount
        else { return .unavailable }
        return .value(data)
    }

    func add(_ key: Data) -> ContentOriginKeyAdd {
        var query = Self.baseQuery()
        query[kSecValueData as String] = key
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecSuccess { return .stored }
        return status == errSecDuplicateItem ? .duplicate : .failed
    }
}
