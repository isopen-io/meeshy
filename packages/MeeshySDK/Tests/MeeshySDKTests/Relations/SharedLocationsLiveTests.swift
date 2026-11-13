import Combine
import XCTest
@testable import MeeshySDK

/// Les positions qu'on me partage, en direct (#16983, iso du web #16984) : ce qui s'affiche est ce que la passerelle a
/// servi, jamais plus fin ; une montée de précision rend la position plus fine sans recharger, une fin, un blocage ou
/// l'échéance l'effacent, et le rattrapage fait foi dans son emprise sans effacer ce qui arrive pendant sa demande.
@MainActor
final class SharedLocationsLiveTests: XCTestCase {

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private struct Rig {
        let sut: SharedLocationsLive
        let clock: Clock
    }

    private func makeRig(
        viewer: String = "me",
        snapshot: @escaping SharedLocationsLive.Snapshot = { _ in [] }
    ) -> Rig {
        let clock = Clock()
        let sut = SharedLocationsLive(
            viewerId: { viewer },
            snapshot: snapshot,
            changedEvents: Empty().eraseToAnyPublisher(),
            endedEvents: Empty().eraseToAnyPublisher(),
            connected: Empty().eraseToAnyPublisher(),
            now: { clock.now }
        )
        return Rig(sut: sut, clock: clock)
    }

    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func served(
        _ userId: String = "alice",
        latitude: Double = 48.85,
        longitude: Double = 2.35,
        precision: SharedLocationPrecision = .city,
        radius: Double = 8000,
        at offset: TimeInterval = 0,
        lifetime: TimeInterval = 3600
    ) -> SharedLocationChanged {
        SharedLocationChanged(
            userId: userId, latitude: latitude, longitude: longitude, precision: precision, radiusMeters: radius,
            updatedAt: t0.addingTimeInterval(offset), expiresAt: t0.addingTimeInterval(offset + lifetime)
        )
    }

    private let paris = SharedLocationBounds(minLongitude: 2, minLatitude: 48, maxLongitude: 3, maxLatitude: 49)

    // MARK: - Ce qui est servi, et rien de plus

    func test_receive_keepsThePositionAsServed() {
        let rig = makeRig()

        rig.sut.receive(served())

        let entry = rig.sut.byUser["alice"]
        XCTAssertEqual(entry?.precision, .city)
        XCTAssertEqual(entry?.latitude, 48.85)
        XCTAssertEqual(entry?.radiusMeters, 8000)
        XCTAssertEqual(entry?.deadline, t0.addingTimeInterval(3600))
    }

    func test_aRaisedPrecision_makesThePositionFinerWithoutReloading() {
        let rig = makeRig()
        rig.sut.receive(served(precision: .city, radius: 8000))

        rig.sut.receive(served(latitude: 48.8534, longitude: 2.3488, precision: .exact, radius: 15, at: 1))

        XCTAssertEqual(rig.sut.byUser["alice"]?.precision, .exact)
        XCTAssertEqual(rig.sut.byUser["alice"]?.radiusMeters, 15)
    }

    func test_aLoweredPrecision_makesThePositionCoarser() {
        let rig = makeRig()
        rig.sut.receive(served(latitude: 48.8534, precision: .exact, radius: 15))

        rig.sut.receive(served(latitude: 48.85, precision: .city, radius: 8000, at: 1))

        XCTAssertEqual(rig.sut.byUser["alice"]?.precision, .city)
        XCTAssertEqual(rig.sut.byUser["alice"]?.latitude, 48.85)
    }

    func test_anOlderPosition_neverOverwritesTheKeptOne() {
        let rig = makeRig()
        rig.sut.receive(served(precision: .exact, radius: 15, at: 10))

        rig.sut.receive(served(precision: .city, at: 0))

        XCTAssertEqual(rig.sut.byUser["alice"]?.precision, .exact)
    }

    func test_myOwnPosition_isNotShownHere() {
        let rig = makeRig(viewer: "me")

        rig.sut.receive(served("me"))

        XCTAssertTrue(rig.sut.byUser.isEmpty)
    }

    func test_anAlreadyExpiredShare_isNotShown() {
        let rig = makeRig()

        rig.sut.receive(served(lifetime: 0))

        XCTAssertNil(rig.sut.byUser["alice"])
    }

    // MARK: - Ce qui l'efface

    func test_ended_clearsThePosition() {
        let rig = makeRig()
        rig.sut.receive(served())

        rig.sut.clear("alice")

        XCTAssertNil(rig.sut.byUser["alice"])
    }

    func test_theDeadline_clearsThePositionWithoutAnyServerEvent() {
        let rig = makeRig()
        rig.sut.receive(served(lifetime: 3600))
        rig.sut.receive(served("bob", lifetime: 7200))

        rig.clock.now = t0.addingTimeInterval(3600)
        rig.sut.expireDue()

        XCTAssertNil(rig.sut.byUser["alice"])
        XCTAssertNotNil(rig.sut.byUser["bob"])
    }

    // MARK: - Le rattrapage fait foi dans son emprise

    func test_catchUp_aShareEndedWhileOffline_isCleared() async {
        let rig = makeRig(snapshot: { _ in [] })
        rig.sut.receive(served())

        await rig.sut.catchUp(within: nil)

        XCTAssertNil(rig.sut.byUser["alice"])
    }

    func test_catchUp_withinBounds_leavesWhatLiesOutsideUntouched() async {
        let rig = makeRig(snapshot: { _ in [] })
        rig.sut.receive(served("alice", latitude: 48.85, longitude: 2.35))
        rig.sut.receive(served("bob", latitude: 45.76, longitude: 4.83))

        await rig.sut.catchUp(within: paris)

        XCTAssertNil(rig.sut.byUser["alice"])
        XCTAssertNotNil(rig.sut.byUser["bob"])
    }

    func test_reconcile_keepsWhatArrivedDuringTheRequest() {
        let rig = makeRig()
        let mark = rig.sut.mark()
        rig.sut.receive(served())

        rig.sut.reconcile([], mark: mark, within: nil)

        XCTAssertNotNil(rig.sut.byUser["alice"])
    }

    func test_catchUp_readsTheSnapshotForTheAskedBounds_andSkipsMyOwnPosition() async {
        final class Asked: @unchecked Sendable { var bounds: [SharedLocationBounds?] = [] }
        let asked = Asked()
        let items = [served("alice"), served("me")]
        let rig = makeRig(viewer: "me", snapshot: { bounds in
            asked.bounds.append(bounds)
            return items
        })

        await rig.sut.catchUp(within: paris)

        XCTAssertEqual(asked.bounds, [paris])
        XCTAssertEqual(Set(rig.sut.byUser.keys), ["alice"])
    }

    func test_eachSocketConnection_triggersAWholeMapCatchUp() async {
        final class Asked: @unchecked Sendable { var bounds: [SharedLocationBounds?] = [] }
        let asked = Asked()
        let connected = PassthroughSubject<Bool, Never>()
        let fetched = expectation(description: "rattrapage")
        let sut = SharedLocationsLive(
            viewerId: { "me" },
            snapshot: { bounds in
                asked.bounds.append(bounds)
                fetched.fulfill()
                return []
            },
            changedEvents: Empty().eraseToAnyPublisher(),
            endedEvents: Empty().eraseToAnyPublisher(),
            connected: connected.eraseToAnyPublisher()
        )

        connected.send(false)
        connected.send(true)

        await fulfillment(of: [fetched], timeout: 2)
        XCTAssertEqual(asked.bounds, [nil])
        XCTAssertTrue(sut.byUser.isEmpty)
    }
}
