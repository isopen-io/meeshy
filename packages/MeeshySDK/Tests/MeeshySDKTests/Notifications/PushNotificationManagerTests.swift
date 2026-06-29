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

    // MARK: - handleNotification / clearPendingNotification (navigation intent)

    /// The root views consume push-tap navigation by observing
    /// `$pendingNotificationPayload` directly (no NotificationCenter hop), so
    /// `handleNotification` MUST set the published payload with the parsed
    /// conversationId intact — that published value is what survives a cold
    /// launch and is replayed to the root view when it mounts after the splash.
    @MainActor
    func test_handleNotification_setsPendingPayloadWithConversationId() {
        let (sut, defaults, _, suite) = makePushManagerSUT()
        defer { tearDownDefaults(defaults, suiteName: suite) }

        sut.handleNotification(userInfo: [
            "type": "new_message",
            "conversationId": "conv-42",
            "messageId": "msg-7"
        ])

        XCTAssertEqual(sut.pendingNotificationPayload?.conversationId, "conv-42")
        XCTAssertEqual(sut.pendingNotificationPayload?.messageId, "msg-7")
        XCTAssertEqual(sut.pendingNotificationPayload?.type, "new_message")
    }

    /// A tapped social comment push must carry the comment ids so the app can
    /// open the entity AND scroll to the exact comment / reply.
    @MainActor
    func test_handleNotification_setsPendingPayloadWithCommentIds() {
        let (sut, defaults, _, suite) = makePushManagerSUT()
        defer { tearDownDefaults(defaults, suiteName: suite) }

        sut.handleNotification(userInfo: [
            "type": "comment_reply",
            "postId": "post-1",
            "commentId": "reply-9",
            "parentCommentId": "parent-3"
        ])

        XCTAssertEqual(sut.pendingNotificationPayload?.postId, "post-1")
        XCTAssertEqual(sut.pendingNotificationPayload?.commentId, "reply-9")
        XCTAssertEqual(sut.pendingNotificationPayload?.parentCommentId, "parent-3")
    }

    /// Empty/absent comment ids resolve to nil (not the empty string) so the
    /// navigation falls back to "open post, no scroll" cleanly.
    @MainActor
    func test_handleNotification_emptyCommentId_resolvesToNil() {
        let (sut, defaults, _, suite) = makePushManagerSUT()
        defer { tearDownDefaults(defaults, suiteName: suite) }

        sut.handleNotification(userInfo: [
            "type": "post_like",
            "postId": "post-1",
            "commentId": ""
        ])

        XCTAssertNil(sut.pendingNotificationPayload?.commentId)
        XCTAssertNil(sut.pendingNotificationPayload?.parentCommentId)
    }

    /// After the root view navigates it calls `clearPendingNotification()` so
    /// the same intent is not re-consumed by a later subscriber (e.g. an
    /// iPhone↔iPad size-class flip that re-mounts the root view).
    @MainActor
    func test_clearPendingNotification_resetsPayloadToNil() {
        let (sut, defaults, _, suite) = makePushManagerSUT()
        defer { tearDownDefaults(defaults, suiteName: suite) }

        sut.handleNotification(userInfo: ["type": "new_message", "conversationId": "conv-1"])
        XCTAssertNotNil(sut.pendingNotificationPayload)

        sut.clearPendingNotification()
        XCTAssertNil(sut.pendingNotificationPayload)
    }

    // MARK: - registerDeviceToken (P1.3 — APNs registration chain)

    /// Tests against an isolated `UserDefaults` suite rather than
    /// `UserDefaults.standard` (which is a process-wide singleton and
    /// would have leaked state across this and other test classes).
    /// Each test builds its own SUT and tears down its suite — no
    /// `defer { restore previous value }` patch-up, no order coupling.
    // MARK: - MockKeychainStore

    final class MockKeychainStore: KeychainStoring, @unchecked Sendable {
        var store: [String: String] = [:]
        var saveError: Error?

        func save(_ value: String, forKey key: String, account: String?) throws {
            if let saveError { throw saveError }
            store[key] = value
        }

        func load(forKey key: String, account: String?) -> String? {
            store[key]
        }

        func delete(forKey key: String, account: String?) {
            store.removeValue(forKey: key)
        }

        func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
            try save(value, forKey: key, account: account)
        }

        func loadAsync(forKey key: String, account: String?) async -> String? {
            load(forKey: key, account: account)
        }
    }

    // MARK: - registerDeviceToken (P1.3 — APNs registration chain)

    @MainActor
    private func makePushManagerSUT(keychain: MockKeychainStore = MockKeychainStore(), file: StaticString = #file, line: UInt = #line)
    -> (sut: PushNotificationManager, defaults: UserDefaults, keychain: MockKeychainStore, suiteName: String)
    {
        let suiteName = "test.push.\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated UserDefaults suite", file: file, line: line)
            return (PushNotificationManager(userDefaults: .standard, keychainStore: keychain), .standard, keychain, suiteName)
        }
        return (PushNotificationManager(userDefaults: defaults, keychainStore: keychain), defaults, keychain, suiteName)
    }

    @MainActor
    private func tearDownDefaults(_ defaults: UserDefaults, suiteName: String) {
        defaults.removePersistentDomain(forName: suiteName)
    }

    @MainActor
    func test_registerDeviceToken_setsPublishedTokenAndPersistsHex() {
        let (sut, defaults, keychain, suite) = makePushManagerSUT()
        defer { tearDownDefaults(defaults, suiteName: suite) }

        let tokenData = Data([0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04])
        sut.registerDeviceToken(tokenData)

        XCTAssertEqual(sut.deviceToken, "deadbeef01020304")
        XCTAssertEqual(
            keychain.load(forKey: PushNotificationManager.persistedTokenKey, account: nil),
            "deadbeef01020304"
        )
        XCTAssertNil(defaults.string(forKey: PushNotificationManager.persistedTokenKey))
    }

    @MainActor
    func test_init_readsPersistedTokenFromInjectedDefaults() {
        let suiteName = "test.push.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let keychain = MockKeychainStore()
        try? keychain.save("cafefoodbeef", forKey: PushNotificationManager.persistedTokenKey, account: nil)

        let sut = PushNotificationManager(userDefaults: defaults, keychainStore: keychain)

        XCTAssertEqual(sut.deviceToken, "cafefoodbeef")
    }

    @MainActor
    func test_init_migratesPersistedTokenFromUserDefaultsToKeychain() {
        let suiteName = "test.push.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set("cafefoodbeef", forKey: PushNotificationManager.persistedTokenKey)
        defaults.set("cafefoodbeef_last", forKey: PushNotificationManager.lastRegisteredTokenKey)

        let keychain = MockKeychainStore()
        let sut = PushNotificationManager(userDefaults: defaults, keychainStore: keychain)

        XCTAssertEqual(sut.deviceToken, "cafefoodbeef")
        XCTAssertEqual(keychain.load(forKey: PushNotificationManager.persistedTokenKey, account: nil), "cafefoodbeef")
        XCTAssertEqual(keychain.load(forKey: PushNotificationManager.lastRegisteredTokenKey, account: nil), "cafefoodbeef_last")
        XCTAssertNil(defaults.string(forKey: PushNotificationManager.persistedTokenKey))
        XCTAssertNil(defaults.string(forKey: PushNotificationManager.lastRegisteredTokenKey))
    }

    // Note: `unregisterDeviceToken()` is intentionally NOT covered by a unit
    // test here because it issues a real `APIClient.shared.request` DELETE
    // before clearing the persisted token. Wiring an `APIClientProviding`
    // mock through `PushNotificationManager.init` would expand the scope of
    // this fix; the existing two tests already pin the injected-defaults
    // contract for the read + write paths. A follow-up PR can add the API
    // client injection if the unregister path needs unit coverage.

    // MARK: - resetSession (P1 — logout)

    /// Prouve que `resetSession()` clear le payload de navigation pending
    /// + le deviceToken en mémoire + le token persisté Keychain, MAIS NE
    /// touche PAS `isAuthorized` (qui reflète la permission système iOS,
    /// device-level, persistante au-delà d'un logout). Toucher
    /// `isAuthorized = false` au logout provoquerait un re-prompt
    /// utilisateur que iOS rate-limit.
    @MainActor
    func test_resetSession_clearsPendingPayloadAndTokens_butKeepsAuthorization() {
        let (sut, defaults, keychain, suite) = makePushManagerSUT()
        defer { tearDownDefaults(defaults, suiteName: suite) }

        sut.isAuthorized = true
        sut.deviceToken = "abc123def456"
        sut.pendingNotificationPayload = NotificationPayload(userInfo: ["type": "message"])
        try? keychain.save("abc123def456", forKey: PushNotificationManager.persistedTokenKey, account: nil)
        try? keychain.save("abc123def456_last", forKey: PushNotificationManager.lastRegisteredTokenKey, account: nil)

        sut.resetSession()

        XCTAssertNil(sut.pendingNotificationPayload, "navigation intent must clear")
        XCTAssertNil(sut.deviceToken, "in-memory token must clear")
        XCTAssertTrue(
            sut.isAuthorized,
            "iOS authorization is device-level, must NOT be touched at logout (re-prompt rate-limited)"
        )
        XCTAssertNil(
            keychain.load(forKey: PushNotificationManager.persistedTokenKey, account: nil),
            "persisted token in keychain must clear so a re-launch under user B does not auto-bind"
        )
        XCTAssertNil(
            keychain.load(forKey: PushNotificationManager.lastRegisteredTokenKey, account: nil),
            "last-registered marker must clear"
        )
    }
}
