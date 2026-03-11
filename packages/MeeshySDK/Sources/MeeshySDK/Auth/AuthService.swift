import Foundation

public protocol AuthServiceProviding: Sendable {
    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData
    func register(request: RegisterRequest) async throws -> LoginResponseData
    func requestMagicLink(email: String, deviceFingerprint: String?) async throws -> Int
    func validateMagicLink(token: String) async throws -> LoginResponseData
    func requestPasswordReset(email: String) async throws
    func resetPassword(token: String, newPassword: String) async throws
    func sendPhoneCode(phoneNumber: String) async throws
    func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse
    func verifyEmail(code: String) async throws
    func verifyEmailWithCode(code: String, email: String) async throws
    func resendVerificationEmail(email: String) async throws
    func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse
    func refreshToken(_ currentToken: String) async throws -> LoginResponseData
    func me() async throws -> MeeshyUser
    func logout() async
}

/// Stateless auth API calls. All state management is in AuthManager.
public final class AuthService: AuthServiceProviding, @unchecked Sendable {
    public static let shared = AuthService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - Login

    public func login(username: String, password: String, rememberDevice: Bool = true) async throws -> LoginResponseData {
        let body = LoginRequest(username: username, password: password, rememberDevice: rememberDevice)
        let response: APIResponse<LoginResponseData> = try await api.post(endpoint: "/auth/login", body: body)
        return response.data
    }

    // MARK: - Register

    public func register(request: RegisterRequest) async throws -> LoginResponseData {
        let response: APIResponse<LoginResponseData> = try await api.post(endpoint: "/auth/register", body: request)
        return response.data
    }

    // MARK: - Magic Link

    @discardableResult
    public func requestMagicLink(email: String, deviceFingerprint: String? = nil) async throws -> Int {
        let body = MagicLinkRequest(email: email, deviceFingerprint: deviceFingerprint)
        let data = try JSONEncoder().encode(body)
        let response: MagicLinkResponse = try await api.request(
            endpoint: "/auth/magic-link/request", method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
        return response.expiresInSeconds ?? 300
    }

    public func validateMagicLink(token: String) async throws -> LoginResponseData {
        let body = MagicLinkValidateRequest(token: token)
        let response: APIResponse<LoginResponseData> = try await api.post(endpoint: "/auth/magic-link/validate", body: body)
        return response.data
    }

    // MARK: - Forgot Password

    public func requestPasswordReset(email: String) async throws {
        let body = ForgotPasswordRequest(email: email)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/auth/forgot-password", method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    public func resetPassword(token: String, newPassword: String) async throws {
        let body = ResetPasswordRequest(token: token, newPassword: newPassword)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/auth/password-reset/reset", method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    // MARK: - Phone Verification

    public func sendPhoneCode(phoneNumber: String) async throws {
        let body = SendPhoneCodeRequest(phoneNumber: phoneNumber)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/auth/phone/send-code", method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    public func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse {
        let body = VerifyPhoneRequest(phoneNumber: phoneNumber, code: code)
        let response: APIResponse<VerifyPhoneResponse> = try await api.post(endpoint: "/auth/phone/verify", body: body)
        return response.data
    }

    // MARK: - Email Verification

    public func verifyEmail(code: String) async throws {
        let body = VerifyEmailRequest(code: code)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/auth/verify-email", method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    public func verifyEmailWithCode(code: String, email: String) async throws {
        let body = VerifyEmailCodeRequest(code: code, email: email)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/auth/verify-email", method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 400, message: response.error ?? response.message ?? "Verification failed")
        }
    }

    public func resendVerificationEmail(email: String) async throws {
        let body = ResendVerificationRequest(email: email)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/auth/resend-verification", method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    // MARK: - Availability

    public func checkAvailability(username: String? = nil, email: String? = nil, phone: String? = nil) async throws -> AvailabilityResponse {
        var items: [URLQueryItem] = []
        if let username { items.append(URLQueryItem(name: "username", value: username)) }
        if let email { items.append(URLQueryItem(name: "email", value: email)) }
        if let phone { items.append(URLQueryItem(name: "phoneNumber", value: phone)) }
        let response: APIResponse<AvailabilityResponse> = try await api.request(
            endpoint: "/auth/check-availability", queryItems: items
        )
        return response.data
    }

    // MARK: - Refresh Token

    public func refreshToken(_ currentToken: String) async throws -> LoginResponseData {
        let body = RefreshTokenRequest(token: currentToken)
        let response: APIResponse<LoginResponseData> = try await api.post(endpoint: "/auth/refresh-token", body: body)
        return response.data
    }

    // MARK: - Change Password

    public func changePassword(currentPassword: String, newPassword: String) async throws {
        struct Body: Encodable {
            let currentPassword: String
            let newPassword: String
        }
        let body = Body(currentPassword: currentPassword, newPassword: newPassword)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/users/me/password", method: "PATCH", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    // MARK: - Email Verification

    public func verifyEmail(token: String) async throws {
        struct VerifyEmailBody: Encodable { let token: String }
        let body = try JSONEncoder().encode(VerifyEmailBody(token: token))
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/auth/email/verify", method: "POST", body: body
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Verification failed")
        }
    }

    public func resendEmailVerification() async throws {
        let response: SimpleAPIResponse = try await api.request(
            endpoint: "/auth/email/resend-verification", method: "POST"
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Resend failed")
        }
    }

    // MARK: - Me

    public func me() async throws -> MeeshyUser {
        let response: APIResponse<MeResponseData> = try await api.request(endpoint: "/auth/me")
        return response.data.user
    }

    // MARK: - Logout

    public func logout() async {
        let _: APIResponse<[String: Bool]>? = try? await api.request(endpoint: "/auth/logout", method: "POST")
    }
}
