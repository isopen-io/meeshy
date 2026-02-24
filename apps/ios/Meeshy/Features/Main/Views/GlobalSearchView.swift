import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Global Search View

struct GlobalSearchView: View {
    @StateObject private var viewModel = GlobalSearchViewModel()
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isSearchFieldFocused: Bool

    // Profile sheet
    @State private var selectedProfileUser: ProfileSheetUser?

    var body: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 0) {
                headerBar
                tabBar
                resultsList
            }
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                isSearchFieldFocused = true
            }
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(user: user)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(spacing: 12) {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }
            .accessibilityLabel("Retour")

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.coral, MeeshyColors.teal],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )

                TextField("Rechercher partout...", text: $viewModel.searchText)
                    .focused($isSearchFieldFocused)
                    .foregroundColor(theme.textPrimary)
                    .font(.system(size: 15))
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit {
                        let trimmed = viewModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            viewModel.addToRecentSearches(trimmed)
                        }
                    }

                if !viewModel.searchText.isEmpty {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            viewModel.searchText = ""
                        }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(MeeshyColors.coral)
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(
                                LinearGradient(
                                    colors: [MeeshyColors.coral.opacity(0.4), MeeshyColors.teal.opacity(0.4)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                ),
                                lineWidth: 1
                            )
                    )
            )
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(SearchTab.allCases) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func tabButton(_ tab: SearchTab) -> some View {
        let isSelected = viewModel.selectedTab == tab
        let count = tabCount(for: tab)

        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                viewModel.selectedTab = tab
            }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: tab.icon)
                        .font(.system(size: 12, weight: .medium))
                    Text(tab.rawValue)
                        .font(.system(size: 13, weight: isSelected ? .bold : .medium))
                    if count > 0 {
                        Text("\(count)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(
                                Capsule()
                                    .fill(
                                        LinearGradient(
                                            colors: [MeeshyColors.coral, MeeshyColors.teal],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                            )
                    }
                }
                .foregroundColor(isSelected ? theme.textPrimary : theme.textMuted)

                Rectangle()
                    .fill(
                        isSelected ?
                        AnyShapeStyle(LinearGradient(
                            colors: [MeeshyColors.coral, MeeshyColors.teal],
                            startPoint: .leading,
                            endPoint: .trailing
                        )) :
                        AnyShapeStyle(Color.clear)
                    )
                    .frame(height: 2)
                    .cornerRadius(1)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("\(tab.rawValue), \(count) resultats")
    }

    private func tabCount(for tab: SearchTab) -> Int {
        switch tab {
        case .messages: return viewModel.messageCount
        case .conversations: return viewModel.conversationCount
        case .users: return viewModel.userCount
        }
    }

    // MARK: - Results List

    private var resultsList: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 8) {
                if viewModel.isSearching {
                    searchingIndicator
                } else if viewModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 {
                    recentSearchesSection
                } else if viewModel.hasSearched && tabCount(for: viewModel.selectedTab) == 0 {
                    emptyResultsView
                } else {
                    switch viewModel.selectedTab {
                    case .messages:
                        messagesResultsList
                    case .conversations:
                        conversationsResultsList
                    case .users:
                        usersResultsList
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 120)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: - Searching Indicator

    private var searchingIndicator: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 60)
            ProgressView()
                .tint(MeeshyColors.cyan)
                .scaleEffect(1.2)
            Text("Recherche en cours...")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Empty Results

    private var emptyResultsView: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 40)
            Image(systemName: "magnifyingglass")
                .font(.system(size: 40))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.coral.opacity(0.5), MeeshyColors.teal.opacity(0.5)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            Text("Aucun resultat")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(theme.textPrimary)
            Text("Essayez avec d'autres termes de recherche")
                .font(.system(size: 13))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    // MARK: - Recent Searches

    private var recentSearchesSection: some View {
        Group {
            if !viewModel.recentSearches.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [MeeshyColors.coral, MeeshyColors.teal],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                        Text("Recherches recentes")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(theme.textPrimary)

                        Spacer()

                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                viewModel.clearRecentSearches()
                            }
                            HapticFeedback.light()
                        } label: {
                            Text("Effacer")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(MeeshyColors.coral)
                        }
                    }
                    .padding(.horizontal, 4)

                    ForEach(viewModel.recentSearches, id: \.self) { query in
                        recentSearchRow(query)
                    }
                }
                .padding(.top, 8)
            } else {
                VStack(spacing: 16) {
                    Spacer().frame(height: 60)
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 40))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [MeeshyColors.coral.opacity(0.3), MeeshyColors.teal.opacity(0.3)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Text("Rechercher dans Meeshy")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                    Text("Messages, conversations, utilisateurs")
                        .font(.system(size: 13))
                        .foregroundColor(theme.textMuted)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func recentSearchRow(_ query: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "clock")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)

            Text(query)
                .font(.system(size: 14))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)

            Spacer()

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    viewModel.removeRecentSearch(query)
                }
                HapticFeedback.light()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(.ultraThinMaterial)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            viewModel.searchText = query
            viewModel.addToRecentSearches(query)
            HapticFeedback.light()
        }
    }

    // MARK: - Messages Results

    private var messagesResultsList: some View {
        ForEach(Array(viewModel.messageResults.enumerated()), id: \.element.id) { index, result in
            messageResultRow(result)
                .staggeredAppear(index: index, baseDelay: 0.03)
                .onTapGesture {
                    handleMessageTap(result)
                }
        }
    }

    private func messageResultRow(_ result: GlobalSearchMessageResult) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: result.conversationName,
                mode: .messageBubble,
                avatarURL: result.conversationAvatar
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(result.conversationName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    Text(formatTimeAgo(result.createdAt))
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }

                Text(result.senderName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(MeeshyColors.teal)
                    .lineLimit(1)

                Text(highlightedText(result.content, query: viewModel.searchText))
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.inputBorder, lineWidth: 0.5)
                )
        )
    }

    // MARK: - Conversations Results

    private var conversationsResultsList: some View {
        ForEach(Array(viewModel.conversationResults.enumerated()), id: \.element.id) { index, result in
            conversationResultRow(result)
                .staggeredAppear(index: index, baseDelay: 0.03)
                .onTapGesture {
                    handleConversationTap(result)
                }
        }
    }

    private func conversationResultRow(_ result: GlobalSearchConversationResult) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: result.name,
                mode: .messageBubble,
                avatarURL: result.avatar
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(result.name)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    if result.unreadCount > 0 {
                        Text("\(result.unreadCount)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(MeeshyColors.coral)
                            )
                    }
                }

                HStack(spacing: 6) {
                    conversationTypeIcon(result.type)
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)

                    Text(conversationTypeLabel(result.type))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)

                    if result.memberCount > 2 {
                        Text("\(result.memberCount) membres")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }
                }

                if let preview = result.lastMessagePreview, !preview.isEmpty {
                    Text(preview)
                        .font(.system(size: 13))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.inputBorder, lineWidth: 0.5)
                )
        )
    }

    // MARK: - Users Results

    private var usersResultsList: some View {
        ForEach(Array(viewModel.userResults.enumerated()), id: \.element.id) { index, result in
            userResultRow(result)
                .staggeredAppear(index: index, baseDelay: 0.03)
                .onTapGesture {
                    handleUserTap(result)
                }
        }
    }

    private func userResultRow(_ result: GlobalSearchUserResult) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: result.displayName ?? result.username,
                mode: .messageBubble,
                avatarURL: result.avatar,
                presenceState: result.isOnline ? .online : .offline
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(result.displayName ?? result.username)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(result.username)")
                    .font(.system(size: 13))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }

            Spacer()

            if result.isOnline {
                Text("En ligne")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(MeeshyColors.green)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.inputBorder, lineWidth: 0.5)
                )
        )
    }

    // MARK: - Navigation Handlers

    private func handleMessageTap(_ result: GlobalSearchMessageResult) {
        viewModel.addToRecentSearches(viewModel.searchText)
        HapticFeedback.light()
        dismiss()

        // Find the conversation in the list or create a minimal one for navigation
        if let conv = conversationListViewModel.conversations.first(where: { $0.id == result.conversationId }) {
            router.push(.conversation(conv))
        }
    }

    private func handleConversationTap(_ result: GlobalSearchConversationResult) {
        viewModel.addToRecentSearches(viewModel.searchText)
        HapticFeedback.light()
        dismiss()
        router.push(.conversation(result.conversation))
    }

    private func handleUserTap(_ result: GlobalSearchUserResult) {
        viewModel.addToRecentSearches(viewModel.searchText)
        HapticFeedback.light()
        selectedProfileUser = ProfileSheetUser(
            userId: result.id,
            username: result.username,
            displayName: result.displayName,
            avatarURL: result.avatar
        )
    }

    // MARK: - Helpers

    private func formatTimeAgo(_ date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }

    private func highlightedText(_ text: String, query: String) -> AttributedString {
        var attributed = AttributedString(text)
        if let range = attributed.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) {
            attributed[range].foregroundColor = MeeshyColors.coral
            attributed[range].font = .system(size: 13, weight: .bold)
        }
        return attributed
    }

    private func conversationTypeIcon(_ type: MeeshyConversation.ConversationType) -> Image {
        switch type {
        case .direct: return Image(systemName: "person.fill")
        case .group: return Image(systemName: "person.2.fill")
        case .public, .global: return Image(systemName: "globe")
        case .community: return Image(systemName: "person.3.fill")
        case .channel: return Image(systemName: "megaphone.fill")
        case .bot: return Image(systemName: "cpu.fill")
        }
    }

    private func conversationTypeLabel(_ type: MeeshyConversation.ConversationType) -> String {
        switch type {
        case .direct: return "Direct"
        case .group: return "Groupe"
        case .public: return "Public"
        case .global: return "Global"
        case .community: return "Communaute"
        case .channel: return "Channel"
        case .bot: return "Bot"
        }
    }
}
