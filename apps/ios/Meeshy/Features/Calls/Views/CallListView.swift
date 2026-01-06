//
//  CallListView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct CallListView: View {
    @StateObject private var viewModel = CallViewModel()
    @State private var showNewCallSheet = false

    var body: some View {
        NavigationStack {
            ZStack {
                if viewModel.filteredCalls().isEmpty && !viewModel.isLoading {
                    emptyStateView
                } else {
                    callListContent
                }

                if viewModel.isLoading {
                    ProgressView()
                }
            }
            .navigationTitle("Calls")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showNewCallSheet = true
                    } label: {
                        Image(systemName: "phone.circle.fill")
                            .font(.title2)
                            .foregroundColor(.blue)
                    }
                }
            }
            .sheet(isPresented: $showNewCallSheet) {
                NewCallSheet(viewModel: viewModel)
            }
            .refreshable {
                await viewModel.refreshCallHistory()
            }
        }
    }

    // MARK: - Call List Content

    private var callListContent: some View {
        VStack(spacing: 0) {
            // Tab Picker
            Picker("Filter", selection: $viewModel.selectedTab) {
                ForEach(CallViewModel.CallTab.allCases, id: \.self) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            // Call List
            List {
                ForEach(viewModel.filteredCalls()) { record in
                    CallRowView(record: record)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                Task {
                                    await viewModel.deleteCallRecord(record.id)
                                }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: false) {
                            Button {
                                Task {
                                    await viewModel.callBack(record)
                                }
                            } label: {
                                Label("Call Back", systemImage: "phone.fill")
                            }
                            .tint(.green)
                        }
                }
            }
            .listStyle(.plain)
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: viewModel.selectedTab == .missed ? "phone.down.fill" : "phone.slash.fill")
                .font(.system(size: 60))
                .foregroundColor(.gray)

            Text(viewModel.selectedTab == .missed ? "No missed calls" : "No recent calls")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Your call history will appear here")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Button {
                showNewCallSheet = true
            } label: {
                Text("Make a Call")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: 200)
                    .padding()
                    .background(Color.blue)
                    .cornerRadius(12)
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - New Call Sheet

struct NewCallSheet: View {
    @ObservedObject var viewModel: CallViewModel
    @StateObject private var conversationListViewModel = ConversationListViewModel()
    @Environment(\.dismiss) private var dismiss

    @State private var searchText = ""
    @State private var selectedCallType: Call.CallType = .audio

    // Get current user ID for proper display name resolution
    private var currentUserId: String {
        AuthenticationManager.shared.currentUser?.id ?? ""
    }

    var body: some View {
        NavigationStack {
            VStack {
                // Call Type Picker
                Picker("Call Type", selection: $selectedCallType) {
                    Label("Audio", systemImage: "phone.fill").tag(Call.CallType.audio)
                    Label("Video", systemImage: "video.fill").tag(Call.CallType.video)
                }
                .pickerStyle(.segmented)
                .padding()

                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)

                    TextField("Search conversations...", text: $searchText)
                }
                .padding(10)
                .background(Color(.systemGray6))
                .cornerRadius(10)
                .padding(.horizontal)

                // Conversation list
                if conversationListViewModel.conversations.isEmpty && !conversationListViewModel.isLoading {
                    emptyConversationsView
                } else {
                    List {
                        ForEach(filteredConversations) { conversation in
                            Button {
                                Task {
                                    // Use proper display name/avatar for direct conversations
                                    await viewModel.initiateCall(
                                        conversationId: conversation.id,
                                        type: selectedCallType,
                                        recipientName: conversation.displayNameForUser(currentUserId),
                                        recipientAvatar: conversation.displayAvatarForUser(currentUserId)
                                    )
                                    dismiss()
                                }
                            } label: {
                                ConversationCallRow(
                                    conversation: conversation,
                                    callType: selectedCallType,
                                    currentUserId: currentUserId
                                )
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("New Call")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .task {
                await conversationListViewModel.loadInitialConversations()
            }
            .overlay {
                if conversationListViewModel.isLoading {
                    ProgressView()
                }
            }
        }
    }

    // MARK: - Filtered Conversations

    private var filteredConversations: [Conversation] {
        let conversations = conversationListViewModel.conversations
        if searchText.isEmpty {
            return conversations
        }
        return conversations.filter { conversation in
            let title = conversation.title ?? conversation.identifier
            return title.localizedCaseInsensitiveContains(searchText)
        }
    }

    // MARK: - Empty State

    private var emptyConversationsView: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 50))
                .foregroundColor(.gray)

            Text("No conversations")
                .font(.headline)
                .foregroundColor(.secondary)

            Text("Start a conversation first to make a call")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Conversation Call Row

private struct ConversationCallRow: View {
    let conversation: Conversation
    let callType: Call.CallType
    var currentUserId: String = ""

    // Use proper display name for direct conversations
    private var displayName: String {
        conversation.displayNameForUser(currentUserId)
    }

    // Use proper avatar for direct conversations
    private var avatarURL: String? {
        conversation.displayAvatarForUser(currentUserId)
    }

    var body: some View {
        HStack(spacing: 12) {
            // Avatar - use proper avatar for direct conversations
            if let avatar = avatarURL,
               let url = URL(string: avatar) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    avatarPlaceholder
                }
                .frame(width: 44, height: 44)
                .clipShape(Circle())
            } else {
                avatarPlaceholder
            }

            // Info - use proper display name for direct conversations
            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(.body)
                    .foregroundColor(.primary)
                    .lineLimit(1)

                Text(conversation.type.displayName)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Call icon
            Image(systemName: callType == .audio ? "phone.fill" : "video.fill")
                .foregroundColor(.blue)
        }
    }

    private var avatarPlaceholder: some View {
        Circle()
            .fill(Color.gray.opacity(0.3))
            .frame(width: 44, height: 44)
            .overlay {
                Text(initials)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
            }
    }

    private var initials: String {
        // Use displayName for proper initials
        let components = displayName.split(separator: " ")
        let firstInitial = components.first?.first.map(String.init) ?? ""
        let lastInitial = components.dropFirst().first?.first.map(String.init) ?? ""
        return (firstInitial + lastInitial).uppercased()
    }
}

#Preview {
    CallListView()
}
