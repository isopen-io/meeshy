import Foundation

/// Stateless auth API calls. All state management is in AuthManager.
public final class AuthService {
    public static let shared = AuthService()
    private init() {}

    private var api: APIClient { APIClient.shared }

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

    public func requestMagicLink(email: String, deviceFingerprint: String? = nil) async throws {
        let body = MagicLinkRequest(email: email, deviceFingerprint: deviceFingerprint)
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/auth/magic-link/request", body: body)
    }

    public func validateMagicLink(token: String) async throws -> LoginResponseData {
        let body = MagicLinkValidateRequest(token: token)
        let response: APIResponse<LoginResponseData> = try await api.post(endpoint: "/auth/magic-link/validate", body: body)
        return response.data
    }

    // MARK: - Forgot Password

    public func requestPasswordReset(email: String) async throws {
        let body = ForgotPasswordRequest(email: email)
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/auth/password-reset/request", body: body)
    }

    public func resetPassword(token: String, newPassword: String) async throws {
        let body = ResetPasswordRequest(token: token, newPassword: newPassword)
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/auth/password-reset/reset", body: body)
    }

    // MARK: - Phone Verification

    public func sendPhoneCode(phoneNumber: String) async throws {
        let body = SendPhoneCodeRequest(phoneNumber: phoneNumber)
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/auth/phone/send-code", body: body)
    }

    public func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse {
        let body = VerifyPhoneRequest(phoneNumber: phoneNumber, code: code)
        let response: APIResponse<VerifyPhoneResponse> = try await api.post(endpoint: "/auth/phone/verify", body: body)
        return response.data
    }

    // MARK: - Availability

    public func checkAvailability(username: String? = nil, email: String? = nil, phone: String? = nil) async throws -> AvailabilityResponse {
        var items: [URLQueryItem] = []
        if let username { items.append(URLQueryItem(name: "username", value: username)) }
        if let email { items.append(URLQueryItem(name: "email", value: email)) }
        if let phone { items.append(URLQueryItem(name: "phone", value: phone)) }
        return try await api.request(endpoint: "/auth/check-availability", queryItems: items)
    }

    // MARK: - Refresh Token

    public func refreshToken(_ currentToken: String) async throws -> LoginResponseData {
        let body = RefreshTokenRequest(token: currentToken)
        let response: APIResponse<LoginResponseData> = try await api.post(endpoint: "/auth/refresh-token", body: body)
        return response.data
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
