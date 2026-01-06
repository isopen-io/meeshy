//
//  NewConversationView.swift
//  Meeshy
//
//  Create new conversation sheet
//  iOS 16+
//

import SwiftUI

struct NewConversationView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = NewConversationViewModel()

    // MARK: - Body

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                searchBar

                // Conversation type picker
                if !viewModel.selectedUsers.isEmpty {
                    conversationTypePicker
                        .padding(.vertical, 12)
                        .background(Color.meeshySecondaryBackground)
                }

                // Selected users chips
                if !viewModel.selectedUsers.isEmpty {
                    selectedUsersView
                        .padding(.vertical, 12)
                        .background(Color.meeshySecondaryBackground)
                }

                Divider()

                // User list
                if viewModel.isSearching {
                    loadingView
                } else if viewModel.searchResults.isEmpty && !viewModel.searchQuery.isEmpty {
                    emptyStateView
                } else {
                    userListView
                }
            }
            .navigationTitle("New Conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") {
                        Task {
                            await viewModel.createConversation()
                            dismiss()
                        }
                    }
                    .disabled(!viewModel.canCreateConversation)
                    .fontWeight(.semibold)
                }
            }
        }
    }

    // MARK: - Subviews

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.meeshyTextSecondary)

            TextField("Search users", text: $viewModel.searchQuery)
                .textFieldStyle(.plain)
                .autocapitalization(.none)

            if !viewModel.searchQuery.isEmpty {
                Button {
                    viewModel.searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.meeshyTextSecondary)
                }
            }
        }
        .padding(12)
        .background(Color.meeshySecondaryBackground)
        .cornerRadius(10)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var conversationTypePicker: some View {
        Picker("Type", selection: $viewModel.selectedType) {
            Text("Direct").tag(ConversationType.direct)
            Text("Group").tag(ConversationType.group)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .disabled(viewModel.selectedUsers.count == 1)
    }

    private var selectedUsersView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(viewModel.selectedUsers) { user in
                    UserChip(user: user) {
                        viewModel.deselectUser(user)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var userListView: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.searchResults) { user in
                    UserSelectRow(
                        user: user,
                        isSelected: viewModel.isUserSelected(user)
                    ) {
                        viewModel.toggleUserSelection(user)
                    }

                    Divider()
                        .padding(.leading, 72)
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
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 48))
                .foregroundColor(.meeshyTextSecondary)

            Text("No users found")
                .font(.headline)
                .foregroundColor(.meeshyTextPrimary)

            Text("Try searching with a different name or username")
                .font(.subheadline)
                .foregroundColor(.meeshyTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - User Chip

struct UserChip: View {
    let user: User
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            AvatarView(
                imageURL: user.avatar,
                initials: user.initials,
                size: 32
            )

            Text(user.displayNameOrUsername)
                .font(.subheadline)
                .foregroundColor(.meeshyTextPrimary)

            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.meeshyTextSecondary)
                    .font(.system(size: 16))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.meeshySecondaryBackground)
        .cornerRadius(20)
    }
}

// MARK: - User Select Row

struct UserSelectRow: View {
    let user: User
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
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
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.meeshyPrimary)
                        .font(.system(size: 24))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.meeshyBackground)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - View Model

@MainActor
final class NewConversationViewModel: ObservableObject {
    @Published var searchQuery: String = ""
    @Published var searchResults: [User] = []
    @Published var selectedUsers: [User] = []
    @Published var selectedType: ConversationType = .direct
    @Published var isSearching: Bool = false

    private let userService: UserService
    private let conversationService: ConversationService
    private var searchTask: Task<Void, Never>?

    var canCreateConversation: Bool {
        !selectedUsers.isEmpty
    }

    init(
        userService: UserService = UserService.shared,
        conversationService: ConversationService = ConversationService.shared
    ) {
        self.userService = userService
        self.conversationService = conversationService

        // Setup search listener
        setupSearchListener()
    }

    private func setupSearchListener() {
        // Debounce search
        Task {
            for await query in $searchQuery.debounce(for: 0.3).values {
                await performSearch(query: query)
            }
        }
    }

    func performSearch(query: String) async {
        guard !query.isEmpty else {
            searchResults = []
            return
        }

        isSearching = true

        do {
            let users = try await userService.searchUsers(query: query)
            self.searchResults = users
        } catch {
            chatLogger.error("Error searching users: \(error)")
        }

        isSearching = false
    }

    func toggleUserSelection(_ user: User) {
        if let index = selectedUsers.firstIndex(where: { $0.id == user.id }) {
            selectedUsers.remove(at: index)
        } else {
            selectedUsers.append(user)
        }

        // Adjust type based on selection
        if selectedUsers.count == 1 {
            selectedType = .direct
        } else if selectedUsers.count > 1 && selectedType == .direct {
            selectedType = .group
        }
    }

    func deselectUser(_ user: User) {
        selectedUsers.removeAll { $0.id == user.id }

        if selectedUsers.count == 1 {
            selectedType = .direct
        }
    }

    func isUserSelected(_ user: User) -> Bool {
        selectedUsers.contains { $0.id == user.id }
    }

    func createConversation() async {
        guard !selectedUsers.isEmpty else { return }

        do {
            let memberIds = selectedUsers.map { $0.id }
            let request = ConversationCreateRequest(
                identifier: nil,
                type: selectedType,
                title: selectedType == .group ? "New Group" : nil,
                description: nil,
                avatar: nil,
                communityId: nil,
                memberIds: memberIds,
                isPrivate: nil
            )

            _ = try await conversationService.createConversation(request: request)
            chatLogger.info("Created new conversation")
        } catch {
            chatLogger.error("Error creating conversation: \(error)")
        }
    }
}

// MARK: - Preview

#Preview {
    NewConversationView()
}
