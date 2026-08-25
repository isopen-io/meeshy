import XCTest
@testable import MeeshySDK

/// F2 follow-up (major, review-F) — `voicePublic` must survive BOTH sites
/// in `AuthManager` that replace `currentUser` with a fresh server user:
/// a token refresh/rotation (`applySession`) and the throttled foreground
/// `/auth/me` revalidation (`updateUserAfterRevalidation`, reached here
/// through the public `refreshCurrentUserProfile()`). Both consume a
/// self-only response shape (`GET /auth/me` / the login/refresh payload)
/// that never carries `voicePublic` — `formatUserResponse`
/// (services/gateway/src/routes/auth/types.ts) declares no `voicePublic` or
/// `voiceSample*` field at all. Without re-applying the locally-held value
/// first, a background revalidation would silently flip the toggle back to
/// nil/false even though the server still holds it ON, and — worse —
/// `saveUserToKeychain` would durably persist the amputated user, making the
/// loss survive a cold start too.
@MainActor
final class AuthManagerVoicePublicRevalidationTests: XCTestCase {
    private var originalAuthService: AuthServiceProviding!
    private var mockAuthService: VoicePublicRevalidationAuthServiceStub!
    private var originalKeychain: (any KeychainStoring)!
    private var mockKeychain: InMemoryKeychainStoreForVoicePublicTests!
    /// `currentUser` du singleton AVANT cette suite : elle y pose des fixtures
    /// (`reset-placeholder`, `makeUser`) que les suites suivantes du même hôte
    /// liraient sinon comme l'utilisateur courant — `ConversationSyncEngineTests`
    /// (« lecture PROPRE » décidée sur `currentUser`) et
    /// `OfflineQueuePendingUIItemsPublisherTests` rougissaient par pollution
    /// d'ordre (gate 2026-08-25, relance 2).
    private var originalUser: MeeshyUser?

    override func setUp() async throws {
        try await super.setUp()

        originalUser = AuthManager.shared.currentUser
        originalAuthService = AuthManager.shared.authService
        mockAuthService = VoicePublicRevalidationAuthServiceStub()
        AuthManager.shared.authService = mockAuthService

        // `KeychainManager` (production default) silently no-ops outside an
        // app host — `applySession` couldn't persist activeUserId/token
        // without a real store, and `refreshCurrentUserProfile`'s guard
        // (`isAuthenticated`, `activeUserId`) would never be satisfied.
        originalKeychain = AuthManager.shared.keychain
        mockKeychain = InMemoryKeychainStoreForVoicePublicTests()
        AuthManager.shared.keychain = mockKeychain

        // Defensive: `pendingOptimisticProfile` is a private, unguarded
        // `AuthManager.shared` field other suites in this target can leave
        // set across test runs (e.g. `AuthManagerProfileMutationTests`'
        // `applyLocalProfileChanges` tests don't all call
        // `restoreLocalProfileSnapshot`). A leaked guard would route
        // `resolveServerUserWithOptimistic` through the POOR
        // `withProfileChanges(displayName:bio:avatar:)` overload inside
        // `applySession`/`updateUserAfterRevalidation`, erasing the very
        // `voicePublic` this suite asserts on — for a reason unrelated to
        // the fix under test. Reset it deterministically via the public API
        // so these assertions aren't at the mercy of test execution order.
        AuthManager.shared.currentUser = MeeshyUser(id: "reset-placeholder", username: "reset")
        AuthManager.shared.restoreLocalProfileSnapshot(
            ProfileSnapshot(displayName: nil, bio: nil, avatarUrl: nil))
    }

    override func tearDown() async throws {
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        AuthManager.shared.currentUser = originalUser
        try await super.tearDown()
    }

    private func makeUser(id: String = "user-vp", voicePublic: Bool? = nil) -> MeeshyUser {
        MeeshyUser(
            id: id, username: "vp-user", email: "vp@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            voicePublic: voicePublic
        )
    }

    /// Site 1 — token refresh/rotation. `applySession` also runs on a fresh
    /// login, so a self-only session response omitting `voicePublic` must
    /// not clobber a value the local user already holds.
    func test_applySession_serverUserWithoutVoicePublic_keepsLocalVoicePublic() {
        let auth = AuthManager.shared
        auth.currentUser = makeUser(voicePublic: true)

        let serverUser = makeUser(voicePublic: nil)
        auth.applySession(token: "tok-1", sessionToken: nil, user: serverUser)

        XCTAssertEqual(
            auth.currentUser?.voicePublic, true,
            "a token refresh must not clobber a locally-held voicePublic the self-only session response doesn't carry"
        )
    }

    /// Site 2 — foreground `/auth/me` revalidation
    /// (`updateUserAfterRevalidation`, reached via the public
    /// `refreshCurrentUserProfile()`). Same amputated response shape.
    func test_refreshCurrentUserProfile_serverUserWithoutVoicePublic_keepsLocalVoicePublic() async {
        let auth = AuthManager.shared

        // Establish an authenticated session (sets isAuthenticated +
        // activeUserId, both required by refreshCurrentUserProfile's guard).
        // The background revalidation this triggers is harmless: it fails
        // (default stub result), so it can't touch currentUser.
        auth.applySession(token: "tok-2", sessionToken: nil, user: makeUser(voicePublic: true))
        auth.currentUser = makeUser(voicePublic: true)

        mockAuthService.meResult = .success(makeUser(voicePublic: nil))

        await auth.refreshCurrentUserProfile()

        XCTAssertEqual(
            auth.currentUser?.voicePublic, true,
            "a throttled /auth/me revalidation must not clobber a locally-held voicePublic the self-only response doesn't carry"
        )
    }
}

// MARK: - Stub conforming to AuthServiceProviding
//
// Only `me()` is exercised by this suite; every other method throws to flag
// accidental use — mirrors the pattern in `AuthManagerRefreshTests`.
private final class VoicePublicRevalidationAuthServiceStub: AuthServiceProviding, @unchecked Sendable {
    var meResult: Result<MeeshyUser, Error> = .failure(MeeshyError.network(.noConnection))

    func me() async throws -> MeeshyUser {
        switch meResult {
        case .success(let user): return user
        case .failure(let error): throw error
        }
    }

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func register(request: RegisterRequest) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func requestMagicLink(email: String, deviceFingerprint: String?) async throws -> Int { 0 }
    func validateMagicLink(token: String) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func requestPasswordReset(email: String) async throws {}
    func resetPassword(token: String, newPassword: String) async throws {}
    func sendPhoneCode(phoneNumber: String) async throws {}
    func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse {
        throw MeeshyError.network(.noConnection)
    }
    func verifyEmail(code: String) async throws {}
    func verifyEmailWithCode(code: String, email: String) async throws {}
    func resendVerificationEmail(email: String) async throws {}
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse {
        throw MeeshyError.network(.noConnection)
    }
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {}
}

// MARK: - In-memory KeychainStoring for AuthManager isolation

private final class InMemoryKeychainStoreForVoicePublicTests: KeychainStoring, @unchecked Sendable {
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws {
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
