import Foundation
import LibSignalClient

/// L'identité libsignal de CETTE installation (spec § 3.1) : une paire de clés
/// Curve25519 et une `registrationId` de 14 bits, tirées une fois, gardées dans
/// le trousseau. La clé privée ne quitte jamais l'appareil.
public struct E2EELocalIdentity: Sendable {
    public let keyPair: IdentityKeyPair
    public let registrationId: UInt32

    public init(keyPair: IdentityKeyPair, registrationId: UInt32) {
        self.keyPair = keyPair
        self.registrationId = registrationId
    }

    public static func generate() -> E2EELocalIdentity {
        E2EELocalIdentity(keyPair: .generate(), registrationId: UInt32.random(in: 1...0x3FFF))
    }
}

public protocol E2EEIdentityVaultProviding: Sendable {
    func current() throws -> E2EELocalIdentity?
    func store(_ identity: E2EELocalIdentity) throws
    func erase() throws
}

public enum E2EEIdentityVaultError: Error, Equatable {
    case corrupted
}

/// L'identité dans le trousseau : la paire sérialisée par libsignal et la
/// `registrationId`, sous un seul secret pour qu'elles ne divergent jamais.
public final class E2EEIdentityVault: E2EEIdentityVaultProviding {
    static let secretName = "e2ee.identity.v1"

    private let secrets: any E2EESecretStoreProviding

    public init(secrets: any E2EESecretStoreProviding) {
        self.secrets = secrets
    }

    public func current() throws -> E2EELocalIdentity? {
        guard let raw = try secrets.load(Self.secretName) else { return nil }
        guard raw.count > 2 else { throw E2EEIdentityVaultError.corrupted }
        let registrationId = UInt32(raw[raw.startIndex]) << 8 | UInt32(raw[raw.startIndex + 1])
        do {
            return E2EELocalIdentity(keyPair: try IdentityKeyPair(bytes: raw.dropFirst(2)), registrationId: registrationId)
        } catch {
            throw E2EEIdentityVaultError.corrupted
        }
    }

    public func store(_ identity: E2EELocalIdentity) throws {
        let prefix = Data([UInt8(identity.registrationId >> 8 & 0xFF), UInt8(identity.registrationId & 0xFF)])
        try secrets.save(prefix + identity.keyPair.serialize(), as: Self.secretName)
    }

    public func erase() throws {
        try secrets.erase(Self.secretName)
    }

    /// L'identité existante, ou une nouvelle, rangée avant d'être rendue.
    public func currentOrCreate() throws -> E2EELocalIdentity {
        if let existing = try current() { return existing }
        let created = E2EELocalIdentity.generate()
        try store(created)
        return created
    }
}
