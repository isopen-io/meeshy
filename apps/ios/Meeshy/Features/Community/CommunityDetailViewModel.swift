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
    @Published private(set) var loadFailure: CommunityLoadFailure?

    let communityId: String
    private let service: CommunityServiceProviding
    private let currentUserId: @MainActor () -> String
    private let postsCache: @MainActor () async -> CommunityPostsCache?

    init(
        communityId: String,
        service: CommunityServiceProviding = CommunityService.shared,
        currentUserId: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" },
        postsCache: @escaping @MainActor () async -> CommunityPostsCache? = { nil }
    ) {
        self.communityId = communityId
        self.service = service
        self.currentUserId = currentUserId
        self.postsCache = postsCache
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let apiCommunity = try await service.get(communityId: communityId)
            community = apiCommunity.toCommunity()
            applyMembership(of: apiCommunity)
            loadFailure = nil

            if isMember {
                conversations = try await service.getConversations(communityId: communityId)
            }
        } catch {
            loadFailure = Self.loadFailure(for: error)
        }
    }

    /// #7816 — la cause d'un échec se lit par la loi unique de l'app
    /// (`ContentFetchFailure.classify`), jamais par le message brut du serveur.
    nonisolated static func loadFailure(for error: Error) -> CommunityLoadFailure {
        switch ContentFetchFailure.classify(error) {
        case .forbidden, .notFound: return .refused
        case .network: return .network
        case .server: return .server
        }
    }

    /// `currentUserRole` (servi par le détail depuis #6378) fait foi ; `members`
    /// n'est lu que si un ancien serveur le portait, puis le créateur vaut admin.
    private func applyMembership(of apiCommunity: APICommunity) {
        let readerId = currentUserId()
        let creatorMatch = apiCommunity.createdBy == readerId
        let servedRole = apiCommunity.currentUserRole.flatMap(MemberRole.init(rawValue:))
        let recordRole = apiCommunity.members?.first(where: { $0.userId == readerId })?.communityRole
        let role = servedRole ?? recordRole ?? (creatorMatch ? .admin : nil)

        isCreator = creatorMatch
        isMember = role != nil
        currentUserRole = role ?? .member
        isAdmin = currentUserRole.hasMinimumRole(.admin) || isCreator
    }

    func joinCommunity() async {
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await service.join(communityId: communityId)
            await forgetCachedPosts()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func leaveCommunity() async {
        do {
            try await service.leave(communityId: communityId)
            await forgetCachedPosts()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// #16878 — les publications de l'onglet sont lues sous le rôle du
    /// lecteur : un départ ne laisse pas celles d'une communauté privée sur
    /// l'appareil, une adhésion fait relire ce qu'un membre peut lire.
    private func forgetCachedPosts() async {
        await postsCache()?.invalidate(for: CommunityPostsViewModel.cacheKey(communityId: communityId))
    }
}
