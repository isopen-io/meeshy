import Foundation
import Combine

// MARK: - Profile Snapshot

/// Immutable capture of the three profile-editable fields, returned by
/// `AuthManaging.applyLocalProfileChanges` and consumed by
/// `restoreLocalProfileSnapshot` for optimistic-rollback flows.
public struct ProfileSnapshot: Sendable, Equatable, Codable {
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
    @discardableResult
    func login(username: String, password: String) async -> LoginOutcome
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

    /// Reflects a confirmed `voicePublic` change onto `currentUser` (in-memory
    /// publish + keychain persist) after a successful `PATCH /users/me`. Without
    /// it, a screen that re-derives its toggle from `currentUser.voicePublic`
    /// (e.g. VoiceProfileManageViewModel.loadProfile) would restore the stale
    /// value on reopen.
    func applyLocalVoicePublicChange(_ isPublic: Bool)
}
