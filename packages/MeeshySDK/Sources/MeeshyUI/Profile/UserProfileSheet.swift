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
    /// Source temps réel de présence injectée par l'app (paramètre opaque —
    /// le SDK n'encode aucune règle produit). Appelée avec le userId résolu ;
    /// retourner `nil` (utilisateur non suivi) fait retomber l'avatar sur le
    /// snapshot REST `isOnline` du profil chargé. `nil` (défaut) conserve le
    /// comportement legacy (snapshot uniquement). Doit pointer vers la MÊME
    /// source que la liste de conversations (PresenceManager côté app) pour
    /// que la pastille du profil reste synchronisée avec celle de la liste.
    public var presenceProvider: ((String) -> PresenceState?)? = nil
    /// État réel de l'anneau story de l'utilisateur, fourni par l'app
    /// (paramètre opaque — le SDK n'encode aucune règle produit). `nil`
    /// conserve l'anneau décoratif historique du sheet.
    public var storyRingState: StoryRingState? = nil
    /// Tap sur l'anneau → l'app présente son viewer de story.
    public var onViewStory: (() -> Void)? = nil
    public var onCall: ((ProfileCallRequest) -> Void)? = nil

    @State var isBlocked: Bool = false
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

    @ResolvedThemePalette var theme
    /// L'emplacement du jeu (#9481) — fourni par l'app, vide sinon.
    @Environment(\.profileGameSection) var gameSection
    @Environment(\.profileLoading) private var injectedProfileLoading
    @Environment(\.dismiss) var dismiss
    @State var selectedTab: ProfileTab = .details
    /// #10093 — la bannière ou la photo ouverte en plein écran, PRÉSENTÉE par-dessus la feuille (`fullScreenCover`) :
    /// posée dans la pile de la feuille, la visionneuse ne pouvait pas déborder de sa hauteur (mi-écran en `.medium`).
    @State private var fullscreenImage: ProfileFullscreenImage?
    @State var showReportSheet = false
    /// Signed scroll offset feeding `ProfileHeaderMetrics.progress`. Negative
    /// while scrolling content down. Updated by the iOS 16-17 preference path
    /// and the iOS 18+ `trackScrollContentOffset` path simultaneously.
    @State var scrollRelay = ScrollOffsetRelay()
    /// #10093 — profil et statistiques : le cache d'abord, la synchronisation dès l'ouverture.
    @StateObject var loader = ProfileSheetLoader()
    @State private var internalConversations: [MeeshyConversation] = []
    @State private var internalIsLoadingConversations = false

    public init(
        user: ProfileSheetUser,
        onDismiss: (() -> Void)? = nil,
        onNavigateToConversation: ((MeeshyConversation) -> Void)? = nil,
        onSendMessage: (() -> Void)? = nil,
        moodEmoji: String? = nil,
        onMoodTap: ((CGPoint) -> Void)? = nil,
        presenceProvider: ((String) -> PresenceState?)? = nil,
        storyRingState: StoryRingState? = nil,
        onViewStory: (() -> Void)? = nil,
        postsContent: ((String) -> AnyView)? = nil,
        onCall: ((ProfileCallRequest) -> Void)? = nil
    ) {
        self.user = user
        self.onDismiss = onDismiss
        self.onNavigateToConversation = onNavigateToConversation
        self.onSendMessage = onSendMessage
        self.moodEmoji = moodEmoji
        self.onMoodTap = onMoodTap
        self.presenceProvider = presenceProvider
        self.storyRingState = storyRingState
        self.onViewStory = onViewStory
        self.postsContent = postsContent
        self.onCall = onCall
    }

    var resolvedAccent: String {
        user.accentColor
    }

    /// La couleur du PROFIL (#10754) — avatar sans photo, bannière de design — et non
    /// l'accent de l'écran d'où la fiche s'ouvre : la même source que ma propre fiche.
    var profileAccent: String {
        DynamicColorGenerator.profileAccentHex(userId: displayUser.userId, name: displayUser.resolvedDisplayName)
    }

    var isBlockedByTarget: Bool {
        loader.isBlockedByTarget
    }

    var displayUser: ProfileSheetUser {
        if let loaded = loader.profile {
            return ProfileSheetUser.from(user: loaded, accentColor: user.accentColor)
        }
        return user
    }

    var effectiveIsLoading: Bool {
        loader.isLoadingProfile
    }

    var effectiveUserStats: UserStats? {
        loader.stats
    }

    var effectiveIsLoadingStats: Bool {
        loader.isLoadingStats
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
        }
        .fullScreenCover(item: $fullscreenImage) { image in
            FullscreenImageView(imageURL: image.url, fallbackText: image.fallbackText, accentColor: resolvedAccent)
        }
        .task {
            await resolveInitialState()
        }
        .onReceive(FriendshipCache.shared.objectWillChange) { _ in
            resolveConnectionStatus()
        }
        .onReceive(MessageSocketManager.shared.userUpdated.receive(on: DispatchQueue.main)) { event in
            guard let repainted = Self.repaintedProfile(loader.profile, with: event) else { return }
            loader.repaint(repainted)
        }
        .adaptiveWideSheet()
    }

    /// #9307 — la fiche OUVERTE d'un pair suit son renommage et sa nouvelle
    /// photo sans relecture, par la loi du SDK ; `nil` tant que la fiche n'est
    /// pas chargée ou que l'annonce vise quelqu'un d'autre. Le cache `profiles`
    /// suit par `ConversationSyncEngine`.
    static func repaintedProfile(_ loaded: MeeshyUser?, with event: UserUpdatedEvent) -> MeeshyUser? {
        loaded.flatMap(event.repainted)
    }

    /// Layout shown when the current user blocked the target — no tabs, just
    /// the (greyed) header + the unblock card, preserving prior behavior.
    @ViewBuilder
    private var blockedLayout: some View {
        VStack(spacing: 0) {
            bannerSection
            identitySection(offset: 0)
                .padding(.top, -40)
            blockedByMeCard
                .padding(.horizontal, MeeshySpacing.xl)
                .padding(.top, MeeshySpacing.lg)
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
                ScrollOffsetReader(relay: scrollRelay) { offset in
                    bigCollapsibleHeader(offset: offset)
                }

                Section {
                    tabContent
                        .padding(.top, MeeshySpacing.lg)
                } header: {
                    ScrollOffsetReader(relay: scrollRelay) { offset in
                        pinnedTabBar(offset: offset)
                    }
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
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }
        .trackScrollContentOffset { scrollRelay.offset = -$0 }
        .background(theme.backgroundPrimary)
        .ignoresSafeArea(edges: .top)
        .overlay(alignment: .top) {
            ScrollOffsetReader(relay: scrollRelay) { offset in
                compactPinnedBar
                    .opacity(Double(ProfileHeaderMetrics.progress(offset: offset)))
                    .allowsHitTesting(ProfileHeaderMetrics.progress(offset: offset) > 0.5)
                    // Hide the compact identity from VoiceOver while the header is
                    // still mostly expanded — the expanded identity is the primary
                    // and reads name/@username; avoids a duplicate identity element.
                    .accessibilityHidden(ProfileHeaderMetrics.progress(offset: offset) <= 0.5)
            }
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
                .padding(.horizontal, MeeshySpacing.xl)
        } else if loader.profileLoadFailed {
            profileLoadFailedState
                .padding(.horizontal, MeeshySpacing.xl)
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

    // MARK: - Profil non chargé (#8025)

    /// Le profil n'a pas pu se charger et le cache n'a rien à montrer : la
    /// fiche le dit et propose de réessayer, au lieu d'onglets vides.
    private var profileLoadFailedState: some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "wifi.exclamationmark")
                .font(MeeshyFont.relative(28, weight: .light))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(String(localized: "profile.loadFailed.message", defaultValue: "Ce profil n'a pas pu se charger.", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                HapticFeedback.light()
                Task { await retryProfile() }
            } label: {
                Text(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .module))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .background(Capsule().fill(Color(hex: resolvedAccent)))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityHint(String(localized: "profile.loadFailed.message", defaultValue: "Ce profil n'a pas pu se charger.", bundle: .module))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xl)
    }

    private func retryProfile() async {
        await loader.retry(userId: user.userId, username: user.username, using: profileLoading)
        resolveConnectionStatus()
        if internalConversations.isEmpty {
            await loadConversationsIfNeeded()
        }
    }

    // MARK: - Auto-loading

    private func loadDataIfNeeded() async {
        await loader.open(userId: user.userId, username: user.username, using: profileLoading)
        resolveConnectionStatus()
    }

    private var profileLoading: any ProfileLoading { injectedProfileLoading ?? UncachedProfileLoading() }

    var resolvedUserId: String? {
        user.userId ?? loader.profile?.id
    }

    private func loadConversationsIfNeeded() async {
        guard let userId = resolvedUserId else { return }
        internalIsLoadingConversations = true
        internalConversations = (try? await profileLoading.sharedConversations(with: userId, currentUserId: currentUserId)) ?? internalConversations
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
            postToast(String(localized: "profile.toast.requestSent", defaultValue: "Demande envoyée", bundle: .module), isSuccess: true)
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
            postToast(String(localized: "profile.toast.requestCancelled", defaultValue: "Demande annulée", bundle: .module), isSuccess: true)
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
            postToast(String(localized: "profile.toast.connectionAccepted", defaultValue: "Connexion acceptée", bundle: .module), isSuccess: true)
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
            postToast(String(localized: "profile.toast.requestDeclined", defaultValue: "Demande refusée", bundle: .module), isSuccess: true)
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
            postToast(String(localized: "profile.toast.userBlocked", defaultValue: "Utilisateur bloqué", bundle: .module), isSuccess: true)
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
            postToast(String(localized: "profile.toast.userUnblocked", defaultValue: "Utilisateur débloqué", bundle: .module), isSuccess: true)
        } catch {
            postToast(String(localized: "profile.toast.unblockFailed", defaultValue: "Impossible de débloquer", bundle: .module), isSuccess: false)
        }
    }

    // MARK: - Bio Card

    func bioCard(_ bio: String) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(bio)
                .font(.callout)
                .foregroundColor(theme.textSecondary)
                .lineLimit(5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.lg)
        .background(theme.surfaceGradient(tint: resolvedAccent))
        .glassCard(cornerRadius: MeeshyRadius.lg)
    }

    // MARK: - Info Chip

    func infoChip(icon: String, text: String) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if icon.count > 1 {
                // Emoji flag
                Text(icon)
                    .font(.system(size: MeeshyFont.labelSize))
            } else {
                // SF Symbol
                Image(systemName: icon)
                    .font(.system(size: MeeshyIconSize.xxs, weight: .medium))
                    .foregroundColor(Color(hex: resolvedAccent))
            }
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .background(theme.surface(tint: resolvedAccent, intensity: 0.12))
        .clipShape(Capsule())
        .overlay(
            Capsule().stroke(theme.border(tint: resolvedAccent, intensity: 0.2), lineWidth: 1)
        )
    }

    // MARK: - E2EE Badge

    var e2eeBadge: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                .foregroundColor(MeeshyColors.success)

            Text(String(localized: "profile.e2ee.enabled", defaultValue: "Chiffrement de bout en bout activé", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundColor(MeeshyColors.success)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.sm)
        .background(MeeshyColors.success.opacity(MeeshyOpacity.light))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .stroke(MeeshyColors.success.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.emphasis)
        )
    }

    // MARK: - Language Pills

    @ViewBuilder
    var languagePills: some View {
        let sysLang = LanguageDisplay.from(code: displayUser.systemLanguage)
        let regLang = LanguageDisplay.from(code: displayUser.regionalLanguage)

        if sysLang != nil || regLang != nil {
            HStack(spacing: MeeshySpacing.sm) {
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
        HStack(spacing: MeeshySpacing.xs) {
            Text(lang.flag)
                .font(.system(size: MeeshyFont.labelSize))
            Text(lang.name)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xsPlus)
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
            } else if let targetUserId = loader.profile?.id ?? user.userId {
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
            .shadow(color: MeeshyColors.indigo500.opacity(MeeshyOpacity.medium), radius: compact ? 4 : 8, y: compact ? 2 : 4)
        }
        .pressable()
    }

    // MARK: - Loading Placeholder

    var loadingPlaceholder: some View {
        VStack(spacing: MeeshySpacing.md) {
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                .frame(height: 60)
                .shimmer()

            HStack(spacing: MeeshySpacing.sm) {
                RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                    .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                    .frame(width: 80, height: 30)
                RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                    .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                    .frame(width: 80, height: 30)
            }
            .shimmer()
        }
    }

    // MARK: - Blocked By Me

    private var blockedByMeCard: some View {
        VStack(spacing: MeeshySpacing.md) {
            Text(String(localized: "profile.blocked.byMe", defaultValue: "Vous avez bloqué cet utilisateur", bundle: .module))
                .font(.system(size: MeeshyFont.labelSize, weight: .medium))
                .foregroundColor(theme.textSecondary)

            Button {
                HapticFeedback.medium()
                Task { await unblockUser() }
            } label: {
                Text(String(localized: "profile.blocked.unblock", defaultValue: "Débloquer", bundle: .module))
                    .font(.system(size: MeeshyFont.labelSize, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.xxl)
                    .padding(.vertical, MeeshySpacing.smPlus)
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
        .padding(MeeshySpacing.xl)
        .background(theme.surfaceGradient(tint: MeeshyColors.blockedNeutralHex))
        .glassCard(cornerRadius: MeeshyRadius.lg)
    }

    // MARK: - Helpers

    func formatRegistrationDate(_ date: Date) -> String {
        date.formatted(.dateTime.year().month(.wide).day().locale(Locale(identifier: "fr_FR")))
    }

    /// Sans image, rien ne s'ouvre : un plein écran de l'avatar à initiales n'a rien à montrer.
    func openFullscreenImage(url: String?, fallback: String) {
        fullscreenImage = ProfileFullscreenImage.opening(url, fallbackText: fallback)
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
