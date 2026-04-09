import XCTest
import Combine
@testable import MeeshySDK

final class LocationServiceTests: XCTestCase {

    // MARK: - Publisher existence

    func testLocationSharedPublisherReceivesEvents() {
        let service = LocationService.shared
        var received: LocationSharedEvent?
        let expectation = expectation(description: "locationShared event received")

        let cancellable = service.locationShared.sink { event in
            received = event
            expectation.fulfill()
        }

        let event = LocationSharedEvent(
            messageId: "msg1", conversationId: "conv1", userId: "u1",
            latitude: 48.8566, longitude: 2.3522,
            altitude: nil, accuracy: nil, placeName: "Paris", address: nil, timestamp: nil
        )
        service.locationShared.send(event)

        waitForExpectations(timeout: 1)
        XCTAssertEqual(received?.messageId, "msg1")
        XCTAssertEqual(received?.conversationId, "conv1")
        XCTAssertEqual(received?.latitude, 48.8566)
        XCTAssertEqual(received?.placeName, "Paris")
        cancellable.cancel()
    }

    func testLiveLocationStartedPublisherReceivesEvents() {
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

    func testLiveLocationUpdatedPublisherReceivesEvents() {
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

    func testLiveLocationStoppedPublisherReceivesEvents() {
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

    func testProtocolConformance() {
        let service: LocationServiceProviding = LocationService.shared
        XCTAssertNotNil(service.locationShared)
        XCTAssertNotNil(service.liveLocationStarted)
        XCTAssertNotNil(service.liveLocationUpdated)
        XCTAssertNotNil(service.liveLocationStopped)
    }

    func testMultipleSubscribersReceiveEvents() {
        let service = LocationService.shared
        var received1: LocationSharedEvent?
        var received2: LocationSharedEvent?
        let exp1 = expectation(description: "subscriber 1")
        let exp2 = expectation(description: "subscriber 2")

        let cancellable1 = service.locationShared.sink { event in
            received1 = event
            exp1.fulfill()
        }
        let cancellable2 = service.locationShared.sink { event in
            received2 = event
            exp2.fulfill()
        }

        let event = LocationSharedEvent(
            messageId: "msg2", conversationId: "conv2", userId: "u2",
            latitude: 40.7128, longitude: -74.0060,
            altitude: nil, accuracy: nil, placeName: nil, address: nil, timestamp: nil
        )
        service.locationShared.send(event)

        waitForExpectations(timeout: 1)
        XCTAssertEqual(received1?.messageId, "msg2")
        XCTAssertEqual(received2?.messageId, "msg2")
        cancellable1.cancel()
        cancellable2.cancel()
    }
}
