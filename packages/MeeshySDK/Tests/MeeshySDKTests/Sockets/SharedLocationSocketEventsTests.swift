import Combine
import XCTest
@testable import MeeshySDK

private final class SharedLocationRegistrar: SocketEventRegistering {
    private var receivers: [String: ([Any]) -> Void] = [:]

    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void) {
        receivers[event] = receive
    }

    func deliver(_ event: String, _ payload: [String: Any]) {
        receivers[event]?([payload])
    }
}

/// `location:share-changed` et `location:share-ended`, sur la room `user:<id>` (#14109, #16983) : ce qui arrive est ce
/// que la passerelle a servi À CE LECTEUR, et rien de plus.
final class SharedLocationSocketEventsTests: XCTestCase {

    private func installed() -> SharedLocationRegistrar {
        let registrar = SharedLocationRegistrar()
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
        XCTAssertEqual(SocketEvent.locationShareChanged.rawValue, "location:share-changed")
        XCTAssertEqual(SocketEvent.locationShareEnded.rawValue, "location:share-ended")
    }

    func test_aPositionBlurredToTheNeighborhood_isDeliveredAsServed() async {
        let registrar = installed()
        let id = "u-\(UUID().uuidString)"
        await expectValue(of: SharedLocationEvents.changed, where: {
            $0.userId == id && $0.precision == .neighborhood && $0.radiusMeters == 800
        }) {
            registrar.deliver("location:share-changed", [
                "userId": id, "latitude": 48.855, "longitude": 2.345, "precision": "neighborhood",
                "radiusMeters": 800, "updatedAt": "2026-11-13T10:00:00.000Z", "expiresAt": "2026-11-13T11:00:00.000Z",
            ])
        }
    }

    func test_endedIsDelivered() async {
        let registrar = installed()
        let id = "u-\(UUID().uuidString)"
        await expectValue(of: SharedLocationEvents.ended, where: { $0.userId == id }) {
            registrar.deliver("location:share-ended", ["userId": id])
        }
    }
}
