import CryptoKit
import Foundation
import os
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
/// L'éphémère n'est pas définitive (#12721) : le trousseau se relit aux accès
/// suivants, et la clé gardée la remplace dès le premier déverrouillage.
enum ContentOriginDeviceKey {
    static let byteCount = 32

    private static let process = ContentOriginKeyHolder(vault: KeychainContentOriginVault(), generate: { generate() })

    /// La clé de ce processus : la gardée dès qu'elle se lit, l'éphémère d'ici là.
    static var current: Data { process.current() }

    static func resolve(using vault: some ContentOriginKeyVault, generate: () -> Data) -> ContentOriginKeyResolution {
        switch vault.read() {
        case .value(let stored): return .durable(stored)
        case .unavailable: return .ephemeral(generate())
        case .absent: return store(generate(), in: vault)
        }
    }

    static func generate() -> Data {
        SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
    }

    private static func store(_ fresh: Data, in vault: some ContentOriginKeyVault) -> ContentOriginKeyResolution {
        switch vault.add(fresh) {
        case .stored: return .durable(fresh)
        case .failed: return .ephemeral(fresh)
        case .duplicate:
            guard case .value(let stored) = vault.read() else { return .ephemeral(fresh) }
            return .durable(stored)
        }
    }
}

/// Ce que la résolution a donné : une clé GARDÉE, qui tient pour le processus,
/// ou une clé du seul processus, qui attend que le trousseau se rouvre.
enum ContentOriginKeyResolution: Equatable, Sendable {
    case durable(Data)
    case ephemeral(Data)

    var key: Data {
        switch self {
        case .durable(let key), .ephemeral(let key): return key
        }
    }
}

/// La clé d'un processus. Une clé gardée ne se relit plus. Une éphémère reste
/// la MÊME tant que le trousseau est fermé (ce qu'elle a scellé se vérifie
/// encore), et le trousseau se retente au plus une fois par `retryInterval`,
/// pour qu'une liste rendue avant le déverrouillage ne le sollicite pas à
/// chaque bulle. S'il se rouvre VIDE, c'est l'éphémère qui s'y garde : ce
/// qu'elle a scellé pendant le verrouillage reste vérifiable.
final class ContentOriginKeyHolder: Sendable {
    private struct Held: Sendable {
        let resolution: ContentOriginKeyResolution
        let readAt: Date

        func isSettled(at instant: Date, retryInterval: TimeInterval) -> Bool {
            guard case .ephemeral = resolution else { return true }
            return instant.timeIntervalSince(readAt) < retryInterval
        }
    }

    private let vault: any ContentOriginKeyVault
    private let generate: @Sendable () -> Data
    private let now: @Sendable () -> Date
    private let retryInterval: TimeInterval
    private let held = OSAllocatedUnfairLock<Held?>(initialState: nil)

    init(
        vault: any ContentOriginKeyVault,
        generate: @escaping @Sendable () -> Data,
        now: @escaping @Sendable () -> Date = { Date() },
        retryInterval: TimeInterval = 1
    ) {
        self.vault = vault
        self.generate = generate
        self.now = now
        self.retryInterval = retryInterval
    }

    func current() -> Data {
        held.withLock { slot in
            let instant = now()
            if let settled = slot, settled.isSettled(at: instant, retryInterval: retryInterval) {
                return settled.resolution.key
            }
            let candidate = slot?.resolution.key ?? generate()
            let resolution = ContentOriginDeviceKey.resolve(using: vault) { candidate }
            slot = Held(resolution: resolution, readAt: instant)
            return resolution.key
        }
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
