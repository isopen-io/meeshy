import Foundation
import LibSignalClient

/// Un chiffré libsignal tel qu'il voyage dans une enveloppe : 3 =
/// `PreKeySignalMessage` (premier message, PQXDH), 2 = `SignalMessage`.
public struct E2EECiphertext: Equatable, Sendable {
    public let type: Int
    public let body: Data

    public init(type: Int, body: Data) {
        self.type = type
        self.body = body
    }

    public static let preKeyType = Int(CiphertextMessage.MessageType.preKey.rawValue)
    public static let whisperType = Int(CiphertextMessage.MessageType.whisper.rawValue)
}

/// L'adresse libsignal d'un appareil Meeshy : (identifiant de compte, numéro d'appareil).
public struct E2EEDeviceAddress: Hashable, Sendable {
    public let userId: String
    public let deviceId: UInt32

    public init(userId: String, deviceId: UInt32) {
        self.userId = userId
        self.deviceId = deviceId
    }

    func protocolAddress() throws -> ProtocolAddress {
        try ProtocolAddress(name: userId, deviceId: deviceId)
    }
}

public enum E2EESessionCipherError: Error, Equatable {
    case unknownMessageType(Int)
    case malformedBundle
}

/// Le chiffrement et le déchiffrement libsignal (PQXDH puis Double Ratchet) de
/// cet appareil. Chaque opération tient le verrou inter-processus ET s'exécute
/// dans UNE transaction des stores : le nouvel état du ratchet est écrit avec le
/// résultat, ou rien ne l'est.
public protocol E2EESessionCipherProviding: Sendable {
    func startSession(with bundle: E2EEDeviceBundle, of userId: String) throws
    func hasSession(with address: E2EEDeviceAddress) throws -> Bool
    /// La `registrationId` de la génération avec laquelle la session courante a
    /// été ouverte ; `nil` sans session. Une génération différente de celle
    /// que l'annuaire annonce est une session périmée (Sesame § 3).
    func remoteRegistrationId(of address: E2EEDeviceAddress) throws -> UInt32?
    /// La clé d'identité que cet appareil connaît pour l'adresse (TOFU).
    func remoteIdentity(of address: E2EEDeviceAddress) throws -> Data?
    func deleteSession(with address: E2EEDeviceAddress) throws
    func encrypt(_ plaintext: Data, for address: E2EEDeviceAddress) throws -> E2EECiphertext
    func decrypt(_ ciphertext: E2EECiphertext, from address: E2EEDeviceAddress) throws -> Data
    /// Déchiffre ET range ce que `persist` tire du clair dans la MÊME
    /// transaction que le nouvel état du ratchet : ou les deux, ou rien.
    func decrypt<T>(
        _ ciphertext: E2EECiphertext,
        from address: E2EEDeviceAddress,
        persisting persist: (Data, any E2EERecordTransaction) throws -> T
    ) throws -> T
}

public final class E2EESessionCipher: E2EESessionCipherProviding {
    private let local: E2EEDeviceAddress
    private let store: MeeshySignalProtocolStore
    private let vault: any E2EERecordVaultProviding
    private let lock: any E2EEProcessLockProviding

    public init(local: E2EEDeviceAddress, store: MeeshySignalProtocolStore, vault: any E2EERecordVaultProviding, lock: any E2EEProcessLockProviding) {
        self.local = local
        self.store = store
        self.vault = vault
        self.lock = lock
    }

    private func underLock<T>(_ body: (any E2EERecordTransaction) throws -> T) throws -> T {
        try lock.withLock { try vault.write(body) }
    }

    /// PQXDH (spec § 4.1) : libsignal vérifie les signatures XEdDSA de la pré-clé
    /// signée et de la pré-clé Kyber avant d'ouvrir la session.
    public func startSession(with bundle: E2EEDeviceBundle, of userId: String) throws {
        let preKeyBundle = try Self.preKeyBundle(bundle)
        let remote = try E2EEDeviceAddress(userId: userId, deviceId: bundle.deviceId).protocolAddress()
        let ours = try local.protocolAddress()
        try underLock { transaction in
            try processPreKeyBundle(preKeyBundle, for: remote, ourAddress: ours, sessionStore: store, identityStore: store, context: transaction)
        }
    }

    public func hasSession(with address: E2EEDeviceAddress) throws -> Bool {
        let remote = try address.protocolAddress()
        return try vault.read { transaction in try store.loadSession(for: remote, context: transaction)?.hasCurrentState ?? false }
    }

    public func remoteRegistrationId(of address: E2EEDeviceAddress) throws -> UInt32? {
        let remote = try address.protocolAddress()
        return try vault.read { transaction in
            guard let session = try store.loadSession(for: remote, context: transaction), session.hasCurrentState else { return nil }
            return try session.remoteRegistrationId()
        }
    }

    public func remoteIdentity(of address: E2EEDeviceAddress) throws -> Data? {
        let remote = try address.protocolAddress()
        return try vault.read { transaction in try store.identity(for: remote, context: transaction)?.serialize() }
    }

    public func deleteSession(with address: E2EEDeviceAddress) throws {
        let remote = try address.protocolAddress()
        try underLock { transaction in try store.deleteSession(for: remote, context: transaction) }
    }

    public func encrypt(_ plaintext: Data, for address: E2EEDeviceAddress) throws -> E2EECiphertext {
        let remote = try address.protocolAddress()
        let ours = try local.protocolAddress()
        return try underLock { transaction in
            let message = try signalEncrypt(message: plaintext, for: remote, localAddress: ours, sessionStore: store, identityStore: store, context: transaction)
            return E2EECiphertext(type: Int(message.messageType.rawValue), body: message.serialize())
        }
    }

    public func decrypt(_ ciphertext: E2EECiphertext, from address: E2EEDeviceAddress) throws -> Data {
        try decrypt(ciphertext, from: address) { plaintext, _ in plaintext }
    }

    public func decrypt<T>(
        _ ciphertext: E2EECiphertext,
        from address: E2EEDeviceAddress,
        persisting persist: (Data, any E2EERecordTransaction) throws -> T
    ) throws -> T {
        let remote = try address.protocolAddress()
        let ours = try local.protocolAddress()
        return try underLock { transaction in
            try persist(try open(ciphertext, from: remote, ours: ours, transaction: transaction), transaction)
        }
    }

    private func open(_ ciphertext: E2EECiphertext, from remote: ProtocolAddress, ours: ProtocolAddress, transaction: any E2EERecordTransaction) throws -> Data {
        switch ciphertext.type {
        case E2EECiphertext.preKeyType:
            return try signalDecryptPreKey(
                message: PreKeySignalMessage(bytes: ciphertext.body), from: remote, localAddress: ours,
                sessionStore: store, identityStore: store, preKeyStore: store, signedPreKeyStore: store,
                kyberPreKeyStore: store, context: transaction
            )
        case E2EECiphertext.whisperType:
            return try signalDecrypt(
                message: SignalMessage(bytes: ciphertext.body), from: remote, to: ours,
                sessionStore: store, identityStore: store, context: transaction
            )
        default:
            throw E2EESessionCipherError.unknownMessageType(ciphertext.type)
        }
    }

    static func preKeyBundle(_ bundle: E2EEDeviceBundle) throws -> PreKeyBundle {
        let bytes = { (base64: String) throws -> Data in
            guard let data = Data(base64Encoded: base64) else { throw E2EESessionCipherError.malformedBundle }
            return data
        }
        let identity = try IdentityKey(bytes: bytes(bundle.identityKey))
        let signedPreKey = try PublicKey(bytes(bundle.signedPreKey.publicKey))
        let kyber = try KEMPublicKey(bytes(bundle.kyberPreKey.publicKey))
        guard let preKey = bundle.preKey else {
            return try PreKeyBundle(
                registrationId: bundle.registrationId, deviceId: bundle.deviceId,
                signedPrekeyId: bundle.signedPreKey.keyId, signedPrekey: signedPreKey,
                signedPrekeySignature: bytes(bundle.signedPreKey.signature), identity: identity,
                kyberPrekeyId: bundle.kyberPreKey.keyId, kyberPrekey: kyber, kyberPrekeySignature: bytes(bundle.kyberPreKey.signature)
            )
        }
        return try PreKeyBundle(
            registrationId: bundle.registrationId, deviceId: bundle.deviceId,
            prekeyId: preKey.keyId, prekey: PublicKey(bytes(preKey.publicKey)),
            signedPrekeyId: bundle.signedPreKey.keyId, signedPrekey: signedPreKey,
            signedPrekeySignature: bytes(bundle.signedPreKey.signature), identity: identity,
            kyberPrekeyId: bundle.kyberPreKey.keyId, kyberPrekey: kyber, kyberPrekeySignature: bytes(bundle.kyberPreKey.signature)
        )
    }
}
