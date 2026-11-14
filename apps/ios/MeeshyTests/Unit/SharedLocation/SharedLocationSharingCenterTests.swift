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

    private final class Clock {
        var now: Date
        init(_ now: Date) { self.now = now }
    }

    private func makeSUT(
        emitter: FakeSharedLocationEmitter = FakeSharedLocationEmitter(),
        fixes: FakeSharedLocationFixSource = FakeSharedLocationFixSource(),
        store: FakeSharedLocationRosterStore = FakeSharedLocationRosterStore()
    ) -> (SharedLocationSharingCenter, FakeSharedLocationEmitter, FakeSharedLocationFixSource, Clock) {
        let clock = Clock(t0)
        let sut = SharedLocationSharingCenter(emitter: emitter, fixes: fixes, store: store, now: { clock.now }, schedulesDeadlines: false)
        return (sut, emitter, fixes, clock)
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

    func test_roster_isCaseInsensitiveOnIds() {
        let roster = SharedLocationRoster.empty.adding(userId: alice.uppercased(), precision: .city, duration: .oneHour, now: t0)

        XCTAssertNotNil(roster.entry(for: alice))
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
            SharedLocationRecipient(userId: bob, precision: .neighborhood),
        ])
        XCTAssertEqual(emitter.starts.last?.duration, .eightHours)
        XCTAssertEqual(sut.entry(for: bob)?.until, t0.addingTimeInterval(3600))
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
}

final class FakeSharedLocationEmitter: SharedLocationEmitting, @unchecked Sendable {
    var isConnected = true
    var startVerdict: SharedLocationStartVerdict = .started(expiresAt: Date(timeIntervalSince1970: 2_000_000))
    var updateVerdict: SharedLocationStartVerdict = .started(expiresAt: Date(timeIntervalSince1970: 2_000_000))
    var stopResult = true
    private(set) var starts: [SharedLocationStartRequest] = []
    private(set) var updates: [SharedLocationFix] = []
    private(set) var stops = 0

    func start(_ request: SharedLocationStartRequest) async -> SharedLocationStartVerdict {
        starts.append(request)
        return startVerdict
    }

    func update(_ fix: SharedLocationFix) async -> SharedLocationStartVerdict {
        updates.append(fix)
        return updateVerdict
    }

    func stop() async -> Bool {
        stops += 1
        return stopResult
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
