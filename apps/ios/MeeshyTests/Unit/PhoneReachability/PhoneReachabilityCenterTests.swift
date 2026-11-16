import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Le téléphone injoignable sur iOS (#18737) : l'état servi tient le glyphe et le détail, l'annonce passe dans la
/// SyncPill puis s'éteint, le push app ouverte devient la même annonce, et le téléphone répond aux sondes.
@MainActor
final class PhoneReachabilityCenterTests: XCTestCase {

    private let since = Date()

    private struct Rig {
        let sut: PhoneReachabilityCenter
        let store: PhoneReachabilityStateStore
        let feed: PhoneReachabilityAnnouncementFeed
        let service: MockPhoneReachabilityService
    }

    private func makeSUT(viewer: String = "me", names: [String: String] = ["peer": "Awa"]) -> Rig {
        let store = PhoneReachabilityStateStore(persistence: MemoryPhoneReachabilityStatePersistence())
        let feed = PhoneReachabilityAnnouncementFeed()
        let service = MockPhoneReachabilityService()
        let sut = PhoneReachabilityCenter(
            store: store, feed: feed, service: service,
            viewerId: { viewer },
            displayName: { names[$0] },
            unreachableEvents: Empty().eraseToAnyPublisher(),
            reachableEvents: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher()
        )
        return Rig(sut: sut, store: store, feed: feed, service: service)
    }

    private func state(_ userId: String = "peer", cause: PhoneUnreachableCause = .network) -> PhoneReachabilityState {
        PhoneReachabilityState(userId: userId, unreachableSince: since, cause: cause)
    }

    private func unreachable(_ userId: String = "peer", announced: Bool) -> PhoneReachabilityChanged {
        PhoneReachabilityChanged(
            userId: userId, state: state(userId),
            announcement: announced ? PhoneReachabilityAnnouncement(kind: .unreachable, at: since) : nil
        )
    }

    func test_receiveUnreachable_withoutAnnouncement_holdsTheState_andAnnouncesNothing() async {
        let rig = makeSUT()
        await rig.sut.receive(unreachable(announced: false))
        XCTAssertEqual(rig.store.state(for: "peer")?.cause, .network)
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_receiveUnreachable_withAnnouncement_postsItNamedByThePerson() async {
        let rig = makeSUT()
        await rig.sut.receive(unreachable(announced: true))
        XCTAssertEqual(rig.feed.current.count, 1)
        XCTAssertEqual(rig.feed.current.first?.kind, .unreachable)
        XCTAssertTrue(rig.feed.current.first?.label.contains("Awa") == true)
        XCTAssertEqual(rig.feed.entries.first?.id, "phoneReachability.peer")
    }

    func test_receiveUnreachable_unknownName_saysSomeoneClose() async {
        let rig = makeSUT(names: [:])
        await rig.sut.receive(unreachable(announced: true))
        let expected = PhoneReachabilityWording.pillLabel(kind: .unreachable, name: nil, since: since, now: since)
        XCTAssertEqual(rig.feed.current.first?.label, expected)
    }

    func test_myOwnPhone_isNeverShownToMe() async {
        let rig = makeSUT(viewer: "me")
        await rig.sut.receive(unreachable("me", announced: true))
        XCTAssertNil(rig.store.state(for: "me"))
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_receiveReachable_erasesTheState_andAnnouncesOnlyWhenServed() async {
        let rig = makeSUT()
        await rig.sut.receive(unreachable(announced: false))
        await rig.sut.receive(PhoneReachabilityCleared(userId: "peer"))
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertTrue(rig.feed.current.isEmpty)

        await rig.sut.receive(PhoneReachabilityCleared(userId: "peer", announcement: PhoneReachabilityAnnouncement(kind: .reachable, at: since)))
        XCTAssertEqual(rig.feed.current.first?.kind, .reachable)
        XCTAssertTrue(rig.feed.current.first?.label.contains("Awa") == true)
    }

    func test_catchUp_theSnapshotIsTheTruth_withoutMyOwnState() async {
        let rig = makeSUT()
        rig.service.snapshotResult = .success([state("other"), state("me")])
        await rig.sut.receive(unreachable(announced: false))
        await rig.sut.catchUp()
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertNotNil(rig.store.state(for: "other"))
        XCTAssertNil(rig.store.state(for: "me"))
    }

    func test_catchUp_failure_keepsTheCache() async {
        let rig = makeSUT()
        rig.service.snapshotResult = .failure(URLError(.notConnectedToInternet))
        await rig.sut.receive(unreachable(announced: false))
        await rig.sut.catchUp()
        XCTAssertNotNil(rig.store.state(for: "peer"))
    }

    func test_answerProbe_saysAliveToTheGateway() async {
        let rig = makeSUT()
        let outcome = await rig.sut.answerProbe()
        XCTAssertEqual(outcome, .tracked)
        XCTAssertEqual(rig.service.aliveCallCount, 1)
    }

    func test_accountChanged_logout_forgetsEverything() async {
        let rig = makeSUT()
        await rig.sut.receive(unreachable(announced: true))
        rig.sut.accountChanged(to: nil)
        XCTAssertTrue(rig.store.states.isEmpty)
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_pushAppOpen_becomesTheSameAnnouncement() {
        let rig = makeSUT()
        let push = PhoneReachabilityPushContent(
            userInfo: ["type": "device_unreachable", "metadata": ["userId": "peer", "reachabilityKind": "unreachable"]],
            title: "Téléphone de Awa", body: "Injoignable depuis 14:10"
        )
        XCTAssertNotNil(push)
        if let push { rig.sut.announce(push: push) }
        XCTAssertEqual(rig.feed.current.first?.userId, "peer")
        XCTAssertEqual(rig.feed.current.first?.kind, .unreachable)
        XCTAssertEqual(rig.feed.current.first?.label, "Téléphone de Awa · Injoignable depuis 14:10")
    }

    func test_pushContent_ignoresEveryOtherType_andTheProbeIsRecognised() {
        XCTAssertNil(PhoneReachabilityPushContent(userInfo: ["type": "device_battery"], title: "t", body: "b"))
        XCTAssertTrue(PhoneReachabilityCenter.handlesProbePush(["type": "device_probe", "requestedAt": "2026-11-15T10:00:00.000Z"]))
        XCTAssertFalse(PhoneReachabilityCenter.handlesProbePush(["type": "battery_pull"]))
        XCTAssertFalse(PhoneReachabilityCenter.handlesProbePush(["type": "device_unreachable"]))
    }
}

/// La SyncPill ne garde jamais une annonce du téléphone injoignable : une par personne, éteinte à son échéance.
@MainActor
final class PhoneReachabilityAnnouncementFeedTests: XCTestCase {

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    func test_post_replacesThePreviousAnnouncementOfTheSamePerson() {
        let feed = PhoneReachabilityAnnouncementFeed()
        feed.post(userId: "a", kind: .unreachable, label: "1")
        feed.post(userId: "b", kind: .unreachable, label: "2")
        feed.post(userId: "a", kind: .reachable, label: "3")
        XCTAssertEqual(feed.current.map(\.label), ["2", "3"])
    }

    func test_expireDue_dropsWhatOutlivedItsWindow() {
        let clock = Clock()
        let feed = PhoneReachabilityAnnouncementFeed(now: { clock.now })
        feed.post(userId: "a", kind: .unreachable, label: "1")
        clock.now = clock.now.addingTimeInterval(PhoneReachabilityAnnouncementFeed.lifetime + 1)
        feed.expireDue()
        XCTAssertTrue(feed.current.isEmpty)
        XCTAssertTrue(feed.entries.isEmpty)
    }

    func test_entry_isAnEventWithoutActivityDots() {
        let entry = PhoneReachabilityAnnouncementFeed.entry(for: PhoneReachabilityPillAnnouncement(
            userId: "a", kind: .reachable, label: "x", expiresAt: Date()
        ))
        XCTAssertFalse(entry.showsActivityDots)
        XCTAssertEqual(entry.dotStyle, .success)
        XCTAssertEqual(entry.iconName, "iphone")
        XCTAssertNil(entry.source)
    }
}

/// Les mots : l'heure dans le fuseau du lecteur, le jour quand ce n'est pas aujourd'hui, la cause probable.
@MainActor
final class PhoneReachabilityWordingTests: XCTestCase {

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Paris") ?? .current
        return calendar
    }

    private func date(_ day: Int, _ hour: Int, _ minute: Int) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute)) ?? Date()
    }

    func test_sinceTime_today_saysOnlyTheReaderLocalTime() {
        let text = PhoneReachabilityWording.sinceTime(date(15, 14, 10), now: date(15, 18, 0), calendar: calendar,
                                                     locale: Locale(identifier: "fr_FR"))
        XCTAssertEqual(text, "14:10")
    }

    func test_template_notToday_addsTheDay_andTheDatePastAWeek() {
        XCTAssertEqual(PhoneReachabilityWording.template(for: date(15, 14, 10), now: date(15, 23, 0), calendar: calendar), "jm")
        XCTAssertEqual(PhoneReachabilityWording.template(for: date(14, 23, 50), now: date(15, 0, 10), calendar: calendar), "EEEEjm")
        XCTAssertEqual(PhoneReachabilityWording.template(for: date(1, 9, 0), now: date(15, 9, 0), calendar: calendar), "dMMMjm")
    }

    func test_pillLabel_namesThePerson_andFallsBackToSomeoneClose() {
        let now = Date()
        let named = PhoneReachabilityWording.pillLabel(kind: .reachable, name: "Awa", since: nil, now: now)
        XCTAssertTrue(named.contains("Awa"))
        let someone = PhoneReachabilityWording.pillLabel(kind: .reachable, name: nil, since: nil, now: now)
        XCTAssertFalse(someone.contains("%"))
        XCTAssertNotEqual(named, someone)
    }

    func test_cause_saysBatteryOrNetwork_andNothingForAnUnknownCause() {
        XCTAssertNotNil(PhoneReachabilityWording.cause(.battery))
        XCTAssertNotNil(PhoneReachabilityWording.cause(.network))
        XCTAssertNotEqual(PhoneReachabilityWording.cause(.battery), PhoneReachabilityWording.cause(.network))
        XCTAssertNil(PhoneReachabilityWording.cause(.unknown))
    }
}
