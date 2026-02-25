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

    var isCurrentUser: Bool {
        guard let currentId = AuthManager.shared.currentUser?.id else { return false }
        return profileUser.userId == currentId
    }

    init(user: ProfileSheetUser) {
        self.profileUser = user
        self.isBlocked = Self.checkIsBlocked(userId: user.userId)
    }

    func loadFullProfile() async {
        guard let userId = profileUser.userId, !isCurrentUser else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let user = try await UserProfileCacheManager.shared.profile(for: userId)
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
            let stats = try await UserProfileCacheManager.shared.stats(for: userId)
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
            try await BlockService.shared.blockUser(userId: userId)
            isBlocked = true
        } catch {}
    }

    func unblockUser() async {
        guard let userId = profileUser.userId else { return }
        do {
            try await BlockService.shared.unblockUser(userId: userId)
            isBlocked = false
        } catch {}
    }

    private static func checkIsBlocked(userId: String?) -> Bool {
        guard let userId = userId,
              let blockedIds = AuthManager.shared.currentUser?.blockedUserIds else { return false }
        return blockedIds.contains(userId)
    }
}
