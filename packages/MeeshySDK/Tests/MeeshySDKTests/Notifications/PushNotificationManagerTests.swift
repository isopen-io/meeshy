import XCTest
@testable import MeeshySDK

final class PushNotificationManagerTests: XCTestCase {

    // MARK: - apnsEnvironment compile-time constant

    @MainActor
    func test_apnsEnvironment_isDevelopmentInDebugBuilds() throws {
        // The test target compiles in DEBUG configuration, so the constant
        // MUST resolve to "development". A release-mode test build would
        // resolve to "production" — this is the contract.
        // PushNotificationManager is @MainActor-isolated, so this test must
        // run on the main actor to read its static property.
        #if DEBUG
        XCTAssertEqual(PushNotificationManager.apnsEnvironment, "development")
        #else
        XCTAssertEqual(PushNotificationManager.apnsEnvironment, "production")
        #endif
    }

    // MARK: - RegisterDeviceTokenRequest encoding

    func test_registerDeviceTokenRequest_encodesApnsEnvironment_whenProvided() throws {
        let request = RegisterDeviceTokenRequest(
            token: "abc123def456",
            platform: "ios",
            type: "apns",
            apnsEnvironment: "development"
        )

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["token"] as? String, "abc123def456")
        XCTAssertEqual(json["platform"] as? String, "ios")
        XCTAssertEqual(json["type"] as? String, "apns")
        XCTAssertEqual(json["apnsEnvironment"] as? String, "development")
    }

    func test_registerDeviceTokenRequest_omitsApnsEnvironment_whenNil() throws {
        // When the field is nil, JSONEncoder's default strategy is to OMIT the
        // key (Optional<String>.none → encoder doesn't write). Verifying this
        // explicitly because the gateway treats absent and "production" as
        // equivalent — but a present "null" string would be a regression.
        let request = RegisterDeviceTokenRequest(
            token: "abc123def456",
            platform: "ios",
            type: "apns",
            apnsEnvironment: nil
        )

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(json["apnsEnvironment"])
        XCTAssertEqual(json["token"] as? String, "abc123def456")
    }

    func test_registerDeviceTokenRequest_defaultInit_omitsApnsEnvironment() throws {
        // Default init must keep apnsEnvironment as nil so the gateway falls
        // back to "production" — i.e. legacy callers (not yet upgraded) keep
        // working exactly as before.
        let request = RegisterDeviceTokenRequest(token: "abc123def456")

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(json["apnsEnvironment"])
    }
}
