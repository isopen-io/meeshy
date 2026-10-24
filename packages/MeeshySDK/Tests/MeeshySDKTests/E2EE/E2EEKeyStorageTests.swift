import CryptoKit
import Foundation
import GRDB
import LibSignalClient
import XCTest
@testable import MeeshyE2EE

/// Ce qui reste sur le disque et ce qui part vers la passerelle (spec § 3.2,
/// § 4.4) : une base lue sans la clé du trousseau ne rend rien, une ligne
/// déplacée ne s'ouvre pas, et l'enrôlement ne porte que du public, signé.
final class E2EEKeyStorageTests: XCTestCase {
    private let user = String(repeating: "a1", count: 12)

    func test_theDatabaseFileHoldsNoSerializedRecordInTheClear() throws {
        let path = E2EETestDevice.temporaryPath("sqlite")
        let device = try E2EETestDevice.make(userId: user, writer: DatabaseQueue(path: path))
        _ = try device.factory.enrollment(userId: user, platform: .ios, label: nil, now: Date())

        let preKeyRecord = try device.vault.read { try $0.load(.preKey, "1") }
        let file = try Data(contentsOf: URL(fileURLWithPath: path))
        let privateKey = try PreKeyRecord(bytes: XCTUnwrap(preKeyRecord)).privateKey().serialize()

        XCTAssertNil(file.range(of: privateKey), "une clé privée de pré-clé n'est jamais en clair dans le fichier")
    }

    func test_aVaultOpenedWithAnotherKey_cannotReadARow() throws {
        let queue = try DatabaseQueue()
        let original = try E2EEGRDBRecordVault(writer: queue, sealingKey: SymmetricKey(size: .bits256))
        try original.write { try $0.save(Data("secret".utf8), as: .session, "u.1") }

        let stranger = try E2EEGRDBRecordVault(writer: queue, sealingKey: SymmetricKey(size: .bits256))

        XCTAssertThrowsError(try stranger.read { try $0.load(.session, "u.1") }) { error in
            XCTAssertEqual(error as? E2EERecordVaultError, .unsealable(kind: "session"))
        }
    }

    func test_aRowCopiedUnderAnotherKey_doesNotOpen() throws {
        let queue = try DatabaseQueue()
        let vault = try E2EEGRDBRecordVault(writer: queue, sealingKey: SymmetricKey(size: .bits256))
        try vault.write { try $0.save(Data("bob".utf8), as: .session, "bob.1") }
        try queue.write { db in
            try db.execute(sql: "INSERT INTO record (kind, key, sealed) SELECT kind, 'mallory.1', sealed FROM record WHERE key = 'bob.1'")
        }

        XCTAssertThrowsError(try vault.read { try $0.load(.session, "mallory.1") })
    }

    func test_enrollment_carriesOnlyPublicKeys_signedByTheIdentity_andABindingProofForThisAccount() throws {
        let device = try E2EETestDevice.make(userId: user)
        let now = Date(timeIntervalSince1970: 1_790_000_000)

        let request = try device.factory.enrollment(userId: user, platform: .ios, label: "iPhone", now: now)

        let identity = try IdentityKey(bytes: XCTUnwrap(Data(base64Encoded: request.identityKey)))
        let verifies = { (message: Data, signature: String) throws -> Bool in
            try identity.publicKey.verifySignature(message: message, signature: XCTUnwrap(Data(base64Encoded: signature)))
        }
        XCTAssertEqual(request.registrationId, device.identity.registrationId)
        XCTAssertTrue(try verifies(XCTUnwrap(Data(base64Encoded: request.signedPreKey.publicKey)), request.signedPreKey.signature))
        XCTAssertTrue(try verifies(XCTUnwrap(Data(base64Encoded: request.kyberLastResort.publicKey)), request.kyberLastResort.signature))
        XCTAssertTrue(try request.kyberPreKeys.allSatisfy { try verifies(XCTUnwrap(Data(base64Encoded: $0.publicKey)), $0.signature) })
        let message = "meeshy-e2ee-device-binding:v1:\(user):\(request.registrationId):\(request.identityKey):\(Int64(now.timeIntervalSince1970 * 1000))"
        XCTAssertEqual(request.binding.timestamp, 1_790_000_000_000)
        XCTAssertTrue(try verifies(Data(message.utf8), request.binding.signature))
        XCTAssertEqual(request.oneTimePreKeys.count, E2EEPreKeyPolicy.batchSize)
        XCTAssertEqual(Set(request.oneTimePreKeys.map(\.keyId)).count, E2EEPreKeyPolicy.batchSize)

        let encoded = String(decoding: try JSONEncoder().encode(request), as: UTF8.self)
        XCTAssertNil(encoded.range(of: "private", options: .caseInsensitive))
    }

    func test_everyPublishedPreKey_hasItsPrivateKeyOnTheDevice() throws {
        let device = try E2EETestDevice.make(userId: user)
        let request = try device.factory.enrollment(userId: user, platform: .ios, label: nil, now: Date())

        let stored = try device.vault.read { transaction in
            (try transaction.keys(of: .preKey), try transaction.keys(of: .kyberPreKey), try transaction.keys(of: .signedPreKey))
        }

        XCTAssertEqual(Set(stored.0), Set(request.oneTimePreKeys.map { String($0.keyId) }))
        XCTAssertEqual(Set(stored.1), Set((request.kyberPreKeys + [request.kyberLastResort]).map { String($0.keyId) }))
        XCTAssertEqual(stored.2, [String(request.signedPreKey.keyId)])
    }

    func test_replenishment_refillsOnlyTheKindBelowTheThreshold_withFreshIdentifiers() throws {
        let device = try E2EETestDevice.make(userId: user)
        let enrollment = try device.factory.enrollment(userId: user, platform: .ios, label: nil, now: Date())

        let none = try device.factory.replenishment(for: E2EEPreKeyStock(deviceId: 1, oneTimePreKeys: 20, kyberPreKeys: 20), now: Date())
        let ecOnly = try device.factory.replenishment(for: E2EEPreKeyStock(deviceId: 1, oneTimePreKeys: 19, kyberPreKeys: 80), now: Date())

        XCTAssertNil(none)
        XCTAssertEqual(ecOnly?.oneTimePreKeys?.count, E2EEPreKeyPolicy.batchSize)
        XCTAssertNil(ecOnly?.kyberPreKeys)
        let reused = Set(enrollment.oneTimePreKeys.map(\.keyId)).intersection(ecOnly?.oneTimePreKeys?.map(\.keyId) ?? [])
        XCTAssertTrue(reused.isEmpty, "un identifiant de pré-clé n'est jamais réutilisé")
    }

    func test_identityVault_keepsTheSameIdentityAcrossLaunches_andSealingKeyIsStable() throws {
        let secrets = E2EEInMemorySecretStore()
        let first = try E2EEIdentityVault(secrets: secrets).currentOrCreate()
        let again = try E2EEIdentityVault(secrets: secrets).currentOrCreate()

        XCTAssertEqual(first.registrationId, again.registrationId)
        XCTAssertEqual(first.keyPair.serialize(), again.keyPair.serialize())
        XCTAssertTrue((1...0x3FFF).contains(first.registrationId))
        let key = try E2EESealingKey.loadOrCreate(in: secrets).withUnsafeBytes { Data($0) }
        XCTAssertEqual(try E2EESealingKey.loadOrCreate(in: secrets).withUnsafeBytes { Data($0) }, key)
    }
}
