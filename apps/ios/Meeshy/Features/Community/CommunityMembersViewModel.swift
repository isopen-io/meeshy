import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

@MainActor
final class CommunityMembersViewModel: ObservableObject, CommunityMembersModeling {
    nonisolated deinit {}

    @Published private(set) var members: [APICommunityMember] = []
    @Published private(set) var sections: [CommunityMemberSection] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasMore = false
    @Published private(set) var isCurrentUserAdmin = false
    @Published private(set) var isMember = false

    let communityId: String
    var canInvite: Bool { isMember }
    var isEmpty: Bool { members.isEmpty }

    private var hasLoaded = false
    private var currentOffset = 0
    private let pageSize = 30
    private let service: CommunityServiceProviding
    private let currentUserId: @MainActor () -> String
    private let log = MeeshyLog.logger(.ui)

    init(
        communityId: String,
        service: CommunityServiceProviding = CommunityService.shared,
        currentUserId: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" }
    ) {
        self.communityId = communityId
        self.service = service
        self.currentUserId = currentUserId
    }

    func loadIfNeeded() async {
        guard !hasLoaded else { return }
        await load()
    }

    func refresh() async {
        currentOffset = 0
        hasLoaded = false
        await load()
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        await load(append: true)
    }

    private func setMembers(_ newMembers: [APICommunityMember]) {
        members = newMembers
        sections = CommunityMemberSection.sections(from: newMembers)
    }

    private func load(append: Bool = false) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await service.getMembers(
                communityId: communityId,
                offset: append ? currentOffset : 0,
                limit: pageSize
            )

            if append {
                let known = Set(members.map(\.id))
                setMembers(members + response.data.filter { !known.contains($0.id) })
            } else {
                setMembers(response.data)
            }

            currentOffset = members.count
            hasMore = response.pagination?.hasMore ?? false
            hasLoaded = true

            let readerId = currentUserId()
            let currentMember = members.first { $0.userId == readerId }
            isMember = currentMember != nil
            isCurrentUserAdmin = currentMember?.communityRole.hasMinimumRole(.admin) ?? false
        } catch {
            log.error("[CommunityMembersVM] Error loading: \(error)")
        }
    }

    func updateRole(memberId: String, role: MemberRole) async {
        do {
            _ = try await service.updateMemberRole(
                communityId: communityId,
                memberId: memberId,
                role: role
            )
            await refresh()
        } catch {
            log.error("[CommunityMembersVM] Error updating role: \(error)")
        }
    }

    func removeMember(userId: String) async {
        do {
            try await service.removeMember(communityId: communityId, userId: userId)
            setMembers(members.filter { $0.userId != userId })
        } catch {
            log.error("[CommunityMembersVM] Error removing member: \(error)")
        }
    }
}
