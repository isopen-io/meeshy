import CryptoKit
import Foundation
import GRDB
import LibSignalClient
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// L'enrôlement de cette installation (spec § 3.1 à 3.3) : une fois par compte
/// et par identité, réapprovisionné au stock servi, relié de nouveau après une
/// connexion, régénéré après une révocation, effacé au changement de compte.
final class E2EEDeviceRegistrarTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)

    private struct Installation {
        let vault: E2EEGRDBRecordVault
        let secrets: E2EEInMemorySecretStore
        let lock: E2EEProcessLock

        func registrar(_ directory: any E2EEDirectoryClientProviding) -> E2EEDeviceRegistrar {
            E2EEDeviceRegistrar(
                identities: E2EEIdentityVault(secrets: secrets), vault: vault, lock: lock,
                directory: directory, platform: .ios, label: "iPhone"
            )
        }
    }

    private func installation() throws -> Installation {
        Installation(
            vault: try E2EEGRDBRecordVault(writer: DatabaseQueue(), sealingKey: SymmetricKey(size: .bits256)),
            secrets: E2EEInMemorySecretStore(),
            lock: E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))
        )
    }

    func test_theFirstLaunch_enrollsWithAFullBatch_andTheNextOnlyReadsTheStock() async throws {
        let server = FakeE2EEServer()
        let phone = try installation()
        let directory = server.client(userId: alice, sessionId: "s1")

        let first = try await phone.registrar(directory).ensureEnrolled(userId: alice)
        let again = try await phone.registrar(directory).ensureEnrolled(userId: alice)

        XCTAssertEqual(first.device, again.device)
        XCTAssertEqual(directory.log, ["enroll:\(E2EEPreKeyPolicy.batchSize)", "stock"])
        XCTAssertEqual(server.activeDevices(of: alice).count, 1)
    }

    func test_aLowStock_isRefilledWithFreshKeys() async throws {
        let server = FakeE2EEServer()
        let phone = try installation()
        let directory = server.client(userId: alice, sessionId: "s1")
        let enrolled = try await phone.registrar(directory).ensureEnrolled(userId: alice)
        _ = server.client(userId: bob, sessionId: "b").bundlesSync(of: alice, count: 90)

        _ = try await phone.registrar(directory).ensureEnrolled(userId: alice)

        XCTAssertEqual(directory.log.last, "publish")
        let device = try XCTUnwrap(server.activeDevices(of: alice).first { $0.deviceId == enrolled.device.deviceId })
        XCTAssertEqual(device.oneTimePreKeys.count, 10 + E2EEPreKeyPolicy.batchSize)
    }

    func test_aNewLogin_bindsTheSameInstallationAgain_withoutRepublishingItsBatch() async throws {
        let server = FakeE2EEServer()
        let phone = try installation()
        let before = try await phone.registrar(server.client(userId: alice, sessionId: "s1")).ensureEnrolled(userId: alice)
        server.endSession(userId: alice, sessionId: "s1")
        let directory = server.client(userId: alice, sessionId: "s2")

        let after = try await phone.registrar(directory).ensureEnrolled(userId: alice)

        XCTAssertEqual(after.device, before.device, "même place, même génération")
        XCTAssertEqual(directory.log.prefix(2), ["stock", "enroll:0"])
        XCTAssertEqual(server.activeDevices(of: alice).count, 1)
    }

    func test_aRevokedIdentity_isReplacedByAFreshOne() async throws {
        let server = FakeE2EEServer()
        let phone = try installation()
        let before = try await phone.registrar(server.client(userId: alice, sessionId: "s1")).ensureEnrolled(userId: alice)
        server.revoke(userId: alice, deviceId: before.device.deviceId)
        server.endSession(userId: alice, sessionId: "s1")

        let after = try await phone.registrar(server.client(userId: alice, sessionId: "s2")).ensureEnrolled(userId: alice)

        XCTAssertNotEqual(after.identity.keyPair.identityKey.serialize(), before.identity.keyPair.identityKey.serialize())
        XCTAssertEqual(server.activeDevices(of: alice).map(\.identityKey), [after.identity.keyPair.identityKey.serialize().base64EncodedString()])
    }

    func test_aFullAccount_saysSo() async throws {
        let server = FakeE2EEServer()
        server.maxActiveDevices = 1
        _ = try await installation().registrar(server.client(userId: alice, sessionId: "s1")).ensureEnrolled(userId: alice)

        do {
            _ = try await installation().registrar(server.client(userId: alice, sessionId: "s2")).ensureEnrolled(userId: alice)
            XCTFail("un compte plein refuse")
        } catch {
            XCTAssertEqual(error as? E2EEEnrollmentError, .deviceLimitReached)
        }
    }

    /// #13036 — la passerelle réattribue la plus petite place libre : retirer
    /// depuis une liste lue AVANT qu'une autre installation reprenne la place
    /// ne retire pas cette autre installation. Le refus se dit, et rien n'est
    /// révoqué.
    func test_retiringASlotTakenOverSinceTheListing_isRefused_andTheNewOccupantStays() async throws {
        let server = FakeE2EEServer()
        let laptop = try installation()
        let phone = try installation()
        let lost = try await laptop.registrar(server.client(userId: alice, sessionId: "lost")).ensureEnrolled(userId: alice)
        let manager = phone.registrar(server.client(userId: alice, sessionId: "phone"))
        _ = try await manager.ensureEnrolled(userId: alice)
        let listing = try await manager.ownDevices(userId: alice)
        let listed = try XCTUnwrap(listing.first { $0.deviceId == lost.device.deviceId })
        server.revoke(userId: alice, deviceId: lost.device.deviceId)
        let newcomer = try await installation().registrar(server.client(userId: alice, sessionId: "new")).ensureEnrolled(userId: alice)
        XCTAssertEqual(newcomer.device.deviceId, listed.deviceId, "la place libérée est reprise")

        do {
            try await manager.retire(deviceId: listed.deviceId, registrationId: listed.registrationId)
            XCTFail("une place reprise ne se retire pas depuis la liste d'avant")
        } catch {
            XCTAssertEqual(error as? E2EEDeviceRetirementError, .deviceChanged)
        }
        XCTAssertTrue(server.activeDevices(of: alice).contains { $0.registrationId == newcomer.device.registrationId })
    }

    func test_retiringTheListedGeneration_revokesIt() async throws {
        let server = FakeE2EEServer()
        let lost = try await installation().registrar(server.client(userId: alice, sessionId: "lost")).ensureEnrolled(userId: alice)
        let manager = try installation().registrar(server.client(userId: alice, sessionId: "phone"))
        _ = try await manager.ensureEnrolled(userId: alice)

        try await manager.retire(deviceId: lost.device.deviceId, registrationId: lost.device.registrationId)

        XCTAssertFalse(server.activeDevices(of: alice).contains { $0.registrationId == lost.device.registrationId })
    }

    /// #12882 — le trousseau survit à la désinstallation d'iOS, pas `e2ee.sqlite`
    /// (groupe d'apps). Une installation qui a perdu ses sessions, ses pré-clés
    /// et son compteur d'identifiants ne reprend pas l'identité d'avant : ses
    /// pairs garderaient leur session (même `registrationId`, aucun 409
    /// `stale`) et chaque message qu'ils lui enverraient serait indéchiffrable.
    func test_aReinstallThatKeepsTheKeychainButLosesTheDatabase_drawsANewIdentity() async throws {
        let server = FakeE2EEServer()
        let phone = try installation()
        let before = try await phone.registrar(server.client(userId: alice, sessionId: "s1")).ensureEnrolled(userId: alice)
        let reinstalled = Installation(
            vault: try E2EEGRDBRecordVault(writer: DatabaseQueue(), sealingKey: SymmetricKey(size: .bits256)),
            secrets: phone.secrets,
            lock: phone.lock
        )

        let directory = server.client(userId: alice, sessionId: "s2")

        let after = try await reinstalled.registrar(directory).ensureEnrolled(userId: alice)

        XCTAssertNotEqual(
            after.identity.keyPair.identityKey.serialize(), before.identity.keyPair.identityKey.serialize(),
            "une installation sans état local n'a plus rien de l'identité d'avant : elle en tire une neuve"
        )
        XCTAssertEqual(directory.log, ["enroll:\(E2EEPreKeyPolicy.batchSize)"], "une identité neuve s'enrôle avec un lot complet")
    }

    func test_anotherAccountOnTheSameInstallation_startsFromNothing() async throws {
        let server = FakeE2EEServer()
        let phone = try installation()
        let aliceDevice = try await phone.registrar(server.client(userId: alice, sessionId: "s1")).ensureEnrolled(userId: alice)
        try phone.vault.write { try $0.save(Data("secret".utf8), as: .plaintext, "m1") }

        let bobDevice = try await phone.registrar(server.client(userId: bob, sessionId: "s2")).ensureEnrolled(userId: bob)

        XCTAssertNotEqual(bobDevice.identity.keyPair.identityKey.serialize(), aliceDevice.identity.keyPair.identityKey.serialize())
        XCTAssertNil(try phone.vault.read { try $0.load(.plaintext, "m1") }, "rien du compte précédent ne reste")
    }

    // MARK: - IOS-03 (#18945) : un coffre arrivé sans sa clé

    /// Sauvegarde iCloud ou Finder restaurée, Démarrage rapide : le coffre
    /// arrive, sa clé de scellement et l'identité (`ThisDeviceOnly`) non. Rien
    /// de ce coffre ne se lira plus jamais : l'installation devient un NOUVEL
    /// appareil, au lieu de lever `unsealable` à chaque ouverture de session.
    func test_aVaultRestoredWithoutItsKey_becomesANewDevice() async throws {
        let server = FakeE2EEServer()
        let database = try DatabaseQueue()
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))
        let old = Installation(
            vault: try E2EEGRDBRecordVault(writer: database, sealingKey: SymmetricKey(size: .bits256)),
            secrets: E2EEInMemorySecretStore(), lock: lock
        )
        _ = try await old.registrar(server.client(userId: alice, sessionId: "s1")).ensureEnrolled(userId: alice)
        try old.vault.write { try $0.save(Data("historique".utf8), as: .plaintext, "m1") }
        let restored = Installation(
            vault: try E2EEGRDBRecordVault(writer: database, sealingKey: SymmetricKey(size: .bits256)),
            secrets: E2EEInMemorySecretStore(), lock: lock
        )
        let directory = server.client(userId: alice, sessionId: "s2")

        let device = try await restored.registrar(directory).ensureEnrolled(userId: alice)

        XCTAssertEqual(directory.log, ["enroll:\(E2EEPreKeyPolicy.batchSize)"], "un NOUVEL appareil : lot complet, aucune place reprise")
        XCTAssertEqual(try restored.vault.read { try $0.keys(of: .plaintext) }, [], "aucune ligne du coffre étranger ne reste")
        XCTAssertEqual(try restored.vault.read { try E2EELocalEnrollmentRecord.load(in: $0) }, device.device)
    }

    /// Le miroir : rouvert avec SA clé, le coffre garde son enrôlement et son historique.
    func test_aVaultReopenedWithItsKey_keepsItsEnrollmentAndHistory() async throws {
        let server = FakeE2EEServer()
        let database = try DatabaseQueue()
        let key = SymmetricKey(size: .bits256)
        let secrets = E2EEInMemorySecretStore()
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))
        let directory = server.client(userId: alice, sessionId: "s1")
        let first = Installation(vault: try E2EEGRDBRecordVault(writer: database, sealingKey: key), secrets: secrets, lock: lock)
        let before = try await first.registrar(directory).ensureEnrolled(userId: alice)
        try first.vault.write { try $0.save(Data("historique".utf8), as: .plaintext, "m1") }
        let reopened = Installation(vault: try E2EEGRDBRecordVault(writer: database, sealingKey: key), secrets: secrets, lock: lock)

        let after = try await reopened.registrar(directory).ensureEnrolled(userId: alice)

        XCTAssertEqual(after.device, before.device)
        XCTAssertEqual(directory.log, ["enroll:\(E2EEPreKeyPolicy.batchSize)", "stock"])
        XCTAssertEqual(try reopened.vault.read { try $0.load(.plaintext, "m1") }, Data("historique".utf8))
    }

    /// Une base OCCUPÉE peut n'être que passagère (comme un trousseau
    /// verrouillé avant le premier déverrouillage) : elle ne se juge jamais
    /// comme un coffre étranger, rien n'est effacé.
    func test_aBusyDatabase_neverResetsTheVault() async throws {
        let server = FakeE2EEServer()
        let secrets = E2EEInMemorySecretStore()
        try E2EEIdentityVault(secrets: secrets).store(E2EELocalIdentity.generate())
        let busy = BusyVault()
        let registrar = E2EEDeviceRegistrar(
            identities: E2EEIdentityVault(secrets: secrets), vault: busy,
            lock: E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock")),
            directory: server.client(userId: alice, sessionId: "s1"), platform: .ios, label: "iPhone"
        )

        do {
            _ = try await registrar.ensureEnrolled(userId: alice)
            XCTFail("une base occupée remonte, elle ne se répare pas en effaçant")
        } catch {
            XCTAssertEqual((error as? DatabaseError)?.resultCode, .SQLITE_BUSY)
        }
        XCTAssertEqual(busy.writes, 0, "aucune réinitialisation tentée")
        XCTAssertNotNil(try E2EEIdentityVault(secrets: secrets).current(), "l'identité reste")
    }
}

/// Une base qui refuse tout, comme une base occupée par l'autre processus.
private final class BusyVault: E2EERecordVaultProviding, @unchecked Sendable {
    private(set) var writes = 0

    func write<T>(_ body: (any E2EERecordTransaction) throws -> T) throws -> T {
        writes += 1
        throw DatabaseError(resultCode: .SQLITE_BUSY)
    }

    func read<T>(_ body: (any E2EERecordTransaction) throws -> T) throws -> T {
        throw DatabaseError(resultCode: .SQLITE_BUSY)
    }
}

extension FakeE2EEDirectoryClient {
    /// Fait consommer `count` pré-clés de `userId` par ce client (un tiers qui réserve des bundles).
    func bundlesSync(of userId: String, count: Int) -> Int {
        (0..<count).reduce(0) { total, _ in total + server.bundlesForTest(of: userId).devices.count }
    }
}
