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
                conversation.isPinned
                    ? String(localized: "context.unpin", defaultValue: "D\u{00e9}s\u{00e9}pingler")
                    : String(localized: "context.pin", defaultValue: "\u{00c9}pingler"),
                systemImage: conversation.isPinned ? "pin.slash.fill" : "pin.fill"
            )
        }

        // Mute/Unmute
        Button {
            HapticFeedback.light()
            Task { await conversationViewModel.toggleMute(for: conversation.id) }
        } label: {
            Label(
                conversation.isMuted
                    ? String(localized: "context.unmute", defaultValue: "R\u{00e9}activer les notifications")
                    : String(localized: "context.mute", defaultValue: "Mettre en silence"),
                systemImage: conversation.isMuted ? "bell.fill" : "bell.slash.fill"
            )
        }

        Divider()

        // Mark as read/unread
        if conversation.unreadCount > 0 {
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

        // React to last message
        if let lastMsgId = conversation.lastMessageId {
            Menu {
                ForEach(["❤️", "👍", "😂", "😮", "😢", "🔥", "🎉", "💯"], id: \.self) { emoji in
                    Button {
                        HapticFeedback.light()
                        Task { await conversationViewModel.reactToLastMessage(conversationId: conversation.id, messageId: lastMsgId, emoji: emoji) }
                    } label: {
                        Text(emoji)
                    }
                }
            } label: {
                Label(String(localized: "context.react", defaultValue: "R\u{00e9}agir"), systemImage: "face.smiling.fill")
            }
        }

        Divider()

        // Move to category
        Menu {
            ForEach(conversationViewModel.userCategories) { category in
                let isCurrentCategory = conversation.sectionId == category.id
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
        Button {
            HapticFeedback.medium()
            let isLocked = ConversationLockManager.shared.isLocked(conversation.id)
            lockSheetMode = isLocked ? .removePassword : .setPassword
            lockSheetConversation = conversation
        } label: {
            let isLocked = ConversationLockManager.shared.isLocked(conversation.id)
            Label(
                isLocked
                    ? String(localized: "context.unlock", defaultValue: "D\u{00e9}verrouiller")
                    : String(localized: "context.lock", defaultValue: "Verrouiller"),
                systemImage: isLocked ? "lock.open.fill" : "lock.fill"
            )
        }

        // Archive
        Button {
            HapticFeedback.medium()
            Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
        } label: {
            Label(String(localized: "context.archive", defaultValue: "Archiver"), systemImage: "archivebox.fill")
        }

        Divider()

        // Block (DM only)
        if conversation.type == .direct, conversation.participantUserId != nil {
            Button(role: .destructive) {
                HapticFeedback.heavy()
                blockTargetConversation = conversation
                showBlockConfirmation = true
            } label: {
                Label(String(localized: "context.block", defaultValue: "Bloquer"), systemImage: "hand.raised.fill")
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

    // MARK: - Communities Section
    var communitiesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(String(localized: "communities.title", defaultValue: "Communaut\u{00e9}s"))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.coral, MeeshyColors.teal],
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
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(MeeshyColors.teal)
                    }
                    .accessibilityLabel(String(localized: "accessibility.see_all_communities", defaultValue: "Voir toutes les communautes"))

                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showSearchOverlay = false
                        }
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [MeeshyColors.coral, MeeshyColors.coral.opacity(0.7)],
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
                    ForEach(Array(SampleData.communities.enumerated()), id: \.element.id) { index, community in
                        ThemedCommunityCard(community: community)
                            .staggeredAppear(index: index, baseDelay: 0.06)
                            .onTapGesture {
                                HapticFeedback.light()
                                router.push(.communityDetail(community.id))
                            }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Category Filters
    var categoryFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(ConversationFilter.allCases) { filter in
                    ThemedFilterChip(
                        title: filter.rawValue,
                        color: filter.color,
                        isSelected: selectedFilter == filter
                    ) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            selectedFilter = filter
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Themed Search Bar
    private var isActive: Bool { isSearching || showSearchOverlay }

    var themedSearchBar: some View {
        HStack(spacing: 12) {
            // Magnifying glass: tappable to toggle search overlay (communities + filters)
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showSearchOverlay.toggle()
                    if showSearchOverlay {
                        isSearching = true
                    }
                }
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(
                        isActive ?
                        AnyShapeStyle(LinearGradient(colors: [MeeshyColors.coral, MeeshyColors.teal], startPoint: .leading, endPoint: .trailing)) :
                        AnyShapeStyle(theme.textMuted)
                    )
                    .scaleEffect(isActive ? 1.15 : 1.0)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isActive)
            }
            .accessibilityLabel(String(localized: "accessibility.search", defaultValue: "Rechercher"))
            .accessibilityHint(String(localized: "accessibility.search.hint", defaultValue: "Ouvre les filtres et la recherche de conversations"))

            TextField(String(localized: "search.placeholder", defaultValue: "Rechercher..."), text: $searchText)
                .focused($isSearching)
                .foregroundColor(theme.textPrimary)
                .font(.system(size: 15))
                .accessibilityLabel("Rechercher des conversations")

            if !searchText.isEmpty {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { searchText = "" }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(MeeshyColors.coral)
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
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.orange, MeeshyColors.pink],
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
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.purple, MeeshyColors.teal],
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
                            AnyShapeStyle(LinearGradient(colors: [MeeshyColors.coral, MeeshyColors.teal], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(theme.inputBorder),
                            lineWidth: isActive ? 2 : 1
                        )
                )
                .shadow(color: isActive ? MeeshyColors.teal.opacity(0.25) : .clear, radius: 12, y: 5)
        )
        .scaleEffect(searchBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: searchText.isEmpty)
        .onChange(of: isSearching) { _, newValue in
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
