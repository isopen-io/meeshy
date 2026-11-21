import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// LA SOURCE SERVIE (#20087) : la passerelle dit si le partage du compte montre un point CHOISI à la main ou la
/// position d'un appareil. Un appareil qui réunit ce partage ne fait jamais passer un destinataire d'un point choisi à
/// sa position réelle sans que l'utilisateur le demande, et ne suit pas sa position pour un point qu'il ne montre pas.
@MainActor
final class SharedLocationServedSourceTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private let me = "cccccccccccccccccccccccc"
    private let t0 = Date(timeIntervalSince1970: 1_000_000)
    private let mine = "2026-01-01T00:00:00.000Z"

    private final class Served {
        var snapshot: SharedLocationOwnSnapshot?
    }

    private struct SUT {
        let center: SharedLocationSharingCenter
        let emitter: FakeSharedLocationEmitter
        let fixes: FakeSharedLocationFixSource
        let store: FakeSharedLocationRosterStore
        let served: Served
    }

    private func makeSUT(store: FakeSharedLocationRosterStore = FakeSharedLocationRosterStore()) -> SUT {
        let emitter = FakeSharedLocationEmitter()
        let fixes = FakeSharedLocationFixSource()
        let served = Served()
        let t0 = self.t0
        let me = self.me
        let center = SharedLocationSharingCenter(
            emitter: emitter, fixes: fixes, store: store, now: { t0 }, owner: me, currentAccount: { me },
            wakes: FakeSharedLocationWakeScheduler(), served: { served.snapshot }
        )
        return SUT(center: center, emitter: emitter, fixes: fixes, store: store, served: served)
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

    func test_aPointChosenOnAnotherDevice_neverMakesThisDeviceSendItsPosition() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual)
        await sut.center.sync()

        await sut.center.didMove(to: SharedLocationFix(latitude: 45, longitude: 5)!)

        XCTAssertTrue(sut.center.roster.isFixedPoint)
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertTrue(sut.emitter.updates.isEmpty)
    }

    func test_sharingFromTheDevice_inFrontOfAPointChosenElsewhere_sendsNothingAndAsks() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual)
        await sut.center.sync()

        let problem = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .replacesChosenPoint)
        XCTAssertTrue(sut.emitter.starts.isEmpty)
        XCTAssertEqual(sut.fixes.asks, 0)
        XCTAssertNil(sut.center.entry(for: bob))
    }

    func test_aFirstShare_readsTheServedSourceBeforeComposing() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual)

        let problem = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .replacesChosenPoint)
        XCTAssertTrue(sut.emitter.starts.isEmpty)
    }

    func test_confirmingTheReplacement_sendsTheRealPositionToEveryone_sayingItsSource() async {
        let sut = makeSUT()
        sut.served.snapshot = served([alice], source: .manual)
        await sut.center.sync()

        let problem = await sut.center.share(with: bob, precision: .city, term: .bounded(.oneHour), replacingPoint: true)

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

    func test_aPointChosenElsewhereWhileThisDevicePublishes_stopsFollowingTheDevice() async {
        let sut = makeSUT()
        sut.emitter.startVerdict = .started(expiresAt: t0.addingTimeInterval(3600), startedAt: mine)
        _ = await sut.center.share(with: alice, precision: .city, duration: .oneHour)
        XCTAssertTrue(sut.fixes.isFollowing)

        sut.served.snapshot = served([alice], source: .manual, startedAt: mine)
        await sut.center.sync()
        sut.fixes.subject.send(SharedLocationFix(latitude: 45, longitude: 5)!)
        await settle()

        XCTAssertTrue(sut.center.roster.isFixedPoint)
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertTrue(sut.emitter.updates.isEmpty)
    }
}
