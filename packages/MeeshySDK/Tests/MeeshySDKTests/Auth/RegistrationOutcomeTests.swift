import XCTest
@testable import MeeshySDK

/// #8055 — sans numéro de téléphone, un compte n'est actif qu'une fois son
/// adresse prouvée : `POST /auth/register` rend alors `verification-required`,
/// sans session, et l'inscription doit présenter l'écran du code au lieu de
/// remonter une « réponse tronquée ».
@MainActor
final class RegistrationOutcomeTests: XCTestCase {
    private var originalAuthService: AuthServiceProviding!

    override func setUp() async throws {
        try await super.setUp()
        originalAuthService = AuthManager.shared.authService
    }

    override func tearDown() async throws {
        AuthManager.shared.authService = originalAuthService
        try await super.tearDown()
    }

    private func decode(_ json: String) throws -> LoginResponseData {
        try JSONDecoder().decode(APIResponse<LoginResponseData>.self, from: Data(json.utf8)).data
    }

    private func request(email: String) -> RegisterRequest {
        RegisterRequest(displayName: "Lena", email: email, password: "Xk9$mQ2vLp8#nR4wZ")
    }

    func test_registerThrowing_verificationRequired_returnsPendingVerificationWithoutSession() async throws {
        let served = try decode(#"{"success":true,"data":{"status":"verification-required","accountCreated":true,"email":"lena@example.com"}}"#)
        AuthManager.shared.authService = StubRegistrationAuthService(response: served)
        let tokenBefore = AuthManager.shared.authToken

        let outcome = try await AuthManager.shared.registerThrowing(request: request(email: "Lena@Example.com"))

        XCTAssertEqual(outcome, .verificationRequired(PendingEmailVerification(email: "lena@example.com", accountCreated: true)))
        XCTAssertEqual(AuthManager.shared.authToken, tokenBefore)
        XCTAssertNil(AuthManager.shared.errorMessage)
    }

    func test_registerThrowing_verificationRequiredWithoutServedEmail_fallsBackToRequestedAddress() async throws {
        let served = try decode(#"{"success":true,"data":{"status":"verification-required"}}"#)
        AuthManager.shared.authService = StubRegistrationAuthService(response: served)

        let outcome = try await AuthManager.shared.registerThrowing(request: request(email: "lena@example.com"))

        XCTAssertEqual(outcome, .verificationRequired(PendingEmailVerification(email: "lena@example.com", accountCreated: false)))
    }

    func test_register_verificationRequired_leavesNoErrorMessage() async throws {
        let served = try decode(#"{"success":true,"data":{"status":"verification-required","accountCreated":true,"email":"lena@example.com"}}"#)
        AuthManager.shared.authService = StubRegistrationAuthService(response: served)

        await AuthManager.shared.register(request: request(email: "lena@example.com"))

        XCTAssertNil(AuthManager.shared.errorMessage)
    }
}

private final class StubRegistrationAuthService: AuthServiceProviding, @unchecked Sendable {
    let response: LoginResponseData

    init(response: LoginResponseData) { self.response = response }

    func register(request: RegisterRequest) async throws -> LoginResponseData { response }

    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData {
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
    func confirmEmail(_ request: EmailVerificationRequest) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse {
        throw MeeshyError.network(.noConnection)
    }
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData {
        throw MeeshyError.network(.noConnection)
    }
    func me() async throws -> MeeshyUser {
        throw MeeshyError.network(.noConnection)
    }
    func logout() async {}
}
