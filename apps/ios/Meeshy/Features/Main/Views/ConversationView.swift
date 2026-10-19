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
    @Environment(\.scenePhase) private var scenePhase
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
        bodyWithSheets
    }

    private var bodyWithSheets: AnyView {
        AnyView(
        bodyWithCovers
            .modifier(ConversationStoryViewerCovers(headerState: $headerState, overlayState: $overlayState))
            .modifier(ConversationInfoSheetLayer(
                isPresented: $composerState.showConversationInfo, scrollState: $scrollState,
                conversation: liveConversation, accentColor: accentColor, messages: viewModel.messages,
                router: router, onConversationUpdated: { admitRepainted($0) }))
            .alert(String(localized: "conversation.view.action_selected", bundle: .main), isPresented: Binding(get: { composerState.actionAlert != nil }, set: { if !$0 { composerState.actionAlert = nil } })) {
                Button(String(localized: "common.ok", bundle: .main)) { composerState.actionAlert = nil }
            } message: { Text(composerState.actionAlert ?? "") }
            .modifier(ConversationVoiceConsentAlert(
                isPresented: $composerState.showVoiceAutoTranslateConsent,
                onAccept: {
                    viewModel.grantVoiceAutoTranslationConsent()
                    sendMessageWithAttachments()
                },
                onLater: { sendMessageWithAttachments() }))
            // #10806 — les confirmations de suppression s'ancrent DANS la
            // conversation (`messageDeleteConfirmationAnchor`), jamais sur la
            // racine : sur iPad, celle-ci devenait un popover posé sur la liste.
            .overlay { messageDeleteConfirmationAnchor }
            .modifier(ConversationForwardSheet(composerState: $composerState, picker: { AnyView(forwardPicker(for: $0)) }))
            // Flou du fond quand l'overlay d'appui-long est ouvert — AVANT
            // `.overlay`, pour ne flouter que la conversation, jamais le menu.
            .blur(radius: overlayState.showOverlayMenu ? 12 : 0)
            .animation(.easeOut(duration: 0.28), value: overlayState.showOverlayMenu)
            .overlay { overlayMenuContent }
            // #4004 — restitue le clavier/panneau d'options désactivés par
            // `presentLongPressMenu`, quand le menu se referme.
            .adaptiveOnChange(of: overlayState.showOverlayMenu) { _, isShowing in
                if !isShowing { restoreStateAfterLongPressIfNeeded() }
            }
            .onPreferenceChange(MessageFramePreferenceKey.self) { frames in
                frameTracker.update(frames)
            }
            // Lot 3.2 — plein écran du lieu depuis la rangée plate : mêmes
            // primitives que la bulle (`BubbleStandardLayout`,
            // `.fullScreenCover(item: $fullscreenPlace)`), présentées ICI
            // parce que la rangée vit dans une cellule de collection.
            .conversationCover(item: $focalFullscreenPlace) { focalPlaceFullscreen($0) }
            .sheet(item: $focalShareFileItem) { item in
                ShareSheet(activityItems: [item.url])
            }
        )
    }

    private var bodyWithCovers: AnyView {
        AnyView(
        bodyWithLifecycle
            // La PORTE du média reçu et l'aperçu d'un média en attente : deux plein
            // écrans, dans la couche des COVERS (voir `ConversationComposeCovers`).
            .modifier(ConversationComposeCovers(composerState: $composerState, accentColor: accentColor))
            .modifier(ConversationMediaGalleryLayer(
                viewModel: viewModel, scrollState: $scrollState,
                composerState: $composerState, accentColor: accentColor,
                onReply: { triggerReply(for: $0) }))
            .mediaSaveFlow(mediaSaveCoordinator)
            .modifier(ConversationMessageSheets(
                viewModel: viewModel, overlayState: $overlayState, conversation: conversation,
                accentColor: accentColor, isDark: isDark, isGuest: anonymousSession != nil,
                isAdminOrMod: isCurrentUserAdminOrMod, mediaSaveCoordinator: mediaSaveCoordinator,
                actions: messageActions))
        )
    }

    /// Surlignage demandé par le routeur (`ConversationHighlightConsumer`).
    private func consumePendingHighlightMessage() async {
        await ConversationHighlightConsumer(
            router: router, conversationId: conversation?.id, viewModel: viewModel,
            scrollTo: { scrollState.scrollToMessageId = $0; scrollState.scrollToMessageTrigger += 1 }
        ).consume()
    }

    private var bodyWithLifecycle: AnyView {
        AnyView(
        bodyContent
            .background(InteractivePopEnabler(allowsEdgeSwipe: readingModeController.mode != .river))
            .task {
                // Activate the live (StateObject-retained) VM exactly once.
                // Heavy side-effects (GRDB observation, initial load, Combine
                // subscriptions, sync-engine gate) are deferred here out of
                // `init` so the throwaway VMs SwiftUI allocates on every
                // reconstruction stay free — see ConversationViewModel.start().
                restoreHeaderMemory()
                viewModel.start()
                viewModel.observeSync()
                await viewModel.loadMessages()
                // Ouvrir une conversation, c'est en regarder le bas. Le signal
                // near-bottom ne se déclenche pas ici (l'état naît déjà « au
                // bas », donc sans transition) — d'où cette demande explicite,
                // reprise au réveil suivant si les cellules n'ont pas encore paru.
                scrollState.flushSeenTrigger += 1
                MessageSocketManager.shared.connect()

                await consumePendingHighlightMessage()

                await consumePendingOpenSearch()
            }
            .adaptiveOnChange(of: router.pendingOpenSearch) { _, wanted in
                if wanted { Task { await consumePendingOpenSearch() } }
            }
            // Tap de notification pour la conversation DÉJÀ à l'écran : `path`
            // reçoit le même id, la vue n'est pas recréée et `.task` ne rejoue
            // pas — consommer le highlight à chaud.
            .adaptiveOnChange(of: router.pendingHighlightMessageId) { _, newValue in
                guard let newValue, !newValue.isEmpty else { return }
                Task { await consumePendingHighlightMessage() }
            }
            .onAppear {
                if let context = replyContext { applyReplyContext(context, openingConversation: true) }
                if let lang = ConversationViewRules.defaultComposeLanguage(
                    preferredContentLanguage: AuthManager.shared.currentUser?.preferredContentLanguages.first,
                    keyboardPrimaryLanguage: UITextInputMode.activeInputModes.first?.primaryLanguage,
                    supportedCodes: Set(LanguageOption.defaults.map(\.code))
                ) { composerState.selectedLanguage = lang }
                // Persistance du brouillon (immédiate à chaque fin de mot / champ
                // vidé, débouncée 400 ms en milieu de mot — cf.
                // ConversationComposerTextModel) : elle vit sur le modèle isolé, la
                // racine ne se ré-évalue plus à la frappe. La closure capture une
                // copie de la vue mais lit les @State via leur stockage LIVE.
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
            .adaptiveOnChange(of: router.replyContextVersion) { _, _ in
                // Réponse à un mood affiché dans la barre directe courante : la vue
                // est déjà à l'écran, `onAppear` ne se redéclenche pas. Un contexte
                // refusé ici (autre conversation) reste en attente pour SON DM.
                guard let ctx = router.pendingReplyContext,
                      applyReplyContext(ctx, openingConversation: false) else { return }
                router.pendingReplyContext = nil
            }
            .adaptiveOnChange(of: composerState.pendingReplyReference?.messageId) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: composerState.selectedLanguage) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.pendingEffects.flags.rawValue) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.isBlurEnabled) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: viewModel.ephemeralChoice?.storageValue) { _, _ in persistDraft(text: composerText.text) }
            .adaptiveOnChange(of: scrollState.isNearBottom) { _, _ in
                if composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { composerState.showTextEmojiPicker = false }
                }
            }
            .adaptiveOnChange(of: isTyping) { _, focused in
                if focused && composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { composerState.showTextEmojiPicker = false }
                }
            }
            .adaptiveOnChange(of: scenePhase) { _, phase in
                // Revenir au premier plan ne marque plus la conversation lue :
                // l'observateur de visibilité reprend et signalera ce qui est
                // effectivement à l'écran.
                // Pièces jointes du brouillon : copie durable au passage en
                // background (les fichiers du tray vivent dans tmp/, purgeable
                // par iOS) — miroir du D1 story. Rebuild complet : la vérité
                // est l'état courant du tray.
                if phase == .background {
                    // Ce qui était à l'écran a bien été lu : le signaler AVANT
                    // que l'app ne s'endorme, sinon l'accusé attend le retour
                    // en avant-plan — ou le démontage de la vue.
                    scrollState.flushSeenTrigger += 1
                    persistDraftAttachmentsForBackground()
                    // #7500 — « quitter, c'est quitter » : l'arrière-plan et le
                    // verrouillage sont des sorties au même titre que le
                    // retour. Les deux portes appellent le MÊME geste, qui est
                    // idempotent — la seconde ne trouve plus rien.
                    consumeOpenedViewOnceOnExit()
                }
            }
            .adaptiveOnChange(of: viewModel.accessRevoked) { _, revoked in
                // Server signalled the user no longer has access to this
                // conversation (kicked, group deleted, blocked, etc.). The
                // ViewModel has already wiped per-conversation cache and
                // local message state. We dismiss the screen here and
                // surface a toast so the user knows why.
                guard revoked else { return }
                FeedbackToastManager.shared.showError(viewModel.error ?? String(localized: "conversation.accessRevoked", bundle: .main))
                if anonymousSession != nil { dismiss() } else { router.pop() } // iPad : `dismiss()` y est un no-op
            }
            .observingKeyboardTransition($keyboardTransition)
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                // Le debounce de 400 ms a remplacé la persistance par frappe :
                // sans ce flush, backgrounder l'app (ou la tuer depuis
                // l'app-switcher) dans la fenêtre de debounce perdrait la fin
                // de la saisie — onDisappear ne couvre que la navigation.
                composerText.flushPendingChange()
            }
            .onDisappear {
                composerText.flushPendingChange()
                if audioRecorder.isRecording { _ = stopRecordingToAttachment() } // iPad : panneau, fenêtre redimensionnée — le vocal rejoint le plateau, il n'est plus jeté
                persistDraftAttachmentsForBackground() // iPad : un panneau REMPLACE la vue, le plateau n'y survivait pas
                // #7500 — la sortie par NAVIGATION. Jumelle de celle du passage
                // en arrière-plan ci-dessus : une vue unique lue ici ne
                // survivra pas au retour.
                leaveConversationByNavigation()
                // Rompt le cycle de rétention modèle → closure → copie de la vue →
                // State box → modèle : sans ce nil, le modèle ET le
                // ConversationViewModel fuiteraient à chaque teardown. onAppear
                // réinstalle le callback si la vue revient (retour d'un
                // fullScreenCover/sheet) — aucune frappe n'est possible pendant
                // qu'elle est couverte.
                composerText.onPersistNeeded = nil
                // Arrêt déterministe du player local (preview d'audio en attente) :
                // sans lui, l'audio continuait jusqu'au dealloc du @StateObject et
                // la session restait acquise (refcount) le temps de la libération. Idempotent.
                pendingAudioPlayer.stop()
            }
        )
    }

    // MARK: - Body Content (extracted to help type-checker)

    /// **La couche de la liste de messages, SORTIE du cadre de `bodyContent`** (#6213 bis) :
    /// `ConversationMessageListLayer` porte le pont UIKit et ses rappels ; l'hôte
    /// ne lui remet que ses marges, ses états liés et ses gestes.
    private var messageListLayer: some View {
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

    private var bodyContent: AnyView {
        AnyView(
        ZStack {
            conversationBackground

            // Cold-start skeleton: shown ONLY while the initial fetch is
            // in flight AND no cached messages exist yet. Renders above
            // the (empty) MessageListView so the layout stays stable
            // when the first batch lands and the placeholder fades out.
            if viewModel.paginationPhase.isBlockingSpinnerNeeded && viewModel.messages.isEmpty {
                // AnyView : même débordement de pile Swift que la chaîne header
                // (voir `floatingHeaderSection`), porté ici par le nombre de
                // branches conditionnelles du ZStack top-level (2026-08-17).
                AnyView(
                    ConversationMessageSkeleton(bottomInset: composerHeight + MeeshySpacing.xxl)
                        .transition(.opacity)
                        .zIndex(1)
                )
            }

            // WS-9 (F-088) — le mode `.summary` route vers un HÔTE DÉDIÉ
            // (contrat §WS-9 : « le mode résumé a peut-être besoin d'un hôte
            // dédié »), ADDITIF à ce ZStack — aucun site F-085/086bis
            // (`MessageListView` et ses closures ci-dessous) n'est touché.
            // `LivingSummaryHost` construit son propre `@StateObject` — ce
            // site d'appel ne passe que des primitives, zéro `@State` neuf
            // ici. `zIndex(80)` : au-dessus du fil/composer/scroll-to-bottom
            // (≤ 60) et de `previewMode` (49), en-dessous du header flottant
            // (100, toujours joignable) et de la barre d'erreur/quick-reaction
            // (97/99, sans objet en mode résumé).
            // Chantier Rivière iOS, lot 1 (2026-08-21) — le mode `.river` route
            // vers un HÔTE DÉDIÉ, comme `.summary` : la géométrie vient de la
            // loi partagée (`RiverLaneResolver`), le texte du Prisme (traduction
            // préférée ou original), et un avis système n'est la voix de
            // personne (`RiverConversationMapping`).
            if readingModeController.mode == .river {
                // La Rivière est LARGE par nature : elle ne doit jamais élargir ce ZStack
                // (voir la couche). Le pane monte JUSQU'AU bord physique haut —
                // `topInset` porte déjà la safe area.
                AnyView(ConversationRiverLayer(
                    viewModel: viewModel,
                    conversationId: conversation?.id,
                    // Îlot dynamique + bande de l'en-tête flottant (zIndex 100) : la
                    // Rivière pingle ses couloirs en haut de son pane, elle commence
                    // SOUS l'en-tête — contrairement au fil.
                    topInset: previewMode ? 0 : windowInsets.top + Self.riverHeaderClearance,
                    // R-7 : la même réserve basse que le fil.
                    bottomInset: composerHeight + 16 + (previewMode ? 0 : windowInsets.bottom),
                    scrollState: $scrollState,
                    overlayState: $overlayState,
                    showScript: { readingModeController.select(.script) },
                    reply: { triggerReply(for: $0) },
                    openViewOnce: { openViewOnce(messageId: $0) },
                    openMedia: openMediaFullscreen
                ))
                .ignoresSafeArea(edges: .top)
                .zIndex(80)
                .transition(.opacity)
            }

            if readingModeController.mode == .summary {
                // AnyView : même coupe que ci-dessus (contribue au débordement
                // de pile de `bodyContent`, 2026-08-17).
                AnyView(ConversationSummaryLayer(
                    viewModel: viewModel,
                    isDark: isDark,
                    isAnonymous: isAnonymous,
                    scrollState: $scrollState,
                    showScript: { readingModeController.select(.script) },
                    reply: { triggerReply(for: $0) }
                ))
                // 2b-2 — le Résumé Vivant naissait VIDE quand il était le mode
                // d'OUVERTURE : l'identité bascule EXACTEMENT une fois, au
                // passage vide → peuplé, pour que l'autoclosure du `@StateObject`
                // de l'hôte se réévalue avec les messages. Ce n'est PAS
                // `showsSkeleton` qui peut garder ce basculement : il tombe à
                // `false` dès que la réponse agent arrive, donc avant la
                // première population sur base froide.
                .id(viewModel.messages.isEmpty)
                .zIndex(80)
                .transition(.opacity)
            }

            // UIKit bridge powered by GRDB store (always available after eager init)
            // Sortie du cadre de `bodyContent` (#6213 bis) — voir son doc-comment.
            messageListLayer

            // L'indicateur de frappe n'est PAS un overlay : c'est une vraie
            // cellule du flux de messages, rendue en dernier par
            // `MessageListViewController` (voir `MessageListItem.typingIndicator`).

            floatingHeaderSection

            // Quick reaction bar — a floating overlay anchored to the bubble
            // whose smiley "+" the user tapped. `quickReactionBarOverlay`
            // places the bar just below that bubble (using the cell frame
            // captured at tap time) and flips it above when the message
            // hugs the composer. See `QuickReactionBarPlacement`.
            if let pickerMessageId = overlayState.quickReactionMessageId {
                quickReactionBarOverlay(for: pickerMessageId)
                    .zIndex(99)
            }

            // Connection status banner — UNIQUEMENT pour les hôtes sans point
            // de montage racine (flux invité). Le flux authentifié normal
            // est couvert par le point de montage unique de RootView/
            // iPadRootView (cf. showsOwnConnectionBanner ci-dessus).
            if showsOwnConnectionBanner {
                ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: isStoryViewerPresenting, activeConversationId: { viewModel.conversationId })
                    .inSyncPillBand()
                    .zIndex(98)
                    .allowsHitTesting(false)
            }

            ConversationErrorBanner(error: viewModel.error, showOptions: composerState.showOptions) {
                viewModel.error = nil
            }
            .zIndex(97)
            .animation(.easeInOut, value: viewModel.error)

            if Self.showsScrollToBottomButton(isNearBottom: scrollState.isNearBottom, isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage, isInJumpedState: viewModel.isInJumpedState) {
                // Bulle « retour en bas » : elle NE suit PAS le repli du
                // défilement (#8002, directive porteur 2026-09-26) — c'est
                // pendant qu'on remonte qu'on la cherche. Seules ses propres
                // entrées/sorties (proximité du bas) la font glisser.
                ConversationTypingRosterHost(store: viewModel.stateStore) { typing in
                    VStack { Spacer(); HStack { Spacer(); scrollToBottomButton(typing: typing).padding(.trailing, MeeshySpacing.lg).padding(.bottom, composerScrollButtonAnchor + MeeshySpacing.sm) } }
                }
                    .zIndex(60)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: scrollState.isNearBottom)
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.isSearchingQuotedMessage)
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.isInJumpedState)
            }

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
            // R-7 (2026-08-22) : en Rivière, le composeur passe AU-DESSUS du
            // pane (80) — le pane lui réserve sa hauteur (`bottomInset`) et
            // c'est lui qui est recouvert sinon (mesuré au simulateur :
            // champ « Message… » présent à y = 797, invisible).
            .zIndex(readingModeController.mode == .river ? 85 : 50)
            // Chrome escamoté pendant le défilement Focal : glissement vers le
            // bord BAS + fondu (`EdgeHiddenChrome`) — le composeur garde sa
            // hauteur mesurée (aucun inset ne bouge, donc aucun re-scaling du
            // fil). Les touches passent au fil pendant l'escamotage.
            .hiddenTowardsEdge(hidesComposerChromeForScroll, .bottom)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: composerState.showTextEmojiPicker)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.activeMentionQuery != nil)

            searchResultsBlurOverlay
        }
        // #3901 — le Résumé Vivant ne rend jamais bulle par bulle
        // (`MessageListViewController.rendersThread`), donc ne peut jamais
        // faire avancer le curseur de lecture par le chemin habituel
        // (`seenIds`). Posé sur le ZStack ENGLOBANT (jamais sur la branche
        // `.summary` elle-même) : cette branche disparaît du même geste qui
        // fait sortir `mode` de `.summary`, et un `onChange` attaché à une
        // vue qui se démonte avec la valeur surveillée ne se déclenche
        // jamais. « Quitté le Résumé après l'avoir affiché » couvre les DEUX
        // sorties possibles — bouton « Reprendre le fil » (`onResumeThread`)
        // ET sélecteur de mode de l'en-tête (`readingModeController.select`
        // depuis `ReadingModeLensCatalog`), qui contourne ce bouton.
        .adaptiveOnChange(of: readingModeController.mode) { old, new in
            guard old == .summary, new != .summary else { return }
            viewModel.markCaughtUpFromSummaryOrRiver()
        }
        )
    }

    // MARK: - Floating Header Section (extracted to help type-checker)

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

    // AnyView à la déclaration (2026-08-17) : les enfants de la section (branches
    // anonymous / typing / bande + searchBar) gonflaient le mangled name de
    // `floatingHeaderSection` ET celui de `bodyContent` au point que le décodage
    // récursif au 1er rendu SUR DEVICE débordait la pile du main thread (dump
    // segv du 2026-07-30). Dernière coupe de la chaîne
    // bodyContent→floatingHeaderSection→expandedHeaderBand→…→readingModeAffordanceCluster
    // (leçon 5cdde93c4).
    private var floatingHeaderSection: AnyView {
        AnyView(floatingHeaderSectionBody)
    }

    /// Frontière NOMINALE `ConversationFloatingHeaderSection` (#6213 bis) : ce
    /// cadre pesait **565 712 octets** (55 % de la pile principale) — les quatre
    /// branches passent en closures `() -> AnyView` et se succèdent au lieu de
    /// s'additionner. Mesure complète dans le doc-comment de la struct.
    private var floatingHeaderSectionBody: some View {
        ConversationFloatingHeaderSection(
            isAnonymous: isAnonymous,
            isTyping: isTyping && headerLayout.yieldsToTypingBar,
            showSearch: headerState.showSearch,
            showOptions: composerState.showOptions,
            hidesHeaderActions: hidesHeaderActionsForScroll,
            measuresBandHeight: headerLayout.measuresBandHeight,
            anonymousBar: { AnyView(anonymousHeaderBar) },
            typingBar: { AnyView(typingHeaderBar) },
            // Focal/Script + défilement : le header entier glisse vers le bord HAUT
            // en fondant (loi `hidesEntireHeader`, `EdgeHiddenChrome`), sans
            // démontage ; les touches passent au fil. Conservé DANS la closure.
            expandedBand: { AnyView(expandedHeaderBand.hiddenTowardsEdge(hidesEntireHeaderForScroll, .top)) },
            searchBar: { AnyView(searchBar.transition(.move(edge: .top).combined(with: .opacity))) },
            onBandHeightChange: { headerState.bandHeight = $0 }
        )
        // Reste à l'HÔTE : sa valeur ne gouverne aucune branche de la section.
        .animation(.easeOut(duration: FocalMetrics.HiddenChrome.easeOut), value: hidesEntireHeaderForScroll)
    }

    private var anonymousHeaderBar: some View {
        ConversationGuestHeaderBar(
            title: liveConversation?.displayName ?? "Conversation",
            favoriteEmoji: conversation?.userState.reaction,
            avatarURL: liveConversation?.avatar,
            accentColor: accentColor, secondaryColor: secondaryColor,
            guestLinkId: anonymousSession?.linkId, titleColor: theme.textPrimary, mutedColor: theme.textMuted
        ) { dismiss() }
    }

    /// **Frontière NOMINALE** — `ConversationExpandedHeaderBand` (#6194), type-erased
    /// pour borner la chaîne `body → … → bodyContent → floatingHeaderSection →
    /// expandedHeaderBand` que le démangleur de métadonnées Swift ne savait pas
    /// parcourir au 1er rendu : une struct `View` obtient son propre nœud dans
    /// l'AttributeGraph, une propriété calculée jamais. Trace et raisonnement
    /// complets dans le doc-comment de la struct.
    private var expandedHeaderBand: AnyView {
        AnyView(ConversationExpandedHeaderBand(
            layout: headerLayout,
            backButton: {
                AnyView(ThemedBackButton(
                    color: accentColor,
                    compactMode: composerState.showOptions,
                    unreadCount: viewModel.otherConversationsUnread
                ) { HapticFeedback.light(); router.pop() })
            },
            midContent: { expandedHeaderMidContent },
            avatar: { headerAvatarView },
            background: { expandedHeaderBackground },
            share: { AnyView(ConversationShareLinkSlot(conversation: liveConversation, guestLinkId: anonymousSession?.linkId, accentColor: accentColor, secondaryColor: secondaryColor)) }
        ))
    }

    /// Call + search buttons, grouped with zero extra spacing between them
    /// (user-requested 2026-07-11) : chaque bouton porte déjà ~8 pt de marge
    /// invisible par son `.meeshyTapTarget()` 44×44, `spacing: 0` laisse cette
    /// marge comme écart visible. Grappe d'ACTIONS : elle s'efface tant que la
    /// liste défile (loi commune `ScrollMotion`) ; le retour, l'avatar et le
    /// titre ne la suivent pas. Frontière NOMINALE —
    /// `ConversationHeaderActionsCluster` (#6194) : son nom se substitue au
    /// sous-arbre entier dans le mangled name. L'aperçu (#9031) : « agrandir »
    /// prend la place de la loupe.
    var headerButtonsCluster: AnyView {
        AnyView(ConversationHeaderActionsCluster(
            callButtons: { headerCallButtons },
            searchButton: { previewMode ? openFullConversationButton : expandedHeaderSearchButton },
            readingModeCluster: { readingModeAffordanceCluster }
        ))
    }

    /// Le chip de mode (`ConversationReadingModeAffordance`), érasé à la
    /// DÉCLARATION : la coupe posée sur `headerButtonsCluster` seul ne suffisait
    /// pas — l'appelant devait résoudre ce type composite avant de le boxer.
    private var readingModeAffordanceCluster: AnyView {
        AnyView(ConversationReadingModeAffordance(
            controller: readingModeController,
            capabilities: readingModeCapabilities,
            accentColor: accentColor
        ))
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
            tags: AnyView(headerTagsRow),
            onOpenInfo: { composerState.showConversationInfo = true },
            onOpenProfile: {
                if let conv = conversation, let profileUser = ProfileSheetUser.from(conversation: conv) {
                    router.deepLinkProfileUser = profileUser
                }
            }
        )
    }

    // AnyView à la déclaration : le bouton est une struct NOMINALE
    // (`ConversationHeaderSearchButton`), son glyphe aussi (leçon 5cdde93c4).
    private var expandedHeaderSearchButton: AnyView {
        AnyView(ConversationHeaderSearchButton(accentColor: accentColor, secondaryColor: secondaryColor) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { headerState.showSearch = true }
            isSearchFocused = true
        })
    }

    private var expandedHeaderBackground: AnyView {
        AnyView(ConversationHeaderGlass(shape: headerLayout.glassShape, accentColor: accentColor, secondaryColor: secondaryColor))
    }

    // MARK: - Overlay Menu Content (extracted to help type-checker)

    // Retourne AnyView pour ÉRADIQUER le type massif de `MessageOverlayMenu` du
    // type mangled de `ConversationView.body` (débordement de la pile du
    // décodeur de métadonnées Swift au 1er rendu SUR DEVICE). L'overlay est
    // modal (zIndex 999) → AnyView sans coût de liste.
    private var overlayMenuContent: AnyView {
        guard overlayState.showOverlayMenu, let msg = overlayState.overlayMessage else {
            return AnyView(EmptyView())
        }
        if let pieceOverlay = pieceOverlayContent(for: msg) { return pieceOverlay }
        return AnyView(
            ConversationOverlayMenu(
                viewModel: viewModel,
                overlayState: $overlayState,
                msg: msg,
                accentColor: accentColor,
                // Le frame-tracker ne suit que les BULLES : en Focal/Script il
                // rend `nil`, donc `.zero`, et l'overlay présente son aperçu
                // centré, à sa taille naturelle (directive du 2026-08-23).
                bubbleFrame: frameTracker.frame(for: msg.id) ?? .zero,
                threadLanguage: overlayThreadLanguage(for: msg),
                isDirect: isDirect,
                isAdminOrMod: isCurrentUserAdminOrMod,
                mediaSaveCoordinator: mediaSaveCoordinator,
                actions: messageActions
            )
            .transition(.opacity).zIndex(999)
        )
    }
}