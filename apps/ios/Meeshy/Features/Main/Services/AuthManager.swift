import Foundation
import MeeshySDK
import SwiftUI

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    // MARK: - Published State

    @Published var isAuthenticated = false
    @Published var currentUser: MeeshyUser?
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Private

    private let tokenKey = "meeshy_auth_token"
    private let userKey = "meeshy_current_user"
    private let sessionTokenKey = "meeshy_session_token"
    private let keychain = KeychainManager.shared
    private var refreshTimer: Timer?

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
            APIClient.shared.authToken = data.token
            APIClient.shared.sessionToken = data.sessionToken

            if let encoded = try? JSONEncoder().encode(data.user),
               let jsonString = String(data: encoded, encoding: .utf8) {
                try? keychain.save(jsonString, forKey: userKey)
            }

            currentUser = data.user
            isAuthenticated = true
            scheduleTokenRefresh()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Logout

    func logout() {
        refreshTimer?.invalidate()
        refreshTimer = nil

        Task {
            let _: APIResponse<[String: Bool]>? = try? await APIClient.shared.request(
                endpoint: "/auth/logout",
                method: "POST"
            )
        }

        APIClient.shared.authToken = nil
        APIClient.shared.sessionToken = nil
        keychain.delete(forKey: userKey)
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Check Existing Session

    func checkExistingSession() async {
        keychain.migrateFromUserDefaults(keys: [tokenKey, userKey, sessionTokenKey])

        guard APIClient.shared.authToken != nil else { return }

        if let userJSON = keychain.load(forKey: userKey),
           let userData = userJSON.data(using: .utf8),
           let user = try? JSONDecoder().decode(MeeshyUser.self, from: userData) {
            currentUser = user
        }

        do {
            let response: APIResponse<MeResponseData> = try await APIClient.shared.request(
                endpoint: "/auth/me"
            )
            currentUser = response.data.user
            if let encoded = try? JSONEncoder().encode(response.data.user),
               let jsonString = String(data: encoded, encoding: .utf8) {
                try? keychain.save(jsonString, forKey: userKey)
            }
            isAuthenticated = true
            scheduleTokenRefresh()
        } catch {
            APIClient.shared.authToken = nil
            keychain.delete(forKey: userKey)
            currentUser = nil
            isAuthenticated = false
        }
    }

    // MARK: - Handle 401

    func handleUnauthorized() {
        refreshTimer?.invalidate()
        refreshTimer = nil
        APIClient.shared.authToken = nil
        APIClient.shared.sessionToken = nil
        keychain.delete(forKey: userKey)
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Proactive Token Refresh

    func scheduleTokenRefresh() {
        refreshTimer?.invalidate()

        guard let token = APIClient.shared.authToken,
              let expiry = jwtExpirationDate(from: token) else { return }

        let refreshDate = expiry.addingTimeInterval(-300)
        let delay = max(refreshDate.timeIntervalSinceNow, 60)

        refreshTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            Task { @MainActor in
                await self?.refreshToken()
            }
        }
    }

    private func refreshToken() async {
        guard let currentToken = APIClient.shared.authToken else { return }

        do {
            let response = try await APIClient.shared.refreshAuthToken(currentToken: currentToken)
            APIClient.shared.authToken = response.token
            scheduleTokenRefresh()
        } catch { }
    }

    // MARK: - JWT Decode

    private func jwtExpirationDate(from token: String) -> Date? {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return nil }

        var base64 = String(parts[1])
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }

        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else { return nil }

        return Date(timeIntervalSince1970: exp)
    }
}
