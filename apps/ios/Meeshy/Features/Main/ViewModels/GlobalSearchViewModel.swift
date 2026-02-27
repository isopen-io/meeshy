import Foundation
import Combine
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

struct GlobalSearchMessageResult: Identifiable {
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

struct GlobalSearchConversationResult: Identifiable {
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

struct GlobalSearchUserResult: Identifiable {
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

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()
    private let recentSearchesKey = "globalSearch.recentSearches"
    private let maxRecentSearches = 10

    // MARK: - Init

    init() {
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

    // MARK: - Search Conversations

    private func searchConversations(query: String) async -> [GlobalSearchConversationResult] {
        do {
            let response: APIResponse<[APIConversation]> = try await APIClient.shared.request(
                endpoint: "/conversations/search",
                queryItems: [URLQueryItem(name: "q", value: query)]
            )
            let userId = AuthManager.shared.currentUser?.id ?? ""
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

    // MARK: - Search Users

    private func searchUsers(query: String) async -> [GlobalSearchUserResult] {
        do {
            let results = try await UserService.shared.searchUsers(query: query, limit: 20)
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

    // MARK: - Search Messages (across all conversations)

    private func searchMessages(query: String) async -> [GlobalSearchMessageResult] {
        // Search within each of the user's conversations for matching messages
        // Using the conversation search endpoint to find relevant conversations first,
        // then searching within those conversations for message matches
        do {
            // First get conversations that might have matching messages
            let response: APIResponse<[APIConversation]> = try await APIClient.shared.request(
                endpoint: "/conversations/search",
                queryItems: [URLQueryItem(name: "q", value: query)]
            )
            let userId = AuthManager.shared.currentUser?.id ?? ""
            let conversations = response.data.map { $0.toConversation(currentUserId: userId) }

            // Search for messages in the first few conversations (limit to avoid too many requests)
            var allResults: [GlobalSearchMessageResult] = []
            let searchConvs = Array(conversations.prefix(10))

            await withTaskGroup(of: [GlobalSearchMessageResult].self) { group in
                for conv in searchConvs {
                    group.addTask { [weak self] in
                        guard self != nil else { return [] }
                        return await self?.searchMessagesInConversation(
                            conversationId: conv.id,
                            conversationName: conv.name,
                            conversationAvatar: conv.avatar ?? conv.participantAvatarURL,
                            query: query
                        ) ?? []
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

    private func searchMessagesInConversation(
        conversationId: String,
        conversationName: String,
        conversationAvatar: String?,
        query: String
    ) async -> [GlobalSearchMessageResult] {
        do {
            let response: MessagesAPIResponse = try await APIClient.shared.request(
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
