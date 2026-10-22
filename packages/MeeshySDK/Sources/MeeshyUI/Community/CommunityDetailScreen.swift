import SwiftUI
import Combine
import MeeshySDK

public struct CommunityDetailScreen<ViewModel: CommunityDetailModeling, Settings: View, AddChannel: View>: View {
    @ObservedObject private var viewModel: ViewModel
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }
    @Environment(\.dismiss) private var dismiss

    public var onSelectConversation: ((APIConversation) -> Void)? = nil
    public var onOpenSettings: ((MeeshyCommunity) -> Void)? = nil
    public var onOpenMembers: ((String) -> Void)? = nil
    public var onInvite: ((String) -> Void)? = nil
    public var onDismiss: (() -> Void)? = nil
    /// Création d'un post de communauté, fournie par l'hôte. `nil` ⇒ l'état vide
    /// du feed n'affiche AUCUN bouton (plutôt qu'un bouton inerte).
    public var onCreatePost: (() -> Void)? = nil

    private let settingsSheet: (MeeshyCommunity, CommunitySettingsActions) -> Settings
    private let addChannelSheet: (@escaping () -> Void) -> AddChannel

    @State private var showLeaveConfirm = false
    @State private var showAddChannel = false
    @State private var showSettings = false
    @State private var isLeaving = false
    @State private var localColor: String? = nil
    @State private var localEmoji: String? = nil
    @State private var selectedTab: Int = 0 // 0: Channels, 1: Posts

    public init(viewModel: ViewModel,
                onSelectConversation: ((APIConversation) -> Void)? = nil,
                onOpenSettings: ((MeeshyCommunity) -> Void)? = nil,
                onOpenMembers: ((String) -> Void)? = nil,
                onInvite: ((String) -> Void)? = nil,
                onDismiss: (() -> Void)? = nil,
                onCreatePost: (() -> Void)? = nil,
                @ViewBuilder settingsSheet: @escaping (MeeshyCommunity, CommunitySettingsActions) -> Settings,
                @ViewBuilder addChannelSheet: @escaping (@escaping () -> Void) -> AddChannel) {
        self.viewModel = viewModel
        self.onSelectConversation = onSelectConversation
        self.onOpenSettings = onOpenSettings
        self.onOpenMembers = onOpenMembers
        self.onInvite = onInvite
        self.onDismiss = onDismiss
        self.onCreatePost = onCreatePost
        self.settingsSheet = settingsSheet
        self.addChannelSheet = addChannelSheet
    }

    public var body: some View {
        ZStack(alignment: .top) {
            theme.backgroundPrimary.ignoresSafeArea()
            mainContent
        }
        .task {
            await viewModel.load()
            refreshLocalAppearance(communityId: viewModel.communityId)
        }
        .alert(String(localized: "community.detail.leave.confirm.title", defaultValue: "Quitter la communauté ?", bundle: .module), isPresented: $showLeaveConfirm) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
            Button(String(localized: "community.detail.leave.button", defaultValue: "Quitter", bundle: .module), role: .destructive) {
                Task {
                    isLeaving = true
                    await viewModel.leaveCommunity()
                    isLeaving = false
                    dismissHost()
                }
            }
        } message: {
            Text(String(localized: "community.detail.leave.confirm.message", defaultValue: "Vous ne pourrez plus accéder aux channels de cette communauté.", bundle: .module))
        }
        .sheet(isPresented: $showAddChannel) {
            addChannelSheet { Task { await viewModel.load() } }
        }
        .sheet(isPresented: $showSettings) {
            if let community = viewModel.community {
                settingsSheet(community, settingsActions(for: community))
            }
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        if viewModel.isLoading && viewModel.community == nil {
            ProgressView()
                .tint(MeeshyColors.brandPrimary)
        } else if let community = viewModel.community {
            loadedContent(community)
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

    @ViewBuilder
    private func loadedContent(_ community: MeeshyCommunity) -> some View {
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
    }

    private func settingsActions(for community: MeeshyCommunity) -> CommunitySettingsActions {
        CommunitySettingsActions(
            onUpdated: { _ in
                showSettings = false
                refreshLocalAppearance(communityId: community.id)
                Task { await viewModel.load() }
            },
            onDeleted: {
                showSettings = false
                dismissHost()
            },
            onLeft: {
                showSettings = false
                dismissHost()
            }
        )
    }

    private func refreshLocalAppearance(communityId: String) {
        localColor = UserDefaults.standard.string(forKey: "community.color.\(communityId)")
        localEmoji = UserDefaults.standard.string(forKey: "community.emoji.\(communityId)")
    }

    private func dismissHost() {
        if let onDismiss {
            onDismiss()
        } else {
            dismiss()
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
                    .foregroundStyle(Color.white)
                    .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                    .background(Color.black.opacity(0.35))
                    .clipShape(Circle())
                    .meeshyTapTarget()
            }

            Spacer()

            if viewModel.isAdmin {
                Menu {
                    if viewModel.isCreator {
                        Button {
                            showSettings = true
                        } label: {
                            Label(String(localized: "community.detail.menu.settings", defaultValue: "Réglages", bundle: .module), systemImage: "gearshape.fill")
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
                        .foregroundStyle(Color.white)
                        .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                        .background(Color.black.opacity(0.35))
                        .clipShape(Circle())
                        .meeshyTapTarget()
                }
            } else {
                Button {
                    HapticFeedback.light()
                    // Reagir a la communaute
                } label: {
                    Image(systemName: "heart.fill")
                        .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                        .background(Color.black.opacity(0.35))
                        .clipShape(Circle())
                        .meeshyTapTarget()
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.regular))
        .padding(.top, MeeshySpacing.xs - MeeshyTapTarget.inset(forVisualSide: MeeshyControlSize.regular))
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
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                        .foregroundStyle(theme.textPrimary)

                    if let desc = community.description, !desc.isEmpty {
                        Text(desc)
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, design: .rounded))
                            .foregroundStyle(theme.textSecondary)
                            .lineLimit(2)
                    }
                }
                .padding(.top, 44)

                Spacer()

                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: community.isPrivate ? "lock.fill" : "globe")
                        .font(.system(size: MeeshyIconSize.xxs))
                    Text(community.isPrivate ? String(localized: "community.privacy.private", defaultValue: "Privée", bundle: .module) : String(localized: "community.privacy.public", defaultValue: "Publique", bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                }
                .foregroundStyle(theme.textMuted)
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
                    .foregroundStyle(MeeshyColors.brandPrimary)
                Text(value)
                    .font(.system(size: MeeshyFont.subtitleSize, weight: .bold, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
            }
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundStyle(theme.textSecondary)
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
                    actionButton(icon: "gearshape.fill", title: String(localized: "community.detail.action.settings", defaultValue: "Réglages", bundle: .module)) {
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
                        Text(String(localized: "community.detail.leave.label", defaultValue: "Quitter la communauté", bundle: .module))
                    }
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(MeeshyColors.error)
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
                    .foregroundStyle(MeeshyColors.brandPrimary)
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium, design: .rounded))
                    .foregroundStyle(theme.textSecondary)
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
                        Button { onSelectConversation?(conversation) } label: {
                            conversationRow(conversation)
                        }
                        .buttonStyle(MeeshyPointerPlainButtonStyle(shape: .rectangle))

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
                .foregroundStyle(MeeshyColors.brandPrimary)
                .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                .background(MeeshyColors.brandPrimary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(viewModel.conversationTitles[conversation.id] ?? String(localized: "community.detail.channel.fallbackName", defaultValue: "Channel", bundle: .module))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)

                if let desc = conversation.description, !desc.isEmpty {
                    Text(desc)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let count = conversation.memberCount {
                Text("\(count)")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.smPlus)
        .contentShape(Rectangle())
    }
}
