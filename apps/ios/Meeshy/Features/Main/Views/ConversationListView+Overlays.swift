import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from ConversationListView.swift

extension ConversationListView {

    // MARK: - Context Menu
    @ViewBuilder
    func conversationContextMenu(for conversation: Conversation) -> some View {
        // Pin/Unpin
        Button {
            HapticFeedback.medium()
            Task { await conversationViewModel.togglePin(for: conversation.id) }
        } label: {
            Label(
                conversation.userState.isPinned
                    ? String(localized: "context.unpin", defaultValue: "D\u{00e9}s\u{00e9}pingler")
                    : String(localized: "context.pin", defaultValue: "\u{00c9}pingler"),
                systemImage: conversation.userState.isPinned ? "pin.slash.fill" : "pin.fill"
            )
        }

        // Mute/Unmute
        Button {
            HapticFeedback.light()
            Task { await conversationViewModel.toggleMute(for: conversation.id) }
        } label: {
            Label(
                conversation.userState.isMuted
                    ? String(localized: "context.unmute", defaultValue: "R\u{00e9}activer les notifications")
                    : String(localized: "context.mute", defaultValue: "Mettre en silence"),
                systemImage: conversation.userState.isMuted ? "bell.fill" : "bell.slash.fill"
            )
        }

        Divider()

        // Mark as read/unread
        if conversation.userState.unreadCount > 0 {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsRead(conversationId: conversation.id) }
            } label: {
                Label(String(localized: "context.mark_read", defaultValue: "Marquer comme lu"), systemImage: "envelope.open.fill")
            }
        } else {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsUnread(conversationId: conversation.id) }
            } label: {
                Label(String(localized: "context.mark_unread", defaultValue: "Marquer comme non lu"), systemImage: "envelope.badge.fill")
            }
        }

        // Détails (configuration de la conversation)
        Button {
            HapticFeedback.light()
            conversationInfoConversation = conversation
        } label: {
            Label(String(localized: "context.details", defaultValue: "Détails"), systemImage: "info.circle.fill")
        }

        // Inviter — ouvrir le sheet d'invitation si droits suffisants
        if canCreateShareLink(for: conversation) {
            Button {
                HapticFeedback.medium()
                inviteSheetConversation = conversation
            } label: {
                Label(String(localized: "context.invite_friends", defaultValue: "Inviter mes amis"), systemImage: "person.badge.plus")
            }
        }

        // Favorite with emoji
        Menu {
            ForEach(["⭐️", "❤️", "🔥", "💎", "🎯", "✨", "🏆", "💡"], id: \.self) { emoji in
                Button {
                    HapticFeedback.light()
                    Task { await conversationViewModel.setFavoriteReaction(conversationId: conversation.id, emoji: emoji) }
                } label: {
                    Text(emoji)
                }
            }
            if conversation.userState.reaction != nil {
                Divider()
                Button(role: .destructive) {
                    HapticFeedback.light()
                    Task { await conversationViewModel.setFavoriteReaction(conversationId: conversation.id, emoji: nil) }
                } label: {
                    Label(String(localized: "context.remove_favorite", defaultValue: "Retirer le favori"), systemImage: "star.slash")
                }
            }
        } label: {
            Label(
                conversation.userState.reaction != nil
                    ? String(localized: "context.favorite_active", defaultValue: "Favori \(conversation.userState.reaction!)")
                    : String(localized: "context.favorite", defaultValue: "Favori"),
                systemImage: conversation.userState.reaction != nil ? "star.fill" : "star"
            )
        }

        Divider()

        // Move to category
        Menu {
            ForEach(conversationViewModel.userCategories) { category in
                let isCurrentCategory = conversation.userState.sectionId == category.id
                Button {
                    HapticFeedback.light()
                    if isCurrentCategory {
                        conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: "")
                    } else {
                        conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: category.id)
                    }
                } label: {
                    if isCurrentCategory {
                        Label("\(category.name) \u{2713}", systemImage: category.icon)
                    } else {
                        Label(category.name, systemImage: category.icon)
                    }
                }
            }
            if !conversationViewModel.userCategories.isEmpty {
                Divider()
            }
            Button {
                HapticFeedback.light()
                conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: "")
            } label: {
                Label(String(localized: "context.my_conversations", defaultValue: "Mes conversations"), systemImage: "tray.fill")
            }
        } label: {
            Label(String(localized: "context.move_to", defaultValue: "D\u{00e9}placer vers..."), systemImage: "folder.fill")
        }

        // Lock/Unlock
        let isLockedCtx = ConversationLockManager.shared.isLocked(conversation.id)
        Button {
            HapticFeedback.medium()
            if isLockedCtx {
                lockSheetMode = .unlockConversation
                lockSheetConversation = conversation
            } else if ConversationLockManager.shared.masterPinConfigured {
                lockSheetMode = .lockConversation
                lockSheetConversation = conversation
            } else {
                showNoMasterPinAlert = true
            }
        } label: {
            Label(
                isLockedCtx
                    ? String(localized: "context.unlock", defaultValue: "Déverrouiller")
                    : String(localized: "context.lock", defaultValue: "Verrouiller"),
                systemImage: isLockedCtx ? "lock.open.fill" : "lock.fill"
            )
        }

        // Archive / Unarchive — always offered so an archived conversation can
        // always be unarchived (including blocked DMs, which previously hid this
        // button and left them stuck in the Archived filter).
        // Per-user archive state — same source the list filter (`.archived`) and
        // the `.setArchived` mutation read. NOT `conversation.isActive`, which is
        // the server-side conversation lifecycle flag and is never toggled by
        // archiving. `userState.isArchived` is folded into `renderFingerprint`,
        // so the row re-evaluates and this closure stays fresh.
        let isArchivedConv = conversation.userState.isArchived
        Button {
            HapticFeedback.medium()
            if isArchivedConv {
                Task { await conversationViewModel.unarchiveConversation(conversationId: conversation.id) }
            } else {
                Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
            }
        } label: {
            Label(
                isArchivedConv
                    ? String(localized: "context.unarchive", defaultValue: "Désarchiver")
                    : String(localized: "context.archive", defaultValue: "Archiver"),
                systemImage: isArchivedConv ? "tray.and.arrow.up.fill" : "archivebox.fill"
            )
        }

        Divider()

        // Block / Unblock (DM only)
        if conversation.type == .direct, let userId = conversation.participantUserId {
            let isBlockedCtx = BlockService.shared.isBlocked(userId: userId)
            if isBlockedCtx {
                Button {
                    HapticFeedback.heavy()
                    Task {
                        try? await BlockService.shared.unblockUser(userId: userId)
                        await MainActor.run { HapticFeedback.success() }
                    }
                } label: {
                    Label(
                        String(localized: "context.unblock", defaultValue: "Débloquer"),
                        systemImage: "hand.raised.slash.fill"
                    )
                }
            } else {
                Button(role: .destructive) {
                    HapticFeedback.heavy()
                    blockTargetConversation = conversation
                    showBlockConfirmation = true
                } label: {
                    Label(
                        String(localized: "context.block", defaultValue: "Bloquer"),
                        systemImage: "hand.raised.fill"
                    )
                }
            }
        }

        // Delete (destructive -- soft delete for user only)
        Button(role: .destructive) {
            HapticFeedback.heavy()
            Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
        } label: {
            Label(String(localized: "context.delete", defaultValue: "Supprimer"), systemImage: "trash.fill")
        }
    }
}

// MARK: - Header Overlay
// Extracted into a dedicated View struct so the deeply-nested collapsible
// header no longer composes into ConversationListView.body's type. That
// monolithic type was the root cause of a Swift type-metadata instantiation
// crash at launch on low-memory devices (iPhone XR / iOS 17.6).
struct ConversationListHeaderOverlay: View {
    let scrollOffset: CGFloat
    let iPadFeedAction: (() -> Void)?
    let iPadNotificationCount: Int
    let onNotificationsTap: (() -> Void)?
    let onSettingsTap: (() -> Void)?
    let onNewConversation: (() -> Void)?
    @Binding var showShareLinkSheet: Bool
    /// Compact story trail injected into the header's accessory slot (rendered
    /// below the title/actions bar, inside the same header surface).
    var accessory: (() -> AnyView)? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        CollapsibleHeader(
            title: "Meeshy Chats",
            scrollOffset: scrollOffset,
            showBackButton: false,
            titleColor: theme.textPrimary,
            backArrowColor: MeeshyColors.indigo500,
            backgroundColor: theme.backgroundPrimary,
            leading: {
                if let iPadFeedAction {
                    Button {
                        HapticFeedback.light()
                        iPadFeedAction()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "square.stack.fill")
                                .font(MeeshyFont.relative(13, weight: .semibold))
                            Text(String(localized: "conversation.list.feed", defaultValue: "Feed", bundle: .main))
                                .font(MeeshyFont.relative(13, weight: .semibold))
                        }
                        .foregroundStyle(
                            LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                        )
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.indigo100.opacity(theme.mode.isDark ? 0.15 : 1))
                        )
                    }
                }
            },
            titleView: {
                Text("Meeshy Chats")
                    .font(MeeshyFont.relative(28, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                    )
            },
            trailing: {
                HStack(spacing: 12) {
                    // iOS 26 Liquid Glass for the two primary actions (share link +
                    // new conversation), grouped so the glass circles blend. Gating/
                    // fallback owned by the SDK Compatibility wrappers.
                    AdaptiveGlassContainer(spacing: 10) {
                        HStack(spacing: 12) {
                            Button {
                                showShareLinkSheet = true
                            } label: {
                                Image(systemName: "link.badge.plus")
                                    .font(MeeshyFont.relative(18, weight: .semibold))
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .frame(width: 40, height: 40)
                                    .adaptiveGlass(in: Circle(), interactive: true)
                            }
                            .accessibilityLabel(String(localized: "conversation.list.create_share_link", defaultValue: "Creer un lien de partage", bundle: .main))

                            Button {
                                onNewConversation?()
                            } label: {
                                Image(systemName: "plus")
                                    .font(MeeshyFont.relative(18, weight: .bold))
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .frame(width: 40, height: 40)
                                    .adaptiveGlass(in: Circle(), interactive: true)
                            }
                            .accessibilityLabel(String(localized: "conversation.list.new_conversation", defaultValue: "Nouvelle conversation", bundle: .main))
                        }
                    }

                    if let onNotificationsTap {
                        Button {
                            HapticFeedback.light()
                            onNotificationsTap()
                        } label: {
                            ZStack(alignment: .topTrailing) {
                                Image(systemName: "bell.fill")
                                    .font(MeeshyFont.relative(18, weight: .semibold))
                                    .foregroundColor(MeeshyColors.indigo500)

                                if iPadNotificationCount > 0 {
                                    Text("\(min(iPadNotificationCount, 99))")
                                        .font(MeeshyFont.relative(9, weight: .bold))
                                        .foregroundColor(.white)
                                        .frame(width: 16, height: 16)
                                        .background(Circle().fill(MeeshyColors.error))
                                        .offset(x: 6, y: -6)
                                }
                            }
                        }
                        .accessibilityLabel(String(localized: "conversation.list.notifications", defaultValue: "Notifications", bundle: .main))
                    }

                    if let onSettingsTap {
                        Button {
                            HapticFeedback.light()
                            onSettingsTap()
                        } label: {
                            Image(systemName: "gearshape.fill")
                                .font(MeeshyFont.relative(18, weight: .semibold))
                                .foregroundColor(MeeshyColors.indigo500)
                        }
                        .accessibilityLabel(String(localized: "conversation.list.settings", defaultValue: "Reglages", bundle: .main))
                    }
                }
            },
            accessory: accessory
        )
    }
}

// MARK: - Bottom Bar Overlay
// Search bar + communities carousel + category filters. Extracted into its
// own View struct for the same type-complexity reason as the header. Owns
// its `searchBounce` animation state locally.
struct ConversationListBottomBar: View {
    @Binding var showSearchOverlay: Bool
    var isSearching: FocusState<Bool>.Binding
    @Binding var showWidgetPreview: Bool
    @Binding var showGlobalSearch: Bool
    let userCommunities: [MeeshyCommunity]

    @EnvironmentObject var conversationViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router

    @State private var searchBounce = false

    private var theme: ThemeManager { ThemeManager.shared }
    private var isActive: Bool { isSearching.wrappedValue || showSearchOverlay }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Communities carousel + category filters — shown together inside
            // a glass panel when the search overlay is open (loupe tap). The
            // `.ultraThinMaterial` fill adapts to dark/light automatically and
            // keeps the conversation list behind it legible; the theme-aware
            // `inputBorder` stroke defines the panel edge in both modes.
            if showSearchOverlay {
                VStack(spacing: 0) {
                    communitiesSection
                        .padding(.vertical, 10)
                    categoryFilters
                }
                .padding(.top, 6)
                .padding(.bottom, 4)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                        .fill(.ultraThinMaterial)
                        .overlay(
                            RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                                .stroke(theme.inputBorder, lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(0.12), radius: 14, y: 6)
                )
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            // Search bar - always visible (unless scrolled away)
            themedSearchBar
        }
    }

    // MARK: - Communities Section
    private var communitiesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(String(localized: "communities.title", defaultValue: "Communaut\u{00e9}s"))
                    .font(MeeshyFont.relative(16, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo300],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                Spacer()

                HStack(spacing: 12) {
                    Button {
                        router.push(.communityList)
                    } label: {
                        Text(String(localized: "action.see_all", defaultValue: "Voir tout"))
                            .font(MeeshyFont.relative(12, weight: .semibold))
                            .foregroundColor(MeeshyColors.indigo300)
                    }
                    .accessibilityLabel(String(localized: "accessibility.see_all_communities", defaultValue: "Voir toutes les communautes"))

                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showSearchOverlay = false
                        }
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(MeeshyFont.relative(18))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [MeeshyColors.error, MeeshyColors.error.opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    }
                    .accessibilityLabel(String(localized: "accessibility.close_communities", defaultValue: "Fermer les communautes"))
                }
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(userCommunities, id: \.id) { community in
                        ThemedCommunityCard(community: community) {
                            HapticFeedback.light()
                            router.push(.communityDetail(community.id))
                        }
                        .equatable()
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Category Filters
    private var categoryFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(ConversationFilter.allCases) { filter in
                    ThemedFilterChip(
                        title: filter.rawValue,
                        color: filter.color,
                        isSelected: conversationViewModel.selectedFilter == filter
                    ) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            conversationViewModel.selectedFilter = filter
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Themed Search Bar
    private var themedSearchBar: some View {
        HStack(spacing: 12) {
            // Magnifying glass: tappable to toggle search overlay (communities + filters)
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showSearchOverlay.toggle()
                    if showSearchOverlay {
                        isSearching.wrappedValue = true
                    }
                }
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundStyle(
                        isActive ?
                        AnyShapeStyle(LinearGradient(colors: [MeeshyColors.error, MeeshyColors.indigo300], startPoint: .leading, endPoint: .trailing)) :
                        AnyShapeStyle(theme.textMuted)
                    )
                    .scaleEffect(isActive ? 1.15 : 1.0)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isActive)
            }
            .accessibilityLabel(String(localized: "accessibility.search", defaultValue: "Rechercher"))
            .accessibilityHint(String(localized: "accessibility.search.hint", defaultValue: "Ouvre les filtres et la recherche de conversations"))

            TextField(String(localized: "search.placeholder", defaultValue: "Rechercher..."), text: $conversationViewModel.searchText)
                .focused(isSearching)
                .foregroundColor(theme.textPrimary)
                .font(MeeshyFont.relative(15))
                .accessibilityLabel(String(localized: "conversation.list.search_conversations", defaultValue: "Rechercher des conversations", bundle: .main))

            if !conversationViewModel.searchText.isEmpty {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { conversationViewModel.searchText = "" }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(MeeshyColors.error)
                        .scaleEffect(1.0)
                }
                .accessibilityLabel(String(localized: "accessibility.clear_search", defaultValue: "Effacer la recherche"))
                .transition(.scale.combined(with: .opacity))
            }

            // Dashboard / widget button
            Button {
                HapticFeedback.medium()
                showWidgetPreview = true
            } label: {
                Image(systemName: "square.grid.2x2")
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.warning, MeeshyColors.indigo500],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .accessibilityLabel(String(localized: "accessibility.dashboard", defaultValue: "Tableau de bord"))
            .accessibilityHint(String(localized: "accessibility.dashboard.hint", defaultValue: "Ouvre le tableau de bord avec les widgets"))

            // Global search button
            Button {
                HapticFeedback.medium()
                showGlobalSearch = true
            } label: {
                Image(systemName: "text.magnifyingglass")
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo600, MeeshyColors.indigo300],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .accessibilityLabel(String(localized: "accessibility.global_search", defaultValue: "Recherche globale"))
            .accessibilityHint(String(localized: "accessibility.global_search.hint", defaultValue: "Rechercher dans tous les messages, conversations et utilisateurs"))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            isActive ?
                            AnyShapeStyle(LinearGradient(colors: [MeeshyColors.error, MeeshyColors.indigo300], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(theme.inputBorder),
                            lineWidth: isActive ? 2 : 1
                        )
                )
                .shadow(color: isActive ? MeeshyColors.indigo300.opacity(0.25) : .clear, radius: 12, y: 5)
        )
        .scaleEffect(searchBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: conversationViewModel.searchText.isEmpty)
        .adaptiveOnChange(of: isSearching.wrappedValue) { _, newValue in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                searchBounce = newValue
            }
            if newValue && !showSearchOverlay {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showSearchOverlay = true
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }
}
