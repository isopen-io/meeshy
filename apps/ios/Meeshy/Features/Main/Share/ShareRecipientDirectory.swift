import Foundation
import MeeshySDK

/// La source réelle — les caches nommés du produit, puis les services.
struct LiveShareRecipientDirectory: ShareRecipientSourcing {
    private static let pageLimit = 50
    private static let searchLimit = 20

    func cachedConversations() async -> [ShareRecipient] {
        switch await CacheCoordinator.shared.conversations.load(for: "list") {
        case .fresh(let data, _), .stale(let data, _): return data.filter(\.isActive).map { ShareRecipient(conversation: $0) }
        case .expired, .empty: return []
        }
    }

    func freshConversations(currentUserId: String) async throws -> [ShareRecipient] {
        let page = try await ConversationService.shared.listPage(before: nil, limit: Self.pageLimit, currentUserId: currentUserId)
        return page.items.filter(\.isActive).map { ShareRecipient(conversation: $0) }
    }

    func cachedPeople(currentUserId: String) async -> [ShareRecipient] {
        async let friends = CacheCoordinator.shared.friends.load(for: FriendshipCache.PersistenceKeys.friendsList)
        async let phonebook = CacheCoordinator.shared.phonebook.load(for: "phonebook:all")
        let (friendResult, phonebookResult) = await (friends, phonebook)
        let friendRecipients: [ShareRecipient] = {
            switch friendResult {
            case .fresh(let data, _), .stale(let data, _): return data.filter { $0.id != currentUserId }.map(ShareRecipient.init(friend:))
            case .expired, .empty: return []
            }
        }()
        let contactRecipients: [ShareRecipient] = {
            switch phonebookResult {
            case .fresh(let data, _), .stale(let data, _): return data.compactMap(ShareRecipient.init(contact:))
            case .expired, .empty: return []
            }
        }()
        return ShareRecipientMerge.merge(conversations: [], people: friendRecipients + contactRecipients)
    }

    func cachedCommunities() async -> [ShareCommunity] {
        switch await CacheCoordinator.shared.communities.load(for: "list") {
        case .fresh(let data, _), .stale(let data, _): return data.map(Self.community(from:))
        case .expired, .empty: return []
        }
    }

    func search(_ query: String, currentUserId: String) async -> ShareSearchResults {
        async let conversations = searchConversations(query, currentUserId: currentUserId)
        async let directory = searchDirectory(query)
        async let users = searchUsers(query, currentUserId: currentUserId)
        async let communities = searchCommunities(query)
        let (foundConversations, contacts, people, foundCommunities) = await (conversations, directory, users, communities)
        return ShareSearchResults(
            people: ShareRecipientMerge.merge(conversations: [], people: contacts + people),
            conversations: foundConversations,
            communities: foundCommunities
        )
    }

    func writableChannels(of community: ShareCommunity, currentUserId: String) async -> [ShareRecipient] {
        guard let conversations = try? await CommunityService.shared.getConversations(communityId: community.id) else { return [] }
        return conversations
            .filter { $0.isMember ?? true }
            .map { ShareRecipient(conversation: $0.toConversation(currentUserId: currentUserId), communityName: community.name) }
    }

    // MARK: - Recherche

    private func searchConversations(_ query: String, currentUserId: String) async -> [ShareRecipient] {
        guard let found = try? await ConversationService.shared.search(query: query) else { return [] }
        return found
            .filter {
                ShareRecipientMerge.isReachableConversation(
                    type: $0.type, participantUserIds: ($0.participants ?? []).compactMap(\.userId),
                    currentUserId: currentUserId, isMember: $0.isMember
                )
            }
            .map { ShareRecipient(conversation: $0.toConversation(currentUserId: currentUserId)) }
    }

    private func searchDirectory(_ query: String) async -> [ShareRecipient] {
        guard let page = try? await ContactDirectoryService.shared.page(
            cursor: nil, limit: Self.searchLimit, filter: .meeshy, query: query, updatedSince: nil
        ) else { return [] }
        return page.data.compactMap(ShareRecipient.init(contact:))
    }

    private func searchUsers(_ query: String, currentUserId: String) async -> [ShareRecipient] {
        guard let users = try? await UserService.shared.searchUsers(query: query, limit: Self.searchLimit, offset: 0) else { return [] }
        return users.filter { $0.id != currentUserId }.map { user in
            ShareRecipient(
                id: "user:\(user.id)", kind: .person, conversationId: nil, userId: user.id,
                title: user.displayName ?? user.username, detail: .handle(user.username), avatarURL: user.avatar
            )
        }
    }

    private func searchCommunities(_ query: String) async -> [ShareCommunity] {
        guard let page = try? await CommunityService.shared.search(query: query, offset: 0, limit: Self.searchLimit) else { return [] }
        return page.data.map { ShareCommunity(id: $0.id, name: $0.name, avatarURL: $0.avatar) }
    }

    private static func community(from community: APICommunity) -> ShareCommunity {
        ShareCommunity(id: community.id, name: community.name, avatarURL: community.avatar)
    }
}
