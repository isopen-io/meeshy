import SwiftUI
import Combine
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
    /// Création d'un post de communauté, fournie par l'hôte. `nil` ⇒ l'état vide
    /// du feed n'affiche AUCUN bouton (plutôt qu'un bouton inerte).
    public var onCreatePost: (() -> Void)? = nil

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
                onDismiss: (() -> Void)? = nil,
                onCreatePost: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunityDetailViewModel(communityId: communityId))
        self.onSelectConversation = onSelectConversation
        self.onOpenSettings = onOpenSettings
        self.onOpenMembers = onOpenMembers
        self.onInvite = onInvite
        self.onDismiss = onDismiss
        self.onCreatePost = onCreatePost
    }

    public var body: some View {
        ZStack(alignment: .top) {
            theme.backgroundPrimary.ignoresSafeArea()

            if viewModel.isLoading && viewModel.community == nil {
                ProgressView()
                    .tint(MeeshyColors.brandPrimary)
            } else if let community = viewModel.community {
                ScrollView {
                    VStack(spacing: 0) {
                        headerSection(community)
                        statsSection(community)
                        actionsSection(community)
                        
                        // Section Segmentée : Channels / Posts
                        Picker("", selection: $selectedTab) {
                            Text(String(localized: "community.detail.tab.channels", defaultValue: "Channels", bundle: .module)).tag(0)
                            Text(String(localized: "community.detail.tab.feed", defaultValue: "Feed", bundle: .module)).tag(1)
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                        
                        if selectedTab == 0 {
                            conversationsSection
                        } else {
                            postsSection
                        }
                    }
                }

                // Navigation header flottant par-dessus la bannière
                navigationHeader(community)
                    .padding(.top, MeeshySpacing.sm)

            } else if let error = viewModel.errorMessage {
                EmptyStateView(
                    icon: "exclamationmark.triangle",
                    title: String(localized: "common.error", defaultValue: "Erreur", bundle: .module),
                    subtitle: error,
                    actionLabel: String(localized: "common.retry", defaultValue: "Réessayer", bundle: .module),
                    onAction: { Task { await viewModel.load() } }
                )
            }
        }
        .task {
            await viewModel.load()
            localColor = UserDefaults.standard.string(forKey: "community.color.\(viewModel.communityId)")
            localEmoji = UserDefaults.standard.string(forKey: "community.emoji.\(viewModel.communityId)")
        }
        .alert(String(localized: "community.detail.leave.confirm.title", defaultValue: "Quitter la communaute ?", bundle: .module), isPresented: $showLeaveConfirm) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
            Button(String(localized: "community.detail.leave.button", defaultValue: "Quitter", bundle: .module), role: .destructive) {
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
            Text(String(localized: "community.detail.leave.confirm.message", defaultValue: "Vous ne pourrez plus acceder aux channels de cette communaute.", bundle: .module))
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
                Image(systemName: "chevron.backward")
                    .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                    .background(Color.black.opacity(0.35))
                    .clipShape(Circle())
            }

            Spacer()

            if viewModel.isAdmin {
                Menu {
                    if viewModel.isCreator {
                        Button {
                            showSettings = true
                        } label: {
                            Label(String(localized: "community.detail.menu.settings", defaultValue: "Reglages", bundle: .module), systemImage: "gearshape.fill")
                        }
                    }

                    if !viewModel.isCreator {
                        Button(role: .destructive) {
                            showLeaveConfirm = true
                        } label: {
                            Label(String(localized: "community.detail.menu.leave", defaultValue: "Quitter", bundle: .module), systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                        .background(Color.black.opacity(0.35))
                        .clipShape(Circle())
                }
            } else {
                Button {
                    HapticFeedback.light()
                    // Reagir a la communaute
                } label: {
                    Image(systemName: "heart.fill")
                        .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                        .background(Color.black.opacity(0.35))
                        .clipShape(Circle())
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.xs)
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
                    .padding(.leading, MeeshySpacing.lg)
                    .offset(y: 36)
            }

            // Infos communauté
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                    Text(community.name)
                        .font(.system(size: MeeshyFont.titleSize, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)

                    if let desc = community.description, !desc.isEmpty {
                        Text(desc)
                            .font(.system(size: MeeshyFont.subheadSize, design: .rounded))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(2)
                    }
                }
                .padding(.top, 44)

                Spacer()

                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: community.isPrivate ? "lock.fill" : "globe")
                        .font(.system(size: MeeshyIconSize.xxs))
                    Text(community.isPrivate ? String(localized: "community.privacy.private", defaultValue: "Privee", bundle: .module) : String(localized: "community.privacy.public", defaultValue: "Publique", bundle: .module))
                        .font(.system(size: MeeshyFont.smallSize, weight: .medium))
                }
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.xs)
                .background(theme.backgroundSecondary)
                .clipShape(Capsule())
                .padding(.top, 44)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.lg)
        }
    }

    private func bannerView(_ community: MeeshyCommunity, color: String) -> some View {
        // 3-tier cached banner — same component as the community cards, so a
        // banner already fetched for the carousel/list is reused here instead
        // of re-downloading. Falls back to the derived-colour gradient when
        // no banner is set.
        CachedBannerImage(
            urlString: community.banner,
            fallbackColor: color,
            height: 190
        )
    }

    @ViewBuilder
    private func communityAvatar(_ community: MeeshyCommunity, color: String) -> some View {
        MeeshyAvatar(
            name: community.name,
            context: .custom(72),
            kind: .entity,
            accentColor: color,
            avatarURL: community.avatar
        )
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus)
                .stroke(theme.backgroundPrimary, lineWidth: 3)
        )
    }

    // MARK: - Stats

    @ViewBuilder
    private func statsSection(_ community: MeeshyCommunity) -> some View {
        HStack(spacing: 0) {
            statItem(value: "\(community.memberCount)", label: String(localized: "community.detail.stats.members", defaultValue: "Members", bundle: .module), icon: "person.2.fill")
            Divider().frame(height: 30)
            statItem(value: "\(community.conversationCount)", label: String(localized: "community.detail.stats.channels", defaultValue: "Channels", bundle: .module), icon: "bubble.left.and.bubble.right.fill")
        }
        .padding(.vertical, MeeshySpacing.md)
        .background(theme.backgroundSecondary.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .padding(.horizontal, MeeshySpacing.lg)
    }

    private func statItem(value: String, label: String, icon: String) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: icon)
                    .font(.system(size: MeeshyIconSize.xs))
                    .foregroundColor(MeeshyColors.brandPrimary)
                Text(value)
                    .font(.system(size: MeeshyFont.subtitleSize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }
            Text(label)
                .font(.system(size: MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Actions

    @ViewBuilder
    private func actionsSection(_ community: MeeshyCommunity) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            HStack(spacing: MeeshySpacing.md) {
                actionButton(icon: "person.2.fill", title: String(localized: "community.detail.action.members", defaultValue: "Membres", bundle: .module)) {
                    onOpenMembers?(community.id)
                }

                if viewModel.isMember {
                    actionButton(icon: "person.badge.plus", title: String(localized: "community.detail.action.invite", defaultValue: "Inviter", bundle: .module)) {
                        onInvite?(community.id)
                    }
                }

                if viewModel.isAdmin {
                    actionButton(icon: "plus.bubble.fill", title: String(localized: "community.detail.action.channel", defaultValue: "Channel", bundle: .module)) {
                        showAddChannel = true
                    }
                }
                if viewModel.isCreator {
                    actionButton(icon: "gearshape.fill", title: String(localized: "community.detail.action.settings", defaultValue: "Reglages", bundle: .module)) {
                        showSettings = true
                    }
                } else if !viewModel.isMember {
                    actionButton(icon: "arrow.forward.circle.fill", title: String(localized: "community.detail.action.join", defaultValue: "Rejoindre", bundle: .module)) {
                        Task { await viewModel.joinCommunity() }
                    }
                }
            }

            if viewModel.isMember && !viewModel.isCreator {
                Button {
                    showLeaveConfirm = true
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                        Text(String(localized: "community.detail.leave.label", defaultValue: "Quitter la communaute", bundle: .module))
                    }
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundColor(MeeshyColors.error)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.smPlus)
                    .background(MeeshyColors.error.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.lg)
    }

    private func actionButton(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: icon)
                    .font(.system(size: MeeshyIconSize.lg))
                    .foregroundColor(MeeshyColors.brandPrimary)
                Text(title)
                    .font(.system(size: MeeshyFont.footnoteSize, weight: .medium, design: .rounded))
                    .foregroundColor(theme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md)
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        }
    }

    // MARK: - Conversations

    @ViewBuilder
    private var conversationsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if viewModel.conversations.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "bubble.left.and.bubble.right",
                    title: String(localized: "community.detail.channels.empty.title", defaultValue: "No Channels Yet", bundle: .module),
                    subtitle: String(localized: "community.detail.channels.empty.subtitle", defaultValue: "Conversations will appear here", bundle: .module),
                    actionLabel: String(localized: "community.detail.channels.empty.action", defaultValue: "Créer un Channel", bundle: .module),
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
        .padding(.top, MeeshySpacing.sm)
    }

    @ViewBuilder
    private var postsSection: some View {
        // Placeholder for Community Posts / Stories
        VStack(spacing: MeeshySpacing.sm) {
            // Le libellé + l'action ne sont posés QUE si l'hôte sait créer un
            // post de communauté. `EmptyStateView` masque son bouton quand
            // `onAction` est nil : l'état vide reste informatif au lieu
            // d'exposer un « Créer un post » dont l'action était un `// To do`
            // vide — un bouton qui ne menait nulle part.
            EmptyStateView(
                icon: "photo.on.rectangle.angled",
                title: String(localized: "community.detail.posts.empty.title", defaultValue: "No Posts Yet", bundle: .module),
                subtitle: String(localized: "community.detail.posts.empty.subtitle", defaultValue: "Community feed will appear here", bundle: .module),
                actionLabel: onCreatePost == nil
                    ? nil
                    : String(localized: "community.detail.posts.empty.action", defaultValue: "Créer un post", bundle: .module),
                onAction: onCreatePost
            )
            .frame(height: 200)
        }
        .padding(.top, MeeshySpacing.sm)
    }

    private func conversationRow(_ conversation: APIConversation) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "number")
                .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                .foregroundColor(MeeshyColors.brandPrimary)
                .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                .background(MeeshyColors.brandPrimary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(conversation.title ?? conversation.identifier ?? String(localized: "community.detail.channel.fallbackName", defaultValue: "Channel", bundle: .module))
                    .font(.system(size: MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let desc = conversation.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: MeeshyFont.smallSize, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let count = conversation.memberCount {
                Text("\(count)")
                    .font(.system(size: MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.smPlus)
        .contentShape(Rectangle())
    }
}

// MARK: - ViewModel

@MainActor
final class CommunityDetailViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var community: MeeshyCommunity?
    @Published var conversations: [APIConversation] = []
    @Published var isMember = false
    @Published var isCreator = false
    @Published var isAdmin = false
    @Published var currentUserRole: MemberRole = .member
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

            isAdmin = currentUserRole.hasMinimumRole(.admin) || isCreator

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
                        .tint(MeeshyColors.brandPrimary)
                } else if filtered.isEmpty && !isLoading {
                    emptyState
                } else {
                    conversationList
                }
            }
            .navigationTitle(String(localized: "community.addChannel.title", defaultValue: "Ajouter un channel", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: String(localized: "community.addChannel.search.prompt", defaultValue: "Rechercher une conversation...", bundle: .module))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .module)) { dismiss() }
                }
            }
        }
        .task { await loadConversations() }
        .presentationDetents([.medium, .large])
        .alert(String(localized: "community.addChannel.move.confirm.title", defaultValue: "Deplacer cette conversation ?", bundle: .module), isPresented: $showMoveConfirm) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {
                pendingMoveConversation = nil
            }
            Button(String(localized: "community.addChannel.move.button", defaultValue: "Deplacer", bundle: .module)) {
                if let conv = pendingMoveConversation {
                    Task { await addConversation(conv) }
                }
                pendingMoveConversation = nil
            }
        } message: {
            Text(String(localized: "community.addChannel.move.confirm.message", defaultValue: "Cette conversation appartient deja a une autre communaute. Elle sera deplacee vers celle-ci.", bundle: .module))
        }
    }

    private var emptyState: some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 40))
                .foregroundColor(theme.textMuted)
            Text(searchText.isEmpty ? String(localized: "community.addChannel.empty.noConversations", defaultValue: "Aucune conversation disponible", bundle: .module) : String(localized: "community.addChannel.empty.noResults", defaultValue: "Aucun resultat", bundle: .module))
                .font(.system(size: MeeshyFont.bodySize, weight: .medium, design: .rounded))
                .foregroundColor(theme.textSecondary)
            if searchText.isEmpty {
                Text(String(localized: "community.addChannel.empty.hint", defaultValue: "Creez d'abord une conversation pour l'ajouter ici.", bundle: .module))
                    .font(.system(size: MeeshyFont.subheadSize))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xxxl)
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
                            .tint(MeeshyColors.brandPrimary)
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
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "number")
                .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
                .foregroundColor(MeeshyColors.brandPrimary)
                .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                .background(MeeshyColors.brandPrimary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xs))

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(conversation.title ?? conversation.identifier ?? String(localized: "community.addChannel.conversation.fallbackName", defaultValue: "Conversation", bundle: .module))
                    .font(.system(size: MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: MeeshySpacing.sm) {
                    if let count = conversation.memberCount {
                        Label("\(count)", systemImage: "person.2.fill")
                            .font(.system(size: MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }

                    if conversation.communityId != nil {
                        Label(String(localized: "community.addChannel.otherCommunity", defaultValue: "Autre communaute", bundle: .module), systemImage: "arrow.triangle.swap")
                            .font(.system(size: MeeshyFont.captionSize, weight: .medium))
                            .foregroundColor(MeeshyColors.amber500)
                    }
                }
            }

            Spacer()

            if isAdding == conversation.id {
                ProgressView()
                    .tint(MeeshyColors.brandPrimary)
            } else if conversation.communityId != nil {
                Image(systemName: "arrow.forward.circle.fill")
                    .font(.system(size: MeeshyIconSize.xl))
                    .foregroundColor(MeeshyColors.amber500)
            } else {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: MeeshyIconSize.xl))
                    .foregroundColor(MeeshyColors.brandPrimary)
            }
        }
        .padding(.vertical, MeeshySpacing.xs)
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
