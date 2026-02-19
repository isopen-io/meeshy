import Foundation
import Combine

@MainActor
public final class AuthManager: ObservableObject {
    public static let shared = AuthManager()

    // MARK: - Published State

    @Published public var isAuthenticated = false
    @Published public var currentUser: MeeshyUser?
    @Published public var isLoading = false
    @Published public var errorMessage: String?

    // MARK: - Storage Keys

    private let tokenKey = "meeshy_auth_token"
    private let userKey = "meeshy_current_user"

    private let authService = AuthService.shared

    private init() {}

    // MARK: - Token Access

    public var authToken: String? {
        get { UserDefaults.standard.string(forKey: tokenKey) }
        set {
            UserDefaults.standard.set(newValue, forKey: tokenKey)
            APIClient.shared.authToken = newValue
        }
    }

    // MARK: - Login

    public func login(username: String, password: String) async {
        isLoading = true
        errorMessage = nil

        do {
            let data = try await authService.login(username: username, password: password)
            applySession(token: data.token, user: data.user)
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Register

    public func register(request: RegisterRequest) async {
        isLoading = true
        errorMessage = nil

        do {
            let data = try await authService.register(request: request)
            applySession(token: data.token, user: data.user)
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Magic Link

    public func requestMagicLink(email: String) async -> Bool {
        isLoading = true
        errorMessage = nil

        do {
            try await authService.requestMagicLink(email: email)
            isLoading = false
            return true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
        return false
    }

    public func validateMagicLink(token: String) async {
        isLoading = true
        errorMessage = nil

        do {
            let data = try await authService.validateMagicLink(token: token)
            applySession(token: data.token, user: data.user)
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Forgot Password

    public func requestPasswordReset(email: String) async -> Bool {
        isLoading = true
        errorMessage = nil

        do {
            try await authService.requestPasswordReset(email: email)
            isLoading = false
            return true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
        return false
    }

    // MARK: - Logout

    public func logout() {
        Task { await authService.logout() }
        authToken = nil
        UserDefaults.standard.removeObject(forKey: userKey)
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Check Existing Session

    public func checkExistingSession() async {
        guard authToken != nil else { return }

        // Load cached user for instant display
        if let userData = UserDefaults.standard.data(forKey: userKey),
           let user = try? JSONDecoder().decode(MeeshyUser.self, from: userData) {
            currentUser = user
        }

        // Verify token with server
        do {
            let user = try await authService.me()
            currentUser = user
            if let encoded = try? JSONEncoder().encode(user) {
                UserDefaults.standard.set(encoded, forKey: userKey)
            }
            isAuthenticated = true
        } catch {
            authToken = nil
            UserDefaults.standard.removeObject(forKey: userKey)
            currentUser = nil
            isAuthenticated = false
        }
    }

    // MARK: - Handle 401

    public func handleUnauthorized() {
        authToken = nil
        UserDefaults.standard.removeObject(forKey: userKey)
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Internal

    private func applySession(token: String, user: MeeshyUser) {
        authToken = token
        if let encoded = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(encoded, forKey: userKey)
        }
        currentUser = user
        isAuthenticated = true
    }
}
