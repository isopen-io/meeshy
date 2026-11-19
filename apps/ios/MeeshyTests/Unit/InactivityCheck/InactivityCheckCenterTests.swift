import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// La vérification d'inactivité sur iOS (#18738) : l'alerte servie tient le glyphe et le détail, l'annonce passe dans
/// la SyncPill puis s'éteint, mon propre état ne m'est jamais montré, et « Je vais bien » part une fois.
@MainActor
final class InactivityCheckCenterTests: XCTestCase {

    private let since = Date(timeIntervalSince1970: 1_800_000_000)

    private struct Rig {
        let sut: InactivityCheckCenter
        let store: InactivityAlertStateStore
        let feed: InactivityAnnouncementFeed
        let service: MockInactivityCheckService
    }

    private func makeSUT(viewer: String = "me", names: [String: String] = ["peer": "Jacques"]) -> Rig {
        let clock = since.addingTimeInterval(43_200)
        let store = InactivityAlertStateStore(persistence: MemoryInactivityAlertStatePersistence(), now: { clock })
        let feed = InactivityAnnouncementFeed(now: { clock })
        let service = MockInactivityCheckService()
        let sut = InactivityCheckCenter(
            store: store, feed: feed, service: service,
            viewerId: { viewer },
            displayName: { names[$0] },
            now: { clock },
            alertEvents: Empty().eraseToAnyPublisher(),
            clearedEvents: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher()
        )
        return Rig(sut: sut, store: store, feed: feed, service: service)
    }

    private func state(_ userId: String = "peer", battery: Int? = 9) -> InactivityAlertState {
        InactivityAlertState(
            userId: userId, inactiveSince: since, alertedAt: since.addingTimeInterval(43_200),
            lastBattery: battery.map { InactivityLastBattery(level: $0, measuredAt: since) }
        )
    }

    private func alert(_ userId: String = "peer", announced: Bool) -> InactivityAlertRaised {
        InactivityAlertRaised(
            userId: userId, state: state(userId),
            announcement: announced ? InactivityAnnouncement(kind: .alert, inactiveSince: since, at: since) : nil
        )
    }

    func test_receiveAlert_withoutAnnouncement_holdsTheState_andAnnouncesNothing() async {
        let rig = makeSUT()
        await rig.sut.receive(alert(announced: false))
        XCTAssertEqual(rig.store.state(for: "peer")?.lastBattery?.level, 9)
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_receiveAlert_withAnnouncement_saysWhoDidNotAnswer_inTheSyncPill() async {
        let rig = makeSUT()
        await rig.sut.receive(alert(announced: true))
        XCTAssertEqual(rig.feed.current.first?.kind, .alert)
        XCTAssertEqual(rig.feed.current.first?.label, InactivityCheckWording.pillLabel(kind: .alert, name: "Jacques"))
        XCTAssertEqual(rig.feed.entries.first?.id, "inactivity.peer")
        XCTAssertEqual(rig.feed.entries.first?.dotStyle, .error)
    }

    func test_receiveAlert_unknownName_saysSomeoneClose() async {
        let rig = makeSUT(names: [:])
        await rig.sut.receive(alert(announced: true))
        XCTAssertEqual(rig.feed.current.first?.label, InactivityCheckWording.pillLabel(kind: .alert, name: nil))
    }

    func test_myOwnAlert_isNeverShownToMe() async {
        let rig = makeSUT(viewer: "me")
        await rig.sut.receive(alert("me", announced: true))
        XCTAssertNil(rig.store.state(for: "me"))
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_receiveCleared_erasesTheState_andSaysThePersonIsFine_onlyWhenServed() async {
        let rig = makeSUT()
        await rig.sut.receive(alert(announced: false))
        await rig.sut.receive(InactivityAlertCleared(userId: "peer"))
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertTrue(rig.feed.current.isEmpty)

        await rig.sut.receive(InactivityAlertCleared(
            userId: "peer", announcement: InactivityAnnouncement(kind: .responded, inactiveSince: since, at: since)
        ))
        XCTAssertEqual(rig.feed.current.first?.kind, .responded)
        XCTAssertEqual(rig.feed.current.first?.label, InactivityCheckWording.pillLabel(kind: .responded, name: "Jacques"))
        XCTAssertEqual(rig.feed.entries.first?.dotStyle, .success)
    }

    func test_theSyncPillAnnouncement_goesOutAfterItsLifetime_neverPersists() {
        var clock = since
        let feed = InactivityAnnouncementFeed(now: { clock })
        feed.post(userId: "peer", kind: .alert, label: "Jacques")
        clock = since.addingTimeInterval(InactivityAnnouncementFeed.lifetime - 1)
        feed.expireDue()
        XCTAssertEqual(feed.current.count, 1)
        clock = since.addingTimeInterval(InactivityAnnouncementFeed.lifetime + 1)
        feed.expireDue()
        XCTAssertTrue(feed.current.isEmpty)
    }

    func test_catchUp_theSnapshotIsTheTruth_withoutMyOwnState() async {
        let rig = makeSUT()
        rig.service.snapshotResult = .success([state("other"), state("me")])
        await rig.sut.receive(alert(announced: false))
        await rig.sut.catchUp()
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertNotNil(rig.store.state(for: "other"))
        XCTAssertNil(rig.store.state(for: "me"))
    }

    func test_catchUp_failure_keepsTheCache() async {
        let rig = makeSUT()
        rig.service.snapshotResult = .failure(URLError(.notConnectedToInternet))
        await rig.sut.receive(alert(announced: false))
        await rig.sut.catchUp()
        XCTAssertNotNil(rig.store.state(for: "peer"))
    }

    func test_answerWellness_saysIAmFineToTheGateway() async {
        let rig = makeSUT()
        let outcome = await rig.sut.answerWellness()
        XCTAssertEqual(outcome, .tracked)
        XCTAssertEqual(rig.service.answerWellnessCallCount, 1)
    }

    func test_answerWellness_tapAndActionTogether_sendOneRequest() async {
        let rig = makeSUT()
        rig.service.holdsAnswer = true
        let tap = Task { await rig.sut.answerWellness() }
        while rig.service.answerWellnessCallCount == 0 { await Task.yield() }
        let action = Task { await rig.sut.answerWellness() }
        await Task.yield()
        rig.service.releaseAnswers()
        let first = await tap.value
        let second = await action.value
        XCTAssertEqual([first, second], [.tracked, .tracked])
        XCTAssertEqual(rig.service.answerWellnessCallCount, 1)
    }

    func test_accountChanged_logout_forgetsEverything() async {
        let rig = makeSUT()
        await rig.sut.receive(alert(announced: true))
        rig.sut.accountChanged(to: nil)
        XCTAssertTrue(rig.store.states.isEmpty)
        XCTAssertTrue(rig.feed.current.isEmpty)
    }
}
