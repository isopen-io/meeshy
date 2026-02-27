import SwiftUI
import MeeshySDK

public struct CommunityDetailView: View {
    @StateObject private var viewModel: CommunityDetailViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public var onSelectConversation: ((APIConversation) -> Void)? = nil
    public var onOpenSettings: ((MeeshyCommunity) -> Void)? = nil
    public var onOpenMembers: ((String) -> Void)? = nil
    public var onInvite: ((String) -> Void)? = nil
    public var onDismiss: (() -> Void)? = nil

    @State private var showLeaveConfirm = false
    @State private var showAddChannel = false
    @State private var showSettings = false
    @State private var isLeaving = false
    @State private var localColor: String? = nil
    @State private var localEmoji: String? = nil
    @State private var selectedTab: Int = 0 // 0: Channels, 1: Posts

    public init(communityId: String,
                onSelectConversation: ((APIConversation) -> Void)? = nil,
                onOpenSettings: ((MeeshyCommunity) -> Void)? = nil,
                onOpenMembers: ((String) -> Void)? = nil,
                onInvite: ((String) -> Void)? = nil,
                onDismiss: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunityDetailViewModel(communityId: communityId))
        self.onSelectConversation = onSelectConversation
        self.onOpenSettings = onOpenSettings
        self.onOpenMembers = onOpenMembers
        self.onInvite = onInvite
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack(alignment: .top) {
            theme.backgroundPrimary.ignoresSafeArea()

            if viewModel.isLoading && viewModel.community == nil {
                ProgressView()
                    .tint(Color(hex: "FF2E63"))
            } else if let community = viewModel.community {
                ScrollView {
                    VStack(spacing: 0) {
                        headerSection(community)
                        statsSection(community)
                        actionsSection(community)
                        
                        // Section Segmentée : Channels / Posts
                        Picker("", selection: $selectedTab) {
                            Text("Channels").tag(0)
                            Text("Feed").tag(1)
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        
                        if selectedTab == 0 {
                            conversationsSection
                        } else {
                            postsSection
                        }
                    }
                }

                // Navigation header flottant par-dessus la bannière
                navigationHeader(community)
                    .padding(.top, 8)

            } else if let error = viewModel.errorMessage {
                EmptyStateView(
                    icon: "exclamationmark.triangle",
                    title: "Error",
                    subtitle: error,
                    actionLabel: "Retry",
                    onAction: { Task { await viewModel.load() } }
                )
            }
        }
        .task {
            await viewModel.load()
            localColor = UserDefaults.standard.string(forKey: "community.color.\(viewModel.communityId)")
            localEmoji = UserDefaults.standard.string(forKey: "community.emoji.\(viewModel.communityId)")
        }
        .alert("Quitter la communaute ?", isPresented: $showLeaveConfirm) {
            Button("Annuler", role: .cancel) {}
            Button("Quitter", role: .destructive) {
                Task {
                    isLeaving = true
                    await viewModel.leaveCommunity()
                    isLeaving = false
                    if onDismiss != nil {
                        onDismiss?()
                    } else {
                        dismiss()
                    }
                }
            }
        } message: {
            Text("Vous ne pourrez plus acceder aux channels de cette communaute.")
        }
        .sheet(isPresented: $showAddChannel) {
            AddChannelSheet(
                communityId: viewModel.communityId,
                onAdded: { Task { await viewModel.load() } }
            )
        }
        .sheet(isPresented: $showSettings) {
            if let community = viewModel.community {
                CommunitySettingsView(
                    community: community,
                    onUpdated: { updated in
                        showSettings = false
                        localColor = UserDefaults.standard.string(forKey: "community.color.\(community.id)")
                        localEmoji = UserDefaults.standard.string(forKey: "community.emoji.\(community.id)")
                        Task { await viewModel.load() }
                    },
                    onDeleted: {
                        showSettings = false
                        if let onDismiss {
                            onDismiss()
                        } else {
                            dismiss()
                        }
                    },
                    onLeft: {
                        showSettings = false
                        if let onDismiss {
                            onDismiss()
                        } else {
                            dismiss()
                        }
                    }
                )
            }
        }
    }

    // MARK: - Navigation Header (flottant)

    @ViewBuilder
    private func navigationHeader(_ community: MeeshyCommunity) -> some View {
        HStack {
            Button {
                if let onDismiss {
                    onDismiss()
                } else {
                    dismiss()
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.black.opacity(0.35))
                    .clipShape(Circle())
            }

            Spacer()

            if viewModel.isAdmin {
                Menu {
                    Button {
                        showSettings = true
                    } label: {
                        Label("Reglages", systemImage: "gearshape.fill")
                    }

                    if !viewModel.isCreator {
                        Button(role: .destructive) {
                            showLeaveConfirm = true
                        } label: {
                            Label("Quitter", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(Color.black.opacity(0.35))
                        .clipShape(Circle())
                }
            } else {
                Button {
                    HapticFeedback.light()
                    // Reagir a la communaute
                } label: {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(Color.black.opacity(0.35))
                        .clipShape(Circle())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    // MARK: - Header (bannière + avatar + infos)

    @ViewBuilder
    private func headerSection(_ community: MeeshyCommunity) -> some View {
        let color = localColor ?? (community.color.isEmpty ? DynamicColorGenerator.colorForName(community.name) : community.color)

        VStack(spacing: 0) {
            // Bannière
            ZStack(alignment: .bottomLeading) {
                bannerView(community, color: color)
                    .frame(height: 190)
                    .clipped()

                // Gradient overlay en bas pour lisibilité du header
                LinearGradient(
                    colors: [.clear, Color.black.opacity(0.3)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 190)

                // Avatar overlapping
                communityAvatar(community, color: color)
                    .padding(.leading, 16)
                    .offset(y: 36)
            }

            // Infos communauté
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(community.name)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)

                    if let desc = community.description, !desc.isEmpty {
                        Text(desc)
                            .font(.system(size: 13, design: .rounded))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(2)
                    }
                }
                .padding(.top, 44)

                Spacer()

                HStack(spacing: 4) {
                    Image(systemName: community.isPrivate ? "lock.fill" : "globe")
                        .font(.system(size: 11))
                    Text(community.isPrivate ? "Privee" : "Publique")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(theme.backgroundSecondary)
                .clipShape(Capsule())
                .padding(.top, 44)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
    }

    @ViewBuilder
    private func bannerView(_ community: MeeshyCommunity, color: String) -> some View {
        if let bannerUrl = community.banner, !bannerUrl.isEmpty, let url = URL(string: bannerUrl) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().aspectRatio(contentMode: .fill)
                } else {
                    LinearGradient(
                        colors: [Color(hex: color), Color(hex: color).opacity(0.5)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
            }
        } else {
            LinearGradient(
                colors: [Color(hex: color), Color(hex: color).opacity(0.5)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    @ViewBuilder
    private func communityAvatar(_ community: MeeshyCommunity, color: String) -> some View {
        let emoji = localEmoji.flatMap { $0.isEmpty ? nil : $0 } ?? (community.emoji.isEmpty ? nil : community.emoji)

        ZStack {
            if let avatarUrl = community.avatar, !avatarUrl.isEmpty, let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        avatarFallback(emoji: emoji, color: color, name: community.name)
                    }
                }
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            } else {
                RoundedRectangle(cornerRadius: 18)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: color).opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 72, height: 72)
                    .overlay {
                        if let e = emoji {
                            Text(e).font(.system(size: 32))
                        } else {
                            Text(String(community.name.prefix(2)).uppercased())
                                .font(.system(size: 28, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                        }
                    }
            }
        }
        .shadow(color: Color(hex: color).opacity(0.4), radius: 8, y: 4)
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(theme.backgroundPrimary, lineWidth: 3)
        )
    }

    @ViewBuilder
    private func avatarFallback(emoji: String?, color: String, name: String) -> some View {
        RoundedRectangle(cornerRadius: 18)
            .fill(
                LinearGradient(
                    colors: [Color(hex: color), Color(hex: color).opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay {
                if let e = emoji {
                    Text(e).font(.system(size: 32))
                } else {
                    Text(String(name.prefix(2)).uppercased())
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                }
            }
    }

    // MARK: - Stats

    @ViewBuilder
    private func statsSection(_ community: MeeshyCommunity) -> some View {
        HStack(spacing: 0) {
            statItem(value: "\(community.memberCount)", label: "Members", icon: "person.2.fill")
            Divider().frame(height: 30)
            statItem(value: "\(community.conversationCount)", label: "Channels", icon: "bubble.left.and.bubble.right.fill")
        }
        .padding(.vertical, 12)
        .background(theme.backgroundSecondary.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
    }

    private func statItem(value: String, label: String, icon: String) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "A855F7"))
                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Actions

    @ViewBuilder
    private func actionsSection(_ community: MeeshyCommunity) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                actionButton(icon: "person.2.fill", title: "Membres") {
                    onOpenMembers?(community.id)
                }

                if viewModel.isMember {
                    actionButton(icon: "person.badge.plus", title: "Inviter") {
                        onInvite?(community.id)
                    }
                }

                if viewModel.isAdmin {
                    actionButton(icon: "plus.bubble.fill", title: "Channel") {
                        showAddChannel = true
                    }
                    actionButton(icon: "gearshape.fill", title: "Reglages") {
                        showSettings = true
                    }
                } else if !viewModel.isMember {
                    actionButton(icon: "arrow.right.circle.fill", title: "Rejoindre") {
                        Task { await viewModel.joinCommunity() }
                    }
                }
            }

            if viewModel.isMember && !viewModel.isCreator {
                Button {
                    showLeaveConfirm = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                        Text("Quitter la communaute")
                    }
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundColor(Color(hex: "FF2E63"))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color(hex: "FF2E63").opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
    }

    private func actionButton(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(Color(hex: "A855F7"))
                Text(title)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(theme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Conversations

    @ViewBuilder
    private var conversationsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if viewModel.conversations.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "bubble.left.and.bubble.right",
                    title: "No Channels Yet",
                    subtitle: "Conversations will appear here",
                    actionLabel: "Créer un Channel",
                    onAction: { showAddChannel = true }
                )
                .frame(height: 200)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.conversations, id: \.id) { conversation in
                        conversationRow(conversation)
                            .onTapGesture { onSelectConversation?(conversation) }

                        if conversation.id != viewModel.conversations.last?.id {
                            Divider().padding(.leading, 60)
                        }
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    @ViewBuilder
    private var postsSection: some View {
        // Placeholder for Community Posts / Stories
        VStack(spacing: 8) {
            EmptyStateView(
                icon: "photo.on.rectangle.angled",
                title: "No Posts Yet",
                subtitle: "Community feed will appear here",
                actionLabel: "Créer un post",
                onAction: { 
                    // To do: Show post creator
                }
            )
            .frame(height: 200)
        }
        .padding(.top, 8)
    }

    private func conversationRow(_ conversation: APIConversation) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "number")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(hex: "A855F7"))
                .frame(width: 36, height: 36)
                .background(Color(hex: "A855F7").opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(conversation.title ?? conversation.identifier ?? "Channel")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let desc = conversation.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let count = conversation.memberCount {
                Text("\(count)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

// MARK: - ViewModel

@MainActor
final class CommunityDetailViewModel: ObservableObject {
    @Published var community: MeeshyCommunity?
    @Published var conversations: [APIConversation] = []
    @Published var isMember = false
    @Published var isCreator = false
    @Published var isAdmin = false
    @Published var currentUserRole: CommunityRole = .member
    @Published var isLoading = false
    @Published var errorMessage: String?

    let communityId: String

    init(communityId: String) {
        self.communityId = communityId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let apiCommunity = try await CommunityService.shared.get(communityId: communityId)
            community = apiCommunity.toCommunity()

            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            let creatorMatch = apiCommunity.createdBy == currentUserId
            let memberRecord = apiCommunity.members?.first(where: { $0.userId == currentUserId })
            let inMemberList = memberRecord != nil

            isCreator = creatorMatch
            isMember = creatorMatch || inMemberList

            if let record = memberRecord {
                currentUserRole = record.communityRole
            } else if creatorMatch {
                currentUserRole = .admin
            }

            isAdmin = currentUserRole == .admin || isCreator

            if isMember {
                conversations = try await CommunityService.shared.getConversations(communityId: communityId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func joinCommunity() async {
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await CommunityService.shared.join(communityId: communityId)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func leaveCommunity() async {
        do {
            try await CommunityService.shared.leave(communityId: communityId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Add Channel Sheet

struct AddChannelSheet: View {
    let communityId: String
    let onAdded: () -> Void
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var conversations: [APIConversation] = []
    @State private var isLoading = true
    @State private var isLoadingMore = false
    @State private var hasMore = false
    @State private var currentOffset = 0
    @State private var isAdding: String? = nil
    @State private var errorMessage: String?
    @State private var searchText = ""
    @State private var showMoveConfirm = false
    @State private var pendingMoveConversation: APIConversation?

    private let pageSize = 20

    private var filtered: [APIConversation] {
        guard !searchText.isEmpty else { return conversations }
        return conversations.filter { conv in
            let title = conv.title ?? conv.identifier ?? ""
            return title.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                if isLoading && conversations.isEmpty {
                    ProgressView()
                        .tint(Color(hex: "A855F7"))
                } else if filtered.isEmpty && !isLoading {
                    emptyState
                } else {
                    conversationList
                }
            }
            .navigationTitle("Ajouter un channel")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: "Rechercher une conversation...")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
        .task { await loadConversations() }
        .presentationDetents([.medium, .large])
        .alert("Deplacer cette conversation ?", isPresented: $showMoveConfirm) {
            Button("Annuler", role: .cancel) {
                pendingMoveConversation = nil
            }
            Button("Deplacer") {
                if let conv = pendingMoveConversation {
                    Task { await addConversation(conv) }
                }
                pendingMoveConversation = nil
            }
        } message: {
            Text("Cette conversation appartient deja a une autre communaute. Elle sera deplacee vers celle-ci.")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 40))
                .foregroundColor(theme.textMuted)
            Text(searchText.isEmpty ? "Aucune conversation disponible" : "Aucun resultat")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundColor(theme.textSecondary)
            if searchText.isEmpty {
                Text("Creez d'abord une conversation pour l'ajouter ici.")
                    .font(.system(size: 13))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
    }

    private var conversationList: some View {
        List {
            ForEach(filtered, id: \.id) { conversation in
                Button {
                    handleTap(conversation)
                } label: {
                    channelRow(conversation)
                }
                .disabled(isAdding != nil)
                .listRowBackground(theme.backgroundSecondary.opacity(0.3))
            }

            if hasMore && searchText.isEmpty {
                HStack {
                    Spacer()
                    if isLoadingMore {
                        ProgressView()
                            .tint(Color(hex: "A855F7"))
                    }
                    Spacer()
                }
                .listRowBackground(Color.clear)
                .task { await loadMore() }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private func channelRow(_ conversation: APIConversation) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "number")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color(hex: "A855F7"))
                .frame(width: 32, height: 32)
                .background(Color(hex: "A855F7").opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(conversation.title ?? conversation.identifier ?? "Conversation")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let count = conversation.memberCount {
                        Label("\(count)", systemImage: "person.2.fill")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }

                    if conversation.communityId != nil {
                        Label("Autre communaute", systemImage: "arrow.triangle.swap")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Color(hex: "F59E0B"))
                    }
                }
            }

            Spacer()

            if isAdding == conversation.id {
                ProgressView()
                    .tint(Color(hex: "A855F7"))
            } else if conversation.communityId != nil {
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(Color(hex: "F59E0B"))
            } else {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(Color(hex: "A855F7"))
            }
        }
        .padding(.vertical, 4)
    }

    private func handleTap(_ conversation: APIConversation) {
        if conversation.communityId != nil && conversation.communityId != communityId {
            pendingMoveConversation = conversation
            showMoveConfirm = true
        } else {
            Task { await addConversation(conversation) }
        }
    }

    private func loadConversations() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await ConversationService.shared.list(offset: 0, limit: pageSize)
            conversations = response.data.filter { $0.communityId != communityId }
            currentOffset = conversations.count
            hasMore = response.data.count >= pageSize
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadMore() async {
        guard !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let response = try await ConversationService.shared.list(offset: currentOffset, limit: pageSize)
            let newItems = response.data.filter { $0.communityId != communityId }
            conversations.append(contentsOf: newItems)
            currentOffset += response.data.count
            hasMore = response.data.count >= pageSize
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func addConversation(_ conversation: APIConversation) async {
        isAdding = conversation.id
        defer { isAdding = nil }

        do {
            _ = try await CommunityService.shared.addConversation(communityId: communityId, conversationId: conversation.id)
            conversations.removeAll { $0.id == conversation.id }
            onAdded()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
