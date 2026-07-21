import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

@MainActor
final class UserProfileViewModel: ObservableObject {
    @Published var profileUser: ProfileSheetUser
    @Published var fullUser: MeeshyUser?
    @Published var sharedConversations: [Conversation] = []
    @Published var isLoading = false
    @Published var isBlocked = false
    @Published var isBlockedByTarget = false
    @Published var userStats: UserStats?
    @Published var isLoadingStats = false
    @Published var statsError: String?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "profile")

    // MARK: - Dependencies

    private let authManager: AuthManaging
    private let blockService: BlockServiceProviding

    var isCurrentUser: Bool {
        guard let currentId = authManager.currentUser?.id else { return false }
        if profileUser.userId == currentId { return true }
        if let currentUsername = authManager.currentUser?.username {
            return profileUser.username == currentUsername
        }
        return false
    }

    init(
        user: ProfileSheetUser,
        authManager: AuthManaging = AuthManager.shared,
        blockService: BlockServiceProviding = BlockService.shared
    ) {
        self.authManager = authManager
        self.blockService = blockService
        self.profileUser = user
        self.isBlocked = Self.checkIsBlocked(userId: user.userId, authManager: authManager)
    }

    private var resolvedIdentifier: String? {
        profileUser.userId ?? (profileUser.username.isEmpty ? nil : profileUser.username)
    }

    func loadFullProfile() async {
        guard let identifier = resolvedIdentifier, !isCurrentUser else { return }

        let cached = await CacheCoordinator.shared.profiles.load(for: identifier)
        switch cached {
        case .fresh(let data, _):
            fullUser = data.first
            hydrateProfileUserIfNeeded(from: data.first)
            return
        case .stale(let data, _):
            fullUser = data.first
            hydrateProfileUserIfNeeded(from: data.first)
            await refreshProfile(idOrUsername: identifier)
        case .expired, .empty:
            isLoading = fullUser == nil
            await refreshProfile(idOrUsername: identifier)
        }
    }

    private func refreshProfile(idOrUsername: String) async {
        defer { isLoading = false }
        do {
            let user = try await UserService.shared.getProfile(idOrUsername: idOrUsername)
            try? await CacheCoordinator.shared.profiles.save([user], for: user.id)
            if idOrUsername != user.id {
                try? await CacheCoordinator.shared.profiles.save([user], for: idOrUsername)
            }
            await SearchIndex.shared.indexUsers([user])
            fullUser = user
            hydrateProfileUserIfNeeded(from: user)
        } catch MeeshyError.forbidden {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`, and 403 arrives as its own `.forbidden`
            // case, never `.server`); this catch was dead code, so
            // `isBlockedByTarget` was never set and the profile UI never
            // reflected being blocked by the viewed user.
            isBlockedByTarget = true
        } catch {
            UserProfileViewModel.logger.error("profile refresh failed: \(error.localizedDescription)")
        }
    }

    private func hydrateProfileUserIfNeeded(from user: MeeshyUser?) {
        guard let user else { return }
        UserDisplayNameCache.shared.trackFromUser(user)
        guard profileUser.userId == nil else { return }
        profileUser = ProfileSheetUser.from(user: user, accentColor: profileUser.accentColor)
    }

    func loadUserStats() async {
        guard let userId = profileUser.userId ?? fullUser?.id else { return }
        statsError = nil

        let cached = await CacheCoordinator.shared.stats.load(for: userId)
        switch cached {
        case .fresh(let data, _):
            userStats = data.first
            return
        case .stale(let data, _):
            userStats = data.first
            await refreshStats(userId: userId)
        case .expired, .empty:
            isLoadingStats = userStats == nil
            await refreshStats(userId: userId)
        }
    }

    private func refreshStats(userId: String) async {
        defer { isLoadingStats = false }
        do {
            let stats = try await UserService.shared.getUserStats(userId: userId)
            userStats = stats
            try? await CacheCoordinator.shared.stats.save([stats], for: userId)
        } catch {
            statsError = "Impossible de charger les statistiques"
        }
    }

    func findSharedConversations(from allConversations: [Conversation]) {
        guard let targetId = profileUser.userId ?? fullUser?.id else { return }
        sharedConversations = allConversations.filter { conv in
            conv.type == .direct && conv.participantUserId == targetId
        }
    }

    /// Wave 1 Phase B — block flows through the offline outbox so the
    /// gateway's `MutationLog` can dedup retries, the UI flips optimistically
    /// regardless of network state, and a queued block survives an app
    /// kill before the request reaches the wire. The local BlockService
    /// cache is updated synchronously so `isBlocked(userId:)` reads stay
    /// consistent with the optimistic UI.
    ///
    /// Phase 4 Task 4.9 — wraps the optimistic write in a snapshot/rollback
    /// pair driven by `OfflineQueue.outcomeStream(for:)`. If the OutboxFlusher
    /// escalates the row to `.exhausted` (`maxAttempts` retries failed), the
    /// observer fires `.exhausted` exactly once, the local `isBlocked` flag
    /// is reset to its pre-mutation value, and a user-facing toast surfaces.
    func blockUser() async {
        guard let userId = profileUser.userId ?? fullUser?.id else { return }
        let cmid = ClientMutationId.generate()
        let snapshot = isBlocked
        isBlocked = true
        // R6-4 — flip the CANONICAL blocklist too, not just this VM's local
        // `isBlocked`. The swipe labels / row affordances read
        // `BlockService.isBlocked(userId:)`, so without this the list stayed
        // stale until the next network refresh. Rolled back on `.exhausted`.
        blockService.setBlockedOptimistic(userId: userId, blocked: true)
        observeOutcome(
            cmid: cmid,
            rollback: { [weak self] in
                self?.isBlocked = snapshot
                self?.blockService.setBlockedOptimistic(userId: userId, blocked: snapshot)
            },
            toast: "Impossible de bloquer cet utilisateur"
        )
        let payload = BlockUserPayload(clientMutationId: cmid, targetUserId: userId)
        do {
            try await OfflineQueue.shared.enqueue(.blockUser, payload: payload)
        } catch {
            isBlocked = snapshot
            blockService.setBlockedOptimistic(userId: userId, blocked: snapshot)
        }
    }

    func unblockUser() async {
        guard let userId = profileUser.userId ?? fullUser?.id else { return }
        let cmid = ClientMutationId.generate()
        let snapshot = isBlocked
        isBlocked = false
        blockService.setBlockedOptimistic(userId: userId, blocked: false)
        observeOutcome(
            cmid: cmid,
            rollback: { [weak self] in
                self?.isBlocked = snapshot
                self?.blockService.setBlockedOptimistic(userId: userId, blocked: snapshot)
            },
            toast: "Impossible de debloquer cet utilisateur"
        )
        let payload = UnblockUserPayload(clientMutationId: cmid, targetUserId: userId)
        do {
            try await OfflineQueue.shared.enqueue(.unblockUser, payload: payload)
        } catch {
            isBlocked = snapshot
            blockService.setBlockedOptimistic(userId: userId, blocked: snapshot)
        }
    }

    /// Subscribes to `OfflineQueue.outcomeStream(for: cmid)` and rolls back
    /// the optimistic mutation when the stream emits `.exhausted`. The
    /// closure is `@MainActor` so direct `@Published` writes are safe.
    /// `.applied` outcomes are a no-op — the optimistic write is already
    /// the final state. The stream completes after a single event, so the
    /// `for await` loop returns and the Task terminates.
    private func observeOutcome(
        cmid: String,
        rollback: @escaping @MainActor () -> Void,
        toast: String
    ) {
        Task { @MainActor in
            let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollback()
                    FeedbackToastManager.shared.showError(toast)
                    HapticFeedback.error()
                }
            }
        }
    }

    private static func checkIsBlocked(userId: String?, authManager: AuthManaging) -> Bool {
        guard let userId = userId,
              let blockedIds = authManager.currentUser?.blockedUserIds else { return false }
        return blockedIds.contains(userId)
    }
}
