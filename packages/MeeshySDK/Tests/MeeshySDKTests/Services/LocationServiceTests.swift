import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class LocationServiceTests: XCTestCase {

    // MARK: - Publisher existence

    func test_liveLocationStartedPublisher_eventSent_deliversToSubscriber() {
        let service = LocationService.shared
        var received: LiveLocationStartedEvent?
        let expectation = expectation(description: "liveLocationStarted event received")

        let cancellable = service.liveLocationStarted.sink { event in
            received = event
            expectation.fulfill()
        }

        let event = LiveLocationStartedEvent(
            conversationId: "conv1", userId: "u1", username: "alice",
            latitude: 48.8566, longitude: 2.3522, durationMinutes: 30,
            expiresAt: nil, startedAt: nil
        )
        service.liveLocationStarted.send(event)

        waitForExpectations(timeout: 1)
        XCTAssertEqual(received?.conversationId, "conv1")
        XCTAssertEqual(received?.username, "alice")
        XCTAssertEqual(received?.durationMinutes, 30)
        cancellable.cancel()
    }

    func test_liveLocationUpdatedPublisher_eventSent_deliversToSubscriber() {
        let service = LocationService.shared
        var received: LiveLocationUpdatedEvent?
        let expectation = expectation(description: "liveLocationUpdated event received")

        let cancellable = service.liveLocationUpdated.sink { event in
            received = event
            expectation.fulfill()
        }

        let event = LiveLocationUpdatedEvent(
            conversationId: "conv1", userId: "u1",
            latitude: 48.86, longitude: 2.35,
            altitude: 100.0, accuracy: 5.0, speed: 3.5, heading: 90.0, timestamp: nil
        )
        service.liveLocationUpdated.send(event)

        waitForExpectations(timeout: 1)
        XCTAssertEqual(received?.latitude, 48.86)
        XCTAssertEqual(received?.speed, 3.5)
        XCTAssertEqual(received?.heading, 90.0)
        cancellable.cancel()
    }

    func test_liveLocationStoppedPublisher_eventSent_deliversToSubscriber() {
        let service = LocationService.shared
        var received: LiveLocationStoppedEvent?
        let expectation = expectation(description: "liveLocationStopped event received")

        let cancellable = service.liveLocationStopped.sink { event in
            received = event
            expectation.fulfill()
        }

        let event = LiveLocationStoppedEvent(conversationId: "conv1", userId: "u1", stoppedAt: nil)
        service.liveLocationStopped.send(event)

        waitForExpectations(timeout: 1)
        XCTAssertEqual(received?.conversationId, "conv1")
        XCTAssertEqual(received?.userId, "u1")
        cancellable.cancel()
    }

    func test_locationService_asProtocol_exposesAllPublishers() {
        let service: LocationServiceProviding = LocationService.shared
        XCTAssertNotNil(service.liveLocationStarted)
        XCTAssertNotNil(service.liveLocationUpdated)
        XCTAssertNotNil(service.liveLocationStopped)
    }
}
