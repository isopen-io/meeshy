import Foundation
import Combine
import os

// MARK: - Profile Snapshot

/// Immutable capture of the three profile-editable fields, returned by
/// `AuthManaging.applyLocalProfileChanges` and consumed by
/// `restoreLocalProfileSnapshot` for optimistic-rollback flows.
public struct ProfileSnapshot: Sendable, Equatable {
    public let displayName: String?
    public let bio: String?
    public let avatarUrl: String?

    public init(displayName: String?, bio: String?, avatarUrl: String?) {
        self.displayName = displayName
        self.bio = bio
        self.avatarUrl = avatarUrl
    }
}

// MARK: - Protocol

@MainActor
public protocol AuthManaging: AnyObject {
    var isAuthenticated: Bool { get }
    var currentUser: MeeshyUser? { get }
    var isLoading: Bool { get }
    var errorMessage: String? { get }
    var savedAccounts: [SavedAccount] { get }
    var authToken: String? { get }
    var currentUserPublisher: AnyPublisher<MeeshyUser?, Never> { get }
    func login(username: String, password: String) async
    func register(request: RegisterRequest) async
    func requestMagicLink(email: String) async -> Bool
    func validateMagicLink(token: String) async
    func requestPasswordReset(email: String) async -> Bool
    func logout()
    func checkExistingSession() async
    func handleUnauthorized()
    func removeSavedAccount(userId: String)

    /// Applies up to three profile field changes locally, without any
    /// network call. `nil` for a field means "leave unchanged". Returns
    /// a snapshot of the pre-mutation values for later rollback.
    /// Publishes via `currentUser` so all subscribers refresh in the
    /// same run-loop tick.
    @discardableResult
    func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot

    /// Restores the three profile fields from a snapshot. Used by
    /// EditProfileViewModel when `OfflineQueue.outcomeStream` emits
    /// `.exhausted` for the corresponding `updateProfile` row.
    func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot)
}

// MARK: - Implementation

@MainActor
public final class AuthManager: ObservableObject, AuthManaging {
    public static let shared = AuthManager()

    // MARK: - Published State

    @Published public var isAuthenticated = false
    @Published public var currentUser: MeeshyUser?
    @Published public var isLoading = false
    @Published public var errorMessage: String?
    /// All accounts that have saved credentials on this device, sorted by most recently active.
    @Published public var savedAccounts: [SavedAccount] = []

    /// Fires every time the SDK rotates the JWT for the currently active
    /// user — i.e. `applySession` ran while the same userId was already
    /// authenticated. `MessageSocketManager` already reacts to this via a
    /// direct `forceReconnect()` call inside `applySession`; the publisher
    /// is exposed so other long-lived subscribers (NSE, widgets) can also
    /// react to a fresh token without coupling to `MessageSocketManager`.
    ///
    /// P2.2 — the audit suspected this signal was missing; in fact the
    /// direct socket-reconnect chain has existed since the initial
    /// implementation. The publisher pins the contract for future readers.
    public let tokenDidRotate = PassthroughSubject<Void, Never>()

    // MARK: - Protocol Publisher

    public var currentUserPublisher: AnyPublisher<MeeshyUser?, Never> {
        $currentUser.eraseToAnyPublisher()
    }

    // MARK: - Private

    private let keychain = KeychainManager.shared
    private let authService = AuthService.shared

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
    private func sessionTokenKey(for userId: String) -> String { "meeshy_session_token_\(userId)" }
    private func tokenDateUDKey(for userId: String) -> String { "meeshy_token_date_\(userId)" }

    // MARK: - Active user

    private var activeUserId: String? {
        get { UserDefaults.standard.string(forKey: activeUserIdUDKey) }
        set {
            UserDefaults.standard.set(newValue, forKey: activeUserIdUDKey)
            UserDefaults(suiteName: "group.me.meeshy.apps")?.set(newValue, forKey: activeUserIdUDKey)
        }
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

    // MARK: - Token Expiration Check

    /// Returns true if the stored JWT is expired (with 30s margin).
    /// Decodes the payload inline to read `exp`.
    ///
    /// D2 — every "malformed → expired" branch now logs a structured
    /// reason so the next time a user complains about a silent logout
    /// we can trace whether the JWT was truncated, base64-corrupted,
    /// or just missing `exp`. Returning `true` is the safe default
    /// (forces refresh) but the silence was actively hurting support.
    public var isCurrentTokenExpired: Bool {
        Self.isTokenExpired(authToken, now: Date())
    }

    /// D2 — pure decoder so tests can probe every branch without driving
    /// the singleton's Keychain/UserDefaults state. Returns `true` for
    /// every malformed input (safe default) and logs the reason so a
    /// silent-logout report can be traced.
    nonisolated public static func isTokenExpired(_ token: String?, now: Date) -> Bool {
        guard let token else { return true }
        let parts = token.split(separator: ".")
        guard parts.count == 3 else {
            Logger.auth.warning("JWT structurally invalid (parts=\(parts.count)); treating as expired")
            return true
        }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let data = Data(base64Encoded: base64) else {
            Logger.auth.warning("JWT payload base64 decode failed; treating as expired")
            return true
        }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            Logger.auth.warning("JWT payload not JSON; treating as expired")
            return true
        }
        guard let exp = json["exp"] as? TimeInterval else {
            Logger.auth.warning("JWT payload missing `exp` claim; treating as expired")
            return true
        }
        return Date(timeIntervalSince1970: exp).addingTimeInterval(-30) < now
    }

    // MARK: - Login

    public func login(username: String, password: String) async {
        isLoading = true
        errorMessage = nil

        do {
            let data = try await authService.login(username: username, password: password)
            applySession(token: data.token, sessionToken: data.sessionToken, user: data.user)
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
            applySession(token: data.token, sessionToken: data.sessionToken, user: data.user)
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
            applySession(token: data.token, sessionToken: data.sessionToken, user: data.user)
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

        // D5 — drive the server-side logout with retries (network blip
        // should not leave the session live on the gateway).
        Task { await self.performServerLogoutWithRetries() }

        keychain.delete(forKey: tokenKey(for: userId))
        keychain.delete(forKey: sessionTokenKey(for: userId))
        keychain.delete(forKey: userKey(for: userId))
        UserDefaults.standard.removeObject(forKey: tokenDateUDKey(for: userId))
        removeFromSavedAccounts(userId: userId)

        activeUserId = nil
        currentUser = nil
        isAuthenticated = false
        APIClient.shared.authToken = nil

        // D3 — wipe every cached store so a subsequent login (same device,
        // different user) cannot momentarily render the previous user's
        // conversations / friends / profiles. `CacheCoordinator.reset()`
        // also tears down lifecycle subscriptions so the next login starts
        // from a clean slate. Best-effort: the local logout already
        // succeeded above, so a cache reset failure here cannot block UX.
        Task {
            await CacheCoordinator.shared.reset()
        }
    }

    /// D5 — best-effort server logout with bounded retries. Returns once
    /// the server has acked OR after 3 attempts (10s total) have failed.
    /// The local logout state is already gone by the time this runs, so
    /// failures are tolerated — the worst case is the gateway sees the
    /// next request, fails token verification, and lazily kills the
    /// session.
    private func performServerLogoutWithRetries() async {
        let delays: [TimeInterval] = [0, 1, 5] // total ≈ 6s wall-clock
        for delay in delays {
            if delay > 0 {
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
            do {
                try await authService.logoutThrowing()
                return
            } catch {
                Logger.auth.warning("Server logout attempt failed: \(error.localizedDescription)")
            }
        }
        Logger.auth.error("Server logout exhausted retries — session may linger on gateway")
    }

    // MARK: - Remove Saved Account

    public func removeSavedAccount(userId: String) {
        keychain.delete(forKey: tokenKey(for: userId))
        keychain.delete(forKey: sessionTokenKey(for: userId))
        keychain.delete(forKey: userKey(for: userId))
        UserDefaults.standard.removeObject(forKey: tokenDateUDKey(for: userId))
        removeFromSavedAccounts(userId: userId)

        if activeUserId == userId {
            activeUserId = nil
            currentUser = nil
            isAuthenticated = false
            APIClient.shared.authToken = nil
        }
    }

    // MARK: - Check Existing Session

    public func checkExistingSession() async {
        loadSavedAccounts()
        migrateFromLegacyKeysIfNeeded()

        guard let userId = activeUserId else { return }

        guard let token = keychain.load(forKey: tokenKey(for: userId)) else {
            // Keychain empty for this user. Saved accounts stay intact so
            // re-login is one tap, but we have no session to restore.
            activeUserId = nil
            isAuthenticated = false
            return
        }

        let sessionToken = keychain.load(forKey: sessionTokenKey(for: userId))

        // Show cached user immediately — authenticate from cache before any
        // network call so the UI never blanks on app launch. If the cached
        // JSON is corrupt or stale (schema migration etc.) we drop the entry
        // so the next launch starts clean and the background revalidation
        // below repopulates it from the server.
        if let userJSON = keychain.load(forKey: userKey(for: userId)),
           let userData = userJSON.data(using: .utf8) {
            if let user = try? JSONDecoder().decode(MeeshyUser.self, from: userData) {
                currentUser = user
            } else {
                keychain.delete(forKey: userKey(for: userId))
            }
        }

        APIClient.shared.authToken = token
        isAuthenticated = true

        // Proactive refresh: if the JWT is expired or near-expiry AND we have
        // a long-lived sessionToken, mint a new JWT BEFORE other API calls
        // race in and trip the 401 path. With the gateway's sliding-window
        // semantics this also extends the session another 365 days, so an
        // active user is renewed indefinitely.
        if isCurrentTokenExpired, let sessionToken = sessionToken {
            isRefreshing = true
            await attemptTokenRefresh(token: token, sessionToken: sessionToken, userId: userId)
            isRefreshing = false
        }

        // Background revalidation (stale-while-revalidate for the user
        // profile). Auth failures here surface a re-auth state so the user
        // can sign in again — the saved account is preserved, just the
        // password (or biometric) is needed.
        Task { [weak self] in
            do {
                let user = try await AuthService.shared.me()
                await self?.updateUserAfterRevalidation(user, userId: userId)
            } catch let error as MeeshyError {
                switch error {
                case .auth:
                    await self?.requireReauthentication(userId: userId)
                case .network, .server, .message, .media, .forbidden, .unknown:
                    // Transient — keep session, retry on next 401 / launch.
                    break
                }
            } catch {
                // Cancellation / unknown — preserve session.
            }
        }
    }

    // MARK: - Handle 401 (called from APIClient during active session)

    public func handleUnauthorized() {
        guard !isRefreshing else { return }
        guard let userId = activeUserId else {
            // No active user at all — nothing to refresh, no state to clear.
            return
        }

        // The gateway needs a parseable JWT to extract the userId for the
        // trusted-session lookup (sessionToken alone isn't enough). In normal
        // flow, login/refresh always store the JWT and sessionToken together,
        // so a missing JWT means keychain corruption — surface re-auth.
        guard let token = keychain.load(forKey: tokenKey(for: userId)) else {
            requireReauthentication(userId: userId)
            return
        }

        let sessionToken = keychain.load(forKey: sessionTokenKey(for: userId))

        // D1 — guard against concurrent refreshes. `@MainActor` already
        // serializes consecutive `handleUnauthorized()` calls so the
        // `guard !isRefreshing` above is sufficient, but we lift the flag
        // reset into a `defer` so a future refactor that introduces
        // mid-await cancellation can't leave the flag stuck `true` (which
        // would silently block every subsequent 401 from ever triggering
        // a refresh).
        isRefreshing = true
        Task { [weak self] in
            defer { Task { @MainActor [weak self] in self?.isRefreshing = false } }
            await self?.attemptTokenRefresh(token: token, sessionToken: sessionToken, userId: userId)
        }
    }

    // MARK: - Internal session helpers

    /// Pure helper exposed for tests: returns true iff a new
    /// `applySession(token:sessionToken:user:)` call constitutes a token
    /// rotation (same user already authenticated). Pulled out of
    /// `applySession` so the contract can be pinned without driving the
    /// full keychain / sockets side effects.
    nonisolated static func isTokenRotation(
        currentlyAuthenticated: Bool,
        currentActiveUserId: String?,
        newUserId: String
    ) -> Bool {
        currentlyAuthenticated && currentActiveUserId == newUserId
    }

    private func applySession(token: String, sessionToken: String?, user: MeeshyUser) {
        let userId = user.id
        // Capture BEFORE we mutate state. If we were already authenticated
        // when applySession runs, this is a token rotation (refresh) — the
        // sockets need to be torn down and reconnected with the new JWT.
        // The `onChange(isAuthenticated:)` observer in MeeshyApp would
        // otherwise miss this transition because the boolean stays true
        // throughout the rotation.
        let isTokenRotation = Self.isTokenRotation(
            currentlyAuthenticated: isAuthenticated,
            currentActiveUserId: activeUserId,
            newUserId: userId
        )

        try? keychain.save(token, forKey: tokenKey(for: userId))
        if let sessionToken = sessionToken, !sessionToken.isEmpty {
            try? keychain.save(sessionToken, forKey: sessionTokenKey(for: userId))
        }
        saveUserToKeychain(user, userId: userId)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: tokenDateUDKey(for: userId))

        activeUserId = userId
        APIClient.shared.authToken = token

        upsertSavedAccount(from: user)
        currentUser = user
        isAuthenticated = true

        if isTokenRotation {
            MessageSocketManager.shared.forceReconnect()
            SocialSocketManager.shared.forceReconnect()
            tokenDidRotate.send(())
        }
    }

    /// Soft re-auth signal: the server told us the session is genuinely
    /// invalid (revoked, expired beyond the sliding window, account
    /// disabled). We clear the active token + sessionToken so the API
    /// client stops sending dead credentials and flip `isAuthenticated`
    /// to false so the UI can prompt for re-login. The saved account is
    /// preserved — the user just needs to enter their password again.
    private func requireReauthentication(userId: String) {
        keychain.delete(forKey: tokenKey(for: userId))
        keychain.delete(forKey: sessionTokenKey(for: userId))
        UserDefaults.standard.removeObject(forKey: tokenDateUDKey(for: userId))
        activeUserId = nil
        currentUser = nil
        isAuthenticated = false
        APIClient.shared.authToken = nil
    }

    private func saveUserToKeychain(_ user: MeeshyUser, userId: String) {
        let sanitized = sanitizeDataURIs(user)
        guard let encoded = try? JSONEncoder().encode(sanitized),
              let jsonString = String(data: encoded, encoding: .utf8) else { return }
        try? keychain.save(jsonString, forKey: userKey(for: userId))
    }

    private func sanitizeDataURIs(_ user: MeeshyUser) -> MeeshyUser {
        let hasDataAvatar = user.avatar?.hasPrefix("data:") == true
        let hasDataBanner = user.banner?.hasPrefix("data:") == true
        guard hasDataAvatar || hasDataBanner else { return user }
        return MeeshyUser(
            id: user.id, username: user.username, email: user.email,
            firstName: user.firstName, lastName: user.lastName,
            displayName: user.displayName, bio: user.bio,
            avatar: hasDataAvatar ? nil : user.avatar,
            banner: hasDataBanner ? nil : user.banner,
            role: user.role, systemLanguage: user.systemLanguage,
            regionalLanguage: user.regionalLanguage,
            isOnline: user.isOnline, lastActiveAt: user.lastActiveAt,
            createdAt: user.createdAt, updatedAt: user.updatedAt,
            blockedUserIds: user.blockedUserIds, isActive: user.isActive,
            deactivatedAt: user.deactivatedAt, isAnonymous: user.isAnonymous,
            isMeeshyer: user.isMeeshyer, phoneNumber: user.phoneNumber,
            emailVerifiedAt: user.emailVerifiedAt, phoneVerifiedAt: user.phoneVerifiedAt,
            customDestinationLanguage: user.customDestinationLanguage,
            autoTranslateEnabled: user.autoTranslateEnabled,
            timezone: user.timezone, registrationCountry: user.registrationCountry,
            profileCompletionRate: user.profileCompletionRate,
            signalIdentityKeyPublic: user.signalIdentityKeyPublic
        )
    }

    private func updateUserAfterRevalidation(_ user: MeeshyUser, userId: String) {
        // Server-side deactivation (admin disable, account deletion, etc.)
        // arrives as `isActive: false` on a 200 /auth/me response. The token
        // is still cryptographically valid but the account is dead — surface
        // a re-auth screen so the user knows and so the app stops issuing
        // calls on a zombie session.
        if user.isActive == false {
            requireReauthentication(userId: userId)
            return
        }
        saveUserToKeychain(user, userId: userId)
        self.currentUser = user
        self.updateSavedAccountActivity(from: user)
    }

    private func attemptTokenRefresh(token: String, sessionToken: String?, userId: String) async {
        do {
            let data = try await authService.refreshToken(token, sessionToken: sessionToken)
            applySession(token: data.token, sessionToken: data.sessionToken, user: data.user)
        } catch let error as MeeshyError {
            switch error {
            case .auth:
                // The server refuses both the JWT and the sessionToken — the
                // session is genuinely invalid (revoked / expired beyond the
                // sliding window / account disabled). Surface the re-auth
                // screen; saved account is kept so it's still one-tap.
                requireReauthentication(userId: userId)
            case .network, .server, .message, .media, .forbidden, .unknown:
                // Transient or scoped (resource 403) — preserve session,
                // the next 401 will retry the refresh.
                break
            }
        } catch {
            // Cancellation / unknown — preserve session.
        }
    }

    // MARK: - Saved Accounts persistence

    private func loadSavedAccounts() {
        guard let data = UserDefaults.standard.data(forKey: savedAccountsUDKey),
              let accounts = try? JSONDecoder().decode([SavedAccount].self, from: data) else {
            savedAccounts = []
            return
        }
        // D4 — sort with a stable secondary key (`id`). When two accounts
        // share the same `lastActiveAt` (rare but possible across rapid
        // automated logins or sub-millisecond switches) the prior code
        // could produce a different ordering on each cold start because
        // Swift's `sorted(by:)` only guarantees stability since 5.0 and
        // even then only for the *exact same input order*; the input is
        // a Decodable dict-roundtripped Array whose order isn't
        // contractually stable.
        savedAccounts = accounts.sorted { a, b in
            if a.lastActiveAt != b.lastActiveAt {
                return a.lastActiveAt > b.lastActiveAt
            }
            return a.id < b.id
        }
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

    // MARK: - Local Profile Mutation (optimistic)

    @discardableResult
    public func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot {
        let snapshot = ProfileSnapshot(
            displayName: currentUser?.displayName,
            bio: currentUser?.bio,
            avatarUrl: currentUser?.avatar
        )
        guard let user = currentUser else { return snapshot }
        currentUser = user.withProfileChanges(
            displayName: displayName,
            bio: bio,
            avatar: avatarUrl
        )
        return snapshot
    }

    public func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot) {
        guard let user = currentUser else { return }
        currentUser = user.withProfileChanges(
            displayName: snapshot.displayName,
            bio: snapshot.bio,
            avatar: snapshot.avatarUrl
        )
    }
}
