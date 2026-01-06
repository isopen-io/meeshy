//
//  SearchViewModel.swift
//  Meeshy
//
//  Manages global search functionality
//  iOS 16+
//

import Foundation
import SwiftUI
import Combine

@MainActor
final class SearchViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var searchQuery: String = ""
    @Published var isSearching: Bool = false
    @Published var selectedTab: SearchTab = .messages
    @Published var recentSearches: [String] = []

    // Results
    @Published var messageResults: [MessageSearchResult] = []
    @Published var conversationResults: [Conversation] = []
    @Published var userResults: [User] = []

    // Filters
    @Published var dateFilter: DateFilter?
    @Published var typeFilter: MessageTypeFilter?
    @Published var senderFilter: String?

    // MARK: - Nested Types

    enum SearchTab: String, CaseIterable {
        case messages = "Messages"
        case conversations = "Conversations"
        case users = "Users"
    }

    enum DateFilter: String, CaseIterable {
        case today = "Today"
        case thisWeek = "This Week"
        case thisMonth = "This Month"
        case allTime = "All Time"
    }

    enum MessageTypeFilter: String, CaseIterable {
        case all = "All"
        case text = "Text"
        case media = "Media"
        case files = "Files"
    }

    struct MessageSearchResult: Identifiable, Codable {
        let id: String
        let message: Message
        let conversation: Conversation

        init(id: String = UUID().uuidString, message: Message, conversation: Conversation) {
            self.id = id
            self.message = message
            self.conversation = conversation
        }
    }

    // MARK: - Private Properties

    private let conversationService: ConversationService
    private let userService: UserService
    private var cancellables = Set<AnyCancellable>()

    private let maxRecentSearches = 10

    // MARK: - Initialization

    init(
        conversationService: ConversationService = ConversationService.shared,
        userService: UserService = UserService.shared
    ) {
        self.conversationService = conversationService
        self.userService = userService

        loadRecentSearches()
        setupSearchListener()
    }

    // MARK: - Search

    private func setupSearchListener() {
        $searchQuery
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] query in
                guard let self = self else { return }

                if query.isEmpty {
                    self.clearResults()
                } else {
                    Task {
                        await self.performSearch(query: query)
                    }
                }
            }
            .store(in: &cancellables)
    }

    func performSearch(query: String) async {
        guard !query.isEmpty else {
            clearResults()
            return
        }

        isSearching = true

        // Add to recent searches
        addToRecentSearches(query)

        // Search based on selected tab
        switch selectedTab {
        case .messages:
            await searchMessages(query: query)
        case .conversations:
            await searchConversations(query: query)
        case .users:
            await searchUsers(query: query)
        }

        isSearching = false
    }

    private func searchMessages(query: String) async {
        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/search/messages?query=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") else {
                throw MeeshyError.network(.invalidRequest)
            }

            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MeeshyError.network(.invalidResponse)
            }

            if httpResponse.statusCode == 200 {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds

                let searchResponse = try decoder.decode(APIResponse<[MessageSearchResult]>.self, from: data)
                messageResults = searchResponse.data ?? []
                chatLogger.info("Found \(messageResults.count) message results for: \(query)")
            } else if httpResponse.statusCode == 404 {
                // Search endpoint not implemented yet
                messageResults = []
                chatLogger.warn("Message search endpoint not implemented")
            } else {
                throw MeeshyError.network(.serverError(httpResponse.statusCode))
            }
        } catch {
            chatLogger.error("Error searching messages: \(error)")
            messageResults = []
        }
    }

    private func searchConversations(query: String) async {
        do {
            let response = try await conversationService.fetchConversations()
            conversationResults = response.items.filter { conversation in
                conversation.displayName.lowercased().contains(query.lowercased())
            }
        } catch {
            chatLogger.error("Error searching conversations: \(error)")
        }
    }

    private func searchUsers(query: String) async {
        do {
            let users = try await userService.searchUsers(query: query)
            userResults = users
        } catch {
            chatLogger.error("Error searching users: \(error)")
        }
    }

    func clearResults() {
        messageResults = []
        conversationResults = []
        userResults = []
    }

    // MARK: - Recent Searches

    private func loadRecentSearches() {
        if let searches = UserDefaults.standard.stringArray(forKey: "recentSearches") {
            recentSearches = searches
        }
    }

    private func addToRecentSearches(_ query: String) {
        // Remove if already exists
        recentSearches.removeAll { $0 == query }

        // Add to beginning
        recentSearches.insert(query, at: 0)

        // Limit to max
        if recentSearches.count > maxRecentSearches {
            recentSearches = Array(recentSearches.prefix(maxRecentSearches))
        }

        // Save
        UserDefaults.standard.set(recentSearches, forKey: "recentSearches")
    }

    func clearRecentSearches() {
        recentSearches = []
        UserDefaults.standard.removeObject(forKey: "recentSearches")
    }

    func removeRecentSearch(_ query: String) {
        recentSearches.removeAll { $0 == query }
        UserDefaults.standard.set(recentSearches, forKey: "recentSearches")
    }

    // MARK: - Filters

    func applyFilters() {
        // Re-run search with filters
        Task {
            await performSearch(query: searchQuery)
        }
    }

    func clearFilters() {
        dateFilter = nil
        typeFilter = nil
        senderFilter = nil
        applyFilters()
    }
}
