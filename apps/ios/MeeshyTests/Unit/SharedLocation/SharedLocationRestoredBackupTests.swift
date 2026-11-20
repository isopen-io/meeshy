import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Une sauvegarde iCloud restaurée sur un AUTRE appareil du compte (#19767, #19929) : la liste qu'elle porte est périmée
/// et n'est pas celle de cet appareil. Elle est oubliée avec sa marque « reçue » et son démarrage, puis reconstruite,
/// REÇUE, depuis ce que la passerelle sert ; elle ne peut ni arrêter ni réduire le partage de l'appareil qui publie.
@MainActor
final class SharedLocationRestoredBackupTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private let me = "cccccccccccccccccccccccc"
    private let mine = "2026-01-01T00:00:00.000Z"
    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    private struct SUT {
        let center: SharedLocationSharingCenter
        let emitter: FakeSharedLocationEmitter
        let fixes: FakeSharedLocationFixSource
        let sockets: PassthroughSubject<Void, Never>
    }

    private func isolatedDefaults() -> UserDefaults {
        let suite = "sharedLocation.tests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func store(_ defaults: UserDefaults, device: String?) -> UserDefaultsSharedLocationRosterStore {
        UserDefaultsSharedLocationRosterStore(userId: me, deviceId: device, defaults: defaults)
    }

    private func written(_ defaults: UserDefaults, device: String, roster: SharedLocationRoster? = nil) {
        let writer = store(defaults, device: device)
        writer.save(roster ?? SharedLocationRoster.empty.adding(userId: alice, precision: .exact, duration: .eightHours, now: t0))
        writer.saveReceived(false)
        writer.savePublishedStart(mine)
    }

    private func makeSUT(store: SharedLocationRosterStoring, served: SharedLocationOwnSnapshot? = nil) -> SUT {
        let emitter = FakeSharedLocationEmitter()
        let fixes = FakeSharedLocationFixSource()
        let sockets = PassthroughSubject<Void, Never>()
        let t0 = self.t0
        let me = self.me
        let center = SharedLocationSharingCenter(
            emitter: emitter, fixes: fixes, store: store, now: { t0 }, owner: me, currentAccount: { me },
            wakes: FakeSharedLocationWakeScheduler(), socketReady: sockets.eraseToAnyPublisher(),
            served: { served }
        )
        return SUT(center: center, emitter: emitter, fixes: fixes, sockets: sockets)
    }

    private func servedAlice() -> SharedLocationOwnSnapshot {
        SharedLocationOwnSnapshot(recipients: [
            SharedLocationOwnRecipient(userId: alice, precision: .exact, expiresAt: t0.addingTimeInterval(3600))
        ])
    }

    // MARK: - La liste écrite ailleurs est oubliée

    func test_aBackupRestoredOnAnotherDevice_forgetsTheList_theMarkAndTheStart() {
        let defaults = isolatedDefaults()
        written(defaults, device: "device-A")

        let restored = store(defaults, device: "device-B")

        XCTAssertNil(restored.load())
        XCTAssertFalse(restored.loadReceived())
        XCTAssertNil(restored.loadPublishedStart())
    }

    func test_aRestoredBackup_carryingOnlyAPendingWithdrawal_sendsNothing() async {
        let defaults = isolatedDefaults()
        let withdrawing = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
            .withdrawing(userId: alice, now: t0)
        written(defaults, device: "device-A", roster: withdrawing)
        let sut = makeSUT(store: store(defaults, device: "device-B"), served: servedAlice())

        await sut.center.reconcile()

        XCTAssertEqual(sut.emitter.stops, 0)
        XCTAssertTrue(sut.emitter.starts.isEmpty)
        XCTAssertTrue(sut.emitter.updates.isEmpty)
    }

    func test_aRestoredBackup_withRecipientsAndAWithdrawal_neverRepublishesTheStaleList() async {
        let defaults = isolatedDefaults()
        let stale = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
            .adding(userId: bob, precision: .city, duration: .eightHours, now: t0)
            .withdrawing(userId: bob, now: t0)
        written(defaults, device: "device-A", roster: stale)
        let sut = makeSUT(store: store(defaults, device: "device-B"), served: servedAlice())

        await sut.center.reconcile()

        XCTAssertTrue(sut.emitter.starts.isEmpty)
        XCTAssertEqual(sut.emitter.stops, 0)
    }

    func test_aRestoredBackup_isRebuiltReceived_fromWhatTheGatewayServes() async {
        let defaults = isolatedDefaults()
        written(defaults, device: "device-A")
        let restored = store(defaults, device: "device-B")
        let sut = makeSUT(store: restored, served: servedAlice())
        XCTAssertNil(sut.center.entry(for: alice))

        await sut.center.sync()

        XCTAssertNotNil(sut.center.entry(for: alice))
        XCTAssertTrue(restored.loadReceived())
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertTrue(sut.emitter.starts.isEmpty)
    }

    func test_aRebuiltList_staysReceived_onTheSecondLaunch() async {
        let defaults = isolatedDefaults()
        written(defaults, device: "device-A")
        let sut = makeSUT(store: store(defaults, device: "device-B"), served: servedAlice())
        await sut.center.sync()

        let second = store(defaults, device: "device-B")

        XCTAssertNotNil(second.load()?.entry(for: alice))
        XCTAssertTrue(second.loadReceived())
    }

    // MARK: - Le même appareil garde tout

    func test_theSameDevice_keepsItsListAndItsStart() {
        let defaults = isolatedDefaults()
        written(defaults, device: "device-A")

        let relaunched = store(defaults, device: "device-A")

        XCTAssertNotNil(relaunched.load()?.entry(for: alice))
        XCTAssertFalse(relaunched.loadReceived())
        XCTAssertEqual(relaunched.loadPublishedStart(), mine)
    }

    func test_aListFromBeforeTheMark_isAdoptedAsIs_andForgottenIfRestoredElsewhereLater() {
        let defaults = isolatedDefaults()
        written(defaults, device: "")

        let updated = store(defaults, device: "device-A")
        XCTAssertNotNil(updated.load()?.entry(for: alice))
        XCTAssertEqual(updated.loadPublishedStart(), mine)

        let restoredElsewhere = store(defaults, device: "device-B")
        XCTAssertNil(restoredElsewhere.load())
        XCTAssertNil(restoredElsewhere.loadPublishedStart())
    }

    // MARK: - L'identifiant d'installation ne part pas dans la sauvegarde

    func test_theMark_neverCarriesTheInstallationIdInClear() {
        let defaults = isolatedDefaults()
        written(defaults, device: "device-A")

        let mark = defaults.string(forKey: "sharedLocation.roster." + me + ".device")

        XCTAssertNotNil(mark)
        XCTAssertFalse(mark?.contains("device-A") ?? true)
        XCTAssertEqual(mark, UserDefaultsSharedLocationRosterStore.mark(userId: me, device: "device-A"))
    }

    func test_aMarkInClear_fromBeforeTheFingerprint_isThisDevice_andIsRewritten() {
        let defaults = isolatedDefaults()
        written(defaults, device: "device-A")
        defaults.set("device-A", forKey: "sharedLocation.roster." + me + ".device")

        let relaunched = store(defaults, device: "device-A")

        XCTAssertNotNil(relaunched.load()?.entry(for: alice))
        XCTAssertEqual(relaunched.loadPublishedStart(), mine)
        XCTAssertEqual(defaults.string(forKey: "sharedLocation.roster." + me + ".device"),
                       UserDefaultsSharedLocationRosterStore.mark(userId: me, device: "device-A"))
    }

    func test_aMarkInClear_fromAnotherDevice_isForgottenOnRestore() {
        let defaults = isolatedDefaults()
        written(defaults, device: "device-A")
        defaults.set("device-A", forKey: "sharedLocation.roster." + me + ".device")

        let restored = store(defaults, device: "device-B")

        XCTAssertNil(restored.load())
        XCTAssertNil(restored.loadPublishedStart())
    }

    func test_anotherAccountsMark_onTheSameDevice_isNotThisAccounts() {
        XCTAssertNotEqual(UserDefaultsSharedLocationRosterStore.mark(userId: me, device: "device-A"),
                          UserDefaultsSharedLocationRosterStore.mark(userId: alice, device: "device-A"))
    }

    // MARK: - Le branchement de production

    func test_production_anUnreadableKeychain_neverForgetsTheListOfTheDeviceThatPublishes() {
        let defaults = isolatedDefaults()
        let keptHere = InMemoryInstallationKeychain()
        _ = SharedLocationSharingHolder.rosterStore(userId: me, keychain: keptHere, vendorId: { "device-A" }, defaults: defaults)
        written(defaults, device: "device-A")

        let locked = SharedLocationSharingHolder.rosterStore(
            userId: me, keychain: LockedInstallationKeychain(), vendorId: { "device-PASSING" }, defaults: defaults
        )

        XCTAssertNotNil(locked.load()?.entry(for: alice))
        XCTAssertEqual(locked.loadPublishedStart(), mine)
        XCTAssertNotNil(SharedLocationSharingHolder.rosterStore(
            userId: me, keychain: keptHere, vendorId: { "device-PASSING" }, defaults: defaults
        ).load()?.entry(for: alice))
    }

    func test_production_aRestoreOnAnotherDevice_forgetsTheList() {
        let defaults = isolatedDefaults()
        let keychainA = InMemoryInstallationKeychain()
        let writer = SharedLocationSharingHolder.rosterStore(userId: me, keychain: keychainA, vendorId: { "device-A" }, defaults: defaults)
        writer.save(SharedLocationRoster.empty.adding(userId: alice, precision: .exact, duration: .eightHours, now: t0))

        let restored = SharedLocationSharingHolder.rosterStore(
            userId: me, keychain: InMemoryInstallationKeychain(), vendorId: { "device-B" }, defaults: defaults
        )

        XCTAssertNil(restored.load())
    }
}

private final class InMemoryInstallationKeychain: KeychainStoring, @unchecked Sendable {
    private var values: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { values[key] = value }
    func load(forKey key: String, account: String?) -> String? { values[key] }
    func delete(forKey key: String, account: String?) { values.removeValue(forKey: key) }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { values[key] = value }
    func loadAsync(forKey key: String, account: String?) async -> String? { values[key] }
}

/// Le trousseau avant le premier déverrouillage : rien ne s'y lit, rien ne s'y écrit.
private final class LockedInstallationKeychain: KeychainStoring, @unchecked Sendable {
    struct Locked: Error {}

    func save(_ value: String, forKey key: String, account: String?) throws { throw Locked() }
    func load(forKey key: String, account: String?) -> String? { nil }
    func delete(forKey key: String, account: String?) {}
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { throw Locked() }
    func loadAsync(forKey key: String, account: String?) async -> String? { nil }
}
