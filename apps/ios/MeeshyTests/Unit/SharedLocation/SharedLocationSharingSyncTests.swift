import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Plusieurs appareils d'un compte, UN partage (#18389, #18578) : la passerelle fait foi. À chaque socket accrochée et à
/// chaque `location:share-own-changed`, le centre relit ce qu'elle sert et s'y recale, ses retraits en attente gagnants.
/// Une liste REÇUE d'un autre appareil ne fait jamais partir la position d'ici.
@MainActor
final class SharedLocationSharingSyncTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private let me = "cccccccccccccccccccccccc"
    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    private final class Served {
        var snapshot: SharedLocationOwnSnapshot?
        var reads = 0
    }

    private struct SUT {
        let center: SharedLocationSharingCenter
        let emitter: FakeSharedLocationEmitter
        let fixes: FakeSharedLocationFixSource
        let store: FakeSharedLocationRosterStore
        let served: Served
        let sockets: PassthroughSubject<Void, Never>
        let ownChanged: PassthroughSubject<Void, Never>
        let wakes: FakeSharedLocationWakeScheduler
    }

    private func makeSUT(
        store: FakeSharedLocationRosterStore = FakeSharedLocationRosterStore(),
        served: Served = Served()
    ) -> SUT {
        let emitter = FakeSharedLocationEmitter()
        let fixes = FakeSharedLocationFixSource()
        let sockets = PassthroughSubject<Void, Never>()
        let ownChanged = PassthroughSubject<Void, Never>()
        let wakes = FakeSharedLocationWakeScheduler()
        let t0 = self.t0
        let me = self.me
        let center = SharedLocationSharingCenter(
            emitter: emitter,
            fixes: fixes,
            store: store,
            now: { t0 },
            owner: me,
            currentAccount: { me },
            wakes: wakes,
            socketReady: sockets.eraseToAnyPublisher(),
            ownChanged: ownChanged.eraseToAnyPublisher(),
            served: {
                served.reads += 1
                return served.snapshot
            }
        )
        return SUT(center: center, emitter: emitter, fixes: fixes, store: store, served: served,
                   sockets: sockets, ownChanged: ownChanged, wakes: wakes)
    }

    private func snapshot(_ people: [(String, SharedLocationPrecision, TimeInterval)]) -> SharedLocationOwnSnapshot {
        SharedLocationOwnSnapshot(recipients: people.map {
            SharedLocationOwnRecipient(userId: $0.0, precision: $0.1, expiresAt: t0.addingTimeInterval($0.2))
        })
    }

    private func settle(until condition: () -> Bool) async {
        for _ in 0..<2_000 where !condition() { await Task.yield() }
    }

    // MARK: - La liste servie

    func test_withServed_adoptsThePeopleAndDeadlinesTheGatewayServes() {
        let mine = SharedLocationRoster.empty.adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)

        let next = mine.withServed(snapshot([(bob, .city, 1800)]), now: t0)

        XCTAssertNil(next.entry(for: alice))
        XCTAssertEqual(next.entry(for: bob), SharedLocationRoster.Entry(precision: .city, until: t0.addingTimeInterval(1800)))
    }

    func test_withServed_aPendingWithdrawalWins_whileTheGatewayStillServesThePerson() {
        let mine = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
            .withdrawing(userId: alice, now: t0)

        let next = mine.withServed(snapshot([(alice, .exact, 3600)]), now: t0)

        XCTAssertNil(next.entry(for: alice))
        XCTAssertTrue(next.isWithdrawalPending(for: alice))
    }

    func test_withServed_aWithdrawalTheGatewayNoLongerServes_isSettled() {
        let mine = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
            .withdrawing(userId: alice, now: t0)

        let next = mine.withServed(snapshot([]), now: t0)

        XCTAssertTrue(next.isEmpty)
    }

    func test_withServed_skipsPassedDeadlinesAndUnreadableIds() {
        let next = SharedLocationRoster.empty.withServed(snapshot([(alice, .exact, 0), ("pas-un-id", .city, 600), (bob.uppercased(), .exact, 600)]), now: t0)

        XCTAssertNil(next.entry(for: alice))
        XCTAssertNotNil(next.entry(for: bob))
        XCTAssertEqual(next.recipients.map(\.userId), [bob])
    }

    // MARK: - Se recaler

    func test_socketReady_aRemovalMadeOnAnotherDevice_appliesHere_andIsNotRepublished() async {
        let sut = makeSUT()
        _ = await sut.center.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.center.share(with: bob, precision: .city, duration: .eightHours)
        let startsBefore = sut.emitter.starts.count
        sut.served.snapshot = snapshot([(bob, .city, TimeInterval(8 * 3600))])

        sut.sockets.send(())
        await settle(until: { sut.center.entry(for: alice) == nil })

        XCTAssertNil(sut.center.entry(for: alice))
        XCTAssertNotNil(sut.center.entry(for: bob))
        XCTAssertEqual(sut.emitter.starts.count, startsBefore)

        _ = await sut.center.share(with: me.replacingOccurrences(of: "c", with: "d"), precision: .city, duration: .oneHour)
        XCTAssertFalse(sut.emitter.starts.last?.recipients.map(\.userId).contains(alice) ?? true)
    }

    func test_ownChanged_anAdditionMadeElsewhere_isKept_andTheNextShareDoesNotEraseIt() async {
        let sut = makeSUT()
        _ = await sut.center.share(with: alice, precision: .exact, duration: .eightHours)
        sut.served.snapshot = snapshot([(alice, .exact, TimeInterval(8 * 3600)), (bob, .neighborhood, 3600)])

        sut.ownChanged.send(())
        await settle(until: { sut.center.entry(for: bob) != nil })
        _ = await sut.center.share(with: alice, precision: .city, duration: .eightHours)

        XCTAssertEqual(Set(sut.emitter.starts.last?.recipients.map(\.userId) ?? []), [alice, bob])
    }

    func test_sync_aFailedRead_changesNothing() async {
        let sut = makeSUT()
        _ = await sut.center.share(with: alice, precision: .exact, duration: .eightHours)
        sut.served.snapshot = nil

        await sut.center.sync()

        XCTAssertNotNil(sut.center.entry(for: alice))
        XCTAssertTrue(sut.fixes.isFollowing)
    }

    func test_sync_theGatewayStoppedEverything_stopsFollowingHere() async {
        let sut = makeSUT()
        _ = await sut.center.share(with: alice, precision: .exact, duration: .eightHours)
        sut.served.snapshot = snapshot([])

        await sut.center.sync()

        XCTAssertNil(sut.center.entry(for: alice))
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertNil(sut.store.kept)
    }

    func test_sync_keepsMyPendingWithdrawal_andReplaysIt() async {
        let sut = makeSUT()
        _ = await sut.center.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.center.share(with: bob, precision: .city, duration: .eightHours)
        sut.emitter.startVerdict = .refused(.offline)
        let problem = await sut.center.stopSharing(with: alice)
        XCTAssertEqual(problem, .withdrawalPending)
        sut.served.snapshot = snapshot([(alice, .exact, TimeInterval(8 * 3600)), (bob, .city, TimeInterval(8 * 3600))])
        sut.emitter.startVerdict = .started(expiresAt: t0.addingTimeInterval(8 * 3600))

        sut.sockets.send(())
        await settle(until: { !sut.center.roster.hasPendingWithdrawals })

        XCTAssertNil(sut.center.entry(for: alice))
        XCTAssertEqual(sut.emitter.starts.last?.recipients.map(\.userId), [bob])
    }

    // MARK: - Une liste reçue ne publie pas d'ici

    func test_aListReceivedFromAnotherDevice_neverSendsThisDevicesPosition() async {
        let sut = makeSUT()
        sut.served.snapshot = snapshot([(alice, .exact, 3600)])

        await sut.center.sync()
        sut.fixes.subject.send(SharedLocationFix(latitude: 45, longitude: 5)!)
        await settle(until: { false })

        XCTAssertNotNil(sut.center.entry(for: alice))
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertTrue(sut.emitter.updates.isEmpty)
        XCTAssertTrue(sut.emitter.starts.isEmpty)
        XCTAssertTrue(sut.store.received)
    }

    func test_aReceivedList_survivesARelaunch_withoutFollowing() async {
        let store = FakeSharedLocationRosterStore()
        let first = makeSUT(store: store)
        first.served.snapshot = snapshot([(alice, .exact, 3600)])
        await first.center.sync()

        let relaunched = makeSUT(store: store)

        XCTAssertNotNil(relaunched.center.entry(for: alice))
        XCTAssertFalse(relaunched.fixes.isFollowing)
    }

    func test_aReceivedList_settlesItsDeadlineWithoutSending() async {
        let store = FakeSharedLocationRosterStore()
        let first = makeSUT(store: store)
        first.served.snapshot = snapshot([(alice, .exact, 1), (bob, .city, 3600)])
        await first.center.sync()
        XCTAssertNotNil(first.center.entry(for: alice))

        let later = SharedLocationSharingCenter(
            emitter: first.emitter, fixes: first.fixes, store: store,
            now: { [t0] in t0.addingTimeInterval(10) }, owner: me, currentAccount: { [me] in me },
            wakes: first.wakes
        )
        await later.reconcile()

        XCTAssertNil(later.entry(for: alice))
        XCTAssertNotNil(later.entry(for: bob))
        XCTAssertTrue(first.emitter.starts.isEmpty)
        XCTAssertEqual(first.emitter.stops, 0)
    }

    func test_sharingFromHere_makesThisDeviceThePublisher() async {
        let sut = makeSUT()
        sut.served.snapshot = snapshot([(alice, .exact, 3600)])
        await sut.center.sync()

        let problem = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertNil(problem)
        XCTAssertTrue(sut.fixes.isFollowing)
        XCTAssertFalse(sut.store.received)
        XCTAssertEqual(Set(sut.emitter.starts.last?.recipients.map(\.userId) ?? []), [alice, bob])
    }

    /// Un « Partager » refusé (hors ligne, débit) sur un appareil qui n'a fait que RECEVOIR la liste ne le fait pas
    /// publier : ni maintenant, ni au prochain lancement.
    func test_aRefusedShare_onAReceivingDevice_keepsItSilent_evenAfterARelaunch() async {
        let store = FakeSharedLocationRosterStore()
        let sut = makeSUT(store: store)
        sut.served.snapshot = snapshot([(alice, .exact, 3600)])
        await sut.center.sync()
        sut.emitter.startVerdict = .refused(.offline)

        let problem = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .refused(.offline))
        XCTAssertTrue(store.received)
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertFalse(makeSUT(store: store).fixes.isFollowing)
    }
}
