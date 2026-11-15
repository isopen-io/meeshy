import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

@MainActor
final class CommunityInviteViewModel: ObservableObject, CommunityInviteModeling {
    nonisolated deinit {}

    @Published var searchText = ""
    @Published private(set) var searchResults: [UserSearchResult] = []
    @Published private(set) var isSearching = false
    @Published private(set) var invitedUserIds: Set<String> = []
    @Published private(set) var recentlyInvited: [UserSearchResult] = []
    @Published private(set) var invitingUserId: String?

    let communityId: String
    private let communityService: CommunityServiceProviding
    private let userService: UserServiceProviding
    private let log = MeeshyLog.logger(.ui)

    init(communityId: String,
         communityService: CommunityServiceProviding = CommunityService.shared,
         userService: UserServiceProviding = UserService.shared) {
        self.communityId = communityId
        self.communityService = communityService
        self.userService = userService
    }

    func searchUsers() async {
        guard searchText.count >= 2 else {
            searchResults = []
            return
        }

        isSearching = true
        defer { isSearching = false }

        do {
            searchResults = try await userService.searchUsers(query: searchText, limit: 20, offset: 0)
        } catch {
            log.error("[CommunityInviteVM] Search error: \(error)")
        }
    }

    func inviteUser(userId: String) async {
        invitingUserId = userId
        defer { invitingUserId = nil }

        do {
            _ = try await communityService.invite(communityId: communityId, userId: userId)
            invitedUserIds.insert(userId)
            if let user = searchResults.first(where: { $0.id == userId }) {
                recentlyInvited.append(user)
            }
        } catch {
            log.error("[CommunityInviteVM] Invite error: \(error)")
        }
    }
}
