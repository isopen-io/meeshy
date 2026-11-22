import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Une sauvegarde iCloud restaurée sur un AUTRE appareil du compte (#19767, #19929) : la liste qu'elle porte a été écrite
/// ailleurs. Elle s'efface avec sa marque « reçue », son démarrage et ses retraits en attente, et la relecture du partage
/// servi la reconstruit, reçue : rien de la sauvegarde ne repart, ni un arrêt ni une liste périmée. La marque de
/// l'appareil est une empreinte, jamais l'identifiant d'installation, et un trousseau illisible ne juge rien.
/// Un appareil qui n'a encore rien relu (installation neuve, sauvegarde effacée, relecture en panne) relit avant de
/// composer une liste : « Partager » et « Arrêter » réunissent le partage lancé ailleurs (#20055, #19999).
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
        var outage: Error?
        var reads = 0
    }

    private struct Outage: Error {}

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
                if let outage = served.outage { throw outage }
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

    // MARK: - Un appareil qui n'a rien relu relit avant de composer (#20055, #19999)

    private let carol = "dddddddddddddddddddddddd"

    private func servedElsewhere(_ people: [String]) -> SharedLocationOwnSnapshot {
        SharedLocationOwnSnapshot(
            recipients: people.map {
                SharedLocationOwnRecipient(userId: $0, precision: .exact, expiresAt: t0.addingTimeInterval(3600))
            },
            startedAt: "2026-01-01T00:00:05.000Z"
        )
    }

    func test_share_onAFreshInstall_readsFirst_andTheListSentKeepsWhatAnotherDeviceShares() async {
        let restored = relaunch(on: FakeSharedLocationRosterStore())
        restored.served.snapshot = servedElsewhere([alice])

        let problem = await restored.center.share(with: carol, precision: .city, duration: .oneHour)

        XCTAssertNil(problem)
        XCTAssertEqual(restored.served.reads, 1)
        XCTAssertEqual(Set(restored.emitter.starts.last?.recipients.map(\.userId) ?? []), [alice, carol])
    }

    func test_share_onAFreshInstall_aReadOutage_refusesAndSendsNothing() async {
        let restored = relaunch(on: FakeSharedLocationRosterStore())
        restored.served.outage = Outage()

        let problem = await restored.center.share(with: carol, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .refused(.offline))
        XCTAssertTrue(restored.emitter.starts.isEmpty)
        XCTAssertTrue(restored.center.roster.isEmpty)
        XCTAssertFalse(restored.fixes.isFollowing)
    }

    func test_share_afterARead_doesNotReadAgain() async {
        let restored = relaunch(on: FakeSharedLocationRosterStore())
        restored.served.snapshot = servedElsewhere([alice])
        _ = await restored.center.share(with: carol, precision: .city, duration: .oneHour)

        _ = await restored.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(restored.served.reads, 1)
    }

    func test_stop_onARelaunchBeforeTheRead_keepsThePersonAddedOnAnotherDevice() async {
        let store = FakeSharedLocationRosterStore()
        store.save(sharingAlice().adding(userId: bob, precision: .city, duration: .eightHours, now: t0))
        store.publishedStart = mine
        let relaunched = relaunch(on: store)
        relaunched.served.snapshot = servedElsewhere([alice, bob, carol])

        let problem = await relaunched.center.stopSharing(with: bob)

        XCTAssertNil(problem)
        XCTAssertEqual(relaunched.served.reads, 1)
        XCTAssertEqual(relaunched.emitter.stops, 0)
        XCTAssertTrue(relaunched.emitter.starts.allSatisfy(\.isListOnly))
        XCTAssertEqual(Set(relaunched.emitter.starts.last?.recipients.map(\.userId) ?? []), [alice, carol])
        XCTAssertNil(relaunched.center.entry(for: bob))
        XCTAssertNotNil(relaunched.center.entry(for: carol))
    }

    func test_stop_onARelaunchBeforeTheRead_theLastLocalPerson_neverStopsTheShareOfAnotherDevice() async {
        let store = FakeSharedLocationRosterStore()
        store.save(sharingAlice())
        store.publishedStart = mine
        let relaunched = relaunch(on: store)
        relaunched.served.snapshot = servedElsewhere([alice, carol])

        _ = await relaunched.center.stopSharing(with: alice)

        XCTAssertEqual(relaunched.emitter.stops, 0)
        XCTAssertEqual(relaunched.emitter.starts.last?.recipients.map(\.userId), [carol])
        XCTAssertTrue(relaunched.emitter.updates.isEmpty)
    }

    func test_share_aReadOutageAfterASuccessfulRead_readsAgain_andRefusesWhileItLasts() async {
        let restored = relaunch(on: FakeSharedLocationRosterStore())
        restored.served.snapshot = servedElsewhere([alice])
        _ = await restored.center.share(with: carol, precision: .city, duration: .oneHour)
        let startsBefore = restored.emitter.starts.count
        restored.served.outage = Outage()
        restored.sockets.send(())
        await settle(until: { restored.served.reads >= 2 })

        let problem = await restored.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .refused(.offline))
        XCTAssertEqual(restored.served.reads, 3)
        XCTAssertEqual(restored.emitter.starts.count, startsBefore)
    }

    func test_stop_onARelaunch_aReadOutage_stillSendsTheWithdrawalAsTheListAlone() async {
        let store = FakeSharedLocationRosterStore()
        store.save(sharingAlice().adding(userId: bob, precision: .city, duration: .eightHours, now: t0))
        store.publishedStart = mine
        let relaunched = relaunch(on: store)
        relaunched.served.outage = Outage()

        _ = await relaunched.center.stopSharing(with: bob)

        XCTAssertEqual(relaunched.emitter.starts.last?.recipients.map(\.userId), [alice])
        XCTAssertEqual(relaunched.emitter.starts.last?.isListOnly, true)
        XCTAssertEqual(relaunched.emitter.stops, 0)
    }

    func test_stop_onARelaunch_theReadYieldsToAnotherDevice_aGatewayBeforeTheListAlone_stopsWithoutThisDevicesPosition() async {
        let store = FakeSharedLocationRosterStore()
        store.save(sharingAlice())
        store.publishedStart = mine
        let relaunched = relaunch(on: store)
        relaunched.served.snapshot = servedElsewhere([alice, carol])
        relaunched.emitter.queuedStartVerdicts = [.refused(.invalid)]

        _ = await relaunched.center.stopSharing(with: alice)

        XCTAssertEqual(relaunched.emitter.stops, 1)
        XCTAssertTrue(relaunched.emitter.starts.allSatisfy(\.isListOnly))
        XCTAssertTrue(relaunched.emitter.updates.isEmpty)
        XCTAssertEqual(relaunched.fixes.silentReads, 0)
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

// MARK: - La source servie (#20087), rangée ici : un fichier de test neuf exige un projet régénéré sur macOS.

/// LA SOURCE SERVIE (#20087) : la passerelle dit si le partage du compte montre un point CHOISI à la main ou la
/// position d'un appareil. Un appareil qui réunit ce partage ne fait jamais passer un destinataire d'un point choisi à
/// sa position réelle sans que l'utilisateur le demande, et ne suit pas sa position pour un point qu'il ne montre pas.
@MainActor
final class SharedLocationServedSourceTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private let carol = "dddddddddddddddddddddddd"
    private let me = "cccccccccccccccccccccccc"
    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    private final class Served {
        var snapshot: SharedLocationOwnSnapshot?
        var reads = 0
    }

    private final class Clock {
        var now: Date
        init(_ now: Date) { self.now = now }
    }

    private struct SUT {
        let center: SharedLocationSharingCenter
        let emitter: FakeSharedLocationEmitter
        let fixes: FakeSharedLocationFixSource
        let store: FakeSharedLocationRosterStore
        let served: Served
        let clock: Clock
    }

    private func makeSUT(store: FakeSharedLocationRosterStore = FakeSharedLocationRosterStore()) -> SUT {
        let emitter = FakeSharedLocationEmitter()
        let fixes = FakeSharedLocationFixSource()
        let served = Served()
        let clock = Clock(t0)
        let me = self.me
        let center = SharedLocationSharingCenter(
            emitter: emitter, fixes: fixes, store: store, now: { clock.now }, owner: me, currentAccount: { me },
            wakes: FakeSharedLocationWakeScheduler(), served: { served.reads += 1; return served.snapshot }
        )
        return SUT(center: center, emitter: emitter, fixes: fixes, store: store, served: served, clock: clock)
    }

    private func served(
        _ people: [String],
        source: SharedLocationPositionSource?,
        startedAt: String? = nil
    ) -> SharedLocationOwnSnapshot {
        SharedLocationOwnSnapshot(
            recipients: people.map { SharedLocationOwnRecipient(userId: $0, precision: .city, expiresAt: t0.addingTimeInterval(3600)) },
            acceptsManualSource: true, startedAt: startedAt, source: source
        )
    }

    private func settle() async {
        for _ in 0..<500 { await Task.yield() }
    }

    // MARK: - La liste réunie

    func test_withServed_aServedChosenPoint_staysAChosenPointHere() {
        let roster = SharedLocationRoster.empty.withServed(served([alice], source: .manual), now: t0)

        XCTAssertTrue(roster.isFixedPoint)
    }

    func test_withServed_aServedDevicePosition_isNoLongerAChosenPoint() {
        let local = SharedLocationRoster.empty.adding(userId: alice, precision: .city, duration: .oneHour, now: t0).withFixedPoint(true)

        XCTAssertFalse(local.withServed(served([alice], source: .device), now: t0).isFixedPoint)
    }

    func test_withServed_aGatewayThatNamesNoSource_keepsMine() {
        let local = SharedLocationRoster.empty.adding(userId: alice, precision: .city, duration: .oneHour, now: t0).withFixedPoint(true)

        XCTAssertTrue(local.withServed(served([alice], source: nil), now: t0).isFixedPoint)
        XCTAssertFalse(SharedLocationRoster.empty.withServed(served([alice], source: nil), now: t0).isFixedPoint)
    }

    // MARK: - « Partager » devant un point choisi ailleurs

    func test_sharingFromTheDevice_inFrontOfAPointChosenElsewhere_sendsNothingAndAsks() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual)
        await sut.center.sync()

        let problem = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem?.pointReplacement?.recipientIds, [alice])
        XCTAssertTrue(sut.emitter.starts.isEmpty)
        XCTAssertEqual(sut.fixes.asks, 0)
        XCTAssertNil(sut.center.entry(for: bob))
    }

    func test_aFirstShare_readsTheServedSourceBeforeComposing() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual)

        let problem = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem?.pointReplacement?.recipientIds, [alice])
        XCTAssertTrue(sut.emitter.starts.isEmpty)
    }

    func test_confirmingTheReplacement_sendsTheRealPositionToEveryone_sayingItsSource() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual)
        await sut.center.sync()

        let asked = await sut.center.share(with: bob, precision: .city, duration: .oneHour)?.pointReplacement
        let problem = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacing: asked)

        XCTAssertNotNil(asked)
        XCTAssertNil(problem)
        let sent = sut.emitter.starts.last
        XCTAssertEqual(Set(sent?.recipients.map(\.userId) ?? []), [alice, bob])
        XCTAssertEqual(sent?.source, .device)
        XCTAssertEqual(sent?.replacesChosenPoint, true)
        XCTAssertEqual(sent?.wire["source"] as? String, "device")
        XCTAssertFalse(sut.center.roster.isFixedPoint)
        XCTAssertTrue(sut.fixes.isFollowing)
    }

    func test_anOrdinaryShare_neverNamesItsSource() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .device)
        await sut.center.sync()

        _ = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(sut.emitter.starts.last?.replacesChosenPoint, false)
        XCTAssertNil(sut.emitter.starts.last?.wire["source"])
    }

    // MARK: - Un autre appareil choisit un point pendant que celui-ci publie

    /// L'accusé du démarrage d'ici n'a pas dit `startedAt` (accusé perdu, ou passerelle qui ne le dit pas) : le démarrage
    /// servi est pris pour le sien, et seule la source dit que ce n'est plus sa position qui est montrée.
    private func publishingWithoutKnownStart() async -> SUT {
        let sut = makeSUT()
        _ = await sut.center.share(with: alice, precision: .city, duration: .oneHour)
        XCTAssertTrue(sut.fixes.isFollowing)
        return sut
    }

    func test_aPointChosenElsewhereWhileThisDevicePublishes_stopsFollowingTheDevice() async {
        let sut = await publishingWithoutKnownStart()

        sut.served.snapshot = served([alice], source: .manual, startedAt: "2026-01-01T00:00:05.000Z")
        await sut.center.sync()
        sut.fixes.subject.send(SharedLocationFix(latitude: 45, longitude: 5)!)
        await settle()

        XCTAssertTrue(sut.center.roster.isFixedPoint)
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertTrue(sut.emitter.updates.isEmpty)
    }

    // MARK: - Une liste qui ignorait encore le point choisi (refus `SHARED_LOCATION_FIXED_POINT`)

    func test_aMoveRefusedAsAChosenPoint_stopsFollowing_andReadsTheServedShare() async {
        let sut = await publishingWithoutKnownStart()
        sut.served.snapshot = served([alice], source: .manual)
        sut.emitter.updateVerdict = .refused(.fixedPoint)
        let reads = sut.served.reads
        sut.clock.now = t0.addingTimeInterval(120)

        await sut.center.didMove(to: SharedLocationFix(latitude: 45, longitude: 5)!)

        XCTAssertEqual(sut.emitter.updates.count, 1)
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertGreaterThan(sut.served.reads, reads)
        XCTAssertTrue(sut.center.roster.isFixedPoint)
    }

    func test_aShareRefusedAsAChosenPoint_readsTheServedShare_andAsks() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .device)
        await sut.center.sync()
        sut.served.snapshot = served([alice], source: .manual)
        sut.emitter.startVerdict = .refused(.fixedPoint)

        let problem = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem?.pointReplacement?.recipientIds, [alice])
        XCTAssertTrue(sut.center.roster.isFixedPoint)
        XCTAssertNil(sut.center.entry(for: bob))
    }

    // MARK: - La confirmation vaut pour le partage montré (#20127)

    private func question(_ sut: SUT) async -> SharedLocationPointReplacement? {
        await sut.center.share(with: bob, precision: .city, duration: .oneHour)?.pointReplacement
    }

    func test_theQuestion_describesTheServedShare_itsStartAndThoseWhoSeeThePoint() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice, carol], source: .manual, startedAt: "S1")

        let asked = await question(sut)

        XCTAssertEqual(asked, SharedLocationPointReplacement(startedAt: "S1", recipientIds: [alice, carol]))
    }

    func test_confirming_afterSomeoneWasAddedElsewhere_sendsNothing_andAsksAgainNamingThem() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual, startedAt: "S1")
        let asked = await question(sut)
        sut.served.snapshot = served([alice, carol], source: .manual, startedAt: "S1")

        let problem = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacing: asked)

        XCTAssertEqual(problem?.pointReplacement?.recipientIds, [alice, carol])
        XCTAssertTrue(sut.emitter.starts.isEmpty)
        XCTAssertEqual(sut.fixes.asks, 0)
        XCTAssertTrue(sut.center.roster.isFixedPoint)
    }

    func test_confirming_afterAnotherStart_sendsNothing_andAsksAgain() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual, startedAt: "S1")
        let asked = await question(sut)
        sut.served.snapshot = served([alice], source: .manual, startedAt: "S2")

        let problem = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacing: asked)

        XCTAssertEqual(problem?.pointReplacement?.startedAt, "S2")
        XCTAssertTrue(sut.emitter.starts.isEmpty)
    }

    func test_confirming_rereadsTheServedShare_evenWhenAlreadyRead() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual, startedAt: "S1")
        let asked = await question(sut)
        let reads = sut.served.reads

        _ = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacing: asked)

        XCTAssertGreaterThan(sut.served.reads, reads)
    }

    func test_confirming_afterSomeoneLeft_stillReplacesThePoint() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice, carol], source: .manual, startedAt: "S1")
        let asked = await question(sut)
        sut.served.snapshot = served([alice], source: .manual, startedAt: "S1")

        let problem = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacing: asked)

        XCTAssertNil(problem)
        XCTAssertEqual(Set(sut.emitter.starts.last?.recipients.map(\.userId) ?? []), [alice, bob])
        XCTAssertEqual(sut.emitter.starts.last?.replacesChosenPoint, true)
    }

    func test_anAnswerToAnotherShare_neverReplacesThePoint() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual, startedAt: "S1")
        let stale = SharedLocationPointReplacement(startedAt: "S0", recipientIds: [alice])

        let problem = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacing: stale)

        XCTAssertNotNil(problem?.pointReplacement)
        XCTAssertTrue(sut.emitter.starts.isEmpty)
    }

    func test_theAudience_namesThreeKnownPeopleAtMost_andCountsTheRest() {
        let asked = SharedLocationPointReplacement(startedAt: nil, recipientIds: [alice, bob, carol, me, "eeeeeeeeeeeeeeeeeeeeeeee"])
        let known = [(userId: "ffffffffffffffffffffffff", name: "Zoé"), (userId: alice.uppercased(), name: "Alice"),
                     (userId: bob, name: "Bob"), (userId: carol, name: "Carol"), (userId: me, name: "Moi")]

        let audience = asked.audience(knownNames: known)

        XCTAssertEqual(audience.named, ["Alice", "Bob", "Carol"])
        XCTAssertEqual(audience.others, 2)
    }

    func test_theMessage_namesThosePeople() {
        let message = ShareMyLocationCopy.replacePointMessage((named: ["Alice", "Bob"], others: 0))

        XCTAssertTrue(message.contains("Alice"))
        XCTAssertTrue(message.contains("Bob"))
        XCTAssertNotEqual(message, ShareMyLocationCopy.replacePointMessage)
    }

    func test_aGatewayThatNamesNoStart_stillAsksAgainWhenSomeoneWasAdded() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual)
        let asked = await question(sut)
        sut.served.snapshot = served([alice, carol], source: .manual)

        let problem = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacing: asked)

        XCTAssertNil(asked?.startedAt)
        XCTAssertEqual(problem?.pointReplacement?.recipientIds, [alice, carol])
        XCTAssertTrue(sut.emitter.starts.isEmpty)
    }

    func test_aConfirmationRefusedAsAChosenPoint_asksAgainWithTheServedShare() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual, startedAt: "S1")
        let asked = await question(sut)
        sut.emitter.startVerdict = .refused(.fixedPoint)
        let reread = SharedLocationPointReplacement(startedAt: "S1", recipientIds: [alice])

        let problem = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacing: asked)

        XCTAssertEqual(asked, reread)
        XCTAssertEqual(problem?.pointReplacement, reread)
        XCTAssertNil(sut.center.entry(for: bob))
    }

    func test_theMessage_countsThoseItDoesNotName() {
        let message = ShareMyLocationCopy.replacePointMessage((named: ["Alice"], others: 2))

        XCTAssertTrue(message.contains("Alice"))
        XCTAssertTrue(message.contains(ShareMyLocationCopy.replacePointOthers(2)))
    }
}
