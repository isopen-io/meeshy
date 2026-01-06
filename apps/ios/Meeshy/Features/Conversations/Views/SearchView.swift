//
//  SearchView.swift
//  Meeshy
//
//  Global search view for messages, conversations, and users
//  iOS 16+
//

import SwiftUI

struct SearchView: View {
    // MARK: - Properties

    @StateObject private var viewModel = SearchViewModel()
    @FocusState private var isSearchFocused: Bool

    // MARK: - Body

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Tab selector
                tabSelector

                Divider()

                // Content
                if viewModel.searchQuery.isEmpty {
                    recentSearchesView
                } else if viewModel.isSearching {
                    loadingView
                } else {
                    resultsView
                }
            }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.large)
            .searchable(
                text: $viewModel.searchQuery,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: searchPrompt
            )
            .onAppear {
                isSearchFocused = true
            }
        }
    }

    // MARK: - Subviews

    private var tabSelector: some View {
        Picker("Search Type", selection: $viewModel.selectedTab) {
            ForEach(SearchViewModel.SearchTab.allCases, id: \.self) { tab in
                Text(tab.rawValue).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding()
    }

    private var searchPrompt: String {
        switch viewModel.selectedTab {
        case .messages:
            return "Search messages"
        case .conversations:
            return "Search conversations"
        case .users:
            return "Search users"
        }
    }

    private var recentSearchesView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if !viewModel.recentSearches.isEmpty {
                    HStack {
                        Text("Recent Searches")
                            .font(.headline)
                            .foregroundColor(.meeshyTextPrimary)

                        Spacer()

                        Button("Clear") {
                            viewModel.clearRecentSearches()
                        }
                        .font(.subheadline)
                        .foregroundColor(.meeshyPrimary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                    ForEach(viewModel.recentSearches, id: \.self) { search in
                        Button {
                            viewModel.searchQuery = search
                        } label: {
                            HStack {
                                Image(systemName: "clock")
                                    .foregroundColor(.meeshyTextSecondary)

                                Text(search)
                                    .foregroundColor(.meeshyTextPrimary)

                                Spacer()

                                Button {
                                    viewModel.removeRecentSearch(search)
                                } label: {
                                    Image(systemName: "xmark")
                                        .foregroundColor(.meeshyTextSecondary)
                                        .font(.caption)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        }
                        .buttonStyle(.plain)

                        Divider()
                            .padding(.leading, 56)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var resultsView: some View {
        switch viewModel.selectedTab {
        case .messages:
            messageResultsView
        case .conversations:
            conversationResultsView
        case .users:
            userResultsView
        }
    }

    private var messageResultsView: some View {
        Group {
            if viewModel.messageResults.isEmpty {
                emptyStateView
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(viewModel.messageResults) { result in
                            MessageSearchResultRow(result: result, searchQuery: viewModel.searchQuery)

                            Divider()
                                .padding(.leading, 72)
                        }
                    }
                }
            }
        }
    }

    private var conversationResultsView: some View {
        Group {
            if viewModel.conversationResults.isEmpty {
                emptyStateView
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(viewModel.conversationResults) { conversation in
                            NavigationLink(value: conversation) {
                                ConversationRowView(conversation: conversation)
                            }
                            .buttonStyle(.plain)

                            Divider()
                                .padding(.leading, 72)
                        }
                    }
                }
            }
        }
    }

    private var userResultsView: some View {
        Group {
            if viewModel.userResults.isEmpty {
                emptyStateView
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(viewModel.userResults) { user in
                            NavigationLink(value: user) {
                                UserSearchResultRow(user: user)
                            }
                            .buttonStyle(.plain)

                            Divider()
                                .padding(.leading, 72)
                        }
                    }
                }
            }
        }
    }

    private var loadingView: some View {
        VStack {
            ProgressView()
            Text("Searching...")
                .font(.subheadline)
                .foregroundColor(.meeshyTextSecondary)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48))
                .foregroundColor(.meeshyTextSecondary)

            Text("No results for '\(viewModel.searchQuery)'")
                .font(.headline)
                .foregroundColor(.meeshyTextPrimary)

            Text("Try searching with different keywords")
                .font(.subheadline)
                .foregroundColor(.meeshyTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Message Search Result Row

struct MessageSearchResultRow: View {
    let result: SearchViewModel.MessageSearchResult
    let searchQuery: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Conversation name
            Text(result.conversation.displayName)
                .font(.subheadline)
                .foregroundColor(.meeshyPrimary)

            // Message content with highlighted search term
            Text(highlightedContent)
                .font(.system(size: 15))
                .foregroundColor(.meeshyTextPrimary)
                .lineLimit(2)

            // Timestamp
            Text(formatTimestamp(result.message.createdAt))
                .font(.caption)
                .foregroundColor(.meeshyTextSecondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var highlightedContent: AttributedString {
        var attributedString = AttributedString(result.message.content)

        // TODO: Highlight search query in content
        // This is a placeholder - proper implementation would use AttributedString ranges

        return attributedString
    }

    private func formatTimestamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - User Search Result Row

struct UserSearchResultRow: View {
    let user: User

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(
                imageURL: user.avatar,
                initials: user.initials,
                size: 56,
                showOnlineIndicator: true,
                isOnline: user.isOnline
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(user.displayNameOrUsername)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.meeshyTextPrimary)

                Text("@\(user.username)")
                    .font(.system(size: 15))
                    .foregroundColor(.meeshyTextSecondary)

                if ((user.bio?.isEmpty) != nil) {
                    Text(user.bio!)
                        .font(.system(size: 14))
                        .foregroundColor(.meeshyTextTertiary)
                        .lineLimit(1)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundColor(.meeshyTextTertiary)
                .font(.caption)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Preview

#Preview {
    SearchView()
}
