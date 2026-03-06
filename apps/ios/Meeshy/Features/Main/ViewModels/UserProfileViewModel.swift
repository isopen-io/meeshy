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
    private let profileCache: UserProfileCaching
    private let blockService: BlockServiceProviding

    var isCurrentUser: Bool {
        guard let currentId = authManager.currentUser?.id else { return false }
        return profileUser.userId == currentId
    }

    init(
        user: ProfileSheetUser,
        authManager: AuthManaging = AuthManager.shared,
        profileCache: UserProfileCaching = UserProfileCacheManager.shared,
        blockService: BlockServiceProviding = BlockService.shared
    ) {
        self.authManager = authManager
        self.profileCache = profileCache
        self.blockService = blockService
        self.profileUser = user
        self.isBlocked = Self.checkIsBlocked(userId: user.userId, authManager: authManager)
    }

    func loadFullProfile() async {
        guard let userId = profileUser.userId, !isCurrentUser else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let user = try await profileCache.profile(for: userId)
            fullUser = user
        } catch let APIError.serverError(code, _) where code == 403 {
            isBlockedByTarget = true
        } catch {}
    }

    func loadUserStats() async {
        guard let userId = profileUser.userId else { return }
        isLoadingStats = true
        statsError = nil
        defer { isLoadingStats = false }

        do {
            let stats = try await profileCache.stats(for: userId)
            userStats = stats
        } catch {
            statsError = "Impossible de charger les statistiques"
        }
    }

    func findSharedConversations(from allConversations: [Conversation]) {
        guard let targetId = profileUser.userId else { return }
        sharedConversations = allConversations.filter { conv in
            conv.type == .direct && conv.participantUserId == targetId
        }
    }

    func blockUser() async {
        guard let userId = profileUser.userId else { return }
        do {
            try await blockService.blockUser(userId: userId)
            isBlocked = true
        } catch {}
    }

    func unblockUser() async {
        guard let userId = profileUser.userId else { return }
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
