import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// « En appel » sur iOS (#18753), les deux rôles : le LECTEUR tient l'état servi (remplacé, jamais fusionné ; effacé
/// par `ended` ; caché passé `expiresAt`) et fait passer l'annonce dans la SyncPill sans jamais la ranger ; l'ÉMETTEUR
/// ne rapporte qu'un changement, connecté, et relit les appels au retour au premier plan. Mon propre état ne m'est
/// jamais montré.
@MainActor
final class PhoneCallCenterTests: XCTestCase {

    private let clock = Date(timeIntervalSince1970: 1_800_000_000)

    private final class Session {
        var viewer: String?
        var inCall = false
        init(viewer: String?) { self.viewer = viewer }
    }

    private struct Rig {
        let sut: PhoneCallCenter
        let store: PhoneCallStateStore
        let feed: PhoneCallAnnouncementFeed
        let service: MockPhoneCallService
        let session: Session
    }

    private func makeSUT(viewer: String? = "me", names: [String: String] = ["peer": "Jacques"]) -> Rig {
        let clock = self.clock
        let store = PhoneCallStateStore(persistence: MemoryPhoneCallStatePersistence(), now: { clock })
        let feed = PhoneCallAnnouncementFeed(now: { clock })
        let service = MockPhoneCallService()
        let session = Session(viewer: viewer)
        let sut = PhoneCallCenter(
            store: store, feed: feed, service: service,
            viewerId: { session.viewer },
            displayName: { names[$0] },
            currentCallActivity: { session.inCall },
            startedEvents: Empty().eraseToAnyPublisher(),
            endedEvents: Empty().eraseToAnyPublisher(),
            callChanges: Empty().eraseToAnyPublisher(),
            foreground: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher()
        )
        return Rig(sut: sut, store: store, feed: feed, service: service, session: session)
    }

    private func state(_ userId: String = "peer", sinceMinutesAgo: Double = 10) -> PhoneCallState {
        PhoneCallState(userId: userId, since: clock.addingTimeInterval(-sinceMinutesAgo * 60),
                       expiresAt: clock.addingTimeInterval(PhoneCallContract.reportTtl))
    }

    private func started(_ userId: String = "peer", announced: Bool) -> PhoneCallStarted {
        PhoneCallStarted(userId: userId, state: state(userId),
                         announcement: announced ? PhoneCallAnnouncement(kind: .started, at: clock) : nil)
    }

    // MARK: - Le lecteur

    func test_receiveStarted_withoutAnnouncement_holdsTheState_andAnnouncesNothing() async {
        let rig = makeSUT()
        await rig.sut.receive(started(announced: false))
        XCTAssertEqual(rig.store.state(for: "peer"), state())
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_receiveStarted_withAnnouncement_saysWhoIsInACall_inTheSyncPill() async {
        let rig = makeSUT()
        await rig.sut.receive(started(announced: true))
        XCTAssertEqual(rig.feed.current.first?.kind, .started)
        XCTAssertEqual(rig.feed.current.first?.label, PhoneCallWording.pillLabel(kind: .started, name: "Jacques"))
        XCTAssertEqual(rig.feed.entries.first?.id, "phoneCall.peer")
    }

    func test_receiveStarted_unknownName_saysSomeoneClose() async {
        let rig = makeSUT(names: [:])
        await rig.sut.receive(started(announced: true))
        XCTAssertEqual(rig.feed.current.first?.label, PhoneCallWording.pillLabel(kind: .started, name: nil))
    }

    func test_aSilentStarted_replacesTheHeldState() async {
        let rig = makeSUT()
        await rig.sut.receive(started(announced: true))
        let refreshed = state(sinceMinutesAgo: 25)
        await rig.sut.receive(PhoneCallStarted(userId: "peer", state: refreshed))
        XCTAssertEqual(rig.store.state(for: "peer"), refreshed)
    }

    func test_receiveEnded_erasesTheState_andSaysTheyHungUp_onlyWhenServed() async {
        let rig = makeSUT()
        await rig.sut.receive(started(announced: false))
        await rig.sut.receive(PhoneCallEnded(userId: "peer"))
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertTrue(rig.feed.current.isEmpty)

        await rig.sut.receive(PhoneCallEnded(userId: "peer", announcement: PhoneCallAnnouncement(kind: .ended, at: clock)))
        XCTAssertEqual(rig.feed.current.first?.label, PhoneCallWording.pillLabel(kind: .ended, name: "Jacques"))
    }

    func test_myOwnState_isNeverShownToMe() async {
        let rig = makeSUT(viewer: "me")
        await rig.sut.receive(started("me", announced: true))
        XCTAssertNil(rig.store.state(for: "me"))
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_onePillPerPerson_theLatestReplacesThePrevious() async {
        let rig = makeSUT()
        await rig.sut.receive(started(announced: true))
        await rig.sut.receive(PhoneCallEnded(userId: "peer", announcement: PhoneCallAnnouncement(kind: .ended, at: clock)))
        XCTAssertEqual(rig.feed.current.map(\.kind), [.ended])
    }

    func test_theSyncPillAnnouncement_goesOutAfterItsLifetime_neverPersists() {
        var now = clock
        let feed = PhoneCallAnnouncementFeed(now: { now })
        feed.post(userId: "peer", kind: .started, label: "Jacques est en appel")
        now = clock.addingTimeInterval(PhoneCallAnnouncementFeed.lifetime + 1)
        feed.expireDue()
        XCTAssertTrue(feed.current.isEmpty)
    }

    func test_catchUp_theSnapshotIsTheTruth_withoutMyOwnState() async {
        let rig = makeSUT()
        rig.service.snapshotResult = .success([state("other"), state("me")])
        await rig.sut.receive(started(announced: false))
        await rig.sut.catchUp()
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertNotNil(rig.store.state(for: "other"))
        XCTAssertNil(rig.store.state(for: "me"))
    }

    func test_catchUp_failure_keepsTheCache() async {
        let rig = makeSUT()
        rig.service.snapshotResult = .failure(URLError(.notConnectedToInternet))
        await rig.sut.receive(started(announced: false))
        await rig.sut.catchUp()
        XCTAssertNotNil(rig.store.state(for: "peer"))
    }

    // MARK: - L'émetteur

    func test_callActivity_reportsOnlyWhenTheValueChanges() async {
        let rig = makeSUT()
        await rig.sut.callActivityChanged(true)
        await rig.sut.callActivityChanged(true)
        await rig.sut.callActivityChanged(false)
        XCTAssertEqual(rig.service.reportCalls, [true, false])
    }

    func test_callActivity_reportsNothing_whenSignedOut() async {
        let rig = makeSUT(viewer: nil)
        await rig.sut.callActivityChanged(true)
        XCTAssertTrue(rig.service.reportCalls.isEmpty)
    }

    func test_aFailedReport_isRetriedAtTheNextObservation() async {
        let rig = makeSUT()
        rig.service.reportResult = .failed
        await rig.sut.callActivityChanged(true)
        rig.service.reportResult = .tracked
        await rig.sut.callActivityChanged(true)
        XCTAssertEqual(rig.service.reportCalls, [true, true])
    }

    func test_backToForeground_rereadsTheCalls_theEndSeenWhileSuspended() async {
        let rig = makeSUT()
        rig.session.inCall = true
        await rig.sut.reportCurrentActivity()
        rig.session.inCall = false
        await rig.sut.reportCurrentActivity()
        XCTAssertEqual(rig.service.reportCalls, [true, false])
    }

    func test_signingIn_reportsTheCurrentActivity() async {
        let rig = makeSUT(viewer: nil)
        rig.session.viewer = "me"
        rig.session.inCall = true
        rig.sut.accountChanged(to: "me")
        await rig.sut.settle()
        XCTAssertEqual(rig.service.reportCalls, [true])
    }

    // MARK: - Le compte

    func test_logout_forgetsEverything_andTheNextAccountReportsAfresh() async {
        let rig = makeSUT()
        rig.sut.accountChanged(to: "me")
        await rig.sut.settle()
        await rig.sut.receive(started(announced: true))
        rig.session.viewer = nil
        rig.sut.accountChanged(to: nil)
        XCTAssertTrue(rig.store.states.isEmpty)
        XCTAssertTrue(rig.feed.current.isEmpty)

        rig.session.viewer = "me"
        rig.sut.accountChanged(to: "me")
        await rig.sut.settle()
        XCTAssertEqual(rig.service.reportCalls, [false, false])
    }

    func test_switchingAccount_forgetsTheOtherAccountsStates() async {
        let rig = makeSUT()
        rig.sut.accountChanged(to: "me")
        await rig.sut.receive(started(announced: false))
        rig.session.viewer = "other-account"
        rig.sut.accountChanged(to: "other-account")
        XCTAssertTrue(rig.store.states.isEmpty)
    }

    func test_firstAccountOfTheLaunch_keepsTheCache() async {
        let rig = makeSUT(viewer: nil)
        await rig.sut.receive(started(announced: false))
        rig.session.viewer = "me"
        rig.sut.accountChanged(to: "me")
        XCTAssertNotNil(rig.store.state(for: "peer"))
    }

    // MARK: - Les mots

    func test_headline_saysMinutesUnderAnHour_thenTheLocalTime() {
        let recent = state(sinceMinutesAgo: 12)
        XCTAssertTrue(PhoneCallWording.headline(recent, now: clock).contains("12"))
        let long = state(sinceMinutesAgo: 90)
        let time = PhoneReachabilityWording.sinceTime(long.since, now: clock)
        XCTAssertTrue(PhoneCallWording.headline(long, now: clock).contains(time))
    }

    func test_callActivity_isActiveWhileOneCallHasNotEnded() {
        XCTAssertFalse(PhoneCallActivity.isActive(callsEnded: []))
        XCTAssertFalse(PhoneCallActivity.isActive(callsEnded: [true]))
        XCTAssertTrue(PhoneCallActivity.isActive(callsEnded: [true, false]))
    }
}
