import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// Le Bring sur la fiche d'une personne (#13936) : absent quand la passerelle ne l'ouvre pas, recompté depuis la
/// réponse de l'envoi, et « Ça sonne chez X » tant que le centre le garde en vol.
@MainActor
final class ProfileBringViewModelTests: XCTestCase {

    private func makeSUT(service: MockBringService) -> (ProfileBringViewModel, BringCenter) {
        let center = BringCenter(
            service: service,
            people: FakeCirclePeople(),
            ringer: FakeBringRinger(),
            ringEvents: Empty().eraseToAnyPublisher(),
            stoppedEvents: Empty().eraseToAnyPublisher()
        )
        return (ProfileBringViewModel(userId: "bob", service: service, center: center), center)
    }

    private func available(_ remaining: Int?) -> BringAvailability {
        BringAvailability(userId: "bob", available: true, perDay: 1, remainingToday: remaining)
    }

    private func sent(remaining: Int?) -> BringSent {
        BringSent(bringId: "b1", toUserId: "bob", sentAt: "", expiresAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(120)), perDay: 1, remainingToday: remaining)
    }

    func test_unavailable_hidesTheRow() async {
        let service = MockBringService()
        service.availabilityResult = .success(BringAvailability(userId: "bob", available: false, perDay: nil, remainingToday: 0))
        let (sut, _) = makeSUT(service: service)

        await sut.load()

        XCTAssertFalse(sut.isOffered)
    }

    func test_aFailedRead_hidesTheRow() async {
        let (sut, _) = makeSUT(service: MockBringService())

        await sut.load()

        XCTAssertFalse(sut.isOffered)
    }

    func test_send_ringsAndRecountsFromTheResponse() async {
        let service = MockBringService()
        service.availabilityResult = .success(available(1))
        service.sendOutcome = .sent(sent(remaining: 0))
        let (sut, center) = makeSUT(service: service)
        await sut.load()

        await sut.send(name: "Bob")

        XCTAssertEqual(service.sentTo, ["bob"])
        XCTAssertEqual(sut.ringing?.bringId, "b1")
        XCTAssertEqual(center.outgoing["bob"]?.bringId, "b1")
        XCTAssertEqual(sut.availability?.remainingToday, 0)
    }

    func test_send_whenTheButtonIsGone_hidesIt() async {
        let service = MockBringService()
        service.availabilityResult = .success(available(1))
        service.sendOutcome = .gone
        let (sut, _) = makeSUT(service: service)
        await sut.load()

        await sut.send(name: "Bob")

        XCTAssertFalse(sut.isOffered)
        XCTAssertNil(sut.notice)
    }

    func test_send_quota_saysSo_andExhaustsTheCounter() async {
        let service = MockBringService()
        service.availabilityResult = .success(available(1))
        service.sendOutcome = .quota
        let (sut, _) = makeSUT(service: service)
        await sut.load()

        await sut.send(name: "Bob")

        XCTAssertEqual(sut.availability?.isExhausted, true)
        XCTAssertNotNil(sut.notice)
    }

    func test_send_whenExhausted_sendsNothing() async {
        let service = MockBringService()
        service.availabilityResult = .success(available(0))
        let (sut, _) = makeSUT(service: service)
        await sut.load()

        await sut.send(name: "Bob")

        XCTAssertEqual(service.sentTo, [])
    }

    func test_cancel_stopsTheRingingOptimistically() async {
        let service = MockBringService()
        service.availabilityResult = .success(available(1))
        service.sendOutcome = .sent(sent(remaining: 0))
        let (sut, center) = makeSUT(service: service)
        await sut.load()
        await sut.send(name: "Bob")

        sut.cancel()

        XCTAssertNil(sut.ringing)
        XCTAssertNil(center.outgoing["bob"])
    }
}
