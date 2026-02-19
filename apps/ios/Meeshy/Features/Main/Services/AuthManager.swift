import Foundation
import SwiftUI

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    // MARK: - Published State

    @Published var isAuthenticated = false
    @Published var currentUser: MeeshyUser?
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Storage Keys

    private let tokenKey = "meeshy_auth_token"
    private let userKey = "meeshy_current_user"

    private init() {}

    // MARK: - Login

    func login(username: String, password: String) async {
        isLoading = true
        errorMessage = nil

        do {
            let body = LoginRequest(username: username, password: password, rememberDevice: true)
            let response: APIResponse<LoginResponseData> = try await APIClient.shared.post(
                endpoint: "/auth/login",
                body: body
            )

            let data = response.data
            // Store token
            APIClient.shared.authToken = data.token
            // Store user as JSON
            if let encoded = try? JSONEncoder().encode(data.user) {
                UserDefaults.standard.set(encoded, forKey: userKey)
            }

            currentUser = data.user
            isAuthenticated = true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Logout

    func logout() {
        // Fire-and-forget server logout
        Task {
            let _: APIResponse<[String: Bool]>? = try? await APIClient.shared.request(
                endpoint: "/auth/logout",
                method: "POST"
            )
        }

        APIClient.shared.authToken = nil
        UserDefaults.standard.removeObject(forKey: userKey)
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Check Existing Session

    func checkExistingSession() async {
        guard APIClient.shared.authToken != nil else { return }

        // Load cached user first for instant display
        if let userData = UserDefaults.standard.data(forKey: userKey),
           let user = try? JSONDecoder().decode(MeeshyUser.self, from: userData) {
            currentUser = user
        }

        // Verify token with server
        do {
            let response: APIResponse<MeResponseData> = try await APIClient.shared.request(
                endpoint: "/auth/me"
            )
            currentUser = response.data.user
            // Update cached user
            if let encoded = try? JSONEncoder().encode(response.data.user) {
                UserDefaults.standard.set(encoded, forKey: userKey)
            }
            isAuthenticated = true
        } catch {
            // Token invalid — clear everything
            APIClient.shared.authToken = nil
            UserDefaults.standard.removeObject(forKey: userKey)
            currentUser = nil
            isAuthenticated = false
        }
    }

    // MARK: - Handle 401

    func handleUnauthorized() {
        APIClient.shared.authToken = nil
        UserDefaults.standard.removeObject(forKey: userKey)
        currentUser = nil
        isAuthenticated = false
    }
}
