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
