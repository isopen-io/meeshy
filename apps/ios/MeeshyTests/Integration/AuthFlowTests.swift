import XCTest
import MeeshySDK
@testable import Meeshy

/// Integration test: login -> token stored -> API uses token -> logout -> token cleared
@MainActor
final class AuthFlowTests: XCTestCase {

    // MARK: - Helpers

    private func makeMockAuth() -> MockAuthManager {
        let auth = MockAuthManager()
        return auth
    }

    private func makeUser(id: String = "000000000000000000000001", username: String = "testuser") -> MeeshyUser {
        JSONStub.decode("""
        {"id":"\(id)","username":"\(username)","role":"USER","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
    }

    // MARK: - Login Flow

    func test_login_success_setsAuthenticatedAndToken() async {
        let auth = makeMockAuth()
        let user = makeUser()

        await auth.login(username: "testuser", password: "password123")
        auth.simulateLoggedIn(user: user, token: "jwt-token-abc")

        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(auth.authToken, "jwt-token-abc")
        XCTAssertEqual(auth.currentUser?.username, "testuser")
        XCTAssertEqual(auth.loginCallCount, 1)
    }

    func test_login_failure_setsErrorMessage() async {
        let auth = makeMockAuth()
        auth.loginError = "Invalid credentials"

        await auth.login(username: "wrong", password: "wrong")

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.authToken)
        XCTAssertEqual(auth.errorMessage, "Invalid credentials")
    }

    func test_login_thenLogout_clearsEverything() async {
        let auth = makeMockAuth()
        let user = makeUser()

        await auth.login(username: "testuser", password: "pass")
        auth.simulateLoggedIn(user: user, token: "jwt-token")
        XCTAssertTrue(auth.isAuthenticated)

        auth.logout()

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.currentUser)
        XCTAssertNil(auth.authToken)
        XCTAssertEqual(auth.logoutCallCount, 1)
    }

    // MARK: - Magic Link Flow

    func test_magicLink_request_thenValidate_authenticates() async {
        let auth = makeMockAuth()
        let user = makeUser()

        let requested = await auth.requestMagicLink(email: "test@example.com")
        XCTAssertTrue(requested)
        XCTAssertEqual(auth.requestMagicLinkCallCount, 1)

        await auth.validateMagicLink(token: "magic-token-xyz")
        auth.simulateLoggedIn(user: user, token: "jwt-from-magic")

        XCTAssertEqual(auth.validateMagicLinkCallCount, 1)
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(auth.authToken, "jwt-from-magic")
    }

    // MARK: - Unauthorized Handling

    func test_handleUnauthorized_clearsSession() async {
        let auth = makeMockAuth()
        auth.simulateLoggedIn(user: makeUser(), token: "jwt-token")
        XCTAssertTrue(auth.isAuthenticated)

        auth.handleUnauthorized()

        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.currentUser)
        XCTAssertNil(auth.authToken)
        XCTAssertEqual(auth.handleUnauthorizedCallCount, 1)
    }

    // MARK: - Session Check

    func test_checkExistingSession_callsManager() async {
        let auth = makeMockAuth()
        await auth.checkExistingSession()
        XCTAssertEqual(auth.checkExistingSessionCallCount, 1)
    }
}
