import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Global Search View

struct GlobalSearchView: View {
    @StateObject private var viewModel = GlobalSearchViewModel()
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
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
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in
                    AnyView(ProfileUserPostsList(userId: uid, onOpenPost: { post in
                        selectedProfileUser = nil
                        router.push(.postDetail(post.id, post))
                    }, onOpenReel: { reel, reels in
                        ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil }
                    }))
                }
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
        .withStatusBubble()
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(spacing: 12) {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(MeeshyFont.relative(18, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }
            .accessibilityLabel(String(localized: "accessibility.back", defaultValue: "Retour"))

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(MeeshyFont.relative(15, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo300],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .accessibilityHidden(true)

                TextField(String(localized: "search.global.placeholder", defaultValue: "Rechercher partout..."), text: $viewModel.searchText)
                    .focused($isSearchFieldFocused)
                    .foregroundColor(theme.textPrimary)
                    .font(MeeshyFont.relative(15))
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit {
                        let trimmed = viewModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            viewModel.addToRecentSearches(trimmed)
                        }
                    }
                    .accessibilityLabel(String(localized: "accessibility.global_search_field", defaultValue: "Recherche globale"))

                if !viewModel.searchText.isEmpty {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            viewModel.searchText = ""
                        }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(MeeshyColors.error)
                    }
                    .accessibilityLabel(String(localized: "accessibility.clear_search", defaultValue: "Effacer la recherche"))
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            // iOS 26+ : champ de recherche en Liquid Glass natif (chrome de
            // contrôle interactif). iOS < 26 : repli `.ultraThinMaterial`. Le
            // liséré dégradé de marque est conservé en overlay au-dessus du verre.
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(
                        LinearGradient(
                            colors: [MeeshyColors.error.opacity(0.4), MeeshyColors.indigo300.opacity(0.4)],
                            startPoint: .leading,
                            endPoint: .trailing
                        ),
                        lineWidth: 1
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
                    // Icon carries the result-count badge in its
                    // top-trailing corner (iOS app-badge convention).
                    // Previously the count rendered as a Text after
                    // the label inside the same HStack, which pushed
                    // long labels like "Conversations" onto a second
                    // line on narrow tabs. Floating the badge as an
                    // overlay keeps the icon + label on a single line
                    // regardless of count width.
                    Image(systemName: tab.icon)
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .overlay(alignment: .topTrailing) {
                            if count > 0 {
                                Text(count > 99 ? "99+" : "\(count)")
                                    // Fixed: micro count-badge positioned via absolute
                                    // .offset/.fixedSize — must not scale with Dynamic Type
                                    // or it clips out of its overlay anchor.
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(
                                        Capsule()
                                            .fill(
                                                LinearGradient(
                                                    colors: [MeeshyColors.error, MeeshyColors.indigo300],
                                                    startPoint: .leading,
                                                    endPoint: .trailing
                                                )
                                            )
                                    )
                                    .fixedSize()
                                    .offset(x: 10, y: -8)
                            }
                        }
                    Text(tab.localizedName)
                        .font(MeeshyFont.relative(13, weight: isSelected ? .bold : .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
                .foregroundColor(isSelected ? theme.textPrimary : theme.textMuted)

                Rectangle()
                    .fill(
                        isSelected ?
                        AnyShapeStyle(LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo300],
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
        .accessibilityLabel("\(tab.localizedName), \(count) " + String(localized: "accessibility.results", defaultValue: "resultats"))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
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
                .tint(MeeshyColors.indigo400)
                .scaleEffect(1.2)
            Text(String(localized: "search.in_progress", defaultValue: "Recherche en cours..."))
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "accessibility.searching", defaultValue: "Recherche en cours"))
    }

    // MARK: - Empty Results

    private var emptyResultsView: some View {
        EmptyStateView(
            icon: "magnifyingglass",
            title: String(localized: "search.no_results", defaultValue: "Aucun resultat"),
            subtitle: String(localized: "search.try_other_terms", defaultValue: "Essayez avec d'autres termes de recherche")
        )
        .padding(.top, 40)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "search.no_results", defaultValue: "Aucun resultat") + ". " + String(localized: "search.try_other_terms", defaultValue: "Essayez avec d'autres termes de recherche"))
    }

    // MARK: - Recent Searches

    private var recentSearchesSection: some View {
        Group {
            if !viewModel.recentSearches.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [MeeshyColors.error, MeeshyColors.indigo300],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .accessibilityHidden(true)
                        Text(String(localized: "search.recent", defaultValue: "Recherches recentes"))
                            .font(MeeshyFont.relative(14, weight: .bold))
                            .foregroundColor(theme.textPrimary)
                            .accessibilityAddTraits(.isHeader)

                        Spacer()

                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                viewModel.clearRecentSearches()
                            }
                            HapticFeedback.light()
                        } label: {
                            Text(String(localized: "action.clear", defaultValue: "Effacer"))
                                .font(MeeshyFont.relative(12, weight: .semibold))
                                .foregroundColor(MeeshyColors.error)
                        }
                        .accessibilityLabel(String(localized: "accessibility.clear_recent_searches", defaultValue: "Effacer les recherches recentes"))
                    }
                    .padding(.horizontal, 4)

                    ForEach(viewModel.recentSearches, id: \.self) { query in
                        recentSearchRow(query)
                    }
                }
                .padding(.top, 8)
            } else {
                EmptyStateView(
                    icon: "magnifyingglass",
                    title: String(localized: "search.global.title", defaultValue: "Rechercher dans Meeshy"),
                    subtitle: String(localized: "search.global.subtitle", defaultValue: "Messages, conversations, utilisateurs")
                )
                .padding(.top, 60)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "search.global.title", defaultValue: "Rechercher dans Meeshy") + ". " + String(localized: "search.global.subtitle", defaultValue: "Messages, conversations, utilisateurs"))
            }
        }
    }

    private func recentSearchRow(_ query: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "clock")
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            Text(query)
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)

            Spacer()

            Button {
                removeRecentSearch(query)
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            // La rangée est un élément VoiceOver combiné (bouton « relancer la
            // recherche ») : le bouton de suppression imbriqué serait absorbé et
            // son action deviendrait injoignable. Masqué ici, ré-exposé via
            // `.accessibilityAction(named:)` sur la rangée (doctrine 183i).
            .accessibilityHidden(true)
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
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "accessibility.recent_search_label", defaultValue: "Recherche recente") + ": \(query)")
        .accessibilityHint(String(localized: "accessibility.recent_search_hint", defaultValue: "Relance la recherche"))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: Text(String(localized: "accessibility.remove_recent_search", defaultValue: "Supprimer des recherches recentes"))) {
            removeRecentSearch(query)
        }
    }

    private func removeRecentSearch(_ query: String) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            viewModel.removeRecentSearch(query)
        }
        HapticFeedback.light()
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
        let label = messageResultAccessibilityLabel(result)
        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: result.conversationName,
                context: .conversationList,
                avatarURL: result.conversationAvatar
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(result.conversationName)
                        .font(MeeshyFont.relative(14, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    Text(formatTimeAgo(result.createdAt))
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(theme.textMuted)
                }

                Text(result.senderName)
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo300)
                    .lineLimit(1)

                Text(highlightedText(result.content, query: viewModel.resultsQuery))
                    .font(MeeshyFont.relative(13))
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
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityHint(String(localized: "accessibility.opens_conversation", defaultValue: "Ouvre la conversation"))
        .accessibilityAddTraits(.isButton)
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
        let label = conversationResultAccessibilityLabel(result)
        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: result.name,
                context: .conversationList,
                avatarURL: result.avatar
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    ConversationTitleLabel(
                        name: result.name,
                        favoriteEmoji: result.conversation.userState.reaction,
                        font: MeeshyFont.relative(14, weight: .bold),
                        color: theme.textPrimary
                    )

                    Spacer()

                    if result.unreadCount > 0 {
                        Text("\(result.unreadCount)")
                            // Fixed: compact numeric unread badge (iOS convention) —
                            // kept off Dynamic Type so the capsule stays pill-tight.
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(MeeshyColors.error)
                            )
                    }
                }

                HStack(spacing: 6) {
                    conversationTypeIcon(result.type)
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(theme.textMuted)

                    Text(conversationTypeLabel(result.type))
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textMuted)

                    if result.memberCount > 2 {
                        Text("\(result.memberCount) " + String(localized: "unit.members", defaultValue: "membres"))
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)
                    }
                }

                conversationLastMessageLabel(result)
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
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityHint(String(localized: "accessibility.opens_conversation", defaultValue: "Ouvre la conversation"))
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private func conversationLastMessageLabel(_ result: GlobalSearchConversationResult) -> some View {
        switch result.conversation.lastMessageSummaryKind() {
        case .hidden:
            HStack(spacing: 4) {
                Image(systemName: "eye.slash")
                    .font(MeeshyFont.relative(11, weight: .medium))
                Text(String(localized: "conversation.summary.hidden", defaultValue: "1 message caché"))
                    .font(MeeshyFont.relative(13).italic())
            }
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)

        case .viewOnce:
            HStack(spacing: 4) {
                Image(systemName: "flame")
                    .font(MeeshyFont.relative(11, weight: .medium))
                Text(String(localized: "conversation.summary.view_once", defaultValue: "1 message vue unique"))
                    .font(MeeshyFont.relative(13).italic())
            }
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)

        case .expired:
            HStack(spacing: 4) {
                Image(systemName: "timer.badge.xmark")
                    .font(MeeshyFont.relative(11, weight: .medium))
                Text(String(localized: "message.expired", defaultValue: "Message expiré"))
                    .font(MeeshyFont.relative(13).italic())
            }
            .foregroundColor(theme.textSecondary)
            .lineLimit(1)

        case .ephemeralActive, .standard:
            if let preview = result.lastMessagePreview, !preview.isEmpty {
                Text(preview)
                    .font(MeeshyFont.relative(13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
        }
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
        let label = userResultAccessibilityLabel(result)
        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: result.displayName ?? result.username,
                context: .userListItem,
                avatarURL: result.avatar,
                storyState: storyViewModel.storyRingState(forUserId: result.id),
                moodEmoji: statusViewModel.statusForUser(userId: result.id)?.moodEmoji,
                presenceState: PresenceManager.shared.resolvedState(userId: result.id, isOnline: result.isOnline),
                onViewStory: {
                    storyViewerCoordinator.present(StoryViewerRequest(
                        id: result.id,
                        startAtFirstUnviewed: true,
                        singleGroup: true
                    ))
                },
                onMoodTap: statusViewModel.moodTapHandler(for: result.id)
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(result.displayName ?? result.username)
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(result.username)")
                    .font(MeeshyFont.relative(13))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }

            Spacer()

            if result.isOnline {
                Text(String(localized: "status.online", defaultValue: "En ligne"))
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(MeeshyColors.success)
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
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityHint(String(localized: "accessibility.view_profile", defaultValue: "Voir le profil"))
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Accessibility Label Helpers

    private func messageResultAccessibilityLabel(_ result: GlobalSearchMessageResult) -> String {
        let messageFrom = String(localized: "accessibility.message_from", defaultValue: "Message de")
        let inConversation = String(localized: "accessibility.in_conversation", defaultValue: "dans")
        return "\(messageFrom) \(result.senderName) \(inConversation) \(result.conversationName), \(result.content), \(formatTimeAgo(result.createdAt))"
    }

    private func conversationResultAccessibilityLabel(_ result: GlobalSearchConversationResult) -> String {
        let membersUnit = String(localized: "unit.members", defaultValue: "membres")
        let unreadUnit = String(localized: "unit.unread", defaultValue: "non lus")
        let lastMessageLabel = String(localized: "accessibility.last_message", defaultValue: "dernier message")

        var parts = [result.name, conversationTypeLabel(result.type)]
        if result.memberCount > 2 {
            parts.append("\(result.memberCount) \(membersUnit)")
        }
        if result.unreadCount > 0 {
            parts.append("\(result.unreadCount) \(unreadUnit)")
        }
        switch result.conversation.lastMessageSummaryKind() {
        case .hidden:
            parts.append("\(lastMessageLabel): masqué")
        case .viewOnce:
            parts.append("\(lastMessageLabel): vue unique")
        case .expired:
            parts.append("\(lastMessageLabel): expiré")
        case .ephemeralActive, .standard:
            if let preview = result.lastMessagePreview, !preview.isEmpty {
                parts.append("\(lastMessageLabel): \(preview)")
            }
        }
        return parts.joined(separator: ", ")
    }

    private func userResultAccessibilityLabel(_ result: GlobalSearchUserResult) -> String {
        let displayName = result.displayName ?? result.username
        var label = "\(displayName), @\(result.username)"
        if result.isOnline {
            label += ", " + String(localized: "status.online", defaultValue: "En ligne").lowercased()
        }
        return label
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
            attributed[range].foregroundColor = MeeshyColors.error
            attributed[range].font = MeeshyFont.relative(13, weight: .bold)
        }
        return attributed
    }

    private func conversationTypeIcon(_ type: MeeshyConversation.ConversationType) -> Image {
        switch type {
        case .direct: return Image(systemName: "person.fill")
        case .group: return Image(systemName: "person.2.fill")
        case .public, .global: return Image(systemName: "globe")
        case .broadcast: return Image(systemName: "megaphone.fill")
        case .community: return Image(systemName: "person.3.fill")
        case .channel: return Image(systemName: "megaphone.fill")
        case .bot: return Image(systemName: "cpu.fill")
        }
    }

    private func conversationTypeLabel(_ type: MeeshyConversation.ConversationType) -> String {
        switch type {
        case .direct: return String(localized: "conversation.type.direct", defaultValue: "Direct")
        case .group: return String(localized: "conversation.type.group", defaultValue: "Groupe")
        case .public: return String(localized: "conversation.type.public", defaultValue: "Public")
        case .global: return String(localized: "conversation.type.global", defaultValue: "Globale")
        case .community: return String(localized: "conversation.type.community", defaultValue: "Communaute")
        case .channel: return String(localized: "conversation.type.channel", defaultValue: "Channel")
        case .bot: return String(localized: "conversation.type.bot", defaultValue: "Bot")
        case .broadcast: return String(localized: "conversation.type.broadcast", defaultValue: "Communication")
        }
    }
}
