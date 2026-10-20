import SwiftUI
import Combine
import os
import PhotosUI
import AVFoundation
import Contacts
import MeeshySDK
import MeeshyUI

// MARK: - Swipe-to-go-back enabler
// `InteractivePopEnabler` vit désormais dans
// `Features/Main/Navigation/InteractivePopEnabler.swift` — les sections du
// hub de progression en ont besoin aussi (#5843), et une jumelle recopiée
// aurait perdu la politique `allowsEdgeSwipe` dont la Rivière dépend.

struct ConversationView: View {
    let conversation: Conversation?
    var replyContext: ReplyContext? = nil
    var anonymousSession: AnonymousSessionContext? = nil
    /// Lightweight preview presentation (notification long-press overlay):
    /// the composer hides file/photo attachments and exposes a view-once
    /// toggle, while keeping text / voice / effects / blur / ephemeral. Default
    /// `false` leaves the full conversation screen unchanged.
    var previewMode: Bool = false
    /// In `previewMode`, called when the user taps anywhere over the message
    /// area (composer excluded) to leave the preview and open the full
    /// conversation with a navigation transition.
    var onOpenFullConversation: (() -> Void)? = nil
    /// `true` uniquement pour les hôtes SANS point de montage racine du
    /// SyncPill (flux invité — `GuestConversationContainer`, qui ne monte
    /// jamais `RootView`/`iPadRootView` et n'a donc aucune couverture par
    /// le hoist). `false` partout ailleurs : le point de montage unique
    /// couvre déjà le flux authentifié normal, dupliquer la bannière ici
    /// l'afficherait deux fois.
    var showsOwnConnectionBanner: Bool = false
    /// I-075 — override ÉPHÉMÈRE, JAMAIS persistant (item « Focal (bêta) »,
    /// retiré avec Focal iOS le 2026-08-18) : `nil` ⇒ `init` bit-à-bit identique ;
    /// SEUL le site d'appel qui lit `router.pendingForcedReadingMode`
    /// (RootView/iPadRootView) passe une valeur. Transmis tel quel à
    /// `ReadingModeController.init(forcedMode:)` — voir sa docstring.
    var forcedReadingMode: ReadingModeOrchestrator.ConversationReadingMode? = nil

    /// Conversation CONFIRMÉE par le serveur après un enregistrement dans
    /// `ConversationSettingsView` (titre, description, avatar, bannière,
    /// réglages), remontée par `ConversationInfoSheet.onConversationUpdated`.
    ///
    /// `conversation` ci-dessus est une valeur FIGÉE, capturée au moment de la
    /// navigation : `MeeshyConversation.==`/`.hash` ne comparent que `id`, donc
    /// aucune recomposition du `NavigationStack` ne la rafraîchit quand seuls
    /// ses champs internes changent. L'override est la seule source vivante.
    @State private var conversationOverride: Conversation?

    /// La conversation à AFFICHER : l'override s'il existe, sinon la valeur figée (lue par `+Header`).
    var liveConversation: Conversation? { _ = repaintRevision; return conversationOverride ?? conversation }
    /// `==` ne compare que l'`id` : une copie repeinte écrite dans `@State` est ÉGALE et n'invalide
    /// rien. Cette révision, lue par `liveConversation`, porte le redessin (#10751).
    @State private var repaintRevision = 0

    /// Le pair d'un direct OUVERT renommé ou repeint à `user:updated` (#9359) :
    /// l'annonce s'applique à la conversation AFFICHÉE et le résultat devient
    /// l'override — l'override garde la priorité, la valeur figée reste le
    /// repli, et un enregistrement des réglages repart du pair repeint. Une
    /// annonce qui ne change rien n'écrit rien : l'écran ne se redessine pas.
    func admitPeerUpdate(_ event: UserUpdatedEvent) { admitRepainted(DirectPeerRepaint.repainted(liveConversation, by: event)) }
    /// Écrivain UNIQUE de l'override : pair (#9359), accent relayé (#10631), réglages enregistrés.
    func admitRepainted(_ repainted: Conversation?) { guard let repainted else { return }; conversationOverride = repainted; repaintRevision &+= 1 }

    // NOTE: Properties below are internal (not private) for cross-file extension access (+MessageRow, +Header, …).
    @Environment(\.sceneWindowSize) var sceneWindowSize // la fenêtre qui porte la conversation (Stage Manager)
    @Environment(\.sceneSafeAreaInsets) var sceneSafeAreaInsets // ses marges, mesurées hors de `body`
    var windowInsets: WindowInsets { WindowInsets(published: sceneSafeAreaInsets) }

    @Environment(\.dismiss) private var dismiss
    var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.isStoryViewerPresenting) private var isStoryViewerPresenting
    /// Bascule Reduce Motion IN-APP (§4.9) — la source SYSTÈME
    /// (`UIAccessibility.isReduceMotionEnabled`) est lue directement par
    /// `MessageListViewController` (UIKit), qui combine les DEUX. Ce
    /// contrôleur ne transmet QUE l'override applicatif à `MessageListView`.
    @Environment(\.meeshyForceReduceMotion) private var meeshyForceReduceMotion
    var isDark: Bool { colorScheme == .dark }
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la conversation. La présence est rafraîchie via les refreshs naturels.
    var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var router: Router
    @Environment(\.meeshyConversationList) var conversationListViewModel
    @StateObject var viewModel: ConversationViewModel
    /// WS-7 (F-086, contrat §WS-7/A6) — décision de l'orchestrateur des modes
    /// de lecture, prise UNE SEULE FOIS dans `init` (écart #4 : `viewModel.start()`
    /// marque déjà lu avant la première frame, `unreadCount` y vaudrait 0 si la
    /// décision attendait `onAppear`). `ReadingModeController` (F-080, GELÉ) porte
    /// la résolution (loi gelée + préférence collante), non dupliquée ici.
    @StateObject var readingModeController: ReadingModeController
    /// Capacités résolues UNE SEULE FOIS dans `init`, aux côtés de
    /// `readingModeController` (aucune seconde résolution). Alimente
    /// `ReadingModeLensCatalog.rows` : la Rivière est TOUJOURS au catalogue,
    /// grisée avec sa VRAIE raison quand indisponible (§7).
    let readingModeCapabilities: ReadingModeOrchestrator.ReadingModeCapabilities
    /// Lot 3.2 — carte lieu de la rangée plate : plein écran (même patron
    /// que `BubbleFullscreenPlace` côté bulle).
    @State private var focalFullscreenPlace: FocalFullscreenPlace?
    /// Lot 3.2 — fichier à partager depuis la rangée plate (ShareSheet).
    @State private var focalShareFileItem: FocalShareFileItem?
    // `typingObserver` a été RETIRÉ (#5961) : capturé à l'`init` depuis le `vm`
    // LOCAL (une instance que `@StateObject` jette), il observait le store d'un
    // ViewModel mort. Le roster arrive par `ConversationTypingRosterHost`,
    // alimenté par `viewModel.stateStore` — le survivant — au rendu.
    /// Observe le blocage pour réafficher la zone composer « débloquer » dès
    /// qu'un block/unblock change. Événement rare (action explicite), hors hot
    /// path — safe (même pattern que ConversationListView). Seuls les blocages
    /// SORTANTS sont connus du client ; un blocage entrant remonte en erreur
    /// d'envoi côté gateway.
    private var blockService: BlockService { BlockService.shared }
    /// Texte du composer, ISOLÉ de l'arbre racine : tenu via `@State` (stockage
    /// stable) mais JAMAIS lu dans ce body ni observé ici — seul
    /// `ComposerTextHost` (+Composer) s'y abonne, donc la frappe ne ré-évalue
    /// que le sous-arbre composer au lieu des ~1500 lignes de la racine.
    /// Lecture/écriture depuis les handlers (send, mention, edit) via
    /// `composerText.text` — hors body, donc sans créer de dépendance.
    @State var composerText = ConversationComposerTextModel()
    /// POSSÉDÉS, PAS OBSERVÉS (#6226) — `@State` et non `@StateObject` : le
    /// vumètre publie vingt fois par seconde, le lecteur sa progression dix
    /// fois, et la racine n'en lit aucune valeur dans son `body`. Elle appelle
    /// des MÉTHODES, ce qui n'exige aucun abonnement ; `ComposerAudioHost` et
    /// `PendingAudioTile` en sont les uniques observateurs. Même dispositif
    /// que `composerText` deux lignes plus haut (#4105).
    @State var audioRecorder = AudioRecorderManager()
    @State var scrollButtonAudioIsPlaying = false
    @State var pendingAudioPlayer = AudioPlaybackManager()
    /// Composant unifié « Enregistrer » au niveau écran — sert l'action
    /// `.saveMedia` du menu appui-long (l'overlay n'est pas un cover, la
    /// sheet de destinations se présente sans conflit).
    @StateObject var mediaSaveCoordinator = MediaSaveCoordinator()

    @FocusState var isTyping: Bool
    @FocusState var isSearchFocused: Bool

    @State var composerState = ConversationComposerState()
    @State var headerState = ConversationHeaderState()

    // Overlay & Detail state
    @State var overlayState = ConversationOverlayState()

    /// Per-cell screen-frame map populated by `MessageFramePreferenceKey`
    /// publishes from each `BubbleSwipeContainer`. The long-press handler
    /// looks up the target message's frame here at gesture fire time and
    /// passes it to `MessageOverlayMenu` as the source frame.
    @State var frameTracker = MessageFrameBox()
    @State var searchDebounce = SearchDebounceBox()

    /// Publisher stable (référence identique à chaque body eval) : l'inline
    /// dans scrollToBottomButton reconstruisait l'abonnement au coordinator à
    /// chaque frappe. Le mapping vers le bool dérivé se fait dans la closure
    /// onReceive (l'id d'attachment non-lu change avec les messages entrants).
    let scrollButtonAudioStatePublisher = ConversationAudioCoordinator.sharedForTesting
        .$activeContext
        .combineLatest(ConversationAudioCoordinator.sharedForTesting.$isPlaying)
        .eraseToAnyPublisher()

    // Scroll, Media & Swipe state
    @State var scrollState = ConversationScrollState()
    @State var composerHeight: CGFloat = 130
    /// Hauteur de composer sur laquelle le bouton « redescendre en bas » est
    /// ancré. FIGÉE tant qu'un message est en cours de rédaction : voir
    /// `resolvedScrollButtonAnchor(current:composerHeight:isComposing:)`.
    @State var composerScrollButtonAnchor: CGFloat = 130
    /// La dernière animation ANNONCÉE par le clavier — hauteur d'arrivée,
    /// durée et courbe (`ConversationView+Keyboard`). Sa hauteur gèle la mesure
    /// du composeur ; sa courbe est celle sur laquelle le fil rejoint sa
    /// réserve basse, au lieu de s'y téléporter (#4949).
    @State var keyboardTransition: KeyboardTransition?

    let defaultReactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "💯", "😍", "👀", "🤣", "💪", "✨", "🥺"]

    // MARK: - Composer Height Measurement & Draft

    /// Le brouillon (sauvegarde et reprise) vit dans `ConversationDraftCoordinator` ;
    /// la vue lui remet son état à chaque appel, elle n'en garde aucune copie.
    private var draftCoordinator: ConversationDraftCoordinator {
        ConversationDraftCoordinator(viewModel: viewModel, isDirect: isDirect, participantUserId: conversation?.participantUserId)
    }

    private func persistDraft(text: String) {
        draftCoordinator.persist(text: text, composerState: composerState)
    }

    private func persistDraftAttachmentsForBackground() {
        draftCoordinator.persistAttachmentsForBackground(text: composerText.text, composerState: composerState)
    }

    private func updateComposerHeight(_ contentHeight: CGFloat) {
        // La marge basse de la fenêtre qui PORTE la conversation : en Split View / Stage Manager,
        // celle d'une AUTRE fenêtre (scène d'arrière-plan, puis fenêtre clé) dimensionnait le composer.
        guard let height = ConversationViewRules.resolvedComposerHeight(
            contentHeight: contentHeight,
            keyboardHeight: keyboardHeight,
            safeAreaBottom: windowInsets.bottom
        ) else { return }
        composerHeight = height
        composerScrollButtonAnchor = ConversationViewRules.resolvedScrollButtonAnchor(
            current: composerScrollButtonAnchor,
            composerHeight: height,
            isComposing: !composerText.text.isEmpty
        )
    }

    // MARK: - Computed Properties

    var headerStoryRingState: StoryRingState {
        guard conversation?.type == .direct,
              let userId = conversation?.participantUserId else { return .none }
        return storyViewModel.storyRingState(forUserId: userId)
    }

    var accentColor: String {
        liveConversation?.displayPalette(isDark: isDark).primary ?? DynamicColorGenerator.colorForName(conversation?.name ?? "Unknown")
    }

    var secondaryColor: String {
        liveConversation?.displayPalette(isDark: isDark).secondary ?? MeeshyColors.indigo300Hex
    }

    var isDirect: Bool {
        conversation?.type == .direct
    }

    /// DM participant the current user has (outgoing) blocked — drives the
    /// composer "unblock to chat" zone. `nil` when not a DM, no participant, or
    /// not blocked. Only outgoing blocks are known client-side (product
    /// decision); incoming blocks surface as a gateway send error.
    var blockedDirectParticipantId: String? {
        guard isDirect, let uid = conversation?.participantUserId,
              blockService.isBlocked(userId: uid) else { return nil }
        return uid
    }

    var cachedLastReceivedIndex: Int? {
        viewModel.cachedLastReceivedIndex
    }

    var headerPresenceState: PresenceState {
        guard isDirect, let userId = conversation?.participantUserId else { return .offline }
        return presenceManager.presenceState(for: userId)
    }

    var headerMoodEmoji: String? {
        guard isDirect, let userId = conversation?.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)?.moodEmoji
    }

    var conversationSection: ConversationSection? {
        guard let sectionId = conversation?.userState.sectionId else { return nil }
        return ConversationViewRules.section(withId: sectionId)
    }

    var topActiveMembers: [ConversationActiveMember] {
        viewModel.topActiveMembersList(accentColor: accentColor)
    }

    var isCurrentUserAdminOrMod: Bool {
        let convRole = conversation?.currentUserRole?.uppercased() ?? ""
        let platformRole = AuthManager.shared.currentUser?.role?.uppercased() ?? ""
        let modRoles: Set<String> = ["ADMIN", "MODERATOR", "BIGBOSS"]
        return modRoles.contains(convRole) || modRoles.contains(platformRole)
    }

    // MARK: - Init

    init(conversation: Conversation?, replyContext: ReplyContext? = nil, anonymousSession: AnonymousSessionContext? = nil, previewMode: Bool = false, showsOwnConnectionBanner: Bool = false, onOpenFullConversation: (() -> Void)? = nil, forcedReadingMode: ReadingModeOrchestrator.ConversationReadingMode? = nil, landsOnMessage: Bool = false) {
        self.conversation = conversation
        self.replyContext = replyContext
        self.anonymousSession = anonymousSession
        self.previewMode = previewMode
        self.showsOwnConnectionBanner = showsOwnConnectionBanner
        self.onOpenFullConversation = onOpenFullConversation
        self.forcedReadingMode = forcedReadingMode
        let vm = ConversationViewModel(
            conversationId: conversation?.id ?? "",
            unreadCount: conversation?.userState.unreadCount ?? 0,
            isDirect: conversation?.type == .direct,
            participantUserId: conversation?.participantUserId,
            memberJoinedAt: conversation?.currentUserJoinedAt,
            // Frontière de lecture (#7198/#7222) — reprise SYNCHRONE de la
            // ligne de liste qui ouvre ce fil, même idiome que
            // `memberJoinedAt` juste au-dessus (voir le doc-comment de ces
            // trois champs sur `ConversationViewModel`).
            lastReadMessageId: conversation?.userState.lastReadMessageId,
            lastReadAt: conversation?.userState.lastReadAt,
            lastReadMessageCreatedAt: conversation?.userState.lastReadMessageCreatedAt,
            closedAt: conversation?.closedAt,
            anonymousSession: anonymousSession
        )
        _viewModel = StateObject(wrappedValue: vm)

        // WS-7 (F-086, A6) — décision de l'orchestrateur, ICI, UNE SEULE
        // FOIS. `identity`/`capabilities`/`isFlagEnabled` sont les mêmes
        // entrées que celles déjà lues plus haut pour `vm` — aucune seconde
        // résolution invité/inscrit (§5.1 : `ConversationViewerIdentityResolver`
        // est l'UNIQUE point de branchement).
        let identity = ConversationViewerIdentityResolver.resolve(
            authManager: AuthManager.shared,
            anonymousSession: anonymousSession
        )
        let isFlagEnabled = MeeshyFeatureFlags.isReadingModesEnabled
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(.init(
            identity: identity.readingModeIdentity,
            isFlagEnabled: isFlagEnabled,
            // Rivière iOS, lot 1 (2026-08-21) : le drapeau `riviere_mode` rend
            // `.river` sélectionnable à l'ouverture du fil (`ConversationRiverLayer`).
            isRiverFlagEnabled: LentilleFeatureFlag.isRiviereModeEnabled,
            conversationType: ConversationViewRules.readingModeConversationType(for: conversation?.type),
            activeParticipantCount: conversation?.memberCount ?? 0
        ))
        _readingModeController = StateObject(wrappedValue: ReadingModeController(
            conversationId: conversation?.id ?? "",
            scope: identity.scope,
            unreadCount: conversation?.userState.unreadCount ?? 0,
            capabilities: capabilities,
            isFlagEnabled: isFlagEnabled,
            forcedMode: forcedReadingMode, landsOnMessage: landsOnMessage
        ))
        // Même `capabilities` locale que ci-dessus — pas de seconde résolution
        // (§WS-7 travail 5, arbitrage F-086bis) : le catalogue de la feuille
        // Lentille lit `readingModeCapabilities`, jamais un recalcul.
        self.readingModeCapabilities = capabilities

        // Écart #4 (accepté, arbitrage F-086bis) : ce chemin drapeau-ON de `init`
        // ne se prouve pas par construction directe en test (`ConversationViewModel.init`
        // ouvre de vrais GRDB/réseau, sans point d'injection) — il est couvert par
        // `ConversationViewReadingModeInitTests` (cas purs de `readingModeConversationType`)
        // et `ConversationViewReadingModeSourceGuardTests` (preuves par lecture de source).
    }

    /// Hauteur de la bande de boutons de l'en-tête flottant, sous la safe
    /// area : une rangée à la cible tactile HIG (`meeshyTapTarget`, 44) plus
    /// le retrait haut que `expandedHeaderBand` s'applique. C'est la seule
    /// cote de CE fichier que la Rivière consomme — la peau, elle, ne connaît
    /// que ses propres tokens (`RiverMetrics`).
    static let riverHeaderClearance: CGFloat = 44 + MeeshySpacing.sm

    // MARK: - Body

    var body: some View {
        bodyStage
            .modifier(ConversationBodyLifecycle(
                allowsEdgeSwipe: readingModeController.mode != .river,
                accessRevoked: viewModel.accessRevoked,
                keyboardTransition: $keyboardTransition,
                actions: lifecycleActions))
            .modifier(ConversationRouterWatch(
                signals: ConversationRouterSignals(
                    pendingOpenSearch: router.pendingOpenSearch,
                    pendingHighlightMessageId: router.pendingHighlightMessageId,
                    replyContextVersion: router.replyContextVersion),
                openSearch: { await consumePendingOpenSearch() },
                consumeHighlight: { await consumePendingHighlightMessage() },
                applyReplyContext: { applyPendingReplyContext() }))
            .modifier(ConversationDraftPersistenceWatch(
                keys: draftKeys,
                isNearBottom: scrollState.isNearBottom,
                isTyping: isTyping,
                persist: { persistDraft(text: composerText.text) },
                closeEmojiPanel: { closeComposerEmojiPanel() }))
            .modifier(ConversationBodyCovers(
                viewModel: viewModel, composerState: $composerState, scrollState: $scrollState,
                overlayState: $overlayState, conversation: conversation, accentColor: accentColor,
                isDark: isDark, isGuest: anonymousSession != nil, isAdminOrMod: isCurrentUserAdminOrMod,
                mediaSaveCoordinator: mediaSaveCoordinator, onReply: { triggerReply(for: $0) },
                actions: messageActions))
            .modifier(ConversationBodySheets(
                headerState: $headerState, overlayState: $overlayState, composerState: $composerState,
                scrollState: $scrollState, conversation: liveConversation, accentColor: accentColor,
                messages: viewModel.messages, router: router,
                onConversationUpdated: { admitRepainted($0) },
                onVoiceConsentAccept: {
                    viewModel.grantVoiceAutoTranslationConsent()
                    sendMessageWithAttachments()
                },
                onVoiceConsentLater: { sendMessageWithAttachments() },
                deleteAnchor: { messageDeleteConfirmationAnchor },
                forwardPicker: { forwardPicker(for: $0) }))
            .modifier(ConversationBodyOverlayMenu(
                overlayState: $overlayState, focalFullscreenPlace: $focalFullscreenPlace,
                focalShareFileItem: $focalShareFileItem, viewModel: viewModel, frameTracker: frameTracker,
                accentColor: accentColor, isDirect: isDirect, isAdminOrMod: isCurrentUserAdminOrMod,
                mediaSaveCoordinator: mediaSaveCoordinator, actions: messageActions,
                threadLanguage: { overlayThreadLanguage(for: $0) },
                pieceOverlay: { pieceOverlayContent(for: $0) },
                onMenuClosed: { restoreStateAfterLongPressIfNeeded() },
                placeCover: { focalPlaceFullscreen($0) }))
    }

    // MARK: - Lifecycle

    private var lifecycleActions: ConversationLifecycleActions {
        ConversationLifecycleActions(
            startup: { await runConversationStartup() },
            didAppear: { conversationDidAppear() },
            didDisappear: { conversationDidDisappear() },
            willResignActive: { composerText.flushPendingChange() },
            didEnterBackground: { conversationDidEnterBackground() },
            accessRevoked: { conversationAccessWasRevoked() }
        )
    }

    private var draftKeys: ConversationDraftKeys {
        ConversationDraftKeys(
            replyMessageId: composerState.pendingReplyReference?.messageId,
            language: composerState.selectedLanguage,
            effectsRaw: viewModel.pendingEffects.flags.rawValue,
            blur: viewModel.isBlurEnabled,
            ephemeral: viewModel.ephemeralChoice?.storageValue
        )
    }

    /// Surlignage demandé par le routeur (`ConversationHighlightConsumer`).
    private func consumePendingHighlightMessage() async {
        await ConversationHighlightConsumer(
            router: router, conversationId: conversation?.id, viewModel: viewModel,
            scrollTo: { scrollState.scrollToMessageId = $0; scrollState.scrollToMessageTrigger += 1 }
        ).consume()
    }

    /// Réponse à un mood affiché dans la barre directe courante : la vue est
    /// déjà à l'écran, `onAppear` ne se redéclenche pas. Un contexte refusé ici
    /// (autre conversation) reste en attente pour SON DM.
    private func applyPendingReplyContext() {
        guard let ctx = router.pendingReplyContext,
              applyReplyContext(ctx, openingConversation: false) else { return }
        router.pendingReplyContext = nil
    }

    /// Active le ViewModel VIVANT (retenu par `@StateObject`) exactement une
    /// fois. Les effets lourds (observation GRDB, chargement initial, abonnements
    /// Combine, porte du moteur de synchro) sont différés ici hors de `init` : les
    /// ViewModels jetables que SwiftUI alloue à chaque reconstruction restent
    /// gratuits — voir `ConversationViewModel.start()`.
    private func runConversationStartup() async {
        restoreHeaderMemory()
        viewModel.start()
        viewModel.observeSync()
        await viewModel.loadMessages()
        // Ouvrir une conversation, c'est en regarder le bas. Le signal near-bottom
        // ne se déclenche pas ici (l'état naît déjà « au bas », donc sans
        // transition) — d'où cette demande explicite, reprise au réveil suivant
        // si les cellules n'ont pas encore paru.
        scrollState.flushSeenTrigger += 1
        MessageSocketManager.shared.connect()
        await consumePendingHighlightMessage()
        await consumePendingOpenSearch()
    }

    private func conversationDidAppear() {
        if let context = replyContext { applyReplyContext(context, openingConversation: true) }
        if let lang = ConversationViewRules.defaultComposeLanguage(
            preferredContentLanguage: AuthManager.shared.currentUser?.preferredContentLanguages.first,
            keyboardPrimaryLanguage: UITextInputMode.activeInputModes.first?.primaryLanguage,
            supportedCodes: Set(LanguageOption.defaults.map(\.code))
        ) { composerState.selectedLanguage = lang }
        // Persistance du brouillon (immédiate à chaque fin de mot / champ vidé,
        // débouncée 400 ms en milieu de mot) : elle vit sur le modèle isolé, la
        // racine ne se ré-évalue plus à la frappe. La closure capture une copie
        // de la vue mais lit les @State via leur stockage LIVE.
        composerText.onPersistNeeded = { text in
            persistDraft(text: text)
        }
        if let restoration = draftCoordinator.restore(from: composerState, composerText: composerText) {
            composerState = restoration.composerState
            if let media = restoration.media {
                Task { await restoreDraftThumbnails(attachments: media.attachments, files: media.files) }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { overlayState.longPressEnabled = true }
    }

    /// Le debounce de 400 ms a remplacé la persistance par frappe : `onDisappear`
    /// ne couvre que la navigation, d'où le flush de `willResignActive`.
    private func conversationDidDisappear() {
        composerText.flushPendingChange()
        if audioRecorder.isRecording { _ = stopRecordingToAttachment() } // iPad : panneau, fenêtre redimensionnée — le vocal rejoint le plateau, il n'est plus jeté
        persistDraftAttachmentsForBackground() // iPad : un panneau REMPLACE la vue, le plateau n'y survivait pas
        // #7500 — la sortie par NAVIGATION, jumelle de celle du passage en arrière-plan.
        leaveConversationByNavigation()
        // Rompt le cycle de rétention modèle → closure → copie de la vue → State
        // box → modèle ; `onAppear` réinstalle le callback si la vue revient.
        composerText.onPersistNeeded = nil
        // Arrêt déterministe du player local (aperçu d'audio en attente). Idempotent.
        pendingAudioPlayer.stop()
    }

    private func conversationDidEnterBackground() {
        scrollState.flushSeenTrigger += 1
        persistDraftAttachmentsForBackground()
        consumeOpenedViewOnceOnExit()
    }

    private func conversationAccessWasRevoked() {
        FeedbackToastManager.shared.showError(viewModel.error ?? String(localized: "conversation.accessRevoked", bundle: .main))
        if anonymousSession != nil { dismiss() } else { router.pop() } // iPad : `dismiss()` y est un no-op
    }

    // MARK: - La scène

    private var bodyStage: some View {
        ConversationBodyStage(
            showsSkeleton: viewModel.paginationPhase.isBlockingSpinnerNeeded && viewModel.messages.isEmpty,
            skeletonBottomInset: composerHeight + MeeshySpacing.xxl,
            readingMode: readingModeController.mode,
            quickReactionMessageId: overlayState.quickReactionMessageId,
            showsOwnConnectionBanner: showsOwnConnectionBanner,
            error: viewModel.error,
            showOptions: composerState.showOptions,
            hidesComposerChrome: hidesComposerChromeForScroll,
            showTextEmojiPicker: composerState.showTextEmojiPicker,
            hasMentionQuery: viewModel.activeMentionQuery != nil,
            onDismissError: { viewModel.error = nil },
            onLeaveSummary: { viewModel.markCaughtUpFromSummaryOrRiver() },
            background: { conversationBackground },
            reader: { readerModeBranch },
            list: { messageListLayer },
            header: { floatingHeaderSection },
            quickReaction: { quickReactionBarOverlay(for: $0) },
            connectionBanner: {
                ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: isStoryViewerPresenting, activeConversationId: { viewModel.conversationId })
            },
            scrollToBottom: { scrollToBottomBranch },
            dock: { composerDock },
            searchOverlay: { searchResultsBlurOverlay }
        )
        .modifier(ComposerDropTargetModifier(
            accentColor: accentColor,
            isEnabled: ComposerDropTargetModifier.acceptsDrops(
                isSelecting: overlayState.isSelectionModeActive,
                isBlockedDirect: blockedDirectParticipantId != nil,
                isClosed: viewModel.isConversationClosed,
                isWriteRestricted: viewModel.writeRestriction(served: liveConversation?.viewerWriteRestriction) != nil
            ),
            onIngest: { ingestRespectingGuestAllowance($0) }
        ))
    }

    private var readerModeBranch: ConversationReaderModeBranch {
        ConversationReaderModeBranch(
            mode: readingModeController.mode,
            viewModel: viewModel,
            conversationId: conversation?.id,
            topInset: previewMode ? 0 : windowInsets.top + Self.riverHeaderClearance,
            bottomInset: composerHeight + 16 + (previewMode ? 0 : windowInsets.bottom),
            isDark: isDark,
            isAnonymous: isAnonymous,
            scrollState: $scrollState,
            overlayState: $overlayState,
            showScript: { readingModeController.select(.script) },
            reply: { triggerReply(for: $0) },
            openViewOnce: { openViewOnce(messageId: $0) },
            openMedia: openMediaFullscreen
        )
    }

    private var scrollToBottomBranch: some View {
        ConversationScrollToBottomBranch(
            isShown: Self.showsScrollToBottomButton(
                isNearBottom: scrollState.isNearBottom,
                isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
                isInJumpedState: viewModel.isInJumpedState),
            stateStore: viewModel.stateStore,
            bottomAnchor: composerScrollButtonAnchor,
            isNearBottom: scrollState.isNearBottom,
            isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
            isInJumpedState: viewModel.isInJumpedState
        ) { typing in
            scrollToBottomButton(typing: typing)
        }
    }

    private var composerDock: some View {
        ConversationComposerDock(
            viewModel: viewModel, composerText: composerText, composerState: $composerState,
            accentColor: accentColor, isDark: isDark, onHeightChange: updateComposerHeight
        ) {
            if overlayState.isSelectionModeActive {
                selectionToolbar
            } else if let blockedId = blockedDirectParticipantId {
                blockedComposerZone(userId: blockedId)
            } else {
                composerOrReadOnlyZone
            }
        }
    }

    /// **La couche de la liste de messages, SORTIE du cadre de la scène** (#6213 bis) :
    /// `ConversationMessageListLayer` porte le pont UIKit et ses rappels ; l'hôte
    /// ne lui remet que ses marges, ses états liés et ses gestes.
    private var messageListLayer: ConversationMessageListLayer {
        ConversationMessageListLayer(
            viewModel: viewModel,
            scrollState: $scrollState,
            overlayState: $overlayState,
            focalFullscreenPlace: $focalFullscreenPlace,
            focalShareFileItem: $focalShareFileItem,
            accentColor: accentColor,
            isDirect: isDirect,
            // Le représentable court jusqu'au bord BAS physique : la safe area
            // qu'il traverse s'ajoute à la réserve du composeur (repos du fil
            // inchangé). 0 en preview (`.sheet` déjà sous la status bar, #8822).
            insets: ConversationListInsets(
                bottom: composerHeight + 16 + (previewMode ? 0 : windowInsets.bottom),
                bottomTransition: listInsetTransition,
                top: previewMode ? 0 : windowInsets.top,
                headerBand: headerState.bandHeight
            ),
            isHeaderExpanded: composerState.showOptions,
            readingMode: readingModeController.mode,
            isAdminOrMod: isCurrentUserAdminOrMod,
            messageActions: messageActions,
            actions: ConversationMessageListActions(
                toggleSelection: { toggleMessageSelection($0) },
                presentMenu: { presentLongPressMenu(for: $0, cellFrame: $1, pieceId: $2) },
                openMedia: openMediaFullscreen,
                openViewOnce: { openViewOnce(messageId: $0) },
                focalPlace: { makeFocalFullscreenPlace($0, messageId: $1) }
            )
        )
    }

    /// Les gestes d'un message que les menus, les feuilles et la liste rendent
    /// à l'hôte : la citation, l'édition, la sélection, l'export se composent ICI.
    private var messageActions: ConversationMessageActions {
        ConversationMessageActions(
            reply: { triggerReply(for: $0) },
            beginSelection: { beginSelectionMode(seedingWith: $0) },
            deleteMedia: { deleteMedia(targeted: nil, of: $0) },
            requestDelete: { requestDeleteMessage($0) },
            edit: { beginEdit($0) },
            export: { beginMessageExport($0, quick: $1) },
            compose: { composerState.composeMediaTarget = ComposerSeedTarget(message: $0) }
        )
    }

    // MARK: - Floating Header Section

    private var isAnonymous: Bool { anonymousSession != nil }

    private var hidesEntireHeaderForScroll: Bool {
        ConversationViewRules.hidesEntireHeader(
            usesFlatRow: readingModeController.mode.usesFlatRow,
            isScrollingList: scrollState.isScrollingActiveList,
            isSearchOpen: headerState.showSearch
        )
    }

    private var hidesComposerChromeForScroll: Bool {
        ConversationViewRules.hidesComposerChrome(
            usesFlatRow: readingModeController.mode.usesFlatRow,
            isScrollingList: scrollState.isScrollingActiveList,
            isSearchOpen: headerState.showSearch,
            isEmojiPanelOpen: composerState.showTextEmojiPicker,
            hasMentionSuggestions: viewModel.activeMentionQuery != nil
        )
    }

    private var hidesHeaderActionsForScroll: Bool {
        ConversationViewRules.hidesHeaderActions(
            isScrollingList: scrollState.isScrollingActiveList,
            isSearchOpen: headerState.showSearch
        )
    }

    /// Frontière NOMINALE `ConversationFloatingHeaderSection` (#6213 bis) : les
    /// quatre branches se succèdent dans le cadre de leur closure au lieu de
    /// s'additionner dans celui de l'hôte (565 712 octets mesurés).
    private var floatingHeaderSection: some View {
        ConversationFloatingHeaderSection(
            isAnonymous: isAnonymous,
            isTyping: isTyping && headerLayout.yieldsToTypingBar,
            showSearch: headerState.showSearch,
            showOptions: composerState.showOptions,
            hidesHeaderActions: hidesHeaderActionsForScroll,
            hidesBandForScroll: hidesEntireHeaderForScroll,
            measuresBandHeight: headerLayout.measuresBandHeight,
            anonymousBar: { anonymousHeaderBar },
            typingBar: { typingHeaderBar },
            expandedBand: { expandedHeaderBand },
            searchBar: { searchBar },
            onBandHeightChange: { headerState.bandHeight = $0 }
        )
    }

    private var anonymousHeaderBar: ConversationGuestHeaderBar {
        ConversationGuestHeaderBar(
            title: liveConversation?.displayName ?? "Conversation",
            favoriteEmoji: conversation?.userState.reaction,
            avatarURL: liveConversation?.avatar,
            accentColor: accentColor, secondaryColor: secondaryColor,
            guestLinkId: anonymousSession?.linkId, titleColor: theme.textPrimary, mutedColor: theme.textMuted
        ) { dismiss() }
    }

    /// **Frontière NOMINALE** — `ConversationExpandedHeaderBand` (#6194) : une
    /// struct `View` obtient son propre nœud dans l'AttributeGraph, une propriété
    /// calculée jamais. Chaque fente rend une struct nominale.
    private var expandedHeaderBand: some View {
        ConversationExpandedHeaderBand(
            layout: headerLayout,
            backButton: {
                ThemedBackButton(
                    color: accentColor,
                    compactMode: composerState.showOptions,
                    unreadCount: viewModel.otherConversationsUnread
                ) { HapticFeedback.light(); router.pop() }
            },
            midContent: { expandedHeaderMidContent },
            avatar: { headerAvatarView },
            background: { expandedHeaderBackground },
            share: { ConversationShareLinkSlot(conversation: liveConversation, guestLinkId: anonymousSession?.linkId, accentColor: accentColor, secondaryColor: secondaryColor) }
        )
    }

    /// Call + search buttons, grouped with zero extra spacing between them
    /// (user-requested 2026-07-11) : chaque bouton porte déjà ~8 pt de marge
    /// invisible par son `.meeshyTapTarget()` 44×44. Grappe d'ACTIONS : elle
    /// s'efface tant que la liste défile (loi commune `ScrollMotion`). L'aperçu
    /// (#9031) : « agrandir » prend la place de la loupe.
    var headerButtonsCluster: some View {
        ConversationHeaderActionsCluster(
            callButtons: { headerCallButtons },
            searchButton: { headerSearchSlot },
            readingModeCluster: { readingModeAffordanceCluster }
        )
    }

    private var readingModeAffordanceCluster: ConversationReadingModeAffordance {
        ConversationReadingModeAffordance(
            controller: readingModeController,
            capabilities: readingModeCapabilities,
            accentColor: accentColor
        )
    }

    /// Title + tags column shown when the composer-options drawer is open
    /// (`ConversationHeaderTitleBlock`) : la bande DÉPLIÉE ne porte AUCUN bouton
    /// d'action — titre + tags/catégorie seulement (arbitrage user 2026-08-18).
    var expandedHeaderTitleAndTags: some View {
        ConversationHeaderTitleBlock(
            title: liveConversation?.displayName ?? "Conversation",
            accessibilityName: liveConversation?.name ?? "Conversation",
            favoriteEmoji: conversation?.userState.reaction,
            isDark: isDark,
            isDirect: conversation?.type == .direct,
            isRevalidating: viewModel.isRevalidating,
            tags: { headerTagsRow },
            onOpenInfo: { composerState.showConversationInfo = true },
            onOpenProfile: {
                if let conv = conversation, let profileUser = ProfileSheetUser.from(conversation: conv) {
                    router.deepLinkProfileUser = profileUser
                }
            }
        )
    }

    private var expandedHeaderBackground: ConversationHeaderGlass {
        ConversationHeaderGlass(shape: headerLayout.glassShape, accentColor: accentColor, secondaryColor: secondaryColor)
    }
}
