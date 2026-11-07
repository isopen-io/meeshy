import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Le Bring sur iOS (#13936) : un Bring sonne UNE fois, cesse d'un geste chez tous, cesse seul à `expiresAt`, et un
/// Bring déjà arrêté ne resonne jamais — même quand son push arrive après son arrêt.
@MainActor
final class BringCenterTests: XCTestCase {

    private struct Rig {
        let sut: BringCenter
        let service: MockBringService
        let ringer: FakeBringRinger
        let clock: Clock
        let rings: PassthroughSubject<BringRing, Never>
        let stops: PassthroughSubject<BringStopped, Never>
    }

    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private func makeRig(people: [CirclePerson] = []) -> Rig {
        let service = MockBringService()
        let ringer = FakeBringRinger()
        let clock = Clock()
        let rings = PassthroughSubject<BringRing, Never>()
        let stops = PassthroughSubject<BringStopped, Never>()
        let sut = BringCenter(
            service: service,
            people: FakeCirclePeople(people),
            ringer: ringer,
            ringEvents: rings.eraseToAnyPublisher(),
            stoppedEvents: stops.eraseToAnyPublisher(),
            now: { clock.now }
        )
        return Rig(sut: sut, service: service, ringer: ringer, clock: clock, rings: rings, stops: stops)
    }

    private func ring(_ id: String = "b1", from: String = "alice", in seconds: TimeInterval = 120, clock: Clock) -> BringRing {
        let formatter = ISO8601DateFormatter()
        return BringRing(
            bringId: id, fromUserId: from, toUserId: "me",
            sentAt: formatter.string(from: clock.now),
            expiresAt: formatter.string(from: clock.now.addingTimeInterval(seconds))
        )
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 50_000_000)
    }

    func test_aRing_showsTheScreenAndRings() {
        let rig = makeRig()

        rig.sut.receive(ring(clock: rig.clock), name: "Alice")

        XCTAssertEqual(rig.sut.incoming?.id, "b1")
        XCTAssertEqual(rig.sut.incoming?.name, "Alice")
        XCTAssertTrue(rig.ringer.isRinging)
    }

    func test_theSameBringFromSocketAndPush_ringsOnce() {
        let rig = makeRig()
        let bring = ring(clock: rig.clock)

        rig.sut.receive(bring)
        rig.sut.receive(push: BringRing(push: [
            "type": "bring", "bringId": "b1", "fromUserId": "alice",
            "sentAt": bring.sentAt, "expiresAt": bring.expiresAt,
        ]), stopped: nil, name: "Alice", avatarURL: "")

        XCTAssertEqual(rig.ringer.starts, 1)
    }

    func test_stop_isOneGesture_optimistic_andPropagated() async {
        let rig = makeRig()
        rig.sut.receive(ring(clock: rig.clock))

        rig.sut.stopIncoming()

        XCTAssertNil(rig.sut.incoming)
        XCTAssertFalse(rig.ringer.isRinging)
        await settle()
        XCTAssertEqual(rig.service.stopped, ["b1"])
    }

    func test_aStoppedBring_neverRingsAgain_evenWhenItsPushArrivesLate() {
        let rig = makeRig()
        let bring = ring(clock: rig.clock)
        rig.sut.receive(bring)
        rig.sut.didStop("b1")

        rig.sut.receive(bring)

        XCTAssertNil(rig.sut.incoming)
        XCTAssertEqual(rig.ringer.starts, 1)
    }

    func test_bringStoppedOnTheSocket_stopsTheRinging() async {
        let rig = makeRig()
        rig.sut.receive(ring(clock: rig.clock))

        rig.stops.send(BringStopped(bringId: "b1", fromUserId: "alice", toUserId: "me", reason: .sender))
        await settle()

        XCTAssertNil(rig.sut.incoming)
        XCTAssertFalse(rig.ringer.isRinging)
    }

    func test_bringRingOnTheSocket_reachesTheCenter() async {
        let rig = makeRig()

        rig.rings.send(ring(clock: rig.clock))
        await settle()

        XCTAssertEqual(rig.sut.incoming?.id, "b1")
    }

    func test_theRinging_stopsAlone_atExpiresAt_withoutAnyEvent() {
        let rig = makeRig()
        rig.sut.receive(ring(in: 120, clock: rig.clock))

        rig.clock.now = rig.clock.now.addingTimeInterval(121)
        rig.sut.expireDue()

        XCTAssertNil(rig.sut.incoming)
        XCTAssertFalse(rig.ringer.isRinging)
    }

    func test_anAlreadyExpiredBring_doesNotRing() {
        let rig = makeRig()

        rig.sut.receive(ring(in: -1, clock: rig.clock))

        XCTAssertNil(rig.sut.incoming)
        XCTAssertEqual(rig.ringer.starts, 0)
    }

    func test_withoutAServedName_theCachesNameThePerson() async {
        let rig = makeRig(people: [CirclePerson(id: "alice", name: "Alice Martin", username: "alice", avatarURL: nil)])

        rig.sut.receive(ring(clock: rig.clock))
        await settle()

        XCTAssertEqual(rig.sut.incoming?.name, "Alice Martin")
    }

    func test_outgoing_isKeptUntilCancelled_andCancelStopsIt() async {
        let rig = makeRig()
        let sent = BringSent(bringId: "b9", toUserId: "bob", sentAt: "", expiresAt: ISO8601DateFormatter().string(from: rig.clock.now.addingTimeInterval(120)), perDay: 1, remainingToday: 0)

        rig.sut.didSend(sent)
        XCTAssertEqual(rig.sut.outgoing["bob"], sent)

        rig.sut.cancelOutgoing(to: "bob")
        XCTAssertNil(rig.sut.outgoing["bob"])
        await settle()
        XCTAssertEqual(rig.service.stopped, ["b9"])
    }

    func test_outgoing_endsWhenTheRecipientStopsIt() {
        let rig = makeRig()
        let sent = BringSent(bringId: "b9", toUserId: "bob", sentAt: "", expiresAt: ISO8601DateFormatter().string(from: rig.clock.now.addingTimeInterval(120)), perDay: 1, remainingToday: 0)
        rig.sut.didSend(sent)

        rig.sut.didStop("b9")

        XCTAssertNil(rig.sut.outgoing["bob"])
    }

    func test_handlesPush_onlyTheTwoBringTypes() {
        XCTAssertTrue(BringCenter.handlesPush(["type": "bring"]))
        XCTAssertTrue(BringCenter.handlesPush(["type": "bring_stopped"]))
        XCTAssertFalse(BringCenter.handlesPush(["type": "new_message"]))
        XCTAssertFalse(BringCenter.handlesPush([:]))
    }
}
