import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// La batterie des proches sur iOS (#14147) : l'état servi tient l'icône et le détail, l'annonce passe dans la
/// SyncPill puis s'éteint, le push app ouverte devient la même annonce, et le téléphone relève sur demande.
@MainActor
final class BatteryCenterTests: XCTestCase {

    private let measuredAt = Date()

    private struct Rig {
        let sut: BatteryCenter
        let store: BatteryStateStore
        let feed: BatteryAnnouncementFeed
        let reporter: MockBatteryReporter
    }

    private func makeSUT(viewer: String = "me", snapshot: [BatteryReaderState] = [], names: [String: String] = ["peer": "Awa"]) -> Rig {
        let store = BatteryStateStore(persistence: MemoryBatteryStatePersistence())
        let feed = BatteryAnnouncementFeed()
        let reporter = MockBatteryReporter()
        let sut = BatteryCenter(
            store: store, feed: feed, reporter: reporter,
            viewerId: { viewer },
            snapshot: { snapshot },
            displayName: { names[$0] },
            changedEvents: Empty().eraseToAnyPublisher(),
            clearedEvents: Empty().eraseToAnyPublisher(),
            pullRequests: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher()
        )
        return Rig(sut: sut, store: store, feed: feed, reporter: reporter)
    }

    private func state(_ userId: String = "peer", level: Int = 20, phase: BatteryServedPhase = .low) -> BatteryReaderState {
        BatteryReaderState(userId: userId, phase: phase, level: level, charging: false, lowPower: false, measuredAt: measuredAt)
    }

    func test_receiveChanged_withoutAnnouncement_holdsTheState_andAnnouncesNothing() async {
        let rig = makeSUT()
        await rig.sut.receive(BatteryChanged(userId: "peer", state: state()))
        XCTAssertEqual(rig.store.state(for: "peer")?.level, 20)
        XCTAssertTrue(rig.feed.current.isEmpty)
    }

    func test_receiveChanged_withAnnouncement_postsItNamedByThePerson() async {
        let rig = makeSUT()
        let announcement = BatteryAnnouncement(kind: .threshold, level: 18, threshold: 20, at: measuredAt)
        await rig.sut.receive(BatteryChanged(userId: "peer", state: state(level: 18), announcement: announcement))
        XCTAssertEqual(rig.feed.current.count, 1)
        XCTAssertTrue(rig.feed.current.first?.label.contains("Awa") == true)
        XCTAssertEqual(rig.feed.entries.first?.id, "battery.peer")
    }

    func test_receiveChanged_unknownName_saysSomeoneClose() async {
        let rig = makeSUT(names: [:])
        let announcement = BatteryAnnouncement(kind: .charging, level: 12, at: measuredAt)
        await rig.sut.receive(BatteryChanged(userId: "peer", state: state(phase: .charging), announcement: announcement))
        XCTAssertTrue(rig.feed.current.first?.label.contains(BatteryAnnouncementWording.someoneClose) == true)
    }

    func test_myOwnBattery_isNeverShownToMe() async {
        let rig = makeSUT(viewer: "me")
        await rig.sut.receive(BatteryChanged(userId: "me", state: state("me")))
        XCTAssertNil(rig.store.state(for: "me"))
    }

    func test_receiveCleared_erasesTheIcon() async {
        let rig = makeSUT()
        await rig.sut.receive(BatteryChanged(userId: "peer", state: state()))
        await rig.sut.receive(BatteryCleared(userId: "peer"))
        XCTAssertNil(rig.store.state(for: "peer"))
    }

    func test_catchUp_theSnapshotIsTheTruth() async {
        let rig = makeSUT(snapshot: [state("other")])
        await rig.sut.receive(BatteryChanged(userId: "peer", state: state()))
        await rig.sut.catchUp()
        XCTAssertNil(rig.store.state(for: "peer"))
        XCTAssertNotNil(rig.store.state(for: "other"))
    }

    func test_reportNow_asksTheReporter() async {
        let rig = makeSUT()
        let outcome = await rig.sut.reportNow()
        XCTAssertEqual(outcome, .tracked)
        XCTAssertEqual(rig.reporter.reportNowCallCount, 1)
    }

    func test_accountChanged_logout_stopsAndForgets() async {
        let rig = makeSUT()
        await rig.sut.receive(BatteryChanged(userId: "peer", state: state(), announcement: BatteryAnnouncement(kind: .low, level: 20, at: measuredAt)))
        rig.sut.accountChanged(to: nil)
        XCTAssertEqual(rig.reporter.stopCallCount, 1)
        XCTAssertTrue(rig.store.states.isEmpty)
        XCTAssertTrue(rig.feed.current.isEmpty)
        rig.sut.accountChanged(to: "me")
        XCTAssertEqual(rig.reporter.startCallCount, 1)
    }

    func test_pushAppOpen_becomesTheSameAnnouncement() {
        let rig = makeSUT()
        let push = BatteryPushContent(
            userInfo: ["type": "device_battery", "metadata": ["userId": "peer", "batteryKind": "critical"]],
            title: "Awa batterie critique", body: "4 %"
        )
        XCTAssertNotNil(push)
        if let push { rig.sut.announce(push: push) }
        XCTAssertEqual(rig.feed.current.first?.userId, "peer")
        XCTAssertEqual(rig.feed.current.first?.kind, .critical)
        XCTAssertEqual(rig.feed.current.first?.label, "Awa batterie critique · 4 %")
    }

    func test_pushContent_ignoresEveryOtherType() {
        XCTAssertNil(BatteryPushContent(userInfo: ["type": "bring"], title: "t", body: "b"))
        XCTAssertTrue(BatteryCenter.handlesPullPush(["type": "battery_pull"]))
        XCTAssertFalse(BatteryCenter.handlesPullPush(["type": "device_battery"]))
    }
}

/// La SyncPill ne garde jamais une annonce de batterie : une par personne, éteinte à son échéance.
@MainActor
final class BatteryAnnouncementFeedTests: XCTestCase {

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    func test_post_replacesThePreviousAnnouncementOfTheSamePerson() {
        let feed = BatteryAnnouncementFeed()
        feed.post(userId: "a", kind: .low, label: "1")
        feed.post(userId: "b", kind: .low, label: "2")
        feed.post(userId: "a", kind: .critical, label: "3")
        XCTAssertEqual(feed.current.map(\.label), ["2", "3"])
    }

    func test_expireDue_dropsWhatOutlivedItsWindow() {
        let clock = Clock()
        let feed = BatteryAnnouncementFeed(now: { clock.now })
        feed.post(userId: "a", kind: .low, label: "1")
        clock.now = clock.now.addingTimeInterval(BatteryAnnouncementFeed.lifetime + 1)
        feed.expireDue()
        XCTAssertTrue(feed.current.isEmpty)
        XCTAssertTrue(feed.entries.isEmpty)
    }

    func test_entry_isAnEventWithoutActivityDots() {
        let entry = BatteryAnnouncementFeed.entry(for: BatteryPillAnnouncement(
            userId: "a", kind: .critical, label: "x", expiresAt: Date()
        ))
        XCTAssertFalse(entry.showsActivityDots)
        XCTAssertEqual(entry.dotStyle, .error)
        XCTAssertNil(entry.source)
    }
}

/// Les mots : le niveau se dit quand il est servi, jamais inventé quand il manque.
@MainActor
final class BatteryAnnouncementWordingTests: XCTestCase {

    func test_leveledKinds_sayTheLevel_andFallBackWithoutIt() {
        let leveled = BatteryAnnouncementWording.label(kind: .low, name: "Awa", level: 20, threshold: nil)
        XCTAssertTrue(leveled.contains("Awa"))
        XCTAssertTrue(leveled.contains("20"))
        XCTAssertTrue(leveled.contains("%"))
        let bare = BatteryAnnouncementWording.label(kind: .low, name: "Awa", level: nil, threshold: nil)
        XCTAssertFalse(bare.contains("%"))
    }

    func test_threshold_saysTheCrossedStep() {
        let label = BatteryAnnouncementWording.label(kind: .threshold, name: "Awa", level: 19, threshold: 20)
        XCTAssertTrue(label.contains("20"))
    }

    func test_everyKind_hasALabelNamingThePerson() {
        for kind in BatteryAnnouncementKind.allCases {
            XCTAssertTrue(BatteryAnnouncementWording.label(kind: kind, name: "Awa", level: 5, threshold: nil).contains("Awa"), kind.rawValue)
        }
    }

    func test_autonomy_switchesToHoursPastAnHour() {
        XCTAssertTrue(BatteryAnnouncementWording.autonomy(minutes: 40).contains("40"))
        XCTAssertTrue(BatteryAnnouncementWording.autonomy(minutes: 95).contains("35"))
    }

    func test_detail_listsLowPowerAndAge_butNoAutonomyWhileCharging() {
        let now = Date()
        let charging = BatteryReaderState(userId: "a", phase: .charging, level: 30, charging: true, lowPower: true,
                                          estimatedMinutes: 50, measuredAt: now.addingTimeInterval(-120))
        let lines = BatteryDetailCard.details(charging, now: now)
        XCTAssertEqual(lines.count, 2)
    }
}

/// Une demande de batterie NOMMÉE attend « Envoyer » (#19565) ; sans auteur, le téléphone relève comme avant.
@MainActor
final class BatteryPullRequestTests: XCTestCase {

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private struct Rig {
        let sut: BatteryCenter
        let inbox: BatteryPullInbox
        let reporter: MockBatteryReporter
        let clock: Clock
    }

    private func makeSUT() -> Rig {
        let clock = Clock()
        let inbox = BatteryPullInbox(now: { clock.now })
        let reporter = MockBatteryReporter()
        let sut = BatteryCenter(
            store: BatteryStateStore(persistence: MemoryBatteryStatePersistence()),
            feed: BatteryAnnouncementFeed(), reporter: reporter, pullInbox: inbox,
            viewerId: { "me" }, snapshot: { [] }, displayName: { _ in nil },
            changedEvents: Empty().eraseToAnyPublisher(),
            clearedEvents: Empty().eraseToAnyPublisher(),
            pullRequests: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher()
        )
        return Rig(sut: sut, inbox: inbox, reporter: reporter, clock: clock)
    }

    private func mina(_ circle: RelationLevel? = .blood) -> BatteryPullRequester {
        BatteryPullRequester(id: "mina", displayName: "Mina", avatar: nil, circle: circle)
    }

    func test_anonymousRequest_reportsAtOnce_andShowsNothing() async {
        let rig = makeSUT()
        await rig.sut.receive(BatteryPullRequested(requestedAt: rig.clock.now))
        XCTAssertEqual(rig.reporter.reportNowCallCount, 1)
        XCTAssertTrue(rig.inbox.pending.isEmpty)
    }

    func test_namedRequest_waitsForThePerson() async {
        let rig = makeSUT()
        await rig.sut.receive(BatteryPullRequested(requestedAt: rig.clock.now, requestedBy: mina()))
        XCTAssertEqual(rig.reporter.reportNowCallCount, 0)
        XCTAssertEqual(rig.inbox.visible(at: rig.clock.now).map(\.requester.displayName), ["Mina"])
    }

    func test_sameRequesterTwice_keepsOneCard_theLatest() async {
        let rig = makeSUT()
        await rig.sut.receive(BatteryPullRequested(requestedAt: rig.clock.now, requestedBy: mina(.close)))
        let later = rig.clock.now.addingTimeInterval(30)
        await rig.sut.receive(BatteryPullRequested(requestedAt: later, requestedBy: mina(.blood)))
        XCTAssertEqual(rig.inbox.pending.count, 1)
        XCTAssertEqual(rig.inbox.pending.first?.requester.circle, .blood)
        XCTAssertEqual(rig.inbox.pending.first?.requestedAt, later)
    }

    func test_send_reportsNow_andTheCardLeaves() async {
        let rig = makeSUT()
        await rig.sut.receive(BatteryPullRequested(requestedAt: rig.clock.now, requestedBy: mina()))
        let sent = await rig.sut.send("mina")
        XCTAssertTrue(sent)
        XCTAssertEqual(rig.reporter.reportNowCallCount, 1)
        XCTAssertTrue(rig.inbox.pending.isEmpty)
    }

    func test_send_failure_givesTheCardBack() async {
        let rig = makeSUT()
        rig.reporter.reportNowResult = .offline
        await rig.sut.receive(BatteryPullRequested(requestedAt: rig.clock.now, requestedBy: mina()))
        let sent = await rig.sut.send("mina")
        XCTAssertFalse(sent)
        XCTAssertEqual(rig.inbox.pending.map(\.id), ["mina"])
    }

    func test_request_vanishesAtItsServedExpiry_orAfterTheDefaultLifetime() async {
        let rig = makeSUT()
        let served = rig.clock.now.addingTimeInterval(120)
        await rig.sut.receive(BatteryPullRequested(requestedAt: rig.clock.now, requestedBy: mina(), expiresAt: served))
        XCTAssertEqual(rig.inbox.visible(at: served.addingTimeInterval(-1)).count, 1)
        XCTAssertTrue(rig.inbox.visible(at: served).isEmpty)

        let other = BatteryPullRequester(id: "awa", displayName: "Awa")
        await rig.sut.receive(BatteryPullRequested(requestedAt: rig.clock.now, requestedBy: other))
        let lifetimeEnd = rig.clock.now.addingTimeInterval(BatteryPullInbox.defaultLifetime)
        XCTAssertEqual(rig.inbox.visible(at: lifetimeEnd.addingTimeInterval(-1)).map(\.id), ["awa"])
        XCTAssertTrue(rig.inbox.visible(at: lifetimeEnd).isEmpty)
    }

    func test_logout_forgetsTheRequests() async {
        let rig = makeSUT()
        await rig.sut.receive(BatteryPullRequested(requestedAt: rig.clock.now, requestedBy: mina()))
        rig.sut.accountChanged(to: nil)
        XCTAssertTrue(rig.inbox.pending.isEmpty)
    }

    func test_wording_saysTheCircleAndJustNow() {
        let now = Date()
        let detail = BatteryPullWording.detail(circle: .blood, requestedAt: now, now: now)
        XCTAssertTrue(detail.hasPrefix(CircleLevelNames.title(of: .blood)))
        XCTAssertTrue(detail.hasSuffix(String(localized: "battery.pull.justNow", defaultValue: "à l'instant", bundle: .main)))
        XCTAssertFalse(BatteryPullWording.detail(circle: nil, requestedAt: now, now: now).contains("·"))
        XCTAssertTrue(BatteryPullWording.title(name: "Mina").contains("Mina"))
    }
}
