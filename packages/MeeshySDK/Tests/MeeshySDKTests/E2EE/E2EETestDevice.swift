import CryptoKit
import Foundation
import GRDB
@testable import MeeshyE2EE

/// Un appareil de test complet : identité, base scellée (en mémoire ou sur un
/// fichier), stores libsignal, verrou de fichier, fabrique de clés, chiffreur.
struct E2EETestDevice {
    let address: E2EEDeviceAddress
    let identity: E2EELocalIdentity
    let vault: E2EEGRDBRecordVault
    let store: MeeshySignalProtocolStore
    let lock: E2EEProcessLock
    let factory: E2EEDeviceKeyFactory
    let cipher: E2EESessionCipher

    static func make(
        userId: String,
        deviceId: UInt32 = 1,
        identity: E2EELocalIdentity = .generate(),
        writer: (any DatabaseWriter)? = nil,
        sealingKey: SymmetricKey = SymmetricKey(size: .bits256),
        lockPath: String = temporaryPath("lock")
    ) throws -> E2EETestDevice {
        let address = E2EEDeviceAddress(userId: userId, deviceId: deviceId)
        let vault = try E2EEGRDBRecordVault(writer: writer ?? DatabaseQueue(), sealingKey: sealingKey)
        let store = MeeshySignalProtocolStore(identity: identity)
        let lock = E2EEProcessLock(path: lockPath)
        return E2EETestDevice(
            address: address,
            identity: identity,
            vault: vault,
            store: store,
            lock: lock,
            factory: E2EEDeviceKeyFactory(identity: identity, store: store, vault: vault, lock: lock),
            cipher: E2EESessionCipher(local: address, store: store, vault: vault, lock: lock)
        )
    }

    static func temporaryPath(_ suffix: String) -> String {
        FileManager.default.temporaryDirectory.appendingPathComponent("e2ee-\(UUID().uuidString).\(suffix)").path
    }
}

/// Ce que ferait la passerelle d'un enrôlement : le bundle d'un appareil, avec
/// une pré-clé unique EC et une Kyber réservées (ou la Kyber de dernier recours).
enum E2EETestDirectory {
    static func bundle(of enrollment: E2EEEnrollDeviceRequest, deviceId: UInt32, oneTimeIndex: Int? = 0) -> E2EEDeviceBundle {
        let kyber = oneTimeIndex.flatMap { enrollment.kyberPreKeys.indices.contains($0) ? enrollment.kyberPreKeys[$0] : nil }
        let kyberKey = kyber.map { E2EEKyberBundleKey(keyId: $0.keyId, publicKey: $0.publicKey, signature: $0.signature, lastResort: false) }
            ?? E2EEKyberBundleKey(
                keyId: enrollment.kyberLastResort.keyId,
                publicKey: enrollment.kyberLastResort.publicKey,
                signature: enrollment.kyberLastResort.signature,
                lastResort: true
            )
        return E2EEDeviceBundle(
            deviceId: deviceId,
            registrationId: enrollment.registrationId,
            identityKey: enrollment.identityKey,
            signedPreKey: enrollment.signedPreKey,
            kyberPreKey: kyberKey,
            preKey: oneTimeIndex.flatMap { enrollment.oneTimePreKeys.indices.contains($0) ? enrollment.oneTimePreKeys[$0] : nil }
        )
    }
}
