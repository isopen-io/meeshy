import Combine
import XCTest
@testable import MeeshySDK

private final class BringRegistrar: SocketEventRegistering {
    private var receivers: [String: ([Any]) -> Void] = [:]

    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void) {
        receivers[event] = receive
    }

    func deliver(_ event: String, _ payload: [String: Any]) {
        receivers[event]?([payload])
    }
}

/// `bring:ring` (destinataire) et `bring:stopped` (les deux), sur la room `user:<id>` (#13936).
final class BringSocketEventsTests: XCTestCase {

    private func installed() -> BringRegistrar {
        let registrar = BringRegistrar()
        registrar.install(MessageSocketRoutes.all(for: .shared))
        return registrar
    }

    private func expectValue<P: Publisher>(
        of publisher: P,
        where matches: @escaping (P.Output) -> Bool,
        after trigger: () -> Void
    ) async where P.Failure == Never {
        let published = expectation(description: "publication")
        let subscription = publisher.sink { if matches($0) { published.fulfill() } }
        trigger()
        await fulfillment(of: [published], timeout: 2)
        subscription.cancel()
    }

    func test_theWireNamesAreTheServerOnes() {
        XCTAssertEqual(SocketEvent.bringRing.rawValue, "bring:ring")
        XCTAssertEqual(SocketEvent.bringStopped.rawValue, "bring:stopped")
    }

    func test_ringIsDeliveredDecoded() async {
        let registrar = installed()
        let id = "ring-\(UUID().uuidString)"
        await expectValue(of: BringEvents.ring, where: { $0.bringId == id && $0.fromUserId == "u2" }) {
            registrar.deliver("bring:ring", [
                "bringId": id, "fromUserId": "u2", "toUserId": "me",
                "sentAt": "2026-11-07T10:00:00.000Z", "expiresAt": "2026-11-07T10:02:00.000Z",
            ])
        }
    }

    func test_stoppedIsDeliveredWithItsReason() async {
        let registrar = installed()
        let id = "stop-\(UUID().uuidString)"
        await expectValue(of: BringEvents.stopped, where: { $0.bringId == id && $0.reason == .recipient }) {
            registrar.deliver("bring:stopped", [
                "bringId": id, "fromUserId": "u2", "toUserId": "me", "reason": "recipient",
                "stoppedAt": "2026-11-07T10:00:30.000Z",
            ])
        }
    }

    func test_anUnknownReasonIsKeptAsNilNotACrash() async {
        let registrar = installed()
        let id = "stop-\(UUID().uuidString)"
        await expectValue(of: BringEvents.stopped, where: { $0.bringId == id && $0.reason == nil }) {
            registrar.deliver("bring:stopped", ["bringId": id, "fromUserId": "u2", "toUserId": "me", "reason": "teleported"])
        }
    }
}
