import CryptoKit
import Foundation
import GRDB
import XCTest
@_spi(Testing) @testable import MeeshyE2EE
@testable import MeeshySDK

/// **Le verrou E2EE du groupe d'apps n'est jamais tenu quand iOS suspend le
/// processus** (#12668). iOS termine (0xdead10cc) un processus suspendu qui
/// tient un verrou de fichier dans un conteneur partagé : le verrou ne se prend
/// que sous un bail d'exécution accordé par le système, jamais sans, et un lot
/// long se découpe en tranches, chacune sous sa propre prise.
final class E2EEExecutionLeaseTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)

    // MARK: - Le verrou ne se prend que sous un bail

    func test_aRefusedLease_neverTakesTheFileLock_norRunsTheBody() {
        let fileLock = RecordingFileLock()
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: ScriptedLeasing([.refuse]), fileLock: fileLock)
        var ran = false

        XCTAssertThrowsError(try lock.withLock { ran = true }) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .refused)
        }
        XCTAssertFalse(ran)
        XCTAssertEqual(fileLock.holds, 0, "aucun flock sans bail")
    }

    func test_aLeaseAlreadyExpired_neverTakesTheFileLock_norRunsTheBody() {
        let fileLock = RecordingFileLock()
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: ScriptedLeasing([.expired]), fileLock: fileLock)
        var ran = false

        XCTAssertThrowsError(try lock.withLock { ran = true }) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .expired)
        }
        XCTAssertFalse(ran)
        XCTAssertEqual(fileLock.holds, 0)
    }

    /// La prise attend l'autre processus (`flock` bloquant) : un bail qui
    /// expire pendant cette attente ne laisse pas démarrer le corps.
    func test_aLeaseThatExpiresWhileWaitingForTheFileLock_doesNotRunTheBody() {
        let leasing = ScriptedLeasing([.grant])
        let fileLock = RecordingFileLock(onHold: { leasing.expireCurrent() })
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: leasing, fileLock: fileLock)
        var ran = false

        XCTAssertThrowsError(try lock.withLock { ran = true }) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .expired)
        }
        XCTAssertFalse(ran)
    }

    func test_theFileLockIsHeldOnlyInsideTheLease() throws {
        let leasing = ScriptedLeasing([.grant])
        let fileLock = RecordingFileLock(onHold: { XCTAssertTrue(leasing.isOpen, "le flock se prend bail ouvert") })
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: leasing, fileLock: fileLock)

        let value = try lock.withLock { () -> Int in
            XCTAssertTrue(leasing.isOpen, "le corps s'exécute bail ouvert")
            return 7
        }

        XCTAssertEqual(value, 7)
        XCTAssertFalse(leasing.isOpen, "le bail se referme avec la prise")
        XCTAssertEqual(leasing.requests, 1)
    }

    func test_aNestedTake_isRefusedBeforeOpeningASecondLease() {
        let leasing = ScriptedLeasing([.grant, .grant])
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: leasing)

        XCTAssertThrowsError(try lock.withLock { try lock.withLock {} }) { error in
            XCTAssertEqual(error as? E2EEProcessLockError, .reentrant)
        }
        XCTAssertEqual(leasing.requests, 1)
    }

    // MARK: - Un lot se découpe en tranches

    func test_slices_stopAtTheFirstRefusedLease_andKeepTheDoneOnes() throws {
        let leasing = ScriptedLeasing([.grant, .grant, .refuse, .grant])
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: leasing)
        var started: [Int] = []

        let done = try lock.withLockInSlices([1, 2, 3, 4]) { slice -> Int in
            started.append(slice)
            return slice * 10
        }

        XCTAssertEqual(done, [10, 20])
        XCTAssertEqual(started, [1, 2], "la tranche refusée et les suivantes ne démarrent pas")
        XCTAssertEqual(leasing.requests, 3, "aucun bail n'est redemandé après le refus")
    }

    func test_slices_withNoSliceDone_throwTheRefusal() {
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: ScriptedLeasing([.refuse]))

        XCTAssertThrowsError(try lock.withLockInSlices([1, 2]) { $0 }) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .refused)
        }
    }

    // MARK: - Le réapprovisionnement des pré-clés

    private func device(leasing: ScriptedLeasing) throws -> (E2EETestDevice, E2EEDeviceKeyFactory) {
        let device = try E2EETestDevice.make(userId: bob)
        let lock = E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: leasing)
        return (device, E2EEDeviceKeyFactory(identity: device.identity, store: device.store, vault: device.vault, lock: lock))
    }

    private func stored(_ kind: E2EERecordKind, in device: E2EETestDevice) throws -> Int {
        try device.vault.read { try $0.keys(of: kind) }.count
    }

    private let emptyStock = E2EEPreKeyStock(deviceId: 1, oneTimePreKeys: 0, kyberPreKeys: 0)

    func test_replenishment_isTakenInTranches_eachUnderItsOwnLease() throws {
        let leasing = ScriptedLeasing(Array(repeating: .grant, count: 10))
        let (device, factory) = try device(leasing: leasing)

        let request = try XCTUnwrap(try factory.replenishment(for: emptyStock, now: Date()))

        XCTAssertEqual(request.oneTimePreKeys?.count, E2EEPreKeyPolicy.batchSize)
        XCTAssertEqual(request.kyberPreKeys?.count, E2EEPreKeyPolicy.batchSize)
        XCTAssertEqual(leasing.requests, E2EEPreKeyPolicy.batchSize / E2EEPreKeyPolicy.sliceSize)
        XCTAssertEqual(try stored(.preKey, in: device), E2EEPreKeyPolicy.batchSize)
    }

    func test_replenishment_whoseLeaseRunsOutMidway_publishesOnlyThePersistedTranches() throws {
        let leasing = ScriptedLeasing([.grant, .grant, .refuse, .grant])
        let (device, factory) = try device(leasing: leasing)

        let request = try XCTUnwrap(try factory.replenishment(for: emptyStock, now: Date()))

        let slice = E2EEPreKeyPolicy.sliceSize
        XCTAssertEqual(request.oneTimePreKeys?.count, 2 * slice)
        XCTAssertEqual(request.kyberPreKeys?.count, 2 * slice)
        XCTAssertEqual(leasing.requests, 3, "la quatrième tranche ne démarre pas")
        XCTAssertEqual(try stored(.preKey, in: device), 2 * slice, "les tranches faites sont persistées")
        XCTAssertEqual(try stored(.kyberPreKey, in: device), 2 * slice)
        let published = Set(try XCTUnwrap(request.oneTimePreKeys).map { String($0.keyId) })
        XCTAssertEqual(published, Set(try device.vault.read { try $0.keys(of: .preKey) }), "chaque clé publiée a sa clé privée")
    }

    func test_replenishment_whoseFirstLeaseIsRefused_throws_andPersistsNothing() throws {
        let (device, factory) = try device(leasing: ScriptedLeasing([.refuse]))

        XCTAssertThrowsError(try factory.replenishment(for: emptyStock, now: Date())) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .refused)
        }
        XCTAssertEqual(try stored(.preKey, in: device), 0)
        XCTAssertEqual(try stored(.kyberPreKey, in: device), 0)
    }

    func test_enrollment_whoseLeaseRunsOutAfterTheFirstTranche_keepsItsSignedKeys() throws {
        let (device, factory) = try device(leasing: ScriptedLeasing([.grant, .refuse]))

        let request = try factory.enrollment(userId: bob, platform: .ios, label: nil, now: Date())

        XCTAssertEqual(request.oneTimePreKeys.count, E2EEPreKeyPolicy.sliceSize)
        XCTAssertEqual(request.kyberPreKeys.count, E2EEPreKeyPolicy.sliceSize)
        XCTAssertEqual(try stored(.signedPreKey, in: device), 1)
        XCTAssertEqual(try stored(.kyberLastResortMarker, in: device), 1)
    }

    /// Le stock sert encore : un réapprovisionnement refusé faute de bail
    /// n'empêche pas l'appareil de s'ouvrir, il attend le relevé suivant.
    func test_aReplenishmentRefusedForWantOfALease_neverFailsTheEnrollment() async throws {
        let server = FakeE2EEServer()
        let vault = try E2EEGRDBRecordVault(writer: DatabaseQueue(), sealingKey: SymmetricKey(size: .bits256))
        let secrets = E2EEInMemorySecretStore()
        let directory = server.client(userId: alice, sessionId: "s1")
        func registrar(_ lock: E2EEProcessLock) -> E2EEDeviceRegistrar {
            E2EEDeviceRegistrar(identities: E2EEIdentityVault(secrets: secrets), vault: vault, lock: lock, directory: directory, platform: .ios, label: "iPhone")
        }
        let enrolled = try await registrar(E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"))).ensureEnrolled(userId: alice)
        _ = server.client(userId: bob, sessionId: "b").bundlesSync(of: alice, count: 90)
        let leasing = ScriptedLeasing([.grant, .refuse])

        let reopened = try await registrar(E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: leasing)).ensureEnrolled(userId: alice)

        XCTAssertEqual(reopened.device, enrolled.device)
        XCTAssertNotEqual(directory.log.last, "publish", "rien n'est publié sans bail")
        XCTAssertEqual(leasing.requests, 2)
    }

    // MARK: - Le rattrapage des enveloppes

    func test_catchUp_stopsAtTheFirstRefusedLease_andAcknowledgesOnlyWhatOpened() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        for index in 1...4 {
            let sealed = try await aliceIPhone.sealer.seal(aliceIPhone.content("m\(index)", clientMessageId: "cid_\(index)"), to: bob)
            try server.relay(sealed, from: alice, conversationId: "conv1", participants: [alice, bob], messageId: "m\(index)")
        }
        let leasing = ScriptedLeasing([.grant, .grant, .refuse, .grant])
        let leased = E2EESessionCipher(
            local: bobIPhone.device.address,
            store: MeeshySignalProtocolStore(identity: bobIPhone.enrolled.identity, ownUserId: bob),
            vault: bobIPhone.vault,
            lock: E2EEProcessLock(path: E2EETestDevice.temporaryPath("lock"), leasing: leasing)
        )
        let opener = E2EEEnvelopeOpener(
            local: bobIPhone.device, cipher: leased, plaintexts: bobIPhone.plaintexts,
            directory: bobIPhone.directory, approvals: bobIPhone.approvals
        )

        let outcomes = try await opener.catchUp()

        XCTAssertEqual(outcomes.compactMap(\.messageId), ["m1", "m2"])
        XCTAssertEqual(outcomes.filter { if case .deferred = $0 { true } else { false } }.count, 2)
        XCTAssertEqual(leasing.requests, 3, "l'enveloppe suivante ne démarre pas")
        XCTAssertEqual(server.pending(userId: bob, deviceId: bobIPhone.device.deviceId).count, 2, "seules les ouvertes sont acquittées")
        let later = try await bobIPhone.opener.catchUp()
        XCTAssertEqual(later.compactMap(\.messageId), ["m3", "m4"], "le reste s'ouvre au rattrapage suivant")
    }

    // MARK: - Le bail d'une extension

    func test_expiringActivity_refusedByTheSystem_doesNotRunTheBody() {
        let leasing = E2EEExpiringActivityLeasing(reason: "t", grantTimeout: .seconds(1)) { _, block in
            DispatchQueue.global().async { block(true) }
        }
        var ran = false

        XCTAssertThrowsError(try leasing.withLease { _ in ran = true }) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .refused)
        }
        XCTAssertFalse(ran)
    }

    func test_expiringActivity_holdsTheActivityUntilTheBodyReturns() throws {
        let activity = ActivityProbe()
        let leasing = E2EEExpiringActivityLeasing(reason: "t", grantTimeout: .seconds(1)) { _, block in
            DispatchQueue.global().async {
                activity.begin()
                block(false)
                activity.end()
            }
        }

        let value = try leasing.withLease { lease -> Int in
            XCTAssertTrue(activity.isActive, "l'assertion tient pendant le corps")
            XCTAssertFalse(lease.isExpired)
            return 3
        }

        XCTAssertEqual(value, 3)
        XCTAssertTrue(activity.waitForEnd(), "l'assertion se rend quand le corps revient")
    }

    func test_expiringActivity_expiredDuringTheBody_marksTheLease() throws {
        let expire = Box<(@Sendable (Bool) -> Void)?>(nil)
        let leasing = E2EEExpiringActivityLeasing(reason: "t", grantTimeout: .seconds(1)) { _, block in
            expire.value = block
            DispatchQueue.global().async { block(false) }
        }

        let expiredInside = try leasing.withLease { lease -> Bool in
            expire.value?(true)
            return lease.isExpired
        }

        XCTAssertTrue(expiredInside)
    }

    func test_expiringActivity_neverAnswered_isRefusedAfterItsTimeout() {
        let leasing = E2EEExpiringActivityLeasing(reason: "t", grantTimeout: .milliseconds(50)) { _, _ in }

        XCTAssertThrowsError(try leasing.withLease { _ in }) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .refused)
        }
    }

    func test_expiringActivity_answeredAfterItsTimeout_neverHoldsTheActivity() {
        let late = Box<(@Sendable (Bool) -> Void)?>(nil)
        let leasing = E2EEExpiringActivityLeasing(reason: "t", grantTimeout: .milliseconds(20)) { _, block in late.value = block }
        XCTAssertThrowsError(try leasing.withLease { _ in })
        let returned = expectation(description: "le bloc tardif revient sans attendre")

        DispatchQueue.global().async {
            late.value?(false)
            returned.fulfill()
        }

        wait(for: [returned], timeout: 1)
    }
}

/// Un bail scripté : chaque demande consomme le verdict suivant.
final class ScriptedLeasing: E2EEExecutionLeasing, @unchecked Sendable {
    enum Verdict { case grant, refuse, expired }

    private let lock = NSLock()
    private var verdicts: [Verdict]
    private var asked = 0
    private var current: E2EELeaseState?

    init(_ verdicts: [Verdict]) { self.verdicts = verdicts }

    var requests: Int { lock.withLock { asked } }
    var isOpen: Bool { lock.withLock { current != nil } }
    func expireCurrent() { lock.withLock { current }?.expire() }

    func withLease<T>(_ body: (any E2EEExecutionLease) throws -> T) throws -> T {
        let verdict = lock.withLock { () -> Verdict in
            asked += 1
            return verdicts.isEmpty ? .refuse : verdicts.removeFirst()
        }
        guard verdict != .refuse else { throw E2EEExecutionLeaseError.refused }
        let lease = E2EELeaseState()
        _ = lease.grant()
        if verdict == .expired { lease.expire() }
        lock.withLock { current = lease }
        defer { lock.withLock { current = nil } }
        return try body(lease)
    }
}

private final class RecordingFileLock: E2EEFileLocking, @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    private let onHold: @Sendable () -> Void

    init(onHold: @escaping @Sendable () -> Void = {}) { self.onHold = onHold }

    var holds: Int { lock.withLock { count } }

    func hold<T>(_ path: String, _ body: () throws -> T) throws -> T {
        lock.withLock { count += 1 }
        onHold()
        return try body()
    }
}

private final class ActivityProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var active = false
    private let ended = DispatchSemaphore(value: 0)

    var isActive: Bool { lock.withLock { active } }
    func begin() { lock.withLock { active = true } }
    func end() {
        lock.withLock { active = false }
        ended.signal()
    }
    func waitForEnd() -> Bool { ended.wait(timeout: .now() + 1) == .success }
}

private final class Box<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Value
    init(_ value: Value) { stored = value }
    var value: Value {
        get { lock.withLock { stored } }
        set { lock.withLock { stored = newValue } }
    }
}
