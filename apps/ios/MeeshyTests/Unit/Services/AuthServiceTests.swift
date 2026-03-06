import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class AuthServiceTests: XCTestCase {

    // MARK: - AuthManaging Protocol Tests (via MockAuthManager)

    private func makeMockAuth() -> MockAuthManager {
        let mock = MockAuthManager()
        mock.reset()
        return mock
    }

    private func makeTestUser(
        id: String = "user-123",
        username: String = "testuser"
    ) -> MeeshyUser {
        MeeshyUser(id: id, username: username, email: "test@meeshy.me", displayName: "Test User")
    }

    // MARK: - Login

    func test_login_success_setsAuthenticated() async {
        let auth = makeMockAuth()
        let user = makeTestUser()
        auth.currentUser = user
        auth.isAuthenticated = true

        await auth.login(username: "testuser", password: "password123")

        XCTAssertEqual(auth.loginCallCount, 1)
        XCTAssertEqual(auth.loginCredentials.first?.username, "testuser")
        XCTAssertEqual(auth.loginCredentials.first?.password, "password123")
    }

    func test_login_failure_setsErrorMessage() async {
        let auth = makeMockAuth()
        auth.loginError = "Invalid credentials"

        await auth.login(username: "wrong", password: "wrong")

        XCTAssertEqual(auth.errorMessage, "Invalid credentials")
        XCTAssertFalse(auth.isAuthenticated)
    }

    func test_login_tracksCallCount() async {
        let auth = makeMockAuth()

        await auth.login(username: "user1", password: "pass1")
        await auth.login(username: "user2", password: "pass2")

        XCTAssertEqual(auth.loginCallCount, 2)
        XCTAssertEqual(auth.loginCredentials.count, 2)
    }

    // MARK: - Logout

    func test_logout_clearsAuthState() {
        let auth = makeMockAuth()
        auth.simulateLoggedIn(user: makeTestUser(), token: "jwt-token")

        auth.logout()

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.currentUser)
        XCTAssertNil(auth.authToken)
        XCTAssertEqual(auth.logoutCallCount, 1)
    }

    func test_logout_whenNotAuthenticated_stillClearsState() {
        let auth = makeMockAuth()

        auth.logout()

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.currentUser)
        XCTAssertEqual(auth.logoutCallCount, 1)
    }

    // MARK: - checkExistingSession

    func test_checkExistingSession_incrementsCallCount() async {
        let auth = makeMockAuth()

        await auth.checkExistingSession()

        XCTAssertEqual(auth.checkExistingSessionCallCount, 1)
    }

    func test_checkExistingSession_multipleCalls_tracksAll() async {
        let auth = makeMockAuth()

        await auth.checkExistingSession()
        await auth.checkExistingSession()

        XCTAssertEqual(auth.checkExistingSessionCallCount, 2)
    }

    // MARK: - handleUnauthorized

    func test_handleUnauthorized_clearsAuthState() {
        let auth = makeMockAuth()
        auth.simulateLoggedIn(user: makeTestUser(), token: "jwt-token")

        auth.handleUnauthorized()

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.currentUser)
        XCTAssertNil(auth.authToken)
        XCTAssertEqual(auth.handleUnauthorizedCallCount, 1)
    }

    func test_handleUnauthorized_whenNotAuthenticated_staysCleared() {
        let auth = makeMockAuth()

        auth.handleUnauthorized()

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.currentUser)
    }

    // MARK: - Registration

    func test_register_tracksRequest() async {
        let auth = makeMockAuth()
        let request = RegisterRequest(
            username: "newuser",
            password: "securePass",
            firstName: "Test",
            lastName: "User",
            email: "new@meeshy.me"
        )

        await auth.register(request: request)

        XCTAssertEqual(auth.registerCallCount, 1)
        XCTAssertEqual(auth.registerRequests.first?.username, "newuser")
        XCTAssertEqual(auth.registerRequests.first?.email, "new@meeshy.me")
    }

    func test_register_failure_setsErrorMessage() async {
        let auth = makeMockAuth()
        auth.registerError = "Username already taken"
        let request = RegisterRequest(
            username: "taken",
            password: "pass",
            firstName: "A",
            lastName: "B",
            email: "taken@meeshy.me"
        )

        await auth.register(request: request)

        XCTAssertEqual(auth.errorMessage, "Username already taken")
    }

    // MARK: - Magic Link

    func test_requestMagicLink_success_returnsTrue() async {
        let auth = makeMockAuth()
        auth.magicLinkResult = true

        let result = await auth.requestMagicLink(email: "user@meeshy.me")

        XCTAssertTrue(result)
        XCTAssertEqual(auth.requestMagicLinkCallCount, 1)
        XCTAssertEqual(auth.requestMagicLinkEmails.first, "user@meeshy.me")
    }

    func test_requestMagicLink_failure_returnsFalse() async {
        let auth = makeMockAuth()
        auth.magicLinkResult = false

        let result = await auth.requestMagicLink(email: "user@meeshy.me")

        XCTAssertFalse(result)
    }

    func test_validateMagicLink_tracksToken() async {
        let auth = makeMockAuth()

        await auth.validateMagicLink(token: "magic-token-123")

        XCTAssertEqual(auth.validateMagicLinkCallCount, 1)
        XCTAssertEqual(auth.validateMagicLinkTokens.first, "magic-token-123")
    }

    // MARK: - Password Reset

    func test_requestPasswordReset_success_returnsTrue() async {
        let auth = makeMockAuth()
        auth.passwordResetResult = true

        let result = await auth.requestPasswordReset(email: "user@meeshy.me")

        XCTAssertTrue(result)
        XCTAssertEqual(auth.requestPasswordResetCallCount, 1)
    }

    func test_requestPasswordReset_failure_returnsFalse() async {
        let auth = makeMockAuth()
        auth.passwordResetResult = false

        let result = await auth.requestPasswordReset(email: "user@meeshy.me")

        XCTAssertFalse(result)
    }

    // MARK: - simulateLoggedIn helper

    func test_simulateLoggedIn_setsAllAuthState() {
        let auth = makeMockAuth()
        let user = makeTestUser()

        auth.simulateLoggedIn(user: user, token: "my-token")

        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(auth.currentUser?.id, user.id)
        XCTAssertEqual(auth.authToken, "my-token")
    }

    // MARK: - Reset

    func test_reset_clearsAllTrackingState() async {
        let auth = makeMockAuth()
        auth.simulateLoggedIn(user: makeTestUser(), token: "tok")
        await auth.login(username: "a", password: "b")
        auth.logout()

        auth.reset()

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.currentUser)
        XCTAssertNil(auth.authToken)
        XCTAssertEqual(auth.loginCallCount, 0)
        XCTAssertEqual(auth.logoutCallCount, 0)
        XCTAssertEqual(auth.handleUnauthorizedCallCount, 0)
        XCTAssertEqual(auth.checkExistingSessionCallCount, 0)
    }

    // MARK: - SDK AuthManager (Singleton) -- State Tests

    func test_authManager_logout_clearsPublishedState() {
        let appAuth = AuthManager.shared

        appAuth.logout()

        XCTAssertFalse(appAuth.isAuthenticated)
        XCTAssertNil(appAuth.currentUser)
    }

    func test_authManager_handleUnauthorized_clearsState() {
        let appAuth = AuthManager.shared

        appAuth.handleUnauthorized()

        XCTAssertFalse(appAuth.isAuthenticated)
        XCTAssertNil(appAuth.currentUser)
    }

    func test_authManager_initialState_notAuthenticated() {
        let appAuth = AuthManager.shared

        appAuth.logout()

        XCTAssertFalse(appAuth.isAuthenticated)
        XCTAssertFalse(appAuth.isLoading)
    }
}
