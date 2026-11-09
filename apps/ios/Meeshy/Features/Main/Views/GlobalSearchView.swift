import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Global Search View

struct GlobalSearchView: View {
    @StateObject private var viewModel = GlobalSearchViewModel()
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.meeshyConversationList) var conversationListViewModel
    @Environment(\.routerCommands) var router
    // Présentée en fullScreenCover : hérite des EnvironmentValues, PAS des
    // EnvironmentObject. Cf. SocialChromeEnvironment.swift.
    @Environment(\.meeshyMoodEmojiResolver) private var moodEmojiResolver
    @Environment(\.meeshyStoryRingResolver) private var storyRingResolver
    @Environment(\.meeshyMoodTapResolver) private var moodTapResolver
    @Environment(\.meeshyStoryViewerPresent) private var presentStoryViewer
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
        .onAppear(after: .milliseconds(100)) { isSearchFieldFocused = true }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: moodEmojiResolver?(user.userId ?? ""),
                onMoodTap: moodTapResolver?(user.userId ?? ""),
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in
                    AnyView(ProfileUserPostsList(userId: uid, onOpenPost: { post in
                        selectedProfileUser = nil
                        router.push(.postDetail(post.id, post))
                    }, onOpenReel: { reel, reels in
                        ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil }
                    }))
                }, dependencies: .live
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
        .withStatusBubble()
        .closesForConversationOpening(.search)
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(spacing: MeeshySpacing.md) {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.backward")
                    .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
            }
            .accessibilityLabel(String(localized: "accessibility.back", defaultValue: "Retour"))

            HStack(spacing: MeeshySpacing.smPlus) {
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
                    .foregroundStyle(theme.textPrimary)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
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
                            .foregroundStyle(MeeshyColors.error)
                    }
                    .accessibilityLabel(String(localized: "accessibility.clear_search", defaultValue: "Effacer la recherche"))
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            // iOS 26+ : champ de recherche en Liquid Glass natif (chrome de
            // contrôle interactif). iOS < 26 : repli `.ultraThinMaterial`. Le
            // liséré dégradé de marque est conservé en overlay au-dessus du verre.
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.xl)
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
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .padding(.bottom, MeeshySpacing.sm)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(SearchTab.allCases) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.xs)
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
            VStack(spacing: MeeshySpacing.xsPlus) {
                HStack(spacing: MeeshySpacing.xs) {
                    // Icon carries the result-count badge in its
                    // top-trailing corner (iOS app-badge convention).
                    // Previously the count rendered as a Text after
                    // the label inside the same HStack, which pushed
                    // long labels like "Conversations" onto a second
                    // line on narrow tabs. Floating the badge as an
                    // overlay keeps the icon + label on a single line
                    // regardless of count width.
                    Image(systemName: tab.icon)
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .medium))
                        .overlay(alignment: .topTrailing) {
                            if count > 0 {
                                Text(NotificationBadge.displayed(count))
                                    // Fixed: micro count-badge positioned via absolute
                                    // .offset/.fixedSize — must not scale with Dynamic Type
                                    // or it clips out of its overlay anchor.
                                    .font(.system(size: 9, weight: NotificationBadge.fontWeight))
                                    .foregroundStyle(Color.white)
                                    .padding(.horizontal, MeeshySpacing.xs)
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
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: isSelected ? .bold : .medium))
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
                    .clipShape(RoundedRectangle(cornerRadius: 1))
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("\(tab.localizedName), \(count) " + String(localized: "accessibility.results", defaultValue: "résultats"))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private func tabCount(for tab: SearchTab) -> Int {
        switch tab {
        case .messages: return viewModel.messageCount
        case .posts: return viewModel.postCount
        case .users: return viewModel.userCount
        }
    }

    // MARK: - Results List

    private var resultsList: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: MeeshySpacing.sm) {
                if viewModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 {
                    recentSearchesSection
                } else if tabCount(for: viewModel.selectedTab) == 0 {
                    emptyTabStateView
                } else {
                    degradedBanner
                    switch viewModel.selectedTab {
                    case .messages:
                        messagesResultsList
                    case .posts:
                        postsResultsList
                    case .users:
                        usersResultsList
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
            .padding(.bottom, 120)
        }
        .scrollDismissesKeyboard(.interactively)
        // L'indicateur de recherche est en SURIMPRESSION, jamais dans le flux :
        // c'est ce qui lui permet de dire « je cherche » sans pousser ni
        // remplacer une seule ligne de la liste servie.
        .overlay(alignment: .top) { revalidationPill }
    }

    // MARK: - Ce qui BLOQUE l'onglet courant

    /// Le motif d'un écran vide QUAND le vide vient d'une panne et non de la
    /// requête. `nil` ⇒ le vide est légitime (« Aucun résultat »). Le MÊME
    /// motif sert deux rendus : plein écran quand il n'y a rien à montrer,
    /// bandeau discret quand des résultats locaux restent servis.
    private var blockingFailure: (icon: String, title: String)? {
        if viewModel.loadState == .offline {
            return ("wifi.slash", String(localized: "connection.offline"))
        }
        if case .error(let message) = viewModel.loadState {
            return ("exclamationmark.arrow.triangle.2.circlepath", message)
        }
        return nil
    }

    @ViewBuilder
    private var emptyTabStateView: some View {
        if viewModel.isSearching {
            searchingIndicator
        } else if let failure = blockingFailure {
            retryStateView(icon: failure.icon, title: failure.title)
        } else if viewModel.hasSearched {
            emptyResultsView
        }
    }

    private func retryStateView(icon: String, title: String) -> some View {
        EmptyStateView(
            icon: icon,
            title: title,
            subtitle: "",
            actionLabel: String(localized: "common.retry"),
            onAction: { Task { await viewModel.retryLastSearch() } }
        )
        .padding(.top, 40)
        .accessibilityElement(children: .contain)
    }

    /// Bandeau posé AU-DESSUS des résultats gardés quand le réseau a échoué
    /// mais que le local a servi : la liste reste lisible, et la panne se dit
    /// quand même. Sans lui, une recherche hors ligne ressemblait trait pour
    /// trait à une recherche complète.
    @ViewBuilder
    private var degradedBanner: some View {
        if let failure = blockingFailure {
            HStack(spacing: MeeshySpacing.smPlus) {
                Image(systemName: failure.icon)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundStyle(MeeshyColors.warning)
                Text(failure.title)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                    .lineLimit(2)
                Spacer(minLength: 8)
                Button(String(localized: "common.retry")) {
                    HapticFeedback.light()
                    Task { await viewModel.retryLastSearch() }
                }
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.md))
            .accessibilityElement(children: .contain)
        }
    }

    // MARK: - Searching Indicator

    /// Indicateur DISCRET de revalidation : une pastille posée au-dessus de la
    /// liste, qui ne prend aucune place dans le flux. Il ne se montre que
    /// lorsqu'une recherche tourne PAR-DESSUS des résultats déjà affichés —
    /// l'état `.loading` (démarrage à froid) garde son indicateur plein écran.
    @ViewBuilder
    private var revalidationPill: some View {
        if viewModel.isRevalidating {
            HStack(spacing: MeeshySpacing.xsPlus) {
                ProgressView()
                    .controlSize(.mini)
                    .tint(MeeshyColors.indigo400)
                Text(String(localized: "search.in_progress", defaultValue: "Recherche en cours..."))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .adaptiveGlass(in: Capsule())
            .padding(.top, MeeshySpacing.xsPlus)
            .transition(.opacity)
            .allowsHitTesting(false)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "accessibility.searching", defaultValue: "Recherche en cours"))
        }
    }

    private var searchingIndicator: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Spacer().frame(height: 60)
            ProgressView()
                .tint(MeeshyColors.indigo400)
                .scaleEffect(1.2)
            Text(String(localized: "search.in_progress", defaultValue: "Recherche en cours..."))
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "accessibility.searching", defaultValue: "Recherche en cours"))
    }

    // MARK: - Empty Results

    private var emptyResultsView: some View {
        EmptyStateView(
            icon: "magnifyingglass",
            title: String(localized: "search.no_results", defaultValue: "Aucun résultat"),
            subtitle: String(localized: "search.try_other_terms", defaultValue: "Essayez avec d'autres termes de recherche")
        )
        .padding(.top, 40)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "search.no_results", defaultValue: "Aucun résultat") + ". " + String(localized: "search.try_other_terms", defaultValue: "Essayez avec d'autres termes de recherche"))
    }

    // MARK: - Recent Searches

    private var recentSearchesSection: some View {
        Group {
            if !viewModel.recentSearches.isEmpty {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    HStack {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [MeeshyColors.error, MeeshyColors.indigo300],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .accessibilityHidden(true)
                        Text(String(localized: "search.recent", defaultValue: "Recherches récentes"))
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold))
                            .foregroundStyle(theme.textPrimary)
                            .accessibilityAddTraits(.isHeader)

                        Spacer()

                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                viewModel.clearRecentSearches()
                            }
                            HapticFeedback.light()
                        } label: {
                            Text(String(localized: "action.clear", defaultValue: "Effacer"))
                                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                                .foregroundStyle(MeeshyColors.error)
                        }
                        .accessibilityLabel(String(localized: "accessibility.clear_recent_searches", defaultValue: "Effacer les recherches récentes"))
                    }
                    .padding(.horizontal, MeeshySpacing.xs)

                    ForEach(viewModel.recentSearches, id: \.self) { query in
                        recentSearchRow(query)
                    }
                }
                .padding(.top, MeeshySpacing.sm)
            } else {
                EmptyStateView(
                    icon: "magnifyingglass",
                    title: String(localized: "search.global.title", defaultValue: "Rechercher dans Meeshy"),
                    subtitle: String(localized: "search.global.subtitle", defaultValue: "Messages, posts, utilisateurs")
                )
                .padding(.top, 60)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "search.global.title", defaultValue: "Rechercher dans Meeshy") + ". " + String(localized: "search.global.subtitle", defaultValue: "Messages, posts, utilisateurs"))
            }
        }
    }

    private func recentSearchRow(_ query: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "clock")
                .font(MeeshyFont.relative(MeeshyIconSize.sm))
                .foregroundStyle(theme.textMuted)
                .accessibilityHidden(true)

            Text(query)
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)

            Spacer()

            Button {
                removeRecentSearch(query)
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundStyle(theme.textMuted)
            }
            // La rangée est un élément VoiceOver combiné (bouton « relancer la
            // recherche ») : le bouton de suppression imbriqué serait absorbé et
            // son action deviendrait injoignable. Masqué ici, ré-exposé via
            // `.accessibilityAction(named:)` sur la rangée (doctrine 183i).
            .accessibilityHidden(true)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(.ultraThinMaterial)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            viewModel.searchText = query
            viewModel.addToRecentSearches(query)
            HapticFeedback.light()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "accessibility.recent_search_label", defaultValue: "Recherche récente") + ": \(query)")
        .accessibilityHint(String(localized: "accessibility.recent_search_hint", defaultValue: "Relance la recherche"))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: Text(String(localized: "accessibility.remove_recent_search", defaultValue: "Supprimer des recherches récentes"))) {
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
            Button {
                handleMessageTap(result)
            } label: {
                MessageSearchResultRow(result: result, highlightedQuery: viewModel.resultsQuery, isDark: theme.mode.isDark)
                    .equatable()
            }
            .buttonStyle(MeeshyPointerButtonStyle())
            .staggeredAppear(index: index, baseDelay: 0.03)
        }
    }

    // MARK: - Posts Results

    private var postsResultsList: some View {
        ForEach(Array(viewModel.postResults.enumerated()), id: \.element.id) { index, result in
            Button {
                handlePostTap(result)
            } label: {
                PostSearchResultRow(result: result, highlightedQuery: viewModel.resultsQuery, isDark: theme.mode.isDark)
                    .equatable()
            }
            .buttonStyle(MeeshyPointerButtonStyle())
            .staggeredAppear(index: index, baseDelay: 0.03)
        }
    }

    // MARK: - Users Results

    private var usersResultsList: some View {
        ForEach(Array(viewModel.userResults.enumerated()), id: \.element.id) { index, result in
            Button {
                viewModel.noteUserResultTapped(result.id, position: index)
                handleUserTap(result)
            } label: {
                liveUserResultRow(result)
            }
            .buttonStyle(MeeshyPointerButtonStyle())
            .staggeredAppear(index: index, baseDelay: 0.03)
        }
    }

    private func liveUserResultRow(_ result: GlobalSearchUserResult) -> some View {
        LivePresence { userResultRow(result) }
    }

    private func userResultRow(_ result: GlobalSearchUserResult) -> some View {
        let presence = PresenceManager.shared.resolvedState(userId: result.id, isOnline: result.isOnline)
        let label = userResultAccessibilityLabel(result, presence: presence)
        return HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: result.displayName ?? result.username,
                context: .userListItem,
                avatarURL: result.avatar,
                storyState: storyRingResolver?(result.id) ?? .none,
                moodEmoji: moodEmojiResolver?(result.id),
                presenceState: presence,
                ring: result.ring,
                onViewStory: {
                    presentStoryViewer?(StoryViewerRequest(
                        id: result.id,
                        startAtFirstUnviewed: true,
                        singleGroup: true
                    ))
                },
                onMoodTap: moodTapResolver?(result.id)
            )

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(result.displayName ?? result.username)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)

                Text("@\(result.username)")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(theme.textMuted)
                    .lineLimit(1)
            }

            Spacer()

            if presence == .online {
                Text(String(localized: "status.online", defaultValue: "En ligne"))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.success)
            }
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(theme.inputBorder, lineWidth: MeeshyBorder.hairline)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityHint(String(localized: "accessibility.view_profile", defaultValue: "Voir le profil"))
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Accessibility Label Helpers

    private func userResultAccessibilityLabel(_ result: GlobalSearchUserResult, presence: PresenceState) -> String {
        let displayName = result.displayName ?? result.username
        var label = "\(displayName), @\(result.username)"
        if presence == .online {
            label += ", " + String(localized: "status.online", defaultValue: "En ligne").lowercased()
        }
        return label
    }

    // MARK: - Navigation Handlers

    private func handleMessageTap(_ result: GlobalSearchMessageResult) {
        viewModel.addToRecentSearches(viewModel.searchText)
        HapticFeedback.light()
        dismiss()

        // Le toucher ouvre la conversation SUR le message (#14619).
        let conversations = conversationListViewModel?.conversations ?? []
        Task { @MainActor in
            await MessageSearchResultOpener.open(result, among: conversations, router: router)
        }
    }

    /// Un toucher ouvre le contenu par SA porte (#14620) : le détail d'un
    /// post, le lecteur de réels sur la suite des réels trouvés, le lecteur de
    /// story par la porte unique des stories nommées.
    private func handlePostTap(_ result: GlobalSearchPostResult) {
        viewModel.addToRecentSearches(viewModel.searchText)
        HapticFeedback.light()
        switch result.kind {
        case .reel:
            let reels = viewModel.postResults.filter { $0.kind == .reel }.map(\.post)
            ProfilePostsOpener.openReel(result.post, in: reels) { dismiss() }
        case .story:
            dismiss()
            DeepLinkRouter.shared.pendingDeepLink = .storyDetail(postId: result.id)
        case .post, .status:
            dismiss()
            router.push(.postDetail(result.id, result.post))
        }
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
}
