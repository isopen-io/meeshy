import Combine
import SwiftUI
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

    // MARK: - La batterie servie (#19204, #19476)

    func test_sync_adoptsTheServedBattery_andLearnsTheOptionsAreServed() async {
        let served = Served()
        let sut = makeSUT(served: served)
        let people = snapshot([(alice, .city, 1800)])
        served.snapshot = SharedLocationOwnSnapshot(recipients: people.recipients, shareBattery: true)

        await sut.center.sync()

        XCTAssertTrue(sut.center.roster.sharesBattery)
        XCTAssertEqual(sut.center.servesShareOptions, true)
    }

    func test_sync_aGatewayThatSaysNothingAboutTheBattery_keepsMine() {
        let mine = SharedLocationRoster.empty
            .adding(userId: alice, precision: .city, duration: .eightHours, now: t0)
            .withBattery(true)

        let next = mine.withServed(snapshot([(alice, .city, 1800)]), now: t0)

        XCTAssertTrue(next.sharesBattery)
    }

    // MARK: - Un point choisi à la main (#19558)

    private let lisbon = SharedLocationFix(latitude: 38.72, longitude: -9.14)!

    private func makeManualSUT(store: FakeSharedLocationRosterStore = FakeSharedLocationRosterStore()) async -> SUT {
        let served = Served()
        served.snapshot = SharedLocationOwnSnapshot(recipients: [], acceptsManualSource: true)
        let sut = makeSUT(store: store, served: served)
        await sut.center.sync()
        return sut
    }

    func test_choosingOnTheMap_isOfferedOnlyWhenTheGatewayAcceptsAPoint() async {
        let legacy = makeSUT()
        legacy.served.snapshot = snapshot([])
        await legacy.center.sync()
        XCTAssertFalse(legacy.center.servesFixedPoint)

        let sut = await makeManualSUT()
        XCTAssertTrue(sut.center.servesFixedPoint)
    }

    func test_sharingAChosenPoint_neverAsksTheDevice_andSendsThePointAsManual() async {
        let sut = await makeManualSUT()
        sut.fixes.result = .denied

        let problem = await sut.center.sharePoint(lisbon, with: alice, precision: .neighborhood, duration: .oneHour)

        XCTAssertNil(problem)
        XCTAssertEqual(sut.fixes.asks, 0)
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertEqual(sut.emitter.starts.last?.fix, lisbon)
        XCTAssertEqual(sut.emitter.starts.last?.source, .manual)
        XCTAssertEqual(sut.center.entry(for: alice)?.precision, .neighborhood)
        XCTAssertTrue(sut.center.roster.isFixedPoint)
    }

    func test_aGatewayThatDoesNotAcceptAPoint_sendsNothing() async {
        let sut = makeSUT()

        let problem = await sut.center.sharePoint(lisbon, with: alice, precision: .city, duration: .oneHour)

        XCTAssertEqual(problem, .refused(.unavailable))
        XCTAssertTrue(sut.emitter.starts.isEmpty)
    }

    func test_aChosenPoint_isNotUpdatedByTheDevice() async {
        let sut = await makeManualSUT()
        _ = await sut.center.sharePoint(lisbon, with: alice, precision: .city, duration: .oneHour)

        await sut.center.didMove(to: SharedLocationFix(latitude: 48.85, longitude: 2.35)!)

        XCTAssertTrue(sut.emitter.updates.isEmpty)
    }

    func test_removingSomeoneFromAChosenPoint_sendsTheListAlone_neverTheDevice() async {
        let sut = await makeManualSUT()
        _ = await sut.center.sharePoint(lisbon, with: alice, precision: .city, duration: .oneHour)
        _ = await sut.center.sharePoint(lisbon, with: bob, precision: .city, duration: .oneHour)

        _ = await sut.center.stopSharing(with: alice)

        XCTAssertEqual(sut.fixes.asks, 0)
        XCTAssertEqual(sut.emitter.starts.last?.recipients.map(\.userId), [bob])
        XCTAssertEqual(sut.emitter.starts.last?.isListOnly, true)
        XCTAssertTrue(sut.center.roster.isFixedPoint)
    }

    func test_removingSomeoneFromAChosenPoint_onAGatewayBeforeTheListAlone_republishesThePoint_neverTheDevice() async {
        let sut = await makeManualSUT()
        _ = await sut.center.sharePoint(lisbon, with: alice, precision: .city, duration: .oneHour)
        _ = await sut.center.sharePoint(lisbon, with: bob, precision: .city, duration: .oneHour)
        sut.emitter.queuedStartVerdicts = [.refused(.invalid)]

        _ = await sut.center.stopSharing(with: alice)

        XCTAssertEqual(sut.fixes.asks, 0)
        XCTAssertEqual(sut.emitter.starts.last?.recipients.map(\.userId), [bob])
        XCTAssertEqual(sut.emitter.starts.last?.fix, lisbon)
        XCTAssertEqual(sut.emitter.starts.last?.source, .manual)
    }

    func test_aChosenPoint_survivesARelaunch_withoutFollowingTheDevice() async {
        let store = FakeSharedLocationRosterStore()
        let first = await makeManualSUT(store: store)
        _ = await first.center.sharePoint(lisbon, with: alice, precision: .city, duration: .oneHour)

        let relaunched = makeSUT(store: store)

        XCTAssertNotNil(relaunched.center.entry(for: alice))
        XCTAssertTrue(relaunched.center.roster.isFixedPoint)
        XCTAssertFalse(relaunched.fixes.isFollowing)
    }

    func test_sharingFromTheDeviceAfterAChosenPoint_followsTheDeviceAgain() async {
        let sut = await makeManualSUT()
        _ = await sut.center.sharePoint(lisbon, with: alice, precision: .city, duration: .oneHour)

        _ = await sut.center.share(with: bob, precision: .city, duration: .oneHour)

        XCTAssertFalse(sut.center.roster.isFixedPoint)
        XCTAssertEqual(sut.emitter.starts.last?.source, .device)
        XCTAssertTrue(sut.fixes.isFollowing)
    }

    func test_theChosenPointFlag_neverStoresAPosition() throws {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .city, duration: .oneHour, now: t0)
            .withFixedPoint(true)

        let data = try JSONEncoder().encode(roster)
        let text = String(decoding: data, as: UTF8.self)
        let decoded = try JSONDecoder().decode(SharedLocationRoster.self, from: data)

        XCTAssertTrue(decoded.isFixedPoint)
        XCTAssertFalse(text.contains("latitude"))
        XCTAssertFalse(SharedLocationRoster.empty.withFixedPoint(true).isFixedPoint)
    }

    func test_thePin_pointsAtTheMapCenter_andVoiceOverMovesItAQuarterMapAtATime() {
        let viewport = LocationMapViewport(centerLatitude: 38.72, centerLongitude: 179.9, latitudeDelta: 0.4,
                                           longitudeDelta: 0.8, width: 390, height: 220)

        let fix = ShareMyLocationPoint.fix(at: viewport)
        let north = ShareMyLocationPoint.moved(viewport, .north)
        let east = ShareMyLocationPoint.moved(viewport, .east)

        XCTAssertEqual(fix?.latitude, 38.72)
        XCTAssertNil(fix?.accuracy)
        XCTAssertEqual(north.centerLatitude, 38.82, accuracy: 1e-9)
        XCTAssertEqual(north.latitudeDelta, 0.4, accuracy: 1e-9)
        XCTAssertEqual(east.centerLongitude, -179.9, accuracy: 1e-9)
    }

    func test_aTurnedMap_asksTheGatewayForTheAreaCoveringItsCorners() throws {
        let flat = LocationMapViewport(centerLatitude: 38.72, centerLongitude: -9.13, latitudeDelta: 0.04,
                                       longitudeDelta: 0.02, width: 200, height: 400)
        let turned = LocationMapViewport(centerLatitude: 38.72, centerLongitude: -9.13, latitudeDelta: 0.04,
                                         longitudeDelta: 0.02, width: 200, height: 400, heading: 90)

        let flatBounds = try XCTUnwrap(flat.bounds)
        let turnedBounds = try XCTUnwrap(turned.bounds)

        XCTAssertEqual(flatBounds.maxLongitude - flatBounds.minLongitude, 0.02, accuracy: 1e-9)
        XCTAssertEqual(flatBounds.maxLatitude - flatBounds.minLatitude, 0.04, accuracy: 1e-9)
        XCTAssertEqual(turnedBounds.maxLongitude - turnedBounds.minLongitude, 0.04, accuracy: 1e-9)
        XCTAssertEqual(turnedBounds.maxLatitude - turnedBounds.minLatitude, 0.02, accuracy: 1e-9)
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

    func test_removingSomeoneFromAReceivedList_sendsTheListAlone_withoutAskingTheDevice() async {
        let sut = makeSUT()
        sut.served.snapshot = snapshot([(alice, .exact, 3600), (bob, .city, 3600)])
        await sut.center.sync()

        let problem = await sut.center.stopSharing(with: bob)

        XCTAssertNil(problem)
        XCTAssertEqual(sut.fixes.asks, 0)
        XCTAssertEqual(sut.emitter.starts.map(\.isListOnly), [true])
        XCTAssertEqual(sut.emitter.starts.last?.recipients.map(\.userId), [alice])
        XCTAssertFalse(sut.fixes.isFollowing)
        XCTAssertTrue(sut.store.received)
        XCTAssertNil(sut.center.entry(for: bob))
    }

    func test_theListAloneMeetingNoShare_whileTheGatewayStillServesSomeone_keepsTheWithdrawalPending() async {
        let sut = makeSUT()
        sut.served.snapshot = snapshot([(alice, .exact, 3600), (bob, .city, 3600)])
        await sut.center.sync()
        sut.emitter.queuedStartVerdicts = [.refused(.notSharing)]

        let problem = await sut.center.stopSharing(with: bob)

        XCTAssertEqual(problem, .withdrawalPending)
        XCTAssertTrue(sut.center.roster.isWithdrawalPending(for: bob))
        XCTAssertNotNil(sut.center.entry(for: alice))
        XCTAssertEqual(sut.emitter.stops, 0)
        XCTAssertEqual(sut.fixes.asks, 0)
    }

    func test_theListAloneMeetingNoShare_whileTheGatewayServesNoOne_emptiesTheListWithoutStopping() async {
        let sut = makeSUT()
        sut.served.snapshot = snapshot([(alice, .exact, 3600), (bob, .city, 3600)])
        await sut.center.sync()
        sut.emitter.queuedStartVerdicts = [.refused(.notSharing)]
        sut.served.snapshot = snapshot([])

        let problem = await sut.center.stopSharing(with: bob)

        XCTAssertNil(problem)
        XCTAssertTrue(sut.center.roster.isEmpty)
        XCTAssertEqual(sut.emitter.stops, 0)
        XCTAssertEqual(sut.fixes.asks, 0)
    }

    func test_theListAloneMeetingNoShare_withAFailedRead_keepsTheWithdrawalPending() async {
        let sut = makeSUT()
        sut.served.snapshot = snapshot([(alice, .exact, 3600), (bob, .city, 3600)])
        await sut.center.sync()
        sut.emitter.queuedStartVerdicts = [.refused(.notSharing)]
        sut.served.snapshot = nil

        let problem = await sut.center.stopSharing(with: bob)

        XCTAssertEqual(problem, .withdrawalPending)
        XCTAssertTrue(sut.center.roster.isWithdrawalPending(for: bob))
        XCTAssertNotNil(sut.center.entry(for: alice))
        XCTAssertEqual(sut.emitter.stops, 0)
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

/// Demander à prolonger, redemander (#19204, #19476) : la demande est optimiste, une par personne ; un refus la défait,
/// une route non servie ou fermée retire le bouton.
@MainActor
final class SharedLocationAskCenterTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"

    @MainActor
    private final class Flight {
        var asked = false
    }

    private final class FakeRequester: SharedLocationRequesting, @unchecked Sendable {
        var outcome: SharedLocationRequestOutcome = .sent
        private(set) var asked: [(String, SharedLocationRequestKind)] = []
        var onAsk: (@MainActor () -> Void)?

        func requestSharedLocation(from userId: String, kind: SharedLocationRequestKind) async -> SharedLocationRequestOutcome {
            asked.append((userId, kind))
            if let onAsk { await onAsk() }
            return outcome
        }
    }

    func test_ask_showsAskedAtOnce_thenKeepsItWhenSent() async {
        let requester = FakeRequester()
        let sut = SharedLocationAskCenter(requester: requester)
        let id = alice
        let flight = Flight()
        requester.onAsk = { flight.asked = sut.hasAsked(id) }

        let feedback = await sut.ask(alice, kind: .extend)

        XCTAssertNil(feedback)
        XCTAssertTrue(flight.asked)
        XCTAssertTrue(sut.hasAsked(alice))
        XCTAssertEqual(requester.asked.first?.1, .extend)
    }

    func test_ask_twice_sendsOnce() async {
        let requester = FakeRequester()
        let sut = SharedLocationAskCenter(requester: requester)

        _ = await sut.ask(alice, kind: .reask)
        _ = await sut.ask(alice.uppercased(), kind: .extend)

        XCTAssertEqual(requester.asked.count, 1)
    }

    func test_ask_offline_isUndone() async {
        let requester = FakeRequester()
        requester.outcome = .offline
        let sut = SharedLocationAskCenter(requester: requester)

        let feedback = await sut.ask(alice, kind: .reask)

        XCTAssertEqual(feedback, .offline)
        XCTAssertFalse(sut.hasAsked(alice))
        XCTAssertTrue(sut.canAsk(alice))
    }

    func test_ask_tooSoon_staysAsked() async {
        let requester = FakeRequester()
        requester.outcome = .tooSoon
        let sut = SharedLocationAskCenter(requester: requester)

        let feedback = await sut.ask(alice, kind: .reask)

        XCTAssertEqual(feedback, .alreadyAsked)
        XCTAssertTrue(sut.hasAsked(alice))
    }

    func test_ask_closed_removesTheButtonForThisPersonOnly() async {
        let requester = FakeRequester()
        requester.outcome = .closed
        let sut = SharedLocationAskCenter(requester: requester)

        let feedback = await sut.ask(alice, kind: .extend)

        XCTAssertEqual(feedback, .closed)
        XCTAssertFalse(sut.canAsk(alice))
        XCTAssertTrue(sut.canAsk("bbbbbbbbbbbbbbbbbbbbbbbb"))
    }

    func test_ask_notServed_removesEveryButton() async {
        let requester = FakeRequester()
        requester.outcome = .notServed
        let sut = SharedLocationAskCenter(requester: requester)

        let feedback = await sut.ask(alice, kind: .extend)

        XCTAssertEqual(feedback, .unavailable)
        XCTAssertFalse(sut.canAsk(alice))
        XCTAssertFalse(sut.canAsk("bbbbbbbbbbbbbbbbbbbbbbbb"))
        XCTAssertFalse(sut.hasAsked(alice))
    }
}

/// « Jusqu'à ce que j'arrête » (#19616, planche `Carte-Partage`) : un partage sans échéance, réservé au Sang, qui ne
/// s'ouvre que si la passerelle l'annonce (`acceptsUntilStopped`). Sans elle, rien ne change.
@MainActor
final class SharedLocationUntilStoppedTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private let me = "cccccccccccccccccccccccc"
    private let t0 = Date(timeIntervalSince1970: 1_000_000)
    private let month: TimeInterval = 30 * 24 * 3600

    private func makeCenter(
        emitter: FakeSharedLocationEmitter,
        store: FakeSharedLocationRosterStore = FakeSharedLocationRosterStore(),
        served: SharedLocationOwnSnapshot? = nil
    ) -> SharedLocationSharingCenter {
        let t0 = self.t0
        let me = self.me
        return SharedLocationSharingCenter(
            emitter: emitter,
            fixes: FakeSharedLocationFixSource(),
            store: store,
            now: { t0 },
            owner: me,
            currentAccount: { me },
            wakes: FakeSharedLocationWakeScheduler(),
            served: { served }
        )
    }

    // MARK: - La liste

    func test_roster_anOpenEndedPerson_neverExpires_andSetsNoDeadline() {
        let roster = SharedLocationRoster.empty.adding(userId: alice, precision: .exact, term: .untilStopped, now: t0)

        XCTAssertEqual(roster.pruned(now: t0.addingTimeInterval(month)).entry(for: alice)?.isOpenEnded, true)
        XCTAssertNil(roster.nextDeadline)
        XCTAssertTrue(roster.isOpenEnded)
    }

    func test_roster_aBoundedPersonBesideAnOpenEndedOne_leavesAtHerOwnDeadline() {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, term: .untilStopped, now: t0)
            .adding(userId: bob, precision: .city, duration: .oneHour, now: t0)

        let sent = roster.deadlinedRecipients(now: t0)

        XCTAssertNil(sent.first { $0.userId == alice }?.expiresInSeconds)
        XCTAssertEqual(sent.first { $0.userId == bob }?.expiresInSeconds, 3600)
        XCTAssertEqual(roster.nextDeadline, t0.addingTimeInterval(3600))
    }

    func test_roster_aPendingWithdrawalOfAnOpenEndedShare_isNeverDroppedAfterEightHours() {
        let roster = SharedLocationRoster.empty
            .adding(userId: alice, precision: .exact, term: .untilStopped, now: t0)
            .withdrawing(userId: alice, now: t0)

        XCTAssertTrue(roster.pruned(now: t0.addingTimeInterval(month)).isWithdrawalPending(for: alice))
    }

    func test_roster_anOpenEndedShare_survivesARelaunch() throws {
        let roster = SharedLocationRoster.empty.adding(userId: alice, precision: .exact, term: .untilStopped, now: t0)

        let restored = try JSONDecoder().decode(SharedLocationRoster.self, from: JSONEncoder().encode(roster))

        XCTAssertEqual(restored.entry(for: alice)?.isOpenEnded, true)
    }

    func test_roster_theServedOpenEndedPerson_isAdopted() {
        let served = SharedLocationOwnSnapshot(recipients: [
            SharedLocationOwnRecipient(userId: alice, precision: .exact, expiresAt: SharedLocationShareTerm.openEndedDeadline),
        ])

        let next = SharedLocationRoster.empty.withServed(served, now: t0)

        XCTAssertEqual(next.entry(for: alice)?.isOpenEnded, true)
    }

    // MARK: - Le centre

    func test_share_untilStopped_isRefused_whileTheGatewayDoesNotAcceptIt() async {
        let emitter = FakeSharedLocationEmitter()
        let center = makeCenter(emitter: emitter, served: SharedLocationOwnSnapshot(recipients: []))
        await center.sync()

        let problem = await center.share(with: alice, precision: .exact, term: .untilStopped)

        XCTAssertFalse(center.servesUntilStopped)
        XCTAssertEqual(problem, .refused(.unavailable))
        XCTAssertTrue(emitter.starts.isEmpty)
        XCTAssertNil(center.entry(for: alice))
    }

    func test_share_untilStopped_sendsTheKey_andKeepsStopAtHand() async {
        let emitter = FakeSharedLocationEmitter()
        let center = makeCenter(emitter: emitter, served: SharedLocationOwnSnapshot(recipients: [], acceptsUntilStopped: true))
        await center.sync()

        let problem = await center.share(with: alice, precision: .exact, term: .untilStopped)

        XCTAssertTrue(center.servesUntilStopped)
        XCTAssertNil(problem)
        XCTAssertEqual(emitter.starts.last?.untilStopped, true)
        XCTAssertEqual(center.entry(for: alice)?.isOpenEnded, true)
    }

    func test_share_aBoundedDuration_neverSendsTheKey() async {
        let emitter = FakeSharedLocationEmitter()
        let center = makeCenter(emitter: emitter, served: SharedLocationOwnSnapshot(recipients: [], acceptsUntilStopped: true))
        await center.sync()

        _ = await center.share(with: alice, precision: .exact, duration: .oneHour)

        XCTAssertEqual(emitter.starts.last?.untilStopped, false)
    }

    // MARK: - La tuile

    func test_tile_opens_onlyWhenServed_andEveryChosenPersonIsBlood() {
        XCTAssertTrue(ShareMyLocationTermRule.opensUntilStopped(served: true, circles: [.blood, .blood]))
        XCTAssertFalse(ShareMyLocationTermRule.opensUntilStopped(served: false, circles: [.blood]))
        XCTAssertFalse(ShareMyLocationTermRule.opensUntilStopped(served: true, circles: [.blood, .close]))
        XCTAssertFalse(ShareMyLocationTermRule.opensUntilStopped(served: true, circles: [.blood, nil]))
        XCTAssertFalse(ShareMyLocationTermRule.opensUntilStopped(served: true, circles: []))
    }

    func test_tile_aChosenOpenEndTheRuleNoLongerAllows_fallsBackToOneHour() {
        let closed = ShareMyLocationTermRule.effective(.untilStopped, opens: false)
        let open = ShareMyLocationTermRule.effective(.untilStopped, opens: true)

        XCTAssertEqual(closed, .bounded(.oneHour))
        XCTAssertEqual(open, .untilStopped)
    }

    func test_wording_anOpenEndedShare_saysUntilYouStop_neverAnHour() {
        let said = ShareLocationWording.sharing(name: "Léo", precision: .city, until: SharedLocationShareTerm.openEndedDeadline)

        XCTAssertEqual(said, ShareLocationWording.sharingUntilStopped(name: "Léo", precision: .city))
    }
}

/// Le refus de position (planche `Etat-Erreur` vue 5) ne se lève qu'au RETOUR dans l'app après l'avoir quittée (les
/// Réglages) : la fermeture de l'alerte système, du Centre de contrôle ou des notifications repasse aussi par `.active`
/// et ne doit pas effacer l'explication qu'on vient de donner.
@MainActor
final class ShareMyLocationDenialTests: XCTestCase {

    func test_next_activeWithoutLeavingTheApp_keepsTheDenial() {
        let denied = ShareMyLocationDenial(isDenied: true)

        let afterAlert = denied.next(.inactive).next(.active)

        XCTAssertTrue(afterAlert.isDenied)
    }

    func test_next_backFromTheBackground_liftsTheDenial() {
        let denied = ShareMyLocationDenial(isDenied: true)

        let back = denied.next(.inactive).next(.background).next(.inactive).next(.active)

        XCTAssertFalse(back.isDenied)
        XCTAssertFalse(back.leftApp)
    }

    func test_next_aNewDenialAfterAReturn_waitsForTheNextDeparture() {
        let lifted = ShareMyLocationDenial(isDenied: true).next(.background).next(.active)
        let deniedAgain = ShareMyLocationDenial(isDenied: true)

        XCTAssertFalse(lifted.leftApp)
        XCTAssertTrue(deniedAgain.next(.active).isDenied)
    }
}
