import XCTest
import Combine
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

    // MARK: - noteMessageActivity

    @MainActor
    func test_noteMessageActivity_messageType_emitsConversationId() {
        let sut = PushNotificationManager.shared
        var received: [String] = []
        let c = sut.messageNotificationReceived.sink { received.append($0) }
        sut.noteMessageActivity(userInfo: ["type": "message", "conversationId": "conv-1"])
        c.cancel()
        XCTAssertEqual(received, ["conv-1"])
    }

    @MainActor
    func test_noteMessageActivity_messageIdPresent_emitsConversationId() {
        let sut = PushNotificationManager.shared
        var received: [String] = []
        let c = sut.messageNotificationReceived.sink { received.append($0) }
        sut.noteMessageActivity(userInfo: ["messageId": "msg-9", "conversationId": "conv-2"])
        c.cancel()
        XCTAssertEqual(received, ["conv-2"])
    }

    @MainActor
    func test_noteMessageActivity_friendRequest_emitsNothing() {
        let sut = PushNotificationManager.shared
        var received: [String] = []
        let c = sut.messageNotificationReceived.sink { received.append($0) }
        sut.noteMessageActivity(userInfo: ["type": "friend_request", "conversationId": "conv-1"])
        c.cancel()
        XCTAssertTrue(received.isEmpty)
    }

    @MainActor
    func test_noteMessageActivity_missingConversationId_emitsNothing() {
        let sut = PushNotificationManager.shared
        var received: [String] = []
        let c = sut.messageNotificationReceived.sink { received.append($0) }
        sut.noteMessageActivity(userInfo: ["type": "message"])
        c.cancel()
        XCTAssertTrue(received.isEmpty)
    }

    // MARK: - registerDeviceToken (P1.3 — APNs registration chain)

    /// Tests against an isolated `UserDefaults` suite rather than
    /// `UserDefaults.standard` (which is a process-wide singleton and
    /// would have leaked state across this and other test classes).
    /// Each test builds its own SUT and tears down its suite — no
    /// `defer { restore previous value }` patch-up, no order coupling.
    @MainActor
    private func makePushManagerSUT(file: StaticString = #file, line: UInt = #line)
    -> (sut: PushNotificationManager, defaults: UserDefaults, suiteName: String)
    {
        let suiteName = "test.push.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated UserDefaults suite", file: file, line: line)
            return (PushNotificationManager(userDefaults: .standard), .standard, suiteName)
        }
        return (PushNotificationManager(userDefaults: defaults), defaults, suiteName)
    }

    @MainActor
    private func tearDownDefaults(_ defaults: UserDefaults, suiteName: String) {
        defaults.removePersistentDomain(forName: suiteName)
    }

    /// Regression test for the AppDelegate
    /// `didRegisterForRemoteNotificationsWithDeviceToken` → manager chain.
    /// The audit previously suspected APNs registration was missing in code;
    /// this test pins the actual contract so any future refactor that breaks
    /// the chain (e.g. forgets to flip `@Published deviceToken`, or stops
    /// persisting for `reRegisterTokenIfNeeded`) fails loudly.
    @MainActor
    func test_registerDeviceToken_setsPublishedTokenAndPersistsHex() {
        let (sut, defaults, suite) = makePushManagerSUT()
        defer { tearDownDefaults(defaults, suiteName: suite) }

        let tokenData = Data([0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04])
        sut.registerDeviceToken(tokenData)

        XCTAssertEqual(sut.deviceToken, "deadbeef01020304")
        XCTAssertEqual(
            defaults.string(forKey: PushNotificationManager.persistedTokenKey),
            "deadbeef01020304"
        )
    }

    /// `init(userDefaults:)` must read any previously persisted token so
    /// `reRegisterTokenIfNeeded` has something to re-post when the app comes
    /// back. Without this, a cold start after the user re-installed iOS
    /// would silently drop the registration.
    @MainActor
    func test_init_readsPersistedTokenFromInjectedDefaults() {
        let suiteName = "test.push.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set("cafefoodbeef", forKey: PushNotificationManager.persistedTokenKey)

        let sut = PushNotificationManager(userDefaults: defaults)

        XCTAssertEqual(sut.deviceToken, "cafefoodbeef")
    }

    // Note: `unregisterDeviceToken()` is intentionally NOT covered by a unit
    // test here because it issues a real `APIClient.shared.request` DELETE
    // before clearing the persisted token. Wiring an `APIClientProviding`
    // mock through `PushNotificationManager.init` would expand the scope of
    // this fix; the existing two tests already pin the injected-defaults
    // contract for the read + write paths. A follow-up PR can add the API
    // client injection if the unregister path needs unit coverage.
}
