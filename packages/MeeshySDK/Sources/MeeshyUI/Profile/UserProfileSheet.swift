import SwiftUI
import Combine
import MeeshySDK

// MARK: - User Profile Sheet

public nonisolated enum ConnectionStatus: Equatable, Sendable {
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
    @State var pendingRequestId: String?
    /// La demande en attente telle que le cache la garde : sa date (« envoyée il y a 2 j ») et le mot de l'émetteur.
    @State var pendingRequest: FriendRequest?
    /// Acceptée sur cette fiche : « Vous êtes amis » reste à l'écran le temps qu'on la lise (planche `Etat-Demande`).
    @State var justAccepted = false
    /// La dernière demande n'est pas partie (planche `Etat-Erreur` vue 2) : la carte le dit et propose « Réessayer ».
    @State var requestUnsent = false

    public let dependencies: UserProfileDependencies

    var currentUserId: String {
        dependencies.currentUser()?.id ?? ""
    }

    var isCurrentUser: Bool {
        guard !currentUserId.isEmpty else { return false }
        if user.userId == currentUserId { return true }
        if let currentUsername = dependencies.currentUser()?.username,
           user.username == currentUsername { return true }
        return false
    }

    var connectionActions: ProfileConnectionActions {
        ProfileConnectionActions(relationships: dependencies.relationships, social: dependencies.social)
    }

    /// Injected by the app (Phase E) to render the rich posts list
    /// (`FeedPostCard`). Param = resolved userId. `nil` (default) keeps the
    /// minimal SDK fallback list so the SDK stays self-contained and the
    /// existing call-sites are unaffected.
    public var postsContent: ((String) -> AnyView)? = nil

    @ResolvedThemePalette var theme
    /// L'emplacement du jeu (#9481) — fourni par l'app, vide sinon.
    @Environment(\.profileGameSection) var gameSection
    @Environment(\.profileRelationSection) var relationSection
    @Environment(\.profileRelationPill) var relationPill
    @Environment(\.profileLocationMap) var locationMap
    @Environment(\.profileLoading) private var injectedProfileLoading
    @Environment(\.dismiss) var dismiss
    /// La face lue (loi 1, #18870) ; la Vitrine d'abord.
    @State var face: RelationFace = .vitrine
    /// L'app montre un lien d'au moins Connaissance dans l'emplacement du cercle (#14910) : le cercle commun n'est plus
    /// Public, écrire n'est plus une demande.
    @State var relationLinked = false
    @State var sharesProfile = false
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
        onCall: ((ProfileCallRequest) -> Void)? = nil,
        dependencies: UserProfileDependencies
    ) {
        self.dependencies = dependencies
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

    /// L'accent de la fiche en couleur, pour les composants du kit qui le reçoivent.
    var accentTint: Color { Color(hex: resolvedAccent) }

    /// La couleur du PROFIL (#10754) — avatar sans photo, bannière de design — et non
    /// l'accent de l'écran d'où la fiche s'ouvre : la même source que ma propre fiche. La teinte qu'il a
    /// CHOISIE d'abord (#19391), l'accent calculé quand le serveur n'en sert pas.
    var profileAccent: String {
        ProfileAccent.hex(chosen: displayUser.profileAccentColor, userId: displayUser.userId,
                          name: displayUser.resolvedDisplayName)
    }

    /// Introuvable, privé ou il m'a bloqué (loi 9) : le décor et la présence se taisent, la fiche rend « Personne ici ».
    var isBlockedByTarget: Bool {
        loader.isUnavailable
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

    var effectiveIsLoadingConversations: Bool {
        internalIsLoadingConversations
    }

    public var body: some View {
        ZStack {
            switch phase {
            case .unavailable:
                unavailableLayout
            case .blockedByMe:
                blockedLayout
            case .skeleton, .failed, .shown:
                collapsibleLayout
            }
        }
        .sheet(isPresented: $showReportSheet) {
            ProfileReportSheet(name: displayUser.resolvedDisplayName, avatarURL: displayUser.avatarURL,
                               accentColor: profileAccent, ring: displayUser.profileDecor?.avatarRing,
                               isAlreadyBlocked: isBlocked,
                               onSend: { draft in await sendReport(draft) })
        }
        .fullScreenCover(item: $fullscreenImage) { image in
            FullscreenImageView(imageURL: image.url, fallbackText: image.fallbackText, accentColor: resolvedAccent)
        }
        .task {
            await resolveInitialState()
        }
        .onReceive(dependencies.relationships.changes) { _ in
            resolveConnectionStatus()
        }
        .onReceive(dependencies.userUpdates.receive(on: DispatchQueue.main)) { event in
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

    /// The redesigned single-scroll layout: a big collapsible header scrolls
    /// away, a compact identity bar fades in, and the face selector floats at the bottom (loi 5).
    @ViewBuilder
    private var collapsibleLayout: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                ScrollOffsetReader(relay: scrollRelay) { offset in
                    bigCollapsibleHeader(offset: offset)
                }

                if case .shown(let fallback?) = phase {
                    ProfileCacheFallbackBanner(fallback: fallback, onRetry: { retryFromState() })
                        .padding(.top, MeeshySpacing.lg)
                }

                faceContent
                    .padding(.top, MeeshySpacing.lg)

                Color.clear.frame(height: showsFaceSelector ? MeeshySpacing.xxl * 3 : 40)
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
        .overlay(alignment: .bottom) {
            if showsFaceSelector {
                RelationFaceSelector(face: $face, writeShortcut: writeShortcut)
            }
        }
        .task {
            await loadDataIfNeeded()
            await loadConversationsIfNeeded()
        }
    }

    /// La face lue — chacune dans son extension. Le squelette seulement sur cache vide (loi 8).
    @ViewBuilder
    var faceContent: some View {
        switch phase {
        case .skeleton:
            ProfileSkeletonFace()
        case .failed(let failure):
            ProfileFailedState(failure: failure, onRetry: { retryFromState() })
        case .shown, .unavailable, .blockedByMe:
            switch RelationFace.shown(face, isCurrentUser: isCurrentUser) {
            case .vitrine:
                vitrineFace
            case .links:
                linksFace
            case .actions:
                actionsFace
            }
        }
    }

    var showsFaceSelector: Bool {
        RelationFace.showsSelector(isCurrentUser: isCurrentUser, isBlocked: isBlocked, loadFailed: !phase.showsFaceSelector)
    }

    /// « Écrire » à droite du sélecteur, sur la Vitrine seulement (brief § 1).
    private var writeShortcut: (() -> Void)? {
        guard face.offersWriteShortcut(isInteractionDisabled: isInteractionDisabled) else { return nil }
        return { openConversation() }
    }

    /// Sans lien ni connexion acceptée, écrire part en demande de message.
    var writesARequest: Bool {
        RelationFace.writesARequest(linked: relationLinked, connection: connectionStatus)
    }

    /// « Réessayer » (#8025) : le chargeur rejoue l'ouverture, puis les conversations en commun si elles manquent.
    func retryProfile() async {
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

    private var profileLoading: any ProfileLoading { injectedProfileLoading ?? dependencies.fallbackProfileLoading }

    var resolvedUserId: String? {
        user.userId ?? loader.profile?.id
    }

    func loadConversationsIfNeeded() async {
        guard let userId = resolvedUserId else { return }
        internalIsLoadingConversations = true
        internalConversations = (try? await profileLoading.sharedConversations(with: userId, currentUserId: currentUserId)) ?? internalConversations
        internalIsLoadingConversations = false
    }

    // MARK: - State Resolution

    private func resolveInitialState() async {
        guard let userId = resolvedUserId, !userId.isEmpty, userId != currentUserId else { return }
        isBlocked = dependencies.relationships.isBlocked(userId: userId)
        resolveConnectionStatus()
    }

    private func resolveConnectionStatus() {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        let resolved = ConnectionStatus(friendship: dependencies.relationships.status(for: userId))
        switch resolved {
        case .pendingSent(let requestId), .pendingReceived(let requestId):
            pendingRequestId = requestId
        case .none, .connected:
            break
        }
        connectionStatus = resolved
    }

    // MARK: - Toast Helper

    func postToast(_ message: String, isSuccess: Bool) {
        FeedbackToastCenter.post(message, isSuccess: isSuccess)
    }

    // MARK: - Connection Actions

    func sendConnectionRequest(message: String? = nil) async {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        requestUnsent = false
        guard let requestId = await connectionActions.sendRequest(to: userId, message: message) else {
            requestUnsent = true
            return
        }
        requestUnsent = false
        pendingRequestId = requestId
        connectionStatus = .pendingSent(requestId: requestId)
        HapticFeedback.success()
        postToast(String(localized: "profile.toast.requestSent", defaultValue: "Demande envoyée", bundle: .module), isSuccess: true)
    }

    func cancelRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId else { return }
        let cancelled = await connectionActions.cancelRequest(requestId: requestId, userId: userId) {
            pendingRequestId = nil
            connectionStatus = .none
            HapticFeedback.medium()
        }
        guard cancelled else {
            resolveConnectionStatus()
            postToast(String(localized: "profile.toast.cancelFailed", defaultValue: "Impossible d'annuler", bundle: .module), isSuccess: false)
            return
        }
        postToast(String(localized: "profile.toast.requestCancelled", defaultValue: "Demande annulée", bundle: .module), isSuccess: true)
    }

    func loadPendingRequest() async {
        guard let requestId = pendingRequestId else { return }
        let request = await connectionActions.pendingRequest(requestId)
        guard requestId == pendingRequestId else { return }
        pendingRequest = request
    }

    func resendRequest() async {
        if let requestId = pendingRequestId {
            await connectionActions.discardRequest(requestId)
        }
        await sendConnectionRequest()
    }

    func acceptRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId else { return }
        let accepted = await connectionActions.acceptRequest(requestId: requestId, senderId: userId) {
            justAccepted = true
            connectionStatus = .connected
            pendingRequestId = nil
            HapticFeedback.success()
        }
        guard accepted else {
            justAccepted = false
            resolveConnectionStatus()
            HapticFeedback.error()
            postToast(String(localized: "profile.toast.acceptFailed", defaultValue: "Impossible d'accepter", bundle: .module), isSuccess: false)
            return
        }
        postToast(String(localized: "profile.toast.connectionAccepted", defaultValue: "Connexion acceptée", bundle: .module), isSuccess: true)
    }

    func declineRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId else { return }
        let declined = await connectionActions.declineRequest(requestId: requestId, senderId: userId) {
            connectionStatus = .none
            pendingRequestId = nil
            HapticFeedback.medium()
        }
        guard declined else {
            resolveConnectionStatus()
            HapticFeedback.error()
            postToast(String(localized: "profile.toast.declineFailed", defaultValue: "Impossible de refuser", bundle: .module), isSuccess: false)
            return
        }
        postToast(String(localized: "profile.toast.requestDeclined", defaultValue: "Demande refusée", bundle: .module), isSuccess: true)
    }

    // MARK: - Block Actions

    func blockUser() async {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        guard await connectionActions.block(userId: userId) else {
            postToast(String(localized: "profile.toast.blockFailed", defaultValue: "Impossible de bloquer", bundle: .module), isSuccess: false)
            return
        }
        isBlocked = true
        HapticFeedback.medium()
        postToast(String(localized: "profile.toast.userBlocked", defaultValue: "Utilisateur bloqué", bundle: .module), isSuccess: true)
    }

    func unblockUser() async {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        guard await connectionActions.unblock(userId: userId) else {
            postToast(String(localized: "profile.toast.unblockFailed", defaultValue: "Impossible de débloquer", bundle: .module), isSuccess: false)
            return
        }
        isBlocked = false
        resolveConnectionStatus()
        HapticFeedback.light()
        postToast(String(localized: "profile.toast.userUnblocked", defaultValue: "Utilisateur débloqué", bundle: .module), isSuccess: true)
    }

    // MARK: - Bio Card

    func bioCard(_ bio: String) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(bio)
                .font(.callout)
                .foregroundStyle(theme.textSecondary)
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
                    .meeshyScaledFont(MeeshyFont.labelSize)
            } else {
                // SF Symbol
                Image(systemName: icon)
                    .font(.system(size: MeeshyIconSize.xxs, weight: .medium))
                    .foregroundStyle(Color(hex: resolvedAccent))
            }
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundStyle(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .background(theme.surface(tint: resolvedAccent, intensity: 0.12))
        .clipShape(Capsule())
        .overlay(
            Capsule().stroke(theme.border(tint: resolvedAccent, intensity: 0.2), lineWidth: 1)
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
                .foregroundStyle(theme.textPrimary)
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

    private func sendMessageButtonContent(compact: Bool) -> some View {
        Button {
            HapticFeedback.medium()
            openConversation()
        } label: {
            HStack(spacing: compact ? 6 : 8) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: compact ? 12 : 14, weight: .semibold))
                Text(String(localized: "profile.action.sendMessage", defaultValue: "Envoyer un message", bundle: .module))
                    .meeshyScaledFont(compact ? 13 : 15, weight: .semibold)
            }
            .foregroundStyle(.white)
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

    /// Écrire : l'hôte ouvre la conversation (ou la demande de message) ; sans hôte, l'annonce historique.
    func openConversation() {
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
    }

    // MARK: - Helpers

    func formatRegistrationDate(_ date: Date) -> String {
        date.formatted(.dateTime.year().month(.wide).day())
    }

    /// Sans image, rien ne s'ouvre : un plein écran de l'avatar à initiales n'a rien à montrer.
    func openFullscreenImage(url: String?, fallback: String) {
        fullscreenImage = ProfileFullscreenImage.opening(url, fallbackText: fallback)
    }
}
