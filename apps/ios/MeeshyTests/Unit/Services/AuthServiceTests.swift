import XCTest
import Combine
@testable import MeeshySDK

/// B22 — the previous version of this suite drove `MockAuthManager` for
/// every scenario: it configured the mock's own stubs, called the mock's
/// own methods, then asserted the mock's own call-count/argument trackers.
/// That is circular — it proves `MockAuthManager` records what it's told,
/// never that the real login/logout/refresh flow inside `AuthManager`
/// behaves correctly. `MockAuthManager` remains legitimate as a test double
/// *for other components* (ViewModels that depend on `AuthManaging` — see
/// its many other usages under `MeeshyTests/Unit/ViewModels/`); it is simply
/// the wrong tool for testing `AuthManager` itself.
///
/// This suite instead drives the real `AuthManager.shared` singleton through
/// its two injectable seams — `authService` (existing) and `keychain`
/// (added alongside this fix, mirroring the `authService` pattern: the real
/// `KeychainManager` isn't entitled inside the xctest host, so every
/// save/load silently no-ops there and a fresh login can never persist a
/// token). With both seams stubbed, `login`/`register`/`requestMagicLink`/
/// `validateMagicLink`/`requestPasswordReset`/`refreshSession`/`logout`/
/// `handleUnauthorized` all exercise their REAL implementation bodies.
@MainActor
final class AuthServiceTests: XCTestCase {

    private var originalAuthService: AuthServiceProviding!
    private var stubAuthService: StubAuthServiceForAuthManager!
    private var originalKeychain: (any KeychainStoring)!
    private var stubKeychain: InMemoryKeychainStoreForAuthTests!

    override func setUp() async throws {
        try await super.setUp()
        originalAuthService = AuthManager.shared.authService
        stubAuthService = StubAuthServiceForAuthManager()
        AuthManager.shared.authService = stubAuthService

        originalKeychain = AuthManager.shared.keychain
        stubKeychain = InMemoryKeychainStoreForAuthTests()
        AuthManager.shared.keychain = stubKeychain

        // Clean slate: any prior test's session/flags must not leak in.
        await AuthManager.shared.logout()
        AuthManager.shared.requires2FA = false
        AuthManager.shared.twoFactorToken = nil
        AuthManager.shared.errorMessage = nil
    }

    override func tearDown() async throws {
        await AuthManager.shared.logout()
        AuthManager.shared.authService = originalAuthService
        AuthManager.shared.keychain = originalKeychain
        try await super.tearDown()
    }

    // MARK: - Fixtures

    private func makeUser(id: String = "user-123", username: String = "testuser") -> MeeshyUser {
        MeeshyUser(id: id, username: username, email: "test@meeshy.me", displayName: "Test User")
    }

    private func makeLoginData(
        user: MeeshyUser? = nil,
        token: String? = "jwt-token",
        sessionToken: String? = "session-token",
        requires2FA: Bool? = nil,
        twoFactorToken: String? = nil
    ) -> LoginResponseData {
        LoginResponseData(
            user: user ?? makeUser(), token: token, sessionToken: sessionToken,
            expiresIn: 3600, requires2FA: requires2FA, twoFactorToken: twoFactorToken
        )
    }

    // MARK: - Login

    func test_login_success_authenticatesRealAuthManagerAndPersistsToken() async {
        stubAuthService.loginResult = .success(makeLoginData())

        await AuthManager.shared.login(username: "testuser", password: "password123")

        XCTAssertTrue(AuthManager.shared.isAuthenticated)
        XCTAssertEqual(AuthManager.shared.currentUser?.id, "user-123")
        XCTAssertEqual(AuthManager.shared.authToken, "jwt-token")
        XCTAssertNil(AuthManager.shared.errorMessage)
        XCTAssertEqual(stubAuthService.loginCallCount, 1)
    }

    func test_login_failure_setsErrorMessage_andStaysUnauthenticated() async {
        stubAuthService.loginResult = .failure(MeeshyError.auth(.invalidCredentialsWithMessage("Mot de passe incorrect")))

        await AuthManager.shared.login(username: "testuser", password: "wrong")

        XCTAssertEqual(AuthManager.shared.errorMessage, "Mot de passe incorrect")
        XCTAssertFalse(AuthManager.shared.isAuthenticated)
        XCTAssertNil(AuthManager.shared.currentUser)
    }

    func test_login_requires2FA_setsRequires2FAState_withoutAuthenticating() async {
        stubAuthService.loginResult = .success(
            makeLoginData(token: nil, sessionToken: nil, requires2FA: true, twoFactorToken: "2fa-token-abc")
        )

        await AuthManager.shared.login(username: "testuser", password: "password123")

        XCTAssertTrue(AuthManager.shared.requires2FA)
        XCTAssertEqual(AuthManager.shared.twoFactorToken, "2fa-token-abc")
        XCTAssertFalse(AuthManager.shared.isAuthenticated)
    }

    // MARK: - 2FA completion

    func test_completeLoginWith2FA_success_authenticatesAndClearsRequires2FA() async {
        stubAuthService.loginResult = .success(
            makeLoginData(token: nil, sessionToken: nil, requires2FA: true, twoFactorToken: "2fa-token-abc")
        )
        await AuthManager.shared.login(username: "testuser", password: "password123")
        stubAuthService.completeLoginWith2FAResult = .success(makeLoginData())

        await AuthManager.shared.completeLoginWith2FA(code: "123456")

        XCTAssertTrue(AuthManager.shared.isAuthenticated)
        XCTAssertFalse(AuthManager.shared.requires2FA)
        XCTAssertNil(AuthManager.shared.twoFactorToken)
        XCTAssertEqual(stubAuthService.completeLoginWith2FACallCount, 1)
    }

    func test_completeLoginWith2FA_withoutPriorToken_setsErrorMessage_withoutCallingService() async {
        await AuthManager.shared.completeLoginWith2FA(code: "123456")

        XCTAssertEqual(AuthManager.shared.errorMessage, "Session 2FA expirée ou invalide")
        XCTAssertFalse(AuthManager.shared.isAuthenticated)
        XCTAssertEqual(stubAuthService.completeLoginWith2FACallCount, 0)
    }

    // MARK: - Logout

    func test_logout_afterRealLogin_clearsAuthenticatedStateAndToken() async {
        stubAuthService.loginResult = .success(makeLoginData())
        await AuthManager.shared.login(username: "testuser", password: "password123")
        XCTAssertTrue(AuthManager.shared.isAuthenticated, "precondition: login must have succeeded")

        await AuthManager.shared.logout()

        XCTAssertFalse(AuthManager.shared.isAuthenticated)
        XCTAssertNil(AuthManager.shared.currentUser)
        XCTAssertNil(AuthManager.shared.authToken)
    }

    func test_logout_whenNotAuthenticated_isIdempotent() async {
        await AuthManager.shared.logout()

        XCTAssertFalse(AuthManager.shared.isAuthenticated)
        XCTAssertNil(AuthManager.shared.currentUser)
    }

    // MARK: - handleUnauthorized / refreshSession

    func test_refreshSession_success_rotatesTokenAndKeepsAuthenticated() async throws {
        stubAuthService.loginResult = .success(makeLoginData(token: "expired-token"))
        await AuthManager.shared.login(username: "testuser", password: "password123")
        stubAuthService.refreshTokenResult = .success(makeLoginData(token: "refreshed-token"))

        let newToken = try await AuthManager.shared.refreshSession(force: true)

        XCTAssertEqual(newToken, "refreshed-token")
        XCTAssertEqual(AuthManager.shared.authToken, "refreshed-token")
        XCTAssertTrue(AuthManager.shared.isAuthenticated)
        XCTAssertEqual(stubAuthService.refreshTokenCallCount, 1)
    }

    func test_refreshSession_authFailure_requiresReauthentication() async {
        stubAuthService.loginResult = .success(makeLoginData(token: "expired-token"))
        await AuthManager.shared.login(username: "testuser", password: "password123")
        stubAuthService.refreshTokenResult = .failure(MeeshyError.auth(.sessionExpired))

        do {
            _ = try await AuthManager.shared.refreshSession(force: true)
            XCTFail("Expected refreshSession to throw")
        } catch let error as MeeshyError {
            guard case .auth(.sessionExpired) = error else {
                XCTFail("Expected sessionExpired, got \(error)")
                return
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }

        XCTAssertFalse(AuthManager.shared.isAuthenticated)
        XCTAssertNil(AuthManager.shared.currentUser)
        XCTAssertNil(AuthManager.shared.authToken)
    }

    func test_refreshSession_withoutActiveSession_throwsSessionExpired_withoutCallingService() async {
        do {
            _ = try await AuthManager.shared.refreshSession(force: false)
            XCTFail("Expected refreshSession to throw")
        } catch let error as MeeshyError {
            guard case .auth(.sessionExpired) = error else {
                XCTFail("Expected sessionExpired, got \(error)")
                return
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }

        XCTAssertEqual(stubAuthService.refreshTokenCallCount, 0)
    }

    func test_handleUnauthorized_withActiveSession_triggersRefreshAndAppliesNewToken() async {
        stubAuthService.loginResult = .success(makeLoginData(token: "expired-token"))
        await AuthManager.shared.login(username: "testuser", password: "password123")
        stubAuthService.refreshTokenResult = .success(makeLoginData(token: "refreshed-via-401"))

        // `handleUnauthorized` fires a detached `Task` internally (so 401s
        // from arbitrary call sites never block on the refresh). Same
        // user re-authenticating is a token *rotation*, which fires
        // `tokenDidRotate` — await that instead of polling/sleeping.
        let rotated = expectation(description: "tokenDidRotate fires after handleUnauthorized's background refresh")
        let cancellable = AuthManager.shared.tokenDidRotate.sink { rotated.fulfill() }
        defer { cancellable.cancel() }

        AuthManager.shared.handleUnauthorized()

        await fulfillment(of: [rotated], timeout: 2)

        XCTAssertEqual(AuthManager.shared.authToken, "refreshed-via-401")
        XCTAssertTrue(AuthManager.shared.isAuthenticated)
    }

    func test_handleUnauthorized_withoutActiveSession_isNoOp() async {
        AuthManager.shared.handleUnauthorized()

        XCTAssertFalse(AuthManager.shared.isAuthenticated)
        XCTAssertEqual(stubAuthService.refreshTokenCallCount, 0)
    }

    // MARK: - Register

    private func makeRegisterRequest(username: String = "newuser", email: String = "new@meeshy.me") -> RegisterRequest {
        RegisterRequest(username: username, password: "securePass", firstName: "Test", lastName: "User", email: email)
    }

    func test_register_success_authenticatesNewUser() async {
        stubAuthService.registerResult = .success(makeLoginData(user: makeUser(id: "user-456", username: "newuser")))

        await AuthManager.shared.register(request: makeRegisterRequest())

        XCTAssertTrue(AuthManager.shared.isAuthenticated)
        XCTAssertEqual(AuthManager.shared.currentUser?.username, "newuser")
        XCTAssertEqual(stubAuthService.registerCallCount, 1)
    }

    func test_register_failure_setsErrorMessage_withoutAuthenticating() async {
        stubAuthService.registerResult = .failure(MeeshyError.auth(.registrationFailed("Username already taken")))

        await AuthManager.shared.register(request: makeRegisterRequest())

        XCTAssertEqual(AuthManager.shared.errorMessage, "Echec de l'inscription : Username already taken")
        XCTAssertFalse(AuthManager.shared.isAuthenticated)
    }

    // MARK: - Magic Link

    func test_requestMagicLink_success_returnsTrue() async {
        stubAuthService.requestMagicLinkResult = .success(300)

        let result = await AuthManager.shared.requestMagicLink(email: "user@meeshy.me")

        XCTAssertTrue(result)
        XCTAssertNil(AuthManager.shared.errorMessage)
        XCTAssertEqual(stubAuthService.requestMagicLinkCallCount, 1)
    }

    func test_requestMagicLink_failure_returnsFalse_andSetsErrorMessage() async {
        stubAuthService.requestMagicLinkResult = .failure(MeeshyError.server(statusCode: 429, message: "Trop de tentatives"))

        let result = await AuthManager.shared.requestMagicLink(email: "user@meeshy.me")

        XCTAssertFalse(result)
        XCTAssertEqual(AuthManager.shared.errorMessage, "Trop de tentatives")
    }

    func test_validateMagicLink_success_authenticatesUser() async {
        stubAuthService.validateMagicLinkResult = .success(makeLoginData())

        await AuthManager.shared.validateMagicLink(token: "magic-token-123")

        XCTAssertTrue(AuthManager.shared.isAuthenticated)
        XCTAssertEqual(AuthManager.shared.currentUser?.id, "user-123")
    }

    func test_validateMagicLink_failure_setsErrorMessage() async {
        stubAuthService.validateMagicLinkResult = .failure(MeeshyError.auth(.sessionExpired))

        await AuthManager.shared.validateMagicLink(token: "expired-magic-token")

        XCTAssertEqual(AuthManager.shared.errorMessage, "Session expiree, veuillez vous reconnecter")
        XCTAssertFalse(AuthManager.shared.isAuthenticated)
    }

    // MARK: - Password Reset

    func test_requestPasswordReset_success_returnsTrue() async {
        stubAuthService.requestPasswordResetError = nil

        let result = await AuthManager.shared.requestPasswordReset(email: "user@meeshy.me")

        XCTAssertTrue(result)
        XCTAssertEqual(stubAuthService.requestPasswordResetCallCount, 1)
    }

    func test_requestPasswordReset_failure_returnsFalse() async {
        stubAuthService.requestPasswordResetError = MeeshyError.network(.noConnection)

        let result = await AuthManager.shared.requestPasswordReset(email: "user@meeshy.me")

        XCTAssertFalse(result)
        XCTAssertEqual(AuthManager.shared.errorMessage, "Pas de connexion internet")
    }
}

// MARK: - Stub conforming to AuthServiceProviding
//
// The production `AuthService` is `final`, so we conform to the protocol
// directly instead of subclassing. Every method this suite doesn't
// configure throws loudly (`MeeshyError.network(.noConnection)`) so an
// accidental untested call path fails the test instead of silently
// succeeding with bogus data.

private final class StubAuthServiceForAuthManager: AuthServiceProviding, @unchecked Sendable {
    private let lock = NSLock()

    var loginResult: Result<LoginResponseData, Error> = .failure(MeeshyError.network(.noConnection))
    var completeLoginWith2FAResult: Result<LoginResponseData, Error> = .failure(MeeshyError.network(.noConnection))
    var registerResult: Result<LoginResponseData, Error> = .failure(MeeshyError.network(.noConnection))
    var requestMagicLinkResult: Result<Int, Error> = .failure(MeeshyError.network(.noConnection))
    var validateMagicLinkResult: Result<LoginResponseData, Error> = .failure(MeeshyError.network(.noConnection))
    var requestPasswordResetError: Error?
    var refreshTokenResult: Result<LoginResponseData, Error> = .failure(MeeshyError.network(.noConnection))

    private var _loginCallCount = 0
    var loginCallCount: Int { lock.withLock { _loginCallCount } }
    private var _completeLoginWith2FACallCount = 0
    var completeLoginWith2FACallCount: Int { lock.withLock { _completeLoginWith2FACallCount } }
    private var _registerCallCount = 0
    var registerCallCount: Int { lock.withLock { _registerCallCount } }
    private var _requestMagicLinkCallCount = 0
    var requestMagicLinkCallCount: Int { lock.withLock { _requestMagicLinkCallCount } }
    private var _requestPasswordResetCallCount = 0
    var requestPasswordResetCallCount: Int { lock.withLock { _requestPasswordResetCallCount } }
    private var _refreshTokenCallCount = 0
    var refreshTokenCallCount: Int { lock.withLock { _refreshTokenCallCount } }

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        lock.withLock { _loginCallCount += 1 }
        return try loginResult.get()
    }

    func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData {
        lock.withLock { _completeLoginWith2FACallCount += 1 }
        return try completeLoginWith2FAResult.get()
    }

    func register(request: RegisterRequest) async throws -> LoginResponseData {
        lock.withLock { _registerCallCount += 1 }
        return try registerResult.get()
    }

    func requestMagicLink(email: String, deviceFingerprint: String?) async throws -> Int {
        lock.withLock { _requestMagicLinkCallCount += 1 }
        return try requestMagicLinkResult.get()
    }

    func validateMagicLink(token: String) async throws -> LoginResponseData {
        try validateMagicLinkResult.get()
    }

    func requestPasswordReset(email: String) async throws {
        lock.withLock { _requestPasswordResetCallCount += 1 }
        if let requestPasswordResetError { throw requestPasswordResetError }
    }

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        lock.withLock { _refreshTokenCallCount += 1 }
        return try refreshTokenResult.get()
    }

    // MARK: Unused conformances — fail loudly if accidentally hit.

    func resetPassword(token: String, newPassword: String) async throws {
        throw MeeshyError.network(.noConnection)
    }
    func sendPhoneCode(phoneNumber: String) async throws {
        throw MeeshyError.network(.noConnection)
    }
    func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse {
        throw MeeshyError.network(.noConnection)
    }
    func verifyEmail(code: String) async throws {
        throw MeeshyError.network(.noConnection)
    }
    func verifyEmailWithCode(code: String, email: String) async throws {
        throw MeeshyError.network(.noConnection)
    }
    func resendVerificationEmail(email: String) async throws {
        throw MeeshyError.network(.noConnection)
    }
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse {
        throw MeeshyError.network(.noConnection)
    }
    func me() async throws -> MeeshyUser {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {}
}

// MARK: - In-memory KeychainStoring
//
// The real `KeychainManager` requires a keychain-access entitlement the
// xctest host doesn't have, so every save/load silently no-ops there,
// making `applySession` (and therefore `login`/`register`/`refreshSession`)
// unable to persist anything. `AuthManager.keychain` is an injectable `var`
// (mirrors the `authService` seam) so this in-memory store can stand in for
// the duration of this suite.
private final class InMemoryKeychainStoreForAuthTests: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws {
        lock.withLock { store[key] = value }
    }

    func load(forKey key: String, account: String?) -> String? {
        lock.withLock { store[key] }
    }

    func delete(forKey key: String, account: String?) {
        lock.withLock { _ = store.removeValue(forKey: key) }
    }

    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }

    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}
