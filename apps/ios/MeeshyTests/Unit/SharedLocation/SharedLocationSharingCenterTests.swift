import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Partager ma position depuis la fiche d'un Ami (#16983) : chaque personne a sa précision et sa propre échéance, le
/// serveur reçoit toujours la liste entière, une échéance passée retire la personne, et « Arrêter » se taît pour elle
/// sans couper les autres.
@MainActor
final class SharedLocationSharingCenterTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    private let me = "cccccccccccccccccccccccc"
    private let account = Account()

    private final class Account {
        var current: String? = "cccccccccccccccccccccccc"
    }

    private final class Clock {
        var now: Date
        init(_ now: Date) { self.now = now }
    }

    private let wakes = FakeSharedLocationWakeScheduler()
    private let sockets = PassthroughSubject<Void, Never>()

    private func makeSUT(
        emitter: FakeSharedLocationEmitter = FakeSharedLocationEmitter(),
        fixes: FakeSharedLocationFixSource = FakeSharedLocationFixSource(),
        store: FakeSharedLocationRosterStore = FakeSharedLocationRosterStore()
    ) -> (SharedLocationSharingCenter, FakeSharedLocationEmitter, FakeSharedLocationFixSource, Clock) {
        let clock = Clock(t0)
        let sut = SharedLocationSharingCenter(
            emitter: emitter,
            fixes: fixes,
            store: store,
            now: { clock.now },
            owner: me,
            currentAccount: { [account] in account.current },
            wakes: wakes,
            socketReady: sockets.eraseToAnyPublisher()
        )
        return (sut, emitter, fixes, clock)
    }

    /// Laisse tourner les tâches en vol jusqu'à ce que la condition tienne.
    private func settle(until condition: () -> Bool) async {
        for _ in 0..<2_000 where !condition() { await Task.yield() }
    }

    // MARK: - La liste

    func test_roster_eachPersonKeepsTheirOwnPrecisionAndDeadline() {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
            .adding(userId: bob, precision: .city, duration: .oneHour, now: t0)

        XCTAssertEqual(roster.entry(for: alice)?.until, t0.addingTimeInterval(8 * 3600))
        XCTAssertEqual(roster.entry(for: bob)?.precision, .city)
        XCTAssertEqual(roster.nextDeadline, t0.addingTimeInterval(3600))
        XCTAssertEqual(roster.serverDuration(now: t0), .eightHours)
    }

    func test_roster_onlyShortDeadlines_askTheServerForOneHour() {
        let roster = SharedLocationRoster.empty.adding(userId: bob, precision: .city, duration: .oneHour, now: t0)

        XCTAssertEqual(roster.serverDuration(now: t0.addingTimeInterval(600)), .oneHour)
    }

    func test_roster_pruned_dropsWhoseDeadlinePassed() {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
            .adding(userId: bob, precision: .city, duration: .oneHour, now: t0)
            .pruned(now: t0.addingTimeInterval(3600))

        XCTAssertNil(roster.entry(for: bob))
        XCTAssertNotNil(roster.entry(for: alice))
    }

    func test_roster_union_keepsEveryoneEitherListServes() {
        let served = SharedLocationRoster.empty.adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
        let asked = SharedLocationRoster.empty.adding(userId: bob, precision: .city, duration: .oneHour, now: t0)
            .adding(userId: alice, precision: .city, duration: .oneHour, now: t0)

        let union = served.union(asked)

        XCTAssertEqual(union.entry(for: alice)?.precision, .city)
        XCTAssertNotNil(union.entry(for: bob))
    }

    func test_roster_isCaseInsensitiveOnIds() {
        let roster = SharedLocationRoster.empty.adding(userId: alice.uppercased(), precision: .city, duration: .oneHour, now: t0)

        XCTAssertNotNil(roster.entry(for: alice))
    }

    func test_roster_deadlinedRecipients_carryTheirDeadlineWhenItFallsBeforeTheTerm() {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .oneHour, now: t0)
            .adding(userId: bob, precision: .city, duration: .eightHours, now: t0)

        XCTAssertEqual(roster.deadlinedRecipients(now: t0.addingTimeInterval(1.5)), [
            SharedLocationRecipient(userId: alice, precision: .exact, expiresInSeconds: 3599),
            SharedLocationRecipient(userId: bob, precision: .city, expiresInSeconds: 28799),
        ])
        XCTAssertEqual(roster.deadlinedRecipients(now: t0), [
            SharedLocationRecipient(userId: alice, precision: .exact, expiresInSeconds: 3600),
            SharedLocationRecipient(userId: bob, precision: .city),
        ])
    }

    func test_roster_deadlinedRecipients_aLonePersonFollowsTheTerm() {
        let roster = SharedLocationRoster.empty.adding(userId: alice, precision: .exact, duration: .oneHour, now: t0)

        XCTAssertEqual(roster.deadlinedRecipients(now: t0), [SharedLocationRecipient(userId: alice, precision: .exact)])
    }

    func test_roster_deadlinedRecipients_neverZero_andAPassedPersonNeverLeaves() {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .oneHour, now: t0)
            .adding(userId: bob, precision: .city, duration: .eightHours, now: t0)

        XCTAssertEqual(roster.deadlinedRecipients(now: t0.addingTimeInterval(3599.8)).first?.expiresInSeconds, 1)
        XCTAssertEqual(roster.deadlinedRecipients(now: t0.addingTimeInterval(3600)).map(\.userId), [bob])
    }

    // MARK: - Partager

    func test_share_sendsTheWholeListWithTheFix() async {
        let (sut, emitter, _, _) = makeSUT()

        let first = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        let second = await sut.share(with: bob, precision: .neighborhood, duration: .oneHour)

        XCTAssertNil(first)
        XCTAssertNil(second)
        XCTAssertEqual(emitter.starts.last?.recipients, [
            SharedLocationRecipient(userId: alice, precision: .exact),
            SharedLocationRecipient(userId: bob, precision: .neighborhood, expiresInSeconds: 3600),
        ])
        XCTAssertEqual(emitter.starts.last?.duration, .eightHours)
        XCTAssertEqual(sut.entry(for: bob)?.until, t0.addingTimeInterval(3600))
    }

    func test_share_aGatewayBeforeDeadlines_receivesTheSameListWithoutThem() async {
        let emitter = FakeSharedLocationEmitter()
        let (sut, _, _, clock) = makeSUT(emitter: emitter)
        _ = await sut.share(with: bob, precision: .exact, duration: .eightHours)
        clock.now = t0.addingTimeInterval(1.5)
        let before = emitter.starts.count
        emitter.queuedStartVerdicts = [.refused(.invalid)]

        let problem = await sut.share(with: alice, precision: .city, duration: .oneHour)

        XCTAssertNil(problem)
        let tried = Array(emitter.starts.dropFirst(before))
        XCTAssertEqual(tried.count, 2)
        XCTAssertEqual(tried.first?.recipients.map(\.expiresInSeconds), [3600, 28799])
        XCTAssertEqual(tried.last?.carriesDeadlines, false)
        XCTAssertEqual(tried.last?.recipients.map(\.userId), [alice, bob])
        XCTAssertNotNil(sut.entry(for: alice))
    }

    func test_share_anotherRefusal_isNotReplayedWithoutDeadlines() async {
        let emitter = FakeSharedLocationEmitter()
        let (sut, _, _, _) = makeSUT(emitter: emitter)
        _ = await sut.share(with: bob, precision: .exact, duration: .eightHours)
        let before = emitter.starts.count
        emitter.queuedStartVerdicts = [.refused(.rateLimited)]

        let problem = await sut.share(with: alice, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .refused(.rateLimited))
        XCTAssertEqual(emitter.starts.count - before, 1)
    }

    func test_share_aRefusalWithoutDeadlines_isNotReplayed() async {
        let emitter = FakeSharedLocationEmitter()
        emitter.startVerdict = .refused(.invalid)
        let (sut, _, _, _) = makeSUT(emitter: emitter)

        _ = await sut.share(with: alice, precision: .city, duration: .oneHour)

        XCTAssertEqual(emitter.starts.count, 1)
    }

    func test_share_refusedByTheServer_keepsNothing() async {
        let emitter = FakeSharedLocationEmitter()
        emitter.startVerdict = .refused(.rateLimited)
        let (sut, _, _, _) = makeSUT(emitter: emitter)

        let problem = await sut.share(with: alice, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .refused(.rateLimited))
        XCTAssertNil(sut.entry(for: alice))
    }

    func test_share_withoutAFix_sendsNothing() async {
        let fixes = FakeSharedLocationFixSource()
        fixes.result = .denied
        let (sut, emitter, _, _) = makeSUT(fixes: fixes)

        let problem = await sut.share(with: alice, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .locationDenied)
        XCTAssertTrue(emitter.starts.isEmpty)
    }

    func test_share_startsFollowingTheDevice() async {
        let (sut, _, fixes, _) = makeSUT()

        _ = await sut.share(with: alice, precision: .city, duration: .oneHour)

        XCTAssertTrue(fixes.isFollowing)
    }

    // MARK: - Arrêter

    func test_stop_forOnePerson_restartsWithTheOthers() async {
        let (sut, emitter, _, _) = makeSUT()
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .oneHour)

        await sut.stopSharing(with: bob)

        XCTAssertEqual(emitter.starts.last?.recipients, [SharedLocationRecipient(userId: alice, precision: .exact)])
        XCTAssertNil(sut.entry(for: bob))
        XCTAssertEqual(emitter.stops, 0)
    }

    func test_stop_forTheLastPerson_stopsTheShareAndTheDevice() async {
        let (sut, emitter, fixes, _) = makeSUT()
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)

        await sut.stopSharing(with: alice)

        XCTAssertEqual(emitter.stops, 1)
        XCTAssertNil(sut.entry(for: alice))
        XCTAssertFalse(fixes.isFollowing)
    }

    func test_aDeadlinePassed_removesThePersonFromTheServerShare() async {
        let (sut, emitter, _, clock) = makeSUT()
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .oneHour)

        clock.now = t0.addingTimeInterval(3601)
        await sut.reconcile()

        XCTAssertEqual(emitter.starts.last?.recipients.map(\.userId), [alice])
        XCTAssertNil(sut.entry(for: bob))
    }

    // MARK: - Survivre à un lancement

    func test_aRosterKeptFromAPreviousLaunch_canStillBeStopped() async {
        let store = FakeSharedLocationRosterStore()
        store.kept = SharedLocationRoster.empty.adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
        let (sut, emitter, fixes, _) = makeSUT(store: store)

        XCTAssertEqual(sut.entry(for: alice)?.precision, .exact)
        XCTAssertTrue(fixes.isFollowing)

        await sut.stopSharing(with: alice)

        XCTAssertEqual(emitter.stops, 1)
        XCTAssertNil(store.kept)
    }

    func test_aKeptRosterPastItsDeadline_isShownAsEnded_andStopsTheServerShare() async {
        let store = FakeSharedLocationRosterStore()
        store.kept = SharedLocationRoster.empty.adding(userId: alice, precision: .exact, duration: .oneHour, now: t0.addingTimeInterval(-7200))
        let (sut, emitter, fixes, _) = makeSUT(store: store)

        XCTAssertNil(sut.entry(for: alice))

        await sut.reconcile()

        XCTAssertEqual(emitter.stops, 1)
        XCTAssertNil(store.kept)
        XCTAssertFalse(fixes.isFollowing)
    }

    func test_theRosterIsKept_withoutAnyPosition() async throws {
        let store = FakeSharedLocationRosterStore()
        let (sut, _, _, _) = makeSUT(store: store)

        await sut.share(with: alice, precision: .neighborhood, duration: .oneHour)

        let kept = try XCTUnwrap(store.kept)
        let json = try XCTUnwrap(String(data: try JSONEncoder().encode(kept), encoding: .utf8))
        XCTAssertFalse(json.contains("48.85"))
        XCTAssertEqual(kept.entry(for: alice)?.precision, .neighborhood)
    }

    func test_anAccountChange_keepsTheRosterForItsReturn() async {
        let store = FakeSharedLocationRosterStore()
        let (sut, _, fixes, _) = makeSUT(store: store)
        await sut.share(with: alice, precision: .city, duration: .oneHour)

        sut.abandon()

        XCTAssertNotNil(store.kept)
        XCTAssertFalse(fixes.isFollowing)
    }

    // MARK: - Suivre l'appareil

    func test_aMovedFix_isSentAsAnUpdate() async {
        let (sut, emitter, fixes, clock) = makeSUT()
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)

        clock.now = t0.addingTimeInterval(10)
        await sut.didMove(to: SharedLocationFix(latitude: 48.86, longitude: 2.35)!)

        XCTAssertEqual(emitter.updates.count, 1)
        XCTAssertTrue(fixes.isFollowing)
    }

    func test_theServerNoLongerSharing_clearsEverything() async {
        let emitter = FakeSharedLocationEmitter()
        let (sut, _, fixes, clock) = makeSUT(emitter: emitter)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        emitter.updateVerdict = .refused(.notSharing)

        clock.now = t0.addingTimeInterval(10)
        await sut.didMove(to: SharedLocationFix(latitude: 48.86, longitude: 2.35)!)

        XCTAssertNil(sut.entry(for: alice))
        XCTAssertFalse(fixes.isFollowing)
    }

    // MARK: - Arrêter marche toujours (#18166)

    func test_anUpdateInFlight_cannotEraseAShareStartedAfterIt() async {
        let emitter = FakeSharedLocationEmitter()
        let (sut, _, _, clock) = makeSUT(emitter: emitter)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        emitter.holdsUpdates = true
        emitter.updateVerdict = .refused(.notSharing)

        clock.now = t0.addingTimeInterval(10)
        let moving = Task { await sut.didMove(to: SharedLocationFix(latitude: 48.86, longitude: 2.35)!) }
        await settle { emitter.heldUpdates == 1 }
        let sharing = Task { await sut.share(with: bob, precision: .city, duration: .oneHour) }
        await settle { false }
        emitter.releaseUpdates()
        await moving.value
        let problem = await sharing.value

        XCTAssertNil(problem)
        XCTAssertNotNil(sut.entry(for: bob))
        XCTAssertEqual(emitter.starts.last?.recipients.map(\.userId), [bob])
    }

    func test_aDeadlineThatCouldNotSettle_isRetried() async {
        let emitter = FakeSharedLocationEmitter()
        let (sut, _, _, clock) = makeSUT(emitter: emitter)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .oneHour)
        emitter.startVerdict = .refused(.offline)

        clock.now = t0.addingTimeInterval(3601)
        await sut.reconcile()
        XCTAssertEqual(wakes.delays.last, SharedLocationSharingCenter.retryDelay)

        emitter.startVerdict = .started(expiresAt: t0.addingTimeInterval(8 * 3600))
        await wakes.fireLast()
        await settle { emitter.starts.last?.recipients.map(\.userId) == [alice] }

        XCTAssertEqual(emitter.starts.last?.recipients.map(\.userId), [alice])
    }

    func test_aSocketThatComesBack_settlesAPassedDeadline() async {
        let emitter = FakeSharedLocationEmitter()
        let (sut, _, _, clock) = makeSUT(emitter: emitter)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .oneHour)

        clock.now = t0.addingTimeInterval(3601)
        sockets.send(())
        await settle { emitter.starts.count == 3 }

        XCTAssertEqual(emitter.starts.last?.recipients.map(\.userId), [alice])
    }

    func test_stoppingOnePerson_withoutAnyFix_stopsTheWholeShare() async {
        let store = FakeSharedLocationRosterStore()
        store.kept = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
            .adding(userId: bob, precision: .city, duration: .eightHours, now: t0)
        let fixes = FakeSharedLocationFixSource()
        fixes.result = .denied
        let (sut, emitter, _, _) = makeSUT(fixes: fixes, store: store)

        let problem = await sut.stopSharing(with: bob)

        XCTAssertNil(problem)
        XCTAssertEqual(emitter.stops, 1)
        XCTAssertTrue(emitter.starts.isEmpty)
        XCTAssertNil(sut.entry(for: bob))
        XCTAssertNil(store.kept)
    }

    func test_aLostAck_keepsStopWithinReach() async {
        let emitter = FakeSharedLocationEmitter()
        emitter.startVerdict = .refused(.unconfirmed)
        let (sut, _, fixes, _) = makeSUT(emitter: emitter)

        let problem = await sut.share(with: alice, precision: .exact, duration: .oneHour)

        XCTAssertEqual(problem, .refused(.unconfirmed))
        XCTAssertNotNil(sut.entry(for: alice))
        XCTAssertTrue(fixes.isFollowing)
    }

    func test_aLostAckWhileStoppingOnePerson_keepsStopForEveryoneTheServerMayServe() async {
        let emitter = FakeSharedLocationEmitter()
        let (sut, _, _, _) = makeSUT(emitter: emitter)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .oneHour)
        emitter.startVerdict = .refused(.unconfirmed)

        let problem = await sut.stopSharing(with: bob)

        XCTAssertEqual(problem, .withdrawalPending)
        XCTAssertNotNil(sut.entry(for: alice))
        XCTAssertTrue(sut.roster.isWithdrawalPending(for: bob))

        emitter.startVerdict = .started(expiresAt: t0.addingTimeInterval(8 * 3600))
        await wakes.fireLast()
        await settle { !sut.roster.hasPendingWithdrawals }

        XCTAssertEqual(emitter.starts.last?.recipients.map(\.userId), [alice])
        XCTAssertFalse(sut.roster.hasPendingWithdrawals)
    }

    func test_anAnswerArrivingAfterTheAccountLeft_adoptsNothing() async {
        let emitter = FakeSharedLocationEmitter()
        emitter.holdsStarts = true
        let store = FakeSharedLocationRosterStore()
        let (sut, _, fixes, _) = makeSUT(emitter: emitter, store: store)

        let sharing = Task { await sut.share(with: alice, precision: .exact, duration: .oneHour) }
        await settle { emitter.heldStarts == 1 }
        sut.abandon()
        emitter.releaseStarts()
        _ = await sharing.value

        XCTAssertNil(sut.entry(for: alice))
        XCTAssertNil(store.kept)
        XCTAssertFalse(fixes.isFollowing)
    }

    func test_anotherAccountOnTheSocket_neverReceivesThisShare() async {
        let store = FakeSharedLocationRosterStore()
        let (sut, emitter, _, clock) = makeSUT(store: store)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .oneHour)
        let sent = emitter.starts.count

        account.current = "dddddddddddddddddddddddd"
        clock.now = t0.addingTimeInterval(3601)
        sockets.send(())
        await wakes.fireLast()
        await sut.didMove(to: SharedLocationFix(latitude: 49.0, longitude: 2.5)!)
        await settle { false }
        let stopped = await sut.stopSharing(with: alice)

        XCTAssertEqual(emitter.starts.count, sent)
        XCTAssertTrue(emitter.updates.isEmpty)
        XCTAssertEqual(emitter.stops, 0)
        XCTAssertEqual(stopped, .refused(.failed))
        XCTAssertNotNil(store.kept?.entry(for: alice))
    }

    // MARK: - Un « Arrêter » hors ligne part au retour du réseau (#18204)

    func test_roster_withdrawing_keepsOnlyTheIdUntilTheLongestServerTerm() throws {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .oneHour, now: t0)
            .withdrawing(userId: alice, now: t0)

        XCTAssertNil(roster.entry(for: alice))
        XCTAssertFalse(roster.hasRecipients)
        XCTAssertFalse(roster.isEmpty)
        XCTAssertFalse(roster.isSettled(now: t0))
        XCTAssertTrue(roster.pruned(now: t0.addingTimeInterval(8 * 3600)).isEmpty)
        let json = try XCTUnwrap(String(data: try JSONEncoder().encode(roster), encoding: .utf8))
        XCTAssertFalse(json.contains("exact"))
        XCTAssertEqual(try JSONDecoder().decode(SharedLocationRoster.self, from: Data(json.utf8)), roster)
    }

    func test_roster_sharingAgain_dropsThePendingWithdrawal() {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .oneHour, now: t0)
            .withdrawing(userId: alice, now: t0)
            .adding(userId: alice, precision: .city, duration: .oneHour, now: t0)

        XCTAssertFalse(roster.hasPendingWithdrawals)
        XCTAssertEqual(roster.entry(for: alice)?.precision, .city)
    }

    func test_roster_keptBeforeWithdrawalsExisted_isStillRead() throws {
        let legacy = #"{"entries":{"aaaaaaaaaaaaaaaaaaaaaaaa":{"precision":"city","until":0}}}"#

        let roster = try JSONDecoder().decode(SharedLocationRoster.self, from: Data(legacy.utf8))

        XCTAssertEqual(roster.entry(for: alice)?.precision, .city)
        XCTAssertFalse(roster.hasPendingWithdrawals)
    }

    func test_stoppingOffline_keepsTheIntention_andReplaysItWhenTheSocketComesBack() async {
        let emitter = FakeSharedLocationEmitter()
        let store = FakeSharedLocationRosterStore()
        let (sut, _, fixes, _) = makeSUT(emitter: emitter, store: store)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        emitter.stopResult = false

        let problem = await sut.stopSharing(with: alice)

        XCTAssertEqual(problem, .withdrawalPending)
        XCTAssertNil(sut.entry(for: alice))
        XCTAssertTrue(store.kept?.isWithdrawalPending(for: alice) ?? false)
        XCTAssertFalse(fixes.isFollowing)

        emitter.stopResult = true
        sockets.send(())
        await settle { emitter.stops == 2 }

        XCTAssertEqual(emitter.stops, 2)
        XCTAssertNil(store.kept)
    }

    func test_stoppingOneOfTwoOffline_isReplayedByTheRetry_andSendsNoUpdateMeanwhile() async {
        let emitter = FakeSharedLocationEmitter()
        let (sut, _, _, clock) = makeSUT(emitter: emitter)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .eightHours)
        emitter.startVerdict = .refused(.offline)

        let problem = await sut.stopSharing(with: bob)
        clock.now = t0.addingTimeInterval(10)
        await sut.didMove(to: SharedLocationFix(latitude: 48.86, longitude: 2.35)!)

        XCTAssertEqual(problem, .withdrawalPending)
        XCTAssertTrue(emitter.updates.isEmpty)
        XCTAssertEqual(wakes.delays.last, SharedLocationSharingCenter.retryDelay)

        emitter.startVerdict = .started(expiresAt: t0.addingTimeInterval(8 * 3600))
        await wakes.fireLast()
        await settle { !sut.roster.hasPendingWithdrawals }

        XCTAssertEqual(emitter.starts.last?.recipients.map(\.userId), [alice])
        XCTAssertNotNil(sut.entry(for: alice))
    }

    func test_aPendingWithdrawalKeptFromAPreviousLaunch_leavesOnTheFirstSocket() async {
        let store = FakeSharedLocationRosterStore()
        store.kept = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0)
            .withdrawing(userId: alice, now: t0)
        let (sut, emitter, fixes, _) = makeSUT(store: store)

        XCTAssertFalse(fixes.isFollowing)
        sockets.send(())
        await settle { emitter.stops == 1 }

        XCTAssertEqual(emitter.stops, 1)
        XCTAssertNil(store.kept)
        XCTAssertTrue(sut.roster.isEmpty)
    }

    func test_aPendingWithdrawal_neverReplaysForAnotherAccount() async {
        let emitter = FakeSharedLocationEmitter()
        let store = FakeSharedLocationRosterStore()
        let (sut, _, _, _) = makeSUT(emitter: emitter, store: store)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        emitter.stopResult = false
        _ = await sut.stopSharing(with: alice)
        emitter.stopResult = true

        account.current = "dddddddddddddddddddddddd"
        sockets.send(())
        await wakes.fireLast()
        await settle { false }

        XCTAssertEqual(emitter.stops, 1)
        XCTAssertTrue(store.kept?.isWithdrawalPending(for: alice) ?? false)
    }

    func test_aWithdrawalRefusedForAnotherReasonThanTheNetwork_stopsTheWholeShare() async {
        let emitter = FakeSharedLocationEmitter()
        let store = FakeSharedLocationRosterStore()
        let (sut, _, _, _) = makeSUT(emitter: emitter, store: store)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .eightHours)
        emitter.startVerdict = .refused(.rateLimited)

        let problem = await sut.stopSharing(with: bob)

        XCTAssertNil(problem)
        XCTAssertEqual(emitter.stops, 1)
        XCTAssertTrue(sut.roster.isEmpty)
        XCTAssertNil(store.kept)
    }

    func test_anOldLastFix_isNeverRepublishedAsFresh() async {
        let emitter = FakeSharedLocationEmitter()
        let fixes = FakeSharedLocationFixSource()
        let (sut, _, _, clock) = makeSUT(emitter: emitter, fixes: fixes)
        _ = await sut.share(with: alice, precision: .exact, duration: .eightHours)
        _ = await sut.share(with: bob, precision: .city, duration: .eightHours)
        fixes.result = .fix(SharedLocationFix(latitude: 49.1, longitude: 2.5, accuracy: 10)!)

        clock.now = t0.addingTimeInterval(SharedLocationUpdateGate.heartbeat + 1)
        await sut.stopSharing(with: bob)

        XCTAssertEqual(emitter.starts.last?.fix.latitude, 49.1)
        XCTAssertEqual(emitter.starts.last?.recipients.map(\.userId), [alice])
    }

    func test_aWithdrawalPastItsBound_isForgottenWithoutAnyEmission() async {
        let store = FakeSharedLocationRosterStore()
        store.kept = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, duration: .eightHours, now: t0.addingTimeInterval(-9 * 3600))
            .withdrawing(userId: alice, now: t0.addingTimeInterval(-9 * 3600))
        let (sut, emitter, _, _) = makeSUT(store: store)

        await sut.reconcile()

        XCTAssertEqual(emitter.stops, 0)
        XCTAssertTrue(emitter.starts.isEmpty)
        XCTAssertNil(store.kept)
        XCTAssertTrue(sut.roster.isEmpty)
    }

    func test_theCenterIsWarmedOncePerSignedInAccount_withoutOpeningAProfile() {
        let accounts = PassthroughSubject<String?, Never>()
        var warmed = 0
        let watch = SharedLocationSharingHolder.warmOnEachAccount(accounts.eraseToAnyPublisher()) { warmed += 1 }

        accounts.send(nil)
        accounts.send("")
        accounts.send(me)
        accounts.send(me)
        accounts.send(alice)

        XCTAssertEqual(warmed, 2)
        watch.cancel()
    }

    func test_theRowStays_whileAShareRuns_evenBelowFriend() async {
        let (sut, _, _, _) = makeSUT()

        XCTAssertFalse(sut.showsRow(for: alice, offered: false))
        XCTAssertTrue(sut.showsRow(for: alice, offered: true))

        _ = await sut.share(with: alice, precision: .city, duration: .oneHour)

        XCTAssertTrue(sut.showsRow(for: alice, offered: false))
    }
}

final class FakeSharedLocationEmitter: SharedLocationEmitting, @unchecked Sendable {
    var isConnected = true
    var startVerdict: SharedLocationStartVerdict = .started(expiresAt: Date(timeIntervalSince1970: 2_000_000))
    var updateVerdict: SharedLocationStartVerdict = .started(expiresAt: Date(timeIntervalSince1970: 2_000_000))
    var stopResult = true
    /// Un accusé qui tarde : l'envoi reste en vol jusqu'à `releaseStarts()` / `releaseUpdates()`.
    var holdsStarts = false
    var holdsUpdates = false
    private let lock = NSLock()
    private var recordedStarts: [SharedLocationStartRequest] = []
    /// Rendus dans l'ordre avant `startVerdict` : une passerelle qui refuse puis accepte.
    var queuedStartVerdicts: [SharedLocationStartVerdict] = []
    private var recordedUpdates: [SharedLocationFix] = []
    private var recordedStops = 0
    var starts: [SharedLocationStartRequest] { lock.withLock { recordedStarts } }
    var updates: [SharedLocationFix] { lock.withLock { recordedUpdates } }
    var stops: Int { lock.withLock { recordedStops } }
    private var startGate: [CheckedContinuation<Void, Never>] = []
    private var updateGate: [CheckedContinuation<Void, Never>] = []

    var heldStarts: Int { lock.withLock { startGate.count } }
    var heldUpdates: Int { lock.withLock { updateGate.count } }

    func start(_ request: SharedLocationStartRequest) async -> SharedLocationStartVerdict {
        lock.withLock { recordedStarts.append(request) }
        if holdsStarts { await withCheckedContinuation { c in lock.withLock { startGate.append(c) } } }
        return lock.withLock { queuedStartVerdicts.isEmpty ? nil : queuedStartVerdicts.removeFirst() } ?? startVerdict
    }

    func update(_ fix: SharedLocationFix) async -> SharedLocationStartVerdict {
        lock.withLock { recordedUpdates.append(fix) }
        if holdsUpdates { await withCheckedContinuation { c in lock.withLock { updateGate.append(c) } } }
        return updateVerdict
    }

    func stop() async -> Bool {
        lock.withLock { recordedStops += 1 }
        return stopResult
    }

    func releaseStarts() {
        holdsStarts = false
        lock.withLock { let held = startGate; startGate = []; return held }.forEach { $0.resume() }
    }

    func releaseUpdates() {
        holdsUpdates = false
        lock.withLock { let held = updateGate; updateGate = []; return held }.forEach { $0.resume() }
    }
}

@MainActor
final class FakeSharedLocationWakeScheduler: SharedLocationWakeScheduling {
    private(set) var delays: [TimeInterval] = []
    private var armed: (id: Int, wake: @MainActor () async -> Void)?

    func schedule(after delay: TimeInterval, _ wake: @escaping @MainActor () async -> Void) -> AnyCancellable {
        delays.append(delay)
        let id = delays.count
        armed = (id, wake)
        return AnyCancellable { [weak self] in
            Task { @MainActor in if self?.armed?.id == id { self?.armed = nil } }
        }
    }

    func fireLast() async {
        guard let wake = armed?.wake else { return }
        armed = nil
        await wake()
    }
}

@MainActor
final class FakeSharedLocationRosterStore: SharedLocationRosterStoring {
    var kept: SharedLocationRoster?

    func load() -> SharedLocationRoster? { kept }

    func save(_ roster: SharedLocationRoster) { kept = roster.isEmpty ? nil : roster }
}

@MainActor
final class FakeSharedLocationFixSource: SharedLocationFixProviding {
    var result: SharedLocationFixResult = .fix(SharedLocationFix(latitude: 48.85, longitude: 2.35, accuracy: 12)!)
    private(set) var isFollowing = false
    let subject = PassthroughSubject<SharedLocationFix, Never>()

    var fixes: AnyPublisher<SharedLocationFix, Never> { subject.eraseToAnyPublisher() }

    func currentFix() async -> SharedLocationFixResult { result }

    func follow() { isFollowing = true }

    func stopFollowing() { isFollowing = false }
}
