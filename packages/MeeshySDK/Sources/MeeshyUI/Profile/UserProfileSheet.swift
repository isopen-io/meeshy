import SwiftUI
import MeeshySDK

// MARK: - User Profile Sheet

public struct UserProfileSheet: View {
    public let user: ProfileSheetUser
    public let conversations: [MeeshyConversation]
    public var isCurrentUser: Bool = false
    public var isBlocked: Bool = false
    public var isBlockedByTarget: Bool = false
    public var isLoading: Bool = false
    public var fullUser: MeeshyUser?
    public var userStats: UserStats?
    public var isLoadingStats: Bool = false
    public var onNavigateToConversation: ((MeeshyConversation) -> Void)?
    public var onSendMessage: (() -> Void)?
    public var onBlock: (() -> Void)?
    public var onUnblock: (() -> Void)?
    public var onConnectionRequest: (() -> Void)?
    public var onDismiss: (() -> Void)?
    public var onLoadStats: (() async -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @State private var selectedTab: ProfileTab = .profile
    @State private var showFullscreenImage = false
    @State private var fullscreenImageURL: String? = nil
    @State private var fullscreenImageFallback: String = ""
    @State private var internalFullUser: MeeshyUser?
    @State private var internalUserStats: UserStats?
    @State private var internalConversations: [MeeshyConversation] = []
    @State private var internalIsLoading = false
    @State private var internalIsLoadingStats = false
    @State private var internalIsLoadingConversations = false

    public init(
        user: ProfileSheetUser,
        conversations: [MeeshyConversation] = [],
        isCurrentUser: Bool = false,
        isBlocked: Bool = false,
        isBlockedByTarget: Bool = false,
        isLoading: Bool = false,
        fullUser: MeeshyUser? = nil,
        userStats: UserStats? = nil,
        isLoadingStats: Bool = false,
        onNavigateToConversation: ((MeeshyConversation) -> Void)? = nil,
        onSendMessage: (() -> Void)? = nil,
        onBlock: (() -> Void)? = nil,
        onUnblock: (() -> Void)? = nil,
        onConnectionRequest: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onLoadStats: (() async -> Void)? = nil
    ) {
        self.user = user
        self.conversations = conversations
        self.isCurrentUser = isCurrentUser
        self.isBlocked = isBlocked
        self.isBlockedByTarget = isBlockedByTarget
        self.isLoading = isLoading
        self.fullUser = fullUser
        self.userStats = userStats
        self.isLoadingStats = isLoadingStats
        self.onNavigateToConversation = onNavigateToConversation
        self.onSendMessage = onSendMessage
        self.onBlock = onBlock
        self.onUnblock = onUnblock
        self.onConnectionRequest = onConnectionRequest
        self.onDismiss = onDismiss
        self.onLoadStats = onLoadStats
    }

    private var resolvedAccent: String {
        user.accentColor
    }

    private var displayUser: ProfileSheetUser {
        // Priorité : fullUser fourni > internalFullUser chargé > user de base
        if let full = fullUser {
            return ProfileSheetUser.from(user: full)
        }
        if let loaded = internalFullUser {
            return ProfileSheetUser.from(user: loaded)
        }
        return user
    }

    private var effectiveIsLoading: Bool {
        isLoading || internalIsLoading
    }

    private var effectiveUserStats: UserStats? {
        userStats ?? internalUserStats
    }

    private var effectiveIsLoadingStats: Bool {
        isLoadingStats || internalIsLoadingStats
    }

    private var effectiveConversations: [MeeshyConversation] {
        conversations.isEmpty ? internalConversations : conversations
    }

    public var body: some View {
        ZStack {
            VStack(spacing: 0) {
                bannerSection
                identitySection
                    .padding(.top, -40)

                if isBlockedByTarget {
                    blockedByTargetCard
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                    Spacer()
                } else if isBlocked {
                    blockedByMeCard
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                    Spacer()
                } else {
                    tabSection
                }
            }
            .background(theme.backgroundPrimary)
            .ignoresSafeArea(edges: .top)

            if showFullscreenImage {
                FullscreenImageView(
                    imageURL: fullscreenImageURL,
                    fallbackText: fullscreenImageFallback,
                    accentColor: resolvedAccent
                )
                .transition(.opacity)
                .zIndex(100)
                .onTapGesture {
                    withAnimation(.easeOut(duration: 0.2)) {
                        showFullscreenImage = false
                    }
                }
            }
        }
    }

    // MARK: - Banner

    private var bannerSection: some View {
        ZStack(alignment: .bottom) {
            if let bannerURL = displayUser.bannerURL, !bannerURL.isEmpty, let url = URL(string: bannerURL) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        defaultBannerGradient
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(height: 130)
                            .clipped()
                            .onTapGesture {
                                openFullscreenImage(url: bannerURL, fallback: displayUser.resolvedDisplayName)
                            }
                    case .failure:
                        defaultBannerGradient
                    @unknown default:
                        defaultBannerGradient
                    }
                }
                .frame(height: 130)
            } else {
                defaultBannerGradient
            }
        }
    }

    private var defaultBannerGradient: some View {
        LinearGradient(
            colors: isBlockedByTarget
                ? [Color.gray.opacity(0.5), Color.gray.opacity(0.3)]
                : [Color(hex: resolvedAccent).opacity(0.6), Color(hex: resolvedAccent).opacity(0.2)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(height: 130)
        .overlay(
            ZStack {
                Circle()
                    .fill(Color(hex: resolvedAccent).opacity(0.15))
                    .frame(width: 200)
                    .offset(x: -80, y: -30)
                Circle()
                    .fill(Color(hex: resolvedAccent).opacity(0.1))
                    .frame(width: 150)
                    .offset(x: 100, y: 20)
            }
        )
        .clipped()
        .onTapGesture {
            openFullscreenImage(url: displayUser.bannerURL, fallback: displayUser.resolvedDisplayName)
        }
    }

    // MARK: - Identity

    private var identitySection: some View {
        VStack(spacing: 6) {
            profileAvatar
                .bounceOnAppear()
                .onTapGesture {
                    openFullscreenImage(url: displayUser.avatarURL, fallback: displayUser.resolvedDisplayName)
                }

            Text(displayUser.resolvedDisplayName)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text("@\(displayUser.username)")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: resolvedAccent))

            if !isBlockedByTarget {
                presenceText
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private var profileAvatar: some View {
        let avatarName = displayUser.resolvedDisplayName
        let showRing = !isBlockedByTarget && !isBlocked

        MeeshyAvatar(
            name: avatarName,
            mode: .custom(80),
            accentColor: isBlockedByTarget ? "888888" : resolvedAccent,
            avatarURL: displayUser.avatarURL,
            storyState: showRing ? .read : .none,
            presenceState: isBlockedByTarget ? .offline : presenceFromUser
        )
    }

    @ViewBuilder
    private var presenceText: some View {
        if displayUser.isOnline == true {
            HStack(spacing: 4) {
                Circle()
                    .fill(Color(hex: "2ECC71"))
                    .frame(width: 8, height: 8)
                Text("En ligne")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "2ECC71"))
            }
        } else if let lastActive = displayUser.lastActiveAt {
            Text(lastActiveText(from: lastActive))
                .font(.system(size: 12))
                .foregroundColor(theme.textMuted)
        }
    }

    private var presenceFromUser: PresenceState {
        displayUser.isOnline == true ? .online : .offline
    }

    // MARK: - Tab Section

    @ViewBuilder
    private var tabSection: some View {
        VStack(spacing: 0) {
            // Tab Picker
            HStack(spacing: 0) {
                ForEach(ProfileTab.allCases, id: \.self) { tab in
                    Button {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            selectedTab = tab
                        }
                    } label: {
                        VStack(spacing: 4) {
                            HStack(spacing: 4) {
                                Image(systemName: tab.icon)
                                    .font(.system(size: 12, weight: .semibold))
                                Text(tab.title)
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(selectedTab == tab ? Color(hex: resolvedAccent) : theme.textMuted)
                            .padding(.vertical, 10)

                            if selectedTab == tab {
                                Rectangle()
                                    .fill(Color(hex: resolvedAccent))
                                    .frame(height: 2)
                            } else {
                                Rectangle()
                                    .fill(Color.clear)
                                    .frame(height: 2)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .background(theme.backgroundPrimary)

            Divider()
                .opacity(0.3)

            // Tab Content
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    if effectiveIsLoading {
                        loadingPlaceholder
                            .padding(.horizontal, 20)
                            .padding(.top, 16)
                    } else {
                        switch selectedTab {
                        case .profile:
                            profileTabContent
                        case .conversations:
                            conversationsTabContent
                        case .stats:
                            statsTabContent
                        }
                    }

                    Spacer(minLength: 40)
                }
                .padding(.top, 16)
            }
        }
        .task {
            // Auto-load full user data if not provided
            await loadDataIfNeeded()
            // Auto-load shared conversations
            await loadConversationsIfNeeded()
        }
    }

    // MARK: - Auto-loading

    private func loadDataIfNeeded() async {
        // Si fullUser déjà fourni, ne rien faire
        guard fullUser == nil, let userId = user.userId else { return }

        // Charger le profil complet
        internalIsLoading = true
        do {
            let fetchedUser = try await UserProfileCacheManager.shared.profile(for: userId)
            internalFullUser = fetchedUser
        } catch {
            // Silent fail - utilisera les données de base
        }
        internalIsLoading = false
    }

    private func loadStatsIfNeeded() async {
        // Si userStats déjà fourni ou onLoadStats fourni, ne rien faire
        guard userStats == nil, onLoadStats == nil, let userId = user.userId else { return }

        // Charger les stats
        internalIsLoadingStats = true
        do {
            let fetchedStats = try await UserProfileCacheManager.shared.stats(for: userId)
            internalUserStats = fetchedStats
        } catch {
            // Silent fail
        }
        internalIsLoadingStats = false
    }

    private func loadConversationsIfNeeded() async {
        // Si conversations déjà fournies, ne rien faire
        guard conversations.isEmpty, let userId = user.userId else { return }

        // Charger les conversations en commun
        internalIsLoadingConversations = true
        do {
            let apiConversations = try await UserProfileCacheManager.shared.sharedConversations(with: userId)
            internalConversations = apiConversations.map { $0.toConversation(currentUserId: "") }
        } catch {
            // Silent fail
        }
        internalIsLoadingConversations = false
    }

    // MARK: - Profile Tab

    @ViewBuilder
    private var profileTabContent: some View {
        VStack(spacing: 16) {
            if let bio = displayUser.bio, !bio.isEmpty {
                bioCard(bio)
                    .padding(.horizontal, 20)
            }

            languagePills
                .padding(.horizontal, 20)

            // Profile completion ring
            if let completionRate = displayUser.profileCompletionRate {
                ProfileCompletionRing(progress: Double(completionRate) / 100.0)
                    .padding(.vertical, 8)
            }

            // Timezone + Country chips
            if displayUser.timezone != nil || displayUser.registrationCountry != nil {
                HStack(spacing: 8) {
                    if let tz = displayUser.timezone {
                        infoChip(icon: "clock.fill", text: tz)
                    }
                    if let country = displayUser.registrationCountry {
                        let countryName = CountryFlag.name(for: country) ?? country
                        let flag = CountryFlag.emoji(for: country)
                        infoChip(icon: flag, text: countryName)
                    }
                }
                .padding(.horizontal, 20)
            }

            // E2EE badge
            if displayUser.hasE2EE {
                e2eeBadge
                    .padding(.horizontal, 20)
            }

            if !isCurrentUser {
                actionButtons
                    .padding(.horizontal, 20)
                    .padding(.top, 4)
            }
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        VStack(spacing: 12) {
            if let onConnectionRequest {
                connectionRequestButton(action: onConnectionRequest)
            }

            // Block button (only if not blocked and callback provided)
            if !isBlocked, let onBlock {
                blockButton(action: onBlock)
            }
        }
    }

    private func blockButton(action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.medium()
            action()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "hand.raised.fill")
                    .font(.system(size: 13, weight: .semibold))
                Text("Bloquer cet utilisateur")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(theme.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(theme.error.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(theme.error.opacity(0.3), lineWidth: 1.5)
            )
        }
        .pressable()
    }

    private func connectionRequestButton(action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.medium()
            action()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.badge.plus.fill")
                    .font(.system(size: 14, weight: .semibold))
                Text("Demande de connexion")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(Color(hex: resolvedAccent))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color(hex: resolvedAccent).opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: resolvedAccent).opacity(0.3), lineWidth: 1.5)
            )
        }
        .pressable()
    }

    // MARK: - Conversations Tab

    @ViewBuilder
    private var conversationsTabContent: some View {
        if effectiveConversations.isEmpty {
            // Empty state: affiche le bouton Send Message
            VStack(spacing: 16) {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 32))
                    .foregroundColor(theme.textMuted.opacity(0.6))

                Text("Aucune conversation en commun")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textMuted)

                if let onSendMessage, !isBlocked, !isBlockedByTarget {
                    sendMessageButton
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
        } else {
            VStack(spacing: 0) {
                // Bouton Send Message en tête si conversations existent
                if let onSendMessage, !isBlocked, !isBlockedByTarget {
                    sendMessageButton
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                        .padding(.bottom, 16)
                }

                ForEach(Array(effectiveConversations.enumerated()), id: \.element.id) { index, conv in
                    Button {
                        HapticFeedback.light()
                        onNavigateToConversation?(conv)
                    } label: {
                        HStack(spacing: 12) {
                            MeeshyAvatar(
                                name: conv.name,
                                mode: .messageBubble,
                                accentColor: conv.accentColor,
                                avatarURL: conv.avatar ?? conv.participantAvatarURL
                            )

                            Text(conv.name)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1)

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(theme.textMuted)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .staggeredAppear(index: index)

                    if index < effectiveConversations.count - 1 {
                        Divider()
                            .padding(.leading, 64)
                            .opacity(0.3)
                    }
                }
            }
        }
    }

    // MARK: - Stats Tab

    @ViewBuilder
    private var statsTabContent: some View {
        VStack(spacing: 12) {
            // Stats de base (toujours visibles)
            if let createdAt = displayUser.createdAt {
                statCard(
                    icon: "calendar",
                    label: "Membre depuis",
                    value: formatRegistrationDate(createdAt)
                )
                .padding(.horizontal, 20)
            }

            // Stats détaillées (si chargées)
            if let stats = effectiveUserStats {
                detailedStatsSection(stats: stats)
            } else if effectiveIsLoadingStats {
                loadingStatsPlaceholder
                    .padding(.horizontal, 20)
            } else {
                // Trigger load on appear
                Color.clear
                    .frame(height: 1)
                    .onAppear {
                        Task {
                            if let onLoadStats {
                                await onLoadStats()
                            } else {
                                await loadStatsIfNeeded()
                            }
                        }
                    }
            }
        }
    }

    @ViewBuilder
    private func detailedStatsSection(stats: UserStats) -> some View {
        VStack(spacing: 12) {
            // Stats cards
            StatsCard(
                icon: "paperplane.fill",
                label: "Messages envoyés",
                value: "\(stats.totalMessages)",
                accentColor: resolvedAccent
            )
            .padding(.horizontal, 20)

            StatsCard(
                icon: "character.book.closed.fill",
                label: "Traductions",
                value: "\(stats.totalTranslations)",
                accentColor: resolvedAccent
            )
            .padding(.horizontal, 20)

            StatsCard(
                icon: "globe",
                label: "Langues utilisées",
                value: "\(stats.languagesUsed)",
                accentColor: resolvedAccent
            )
            .padding(.horizontal, 20)

            StatsCard(
                icon: "calendar.badge.checkmark",
                label: "Jours d'ancienneté",
                value: "\(stats.memberDays)",
                accentColor: resolvedAccent
            )
            .padding(.horizontal, 20)

            // Achievements section
            if !stats.achievements.isEmpty {
                achievementsSection(achievements: stats.achievements)
                    .padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private func achievementsSection(achievements: [Achievement]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Succès")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .padding(.horizontal, 20)

            LazyVGrid(
                columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ],
                spacing: 16
            ) {
                ForEach(Array(achievements.enumerated()), id: \.element.id) { index, achievement in
                    AchievementBadge(achievement: achievement)
                        .staggeredAppear(index: index)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private var loadingStatsPlaceholder: some View {
        VStack(spacing: 12) {
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                    .frame(height: 60)
                    .shimmer()
            }
        }
    }

    private func statCard(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(Color(hex: resolvedAccent))
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)

                Text(value)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()
        }
        .padding(14)
        .background(theme.surfaceGradient(tint: resolvedAccent))
        .glassCard(cornerRadius: 12)
    }

    // MARK: - Bio Card

    private func bioCard(_ bio: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(bio)
                .font(.system(size: 14))
                .foregroundColor(theme.textSecondary)
                .lineLimit(5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(theme.surfaceGradient(tint: resolvedAccent))
        .glassCard(cornerRadius: 16)
    }

    // MARK: - Info Chip

    private func infoChip(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            if icon.count > 1 {
                // Emoji flag
                Text(icon)
                    .font(.system(size: 14))
            } else {
                // SF Symbol
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(hex: resolvedAccent))
            }
            Text(text)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(theme.surface(tint: resolvedAccent, intensity: 0.12))
        .clipShape(Capsule())
        .overlay(
            Capsule().stroke(theme.border(tint: resolvedAccent, intensity: 0.2), lineWidth: 1)
        )
    }

    // MARK: - E2EE Badge

    private var e2eeBadge: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(hex: "2ECC71"))

            Text("Chiffrement de bout en bout activé")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: "2ECC71"))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color(hex: "2ECC71").opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(hex: "2ECC71").opacity(0.3), lineWidth: 1.5)
        )
    }

    // MARK: - Language Pills

    @ViewBuilder
    private var languagePills: some View {
        let sysLang = LanguageDisplay.from(code: displayUser.systemLanguage)
        let regLang = LanguageDisplay.from(code: displayUser.regionalLanguage)

        if sysLang != nil || regLang != nil {
            HStack(spacing: 8) {
                if let lang = sysLang {
                    languagePill(lang)
                }
                if let lang = regLang, lang.code != sysLang?.code {
                    languagePill(lang)
                }
            }
        }
    }

    private func languagePill(_ lang: LanguageDisplay) -> some View {
        HStack(spacing: 4) {
            Text(lang.flag)
                .font(.system(size: 14))
            Text(lang.name)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(theme.surface(tint: resolvedAccent, intensity: 0.12))
        .clipShape(Capsule())
        .overlay(
            Capsule().stroke(theme.border(tint: resolvedAccent, intensity: 0.2), lineWidth: 1)
        )
    }

    // MARK: - Send Message Button

    private var sendMessageButton: some View {
        Button {
            HapticFeedback.medium()
            onSendMessage?()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 14, weight: .semibold))
                Text("Envoyer un message")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [MeeshyColors.pink, MeeshyColors.cyan],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: MeeshyColors.pink.opacity(0.3), radius: 8, y: 4)
        }
        .pressable()
    }

    // MARK: - Loading Placeholder

    private var loadingPlaceholder: some View {
        VStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                .frame(height: 60)
                .shimmer()

            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 20)
                    .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                    .frame(width: 80, height: 30)
                RoundedRectangle(cornerRadius: 20)
                    .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                    .frame(width: 80, height: 30)
            }
            .shimmer()
        }
    }

    // MARK: - Blocked By Target

    private var blockedByTargetCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "lock.fill")
                .font(.system(size: 20))
                .foregroundColor(theme.error)

            Text("Profil restreint")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text("Cet utilisateur a restreint l'acces a son profil.")
                .font(.system(size: 13))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(theme.surfaceGradient(tint: "FF6B6B"))
        .glassCard(cornerRadius: 16)
    }

    // MARK: - Blocked By Me

    private var blockedByMeCard: some View {
        VStack(spacing: 12) {
            Text("Vous avez bloque cet utilisateur")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textSecondary)

            Button {
                HapticFeedback.medium()
                onUnblock?()
            } label: {
                Text("Debloquer")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(
                        LinearGradient(
                            colors: [Color(hex: "FF6B6B"), Color(hex: "FF2E63")],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .clipShape(Capsule())
            }
            .pressable()
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(theme.surfaceGradient(tint: "888888"))
        .glassCard(cornerRadius: 16)
    }

    // MARK: - Helpers

    private func lastActiveText(from date: Date) -> String {
        let seconds = Int(-date.timeIntervalSinceNow)
        if seconds < 60 { return "Vu a l'instant" }
        if seconds < 3600 { return "Vu il y a \(seconds / 60)min" }
        if seconds < 86400 { return "Vu il y a \(seconds / 3600)h" }
        return "Vu il y a \(seconds / 86400)j"
    }

    private func formatRegistrationDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: date)
    }

    private func openFullscreenImage(url: String?, fallback: String) {
        fullscreenImageURL = url
        fullscreenImageFallback = fallback
        withAnimation(.easeIn(duration: 0.2)) {
            showFullscreenImage = true
        }
    }
}

// MARK: - Profile Tab Enum

enum ProfileTab: String, CaseIterable {
    case profile = "Profil"
    case conversations = "Conversations"
    case stats = "Stats"

    var title: String { rawValue }

    var icon: String {
        switch self {
        case .profile: return "person.fill"
        case .conversations: return "bubble.left.and.bubble.right.fill"
        case .stats: return "chart.bar.fill"
        }
    }
}
