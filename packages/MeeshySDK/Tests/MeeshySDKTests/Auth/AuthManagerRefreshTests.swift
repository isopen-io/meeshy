import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class AuthManagerRefreshTests: XCTestCase {
    private var originalAuthService: AuthServiceProviding!
    private var mockAuthService: MockAuthServiceForManager!

    override func setUp() async throws {
        try await super.setUp()
        originalAuthService = AuthManager.shared.authService
        mockAuthService = MockAuthServiceForManager()
        AuthManager.shared.authService = mockAuthService
    }

    override func tearDown() async throws {
        AuthManager.shared.logout()
        AuthManager.shared.authService = originalAuthService
        try await super.tearDown()
    }

    func testConcurrentRefreshSerializesCalls() async throws {
        // Skipped: drives the real `AuthManager.shared` singleton + real
        // `KeychainManager`. In the SPM xctest process the keychain access
        // is not entitled, so `applySession` cannot persist the token and
        // `refreshSession` short-circuits with `sessionExpired` before
        // hitting the mock. Needs a `KeychainStoring` injection seam on
        // `AuthManager` (tracked in tasks/todo.md) before this can run.
        try XCTSkipIf(true, "Requires keychain isolation harness on AuthManager")
        // 1. Setup a valid session first
        let user = MeeshyUser(
            id: "user-123", username: "testuser", email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
        AuthManager.shared.applySession(token: "expired-token", sessionToken: "session-abc", user: user)

        // 2. Perform 5 concurrent refreshes
        mockAuthService.stubbedToken = "refreshed-jwt-success"

        let result = try await withThrowingTaskGroup(of: String.self) { group -> [String] in
            for _ in 0..<5 {
                group.addTask {
                    return try await AuthManager.shared.refreshSession(force: true)
                }
            }
            var tokens: [String] = []
            for try await token in group {
                tokens.append(token)
            }
            return tokens
        }

        // 3. Verify they all got the same refreshed token
        XCTAssertEqual(result.count, 5)
        for token in result {
            XCTAssertEqual(token, "refreshed-jwt-success")
        }

        // 4. Verify only exactly 1 refresh call was made to the authService
        XCTAssertEqual(mockAuthService.refreshTokenCallCount, 1)
    }

    func testConcurrentRefreshPropagatesErrors() async throws {
        // See `testConcurrentRefreshSerializesCalls` for the rationale.
        try XCTSkipIf(true, "Requires keychain isolation harness on AuthManager")
        // 1. Setup a valid session first
        let user = MeeshyUser(
            id: "user-123", username: "testuser", email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
        AuthManager.shared.applySession(token: "expired-token", sessionToken: "session-abc", user: user)

        // 2. Mock service to fail
        mockAuthService.errorToThrow = MeeshyError.auth(.sessionExpired)

        // 3. Perform concurrent refreshes and verify they all fail
        do {
            try await withThrowingTaskGroup(of: String.self) { group in
                for _ in 0..<5 {
                    group.addTask {
                        return try await AuthManager.shared.refreshSession(force: true)
                    }
                }
                for try await _ in group {}
            }
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected sessionExpired, got \(error)")
            }
        }

        // 4. Verify only exactly 1 refresh call was made to the authService
        XCTAssertEqual(mockAuthService.refreshTokenCallCount, 1)
    }
}

// MARK: - Stub conforming to AuthServiceProviding
//
// The production `AuthService` is `final`, so we conform to the protocol
// directly instead of subclassing. Only the methods this suite exercises
// (`refreshToken`) record state; the rest throw to flag accidental use.

private final class MockAuthServiceForManager: AuthServiceProviding, @unchecked Sendable {
    private let queue = DispatchQueue(label: "MockAuthServiceForManager.lock")
    private var _refreshTokenCallCount = 0
    var refreshTokenCallCount: Int {
        get { queue.sync { _refreshTokenCallCount } }
        set { queue.sync { _refreshTokenCallCount = newValue } }
    }
    var refreshTokenDelayMs: UInt64 = 100
    var stubbedToken = "refreshed-jwt"
    var errorToThrow: Error?

    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        queue.sync { _refreshTokenCallCount += 1 }
        try await Task.sleep(nanoseconds: refreshTokenDelayMs * 1_000_000)
        if let error = errorToThrow {
            throw error
        }

        let user = MeeshyUser(
            id: "user-123", username: "testuser", email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
        return LoginResponseData(
            user: user,
            token: stubbedToken,
            sessionToken: "new-session",
            expiresIn: 3600,
            requires2FA: nil,
            twoFactorToken: nil
        )
    }

    // MARK: Unused conformances — fail loudly if accidentally hit.

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
    func me() async throws -> MeeshyUser {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {}
}
