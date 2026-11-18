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
    /// Le mot de la demande qui n'est pas partie : la carte le reprend, et « Réessayer » le renvoie tel quel.
    @State var unsentNote: String?
    /// Accepter, refuser ou annuler a raté (planche `Etat-Erreur` vue 2, #19611) : la carte le dit et propose « Réessayer ».
    @State var relationFailure: ProfileRelationMutation?
    /// Une demande est en route : un second appui ne repart pas, et la carte « Envoyée » attend son identifiant servi.
    @State var isSendingRequest = false

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
    /// « En direct · Entre Proches » (#19416) — fourni par l'app, absent sinon.
    @Environment(\.profileLiveSection) var liveSectionSlot
    /// Les sections de la face Actions lues par l'app (#19433) ; absentes sans elle.
    @Environment(\.profileActionsParts) var actionsParts
    /// La feuille d'envoi Meeshy de l'app (#19442) ; sans elle, « Envoyer son profil » ouvre celle du système.
    @Environment(\.profileSendSheet) var sendSheet
    @Environment(\.profileLoading) private var injectedProfileLoading
    @Environment(\.dismiss) var dismiss
    /// En plein écran (`profileCover`, #19674), la tête dit « Retour » ; en feuille, « Fermer ».
    @Environment(\.profilePresentationStyle) var presentationStyle
    /// La face lue (loi 1, #18870) ; la Vitrine d'abord, ou celle que demande l'ouverture (#19732).
    @State var face: RelationFace = .vitrine
    /// Ce que l'emplacement du cercle publie (#14910, #18870) : le lien montré et le niveau d'outil lu, `unresolved`
    /// tant que l'app n'a rien lu.
    @State var relationStanding = ProfileRelationStanding.unresolved
    @State var sharesProfile = false
    /// #10093 — la bannière ou la photo ouverte en plein écran, PRÉSENTÉE par-dessus la feuille (`fullScreenCover`) :
    /// posée dans la pile de la feuille, la visionneuse ne pouvait pas déborder de sa hauteur (mi-écran en `.medium`).
    @State private var fullscreenImage: ProfileFullscreenImage?
    @State var showReportSheet = false
    /// Signed scroll offset feeding `ProfileHeroPlan.progress`. Negative
    /// while scrolling content down. Updated by the iOS 16-17 preference path
    /// and the iOS 18+ `trackScrollContentOffset` path simultaneously.
    @State var scrollRelay = ScrollOffsetRelay()
    /// #10093 — profil et statistiques : le cache d'abord, la synchronisation dès l'ouverture.
    @StateObject var loader = ProfileSheetLoader()
    @StateObject var acquaintance = ProfileAcquaintanceModel()
    @State private var internalConversations: [MeeshyConversation] = []
    @State private var internalIsLoadingConversations = false
    /// Nos directes lues dans le cache de la liste (#19646) : la pastille d'« Écrire », relue à chaque réécriture du cache,
    /// et si une directe existe déjà ; rien tant qu'elles ne sont pas lues.
    @State var directDigest: ProfileDirectDigest = .empty
    /// La connectivité observée par l'app (#18857) ; `nil` sans elle.
    @Environment(\.profileNetworkIsOffline) var networkIsOffline

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
        _face = State(initialValue: user.openingFace)
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
                               isAlreadyBlocked: isBlocked, reportMessages: dependencies.reportMessages, reportedUserId: resolvedUserId,
                               onSend: { draft in await sendReport(draft) },
                               onRetryBlock: { await retryReportBlock() })
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

    /// La fiche en un seul défilement (#19410) : le héros K28 se replie en barre de verre épinglée, et le sélecteur de
    /// faces flotte en bas (loi 5).
    @ViewBuilder
    private var collapsibleLayout: some View {
        heroScrollView(
            VStack(spacing: 0) {
                if case .shown(let fallback?) = phase {
                    ProfileCacheFallbackBanner(fallback: fallback, onRetry: { retryFromState() })
                        .padding(.top, MeeshySpacing.lg)
                }

                MeeshyRevealZone(isRevealed: phase != .skeleton) { faceContent } placeholder: { ProfileSkeletonFace() }
                    .padding(.top, MeeshySpacing.lg)

                Color.clear.frame(height: showsFaceSelector ? MeeshySpacing.xxl * 3 : 40)
            }
        )
        .overlay(alignment: .bottom) {
            if showsFaceSelector {
                RelationFaceSelector(face: $face, writeShortcut: writeShortcut)
            }
        }
        .environment(\.meeshyProfileAccent, profileAccent)
        .task {
            await loadDataIfNeeded()
            await loadConversationsIfNeeded()
            await acquaintance.resolve(userId: resolvedUserId, host: dependencies.acquaintance)
        }
        .task(id: resolvedUserId) {
            directDigest = .empty
            for await digest in ProfileDirectDigest.updates(for: resolvedUserId, from: dependencies.directUnread) {
                directDigest = digest
            }
        }
        .adaptiveOnChange(of: networkIsOffline) { old, new in
            guard ProfileTalkReach.reloadsOnReconnect(from: old, to: new, phase: phase) else { return }
            Task { await retryProfile() }
        }
    }

    /// Sans réseau : la connectivité observée par l'app, sinon le dernier chargement (planche `Etat-HorsLigne`).
    var talksOffline: Bool {
        ProfileTalkReach.isOffline(phase, network: networkIsOffline)
    }

    /// La face lue — chacune dans son extension, glissant dans le sens du geste (#19606). Squelette sur cache vide (loi 8).
    @ViewBuilder
    var faceContent: some View {
        switch phase {
        case .skeleton:
            ProfileSkeletonFace()
        case .failed(let failure):
            ProfileFailedState(failure: failure, onRetry: { retryFromState() })
        case .shown, .unavailable, .blockedByMe:
            MeeshySegmentedPages(selection: RelationFace.shown(face, isCurrentUser: isCurrentUser),
                                 order: RelationFace.allCases) { shown in
                switch shown {
                case .vitrine: vitrineFace
                case .links: RelationLinksFace.of(self)
                case .actions: actionsFace
                }
            }
        }
    }

    var showsFaceSelector: Bool {
        RelationFace.showsSelector(isCurrentUser: isCurrentUser, isBlocked: isBlocked, loadFailed: !phase.showsFaceSelector)
    }

    /// « Écrire » à droite du sélecteur, sur la Vitrine seulement (brief § 1).
    private var writeShortcut: (() -> Void)? {
        guard face.offersWriteShortcut(isInteractionDisabled: isInteractionDisabled),
              talkReach(.write) != .needsNetwork else { return nil }
        return { openConversation() }
    }

    /// Sans lien ni connexion acceptée, écrire part en demande de message, jugé au niveau d'outil que l'app a lu.
    var writesARequest: Bool {
        RelationFace.writesARequest(standing: servedStanding, connection: connectionStatus)
    }

    /// L'app montre un lien d'au moins Connaissance (#14910) : la fiche range ce qu'elle montrait sans lien.
    var relationLinked: Bool { relationStanding.linked }

    /// Sans emplacement de cercle ni pilule, personne ne publie : la fiche reste au cercle Public d'avant.
    var servedStanding: ProfileRelationStanding {
        relationSection == nil && relationPill == nil ? .unhosted : relationStanding
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

    /// Optimiste (planche `Etat-Demande`) : l'étape « Envoyée » s'affiche au geste, un second appui ne repart pas, et
    /// un refus du réseau ramène la carte d'ouverture qui le dit (« La demande n'est pas partie » + Réessayer).
    func sendConnectionRequest(message: String? = nil) async {
        guard let userId = resolvedUserId, !userId.isEmpty, !isSendingRequest else { return }
        isSendingRequest = true
        requestUnsent = false
        relationFailure = nil
        let outcome = await connectionActions.sendRequest(to: userId, message: message) { provisional in
            markRequestPending(provisional)
        }
        isSendingRequest = false
        applySent(outcome, note: message)
    }

    private func markRequestPending(_ requestId: String) {
        pendingRequestId = requestId
        connectionStatus = .pendingSent(requestId: requestId)
    }

    /// La demande servie porte sa date et son mot : l'étape dit « à l'instant » sans attendre le cache des demandes.
    private func applySent(_ outcome: ProfileRequestSend, note: String?) {
        switch outcome {
        case .sent(let request):
            unsentNote = nil
            pendingRequest = request
            markRequestPending(request.id)
            HapticFeedback.success()
            postToast(String(localized: "profile.toast.requestSent", defaultValue: "Demande envoyée", bundle: .module), isSuccess: true)
        case .failed:
            pendingRequestId = nil
            connectionStatus = .none
            requestUnsent = true
            unsentNote = note
            HapticFeedback.error()
        case .alreadyPending:
            resolveConnectionStatus()
        }
    }

    func cancelRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId,
              !ProfileConnectionActions.isProvisional(requestId) else { return }
        relationFailure = nil
        let cancelled = await connectionActions.perform(.cancel, requestId: requestId, userId: userId) {
            pendingRequestId = nil
            connectionStatus = .none
            HapticFeedback.medium()
        }
        guard cancelled else { return relationFailed(.cancel) }
        postToast(String(localized: "profile.toast.requestCancelled", defaultValue: "Demande annulée", bundle: .module), isSuccess: true)
    }

    /// Le cache des demandes ne remplace la demande gardée que s'il en rend une, pour le même identifiant.
    func loadPendingRequest() async {
        guard let requestId = pendingRequestId, !ProfileConnectionActions.isProvisional(requestId) else { return }
        let request = await connectionActions.pendingRequest(requestId)
        guard requestId == pendingRequestId, let request, request.id == requestId else { return }
        pendingRequest = request
    }

    /// « Renvoyer » : l'ancienne demande se retire (optimiste, remise si le réseau refuse — la carte le dit), puis la
    /// nouvelle part avec le mot de l'ancienne. Si elle ne part pas, l'étape retombe sur « La demande n'est pas partie ».
    func resendRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId, !userId.isEmpty, !isSendingRequest,
              !ProfileConnectionActions.isProvisional(requestId) else { return }
        let message = pendingRequest?.id == requestId ? pendingRequest?.message : nil
        isSendingRequest = true
        requestUnsent = false
        relationFailure = nil
        let outcome = await connectionActions.resendRequest(
            requestId: requestId, userId: userId, message: message,
            afterWithdrawn: {
                pendingRequestId = nil
                connectionStatus = .none
            },
            afterOptimistic: { provisional in markRequestPending(provisional) }
        )
        isSendingRequest = false
        switch outcome {
        case .resent(let request): applySent(.sent(request), note: message)
        case .unsent(let note): applySent(.failed, note: note)
        case .withdrawFailed: relationFailed(.resend)
        }
    }

    func acceptRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId else { return }
        relationFailure = nil
        let accepted = await connectionActions.perform(.accept, requestId: requestId, userId: userId) {
            justAccepted = true
            connectionStatus = .connected
            pendingRequestId = nil
            HapticFeedback.success()
        }
        guard accepted else {
            justAccepted = false
            return relationFailed(.accept)
        }
        postToast(String(localized: "profile.toast.connectionAccepted", defaultValue: "Connexion acceptée", bundle: .module), isSuccess: true)
    }

    func declineRequest() async {
        guard let requestId = pendingRequestId, let userId = resolvedUserId else { return }
        relationFailure = nil
        let declined = await connectionActions.perform(.decline, requestId: requestId, userId: userId) {
            connectionStatus = .none
            pendingRequestId = nil
            HapticFeedback.medium()
        }
        guard declined else { return relationFailed(.decline) }
        postToast(String(localized: "profile.toast.requestDeclined", defaultValue: "Demande refusée", bundle: .module), isSuccess: true)
    }

    /// Le retour arrière a remis l'étape d'avant : la carte la repeint, et la note dit ce qui n'est pas parti.
    private func relationFailed(_ mutation: ProfileRelationMutation) {
        resolveConnectionStatus()
        HapticFeedback.error()
        relationFailure = mutation
    }

    /// « Réessayer » rejoue la même mutation, optimiste comme la première fois.
    func retryRelation(_ mutation: ProfileRelationMutation) async {
        switch mutation {
        case .accept: await acceptRequest()
        case .decline: await declineRequest()
        case .cancel: await cancelRequest()
        case .resend: await resendRequest()
        }
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

    /// Sans image, rien ne s'ouvre : un plein écran de l'avatar à initiales n'a rien à montrer.
    func openFullscreenImage(url: String?, fallback: String) {
        fullscreenImage = ProfileFullscreenImage.opening(url, fallbackText: fallback)
    }
}
