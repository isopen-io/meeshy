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

    // MARK: - Dedup ring eviction (CallManager calls this when CallKit refuses
    // reportNewIncomingCall, so a genuine APNs retry for the same callId isn't
    // silently phantom-acked as a duplicate).

    func test_clearDedup_unknownCallId_doesNotCrash() {
        let sut = VoIPPushManager.shared
        sut.clearDedup(callId: "not-previously-reported")
    }

    func test_clearDedup_isIdempotent() {
        let sut = VoIPPushManager.shared
        sut.clearDedup(callId: "some-call-id")
        sut.clearDedup(callId: "some-call-id")
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

    func test_parseIceServers_tooLongUsername_dropsServer() {
        let longUsername = String(repeating: "x", count: 1025)
        let json = """
        [{"urls":"turn:turn.meeshy.me:3478","username":"\(longUsername)","credential":"abc=="}]
        """
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 0, "Server with oversized username must be dropped.")
    }

    func test_parseIceServers_tooLongCredential_dropsServer() {
        let longCredential = String(repeating: "y", count: 1025)
        let json = """
        [{"urls":"turn:turn.meeshy.me:3478","username":"u","credential":"\(longCredential)"}]
        """
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 0, "Server with oversized credential must be dropped.")
    }

    func test_parseIceServers_exactlyMaxLengthCredential_keepsServer() {
        let maxCredential = String(repeating: "z", count: 1024)
        let json = """
        [{"urls":"turn:turn.meeshy.me:3478","username":"u","credential":"\(maxCredential)"}]
        """
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 1, "Server with credential at exactly 1024 chars must be kept.")
    }

    func test_parseIceServers_mixedValidAndOversizedServers_returnsOnlyValid() {
        let longCredential = String(repeating: "y", count: 1025)
        let json = """
        [
          {"urls":"turn:valid:3478","username":"u","credential":"ok"},
          {"urls":"turn:bad:3478","username":"u","credential":"\(longCredential)"}
        ]
        """
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 1)
        XCTAssertEqual(result?.first?.urls.first, "turn:valid:3478")
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
        // Result is a locale-aware localized string — assert it is non-empty
        // rather than a specific French literal so the test stays green on
        // all simulator locales (CI typically runs in English).
        XCTAssertFalse(name.isEmpty, "The fallback caller name must not be empty")
    }

    func test_resolveCallerName_finalFallbackOnEmptyStrings() {
        let name = VoIPPushManager.resolveCallerName(
            callerName: "",
            callerUsername: ""
        )
        XCTAssertFalse(name.isEmpty, "The fallback caller name must not be empty")
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

    // MARK: - parseIceServers credential length guard (security S1-1)

    func test_parseIceServers_credentialTooLong_dropsServer() {
        let longCredential = String(repeating: "x", count: 1025)
        let json = "[{\"urls\":\"turn:turn.example.com\",\"username\":\"user\",\"credential\":\"\(longCredential)\"}]"
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertTrue(result?.isEmpty ?? true,
            "A TURN credential exceeding 1024 chars must be silently dropped to prevent " +
            "memory pressure in libwebrtc's auth header construction.")
    }

    func test_parseIceServers_usernameTooLong_dropsServer() {
        let longUsername = String(repeating: "u", count: 1025)
        let json = "[{\"urls\":\"turn:turn.example.com\",\"username\":\"\(longUsername)\",\"credential\":\"secret\"}]"
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertTrue(result?.isEmpty ?? true,
            "A TURN username exceeding 1024 chars must be dropped.")
    }

    func test_parseIceServers_validCredentials_areKept() {
        let json = "[{\"urls\":\"turn:turn.example.com\",\"username\":\"user\",\"credential\":\"secret\"}]"
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 1,
            "An ICE server with valid-length credentials must be retained.")
    }

    func test_parseIceServers_mixedValidity_dropsOnlyInvalidServer() {
        let longCredential = String(repeating: "x", count: 1025)
        let json = "[{\"urls\":\"stun:stun.example.com\",\"username\":null,\"credential\":null},{\"urls\":\"turn:turn.example.com\",\"username\":\"user\",\"credential\":\"\(longCredential)\"}]"
        let result = VoIPPushManager.parseIceServers(json)
        XCTAssertEqual(result?.count, 1,
            "Only the server with an oversized credential should be dropped; the valid STUN server must survive.")
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

    // MARK: - unregisterAndClearToken (logout teardown)

    /// Regression test: on logout, the device's VoIP registration must be
    /// fully purged so a different user logging in on the same device does
    /// not inherit the previous account's VoIP push registration. Prior to
    /// this fix, only `unregister()` (PushKit registry teardown) was ever
    /// called, and only from the login path — the keychain-backed token
    /// record and in-memory cooldown snapshot survived logout untouched.
    func test_unregisterAndClearToken_purgesTokenStoreAndCooldownSnapshot() async {
        let priorRecord = VoIPTokenRecord(token: "userAToken", at: Date())
        let store = MockVoIPTokenStore(initial: priorRecord)
        let sut = VoIPPushManager(tokenStore: store)
        sut.debug_setLastRegisteredRecord(priorRecord)

        await sut.unregisterAndClearToken()

        XCTAssertEqual(store.clearCallCount, 1, "The persisted VoIP token record must be cleared from the keychain-backed store")
        XCTAssertNil(sut.debug_lastRegisteredRecord, "The in-memory cooldown snapshot must not survive logout")
        XCTAssertNil(sut.voipToken, "The published token must be nilled out")
    }

    func test_unregisterAndClearToken_withNoPriorRegistration_doesNotCrash() async {
        let store = MockVoIPTokenStore()
        let sut = VoIPPushManager(tokenStore: store)

        await sut.unregisterAndClearToken()

        XCTAssertEqual(store.clearCallCount, 1)
        XCTAssertNil(sut.debug_lastRegisteredRecord)
    }

    // MARK: - Phantom-call dedup eviction on CallKit rejection (audit finding)

    /// Audit finding: the dedup-hit phantom path (a duplicate VoIP push for a
    /// callId already recorded in `VoIPDedupRing`) called
    /// `reportPhantomVoIPCall(uuid:update:)` without the callId, so if CallKit
    /// refused the synthetic report (e.g. `maximumCallGroups` already
    /// saturated), the dedup ring still marked the callId "reported" — a
    /// genuine APNs retry for that same callId within the dedup TTL would be
    /// silently phantom-acked again with no CallKit UI ever surfacing. These
    /// are source-level guards (same technique as `CallManagerTests`):
    /// `pushRegistry(didReceiveIncomingPushWith:)` cannot be driven from a
    /// unit test without a synthesizable `PKPushPayload`.
    private func voipPushManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/VoIPPushManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_duplicatePushPhantomPath_passesCallIdToReportPhantomVoIPCall() throws {
        let source = try voipPushManagerSource()
        guard let dedupRange = source.range(of: "VoIP push duplicate detected") else {
            XCTFail("Expected the dedup-hit log line in VoIPPushManager")
            return
        }
        let followingBody = String(source[dedupRange.upperBound...].prefix(400))
        XCTAssertTrue(
            followingBody.contains("reportPhantomVoIPCall(uuid: phantomUUID, update: update, callId: callId)"),
            "The dedup-hit phantom-call path must pass `callId` to reportPhantomVoIPCall so a CallKit " +
            "rejection can evict the dedup entry — otherwise a genuine retry is silently swallowed."
        )
    }

    func test_malformedPayloadPhantomPath_doesNotClaimADedupCallId() throws {
        let source = try voipPushManagerSource()
        guard let malformedRange = source.range(of: "VoIP push without valid call payload") else {
            XCTFail("Expected the malformed-payload log line in VoIPPushManager")
            return
        }
        let precedingBody = String(source[..<malformedRange.lowerBound].suffix(400))
        XCTAssertTrue(
            precedingBody.contains("reportPhantomVoIPCall(uuid: phantomUUID, update: update)") &&
            !precedingBody.contains("callId: callId"),
            "The malformed-payload path never inserted into the dedup ring, so it must not pass a callId " +
            "(there's nothing to evict)."
        )
    }

    func test_reportPhantomVoIPCall_clearsDedupOnCallKitFailure() throws {
        let source = try callManagerSource()
        guard let start = source.range(of: "func reportPhantomVoIPCall(uuid: UUID, update: CXCallUpdate, callId: String? = nil) {"),
              let end = source.range(of: "callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)", range: start.upperBound..<source.endIndex) else {
            XCTFail("Expected reportPhantomVoIPCall(uuid:update:callId:) in CallManager.swift")
            return
        }
        let body = String(source[start.lowerBound..<end.upperBound])
        XCTAssertTrue(
            body.contains("guard let error, let callId else { return }") &&
            body.contains("VoIPPushManager.shared.clearDedup(callId: callId)"),
            "reportPhantomVoIPCall must clear the dedup ring entry when CallKit refuses the synthetic report, " +
            "mirroring the failure handling in reportIncomingVoIPCall."
        )
    }

    // MARK: - #13 — forceReregister cooldown (anti PushKit churn)

    private func makeRecord(token: String, at seconds: TimeInterval) -> VoIPTokenRecord {
        VoIPTokenRecord(token: token, at: Date(timeIntervalSince1970: seconds))
    }

    func test_shouldSkipForceReregister_sameTokenWithinCooldown_skips() {
        let skip = VoIPPushManager.shouldSkipForceReregister(
            lastRecord: makeRecord(token: "tok", at: 1000),
            currentToken: "tok",
            now: Date(timeIntervalSince1970: 1100),   // 100s < 300s cooldown
            cooldown: 300)
        XCTAssertTrue(skip, "an unchanged token registered inside the cooldown must NOT churn PushKit")
    }

    func test_shouldSkipForceReregister_invalidatedToken_proceeds() {
        let skip = VoIPPushManager.shouldSkipForceReregister(
            lastRecord: makeRecord(token: "tok", at: 1000),
            currentToken: nil,   // didInvalidatePushTokenFor nil'd it
            now: Date(timeIntervalSince1970: 1100),
            cooldown: 300)
        XCTAssertFalse(skip, "a nil (invalidated) token must force a fresh registration cycle")
    }

    func test_shouldSkipForceReregister_changedToken_proceeds() {
        let skip = VoIPPushManager.shouldSkipForceReregister(
            lastRecord: makeRecord(token: "old", at: 1000),
            currentToken: "new",
            now: Date(timeIntervalSince1970: 1100),
            cooldown: 300)
        XCTAssertFalse(skip, "a changed token must force a fresh registration cycle")
    }

    func test_shouldSkipForceReregister_staleToken_proceeds() {
        let skip = VoIPPushManager.shouldSkipForceReregister(
            lastRecord: makeRecord(token: "tok", at: 1000),
            currentToken: "tok",
            now: Date(timeIntervalSince1970: 1400),   // 400s > 300s cooldown
            cooldown: 300)
        XCTAssertFalse(skip, "past the cooldown, force a fresh cycle (reactivation net)")
    }

    // MARK: - Guideline 5 (MIIT) — shouldRegisterVoIPPush (China CallKit compliance)

    func test_shouldRegisterVoIPPush_iPhoneNonChina_returnsTrue() {
        XCTAssertTrue(
            VoIPPushManager.shouldRegisterVoIPPush(isiOSAppOnMac: false, regionIdentifier: "FR")
        )
    }

    func test_shouldRegisterVoIPPush_iPhoneChina_returnsFalse() {
        XCTAssertFalse(
            VoIPPushManager.shouldRegisterVoIPPush(isiOSAppOnMac: false, regionIdentifier: "CN"),
            "PushKit VoIP must never be registered for China-region devices — Apple forces " +
            "reportNewIncomingCall (CallKit) on every VoIP push with no per-push opt-out."
        )
    }

    func test_shouldRegisterVoIPPush_iosAppOnMac_returnsFalse_regardlessOfRegion() {
        XCTAssertFalse(
            VoIPPushManager.shouldRegisterVoIPPush(isiOSAppOnMac: true, regionIdentifier: "FR")
        )
        XCTAssertFalse(
            VoIPPushManager.shouldRegisterVoIPPush(isiOSAppOnMac: true, regionIdentifier: "CN")
        )
    }

    func test_shouldRegisterVoIPPush_nilRegion_returnsTrue() {
        // Conservative default: an indeterminate region (simulator, region
        // unavailable) must not silently disable VoIP push outside China.
        XCTAssertTrue(
            VoIPPushManager.shouldRegisterVoIPPush(isiOSAppOnMac: false, regionIdentifier: nil)
        )
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
