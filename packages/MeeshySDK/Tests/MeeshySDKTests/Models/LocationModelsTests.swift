import XCTest
import CoreLocation
@testable import MeeshySDK

final class LocationModelsTests: XCTestCase {

    // MARK: - MeeshyLocationCoordinate

    func testLocationCoordinateInit() {
        let coord = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522, altitude: 35.0, accuracy: 10.0)

        XCTAssertEqual(coord.latitude, 48.8566)
        XCTAssertEqual(coord.longitude, 2.3522)
        XCTAssertEqual(coord.altitude, 35.0)
        XCTAssertEqual(coord.accuracy, 10.0)
    }

    func testLocationCoordinateInitWithDefaults() {
        let coord = MeeshyLocationCoordinate(latitude: 40.7128, longitude: -74.0060)

        XCTAssertNil(coord.altitude)
        XCTAssertNil(coord.accuracy)
    }

    func testLocationCoordinateCodableRoundtrip() throws {
        let original = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522, altitude: 35.0, accuracy: 10.0)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MeeshyLocationCoordinate.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testLocationCoordinateEquatable() {
        let a = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522)
        let b = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522)
        let c = MeeshyLocationCoordinate(latitude: 51.5074, longitude: -0.1278)

        XCTAssertEqual(a, b)
        XCTAssertNotEqual(a, c)
    }

    func testLocationCoordinateCLLocationCoordinate() {
        let coord = MeeshyLocationCoordinate(latitude: 48.8566, longitude: 2.3522)
        let cl = coord.clLocationCoordinate

        XCTAssertEqual(cl.latitude, 48.8566)
        XCTAssertEqual(cl.longitude, 2.3522)
    }

    // MARK: - LocationSharePayload

    func testLocationSharePayloadEncoding() throws {
        let payload = LocationSharePayload(
            conversationId: "conv1",
            latitude: 48.8566,
            longitude: 2.3522,
            altitude: 35.0,
            accuracy: 10.0,
            placeName: "Eiffel Tower",
            address: "Paris, France"
        )

        let data = try JSONEncoder().encode(payload)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["conversationId"] as? String, "conv1")
        XCTAssertEqual(dict["latitude"] as? Double, 48.8566)
        XCTAssertEqual(dict["longitude"] as? Double, 2.3522)
        XCTAssertEqual(dict["placeName"] as? String, "Eiffel Tower")
        XCTAssertEqual(dict["address"] as? String, "Paris, France")
    }

    // MARK: - LocationSharedEvent

    func testLocationSharedEventDecoding() throws {
        let json = """
        {
            "messageId": "msg1",
            "conversationId": "conv1",
            "userId": "user1",
            "latitude": 48.8566,
            "longitude": 2.3522,
            "altitude": 35.0,
            "accuracy": 10.0,
            "placeName": "Tour Eiffel",
            "address": "Paris"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let event = try decoder.decode(LocationSharedEvent.self, from: json)

        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.userId, "user1")
        XCTAssertEqual(event.latitude, 48.8566)
        XCTAssertEqual(event.longitude, 2.3522)
        XCTAssertEqual(event.altitude, 35.0)
        XCTAssertEqual(event.placeName, "Tour Eiffel")
        XCTAssertNil(event.timestamp)
    }

    // MARK: - LiveLocationDuration

    func testLiveLocationDurationAllCases() {
        let cases = LiveLocationDuration.allCases
        XCTAssertEqual(cases.count, 5)

        let rawValues = cases.map(\.rawValue)
        XCTAssertEqual(rawValues, [15, 30, 60, 120, 480])
    }

    func testLiveLocationDurationDisplayText() {
        XCTAssertEqual(LiveLocationDuration.fifteenMinutes.displayText, "15 min")
        XCTAssertEqual(LiveLocationDuration.thirtyMinutes.displayText, "30 min")
        XCTAssertEqual(LiveLocationDuration.oneHour.displayText, "1 heure")
        XCTAssertEqual(LiveLocationDuration.twoHours.displayText, "2 heures")
        XCTAssertEqual(LiveLocationDuration.eightHours.displayText, "8 heures")
    }

    // MARK: - LiveLocationStartPayload

    func testLiveLocationStartPayloadEncoding() throws {
        let payload = LiveLocationStartPayload(
            conversationId: "conv1",
            latitude: 48.8566,
            longitude: 2.3522,
            durationMinutes: 60
        )

        let data = try JSONEncoder().encode(payload)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["conversationId"] as? String, "conv1")
        XCTAssertEqual(dict["durationMinutes"] as? Int, 60)
    }

    // MARK: - ActiveLiveLocation

    func testActiveLiveLocationIsExpiredWithPastDate() {
        let location = ActiveLiveLocation(
            userId: "user1",
            username: "alice",
            latitude: 48.8566,
            longitude: 2.3522,
            expiresAt: Date().addingTimeInterval(-60),
            startedAt: Date().addingTimeInterval(-3600)
        )

        XCTAssertTrue(location.isExpired)
        XCTAssertEqual(location.remainingTime, 0)
    }

    func testActiveLiveLocationIsNotExpiredWithFutureDate() {
        let location = ActiveLiveLocation(
            userId: "user2",
            username: "bob",
            latitude: 40.7128,
            longitude: -74.0060,
            expiresAt: Date().addingTimeInterval(3600),
            startedAt: Date()
        )

        XCTAssertFalse(location.isExpired)
        XCTAssertGreaterThan(location.remainingTime, 0)
    }

    func testActiveLiveLocationIdEqualsUserId() {
        let location = ActiveLiveLocation(
            userId: "user3",
            username: "charlie",
            latitude: 0,
            longitude: 0,
            expiresAt: Date().addingTimeInterval(60),
            startedAt: Date()
        )

        XCTAssertEqual(location.id, "user3")
    }
}
