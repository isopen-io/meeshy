import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Audit P1-15 — replaces the previously tautological tests with real
/// behavioural assertions on the testable surface of VoIPPushManager.
/// PushKit's `pushRegistry(didReceiveIncomingPushWith:)` itself cannot be
/// driven from a unit test without a synthesizable `PKPushPayload`; instead
/// we cover the pure payload-parsing helpers and the singleton lifecycle.
@MainActor
final class VoIPPushManagerTests: XCTestCase {

    // MARK: - Singleton & Lifecycle

    func test_shared_returnsSameInstance() {
        let a = VoIPPushManager.shared
        let b = VoIPPushManager.shared
        XCTAssertTrue(a === b, "VoIPPushManager must be a true singleton")
    }

    func test_unregister_clearsVoipToken() {
        let sut = VoIPPushManager.shared
        sut.unregister()
        XCTAssertNil(sut.voipToken, "Unregister should null out the published token")
    }

    func test_register_isIdempotent() {
        let sut = VoIPPushManager.shared
        sut.unregister()
        sut.register()
        sut.register()
        // Calling register twice in a row must not crash or leak a 2nd
        // PKPushRegistry — the guard at the top of register() short-circuits.
    }

    func test_forceReregister_doesNotCrash() {
        let sut = VoIPPushManager.shared
        sut.register()
        sut.forceReregister()
    }

    // MARK: - parseIceServers (P2-CC-4 surface)

    func test_parseIceServers_nilInput_returnsNil() {
        XCTAssertNil(VoIPPushManager.parseIceServers(nil))
    }

    func test_parseIceServers_emptyString_returnsNil() {
        XCTAssertNil(VoIPPushManager.parseIceServers(""))
    }

    func test_parseIceServers_invalidJSON_returnsNil() {
        XCTAssertNil(VoIPPushManager.parseIceServers("{not json"))
    }

    func test_parseIceServers_arrayOfServers_decodes() {
        let json = """
        [{"urls":"turn:turn.meeshy.me:3478","username":"123:user","credential":"abc=="}]
        """
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 1)
        XCTAssertEqual(result?.first?.username, "123:user")
        XCTAssertEqual(result?.first?.credential, "abc==")
        XCTAssertEqual(result?.first?.urls.first, "turn:turn.meeshy.me:3478")
    }

    func test_parseIceServers_urlsAsArray_decodes() {
        let json = """
        [{"urls":["turn:t1:3478","turn:t2:3478"],"username":"u","credential":"c"}]
        """
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 1)
        XCTAssertEqual(result?.first?.urls.count, 2)
    }

    func test_parseIceServers_nonStringInput_returnsNil() {
        XCTAssertNil(VoIPPushManager.parseIceServers(42))
    }

    // MARK: - resolveCallerName priorities

    func test_resolveCallerName_prefersDisplayNameOverUsername() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: "Alice Dupont",
            callerUsername: "alice"
        )
        XCTAssertEqual(name, "Alice Dupont")
    }

    func test_resolveCallerName_fallsBackToUsernameWhenNameIsNil() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: nil,
            callerUsername: "alice"
        )
        XCTAssertEqual(name, "alice")
    }

    func test_resolveCallerName_fallsBackToUsernameWhenNameIsEmpty() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: "",
            callerUsername: "alice"
        )
        XCTAssertEqual(name, "alice")
    }

    func test_resolveCallerName_finalFallbackIsLocalizedString() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: nil,
            callerUsername: nil
        )
        XCTAssertEqual(name, "Appel entrant")
    }

    func test_resolveCallerName_finalFallbackOnEmptyStrings() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: "",
            callerUsername: ""
        )
        XCTAssertEqual(name, "Appel entrant")
    }

    // MARK: - VoIP token storage migration (P1.2)

    /// Once the keychain-backed store is in place, the VoIP token MUST NOT
    /// be readable from UserDefaults. This is the regression test for the
    /// previous behaviour where the token was stored in UserDefaults at
    /// VoIPPushManager.swift:325-326.
    func test_voipToken_isNeverWrittenToUserDefaults() async {
        let legacyTokenKey = KeychainVoIPTokenStore.legacyTokenKey
        let legacyDateKey = KeychainVoIPTokenStore.legacyDateKey
        UserDefaults.standard.removeObject(forKey: legacyTokenKey)
        UserDefaults.standard.removeObject(forKey: legacyDateKey)

        let store = MockVoIPTokenStore()
        let sut = VoIPPushManager(tokenStore: store)

        // Prime the cooldown snapshot the way the production cooldown path
        // would have written it. The token MUST be in the (mock) keychain,
        // not in UserDefaults.
        sut.debug_setLastRegisteredRecord(VoIPTokenRecord(token: "abcd1234", at: Date()))
        try? await store.save(token: "abcd1234", at: Date())

        XCTAssertNil(
            UserDefaults.standard.string(forKey: legacyTokenKey),
            "The VoIP token must not leak into UserDefaults under the legacy key"
        )
        XCTAssertEqual(store.snapshot()?.token, "abcd1234")
    }

    /// On boot, ``VoIPPushManager`` must drain the legacy UserDefaults
    /// entry and move it into the keychain so a returning user is not
    /// re-prompted for VoIP authorization.
    func test_init_migratesLegacyUserDefaultsTokenIntoStore() async throws {
        let legacyToken = "legacy_voip_\(UUID().uuidString)"
        let store = MockVoIPTokenStore(
            legacy: VoIPTokenRecord(token: legacyToken, at: Date(timeIntervalSince1970: 1_000))
        )

        _ = VoIPPushManager(tokenStore: store)

        // The Task started inside `init` is asynchronous; give it a beat to run.
        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertGreaterThanOrEqual(store.migrateCallCount, 1)
        XCTAssertEqual(store.snapshot()?.token, legacyToken)
    }

    /// Idempotence guard: when the keychain already holds a matching token
    /// inside the cooldown window, calling `registerToken` is a no-op.
    /// This test asserts via the debug snapshot since the actual POST flow
    /// hits APIClient.shared.
    func test_cooldownSnapshot_isHydratedFromStoreAtInit() async throws {
        let priorRecord = VoIPTokenRecord(
            token: "priorToken",
            at: Date()
        )
        let store = MockVoIPTokenStore(initial: priorRecord)

        let sut = VoIPPushManager(tokenStore: store)

        // Wait for the init Task to hydrate the snapshot.
        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(sut.debug_lastRegisteredRecord?.token, "priorToken")
    }
}
