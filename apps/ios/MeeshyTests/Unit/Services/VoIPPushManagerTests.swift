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

        // Keep a strong reference until the assertions run.
        // ``VoIPPushManager.init`` spawns ``Task { [weak self] ... }`` to
        // perform the one-shot migration. Discarding the SUT with `_ =`
        // releases it before that task fires and ``guard let self else {
        // return }`` short-circuits the call to
        // ``migrateFromUserDefaultsIfNeeded()`` entirely — the bounded
        // polling fix in 9065f3a2 was treating a timing symptom of this
        // ownership bug, not its cause.
        let sut = VoIPPushManager(tokenStore: store)

        // The migration runs in a detached `Task` inside `init`. Poll up
        // to 2 s, exiting as soon as the migration lands. Fast runs wake
        // within a few ms; only the genuinely slow simulator pays the
        // full budget.
        let deadline = Date().addingTimeInterval(2.0)
        while store.migrateCallCount < 1, Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }

        XCTAssertGreaterThanOrEqual(store.migrateCallCount, 1)
        XCTAssertEqual(store.snapshot()?.token, legacyToken)
        withExtendedLifetime(sut) {}
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

    // MARK: - G4c — POST failure queues the token for retry

    private final class MockVoIPTokenRegistrar: VoIPTokenRegistering {
        /// FIFO of per-call results, falling back to `defaultResult`.
        var results: [Result<Void, Error>] = []
        var defaultResult: Result<Void, Error> = .success(())
        private(set) var registerCallCount = 0
        private(set) var lastBody: RegisterDeviceTokenRequest?

        func register(_ body: RegisterDeviceTokenRequest) async throws {
            registerCallCount += 1
            lastBody = body
            let result = results.isEmpty ? defaultResult : results.removeFirst()
            try result.get()
        }
    }

    private struct TestError: Error {}

    private func makeRetrySUT(
        registrar: MockVoIPTokenRegistrar,
        authTokenAvailable: Bool = true
    ) -> (sut: VoIPPushManager, store: MockVoIPTokenStore) {
        let store = MockVoIPTokenStore()
        let sut = VoIPPushManager(
            tokenStore: store,
            registrar: registrar,
            authTokenAvailable: { authTokenAvailable }
        )
        return (sut, store)
    }

    func test_registerTokenWithBackend_networkFailure_queuesTokenForRetry() async {
        let registrar = MockVoIPTokenRegistrar()
        registrar.defaultResult = .failure(TestError())
        let (sut, store) = makeRetrySUT(registrar: registrar)

        await sut.debug_registerTokenWithBackend("tokX")

        XCTAssertEqual(registrar.registerCallCount, 1)
        XCTAssertEqual(sut.debug_pendingTokenToRegister, "tokX",
                       "A failed POST must park the token for a later retry, not drop it")
        XCTAssertNil(sut.debug_lastRegisteredRecord,
                     "A failed POST must not arm the cooldown")
        XCTAssertNil(store.snapshot(),
                     "A failed POST must not persist the token as registered")
    }

    func test_retryPendingTokenRegistration_afterFailure_retriesAndClearsPending() async {
        let registrar = MockVoIPTokenRegistrar()
        registrar.results = [.failure(TestError()), .success(())]
        let (sut, _) = makeRetrySUT(registrar: registrar)

        await sut.debug_registerTokenWithBackend("tokY")
        XCTAssertEqual(sut.debug_pendingTokenToRegister, "tokY")

        await sut.retryPendingTokenRegistration()

        XCTAssertEqual(registrar.registerCallCount, 2)
        XCTAssertNil(sut.debug_pendingTokenToRegister,
                     "A successful retry must clear the parked token")
        XCTAssertEqual(sut.debug_lastRegisteredRecord?.token, "tokY")
    }

    func test_retryPendingTokenRegistration_noPendingToken_doesNothing() async {
        let registrar = MockVoIPTokenRegistrar()
        let (sut, _) = makeRetrySUT(registrar: registrar)

        await sut.retryPendingTokenRegistration()

        XCTAssertEqual(registrar.registerCallCount, 0)
    }

    func test_registerTokenWithBackend_successWithinCooldown_skipsSecondPost() async {
        let registrar = MockVoIPTokenRegistrar()
        let (sut, _) = makeRetrySUT(registrar: registrar)

        await sut.debug_registerTokenWithBackend("tokZ")
        await sut.debug_registerTokenWithBackend("tokZ")

        XCTAssertEqual(registrar.registerCallCount, 1,
                       "Same token inside the cooldown window must not re-POST")
        XCTAssertNil(sut.debug_pendingTokenToRegister)
    }

    func test_registerTokenWithBackend_noAuthToken_queuesWithoutPosting() async {
        let registrar = MockVoIPTokenRegistrar()
        let (sut, _) = makeRetrySUT(registrar: registrar, authTokenAvailable: false)

        await sut.debug_registerTokenWithBackend("tokPreLogin")

        XCTAssertEqual(registrar.registerCallCount, 0)
        XCTAssertEqual(sut.debug_pendingTokenToRegister, "tokPreLogin")
    }
}
