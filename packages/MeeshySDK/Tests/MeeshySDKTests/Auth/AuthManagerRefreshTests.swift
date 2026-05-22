import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class AuthManagerRefreshTests: XCTestCase {
    private var originalAuthService: AuthService!
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
        // 1. Setup a valid session first
        let user = MeeshyUser(
            id: "user-123", username: "testuser", email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
        try await AuthManager.shared.applySession(user: user, token: "expired-token", sessionToken: "session-abc")

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
        // 1. Setup a valid session first
        let user = MeeshyUser(
            id: "user-123", username: "testuser", email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
        try await AuthManager.shared.applySession(user: user, token: "expired-token", sessionToken: "session-abc")

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

private class MockAuthServiceForManager: AuthService {
    var refreshTokenCallCount = 0
    var refreshTokenDelayMs: UInt64 = 100 // 100ms
    var stubbedToken = "refreshed-jwt"
    var errorToThrow: Error?

    init() {
        super.init(api: MockAPIClient())
    }

    override func refreshToken(_ token: String, sessionToken: String?) async throws -> LoginResponseData {
        refreshTokenCallCount += 1
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
        return LoginResponseData(user: user, token: stubbedToken, sessionToken: "new-session", expiresIn: 3600)
    }
}
