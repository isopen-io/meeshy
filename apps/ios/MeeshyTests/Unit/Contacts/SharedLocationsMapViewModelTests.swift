import Combine
import MapKit
import XCTest
import MeeshySDK
@testable import Meeshy

/// La carte des positions qu'on me partage sur iOS (#16983, iso web #16984) : chaque épingle est la position SERVIE et
/// rien de plus fin ; une montée de précision affine l'épingle sans recharger, une fin l'efface ; la personne est nommée
/// par l'annuaire des cercles et « Quelqu'un » sinon ; une présence hors ligne ne dessine aucun anneau ; un glisser ne
/// rattrape qu'une fois, sur la dernière emprise.
@MainActor
final class SharedLocationsMapViewModelTests: XCTestCase {

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    final class SnapshotSpy: @unchecked Sendable {
        var requested: [SharedLocationBounds?] = []
        var served: [SharedLocationChanged] = []
    }

    final class PresenceBoard: @unchecked Sendable {
        var states: [String: PresenceState] = ["alice": .online]
    }

    private struct Rig {
        let sut: SharedLocationsMapViewModel
        let live: SharedLocationsLive
        let changed: PassthroughSubject<SharedLocationChanged, Never>
        let ended: PassthroughSubject<SharedLocationEnded, Never>
        let spy: SnapshotSpy
    }

    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeRig(
        people: [CirclePerson] = [],
        presence: [String: PresenceState] = [:]
    ) -> Rig {
        let clock = Clock()
        let spy = SnapshotSpy()
        let changed = PassthroughSubject<SharedLocationChanged, Never>()
        let ended = PassthroughSubject<SharedLocationEnded, Never>()
        let live = SharedLocationsLive(
            viewerId: { "me" },
            snapshot: { bounds in
                spy.requested.append(bounds)
                return spy.served
            },
            changedEvents: changed.eraseToAnyPublisher(),
            endedEvents: ended.eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher(),
            now: { clock.now }
        )
        let sut = SharedLocationsMapViewModel(
            live: live,
            people: FakeCirclePeople(people),
            presence: { presence[$0] },
            calm: .milliseconds(20)
        )
        return Rig(sut: sut, live: live, changed: changed, ended: ended, spy: spy)
    }

    private func served(
        _ userId: String = "alice",
        latitude: Double = 48.85,
        longitude: Double = 2.35,
        precision: SharedLocationPrecision = .city,
        radius: Double = 8000,
        at offset: TimeInterval = 0
    ) -> SharedLocationChanged {
        SharedLocationChanged(
            userId: userId, latitude: latitude, longitude: longitude, precision: precision, radiusMeters: radius,
            updatedAt: t0.addingTimeInterval(offset), expiresAt: t0.addingTimeInterval(offset + 3600)
        )
    }

    private func waitForPins(_ sut: SharedLocationsMapViewModel, _ predicate: @escaping ([SharedLocationPin]) -> Bool) async {
        let reached = expectation(description: "épingles attendues")
        let watch = sut.$pins.first(where: predicate).sink { _ in reached.fulfill() }
        await fulfillment(of: [reached], timeout: 2)
        watch.cancel()
    }

    // MARK: - Ce qui est servi, et rien de plus

    func test_pins_carryTheServedPositionAndRadius_neverFiner() {
        let rig = makeRig()

        rig.live.receive(served(latitude: 48.85, longitude: 2.35, precision: .city, radius: 8000))

        let pin = rig.sut.pins.first
        XCTAssertEqual(rig.sut.pins.count, 1)
        XCTAssertEqual(pin?.latitude, 48.85)
        XCTAssertEqual(pin?.longitude, 2.35)
        XCTAssertEqual(pin?.radiusMeters, 8000)
        XCTAssertEqual(pin?.precision, .city)
    }

    func test_aRaisedPrecision_refinesThePinWithoutReloading() {
        let rig = makeRig()
        rig.live.receive(served(latitude: 48.85, precision: .city, radius: 8000))

        rig.live.receive(served(latitude: 48.8566, precision: .exact, radius: 25, at: 10))

        XCTAssertEqual(rig.sut.pins.first?.latitude, 48.8566)
        XCTAssertEqual(rig.sut.pins.first?.precision, .exact)
        XCTAssertEqual(rig.sut.pins.first?.radiusMeters, 25)
        XCTAssertTrue(rig.spy.requested.isEmpty, "la montée arrive par l'événement, sans rattrapage")
    }

    func test_anEndedShare_removesThePin() {
        let rig = makeRig()
        rig.live.receive(served("alice"))
        rig.live.receive(served("bob"))

        rig.live.clear("alice")

        XCTAssertEqual(rig.sut.pins.map(\.id), ["bob"])
    }

    // MARK: - Qui, et sa présence

    func test_aKnownPerson_isNamedAndInitialled() async {
        let rig = makeRig(people: [CirclePerson(id: "alice", name: "Alice Martin", username: "alice", avatarURL: nil)])

        rig.live.receive(served("alice"))
        await waitForPins(rig.sut) { $0.first?.name == "Alice Martin" }

        XCTAssertEqual(rig.sut.pins.first?.initials, "AM")
        XCTAssertTrue(rig.sut.pins.first?.accessibilityLabel.hasPrefix("Alice Martin, ") == true)
    }

    func test_anUnknownPerson_isSomeone_neverAnIdentifier() {
        let rig = makeRig()

        rig.live.receive(served("665f1c2e9b1d4a0012345678"))

        XCTAssertFalse(rig.sut.pins.first?.name.contains("665f1c2e") ?? true)
        XCTAssertFalse(rig.sut.pins.first?.name.isEmpty ?? true)
    }

    func test_presence_offlineDrawsNoRing_onlineDoes() {
        let rig = makeRig(presence: ["alice": .offline, "bob": .online])

        rig.live.receive(served("alice"))
        rig.live.receive(served("bob"))

        let byId = Dictionary(uniqueKeysWithValues: rig.sut.pins.map { ($0.id, $0) })
        XCTAssertNil(byId["alice"]?.presence)
        XCTAssertEqual(byId["bob"]?.presence, .online)
    }

    /// Une épingle posée garde sa position des heures : sa pastille suit le battement de présence, sans attendre
    /// qu'une position bouge (#11412).
    func test_aPresenceBeat_repaintsThePinnedRing_withoutAPositionChange() {
        let board = PresenceBoard()
        let beat = PassthroughSubject<Void, Never>()
        let live = SharedLocationsLive(
            viewerId: { "me" },
            snapshot: { _ in [] },
            changedEvents: Empty().eraseToAnyPublisher(),
            endedEvents: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher(),
            now: { Date(timeIntervalSince1970: 1_800_000_000) }
        )
        let sut = SharedLocationsMapViewModel(
            live: live,
            people: FakeCirclePeople([]),
            presence: { board.states[$0] },
            presenceRefresh: beat.eraseToAnyPublisher()
        )
        live.receive(served("alice"))
        XCTAssertEqual(sut.pins.first?.presence, .online)

        board.states["alice"] = .away
        beat.send(())

        XCTAssertEqual(sut.pins.first?.presence, .away)
    }

    // MARK: - Rattrapage

    func test_appeared_catchesUpTheWholeWorld_andForgetsAnEndMissedWhileClosed() async {
        let rig = makeRig()
        rig.live.receive(served("alice"))
        rig.spy.served = []

        await rig.sut.appeared()

        XCTAssertEqual(rig.spy.requested, [nil])
        XCTAssertTrue(rig.sut.pins.isEmpty)
    }

    func test_regionChanged_catchesUpOnce_onTheLastBounds() async {
        let rig = makeRig()
        let first = SharedLocationBounds(minLongitude: 0, minLatitude: 0, maxLongitude: 10, maxLatitude: 10)
        let last = SharedLocationBounds(minLongitude: 2, minLatitude: 48, maxLongitude: 3, maxLatitude: 49)
        let caughtUp = expectation(description: "un rattrapage")
        rig.spy.served = [served("alice")]

        rig.sut.regionChanged(first)
        rig.sut.regionChanged(last)
        let watch = rig.sut.$pins.first { !$0.isEmpty }.sink { _ in caughtUp.fulfill() }
        await fulfillment(of: [caughtUp], timeout: 2)
        watch.cancel()

        XCTAssertEqual(rig.spy.requested, [last])
    }

    // MARK: - Le cercle servi et « Pas sur la carte » (#18872)

    func test_theServedCircle_andTheDirectoryAvatar_reachThePin() async {
        let rig = makeRig(people: [CirclePerson(id: "alice", name: "Alice Martin", username: nil, avatarURL: "https://cdn/a.jpg")])

        rig.live.receive(SharedLocationChanged(
            userId: "alice", latitude: 38.71, longitude: -9.13, precision: .neighborhood, radiusMeters: 1200,
            updatedAt: t0, expiresAt: t0.addingTimeInterval(3600), circle: .close
        ))
        await waitForPins(rig.sut) { $0.first?.avatarURL != nil }

        XCTAssertEqual(rig.sut.pins.first?.circle, .close)
        XCTAssertEqual(rig.sut.pins.first?.avatarURL, "https://cdn/a.jpg")
        XCTAssertEqual(rig.sut.pins.first?.updatedAt, t0)
    }

    func test_aStoppedShare_goesNotOnTheMap_namedByTheDirectory_withoutAnyPosition() async {
        let rig = makeRig()
        let start = t0
        let log = SharedLocationEndingsLog(live: rig.live, now: { start })
        let sut = SharedLocationsMapViewModel(
            live: rig.live,
            people: FakeCirclePeople([CirclePerson(id: "yuki", name: "Yuki Tanaka", username: nil, avatarURL: nil)]),
            presence: { _ in nil },
            endings: log.$endings.eraseToAnyPublisher(),
            calm: .milliseconds(20)
        )
        rig.live.receive(served("yuki"))
        let named = expectation(description: "Yuki est « pas sur la carte »")
        let watch = sut.$ended.first { $0.first?.name == "Yuki Tanaka" }.sink { _ in named.fulfill() }

        rig.ended.send(SharedLocationEnded(userId: "yuki"))
        await fulfillment(of: [named], timeout: 2)
        watch.cancel()

        XCTAssertEqual(sut.ended.map(\.id), ["yuki"])
        XCTAssertEqual(sut.ended.first?.endedAt, start)
        XCTAssertTrue(sut.pins.isEmpty)
    }

    // MARK: - L'emprise d'une région

    func test_regionBounds_matchTheVisibleRegion() {
        let region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 48.5, longitude: 2.5),
            span: MKCoordinateSpan(latitudeDelta: 1, longitudeDelta: 1)
        )

        XCTAssertEqual(
            SharedLocationsMapRegion.bounds(of: region),
            SharedLocationBounds(minLongitude: 2, minLatitude: 48, maxLongitude: 3, maxLatitude: 49)
        )
    }

    func test_regionBounds_acrossTheAntimeridian_fallBackToTheWorld() {
        let region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 0, longitude: 179.5),
            span: MKCoordinateSpan(latitudeDelta: 1, longitudeDelta: 2)
        )

        XCTAssertNil(SharedLocationsMapRegion.bounds(of: region))
    }
}

/// La position d'un Sang, côté écran (#18872, planche Carte-Sang) : mon fantôme s'applique aussitôt et revient si la
/// passerelle le refuse ; l'historique lu se peint à la réouverture, jamais pour un autre compte.
@MainActor
final class BloodLocationModelTests: XCTestCase {

    final class FakeBloodLocation: BloodLocationProviding, @unchecked Sendable {
        var accepts = true
        var points: [BloodLocationPoint] = []
        var fails = false
        var changes: [BloodLocationSettingsChange] = []

        func history(of userId: String, since: Date?, limit: Int?) async throws -> BloodLocationHistory {
            if fails { throw URLError(.notConnectedToInternet) }
            return BloodLocationHistory(points: points)
        }

        var journal = BloodLocationConsultations(items: [])

        func consultations() async throws -> BloodLocationConsultations { journal }

        func update(_ change: BloodLocationSettingsChange) async throws -> Bool {
            changes.append(change)
            return accepts
        }

        func eraseHistory() async throws {}

        var recorded: [BloodLocationReading] = []
        var keeps = true

        func record(_ reading: BloodLocationReading) async throws -> Bool {
            recorded.append(reading)
            return keeps
        }
    }

    final class GhostMemory: BloodGhostStoring {
        var isGhost = false
        nonisolated deinit {}
    }

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeSUT(_ service: FakeBloodLocation, account: String = "me", online: Bool = true,
                         people: [CirclePerson] = []) -> BloodLocationModel {
        let now = self.now
        return BloodLocationModel(userId: "mina", service: service, ghostStore: GhostMemory(), isOnline: { online },
                                  now: { now }, account: account, people: FakeCirclePeople(people))
    }

    func test_whoLookedAtMyPosition_isNamedByTheCircleDirectory() async {
        let service = FakeBloodLocation()
        service.journal = BloodLocationConsultations(items: [
            BloodLocationConsultation(observerId: "leo", consultedAt: now.addingTimeInterval(-60)),
            BloodLocationConsultation(observerId: "ghost-id", consultedAt: now.addingTimeInterval(-120)),
        ])
        let leo = CirclePerson(id: "leo", name: "Léo Marchetti", username: "leo.m", avatarURL: nil)
        let sut = makeSUT(service, account: "cache-observers", people: [leo])

        await sut.load()

        XCTAssertEqual(sut.consultations?.byObserver.map(\.observerId), ["leo", "ghost-id"])
        XCTAssertEqual(sut.observers["leo"]?.name, "Léo Marchetti")
        XCTAssertNil(sut.observers["ghost-id"])
    }

    func test_ghost_appliesAtOnce_andComesBackWhenRefused() async {
        let service = FakeBloodLocation()
        service.accepts = false
        let sut = makeSUT(service)

        await sut.setGhost(true)

        XCTAssertFalse(sut.isGhost)
        XCTAssertEqual(service.changes.first?.ghost, true)
        XCTAssertNil(service.changes.first?.userId)
    }

    func test_ghost_staysWhenAccepted() async {
        let sut = makeSUT(FakeBloodLocation())

        await sut.setGhost(true)

        XCTAssertTrue(sut.isGhost)
    }

    func test_theReadHistory_paintsAtReopening_onlyForTheSameAccount() async {
        let service = FakeBloodLocation()
        service.points = [BloodLocationPoint(latitude: 38.71, longitude: -9.13, recordedAt: now.addingTimeInterval(-600))]
        await makeSUT(service, account: "cache-a").load()

        service.fails = true
        let reopened = makeSUT(service, account: "cache-a")
        let otherAccount = makeSUT(service, account: "cache-b")

        XCTAssertEqual(reopened.state, .loaded)
        XCTAssertEqual(reopened.points.count, 1)
        XCTAssertTrue(otherAccount.points.isEmpty)
    }

    func test_aFailedFirstLoad_saysOfflineWhenTheNetworkIsGone() async {
        let service = FakeBloodLocation()
        service.fails = true
        let sut = makeSUT(service, account: "cache-offline", online: false)

        await sut.load()

        XCTAssertEqual(sut.state, .failed(offline: true))
    }
}

/// LE RELEVÉ DU SANG (#18872) : au retour au premier plan, un point part si un Sang peut le relire, hors fantôme, avec
/// une permission déjà donnée ; le même lieu ne repart pas avant un quart d'heure ; un refus ne repose pas la question
/// à chaque retour.
@MainActor
final class BloodLocationRecorderTests: XCTestCase {

    @MainActor
    final class FixedFix: BloodLocationFixReading {
        var fix: SharedLocationFix?
        var asked = 0
        init(_ fix: SharedLocationFix?) { self.fix = fix }
        nonisolated deinit {}
        func authorizedFix() async -> SharedLocationFix? {
            asked += 1
            return fix
        }
    }

    final class Clock {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        nonisolated deinit {}
    }

    private func makeSUT(service: BloodLocationModelTests.FakeBloodLocation, fix: FixedFix, clock: Clock,
                         enabled: Bool = true, levels: [RelationLevel] = [.blood], ghost: Bool = false,
                         account: String? = "me") -> BloodLocationRecorder {
        let links = levels.enumerated().map { RelationLink(userId: "u\($0.offset)", effectiveLevel: $0.element, grantedByMe: $0.element) }
        let context = BloodLocationRecorderContext(isEnabled: { enabled }, links: { links })
        return BloodLocationRecorder(service: service, fixes: fix, context: context, isGhost: { _ in ghost },
                                     account: { account }, now: { clock.now })
    }

    private var lisbon: SharedLocationFix? { SharedLocationFix(latitude: 38.71, longitude: -9.13, accuracy: 20) }

    func test_aBloodCanReadIt_soTheFirstPointLeaves_andTheSamePlaceWaitsAQuarterHour() async {
        let service = BloodLocationModelTests.FakeBloodLocation()
        let clock = Clock()
        let sut = makeSUT(service: service, fix: FixedFix(lisbon), clock: clock)

        await sut.recordIfDue()
        clock.now = clock.now.addingTimeInterval(5 * 60)
        await sut.recordIfDue()
        clock.now = clock.now.addingTimeInterval(10 * 60)
        await sut.recordIfDue()

        XCTAssertEqual(service.recorded.count, 2)
        XCTAssertEqual(service.recorded.first?.accuracy, 20)
    }

    func test_withoutABlood_nothingLeaves_andTheQuestionIsNotAskedAgainAtOnce() async {
        let service = BloodLocationModelTests.FakeBloodLocation()
        let fix = FixedFix(lisbon)
        let sut = makeSUT(service: service, fix: fix, clock: Clock(), levels: [.friend, .close])

        await sut.recordIfDue()
        await sut.recordIfDue()

        XCTAssertTrue(service.recorded.isEmpty)
        XCTAssertEqual(fix.asked, 1)
    }

    func test_ghostFlagOffNoPermissionOrNoAccount_nothingLeaves() async {
        let service = BloodLocationModelTests.FakeBloodLocation()
        await makeSUT(service: service, fix: FixedFix(lisbon), clock: Clock(), ghost: true).recordIfDue()
        await makeSUT(service: service, fix: FixedFix(lisbon), clock: Clock(), enabled: false).recordIfDue()
        await makeSUT(service: service, fix: FixedFix(nil), clock: Clock()).recordIfDue()
        await makeSUT(service: service, fix: FixedFix(lisbon), clock: Clock(), account: nil).recordIfDue()

        XCTAssertTrue(service.recorded.isEmpty)
    }

    func test_aPointTheGatewayDidNotKeep_isOfferedAgainAtTheNextReturn() async {
        let service = BloodLocationModelTests.FakeBloodLocation()
        service.keeps = false
        let sut = makeSUT(service: service, fix: FixedFix(lisbon), clock: Clock())

        await sut.recordIfDue()
        await sut.recordIfDue()

        XCTAssertEqual(service.recorded.count, 2)
    }

    // MARK: - « Où il est » sur la face Actions (planche Autre-Actions)

    func test_whereDetail_saysThePrecisionThenTheTimeLeft() {
        let window = SharedLocationWindow(deadline: t0.addingTimeInterval(42 * 60), now: t0)

        let detail = LocationMapCopy.whereDetail(.neighborhood, window: window)

        XCTAssertTrue(detail.hasPrefix(LocationMapCopy.precisionPill(.neighborhood)))
        XCTAssertTrue(detail.hasSuffix(LocationMapCopy.remaining(window)))
    }

    func test_whereDetail_ofAnEndedShare_neverSaysATimeLeft() {
        let window = SharedLocationWindow(deadline: t0.addingTimeInterval(-5), now: t0)

        XCTAssertEqual(LocationMapCopy.whereDetail(.city, window: window), LocationMapCopy.precisionPill(.city))
    }
}
