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

    func test_anotherAccountOnTheSameInstallation_startsFromNothing() async throws {
        let server = FakeE2EEServer()
        let phone = try installation()
        let aliceDevice = try await phone.registrar(server.client(userId: alice, sessionId: "s1")).ensureEnrolled(userId: alice)
        try phone.vault.write { try $0.save(Data("secret".utf8), as: .plaintext, "m1") }

        let bobDevice = try await phone.registrar(server.client(userId: bob, sessionId: "s2")).ensureEnrolled(userId: bob)

        XCTAssertNotEqual(bobDevice.identity.keyPair.identityKey.serialize(), aliceDevice.identity.keyPair.identityKey.serialize())
        XCTAssertNil(try phone.vault.read { try $0.load(.plaintext, "m1") }, "rien du compte précédent ne reste")
    }
}

extension FakeE2EEDirectoryClient {
    /// Fait consommer `count` pré-clés de `userId` par ce client (un tiers qui réserve des bundles).
    func bundlesSync(of userId: String, count: Int) -> Int {
        (0..<count).reduce(0) { total, _ in total + server.bundlesForTest(of: userId).devices.count }
    }
}
