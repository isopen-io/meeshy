import Foundation
import LibSignalClient

/// Les six stores libsignal (identité, pré-clés EC, pré-clés signées, pré-clés
/// Kyber, sessions, sender keys) sur les enregistrements scellés de
/// `E2EERecordVaultProviding` (spec § 4.4). Chaque méthode écrit dans la
/// transaction que libsignal lui passe comme contexte : un déchiffrement et le
/// nouvel état du ratchet partent ensemble ou pas du tout.
///
/// Confiance : TOFU avec alerte (spec § 4.1 et § 7.3). Une identité inconnue
/// est acceptée ; une identité qui change est enregistrée et signalée
/// (`.replacedExisting`), l'envoi continue (politique Signal par défaut).
public final class MeeshySignalProtocolStore: IdentityKeyStore, PreKeyStore, SignedPreKeyStore, KyberPreKeyStore,
    SessionStore, SenderKeyStore, @unchecked Sendable
{
    private let identity: E2EELocalIdentity

    public init(identity: E2EELocalIdentity) {
        self.identity = identity
    }

    private func transaction(_ context: StoreContext) throws -> any E2EERecordTransaction {
        guard let transaction = context as? any E2EERecordTransaction else { throw E2EERecordVaultError.foreignContext }
        return transaction
    }

    private static func key(_ address: ProtocolAddress) -> String { "\(address.name).\(address.deviceId)" }

    // MARK: - IdentityKeyStore

    public func identityKeyPair(context: StoreContext) throws -> IdentityKeyPair { identity.keyPair }

    public func localRegistrationId(context: StoreContext) throws -> UInt32 { identity.registrationId }

    public func saveIdentity(_ identity: IdentityKey, for address: ProtocolAddress, context: StoreContext) throws -> IdentityChange {
        let records = try transaction(context)
        let previous = try records.load(.remoteIdentity, Self.key(address))
        try records.save(identity.serialize(), as: .remoteIdentity, Self.key(address))
        return previous == nil || previous == identity.serialize() ? .newOrUnchanged : .replacedExisting
    }

    /// TOFU avec alerte, dans les deux sens : un changement d'identité ne bloque
    /// ni l'envoi ni la réception, il est signalé par `saveIdentity`. Le mode
    /// strict (bloquer jusqu'à vérification du numéro de sécurité) est hors de
    /// ce lot (spec § 4.1) ; c'est ici qu'il se branchera.
    public func isTrustedIdentity(_ identity: IdentityKey, for address: ProtocolAddress, direction: Direction, context: StoreContext) throws -> Bool {
        _ = try transaction(context)
        return true
    }

    public func identity(for address: ProtocolAddress, context: StoreContext) throws -> IdentityKey? {
        try transaction(context).load(.remoteIdentity, Self.key(address)).map { try IdentityKey(bytes: $0) }
    }

    // MARK: - PreKeyStore

    public func loadPreKey(id: UInt32, context: StoreContext) throws -> PreKeyRecord {
        guard let raw = try transaction(context).load(.preKey, String(id)) else {
            throw SignalError.invalidKeyIdentifier("no prekey with this identifier")
        }
        return try PreKeyRecord(bytes: raw)
    }

    public func storePreKey(_ record: PreKeyRecord, id: UInt32, context: StoreContext) throws {
        try transaction(context).save(record.serialize(), as: .preKey, String(id))
    }

    public func removePreKey(id: UInt32, context: StoreContext) throws {
        try transaction(context).remove(.preKey, String(id))
    }

    // MARK: - SignedPreKeyStore

    public func loadSignedPreKey(id: UInt32, context: StoreContext) throws -> SignedPreKeyRecord {
        guard let raw = try transaction(context).load(.signedPreKey, String(id)) else {
            throw SignalError.invalidKeyIdentifier("no signed prekey with this identifier")
        }
        return try SignedPreKeyRecord(bytes: raw)
    }

    public func storeSignedPreKey(_ record: SignedPreKeyRecord, id: UInt32, context: StoreContext) throws {
        try transaction(context).save(record.serialize(), as: .signedPreKey, String(id))
    }

    // MARK: - KyberPreKeyStore

    public func loadKyberPreKey(id: UInt32, context: StoreContext) throws -> KyberPreKeyRecord {
        guard let raw = try transaction(context).load(.kyberPreKey, String(id)) else {
            throw SignalError.invalidKeyIdentifier("no kyber prekey with this identifier")
        }
        return try KyberPreKeyRecord(bytes: raw)
    }

    public func storeKyberPreKey(_ record: KyberPreKeyRecord, id: UInt32, context: StoreContext) throws {
        try transaction(context).save(record.serialize(), as: .kyberPreKey, String(id))
    }

    /// La pré-clé Kyber de DERNIER RECOURS se réutilise, mais jamais avec la même
    /// clé de base (rejeu d'un `PreKeySignalMessage`) ; une pré-clé Kyber UNIQUE
    /// s'efface à son premier usage (PQXDH § 2.4).
    public func markKyberPreKeyUsed(id: UInt32, signedPreKeyId: UInt32, baseKey: PublicKey, context: StoreContext) throws {
        let records = try transaction(context)
        let seen = "\(id).\(signedPreKeyId).\(baseKey.serialize().base64EncodedString())"
        if try records.load(.kyberBaseKeySeen, seen) != nil { throw SignalError.invalidMessage("reused base key") }
        try records.save(Data([1]), as: .kyberBaseKeySeen, seen)
        if try records.load(.kyberLastResortMarker, String(id)) == nil {
            try records.remove(.kyberPreKey, String(id))
        }
    }

    /// Déclare une pré-clé Kyber comme de dernier recours : elle survit à son usage.
    public func markKyberPreKeyLastResort(id: UInt32, context: StoreContext) throws {
        try transaction(context).save(Data([1]), as: .kyberLastResortMarker, String(id))
    }

    // MARK: - SessionStore

    public func loadSession(for address: ProtocolAddress, context: StoreContext) throws -> SessionRecord? {
        try transaction(context).load(.session, Self.key(address)).map { try SessionRecord(bytes: $0) }
    }

    public func loadExistingSessions(for addresses: [ProtocolAddress], context: StoreContext) throws -> [SessionRecord] {
        try addresses.map { address in
            guard let session = try loadSession(for: address, context: context) else {
                throw SignalError.sessionNotFound("\(address)")
            }
            return session
        }
    }

    public func storeSession(_ record: SessionRecord, for address: ProtocolAddress, context: StoreContext) throws {
        try transaction(context).save(record.serialize(), as: .session, Self.key(address))
    }

    /// Efface la session d'un appareil périmé (409 `stale` de Sesame, spec § 3.4).
    public func deleteSession(for address: ProtocolAddress, context: StoreContext) throws {
        try transaction(context).remove(.session, Self.key(address))
    }

    // MARK: - SenderKeyStore

    public func storeSenderKey(from sender: ProtocolAddress, distributionId: UUID, record: SenderKeyRecord, context: StoreContext) throws {
        try transaction(context).save(record.serialize(), as: .senderKey, "\(Self.key(sender)).\(distributionId.uuidString)")
    }

    public func loadSenderKey(from sender: ProtocolAddress, distributionId: UUID, context: StoreContext) throws -> SenderKeyRecord? {
        try transaction(context).load(.senderKey, "\(Self.key(sender)).\(distributionId.uuidString)").map { try SenderKeyRecord(bytes: $0) }
    }
}
