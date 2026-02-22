import SwiftUI
import MeeshySDK

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
            Label(conversation.isPinned ? "Désépingler" : "Épingler", systemImage: conversation.isPinned ? "pin.slash.fill" : "pin.fill")
        }

        // Mute/Unmute
        Button {
            HapticFeedback.light()
            Task { await conversationViewModel.toggleMute(for: conversation.id) }
        } label: {
            Label(conversation.isMuted ? "Réactiver les notifications" : "Mettre en silence", systemImage: conversation.isMuted ? "bell.fill" : "bell.slash.fill")
        }

        // Lock/Unlock
        // BACKEND_NEEDED: No lock/unlock endpoint exists. Requires a new conversation
        // preference field (isLocked) and biometric/PIN verification on the client.
        Button {
            HapticFeedback.medium()
        } label: {
            Label("Verrouiller", systemImage: "lock.fill")
        }

        Divider()

        // Mark as read/unread
        if conversation.unreadCount > 0 {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsRead(conversationId: conversation.id) }
            } label: {
                Label("Marquer comme lu", systemImage: "envelope.open.fill")
            }
        } else {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsUnread(conversationId: conversation.id) }
            } label: {
                Label("Marquer comme non lu", systemImage: "envelope.badge.fill")
            }
        }

        // Add reaction
        // REST endpoints now exist: POST/DELETE /conversations/:id/messages/:messageId/reactions
        // TODO: Wire reaction buttons to call the API (requires knowing the last messageId)
        Menu {
            ForEach(["❤️", "👍", "😂", "😮", "😢", "🔥", "🎉", "💯"], id: \.self) { emoji in
                Button {
                    HapticFeedback.light()
                } label: {
                    Text(emoji)
                }
            }
        } label: {
            Label("Réagir", systemImage: "face.smiling.fill")
        }

        Divider()

        // Move to section
        // BACKEND_NEEDED: Section/category mapping between iOS sectionId and backend
        // categoryId is not yet aligned. Local-only for now.
        Menu {
            ForEach(ConversationSection.allSections.filter { $0.id != "pinned" }) { section in
                Button {
                    HapticFeedback.light()
                    conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: section.id)
                } label: {
                    Label(section.name, systemImage: section.icon)
                }
            }
        } label: {
            Label("Déplacer vers...", systemImage: "folder.fill")
        }

        // Archive
        Button {
            HapticFeedback.medium()
            Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
        } label: {
            Label("Archiver", systemImage: "archivebox.fill")
        }

        Divider()

        // Block (destructive style)
        // BACKEND_NEEDED: No block user/conversation endpoint exists yet.
        // Requires a new blocking system with user-level block list.
        Button(role: .destructive) {
            HapticFeedback.heavy()
        } label: {
            Label("Bloquer", systemImage: "hand.raised.fill")
        }

        // Delete (destructive)
        Button(role: .destructive) {
            HapticFeedback.heavy()
            Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
        } label: {
            Label("Supprimer", systemImage: "trash.fill")
        }
    }

    // MARK: - Communities Section
    var communitiesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Communautés")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                Spacer()

                HStack(spacing: 12) {
                    Button {} label: {
                        Text("Voir tout")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: "4ECDC4"))
                    }

                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            isSearching = false
                        }
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color(hex: "FF6B6B"), Color(hex: "FF6B6B").opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    }
                }
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(SampleData.communities.enumerated()), id: \.element.id) { index, community in
                        ThemedCommunityCard(community: community)
                            .staggeredAppear(index: index, baseDelay: 0.06)
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
    var themedSearchBar: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(
                    isSearching ?
                    AnyShapeStyle(LinearGradient(colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")], startPoint: .leading, endPoint: .trailing)) :
                    AnyShapeStyle(theme.textMuted)
                )
                .scaleEffect(isSearching ? 1.15 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isSearching)

            TextField("Rechercher...", text: $searchText)
                .focused($isSearching)
                .foregroundColor(theme.textPrimary)
                .font(.system(size: 15))

            if !searchText.isEmpty {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { searchText = "" }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(Color(hex: "FF6B6B"))
                        .scaleEffect(1.0)
                }
                .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            isSearching ?
                            AnyShapeStyle(LinearGradient(colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(theme.inputBorder),
                            lineWidth: isSearching ? 2 : 1
                        )
                )
                .shadow(color: isSearching ? Color(hex: "4ECDC4").opacity(0.25) : .clear, radius: 12, y: 5)
        )
        .scaleEffect(searchBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: searchText.isEmpty)
        .onChange(of: isSearching) { newValue in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                searchBounce = newValue
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }
}
