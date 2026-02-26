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
    /// All accounts that have saved credentials on this device, sorted by most recently active.
    @Published public var savedAccounts: [SavedAccount] = []

    // MARK: - Private

    private let keychain = KeychainManager.shared
    private let authService = AuthService.shared

    /// Maximum token age before requiring fresh login (1 year).
    private let tokenMaxAge: TimeInterval = 365 * 24 * 60 * 60

    /// Prevents concurrent refresh loops when APIClient fires multiple 401s.
    private var isRefreshing = false

    // Legacy global keys kept only for one-time migration
    private let legacyTokenKey = "meeshy_auth_token"
    private let legacyUserKey = "meeshy_current_user"

    // UserDefaults keys (non-sensitive)
    private let activeUserIdUDKey = "meeshy_active_user_id"
    private let savedAccountsUDKey = "meeshy_saved_accounts"

    private init() {}

    // MARK: - Namespaced keys

    private func tokenKey(for userId: String) -> String { "meeshy_token_\(userId)" }
    private func userKey(for userId: String) -> String { "meeshy_user_\(userId)" }
    private func tokenDateUDKey(for userId: String) -> String { "meeshy_token_date_\(userId)" }

    // MARK: - Active user

    private var activeUserId: String? {
        get { UserDefaults.standard.string(forKey: activeUserIdUDKey) }
        set { UserDefaults.standard.set(newValue, forKey: activeUserIdUDKey) }
    }

    // MARK: - Token Access

    public var authToken: String? {
        get {
            guard let userId = activeUserId else { return nil }
            return keychain.load(forKey: tokenKey(for: userId))
        }
        set {
            guard let userId = activeUserId else { return }
            if let value = newValue {
                try? keychain.save(value, forKey: tokenKey(for: userId))
            } else {
                keychain.delete(forKey: tokenKey(for: userId))
            }
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
        guard let userId = activeUserId else {
            currentUser = nil
            isAuthenticated = false
            return
        }

        Task { await authService.logout() }

        keychain.delete(forKey: tokenKey(for: userId))
        keychain.delete(forKey: userKey(for: userId))
        UserDefaults.standard.removeObject(forKey: tokenDateUDKey(for: userId))
        removeFromSavedAccounts(userId: userId)

        activeUserId = nil
        currentUser = nil
        isAuthenticated = false
        APIClient.shared.authToken = nil
    }

    // MARK: - Check Existing Session

    public func checkExistingSession() async {
        loadSavedAccounts()
        migrateFromLegacyKeysIfNeeded()

        guard let userId = activeUserId else { return }

        // Reject tokens older than 1 year
        let savedAtTimestamp = UserDefaults.standard.double(forKey: tokenDateUDKey(for: userId))
        if savedAtTimestamp > 0,
           Date().timeIntervalSince(Date(timeIntervalSince1970: savedAtTimestamp)) > tokenMaxAge {
            clearActiveSession(userId: userId)
            return
        }

        guard let token = keychain.load(forKey: tokenKey(for: userId)) else {
            clearActiveSession(userId: userId)
            return
        }

        // Show cached user immediately while network call is in progress
        if let userJSON = keychain.load(forKey: userKey(for: userId)),
           let userData = userJSON.data(using: .utf8),
           let user = try? JSONDecoder().decode(MeeshyUser.self, from: userData) {
            currentUser = user
        }

        APIClient.shared.authToken = token

        do {
            let user = try await authService.me()
            saveUserToKeychain(user, userId: userId)
            currentUser = user
            isAuthenticated = true
            updateSavedAccountActivity(from: user)
        } catch {
            await attemptTokenRefresh(token: token, userId: userId)
        }
    }

    // MARK: - Handle 401 (called from APIClient during active session)

    public func handleUnauthorized() {
        guard !isRefreshing else { return }
        guard let userId = activeUserId,
              let token = keychain.load(forKey: tokenKey(for: userId)) else {
            currentUser = nil
            isAuthenticated = false
            APIClient.shared.authToken = nil
            return
        }

        isRefreshing = true
        Task {
            await attemptTokenRefresh(token: token, userId: userId)
            isRefreshing = false
        }
    }

    // MARK: - Internal session helpers

    private func applySession(token: String, user: MeeshyUser) {
        let userId = user.id

        try? keychain.save(token, forKey: tokenKey(for: userId))
        saveUserToKeychain(user, userId: userId)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: tokenDateUDKey(for: userId))

        activeUserId = userId
        APIClient.shared.authToken = token

        upsertSavedAccount(from: user)
        currentUser = user
        isAuthenticated = true
    }

    private func saveUserToKeychain(_ user: MeeshyUser, userId: String) {
        guard let encoded = try? JSONEncoder().encode(user),
              let jsonString = String(data: encoded, encoding: .utf8) else { return }
        try? keychain.save(jsonString, forKey: userKey(for: userId))
    }

    private func attemptTokenRefresh(token: String, userId: String) async {
        do {
            let data = try await authService.refreshToken(token)
            applySession(token: data.token, user: data.user)
        } catch {
            clearActiveSession(userId: userId)
        }
    }

    private func clearActiveSession(userId: String) {
        keychain.delete(forKey: tokenKey(for: userId))
        keychain.delete(forKey: userKey(for: userId))
        UserDefaults.standard.removeObject(forKey: tokenDateUDKey(for: userId))
        removeFromSavedAccounts(userId: userId)
        activeUserId = nil
        currentUser = nil
        isAuthenticated = false
        APIClient.shared.authToken = nil
    }

    // MARK: - Saved Accounts persistence

    private func loadSavedAccounts() {
        guard let data = UserDefaults.standard.data(forKey: savedAccountsUDKey),
              let accounts = try? JSONDecoder().decode([SavedAccount].self, from: data) else {
            savedAccounts = []
            return
        }
        savedAccounts = accounts.sorted { $0.lastActiveAt > $1.lastActiveAt }
    }

    private func persistSavedAccounts() {
        guard let data = try? JSONEncoder().encode(savedAccounts) else { return }
        UserDefaults.standard.set(data, forKey: savedAccountsUDKey)
    }

    private func upsertSavedAccount(from user: MeeshyUser) {
        let account = SavedAccount(
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarURL: user.avatar,
            lastActiveAt: Date()
        )
        if let idx = savedAccounts.firstIndex(where: { $0.id == user.id }) {
            savedAccounts[idx] = account
        } else {
            savedAccounts.insert(account, at: 0)
        }
        persistSavedAccounts()
    }

    /// Update lastActiveAt without resetting the token saved-at date.
    private func updateSavedAccountActivity(from user: MeeshyUser) {
        upsertSavedAccount(from: user)
    }

    private func removeFromSavedAccounts(userId: String) {
        savedAccounts.removeAll { $0.id == userId }
        persistSavedAccounts()
    }

    // MARK: - Migration from legacy global keys (one-time, at first launch)

    private func migrateFromLegacyKeysIfNeeded() {
        // First migrate any UserDefaults → Keychain entries
        keychain.migrateFromUserDefaults(keys: [legacyTokenKey, legacyUserKey])

        // Only migrate if no active user is set yet
        guard activeUserId == nil,
              let token = keychain.load(forKey: legacyTokenKey),
              let userJSON = keychain.load(forKey: legacyUserKey),
              let userData = userJSON.data(using: .utf8),
              let user = try? JSONDecoder().decode(MeeshyUser.self, from: userData) else {
            return
        }

        let userId = user.id
        try? keychain.save(token, forKey: tokenKey(for: userId))
        try? keychain.save(userJSON, forKey: userKey(for: userId))
        // Use now as tokenSavedAt (we don't know the original date — within 1 year is safe)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: tokenDateUDKey(for: userId))
        activeUserId = userId
        upsertSavedAccount(from: user)

        keychain.delete(forKey: legacyTokenKey)
        keychain.delete(forKey: legacyUserKey)
    }
}
