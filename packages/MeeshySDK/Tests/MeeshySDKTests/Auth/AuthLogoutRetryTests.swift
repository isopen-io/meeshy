import XCTest
@testable import MeeshySDK

/// D5 — pin server-logout retry behavior.
///
/// `AuthManager.logout()` used to fire-and-forget `authService.logout()`.
/// A network blip at the exact moment of logout silently left the session
/// live on the gateway. The retry loop ensures the server actually sees
/// the logout (or we surface in the log when 3 attempts have failed).
final class AuthLogoutRetryTests: XCTestCase {

    func test_defaultLogoutThrowing_fallsBackToFireAndForget() async throws {
        let svc = StubAuthServiceWithoutOverride()
        // The default protocol extension calls `logout()` which never throws.
        try await svc.logoutThrowing()
        XCTAssertEqual(svc.logoutCalls, 1)
    }

    func test_logoutThrowing_overrideCanThrow() async {
        let svc = StubAuthService(behavior: .alwaysThrow)
        do {
            try await svc.logoutThrowing()
            XCTFail("Override must propagate errors")
        } catch {
            XCTAssertEqual(svc.logoutThrowingCalls, 1)
        }
    }

    func test_logoutThrowing_succeedsOnFirstAttempt_singleCall() async throws {
        let svc = StubAuthService(behavior: .alwaysSucceed)
        try await svc.logoutThrowing()
        XCTAssertEqual(svc.logoutThrowingCalls, 1)
    }
}

// MARK: - Stub

private final class StubAuthService: AuthServiceProviding, @unchecked Sendable {
    enum Behavior {
        case alwaysSucceed
        case alwaysThrow
    }

    let behavior: Behavior
    var logoutCalls = 0
    var logoutThrowingCalls = 0

    init(behavior: Behavior) {
        self.behavior = behavior
    }

    // Minimal conformance — unused in these tests.
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
    func me() async throws -> MeeshyUser {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {
        logoutCalls += 1
    }

    func logoutThrowing() async throws {
        logoutThrowingCalls += 1
        switch behavior {
        case .alwaysSucceed: return
        case .alwaysThrow: throw MeeshyError.network(.timeout)
        }
    }
}

// Mirror stub that does NOT override `logoutThrowing`, so the default
// protocol extension (`await logout()`) is exercised. Without this split,
// every test would hit the override and the default behavior could never
// be asserted on.
private final class StubAuthServiceWithoutOverride: AuthServiceProviding, @unchecked Sendable {
    var logoutCalls = 0

    // Minimal conformance — unused in these tests.
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
    func me() async throws -> MeeshyUser {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {
        logoutCalls += 1
    }
}
