import Foundation
import os

public protocol AuthServiceProviding: Sendable {
    func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData
    func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData
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
    func refreshToken(_ currentToken: String, sessionToken: String?) async throws -> LoginResponseData
    func me() async throws -> MeeshyUser
    func logout() async
    /// D5 — throwing variant so AuthManager.performServerLogoutWithRetries
    /// can detect transient failures and retry. Default implementation
    /// below falls back to the legacy fire-and-forget `logout()` for
    /// conformers that don't override it.
    func logoutThrowing() async throws
    /// D5.hygiene — variant that pins the Authorization header to an
    /// explicitly captured `token`, decoupled from `APIClient.shared.authToken`'s
    /// live value. `AuthManager.logout()` wipes that shared property
    /// concurrently with the retry loop's `Task`, so reading it lazily at
    /// send-time was a race that frequently sent the server logout with NO
    /// Authorization header at all. Default forwards to the parameterless
    /// variant for conformers that haven't opted in (tests, stubs).
    func logoutThrowing(token: String) async throws
}

public extension AuthServiceProviding {
    /// Default fallback for conformers that haven't implemented the
    /// throwing variant yet: best-effort, swallows errors. New tests
    /// (`AuthLogoutRetryTests`) override this on a mock to assert the
    /// retry loop behaves correctly.
    func logoutThrowing() async throws {
        await logout()
    }

    func logoutThrowing(token: String) async throws {
        try await logoutThrowing()
    }
}

/// Stateless auth API calls. All state management is in AuthManager.
public final class AuthService: AuthServiceProviding, @unchecked Sendable {
    public static let shared = AuthService()
    private let api: APIClientProviding
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "auth")

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - Login

    public func login(username: String, password: String, rememberDevice: Bool = true) async throws -> LoginResponseData {
        let body = LoginRequest(username: username, password: password, rememberDevice: rememberDevice)
        let response: APIResponse<LoginResponseData> = try await api.post(AuthEndpoint.login, body: body)
        return response.data
    }

    public func completeLoginWith2FA(twoFactorToken: String, code: String) async throws -> LoginResponseData {
        struct TwoFactorLoginRequest: Encodable {
            let twoFactorToken: String
            let code: String
        }
        let body = TwoFactorLoginRequest(twoFactorToken: twoFactorToken, code: code)
        let response: APIResponse<LoginResponseData> = try await api.post(AuthEndpoint.loginN2Fa, body: body)
        return response.data
    }

    // MARK: - Register

    public func register(request: RegisterRequest) async throws -> LoginResponseData {
        let response: APIResponse<LoginResponseData> = try await api.post(AuthEndpoint.register, body: request)
        return response.data
    }

    // MARK: - Magic Link

    @discardableResult
    public func requestMagicLink(email: String, deviceFingerprint: String? = nil) async throws -> Int {
        let body = MagicLinkRequest(email: email, deviceFingerprint: deviceFingerprint)
        let data = try JSONEncoder().encode(body)
        let response: MagicLinkResponse = try await api.request(
            AuthEndpoint.magicLinkRequest, method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
        return response.expiresInSeconds ?? 300
    }

    public func validateMagicLink(token: String) async throws -> LoginResponseData {
        let body = MagicLinkValidateRequest(token: token)
        let response: APIResponse<LoginResponseData> = try await api.post(AuthEndpoint.magicLinkValidate, body: body)
        return response.data
    }

    // MARK: - Forgot Password

    public func requestPasswordReset(email: String) async throws {
        let body = ForgotPasswordRequest(email: email)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            AuthEndpoint.forgotPassword, method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    public func resetPassword(token: String, newPassword: String) async throws {
        let body = ResetPasswordRequest(token: token, newPassword: newPassword)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            AuthEndpoint.resetPassword, method: "POST", body: data
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
            AuthEndpoint.sendPhoneCode, method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    public func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse {
        let body = VerifyPhoneRequest(phoneNumber: phoneNumber, code: code)
        let response: APIResponse<VerifyPhoneResponse> = try await api.post(AuthEndpoint.verifyPhone, body: body)
        return response.data
    }

    // MARK: - Email Verification

    public func verifyEmail(code: String) async throws {
        let body = VerifyEmailRequest(code: code)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            AuthEndpoint.verifyEmail, method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    public func verifyEmailWithCode(code: String, email: String) async throws {
        let body = VerifyEmailCodeRequest(code: code, email: email)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            AuthEndpoint.verifyEmail, method: "POST", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 400, message: response.error ?? response.message ?? "Verification failed")
        }
    }

    public func resendVerificationEmail(email: String) async throws {
        let body = ResendVerificationRequest(email: email)
        let data = try JSONEncoder().encode(body)
        let response: SimpleAPIResponse = try await api.request(
            AuthEndpoint.resendVerification, method: "POST", body: data
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
            AuthEndpoint.checkAvailability, queryItems: items
        )
        return response.data
    }

    /// Vérifie si un numéro appartient déjà à un compte et, si une identité est
    /// fournie, si ce compte est dormant avec un nom qui matche — auquel cas
    /// `recoverySuggested` est vrai (récupération de compte plutôt que doublon).
    /// Réutilise le endpoint existant `/auth/phone-transfer/check`.
    public func checkPhoneOwnership(
        phone: String,
        countryCode: String? = nil,
        firstName: String? = nil,
        lastName: String? = nil
    ) async throws -> PhoneOwnershipResponse {
        struct Body: Encodable {
            let phoneNumber: String
            let countryCode: String?
            let firstName: String?
            let lastName: String?
        }
        let response: APIResponse<PhoneOwnershipResponse> = try await api.post(
            AuthEndpoint.phoneTransferCheck,
            body: Body(phoneNumber: phone, countryCode: countryCode, firstName: firstName, lastName: lastName)
        )
        return response.data
    }

    // MARK: - Refresh Token

    public func refreshToken(_ currentToken: String, sessionToken: String? = nil) async throws -> LoginResponseData {
        let body = RefreshTokenRequest(token: currentToken, sessionToken: sessionToken)
        let response: APIResponse<LoginResponseData> = try await api.post(AuthEndpoint.refresh, body: body)
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
            UsersEndpoint.mePassword, method: "PATCH", body: data
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Erreur inconnue")
        }
    }

    // MARK: - Email Verification

    // `verifyEmail(token:)` a été RETIRÉE (#4588). Elle visait
    // `/auth/email/verify`, que le serveur ne sert pas — mesuré 404 sur
    // `gate.staging.meeshy.me` — et n'avait AUCUN appelant. Sa jumelle vivante
    // est `verifyEmail(code:)`, quelques lignes plus haut, sur la bonne
    // adresse. Deux fonctions au nom quasi identique, une seule qui marche :
    // c'est ce qui rend ce défaut invisible à la relecture.

    public func resendEmailVerification() async throws {
        let response: SimpleAPIResponse = try await api.request(
            AuthEndpoint.resendVerification, method: "POST"
        )
        guard response.success else {
            throw MeeshyError.server(statusCode: 0, message: response.error ?? response.message ?? "Resend failed")
        }
    }

    // MARK: - Me

    public func me() async throws -> MeeshyUser {
        let response: APIResponse<MeResponseData> = try await api.request(AuthEndpoint.me)
        return response.data.user
    }

    // MARK: - Logout

    public func logout() async {
        do {
            let _: APIResponse<[String: Bool]> = try await api.request(AuthEndpoint.logout, method: "POST")
        } catch {
            // Best-effort assumé : la déconnexion locale doit aboutir même hors
            // ligne. `logoutThrowing()` est la variante à utiliser quand
            // l'appelant sait retenter (cf. `performServerLogoutWithRetries`).
            logger.error(
                "Server logout failed — local session cleared anyway, gateway session may stay live: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    /// D5 — throwing variant used by `AuthManager.performServerLogoutWithRetries`
    /// so the retry loop can distinguish network failures (worth retrying)
    /// from a successful ack. The legacy `logout()` swallowed errors which
    /// silently left the session live on the gateway when the device was
    /// offline at the moment of logout.
    public func logoutThrowing() async throws {
        let _: APIResponse<[String: Bool]> = try await api.request(AuthEndpoint.logout, method: "POST")
    }

    /// D5.hygiene — sends the explicit `token` as the Authorization header
    /// via `requestWithHeaders`, instead of relying on `APIClient.shared.authToken`
    /// (which `AuthManager.logout()` may have already wiped to `nil` by the
    /// time this retry loop actually sends its request).
    public func logoutThrowing(token: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.requestWithHeaders(
            AuthEndpoint.logout,
            method: "POST",
            body: nil,
            queryItems: nil,
            headers: ["Authorization": "Bearer \(token)"]
        )
    }
}
