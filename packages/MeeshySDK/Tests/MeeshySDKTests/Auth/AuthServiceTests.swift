import XCTest
@testable import MeeshySDK

final class AuthServiceTests: XCTestCase {
    private var mock: MockAPIClient!
    private var service: AuthService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = AuthService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeUser(id: String = "user1", username: String = "testuser") -> MeeshyUser {
        MeeshyUser(
            id: id, username: username, email: "test@test.com",
            role: "USER", systemLanguage: "fr",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
        )
    }

    private func makeLoginResponseData(
        token: String = "tok123",
        sessionToken: String? = "sess456",
        expiresIn: Int? = 3600
    ) -> LoginResponseData {
        LoginResponseData(
            user: makeUser(),
            token: token,
            sessionToken: sessionToken,
            expiresIn: expiresIn
        )
    }

    // MARK: - login

    func testLoginSuccess() async throws {
        let loginData = makeLoginResponseData()
        let response = APIResponse(success: true, data: loginData, error: nil)
        mock.stub("/auth/login", result: response)

        let result = try await service.login(username: "testuser", password: "pass123")

        XCTAssertEqual(result.token, "tok123")
        XCTAssertEqual(result.sessionToken, "sess456")
        XCTAssertEqual(result.expiresIn, 3600)
        XCTAssertEqual(result.user.username, "testuser")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/login")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testLoginThrowsOnNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.login(username: "testuser", password: "pass")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.network(.noConnection), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }

        XCTAssertEqual(mock.requestCount, 1)
    }

    func testLoginThrowsOnAuthError() async {
        mock.errorToThrow = MeeshyError.auth(.invalidCredentials)

        do {
            _ = try await service.login(username: "bad", password: "wrong")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.invalidCredentials) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.auth(.invalidCredentials), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    func testLoginWithRememberDeviceFalse() async throws {
        let loginData = makeLoginResponseData()
        let response = APIResponse(success: true, data: loginData, error: nil)
        mock.stub("/auth/login", result: response)

        let result = try await service.login(username: "testuser", password: "pass", rememberDevice: false)

        XCTAssertEqual(result.token, "tok123")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - register

    func testRegisterSuccess() async throws {
        let loginData = makeLoginResponseData(token: "newtoken")
        let response = APIResponse(success: true, data: loginData, error: nil)
        mock.stub("/auth/register", result: response)

        let request = RegisterRequest(
            username: "newuser",
            password: "securePass",
            firstName: "John",
            lastName: "Doe",
            email: "john@test.com"
        )
        let result = try await service.register(request: request)

        XCTAssertEqual(result.token, "newtoken")
        XCTAssertEqual(result.user.id, "user1")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/register")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testRegisterThrowsOnServerError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 409, message: "Username taken")

        let request = RegisterRequest(
            username: "taken", password: "pass",
            firstName: "A", lastName: "B", email: "a@b.com"
        )

        do {
            _ = try await service.register(request: request)
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, let msg) = error {
                XCTAssertEqual(code, 409)
                XCTAssertEqual(msg, "Username taken")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - requestMagicLink

    func testRequestMagicLinkReturnsExpiresInSeconds() async throws {
        let magicResponse = MagicLinkResponse(
            success: true, message: "Email sent",
            expiresInSeconds: 600, error: nil
        )
        mock.stub("/auth/magic-link/request", result: magicResponse)

        let expiry = try await service.requestMagicLink(email: "user@test.com")

        XCTAssertEqual(expiry, 600)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/magic-link/request")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testRequestMagicLinkReturnsDefaultWhenNil() async throws {
        let magicResponse = MagicLinkResponse(
            success: true, message: "Email sent",
            expiresInSeconds: nil, error: nil
        )
        mock.stub("/auth/magic-link/request", result: magicResponse)

        let expiry = try await service.requestMagicLink(email: "user@test.com")

        XCTAssertEqual(expiry, 300)
    }

    func testRequestMagicLinkThrowsOnFailure() async {
        let magicResponse = MagicLinkResponse(
            success: false, message: nil,
            expiresInSeconds: nil, error: "Invalid email"
        )
        mock.stub("/auth/magic-link/request", result: magicResponse)

        do {
            _ = try await service.requestMagicLink(email: "bad")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Invalid email")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    func testRequestMagicLinkThrowsWithMessageFallback() async {
        let magicResponse = MagicLinkResponse(
            success: false, message: "Rate limited",
            expiresInSeconds: nil, error: nil
        )
        mock.stub("/auth/magic-link/request", result: magicResponse)

        do {
            _ = try await service.requestMagicLink(email: "user@test.com")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Rate limited")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    func testRequestMagicLinkThrowsWithDefaultMessage() async {
        let magicResponse = MagicLinkResponse(
            success: false, message: nil,
            expiresInSeconds: nil, error: nil
        )
        mock.stub("/auth/magic-link/request", result: magicResponse)

        do {
            _ = try await service.requestMagicLink(email: "user@test.com")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Erreur inconnue")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    func testRequestMagicLinkWithDeviceFingerprint() async throws {
        let magicResponse = MagicLinkResponse(
            success: true, message: "Email sent",
            expiresInSeconds: 600, error: nil
        )
        mock.stub("/auth/magic-link/request", result: magicResponse)

        let expiry = try await service.requestMagicLink(email: "user@test.com", deviceFingerprint: "fp-abc")

        XCTAssertEqual(expiry, 600)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/magic-link/request")
    }

    // MARK: - validateMagicLink

    func testValidateMagicLinkSuccess() async throws {
        let loginData = makeLoginResponseData(token: "magic-token")
        let response = APIResponse(success: true, data: loginData, error: nil)
        mock.stub("/auth/magic-link/validate", result: response)

        let result = try await service.validateMagicLink(token: "abc-magic-token")

        XCTAssertEqual(result.token, "magic-token")
        XCTAssertEqual(result.user.username, "testuser")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/magic-link/validate")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testValidateMagicLinkThrowsOnError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 400, message: "Invalid token")

        do {
            _ = try await service.validateMagicLink(token: "expired")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 400)
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - requestPasswordReset

    func testRequestPasswordResetSuccess() async throws {
        let response = SimpleAPIResponse(success: true, message: "Email sent", error: nil)
        mock.stub("/auth/forgot-password", result: response)

        try await service.requestPasswordReset(email: "user@test.com")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/forgot-password")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testRequestPasswordResetThrowsOnFailure() async {
        let response = SimpleAPIResponse(success: false, message: nil, error: "User not found")
        mock.stub("/auth/forgot-password", result: response)

        do {
            try await service.requestPasswordReset(email: "unknown@test.com")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "User not found")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    func testRequestPasswordResetThrowsWithMessageFallback() async {
        let response = SimpleAPIResponse(success: false, message: "Try again later", error: nil)
        mock.stub("/auth/forgot-password", result: response)

        do {
            try await service.requestPasswordReset(email: "user@test.com")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Try again later")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - resetPassword

    func testResetPasswordSuccess() async throws {
        let response = SimpleAPIResponse(success: true, message: "Password reset", error: nil)
        mock.stub("/auth/password-reset/reset", result: response)

        try await service.resetPassword(token: "reset-tok", newPassword: "newPass123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/password-reset/reset")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testResetPasswordThrowsOnFailure() async {
        let response = SimpleAPIResponse(success: false, message: nil, error: "Token expired")
        mock.stub("/auth/password-reset/reset", result: response)

        do {
            try await service.resetPassword(token: "expired", newPassword: "new")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Token expired")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    func testResetPasswordThrowsWithDefaultMessage() async {
        let response = SimpleAPIResponse(success: false, message: nil, error: nil)
        mock.stub("/auth/password-reset/reset", result: response)

        do {
            try await service.resetPassword(token: "bad", newPassword: "new")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Erreur inconnue")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - sendPhoneCode

    func testSendPhoneCodeSuccess() async throws {
        let response = SimpleAPIResponse(success: true, message: "Code sent", error: nil)
        mock.stub("/auth/phone/send-code", result: response)

        try await service.sendPhoneCode(phoneNumber: "+33612345678")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/phone/send-code")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testSendPhoneCodeThrowsOnFailure() async {
        let response = SimpleAPIResponse(success: false, message: nil, error: "Invalid phone")
        mock.stub("/auth/phone/send-code", result: response)

        do {
            try await service.sendPhoneCode(phoneNumber: "bad")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Invalid phone")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - verifyPhone

    func testVerifyPhoneSuccess() async throws {
        let verifyData = VerifyPhoneResponse(verified: true, phoneTransferToken: "transfer-abc")
        let response = APIResponse(success: true, data: verifyData, error: nil)
        mock.stub("/auth/phone/verify", result: response)

        let result = try await service.verifyPhone(phoneNumber: "+33612345678", code: "123456")

        XCTAssertEqual(result.verified, true)
        XCTAssertEqual(result.phoneTransferToken, "transfer-abc")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/phone/verify")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testVerifyPhoneThrowsOnError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 400, message: "Invalid code")

        do {
            _ = try await service.verifyPhone(phoneNumber: "+33612345678", code: "wrong")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 400)
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - checkAvailability

    func testCheckAvailabilityUsernameAvailable() async throws {
        let availData = AvailabilityResponse(
            usernameAvailable: true, emailAvailable: nil,
            phoneNumberAvailable: nil, phoneNumberValid: nil,
            suggestions: nil
        )
        let response = APIResponse(success: true, data: availData, error: nil)
        mock.stub("/auth/check-availability", result: response)

        let result = try await service.checkAvailability(username: "newuser")

        XCTAssertEqual(result.usernameAvailable, true)
        XCTAssertTrue(result.available)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/check-availability")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func testCheckAvailabilityUsernameTaken() async throws {
        let availData = AvailabilityResponse(
            usernameAvailable: false, emailAvailable: nil,
            phoneNumberAvailable: nil, phoneNumberValid: nil,
            suggestions: ["newuser1", "newuser2"]
        )
        let response = APIResponse(success: true, data: availData, error: nil)
        mock.stub("/auth/check-availability", result: response)

        let result = try await service.checkAvailability(username: "taken")

        XCTAssertEqual(result.usernameAvailable, false)
        XCTAssertFalse(result.available)
        XCTAssertEqual(result.suggestions?.count, 2)
    }

    func testCheckAvailabilityEmail() async throws {
        let availData = AvailabilityResponse(
            usernameAvailable: nil, emailAvailable: true,
            phoneNumberAvailable: nil, phoneNumberValid: nil,
            suggestions: nil
        )
        let response = APIResponse(success: true, data: availData, error: nil)
        mock.stub("/auth/check-availability", result: response)

        let result = try await service.checkAvailability(email: "new@test.com")

        XCTAssertEqual(result.emailAvailable, true)
        XCTAssertTrue(result.available)
    }

    func testCheckAvailabilityPhone() async throws {
        let availData = AvailabilityResponse(
            usernameAvailable: nil, emailAvailable: nil,
            phoneNumberAvailable: true, phoneNumberValid: true,
            suggestions: nil
        )
        let response = APIResponse(success: true, data: availData, error: nil)
        mock.stub("/auth/check-availability", result: response)

        let result = try await service.checkAvailability(phone: "+33612345678")

        XCTAssertEqual(result.phoneNumberAvailable, true)
        XCTAssertEqual(result.phoneNumberValid, true)
    }

    func testCheckAvailabilityThrowsOnError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 429, message: "Trop de requetes")

        do {
            _ = try await service.checkAvailability(username: "test")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 429)
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - refreshToken

    func testRefreshTokenSuccess() async throws {
        let loginData = makeLoginResponseData(token: "refreshed-token")
        let response = APIResponse(success: true, data: loginData, error: nil)
        mock.stub("/auth/refresh-token", result: response)

        let result = try await service.refreshToken("old-token")

        XCTAssertEqual(result.token, "refreshed-token")
        XCTAssertEqual(result.user.username, "testuser")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/refresh-token")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testRefreshTokenThrowsOnSessionExpired() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            _ = try await service.refreshToken("expired")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.auth(.sessionExpired), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - me

    func testMeReturnsUser() async throws {
        let user = makeUser(id: "me123", username: "currentuser")
        let meData = MeResponseData(user: user)
        let response = APIResponse(success: true, data: meData, error: nil)
        mock.stub("/auth/me", result: response)

        let result = try await service.me()

        XCTAssertEqual(result.id, "me123")
        XCTAssertEqual(result.username, "currentuser")
        XCTAssertEqual(result.email, "test@test.com")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/me")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func testMeThrowsOnUnauthorized() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            _ = try await service.me()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.auth(.sessionExpired), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - changePassword

    func testChangePasswordSuccess() async throws {
        let response = SimpleAPIResponse(success: true, message: "Password changed", error: nil)
        mock.stub("/users/me/password", result: response)

        try await service.changePassword(currentPassword: "oldPass", newPassword: "newPass123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/password")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    func testChangePasswordThrowsOnFailure() async {
        let response = SimpleAPIResponse(success: false, message: nil, error: "Current password is incorrect")
        mock.stub("/users/me/password", result: response)

        do {
            try await service.changePassword(currentPassword: "wrong", newPassword: "newPass123")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Current password is incorrect")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    func testChangePasswordThrowsWithDefaultMessage() async {
        let response = SimpleAPIResponse(success: false, message: nil, error: nil)
        mock.stub("/users/me/password", result: response)

        do {
            try await service.changePassword(currentPassword: "old", newPassword: "new")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(_, let msg) = error {
                XCTAssertEqual(msg, "Erreur inconnue")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - logout

    func testLogoutCallsCorrectEndpoint() async {
        let response = APIResponse(success: true, data: ["loggedOut": true], error: nil)
        mock.stub("/auth/logout", result: response)

        await service.logout()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/logout")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testLogoutSwallowsErrors() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        await service.logout()

        XCTAssertEqual(mock.requestCount, 1)
    }
}
