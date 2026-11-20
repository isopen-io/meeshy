import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Une sauvegarde iCloud restaurée sur un AUTRE appareil du compte (#19767, #19929) : la liste qu'elle porte a été écrite
/// ailleurs. Elle s'efface avec sa marque « reçue », son démarrage et ses retraits en attente, et la relecture du partage
/// servi la reconstruit, reçue : rien de la sauvegarde ne repart, ni un arrêt ni une liste périmée. La marque de
/// l'appareil est une empreinte, jamais l'identifiant d'installation, et un trousseau illisible ne juge rien.
@MainActor
final class SharedLocationRestoredBackupTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private let me = "cccccccccccccccccccccccc"
    private let t0 = Date(timeIntervalSince1970: 1_000_000)
    private let mine = "2026-01-01T00:00:00.000Z"

    private func isolatedDefaults() -> UserDefaults {
        let suite = "sharedLocation.tests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func sharingAlice() -> SharedLocationRoster {
        SharedLocationRoster.empty.adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
    }

    private func writtenByThisDevice(
        _ defaults: UserDefaults,
        device: String,
        roster: SharedLocationRoster? = nil
    ) {
        let store = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: device, defaults: defaults)
        store.save(roster ?? sharingAlice())
        store.saveReceived(false)
        store.savePublishedStart(mine)
    }

    private final class Served {
        var snapshot: SharedLocationOwnSnapshot?
        var reads = 0
    }

    private struct Relaunch {
        let center: SharedLocationSharingCenter
        let emitter: FakeSharedLocationEmitter
        let fixes: FakeSharedLocationFixSource
        let served: Served
        let sockets: PassthroughSubject<Void, Never>
    }

    private func relaunch(on store: SharedLocationRosterStoring) -> Relaunch {
        let emitter = FakeSharedLocationEmitter()
        let fixes = FakeSharedLocationFixSource()
        let served = Served()
        let sockets = PassthroughSubject<Void, Never>()
        let center = SharedLocationSharingCenter(
            emitter: emitter, fixes: fixes, store: store, now: { [t0] in t0 },
            owner: me, currentAccount: { [me] in me }, wakes: FakeSharedLocationWakeScheduler(),
            socketReady: sockets.eraseToAnyPublisher(),
            served: {
                served.reads += 1
                return served.snapshot
            }
        )
        return Relaunch(center: center, emitter: emitter, fixes: fixes, served: served, sockets: sockets)
    }

    private func servedAlice() -> SharedLocationOwnSnapshot {
        SharedLocationOwnSnapshot(
            recipients: [SharedLocationOwnRecipient(userId: alice, precision: .exact, expiresAt: t0.addingTimeInterval(3600))],
            startedAt: "2026-01-01T00:00:05.000Z"
        )
    }

    private func settle(until condition: () -> Bool) async {
        for _ in 0..<2_000 where !condition() { await Task.yield() }
    }

    // MARK: - La liste écrite ailleurs s'efface

    func test_aBackupRestoredOnAnotherDevice_erasesTheListTheMarkAndTheStart() {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "device-A")

        let restored = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-B", defaults: defaults)

        XCTAssertNil(restored.load())
        XCTAssertFalse(restored.loadReceived())
        XCTAssertNil(restored.loadPublishedStart())
    }

    func test_aRestoredListWithAPendingWithdrawal_sendsNoStop_andNoStaleList() async {
        let defaults = isolatedDefaults()
        let withdrawing = sharingAlice()
            .adding(userId: bob, precision: .city, duration: .eightHours, now: t0)
            .withdrawing(userId: bob, now: t0)
        writtenByThisDevice(defaults, device: "device-A", roster: withdrawing)
        let restored = relaunch(on: UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-B", defaults: defaults))

        await restored.center.reconcile()

        XCTAssertEqual(restored.emitter.stops, 0)
        XCTAssertTrue(restored.emitter.starts.isEmpty)
        XCTAssertTrue(restored.emitter.updates.isEmpty)
        XCTAssertFalse(restored.fixes.isFollowing)
    }

    func test_aRestoredWithdrawalOnly_neverStopsTheShareOfTheOtherDevice() async {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "device-A", roster: sharingAlice().withdrawing(userId: alice, now: t0))
        let restored = relaunch(on: UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-B", defaults: defaults))

        await restored.center.reconcile()

        XCTAssertEqual(restored.emitter.stops, 0)
        XCTAssertTrue(restored.emitter.starts.isEmpty)
    }

    func test_anErasedList_isRebuiltByTheServedRead_asAReceivedList_thatNeverFollowsTheDevice() async {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "device-A")
        let store = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-B", defaults: defaults)
        let restored = relaunch(on: store)
        restored.served.snapshot = servedAlice()

        restored.sockets.send(())
        await settle(until: { restored.center.entry(for: alice) != nil })

        XCTAssertNotNil(restored.center.entry(for: alice))
        XCTAssertTrue(store.loadReceived())
        XCTAssertFalse(restored.fixes.isFollowing)
        XCTAssertTrue(restored.emitter.starts.isEmpty)
    }

    func test_theRebuiltList_staysReceived_onTheNextLaunch() async {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "device-A")
        let restored = relaunch(on: UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-B", defaults: defaults))
        restored.served.snapshot = servedAlice()
        restored.sockets.send(())
        await settle(until: { restored.center.entry(for: alice) != nil })

        let second = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-B", defaults: defaults)

        XCTAssertNotNil(second.load()?.entry(for: alice))
        XCTAssertTrue(second.loadReceived())
    }

    // MARK: - Le même appareil garde tout

    func test_theSameDevice_keepsItsListAndItsStart() {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "device-A")

        let relaunched = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-A", defaults: defaults)

        XCTAssertNotNil(relaunched.load()?.entry(for: alice))
        XCTAssertFalse(relaunched.loadReceived())
        XCTAssertEqual(relaunched.loadPublishedStart(), mine)
    }

    func test_aListFromBeforeTheMark_isAdoptedAsIs_andMarkedForNextTime() {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "")

        let updated = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-A", defaults: defaults)
        XCTAssertNotNil(updated.load()?.entry(for: alice))
        XCTAssertEqual(updated.loadPublishedStart(), mine)

        let restoredElsewhere = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-B", defaults: defaults)
        XCTAssertNil(restoredElsewhere.load())
        XCTAssertNil(restoredElsewhere.loadPublishedStart())
    }

    // MARK: - La marque est une empreinte

    func test_theMark_neverKeepsTheInstallationIdInTheSettings() {
        let defaults = isolatedDefaults()

        writtenByThisDevice(defaults, device: "install-secret-42")

        let kept = defaults.dictionaryRepresentation().values.compactMap { $0 as? String }
        XCTAssertFalse(kept.contains { $0.contains("install-secret-42") })
        XCTAssertEqual(
            defaults.string(forKey: "sharedLocation.roster." + me + ".device"),
            UserDefaultsSharedLocationRosterStore.deviceMark(userId: me, deviceId: "install-secret-42")
        )
    }

    func test_theMark_dependsOnTheAccountAndTheInstallation() {
        let mark = UserDefaultsSharedLocationRosterStore.deviceMark(userId: me, deviceId: "device-A")

        XCTAssertNotEqual(mark, UserDefaultsSharedLocationRosterStore.deviceMark(userId: alice, deviceId: "device-A"))
        XCTAssertNotEqual(mark, UserDefaultsSharedLocationRosterStore.deviceMark(userId: me, deviceId: "device-B"))
        XCTAssertEqual(mark.count, 64)
    }

    func test_aMarkFromBeforeTheFingerprint_isThisDevice_andIsRewrittenAsAFingerprint() {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "device-A")
        defaults.set("device-A", forKey: "sharedLocation.roster." + me + ".device")

        let updated = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-A", defaults: defaults)

        XCTAssertNotNil(updated.load()?.entry(for: alice))
        XCTAssertEqual(updated.loadPublishedStart(), mine)
        XCTAssertEqual(
            defaults.string(forKey: "sharedLocation.roster." + me + ".device"),
            UserDefaultsSharedLocationRosterStore.deviceMark(userId: me, deviceId: "device-A")
        )
    }

    func test_aMarkFromBeforeTheFingerprint_writtenElsewhere_isErased() {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "device-A")
        defaults.set("device-A", forKey: "sharedLocation.roster." + me + ".device")

        let restored = UserDefaultsSharedLocationRosterStore(userId: me, deviceId: "device-B", defaults: defaults)

        XCTAssertNil(restored.load())
    }

    // MARK: - Le branchement de production

    func test_production_marksTheListWithTheInstallationIdTheKeychainHolds() {
        let defaults = isolatedDefaults()
        let keychain = InMemoryRosterKeychain()
        try? keychain.save("install-7", forKey: "com.meeshy.push.installationId", account: nil)

        _ = SharedLocationSharingHolder.rosterStore(userId: me, keychain: keychain, defaults: defaults)

        XCTAssertEqual(
            defaults.string(forKey: "sharedLocation.roster." + me + ".device"),
            UserDefaultsSharedLocationRosterStore.deviceMark(userId: me, deviceId: "install-7")
        )
    }

    func test_production_aLockedKeychain_judgesNothing_andKeepsTheMark() {
        let defaults = isolatedDefaults()
        writtenByThisDevice(defaults, device: "device-A")
        let mark = defaults.string(forKey: "sharedLocation.roster." + me + ".device")

        let store = SharedLocationSharingHolder.rosterStore(userId: me, keychain: LockedRosterKeychain(), defaults: defaults)

        XCTAssertNotNil(store.load()?.entry(for: alice))
        XCTAssertEqual(store.loadPublishedStart(), mine)
        XCTAssertEqual(defaults.string(forKey: "sharedLocation.roster." + me + ".device"), mark)
    }
}

private final class InMemoryRosterKeychain: KeychainStoring, @unchecked Sendable {
    private var kept: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { kept[key] = value }
    func load(forKey key: String, account: String?) -> String? { kept[key] }
    func delete(forKey key: String, account: String?) { kept.removeValue(forKey: key) }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}

/// Un trousseau avant le premier déverrouillage : rien ne s'y lit, rien ne s'y écrit.
private final class LockedRosterKeychain: KeychainStoring, @unchecked Sendable {
    private struct Locked: Error {}

    func save(_ value: String, forKey key: String, account: String?) throws { throw Locked() }
    func load(forKey key: String, account: String?) -> String? { nil }
    func delete(forKey key: String, account: String?) {}
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { throw Locked() }
    func loadAsync(forKey key: String, account: String?) async -> String? { nil }
}
