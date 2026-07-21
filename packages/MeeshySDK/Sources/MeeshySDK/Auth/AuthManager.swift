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
    var requires2FA: Bool { get }
    var twoFactorToken: String? { get }
    func completeLoginWith2FA(code: String) async
    func login(username: String, password: String) async
    func register(request: RegisterRequest) async
    func requestMagicLink(email: String) async -> Bool
    func validateMagicLink(token: String) async
    func requestPasswordReset(email: String) async -> Bool
    /// P1 — quiesce-then-purge : disconnect sockets, reset les services SDK
    /// (BlockService, UserPreferences, PushNotification, Notification*, etc.),
    /// wipe le SessionSnapshot puis le keychain, et enfin bascule
    /// `isAuthenticated = false` en dernier pour que le router voie un état
    /// cohérent. Voir `docs/superpowers/specs/2026-05-26-user-session-migration-design.md`.
    func logout() async
    func checkExistingSession() async
    func handleUnauthorized()
    @discardableResult
    func refreshSession(force: Bool) async throws -> String
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
    @Published public var requires2FA = false
    @Published public var twoFactorToken: String?
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

    private let keychain: any KeychainStoring
    private let userDefaults: UserDefaults
    private let groupDefaults: UserDefaults?

    /// Backed by the protocol type so tests can inject a stub conforming
    /// to `AuthServiceProviding` without subclassing the production
    /// `final` `AuthService`.
    internal var authService: AuthServiceProviding = AuthService.shared

    /// Prevents concurrent refresh loops when APIClient fires multiple 401s.
    private var tokenRefreshTask: Task<String, Error>?

    // Legacy global keys kept only for one-time migration
    private let legacyTokenKey = "meeshy_auth_token"
    private let legacyUserKey = "meeshy_current_user"

    // UserDefaults keys (non-sensitive)
    private let activeUserIdUDKey = "meeshy_active_user_id"
    private let savedAccountsUDKey = "meeshy_saved_accounts"

    private init(
        keychain: any KeychainStoring = KeychainManager.shared,
        userDefaults: UserDefaults = .standard,
        groupDefaults: UserDefaults? = UserDefaults(suiteName: "group.me.meeshy.apps")
    ) {
        self.keychain = keychain
        self.userDefaults = userDefaults
        self.groupDefaults = groupDefaults
    }

    // MARK: - Namespaced keys

    private func tokenKey(for userId: String) -> String { "meeshy_token_\(userId)" }
    private func userKey(for userId: String) -> String { "meeshy_user_\(userId)" }
    private func sessionTokenKey(for userId: String) -> String { "meeshy_session_token_\(userId)" }
    private func tokenDateUDKey(for userId: String) -> String { "meeshy_token_date_\(userId)" }

    // MARK: - Active user

    private var activeUserId: String? {
        get { keychain.load(forKey: activeUserIdUDKey, account: nil) }
        set {
            if let value = newValue {
                do {
                    try keychain.save(value, forKey: activeUserIdUDKey, account: nil)
                } catch {
                    Logger.auth.error("Failed to save activeUserId to keychain: \(error.localizedDescription, privacy: .public)")
                }
            } else {
                keychain.delete(forKey: activeUserIdUDKey, account: nil)
            }
            groupDefaults?.set(newValue, forKey: activeUserIdUDKey)
        }
    }

    // MARK: - Token Access

    public var authToken: String? {
        get {
            guard let userId = activeUserId else { return nil }
            return keychain.load(forKey: tokenKey(for: userId), account: nil)
        }
        set {
            guard let userId = activeUserId else { return }
            if let value = newValue {
                do {
                    try keychain.save(value, forKey: tokenKey(for: userId), account: nil)
                } catch {
                    Logger.auth.error("Failed to save authToken to keychain: \(error.localizedDescription, privacy: .public)")
                }
            } else {
                keychain.delete(forKey: tokenKey(for: userId), account: nil)
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
        let json: [String: Any]
        do {
            guard let decoded = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                Logger.auth.warning("JWT payload not a JSON object; treating as expired")
                return true
            }
            json = decoded
        } catch {
            Logger.auth.warning("JWT payload JSON deserialization failed: \(error.localizedDescription, privacy: .public); treating as expired")
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
        requires2FA = false
        twoFactorToken = nil

        do {
            let data = try await authService.login(username: username, password: password, rememberDevice: true)
            if data.requires2FA == true {
                self.requires2FA = true
                self.twoFactorToken = data.twoFactorToken
            } else if let token = data.token, let user = data.user {
                applySession(token: token, sessionToken: data.sessionToken, user: user)
            } else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    public func completeLoginWith2FA(code: String) async {
        guard let twoFactorToken = twoFactorToken else {
            errorMessage = "Session 2FA expirée ou invalide"
            return
        }
        isLoading = true
        errorMessage = nil

        do {
            let data = try await authService.completeLoginWith2FA(twoFactorToken: twoFactorToken, code: code)
            if let token = data.token, let user = data.user {
                self.requires2FA = false
                self.twoFactorToken = nil
                applySession(token: token, sessionToken: data.sessionToken, user: user)
            } else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
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
            if let token = data.token, let user = data.user {
                applySession(token: token, sessionToken: data.sessionToken, user: user)
            } else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
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
            _ = try await authService.requestMagicLink(email: email, deviceFingerprint: nil)
            isLoading = false
            return true
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
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
            if let token = data.token, let user = data.user {
                applySession(token: token, sessionToken: data.sessionToken, user: user)
            } else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
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
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
        return false
    }

    // MARK: - Logout

    public func logout() async {
        // U3 — drop any in-flight optimistic profile guard so it can't leak onto
        // the next user's profile after a re-login.
        pendingOptimisticProfile = nil
        // T15b — HTTP cache purge AVANT le guard : l'état déconnecté ne doit
        // jamais laisser de bodies REST (conversations, messages) d'un compte
        // au repos sur disque, quel que soit le chemin de logout emprunté.
        APIClient.shared.clearHTTPCache()
        guard let userId = activeUserId else {
            // Idempotent : peut être appelée plusieurs fois sans crash.
            // Garde un état cohérent même quand aucune session n'est active.
            currentUser = nil
            isAuthenticated = false
            return
        }

        // P1 D-7 — SessionSnapshot wipe en PREMIER : si l'app crash entre ici
        // et la fin du logout, les extensions iOS (NSE, Widget) ne re-lisent
        // pas les credentials de la session morte.
        SessionSnapshotStore.wipe()

        // D5 — server logout in background (best-effort, bounded retries).
        // Le quiesce local ne dépend pas du serveur : si le réseau échoue,
        // le gateway tuera la session paresseusement au prochain request.
        Task { await self.performServerLogoutWithRetries() }

        // P1 quiesce — stop accepting new mutations BEFORE purging stores.
        // Sans ça, un `message:new` arrivant pendant le purge pourrait
        // ré-écrire dans les stores après leur reset.
        MessageSocketManager.shared.disconnect()
        SocialSocketManager.shared.disconnect()

        // P1 reset des singletons SDK (cf. design doc D-13 + Q1-Q6).
        // Ordre : les services qui ne dépendent de rien d'autre d'abord,
        // puis ceux qui consomment leurs publishers (NotificationToastManager
        // observe NotificationCoordinator).
        NotificationCoordinator.shared.reset()
        NotificationToastManager.shared.reset()
        PushNotificationManager.shared.resetSession()
        await BlockService.shared.reset()
        StoryService.shared.reset()
        // E9 — confidentialité multi-compte : le brouillon de story (DB GRDB
        // dédiée + meeshy_draft_media/) et la queue de publication persistée
        // (items + copies médias) appartiennent au compte sortant. Sans ces
        // purges, le compte suivant retrouvait le draft du précédent ET le
        // drain aurait PUBLIÉ ses stories en attente sous la mauvaise session.
        StoryDraftStore.shared.clear()
        await StoryPublishQueue.shared.clearAll()
        await ConversationStore.shared.reset()
        UserPreferencesManager.shared.resetSession()
        FriendshipCache.shared.clear()
        // A5 — le curseur de séquence est per-user : le remettre à zéro évite
        // un faux gap au premier event du compte suivant sur le même device.
        Task { await SyncSeqTracker.shared.reset() }

        // Keychain wipe + saved account remove (existant).
        keychain.delete(forKey: tokenKey(for: userId), account: nil)
        keychain.delete(forKey: sessionTokenKey(for: userId), account: nil)
        keychain.delete(forKey: userKey(for: userId), account: nil)
        keychain.delete(forKey: tokenDateUDKey(for: userId), account: nil)
        removeFromSavedAccounts(userId: userId)

        activeUserId = nil
        currentUser = nil
        APIClient.shared.authToken = nil

        // D3 — wipe every cached store. Désormais AWAITED (vs fire-and-forget)
        // pour garantir que le router ne voie pas isAuthenticated=false
        // avant que le cache soit purgé (sinon LoginView risque de se monter
        // pendant que les caches user A sont encore en RAM).
        await CacheCoordinator.shared.reset()

        // T15b — seconde purge HTTP : un store disque URLCache bufferisé
        // (réponse d'un fetch juste avant le logout) peut atterrir APRÈS la
        // première purge et ressusciter le body. Re-purger en fin de logout
        // ferme cette fenêtre.
        APIClient.shared.clearHTTPCache()

        // En DERNIER : déclenche le router et tous les `wireAuthLogoutHook`
        // app-side (ConversationAudioCoordinator, FeedbackToastManager, etc.).
        isAuthenticated = false
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
                do {
                    try await Task.sleep(for: .seconds(delay))
                } catch {
                    return // Task cancelled
                }
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
        keychain.delete(forKey: tokenKey(for: userId), account: nil)
        keychain.delete(forKey: sessionTokenKey(for: userId), account: nil)
        keychain.delete(forKey: userKey(for: userId), account: nil)
        keychain.delete(forKey: tokenDateUDKey(for: userId), account: nil)
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

        guard let token = keychain.load(forKey: tokenKey(for: userId), account: nil) else {
            // Keychain empty for this user. Saved accounts stay intact so
            // re-login is one tap, but we have no session to restore.
            activeUserId = nil
            isAuthenticated = false
            return
        }

        let sessionToken = keychain.load(forKey: sessionTokenKey(for: userId), account: nil)

        // Show cached user immediately — authenticate from cache before any
        // network call so the UI never blanks on app launch. If the cached
        // JSON is corrupt or stale (schema migration etc.) we drop the entry
        // so the next launch starts clean and the background revalidation
        // below repopulates it from the server.
        if let userJSON = keychain.load(forKey: userKey(for: userId), account: nil),
           let userData = userJSON.data(using: .utf8) {
            do {
                let user = try JSONDecoder().decode(MeeshyUser.self, from: userData)
                currentUser = user
            } catch {
                Logger.auth.error("Failed to decode cached user for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public) — dropping corrupt cache entry")
                keychain.delete(forKey: userKey(for: userId), account: nil)
            }
        }

        APIClient.shared.authToken = token
        isAuthenticated = true
        warmSessionScopedCaches()

        // Proactive refresh: if the JWT is expired or near-expiry AND we have
        // a long-lived sessionToken, mint a new JWT BEFORE other API calls
        // race in and trip the 401 path. With the gateway's sliding-window
        // semantics this also extends the session another 365 days, so an
        // active user is renewed indefinitely.
        //
        // Skip while offline: this is `await`ed and gates the splash (the only
        // network call on the cold-start critical path). Offline it cannot
        // succeed and would hang the splash for the full URLSession timeout
        // (30-60s) behind a launch the cache could already serve. No API call
        // can race in offline anyway, so deferring the refresh to the next
        // reconnect / 401 is safe. Online behaviour is unchanged.
        if isCurrentTokenExpired, sessionToken != nil, NetworkMonitor.shared.isOnline {
            do {
                _ = try await refreshSession(force: false)
            } catch {
                Logger.auth.warning("Proactive session refresh failed: \(error.localizedDescription, privacy: .public)")
            }
        }

        // Background revalidation (stale-while-revalidate for the user
        // profile). Auth failures here surface a re-auth state so the user
        // can sign in again — the saved account is preserved, just the
        // password (or biometric) is needed.
        Task { [weak self] in
            do {
                let user = try await AuthService.shared.me()
                self?.updateUserAfterRevalidation(user, userId: userId)
            } catch let error as MeeshyError {
                switch error {
                case .auth:
                    self?.requireReauthentication(userId: userId)
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
        guard activeUserId != nil else {
            // No active user at all — nothing to refresh, no state to clear.
            return
        }

        // D1 — guard against concurrent refreshes by invoking refreshSession(force: true)
        // asynchronously. Since refreshSession uses tokenRefreshTask to serialize,
        // multiple concurrent calls to handleUnauthorized() will safely share the same refresh task.
        Task { [weak self] in
            do {
                _ = try await self?.refreshSession(force: true)
            } catch {
                Logger.auth.error("Background session refresh after 401 failed: \(error.localizedDescription, privacy: .public)")
            }
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

    internal func applySession(token: String, sessionToken: String?, user: MeeshyUser) {
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

        do {
            try keychain.save(token, forKey: tokenKey(for: userId), account: nil)
        } catch {
            Logger.auth.error("Failed to save token to keychain for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }

        if let sessionToken = sessionToken, !sessionToken.isEmpty {
            do {
                try keychain.save(sessionToken, forKey: sessionTokenKey(for: userId), account: nil)
            } catch {
                Logger.auth.error("Failed to save sessionToken to keychain for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        saveUserToKeychain(user, userId: userId)
        let now = String(Date().timeIntervalSince1970)
        do {
            try keychain.save(now, forKey: tokenDateUDKey(for: userId), account: nil)
        } catch {
            Logger.auth.error("Failed to save token date to keychain for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }

        activeUserId = userId
        APIClient.shared.authToken = token

        upsertSavedAccount(from: user)
        // U3 — preserve an in-flight optimistic profile edit across a token
        // refresh (applySession also runs on rotation). On a fresh login the
        // pending guard is nil (cleared on logout), so this is a no-op.
        let resolved = Self.resolveServerUserWithOptimistic(user, pending: pendingOptimisticProfile)
        currentUser = resolved.user
        if resolved.clearedPending { pendingOptimisticProfile = nil }
        isAuthenticated = true
        // Hydrate session-scoped caches not carried by the auth payload (block
        // list). Skip on token rotation — already warm.
        if !isTokenRotation { warmSessionScopedCaches() }

        if isTokenRotation {
            MessageSocketManager.shared.forceReconnect()
            SocialSocketManager.shared.forceReconnect()
            tokenDidRotate.send(())
        }
    }

    /// Warm session-scoped caches that aren't hydrated by the auth payload.
    /// Mirror of the teardown in `logout()`. Currently the block list, fetched
    /// via `GET /users/me/blocked-users` so the composer block zone and the
    /// new-conversation graying reflect reality from launch instead of staying
    /// empty until the Blocked Users screen is first opened.
    private func warmSessionScopedCaches() {
        Task { await BlockService.shared.refreshCache() }
    }

    /// Soft re-auth signal: the server told us the session is genuinely
    /// invalid (revoked, expired beyond the sliding window, account
    /// disabled). We clear the active token + sessionToken so the API
    /// client stops sending dead credentials and flip `isAuthenticated`
    /// to false so the UI can prompt for re-login. The saved account is
    /// preserved — the user just needs to enter their password again.
    private func requireReauthentication(userId: String) {
        keychain.delete(forKey: tokenKey(for: userId), account: nil)
        keychain.delete(forKey: sessionTokenKey(for: userId), account: nil)
        keychain.delete(forKey: tokenDateUDKey(for: userId), account: nil)
        activeUserId = nil
        currentUser = nil
        isAuthenticated = false
        APIClient.shared.authToken = nil
    }

    private func saveUserToKeychain(_ user: MeeshyUser, userId: String) {
        let sanitized = sanitizeDataURIs(user)
        do {
            let encoded = try JSONEncoder().encode(sanitized)
            guard let jsonString = String(data: encoded, encoding: .utf8) else {
                Logger.auth.error("Failed to convert sanitized user data to UTF8 string for userId \(userId, privacy: .public)")
                return
            }
            try keychain.save(jsonString, forKey: userKey(for: userId), account: nil)
        } catch {
            Logger.auth.error("Failed to save user to keychain for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
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
        // U3 — don't clobber an in-flight optimistic profile edit with the
        // revalidated server user; re-apply it (and drop the guard once the
        // server already reflects the edit).
        let resolved = Self.resolveServerUserWithOptimistic(user, pending: pendingOptimisticProfile)
        self.currentUser = resolved.user
        if resolved.clearedPending { pendingOptimisticProfile = nil }
        self.updateSavedAccountActivity(from: user)
    }

    @discardableResult
    public func refreshSession(force: Bool = false) async throws -> String {
        if let task = tokenRefreshTask {
            return try await task.value
        }

        guard let userId = activeUserId else {
            throw MeeshyError.auth(.sessionExpired)
        }

        guard let token = keychain.load(forKey: tokenKey(for: userId), account: nil) else {
            requireReauthentication(userId: userId)
            throw MeeshyError.auth(.sessionExpired)
        }
        let sessionToken = keychain.load(forKey: sessionTokenKey(for: userId), account: nil)

        // If not forcing AND token is not expired, return current token
        if !force && !Self.isTokenExpired(token, now: Date()) {
            return token
        }

        let task = Task<String, Error> { [weak self] in
            guard let self = self else { throw CancellationError() }
            do {
                let data = try await self.authService.refreshToken(token, sessionToken: sessionToken)
                guard let newToken = data.token, let newUser = data.user else {
                    throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
                }
                self.applySession(token: newToken, sessionToken: data.sessionToken, user: newUser)
                return newToken
            } catch let error as MeeshyError {
                if case .auth = error {
                    self.requireReauthentication(userId: userId)
                }
                throw error
            } catch {
                throw error
            }
        }

        tokenRefreshTask = task

        defer {
            tokenRefreshTask = nil
        }

        return try await task.value
    }

    // MARK: - Saved Accounts persistence

    private func loadSavedAccounts() {
        guard let json = keychain.load(forKey: savedAccountsUDKey, account: nil),
              let data = json.data(using: .utf8) else {
            savedAccounts = []
            return
        }

        let accounts: [SavedAccount]
        do {
            accounts = try JSONDecoder().decode([SavedAccount].self, from: data)
        } catch {
            Logger.auth.error("Failed to decode saved accounts from keychain: \(error.localizedDescription, privacy: .public)")
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
        do {
            let data = try JSONEncoder().encode(savedAccounts)
            guard let json = String(data: data, encoding: .utf8) else {
                Logger.auth.error("Failed to convert saved accounts to UTF8 string")
                return
            }
            try keychain.save(json, forKey: savedAccountsUDKey, account: nil)
        } catch {
            Logger.auth.error("Failed to persist saved accounts to keychain: \(error.localizedDescription, privacy: .public)")
        }
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
        // 1. Migrate activeUserId from UserDefaults to Keychain
        if let legacyActiveId = userDefaults.string(forKey: activeUserIdUDKey) {
            if keychain.load(forKey: activeUserIdUDKey, account: nil) == nil {
                do {
                    try keychain.save(legacyActiveId, forKey: activeUserIdUDKey, account: nil)
                } catch {
                    Logger.auth.error("Legacy migration failed for activeUserId: \(error.localizedDescription, privacy: .public)")
                }
            }
            userDefaults.removeObject(forKey: activeUserIdUDKey)
        }

        // 2. Migrate savedAccounts from UserDefaults to Keychain
        if let legacyData = userDefaults.data(forKey: savedAccountsUDKey),
           let legacyJson = String(data: legacyData, encoding: .utf8) {
            if keychain.load(forKey: savedAccountsUDKey, account: nil) == nil {
                do {
                    try keychain.save(legacyJson, forKey: savedAccountsUDKey, account: nil)
                } catch {
                    Logger.auth.error("Legacy migration failed for savedAccounts: \(error.localizedDescription, privacy: .public)")
                }
            }
            userDefaults.removeObject(forKey: savedAccountsUDKey)
        }

        // 3. First migrate any UserDefaults → Keychain entries
        // (Uses the default keychain implementation's migration helper if available)
        if let manager = keychain as? KeychainManager {
            manager.migrateFromUserDefaults(keys: [legacyTokenKey, legacyUserKey])
        }

        // 4. Only migrate if no active user is set yet
        guard activeUserId == nil,
              let token = keychain.load(forKey: legacyTokenKey, account: nil),
              let userJSON = keychain.load(forKey: legacyUserKey, account: nil),
              let userData = userJSON.data(using: .utf8) else {
            return
        }

        do {
            let user = try JSONDecoder().decode(MeeshyUser.self, from: userData)
            let userId = user.id
            try keychain.save(token, forKey: tokenKey(for: userId), account: nil)
            try keychain.save(userJSON, forKey: userKey(for: userId), account: nil)
            // Use now as tokenSavedAt (we don't know the original date — within 1 year is safe)
            let now = String(Date().timeIntervalSince1970)
            try keychain.save(now, forKey: tokenDateUDKey(for: userId), account: nil)
            activeUserId = userId
            upsertSavedAccount(from: user)
        } catch {
            Logger.auth.error("Legacy user migration failed: \(error.localizedDescription, privacy: .public)")
        }

        keychain.delete(forKey: legacyTokenKey, account: nil)
        keychain.delete(forKey: legacyUserKey, account: nil)
    }

    // MARK: - Local Profile Mutation (optimistic)

    /// U3 — the optimistic profile while an `updateProfile` outbox row is in
    /// flight. A server revalidation (`/auth/me`) or token-refresh `applySession`
    /// must NOT clobber it; `resolveServerUserWithOptimistic` re-applies these
    /// fields onto the server user and self-clears once the server reflects them.
    private var pendingOptimisticProfile: ProfileSnapshot?

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
        let updated = user.withProfileChanges(
            displayName: displayName,
            bio: bio,
            avatar: avatarUrl
        )
        currentUser = updated
        // U3 — remember the optimistic profile so a revalidation/refresh can't
        // clobber it, and persist to the keychain so it survives a cold start
        // (cold-start hydration reads currentUser from the keychain).
        pendingOptimisticProfile = ProfileSnapshot(
            displayName: updated.displayName, bio: updated.bio, avatarUrl: updated.avatar)
        saveUserToKeychain(updated, userId: updated.id)
        return snapshot
    }

    public func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot) {
        guard let user = currentUser else { return }
        let reverted = user.withProfileChanges(
            displayName: snapshot.displayName,
            bio: snapshot.bio,
            avatar: snapshot.avatarUrl
        )
        currentUser = reverted
        // U3 — the optimistic edit was rolled back; drop the guard + persist.
        pendingOptimisticProfile = nil
        saveUserToKeychain(reverted, userId: reverted.id)
    }

    /// U3 — merge any in-flight optimistic profile onto a freshly-fetched server
    /// `user`. Returns the user to assign + whether the pending guard should be
    /// cleared: `true` once the server already reflects the optimistic edit (the
    /// `updateProfile` row propagated), so a later external profile change isn't
    /// shadowed by a stale optimistic value. Pure + static for testability;
    /// when `pending == nil` it returns the server user unchanged (the common
    /// login/session path is unaffected).
    static func resolveServerUserWithOptimistic(
        _ server: MeeshyUser, pending: ProfileSnapshot?
    ) -> (user: MeeshyUser, clearedPending: Bool) {
        guard let pending else { return (server, false) }
        if server.displayName == pending.displayName,
           server.bio == pending.bio,
           server.avatar == pending.avatarUrl {
            return (server, true)
        }
        return (
            server.withProfileChanges(
                displayName: pending.displayName, bio: pending.bio, avatar: pending.avatarUrl),
            false
        )
    }
}
