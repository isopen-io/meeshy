import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class CommunityDetailViewModel: ObservableObject, CommunityDetailModeling {
    nonisolated deinit {}

    @Published var community: MeeshyCommunity?
    @Published var conversations: [APIConversation] = [] {
        didSet { conversationTitles = communityConversationTitles(conversations, readerId: currentUserId()) }
    }
    @Published private(set) var conversationTitles: [String: String] = [:]
    @Published var isMember = false
    @Published var isCreator = false
    @Published var isAdmin = false
    @Published var currentUserRole: MemberRole = .member
    @Published var isLoading = false
    @Published var errorMessage: String?

    let communityId: String
    private let service: CommunityServiceProviding
    private let currentUserId: @MainActor () -> String

    init(
        communityId: String,
        service: CommunityServiceProviding = CommunityService.shared,
        currentUserId: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" }
    ) {
        self.communityId = communityId
        self.service = service
        self.currentUserId = currentUserId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let apiCommunity = try await service.get(communityId: communityId)
            community = apiCommunity.toCommunity()
            applyMembership(of: apiCommunity)

            if isMember {
                conversations = try await service.getConversations(communityId: communityId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func applyMembership(of apiCommunity: APICommunity) {
        let readerId = currentUserId()
        let creatorMatch = apiCommunity.createdBy == readerId
        let memberRecord = apiCommunity.members?.first(where: { $0.userId == readerId })

        isCreator = creatorMatch
        isMember = creatorMatch || memberRecord != nil

        if let record = memberRecord {
            currentUserRole = record.communityRole
        } else if creatorMatch {
            currentUserRole = .admin
        }

        isAdmin = currentUserRole.hasMinimumRole(.admin) || isCreator
    }

    func joinCommunity() async {
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await service.join(communityId: communityId)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func leaveCommunity() async {
        do {
            try await service.leave(communityId: communityId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
