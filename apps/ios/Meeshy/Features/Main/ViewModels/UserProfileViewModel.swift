import SwiftUI
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
            let cacheKey = user.id ?? idOrUsername
            await CacheCoordinator.shared.profiles.save([user], for: cacheKey)
            fullUser = user
            hydrateProfileUserIfNeeded(from: user)
        } catch let APIError.serverError(code, _) where code == 403 {
            isBlockedByTarget = true
        } catch {}
    }

    private func hydrateProfileUserIfNeeded(from user: MeeshyUser?) {
        guard let user, profileUser.userId == nil, let realId = user.id else { return }
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
            await CacheCoordinator.shared.stats.save([stats], for: userId)
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

    func blockUser() async {
        guard let userId = profileUser.userId ?? fullUser?.id else { return }
        do {
            try await blockService.blockUser(userId: userId)
            isBlocked = true
        } catch {}
    }

    func unblockUser() async {
        guard let userId = profileUser.userId ?? fullUser?.id else { return }
        do {
            try await blockService.unblockUser(userId: userId)
            isBlocked = false
        } catch {}
    }

    private static func checkIsBlocked(userId: String?, authManager: AuthManaging) -> Bool {
        guard let userId = userId,
              let blockedIds = authManager.currentUser?.blockedUserIds else { return false }
        return blockedIds.contains(userId)
    }
}
