import CryptoKit
import Foundation
import os
import Security

/// Les secrets de l'appareil E2EE gardés dans le TROUSSEAU (spec § 4.4) : la clé
/// de scellement des lignes de `e2ee.sqlite` et l'identité libsignal (paire de
/// clés + `registrationId`). Classe `AfterFirstUnlockThisDeviceOnly` : rien ne
/// part en sauvegarde iCloud ni en migration d'appareil (§ 4.5), et l'extension
/// de notification les lit par le groupe d'accès partagé.
public protocol E2EESecretStoreProviding: Sendable {
    func load(_ name: String) throws -> Data?
    func save(_ data: Data, as name: String) throws
    func erase(_ name: String) throws
}

public enum E2EEKeychainError: Error, Equatable {
    case status(OSStatus)
}

public final class E2EEKeychainSecretStore: E2EESecretStoreProviding {
    public static let service = "me.meeshy.e2ee"

    private let accessGroup: String?

    /// `accessGroup` nil : le groupe par défaut de l'application (le premier de
    /// `keychain-access-groups`, `$(AppIdentifierPrefix)me.meeshy.app`, partagé
    /// par l'app et la NSE).
    public init(accessGroup: String? = nil) {
        self.accessGroup = accessGroup
    }

    private func query(_ name: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: name,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        return query
    }

    public func load(_ name: String) throws -> Data? {
        var lookup = query(name)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw E2EEKeychainError.status(status) }
        return data
    }

    public func save(_ data: Data, as name: String) throws {
        let update = SecItemUpdate(query(name) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { return }
        guard update == errSecItemNotFound else { throw E2EEKeychainError.status(update) }
        var add = query(name)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw E2EEKeychainError.status(status) }
    }

    public func erase(_ name: String) throws {
        let status = SecItemDelete(query(name) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw E2EEKeychainError.status(status) }
    }
}

/// Un magasin de secrets en mémoire, pour les tests et les aperçus.
public final class E2EEInMemorySecretStore: E2EESecretStoreProviding {
    private let secrets = OSAllocatedUnfairLock<[String: Data]>(initialState: [:])

    public init() {}

    public func load(_ name: String) throws -> Data? {
        secrets.withLock { $0[name] }
    }

    public func save(_ data: Data, as name: String) throws {
        secrets.withLock { $0[name] = data }
    }

    public func erase(_ name: String) throws {
        secrets.withLock { _ = $0.removeValue(forKey: name) }
    }
}

/// La clé AES-256 qui scelle chaque ligne des stores libsignal. Créée au premier
/// usage, jamais exportée hors du trousseau.
public struct E2EESealingKey: Sendable {
    static let secretName = "e2ee.sealing-key.v1"

    public static func loadOrCreate(in secrets: any E2EESecretStoreProviding) throws -> SymmetricKey {
        if let existing = try secrets.load(secretName), existing.count == 32 {
            return SymmetricKey(data: existing)
        }
        let key = SymmetricKey(size: .bits256)
        try secrets.save(key.withUnsafeBytes { Data($0) }, as: secretName)
        return key
    }
}
