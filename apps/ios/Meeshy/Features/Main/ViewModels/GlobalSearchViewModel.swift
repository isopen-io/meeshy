import Foundation
import Combine
import GRDB
import MeeshySDK
import MeeshyUI

// MARK: - Search Tab

enum SearchTab: String, CaseIterable, Identifiable {
    case messages = "Messages"
    case conversations = "Conversations"
    case users = "Utilisateurs"

    var id: String { rawValue }

    var localizedName: String {
        switch self {
        case .messages: return String(localized: "tab.messages", defaultValue: "Messages")
        case .conversations: return String(localized: "tab.conversations", defaultValue: "Conversations")
        case .users: return String(localized: "tab.users", defaultValue: "Utilisateurs")
        }
    }

    var icon: String {
        switch self {
        case .messages: return "text.bubble.fill"
        case .conversations: return "bubble.left.and.bubble.right.fill"
        case .users: return "person.2.fill"
        }
    }
}

// MARK: - Global Search Message Result

struct GlobalSearchMessageResult: Identifiable, Sendable {
    let id: String
    let conversationId: String
    let conversationName: String
    let conversationAvatar: String?
    let content: String
    let senderName: String
    let senderAvatar: String?
    let createdAt: Date
}

// MARK: - Global Search Conversation Result

struct GlobalSearchConversationResult: Identifiable, Sendable {
    let id: String
    let name: String
    let avatar: String?
    let type: MeeshyConversation.ConversationType
    let memberCount: Int
    let lastMessagePreview: String?
    let lastMessageAt: Date
    let unreadCount: Int
    let conversation: Conversation
}

// MARK: - Global Search User Result

struct GlobalSearchUserResult: Identifiable, Sendable {
    let id: String
    let username: String
    let displayName: String?
    let avatar: String?
    let isOnline: Bool
}

// MARK: - ViewModel

@MainActor
class GlobalSearchViewModel: ObservableObject {

    // MARK: - Published State

    @Published var searchText = ""
    @Published var selectedTab: SearchTab = .messages
    @Published var messageResults: [GlobalSearchMessageResult] = []
    @Published var conversationResults: [GlobalSearchConversationResult] = []
    @Published var userResults: [GlobalSearchUserResult] = []
    @Published var isSearching = false
    @Published var recentSearches: [String] = []
    @Published var hasSearched = false

    // MARK: - Dependencies

    private let api: APIClientProviding
    private let userService: UserServiceProviding
    private let authManager: AuthManaging
    private let searchService: MessageSearchService

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()
    private let recentSearchesKey = "globalSearch.recentSearches"
    private let maxRecentSearches = 10

    // MARK: - Init

    init(
        api: APIClientProviding = APIClient.shared,
        userService: UserServiceProviding = UserService.shared,
        authManager: AuthManaging = AuthManager.shared,
        searchService: MessageSearchService? = nil
    ) {
        self.api = api
        self.userService = userService
        self.authManager = authManager
        self.searchService = searchService ?? MessageSearchService(
            reader: DependencyContainer.shared.dbPool
        )
        loadRecentSearches()
        setupDebounce()
    }

    // MARK: - Debounced Search

    private func setupDebounce() {
        $searchText
            .removeDuplicates()
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] query in
                guard let self else { return }
                let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.count >= 2 {
                    Task { [weak self] in
                        await self?.performSearch(query: trimmed)
                    }
                } else {
                    self.clearResults()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Search

    func performSearch(query: String) async {
        isSearching = true
        hasSearched = true

        async let conversationsTask = searchConversations(query: query)
        async let usersTask = searchUsers(query: query)
        async let messagesTask = searchMessages(query: query)

        let (convs, users, msgs) = await (conversationsTask, usersTask, messagesTask)
        conversationResults = convs
        userResults = users
        messageResults = msgs

        isSearching = false
    }

    // MARK: - Search Conversations (FTS5-first, network fallback)

    private func searchConversations(query: String) async -> [GlobalSearchConversationResult] {
        let localResults = await searchLocalConversations(query: query)
        // Surface local hits immediately so the UI feels instant; the
        // remote results merge in once the round-trip lands.
        conversationResults = localResults

        let remoteResults = await fetchRemoteConversationResults(query: query)
        return mergeUniqueConversationResults(local: localResults, remote: remoteResults)
    }

    private func searchLocalConversations(query: String) async -> [GlobalSearchConversationResult] {
        let ids = (try? await SearchIndex.shared.searchConversations(query: query, limit: 50)) ?? []
        guard !ids.isEmpty else { return [] }

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").value ?? []
        let byId = Dictionary(uniqueKeysWithValues: cached.map { ($0.id, $0) })

        return ids.compactMap { id -> GlobalSearchConversationResult? in
            guard let conv = byId[id] else { return nil }
            return GlobalSearchConversationResult(
                id: conv.id,
                name: conv.name,
                avatar: conv.avatar ?? conv.participantAvatarURL,
                type: conv.type,
                memberCount: conv.memberCount,
                lastMessagePreview: conv.lastMessagePreview,
                lastMessageAt: conv.lastMessageAt,
                unreadCount: conv.unreadCount,
                conversation: conv
            )
        }
    }

    private func fetchRemoteConversationResults(query: String) async -> [GlobalSearchConversationResult] {
        do {
            let response: APIResponse<[APIConversation]> = try await api.request(
                endpoint: "/conversations/search",
                queryItems: [URLQueryItem(name: "q", value: query)]
            )
            let userId = authManager.currentUser?.id ?? ""
            return response.data.map { apiConv in
                let conv = apiConv.toConversation(currentUserId: userId)
                return GlobalSearchConversationResult(
                    id: conv.id,
                    name: conv.name,
                    avatar: conv.avatar ?? conv.participantAvatarURL,
                    type: conv.type,
                    memberCount: conv.memberCount,
                    lastMessagePreview: conv.lastMessagePreview,
                    lastMessageAt: conv.lastMessageAt,
                    unreadCount: conv.unreadCount,
                    conversation: conv
                )
            }
        } catch {
            return []
        }
    }

    private func mergeUniqueConversationResults(
        local: [GlobalSearchConversationResult],
        remote: [GlobalSearchConversationResult]
    ) -> [GlobalSearchConversationResult] {
        var seen = Set<String>()
        var merged: [GlobalSearchConversationResult] = []
        // Remote first: server-side payloads carry the freshest counts /
        // last-message previews. Local hits fill the gap for items the
        // server didn't return (e.g., we are offline).
        for result in remote + local {
            if seen.insert(result.id).inserted {
                merged.append(result)
            }
        }
        return merged.sorted { $0.lastMessageAt > $1.lastMessageAt }
    }

    // MARK: - Search Users (FTS5-first, network fallback)

    private func searchUsers(query: String) async -> [GlobalSearchUserResult] {
        let localResults = await searchLocalUsers(query: query)
        userResults = localResults

        let remoteResults = await fetchRemoteUserResults(query: query)
        return mergeUniqueUserResults(local: localResults, remote: remoteResults)
    }

    private func searchLocalUsers(query: String) async -> [GlobalSearchUserResult] {
        let ids = (try? await SearchIndex.shared.searchUsers(query: query, limit: 50)) ?? []
        guard !ids.isEmpty else { return [] }

        // Resolve each id via the per-key profile cache. Misses are dropped
        // (profile evicted from LRU since last index write — falls back to
        // remote results once they arrive).
        var users: [MeeshyUser] = []
        for id in ids {
            if let cached = await CacheCoordinator.shared.profiles.load(for: id).value?.first {
                users.append(cached)
            }
        }

        return users.map { user in
            GlobalSearchUserResult(
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar,
                isOnline: user.isOnline ?? false
            )
        }
    }

    private func fetchRemoteUserResults(query: String) async -> [GlobalSearchUserResult] {
        do {
            let results = try await userService.searchUsers(query: query, limit: 20, offset: 0)
            return results.map { user in
                GlobalSearchUserResult(
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    avatar: user.avatar,
                    isOnline: user.isOnline ?? false
                )
            }
        } catch {
            return []
        }
    }

    private func mergeUniqueUserResults(
        local: [GlobalSearchUserResult],
        remote: [GlobalSearchUserResult]
    ) -> [GlobalSearchUserResult] {
        var seen = Set<String>()
        var merged: [GlobalSearchUserResult] = []
        // Remote first: it carries fresh online status; locals fill the gap.
        for result in remote + local {
            if seen.insert(result.id).inserted {
                merged.append(result)
            }
        }
        return merged
    }

    // MARK: - Search Messages (FTS5-first, network fallback)

    private func searchMessages(query: String) async -> [GlobalSearchMessageResult] {
        // FTS5 local results — instant, available offline
        let localResults = await searchLocalMessages(query: query)
        messageResults = localResults

        // Network in parallel — merge fresh server-side hits
        let remoteResults = await fetchRemoteMessageResults(query: query)
        return mergeUniqueMessageResults(local: localResults, remote: remoteResults)
    }

    private func searchLocalMessages(query: String) async -> [GlobalSearchMessageResult] {
        let records = (try? await searchService.search(
            query: query,
            limit: 50,
            conversationId: nil
        )) ?? []
        return records.map { record in
            GlobalSearchMessageResult(
                id: record.localId,
                conversationId: record.conversationId,
                // conversationName is not stored in MessageRecord; use conversationId as
                // placeholder — network results will supply the proper name via merge.
                conversationName: record.conversationId,
                conversationAvatar: nil,
                content: record.content ?? "",
                senderName: record.senderName ?? record.senderUsername ?? "?",
                senderAvatar: record.senderAvatarURL,
                createdAt: record.createdAt
            )
        }
    }

    private func fetchRemoteMessageResults(query: String) async -> [GlobalSearchMessageResult] {
        do {
            let response: APIResponse<[APIConversation]> = try await api.request(
                endpoint: "/conversations/search",
                queryItems: [URLQueryItem(name: "q", value: query)]
            )
            let userId = authManager.currentUser?.id ?? ""
            let conversations = response.data.map { $0.toConversation(currentUserId: userId) }
            let searchConvs = Array(conversations.prefix(10))

            var allResults: [GlobalSearchMessageResult] = []
            await withTaskGroup(of: [GlobalSearchMessageResult].self) { group in
                for conv in searchConvs {
                    group.addTask { [weak self] in
                        guard let self else { return [] }
                        return await self.searchMessagesInConversation(
                            conversationId: conv.id,
                            conversationName: conv.name,
                            conversationAvatar: conv.avatar ?? conv.participantAvatarURL,
                            query: query
                        )
                    }
                }
                for await results in group {
                    allResults.append(contentsOf: results)
                }
            }
            return allResults.sorted { $0.createdAt > $1.createdAt }
        } catch {
            return []
        }
    }

    private func mergeUniqueMessageResults(
        local: [GlobalSearchMessageResult],
        remote: [GlobalSearchMessageResult]
    ) -> [GlobalSearchMessageResult] {
        var seen = Set<String>()
        var merged: [GlobalSearchMessageResult] = []
        // Remote results take precedence (they carry full conversationName, avatar, etc.);
        // local results fill the gap for any message not returned by the network.
        for result in remote + local {
            if seen.insert(result.id).inserted {
                merged.append(result)
            }
        }
        return merged.sorted { $0.createdAt > $1.createdAt }
    }

    private func searchMessagesInConversation(
        conversationId: String,
        conversationName: String,
        conversationAvatar: String?,
        query: String
    ) async -> [GlobalSearchMessageResult] {
        do {
            let response: MessagesAPIResponse = try await api.request(
                endpoint: "/conversations/\(conversationId)/messages/search",
                queryItems: [
                    URLQueryItem(name: "q", value: query),
                    URLQueryItem(name: "limit", value: "5"),
                ]
            )
            return response.data.map { apiMsg in
                let senderName = apiMsg.sender?.displayName ?? apiMsg.sender?.username ?? "?"
                return GlobalSearchMessageResult(
                    id: apiMsg.id,
                    conversationId: apiMsg.conversationId,
                    conversationName: conversationName,
                    conversationAvatar: conversationAvatar,
                    content: apiMsg.content ?? "",
                    senderName: senderName,
                    senderAvatar: apiMsg.sender?.avatar,
                    createdAt: apiMsg.createdAt
                )
            }
        } catch {
            return []
        }
    }

    // MARK: - Clear Results

    private func clearResults() {
        messageResults = []
        conversationResults = []
        userResults = []
        hasSearched = false
    }

    // MARK: - Recent Searches

    func addToRecentSearches(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        recentSearches.removeAll { $0.lowercased() == trimmed.lowercased() }
        recentSearches.insert(trimmed, at: 0)

        if recentSearches.count > maxRecentSearches {
            recentSearches = Array(recentSearches.prefix(maxRecentSearches))
        }

        saveRecentSearches()
    }

    func removeRecentSearch(_ query: String) {
        recentSearches.removeAll { $0 == query }
        saveRecentSearches()
    }

    func clearRecentSearches() {
        recentSearches = []
        saveRecentSearches()
    }

    private func loadRecentSearches() {
        recentSearches = UserDefaults.standard.stringArray(forKey: recentSearchesKey) ?? []
    }

    private func saveRecentSearches() {
        UserDefaults.standard.set(recentSearches, forKey: recentSearchesKey)
    }

    // MARK: - Tab Result Counts

    var messageCount: Int { messageResults.count }
    var conversationCount: Int { conversationResults.count }
    var userCount: Int { userResults.count }

    var totalResultCount: Int { messageCount + conversationCount + userCount }
}
