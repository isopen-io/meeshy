import SwiftUI
import Combine
import MeeshySDK

// MARK: - User Profile Sheet

public enum ConnectionStatus: Equatable, Sendable {
    case none
    case pendingSent(requestId: String)
    case pendingReceived(requestId: String)
    case connected
}

public struct UserProfileSheet: View {
    public let user: ProfileSheetUser
    public var onDismiss: (() -> Void)?
    public var onNavigateToConversation: ((MeeshyConversation) -> Void)?
    public var onSendMessage: (() -> Void)?
    public var moodEmoji: String? = nil
    public var onMoodTap: ((CGPoint) -> Void)? = nil
    /// État réel de l'anneau story de l'utilisateur, fourni par l'app
    /// (paramètre opaque — le SDK n'encode aucune règle produit). `nil`
    /// conserve l'anneau décoratif historique du sheet.
    public var storyRingState: StoryRingState? = nil
    /// Tap sur l'anneau → l'app présente son viewer de story.
    public var onViewStory: (() -> Void)? = nil

    @State var isBlocked: Bool = false
    @State var isBlockedByTarget: Bool = false
    @State var connectionStatus: ConnectionStatus = .none
    @State private var pendingRequestId: String?

    var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    var isCurrentUser: Bool {
        guard !currentUserId.isEmpty else { return false }
        if user.userId == currentUserId { return true }
        if let currentUsername = AuthManager.shared.currentUser?.username,
           user.username == currentUsername { return true }
        return false
    }

    /// Injected by the app (Phase E) to render the rich posts list
    /// (`FeedPostCard`). Param = resolved userId. `nil` (default) keeps the
    /// minimal SDK fallback list so the SDK stays self-contained and the
    /// existing call-sites are unaffected.
    public var postsContent: ((String) -> AnyView)? = nil

    @ObservedObject var theme = ThemeManager.shared
    @Environment(\.dismiss) var dismiss
    @State var selectedTab: ProfileTab = .details
    @State private var showFullscreenImage = false
    @State private var fullscreenImageURL: String? = nil
    @State private var fullscreenImageFallback: String = ""
    @State var showReportSheet = false
    /// Signed scroll offset feeding `ProfileHeaderMetrics.progress`. Negative
    /// while scrolling content down. Updated by the iOS 16-17 preference path
    /// and the iOS 18+ `trackScrollContentOffset` path simultaneously.
    @State var scrollOffset: CGFloat = 0
    @State private var internalFullUser: MeeshyUser?
    @State private var internalUserStats: UserStats?
    @State private var internalConversations: [MeeshyConversation] = []
    @State private var internalIsLoading = false
    @State private var internalIsLoadingStats = false
    @State private var internalIsLoadingConversations = false

    public init(
        user: ProfileSheetUser,
        onDismiss: (() -> Void)? = nil,
        onNavigateToConversation: ((MeeshyConversation) -> Void)? = nil,
        onSendMessage: (() -> Void)? = nil,
        moodEmoji: String? = nil,
        onMoodTap: ((CGPoint) -> Void)? = nil,
        storyRingState: StoryRingState? = nil,
        onViewStory: (() -> Void)? = nil,
        postsContent: ((String) -> AnyView)? = nil
    ) {
        self.user = user
        self.onDismiss = onDismiss
        self.onNavigateToConversation = onNavigateToConversation
        self.onSendMessage = onSendMessage
        self.moodEmoji = moodEmoji
        self.onMoodTap = onMoodTap
        self.storyRingState = storyRingState
        self.onViewStory = onViewStory
        self.postsContent = postsContent
    }

    var resolvedAccent: String {
        user.accentColor
    }

    var displayUser: ProfileSheetUser {
        if let loaded = internalFullUser {
            return ProfileSheetUser.from(user: loaded, accentColor: user.accentColor)
        }
        return user
    }

    var effectiveIsLoading: Bool {
        internalIsLoading
    }

    var effectiveUserStats: UserStats? {
        internalUserStats
    }

    var effectiveIsLoadingStats: Bool {
        internalIsLoadingStats
    }

    var effectiveConversations: [MeeshyConversation] {
        internalConversations
    }

    public var body: some View {
        ZStack {
            if isBlockedByTarget {
                Color.clear.onAppear { onDismiss?(); dismiss() }
            } else if isBlocked {
                blockedLayout
            } else {
                collapsibleLayout
            }

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
        .task {
            await resolveInitialState()
        }
        .onReceive(FriendshipCache.shared.objectWillChange) { _ in
            resolveConnectionStatus()
        }
        .adaptiveWideSheet()
    }

    /// Layout shown when the current user blocked the target — no tabs, just
    /// the (greyed) header + the unblock card, preserving prior behavior.
    @ViewBuilder
    private var blockedLayout: some View {
        VStack(spacing: 0) {
            bannerSection
            identitySection
                .padding(.top, -40)
            blockedByMeCard
                .padding(.horizontal, 20)
                .padding(.top, 16)
            Spacer()
        }
        .background(theme.backgroundPrimary)
        .ignoresSafeArea(edges: .top)
    }

    /// The redesigned single-scroll layout: a big collapsible header scrolls
    /// away while the tab bar pins, with a compact identity bar fading in.
    @ViewBuilder
    private var collapsibleLayout: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                bigCollapsibleHeader

                Section {
                    tabContent
                        .padding(.top, 16)
                } header: {
                    pinnedTabBar
                }

                Color.clear.frame(height: 40)
            }

            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("profileScroll")).minY
                )
            }
            .frame(height: 0)
        }
        .coordinateSpace(name: "profileScroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }
        .trackScrollContentOffset { scrollOffset = -$0 }
        .background(theme.backgroundPrimary)
        .ignoresSafeArea(edges: .top)
        .overlay(alignment: .top) {
            compactPinnedBar
                .opacity(Double(ProfileHeaderMetrics.progress(offset: scrollOffset)))
                .allowsHitTesting(ProfileHeaderMetrics.progress(offset: scrollOffset) > 0.5)
                // Hide the compact identity from VoiceOver while the header is
                // still mostly expanded — the expanded identity is the primary
                // and reads name/@username; avoids a duplicate identity element.
                .accessibilityHidden(ProfileHeaderMetrics.progress(offset: scrollOffset) <= 0.5)
        }
        // Always-on close affordance over the (reduced) banner, top-leading.
        .overlay(alignment: .topLeading) {
            closeButton
        }
        .task {
            await loadDataIfNeeded()
            await loadConversationsIfNeeded()
        }
    }

    /// Tab content switch — each tab content is defined in its own extension
    /// file. Loading placeholder shown only on cold cache.
    @ViewBuilder
    var tabContent: some View {
        if effectiveIsLoading {
            loadingPlaceholder
                .padding(.horizontal, 20)
        } else {
            switch selectedTab {
            case .posts:
                postsTab
            case .conversations:
                conversationsTab
            case .details:
                detailsTab
            }
        }
    }

    // MARK: - Auto-loading

    private func loadDataIfNeeded() async {
        let identifier = user.userId ?? user.username
        guard !identifier.isEmpty else { return }

        let cacheResult = await CacheCoordinator.shared.profiles.load(for: identifier)

        switch cacheResult {
        case .fresh(let cached, _):
            if let profile = cached.first { internalFullUser = profile }
        case .stale(let cached, _):
            if let profile = cached.first { internalFullUser = profile }
            await fetchAndCacheProfile(identifier)
        case .expired, .empty:
            internalIsLoading = internalFullUser == nil
            await fetchAndCacheProfile(identifier)
        }
        // Every profile visit extends the 30-day TTL (cache-first behavior):
        // touch under both the lookup identifier and the resolved id so the
        // entry survives a month of inactivity regardless of which key was used.
        await CacheCoordinator.shared.profiles.touch(for: identifier)
        if let resolvedId = resolvedUserId, resolvedId != identifier {
            await CacheCoordinator.shared.profiles.touch(for: resolvedId)
        }
        resolveConnectionStatus()
    }

    private func fetchAndCacheProfile(_ idOrUsername: String) async {
        defer { internalIsLoading = false }
        do {
            let fetchedUser = try await UserService.shared.getProfile(idOrUsername: idOrUsername)
            internalFullUser = fetchedUser
            UserDisplayNameCache.shared.trackFromUser(fetchedUser)
            // `MeeshyUser.id` is non-optional — save under the resolved id.
            let cacheKey = fetchedUser.id
            try await CacheCoordinator.shared.profiles.save([fetchedUser], for: cacheKey)
            // When opened by username, the lookup key differs from the resolved
            // id. Persist under the username too so a future username-open hits
            // the cache instead of cold-fetching, and touch both keys so the
            // 30-day TTL is extended on the entry that actually holds the data.
            if idOrUsername != cacheKey {
                try? await CacheCoordinator.shared.profiles.save([fetchedUser], for: idOrUsername)
            }
            await CacheCoordinator.shared.profiles.touch(for: cacheKey)
            await SearchIndex.shared.indexUsers([fetchedUser])
        } catch let error as APIError {
            if case .serverError(403, _) = error {
                isBlockedByTarget = true
            }
        } catch {}
    }

    var resolvedUserId: String? {
        user.userId ?? internalFullUser?.id
    }

    func loadStatsIfNeeded() async {
        guard let userId = resolvedUserId else { return }
        internalIsLoadingStats = true
        do {
            let fetchedStats = try await UserService.shared.getUserStats(userId: userId)
            internalUserStats = fetchedStats
        } catch {}
        internalIsLoadingStats = false
    }

    private func loadConversationsIfNeeded() async {
        guard let userId = resolvedUserId else { return }
        internalIsLoadingConversations = true
        do {
            let apiConversations = try await ConversationService.shared.listSharedWith(userId: userId)
            let mapped = apiConversations.map { $0.toConversation(currentUserId: currentUserId) }
            internalConversations = mapped
            // Extend the TTL of the shared conversations we just surfaced so a
            // returning visitor keeps them warm in the conversations cache.
            for conv in mapped {
                await CacheCoordinator.shared.conversations.touch(for: conv.id)
            }
        } catch {}
        internalIsLoadingConversations = false
    }

    // MARK: - State Resolution

    private func resolveInitialState() async {
        guard let userId = resolvedUserId, !userId.isEmpty, userId != currentUserId else { return }
        isBlocked = BlockService.shared.isBlocked(userId: userId)
        resolveConnectionStatus()
    }

    private func resolveConnectionStatus() {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        let status = FriendshipCache.shared.status(for: userId)
        switch status {
        case .friend:
            connectionStatus = .connected
        case .pendingSent(let requestId):
            pendingRequestId = requestId
            connectionStatus = .pendingSent(requestId: requestId)
        case .pendingReceived(let requestId):
            pendingRequestId = requestId
            connectionStatus = .pendingReceived(requestId: requestId)
        case .none:
            connectionStatus = .none
        }
    }

    // MARK: - Toast Helper

    func postToast(_ message: String, isSuccess: Bool) {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"),
            object: nil,
            userInfo: ["message": message, "isSuccess": isSuccess]
        )
    }

    // MARK: - Connection Actions

    func sendConnectionRequest() async {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        do {
            let request = try await FriendService.shared.sendFriendRequest(receiverId: userId)
            FriendshipCache.shared.didSendRequest(to: userId, requestId: request.id)
            pendingRequestId = request.id
            connectionStatus = .pendingSent(requestId: request.id)
            HapticFeedback.success()
            postToast(String(localized: "profile.toast.requestSent", defaultValue: "Demande envoyee", bundle: .module), isSuccess: true)
        } catch {
            HapticFeedback.error()
            postToast(String(localized: "profile.toast.requestSendFailed", defaultValue: "Impossible d'envoyer la demande", bundle: .module), isSuccess: false)
        }
    }

    func cancelRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId else { return }
        FriendshipCache.shared.didCancelRequest(to: userId)
        pendingRequestId = nil
        connectionStatus = .none
        HapticFeedback.medium()
        do {
            try await FriendService.shared.deleteRequest(requestId: requestId)
            postToast(String(localized: "profile.toast.requestCancelled", defaultValue: "Demande annulee", bundle: .module), isSuccess: true)
        } catch {
            FriendshipCache.shared.didSendRequest(to: userId, requestId: requestId)
            resolveConnectionStatus()
            postToast(String(localized: "profile.toast.cancelFailed", defaultValue: "Impossible d'annuler", bundle: .module), isSuccess: false)
        }
    }

    func resendRequest() async {
        if let requestId = pendingRequestId {
            try? await FriendService.shared.deleteRequest(requestId: requestId)
        }
        await sendConnectionRequest()
    }

    func acceptRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId else { return }
        FriendshipCache.shared.didAcceptRequest(from: userId)
        connectionStatus = .connected
        pendingRequestId = nil
        HapticFeedback.success()
        do {
            let _ = try await FriendService.shared.respond(requestId: requestId, accepted: true)
            postToast(String(localized: "profile.toast.connectionAccepted", defaultValue: "Connexion acceptee", bundle: .module), isSuccess: true)
        } catch {
            FriendshipCache.shared.rollbackAccept(senderId: userId, requestId: requestId)
            resolveConnectionStatus()
            HapticFeedback.error()
            postToast(String(localized: "profile.toast.acceptFailed", defaultValue: "Impossible d'accepter", bundle: .module), isSuccess: false)
        }
    }

    func declineRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId else { return }
        FriendshipCache.shared.didRejectRequest(from: userId)
        connectionStatus = .none
        pendingRequestId = nil
        HapticFeedback.medium()
        do {
            let _ = try await FriendService.shared.respond(requestId: requestId, accepted: false)
            postToast(String(localized: "profile.toast.requestDeclined", defaultValue: "Demande refusee", bundle: .module), isSuccess: true)
        } catch {
            FriendshipCache.shared.rollbackReject(senderId: userId, requestId: requestId)
            resolveConnectionStatus()
            HapticFeedback.error()
            postToast(String(localized: "profile.toast.declineFailed", defaultValue: "Impossible de refuser", bundle: .module), isSuccess: false)
        }
    }

    // MARK: - Block Actions

    func blockUser() async {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        do {
            try await BlockService.shared.blockUser(userId: userId)
            isBlocked = true
            HapticFeedback.medium()
            postToast(String(localized: "profile.toast.userBlocked", defaultValue: "Utilisateur bloque", bundle: .module), isSuccess: true)
        } catch {
            postToast(String(localized: "profile.toast.blockFailed", defaultValue: "Impossible de bloquer", bundle: .module), isSuccess: false)
        }
    }

    func unblockUser() async {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        do {
            try await BlockService.shared.unblockUser(userId: userId)
            isBlocked = false
            resolveConnectionStatus()
            HapticFeedback.light()
            postToast(String(localized: "profile.toast.userUnblocked", defaultValue: "Utilisateur debloque", bundle: .module), isSuccess: true)
        } catch {
            postToast(String(localized: "profile.toast.unblockFailed", defaultValue: "Impossible de debloquer", bundle: .module), isSuccess: false)
        }
    }

    // MARK: - Bio Card

    func bioCard(_ bio: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(bio)
                .font(.callout)
                .foregroundColor(theme.textSecondary)
                .lineLimit(5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(theme.surfaceGradient(tint: resolvedAccent))
        .glassCard(cornerRadius: 16)
    }

    // MARK: - Info Chip

    func infoChip(icon: String, text: String) -> some View {
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

    var e2eeBadge: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(MeeshyColors.success)

            Text(String(localized: "profile.e2ee.enabled", defaultValue: "Chiffrement de bout en bout activé", bundle: .module))
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(MeeshyColors.success)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(MeeshyColors.success.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(MeeshyColors.success.opacity(0.3), lineWidth: 1.5)
        )
    }

    // MARK: - Language Pills

    @ViewBuilder
    var languagePills: some View {
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

    func languagePill(_ lang: LanguageDisplay) -> some View {
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

    var sendMessageButton: some View {
        sendMessageButtonContent(compact: false)
    }

    var sendMessageButtonCompact: some View {
        sendMessageButtonContent(compact: true)
    }

    private func sendMessageButtonContent(compact: Bool) -> some View {
        Button {
            HapticFeedback.medium()
            if let onSendMessage {
                onSendMessage()
            } else if let targetUserId = internalFullUser?.id ?? user.userId {
                dismiss()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    NotificationCenter.default.post(
                        name: Notification.Name("sendMessageToUser"),
                        object: targetUserId
                    )
                }
            }
        } label: {
            HStack(spacing: compact ? 6 : 8) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: compact ? 12 : 14, weight: .semibold))
                Text(String(localized: "profile.action.sendMessage", defaultValue: "Envoyer un message", bundle: .module))
                    .font(.system(size: compact ? 13 : 15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: compact ? nil : .infinity)
            .padding(.horizontal, compact ? 20 : 0)
            .padding(.vertical, compact ? 10 : 14)
            .background(
                LinearGradient(
                    colors: [MeeshyColors.indigo500, MeeshyColors.indigo400],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: compact ? 20 : 14))
            .shadow(color: MeeshyColors.indigo500.opacity(0.3), radius: compact ? 4 : 8, y: compact ? 2 : 4)
        }
        .pressable()
    }

    // MARK: - Loading Placeholder

    var loadingPlaceholder: some View {
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

            Text(String(localized: "profile.blocked.restrictedProfile", defaultValue: "Profil restreint", bundle: .module))
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "profile.blocked.restrictedDescription", defaultValue: "Cet utilisateur a restreint l'acces a son profil.", bundle: .module))
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
            Text(String(localized: "profile.blocked.byMe", defaultValue: "Vous avez bloque cet utilisateur", bundle: .module))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textSecondary)

            Button {
                HapticFeedback.medium()
                Task { await unblockUser() }
            } label: {
                Text(String(localized: "profile.blocked.unblock", defaultValue: "Debloquer", bundle: .module))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(
                        LinearGradient(
                            colors: [MeeshyColors.success, MeeshyColors.successDeep],
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
        if seconds < 60 { return String(localized: "profile.presence.justNow", defaultValue: "Vu a l'instant", bundle: .module) }
        if seconds < 3600 { return "Vu il y a \(seconds / 60)min" }
        if seconds < 86400 { return "Vu il y a \(seconds / 3600)h" }
        return "Vu il y a \(seconds / 86400)j"
    }

    func formatRegistrationDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: date)
    }

    func openFullscreenImage(url: String?, fallback: String) {
        fullscreenImageURL = url
        fullscreenImageFallback = fallback
        withAnimation(.easeIn(duration: 0.2)) {
            showFullscreenImage = true
        }
    }
}

// MARK: - Profile Tab Enum

enum ProfileTab: String, CaseIterable {
    case posts, conversations, details

    var title: String {
        switch self {
        case .posts: return String(localized: "profile.tab.posts", defaultValue: "Postes", bundle: .module)
        case .conversations: return String(localized: "profile.tab.conversations", defaultValue: "Conversations", bundle: .module)
        case .details: return String(localized: "profile.tab.details", defaultValue: "Détails", bundle: .module)
        }
    }

    var icon: String {
        switch self {
        case .posts: return "square.text.square.fill"
        case .conversations: return "bubble.left.and.bubble.right.fill"
        case .details: return "person.text.rectangle.fill"
        }
    }
}
