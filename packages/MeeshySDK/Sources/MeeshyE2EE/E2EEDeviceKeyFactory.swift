import Foundation
import LibSignalClient

/// Ce qu'un appareil publie (spec § 3.2, PQXDH § 2.4) et la preuve de liaison
/// de son identité (§ 3.3). Les parties PRIVÉES sont rangées dans les stores,
/// dans la même transaction que la composition de ce qui part : une pré-clé
/// publiée a toujours sa clé privée sur l'appareil.
public protocol E2EEDeviceKeyFactoryProviding: Sendable {
    func enrollment(userId: String, platform: E2EEPlatform, label: String?, now: Date) throws -> E2EEEnrollDeviceRequest
    func replenishment(for stock: E2EEPreKeyStock, now: Date) throws -> E2EEPublishKeysRequest?
}

/// Les bornes de réapprovisionnement de la spec (§ 3.2).
public enum E2EEPreKeyPolicy {
    public static let batchSize = 100
    public static let refillBelow = 20
    /// La pré-clé signée et la Kyber de dernier recours tournent au plus tous les 7 jours.
    public static let rotationInterval: TimeInterval = 7 * 24 * 60 * 60
}

public final class E2EEDeviceKeyFactory: E2EEDeviceKeyFactoryProviding {
    private let identity: E2EELocalIdentity
    private let store: MeeshySignalProtocolStore
    private let vault: any E2EERecordVaultProviding
    private let lock: any E2EEProcessLockProviding

    public init(identity: E2EELocalIdentity, store: MeeshySignalProtocolStore, vault: any E2EERecordVaultProviding, lock: any E2EEProcessLockProviding) {
        self.identity = identity
        self.store = store
        self.vault = vault
        self.lock = lock
    }

    private var identityKeyBase64: String { identity.keyPair.identityKey.serialize().base64EncodedString() }

    public func enrollment(userId: String, platform: E2EEPlatform, label: String?, now: Date) throws -> E2EEEnrollDeviceRequest {
        let timestamp = Int64(now.timeIntervalSince1970 * 1000)
        let message = E2EEDeviceBindingProof.message(
            userId: userId, registrationId: identity.registrationId, identityKey: identityKeyBase64, timestamp: timestamp
        )
        let binding = E2EEDeviceBindingProof(timestamp: timestamp, signature: sign(Data(message.utf8)))
        return try lock.withLock {
            try vault.write { transaction in
                E2EEEnrollDeviceRequest(
                    registrationId: identity.registrationId,
                    identityKey: identityKeyBase64,
                    signedPreKey: try newSignedPreKey(transaction, now: now),
                    kyberLastResort: try newKyberPreKey(transaction, now: now, lastResort: true),
                    platform: platform,
                    label: label,
                    binding: binding,
                    oneTimePreKeys: try newOneTimePreKeys(transaction, count: E2EEPreKeyPolicy.batchSize),
                    kyberPreKeys: try (0..<E2EEPreKeyPolicy.batchSize).map { _ in try newKyberPreKey(transaction, now: now, lastResort: false) }
                )
            }
        }
    }

    public func replenishment(for stock: E2EEPreKeyStock, now: Date) throws -> E2EEPublishKeysRequest? {
        let refillEC = stock.oneTimePreKeys < E2EEPreKeyPolicy.refillBelow
        let refillKyber = stock.kyberPreKeys < E2EEPreKeyPolicy.refillBelow
        guard refillEC || refillKyber else { return nil }
        return try lock.withLock {
            try vault.write { transaction in
                E2EEPublishKeysRequest(
                    oneTimePreKeys: refillEC ? try newOneTimePreKeys(transaction, count: E2EEPreKeyPolicy.batchSize) : nil,
                    kyberPreKeys: refillKyber
                        ? try (0..<E2EEPreKeyPolicy.batchSize).map { _ in try newKyberPreKey(transaction, now: now, lastResort: false) }
                        : nil
                )
            }
        }
    }

    private func sign(_ message: Data) -> String {
        identity.keyPair.privateKey.generateSignature(message: message).base64EncodedString()
    }

    /// Un identifiant neuf par nature de clé, jamais réutilisé sur cet appareil.
    private func nextKeyId(_ transaction: any E2EERecordTransaction, _ counter: String) throws -> UInt32 {
        let current = try transaction.load(.keyIdCounter, counter).flatMap { UInt32(String(decoding: $0, as: UTF8.self)) } ?? 0
        let next = current >= 0x7FFF_FFFF ? 1 : current + 1
        try transaction.save(Data(String(next).utf8), as: .keyIdCounter, counter)
        return next
    }

    private func newSignedPreKey(_ transaction: any E2EERecordTransaction, now: Date) throws -> E2EESignedKey {
        let id = try nextKeyId(transaction, "signedPreKey")
        let privateKey = PrivateKey.generate()
        let publicKey = privateKey.publicKey.serialize()
        let signature = identity.keyPair.privateKey.generateSignature(message: publicKey)
        let record = try SignedPreKeyRecord(id: id, timestamp: Self.millis(now), privateKey: privateKey, signature: signature)
        try store.storeSignedPreKey(record, id: id, context: transaction)
        return E2EESignedKey(keyId: id, publicKey: publicKey.base64EncodedString(), signature: signature.base64EncodedString())
    }

    private func newKyberPreKey(_ transaction: any E2EERecordTransaction, now: Date, lastResort: Bool) throws -> E2EESignedKey {
        let id = try nextKeyId(transaction, "kyberPreKey")
        let pair = KEMKeyPair.generate()
        let publicKey = pair.publicKey.serialize()
        let signature = identity.keyPair.privateKey.generateSignature(message: publicKey)
        try store.storeKyberPreKey(try KyberPreKeyRecord(id: id, timestamp: Self.millis(now), keyPair: pair, signature: signature), id: id, context: transaction)
        if lastResort { try store.markKyberPreKeyLastResort(id: id, context: transaction) }
        return E2EESignedKey(keyId: id, publicKey: publicKey.base64EncodedString(), signature: signature.base64EncodedString())
    }

    private func newOneTimePreKeys(_ transaction: any E2EERecordTransaction, count: Int) throws -> [E2EEOneTimeKey] {
        try (0..<count).map { _ in
            let id = try nextKeyId(transaction, "preKey")
            let privateKey = PrivateKey.generate()
            try store.storePreKey(try PreKeyRecord(id: id, privateKey: privateKey), id: id, context: transaction)
            return E2EEOneTimeKey(keyId: id, publicKey: privateKey.publicKey.serialize().base64EncodedString())
        }
    }

    private static func millis(_ date: Date) -> UInt64 { UInt64(date.timeIntervalSince1970 * 1000) }
}
