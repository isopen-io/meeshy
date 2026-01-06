//
//  ConversationInfoView.swift
//  Meeshy
//
//  Conversation details and settings
//  iOS 16+
//

import SwiftUI

struct ConversationInfoView: View {
    // MARK: - Properties

    let conversation: Conversation

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: ConversationInfoViewModel
    @State private var showingLeaveConfirmation = false
    @State private var showingDeleteConfirmation = false

    // MARK: - Initialization

    init(conversation: Conversation) {
        self.conversation = conversation
        self._viewModel = StateObject(wrappedValue: ConversationInfoViewModel(conversation: conversation))
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    headerView

                    // Media, Links, Docs
                    if conversation.type == .group {
                        mediaSection
                    }

                    // Members
                    membersSection

                    // Settings
                    settingsSection

                    // Danger zone
                    dangerZoneSection
                }
                .padding(.vertical, 24)
            }
            .background(Color.meeshyBackground)
            .navigationTitle("Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .confirmationDialog(
                "Leave Conversation",
                isPresented: $showingLeaveConfirmation,
                titleVisibility: .visible
            ) {
                Button("Leave", role: .destructive) {
                    Task {
                        await viewModel.leaveConversation()
                        dismiss()
                    }
                }
            } message: {
                Text("Are you sure you want to leave this conversation?")
            }
            .confirmationDialog(
                "Delete Conversation",
                isPresented: $showingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    Task {
                        await viewModel.deleteConversation()
                        dismiss()
                    }
                }
            } message: {
                Text("This will delete the conversation for everyone. This action cannot be undone.")
            }
        }
    }

    // MARK: - Subviews

    private var headerView: some View {
        VStack(spacing: 16) {
            // Avatar
            if conversation.type == .group {
                GroupAvatarView(
                    size: 120,
                    participantCount: conversation.members?.count ?? 0
                )
            } else {
                AvatarView(
                    imageURL: nil,
                    initials: String(conversation.displayName.prefix(2)),
                    size: 120
                )
            }

            // Name
            if viewModel.isEditingName {
                TextField("Conversation name", text: $viewModel.conversationName)
                    .textFieldStyle(.roundedBorder)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .onSubmit {
                        Task {
                            await viewModel.updateConversationName()
                        }
                    }
            } else {
                HStack {
                    Text(conversation.displayName)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.meeshyTextPrimary)

                    if conversation.type == .group {
                        Button {
                            viewModel.isEditingName = true
                        } label: {
                            Image(systemName: "pencil")
                                .foregroundColor(.meeshyPrimary)
                        }
                    }
                }
            }

            // Participant count
            if conversation.type == .group {
                Text("\(conversation.members?.count ?? 0) members")
                    .font(.subheadline)
                    .foregroundColor(.meeshyTextSecondary)
            }
        }
    }

    private var mediaSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Shared Media")
                    .font(.headline)
                    .foregroundColor(.meeshyTextPrimary)

                Spacer()

                Button("See All") {
                    // TODO: Navigate to media gallery
                }
                .font(.subheadline)
                .foregroundColor(.meeshyPrimary)
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(0..<5) { _ in
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.meeshySecondaryBackground)
                            .frame(width: 100, height: 100)
                            .overlay(
                                Image(systemName: "photo")
                                    .foregroundColor(.meeshyTextSecondary)
                            )
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private var membersSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Members")
                    .font(.headline)
                    .foregroundColor(.meeshyTextPrimary)

                // Show total count
                if let totalCount = viewModel.totalMemberCount {
                    Text("(\(totalCount))")
                        .font(.subheadline)
                        .foregroundColor(.meeshyTextSecondary)
                }

                Spacer()

                if conversation.type == .group {
                    Button {
                        // TODO: Add member
                    } label: {
                        Image(systemName: "plus")
                            .foregroundColor(.meeshyPrimary)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            // MEMORY OPTIMIZATION: Paginated member display
            LazyVStack(spacing: 0) {
                ForEach(viewModel.displayedMembers) { participant in
                    MemberRow(
                        participant: participant,
                        isAdmin: participant.role == .admin,
                        onRemove: conversation.type == .group ? {
                            // TODO: Remove member
                        } : nil
                    )
                    .onAppear {
                        // Load more when approaching end of list
                        if participant.id == viewModel.displayedMembers.last?.id {
                            viewModel.loadMoreMembers()
                        }
                    }

                    if participant.id != viewModel.displayedMembers.last?.id {
                        Divider()
                            .padding(.leading, 72)
                    }
                }

                // Show "Load More" if there are more members
                if viewModel.hasMoreMembers {
                    Button {
                        viewModel.loadMoreMembers()
                    } label: {
                        HStack {
                            if viewModel.isLoadingMembers {
                                ProgressView()
                                    .padding(.trailing, 8)
                            }
                            Text(viewModel.isLoadingMembers ? "Loading..." : "Load More Members")
                                .font(.subheadline)
                                .foregroundColor(.meeshyPrimary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                    }
                    .disabled(viewModel.isLoadingMembers)
                }
            }
            .background(Color.meeshySecondaryBackground)
            .cornerRadius(12)
            .padding(.horizontal, 16)
        }
        .onAppear {
            viewModel.loadInitialMembers()
        }
    }

    private var settingsSection: some View {
        VStack(spacing: 0) {
            // Mute notifications
            Toggle(isOn: Binding(
                get: { conversation.isMuted },
                set: { newValue in
                    Task {
                        await viewModel.toggleMute(newValue)
                    }
                }
            )) {
                Label("Mute Notifications", systemImage: "bell.slash")
                    .foregroundColor(.meeshyTextPrimary)
            }
            .tint(.meeshyPrimary)
            .padding(16)

            Divider()
                .padding(.leading, 56)

            // Search in conversation
            Button {
                // TODO: Search in conversation
            } label: {
                Label("Search in Conversation", systemImage: "magnifyingglass")
                    .foregroundColor(.meeshyTextPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
            }
        }
        .background(Color.meeshySecondaryBackground)
        .cornerRadius(12)
        .padding(.horizontal, 16)
    }

    private var dangerZoneSection: some View {
        VStack(spacing: 12) {
            if conversation.type == .group {
                Button {
                    showingLeaveConfirmation = true
                } label: {
                    Text("Leave Conversation")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(Color.orange)
                        .cornerRadius(12)
                }
                .padding(.horizontal, 16)
            }

            Button {
                showingDeleteConfirmation = true
            } label: {
                Text("Delete Conversation")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(Color.meeshyError)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Member Row

struct MemberRow: View {
    let participant: ConversationMember
    let isAdmin: Bool
    let onRemove: (() -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(
                initials: String(participant.userId.prefix(2)).uppercased(),
                size: 56,
                showOnlineIndicator: true,
                isOnline: false
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(participant.userId) // TODO: Get user name
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.meeshyTextPrimary)

                    if isAdmin {
                        Text("Admin")
                            .font(.caption)
                            .foregroundColor(.meeshyPrimary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Color.meeshyPrimary.opacity(0.1))
                            .cornerRadius(4)
                    }
                }

                Text("@\(participant.userId)") // TODO: Get username
                    .font(.system(size: 15))
                    .foregroundColor(.meeshyTextSecondary)
            }

            Spacer()

            if let onRemove = onRemove, !isAdmin {
                Button {
                    onRemove()
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .foregroundColor(.meeshyError)
                        .font(.system(size: 24))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - View Model

@MainActor
final class ConversationInfoViewModel: ObservableObject {
    @Published var conversation: Conversation
    @Published var isEditingName: Bool = false
    @Published var conversationName: String

    // MEMORY OPTIMIZATION: Paginated member display
    @Published var displayedMembers: [ConversationMember] = []
    @Published var totalMemberCount: Int?
    @Published var hasMoreMembers: Bool = false
    @Published var isLoadingMembers: Bool = false
    private var currentMemberPage: Int = 0
    private let membersPageSize: Int = 20

    private let conversationService: ConversationService

    init(
        conversation: Conversation,
        conversationService: ConversationService = ConversationService.shared
    ) {
        self.conversation = conversation
        self.conversationName = conversation.title ?? ""
        self.conversationService = conversationService
    }

    // MARK: - Paginated Member Loading

    func loadInitialMembers() {
        guard displayedMembers.isEmpty else { return }

        currentMemberPage = 1

        // Try cache first
        Task {
            if let result = await MemberCacheManager.shared.getMembersPaginated(
                for: conversation.id,
                page: currentMemberPage,
                pageSize: membersPageSize
            ) {
                displayedMembers = result.members
                totalMemberCount = result.totalCount
                hasMoreMembers = result.hasMore
            } else if let members = conversation.members {
                // Fall back to conversation.members for initial display (paginated)
                let endIndex = min(membersPageSize, members.count)
                displayedMembers = Array(members.prefix(endIndex))
                totalMemberCount = members.count
                hasMoreMembers = members.count > membersPageSize
            }
        }
    }

    func loadMoreMembers() {
        guard hasMoreMembers, !isLoadingMembers else { return }

        isLoadingMembers = true
        currentMemberPage += 1

        Task {
            defer { isLoadingMembers = false }

            // Try cache first
            if let result = await MemberCacheManager.shared.getMembersPaginated(
                for: conversation.id,
                page: currentMemberPage,
                pageSize: membersPageSize
            ) {
                displayedMembers.append(contentsOf: result.members)
                hasMoreMembers = result.hasMore
            } else if let members = conversation.members {
                // Fall back to conversation.members
                let startIndex = (currentMemberPage - 1) * membersPageSize
                guard startIndex < members.count else {
                    hasMoreMembers = false
                    return
                }
                let endIndex = min(startIndex + membersPageSize, members.count)
                displayedMembers.append(contentsOf: members[startIndex..<endIndex])
                hasMoreMembers = endIndex < members.count
            }
        }
    }

    func updateConversationName() async {
        guard !conversationName.isEmpty else { return }

        do {
            var request = ConversationUpdateRequest(conversationId: conversation.id)
            request.title = conversationName

            let updatedConversation = try await conversationService.updateConversation(request: request)
            self.conversation = updatedConversation
            isEditingName = false

            chatLogger.info("Updated conversation name")
        } catch {
            chatLogger.error("Error updating conversation name: \(error)")
        }
    }

    func toggleMute(_ isMuted: Bool) async {
        do {
            var request = ConversationUpdateRequest(conversationId: conversation.id)
            request.isMuted = isMuted

            let updatedConversation = try await conversationService.updateConversation(request: request)
            self.conversation = updatedConversation

            chatLogger.info("Toggled mute: \(isMuted)")
        } catch {
            chatLogger.error("Error toggling mute: \(error)")
        }
    }

    func leaveConversation() async {
        // TODO: Implement leave conversation API
        chatLogger.info("Leave conversation: \(conversation.id)")
    }

    func deleteConversation() async {
        do {
            try await conversationService.deleteConversation(conversationId: conversation.id)
            chatLogger.info("Deleted conversation")
        } catch {
            chatLogger.error("Error deleting conversation: \(error)")
        }
    }
}

// Preview removed - incompatible with updated Conversation model
