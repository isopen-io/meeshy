import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

@MainActor
class ConversationViewModel: ObservableObject, AttachmentSendHosting {

    // MARK: - Published State

    @Published var messages: [Message] = [] {
        didSet {
            invalidateCaches(previousMessages: oldValue)
        }
    }

    // MARK: - Cache Invalidation

    /// Appelée depuis `messages.didSet` et depuis l'observation du store : tout changement de `messages`
    /// traverse ce seul endroit, qui réarme aussi l'unique réveil d'expiration des éphémères (#7452).
    private func invalidateCaches(previousMessages: [Message]? = nil) {
        derived.invalidate(previous: previousMessages, current: messages)
        forgetPrismResolutions(whoseOriginChangedFrom: previousMessages)
        refreshEphemeralExpirySchedule()
    }

    /// Mémos des projections dérivées de `messages` — leur invalidation est une propriété du CHAMP.
    let derived = ConversationDerivedCache()

    /// L'ordonnanceur des disparitions d'éphémères — un réveil pour tout le
    /// fil, jamais un minuteur par bulle (#7452).
    lazy var ephemeralExpiry: EphemeralExpiryCoordinator = {
        let coordinator = EphemeralExpiryCoordinator()
        coordinator.onExpired = { [weak self] ids in self?.expireEphemeralsIfNeeded(ids) }
        return coordinator
    }()

    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var isLoadingNewer = false
    /// `true` when we painted stale cache data and a background refresh is
    /// in flight. Drives the subtle "revalidating" sparkle in the header so
    /// the user knows fresher data is on its way without seeing a blocking
    /// spinner (cache-first + stale-while-revalidate discipline).
    @Published var isRevalidating = false

    @Published var hasOlderMessages = true
    @Published var hasNewerMessages = false
    /// Sends awaiting their round-trip. Deliberately NOT `@Published`: no view
    /// renders it, and publishing it redrew the whole conversation twice per send.
    var sendActivity: ConversationSendActivity = .idle
    var isSending: Bool { sendActivity.isSending }
    @Published var error: String?

    func userFacingMessage(for error: Error) -> String {
        ConversationErrorText.message(for: error)
    }

    /// Real-time translation/transcription/audio data keyed by messageId
    ///
    /// L'invalidation du cache de RÉSOLUTION du Prisme est une propriété du
    /// CHAMP, jamais une discipline d'appelant. Les quatre hydrateurs
    /// retiraient bien leur clé ; le cinquième écrivain — le socket
    /// (`translation:completed`) — ne le faisait pas, si bien qu'une traduction
    /// arrivée APRÈS un premier rendu ne basculait jamais la bulle :
    /// `preferredTranslation` continuait de servir le `nil` mis en cache
    /// (« aucune traduction ⇒ original »). Ici, aucun écrivain ne peut plus
    /// l'oublier. Pas de boucle possible : `preferredTranslation` écrit dans
    /// `translationResolutionCache`, jamais dans ce dictionnaire.
    @Published var messageTranslations: [String: [MessageTranslation]] = [:] {
        didSet {
            derived.invalidateTranslationDerived()
            translationResolutionCache.removeAll()
        }
    }
    @Published var messageTranscriptions: [String: MessageTranscription] = [:] {
        didSet { derived.invalidateAudioDerived() }
    }
    /// Per-attachment transcription keyed by `attachmentId`. The per-message
    /// `messageTranscriptions` slot only holds ONE transcription per message —
    /// for a multi-audio message it is overwritten in the hydration loop so
    /// only the LAST track survives. This dict keeps EACH track's own
    /// transcription so the audio carousel can show per-page karaoke.
    /// The single-audio path still reads `messageTranscriptions[msg.id]`.
    @Published var messageTranscriptionsByAttachment: [String: MessageTranscription] = [:] {
        didSet { derived.invalidateAudioDerived() }
    }
    @Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:] {
        didSet { derived.invalidateAudioDerived() }
    }
    /// Per-attachment translated audios keyed by `attachmentId`. The per-message
    /// `messageTranslatedAudios` slot only holds ONE attachment's audios per
    /// message — for a multi-audio message it is overwritten in the hydration
    /// loop so only the LAST track survives. This dict keeps EACH track's own
    /// translated audios so the audio carousel can show per-page language
    /// buttons (Prisme Linguistique). The single-audio path still falls back to
    /// `messageTranslatedAudios[msg.id]`. Mirrors `messageTranscriptionsByAttachment`.
    @Published var messageTranslatedAudiosByAttachment: [String: [MessageTranslatedAudio]] = [:] {
        didSet { derived.invalidateAudioDerived() }
    }

    /// On-demand translation requests currently in flight, keyed by messageId
    /// then by target language. Owned here — not as `@State` on
    /// `MessageLanguageDetailView` — so the "Traduire" button's loader
    /// survives the language sheet being dismissed and re-presented: the VM
    /// outlives the sheet, the view's `@State` does not.
    @Published var translatingTextLanguages: [String: Set<String>] = [:]
    @Published var translatingAudioLanguages: [String: Set<String>] = [:]

    typealias TranslationRequestFailure = ConversationTranslationRequestFailure

    /// Mirrors the `translationFailed`/`audioTranslationFailed` pattern
    /// already consumed elsewhere for socket-driven failures — this is the
    /// same shape for REST-driven on-demand translation failures.
    let translationRequestFailed = PassthroughSubject<TranslationRequestFailure, Never>()

    /// Manual translation override per message (user selected a specific language in Language tab)
    /// nil value means user chose "show original"
    @Published var activeTranslationOverrides: [String: MessageTranslation?] = [:]

    /// Manual audio language override per message (user selected a language in Language tab for audio)
    /// nil value means user chose "show original audio"
    @Published var activeAudioLanguageOverrides: [String: String?] = [:]

    /// Per-message language selection driven by the bubble's flag strip
    /// (primary display language switch + inline secondary panel). Lifted out
    /// of `ThemedMessageBubble`'s `@State` so the bubble can sit behind an
    /// Equatable re-render gate: as plain inputs these flow through `==`, and
    /// a flag tap publishes here → targeted cell reconfigure → the bubble
    /// re-renders with the new selection. (The former in-bubble `@State` is
    /// exactly what made `.equatable()` unsafe — see b9a39c2c.)
    @Published private(set) var bubbleLanguageSelections: [String: BubbleLanguageSelection] = [:]

    /// Les vues uniques TEXTE que le lecteur a ouvertes pendant cette visite
    /// (#7618) — lues par chaque mode via `MeeshyMessage.isViewOnceRevealed`.
    @Published var revealedViewOnceIds: [String: Bool] = [:]

    /// Les éphémères EN COMBUSTION (#8382) — lus par les cellules du fil, qui
    /// rendent `MessageStore` et non `messages`.
    @Published var burningEphemeralIds: [String: Bool] = [:]

    typealias BubbleLanguageSelection = ConversationBubbleLanguageSelection

    func setBubbleActiveDisplayLanguage(_ code: String?, for messageId: String) {
        var selection = bubbleLanguageSelections[messageId] ?? BubbleLanguageSelection()
        guard selection.activeDisplayLangCode != code else { return }
        selection.activeDisplayLangCode = code
        bubbleLanguageSelections[messageId] = selection
        switchActiveAudioTrackIfNeeded(for: messageId)
    }

    /// Si le vocal ACTIF du coordinateur appartient à ce message au moment
    /// de la bascule du drapeau, la piste suit la nouvelle langue —
    /// `syncActiveTrack` décide selon l'état : bascule immédiate en lecture
    /// (`playVariant`, file et carte système conservées), tête mise à jour +
    /// moteur déchargé en pause (la REPRISE rejoue la bonne piste — sans ça,
    /// pause → toggle → play ressortait l'ancienne langue sous un karaoké
    /// déjà basculé, revue adversariale 2026-08-18). Une bascule qui résout
    /// la piste déjà en tête est un no-op (jamais de replay à zéro).
    private func switchActiveAudioTrackIfNeeded(for messageId: String) {
        guard let context = audioCoordinator.activeContext,
              context.messageId == messageId,
              let (message, attachment) = findAudioAttachment(id: context.attachmentId)
        else { return }
        let track = queuedAudio(for: attachment, message: message)
        audioCoordinator.syncActiveTrack(
            urlString: track.fileUrl, language: track.trackLanguage, isTranslated: track.isTranslatedTrack
        )
    }

    func setBubbleSecondaryLanguage(_ code: String?, for messageId: String) {
        var selection = bubbleLanguageSelections[messageId] ?? BubbleLanguageSelection()
        guard selection.secondaryLangCode != code else { return }
        selection.secondaryLangCode = code
        bubbleLanguageSelections[messageId] = selection
    }

    /// B2 (Prisme Linguistique) — monotonically increasing counter bumped
    /// every time the viewer's preferred-content languages change (user
    /// edits `systemLanguage` / `regionalLanguage` / `customDestinationLanguage`
    /// in Settings). Consumers (e.g., `MessageListViewController`) observe
    /// this signal to re-snapshot bubbles so the previously-resolved
    /// translation is replaced with the one matching the new preference.
    @Published var preferredLanguageRevision: Int = 0

    /// Resolution cache for `preferredTranslation(for:)` — invalidated on language revision bump.
    /// Uses double-Optional semantics: key absent = not cached, .some(nil) = cached as "show original".
    var translationResolutionCache: [String: MessageTranslation?] = [:]
    var cachedRevisionForTranslation: Int = -1

    /// Active live location sessions in this conversation
    @Published var activeLiveLocations: [ActiveLiveLocation] = []

    /// Last unread message from another user (set only via socket, cleared on scroll-to-bottom)
    @Published var lastUnreadMessage: Message?

    /// Total unread across every OTHER conversation (excludes this one).
    /// Drives the cross-conversation pill stuck next to the back button.
    /// Always clamped ≥ 0 — never negative even when our local snapshot
    /// of the current conv is briefly stale relative to the aggregate.
    @Published var otherConversationsUnread: Int = 0

    /// Updated by the MessageListViewController's scroll delegate via the
    /// `onNearBottomChanged` callback. Drives the anticipatory prefetch:
    /// when the user is NOT near the bottom (scrolling up into history),
    /// `loadOlderMessages` eagerly prefetches the next page after each
    /// successful load so older messages are ready before the user reaches them.
    var isCurrentlyNearBottom: Bool = true

    /// Stockée ici et non dans l'extension qui la pilote (`ConversationViewModel+JumpToMessage.swift`) :
    /// une extension Swift ne peut pas déclarer de propriété stockée.
    var newerPagesChain: Task<Void, Never>?

    /// Dernier message dont l'affichage a fait « rattraper » la conversation.
    /// Rendu obsolète tout seul dès qu'un message plus récent arrive — la
    /// comparaison se fait sur le message le plus récent du moment.
    /// Cf. `caughtUpMessageId(seen:)`.
    private(set) var lastCaughtUpMessageId: String?

    /// Tout ce que l'observateur de visibilité a rapporté depuis l'ouverture
    /// (#7350) — le préfixe contigu depuis la frontière s'y mesure, jamais sur
    /// le seul dernier lot. Cf. `notePartialRead(seen:)`.
    var seenServerMessageIds: Set<String> = []

    /// Detailed reaction data for a specific message (used by reaction detail sheet)
    @Published var reactionDetails: [ReactionGroup] = []
    @Published var isLoadingReactions = false

    /// ID of the first unread message (set once after initial load, cleared on scroll to bottom)
    @Published var firstUnreadMessageId: String?
    /// Le compte affiché par le séparateur « N messages non lus » (#7222) —
    /// gelé EN MÊME TEMPS que `firstUnreadMessageId`, jamais recalculé seul
    /// (une désynchronisation servirait un libellé qui ne décrit plus la
    /// position). Source : `FirstUnreadBoundary.Result.unreadCount`.
    @Published var unreadSeparatorCount: Int = 0

    /// True during programmatic scrolls (initial load, send, scroll-to-bottom tap)
    /// When true, onAppear prefetch triggers are suppressed.
    var isProgrammaticScroll = false

    /// True when the conversation has been closed (no more messages can be sent)
    @Published var isConversationClosed = false
    /// Restriction d'écriture APPRISE à l'envoi (#9929) : un 403 `GLOBAL_ADULTS_ONLY`.
    /// Celle que la liste SERT vit sur la conversation ; la vue lit les deux.
    @Published var learnedWriteRestriction: ConversationWriteRestriction?

    /// True when the server has revoked access to this conversation (user
    /// removed from the participants list, group disbanded, etc.). The
    /// view must dismiss itself when this flips so the user cannot keep
    /// viewing/sending into a conversation they no longer belong to.
    @Published var accessRevoked: Bool = false

    /// L'éphémère armé pour les prochains messages : la flamme-œil ou une durée (#8303).
    @Published var ephemeralChoice: EphemeralChoice? { didSet { persistArmedProtection() } }

    /// When true, next message will be sent with blur (recipient must tap to reveal)
    @Published var isBlurEnabled: Bool = false { didSet { persistArmedProtection() } }

    /// When true, next message will be sent as view-once (revealed once, then
    /// burned). Surfaced by the notification preview composer.
    @Published var isViewOnceEnabled: Bool = false { didSet { persistArmedProtection() } }

    /// La contagion de la citation en attente (#8557) — superposée à l'armement, jamais persistée.
    @Published var armedReplyContagion: ArmedReplyContagion?

    /// Pending message effects selected via the effects picker
    @Published var pendingEffects: MessageEffects = .none

    /// True when the current user has not yet granted voice-cloning consent.
    /// Drives the in-bubble `AudioConsentNotice` nudge on outgoing audio
    /// messages. Set asynchronously after `start()` via a one-shot
    /// `VoiceProfileService` call; default is `false` so a network error
    /// never shows a false positive.
    @Published var voiceConsentMissing: Bool = false

    // MARK: - Audio Continuous Playback (Phase 4)

    /// Attachments already played to completion. Excluded from the auto-built
    /// queue so a tap on the second audio doesn't replay everything before it.
    ///
    /// Currently runtime-only: enriched when an audio finishes via the
    /// coordinator's `onPlaybackFinished` hook (Phase 5 wiring). Persistence
    /// across cold starts comes when `MeeshyMessageAttachment.listenedAt` is
    /// added to the SDK model (tracked as dette).
    @Published var listenedAttachmentIds: Set<String> = []

    /// Cached metadata for the active conversation, hydrated lazily from the
    /// cache when `loadMessages` runs. Used to feed `playAudio` with the
    /// right `conversationName` / `conversationArtworkURL`.
    @Published var currentConversation: MeeshyConversation?

    #if DEBUG
    private var _testAudioCoordinator: ConversationAudioCoordinator?
    #endif

    /// Resolves to the test-injected coordinator under DEBUG when present,
    /// otherwise the shared singleton. Pure UX orchestration lives in the
    /// coordinator — the VM only feeds it.
    var audioCoordinator: ConversationAudioCoordinator {
        #if DEBUG
        return _testAudioCoordinator ?? .shared
        #else
        return .shared
        #endif
    }

    #if DEBUG
    /// Test-only setter to inject a fresh `ConversationAudioCoordinator` so a
    /// test class can assert side-effects without colliding with the global
    /// singleton's state. Must be called BEFORE `playAudio(attachmentId:)` /
    /// any other coordinator-routed call to take effect for that operation.
    ///
    /// Re-subscribes the listened-id observer to the new coordinator so the
    /// PassthroughSubject route works in tests too — without this the
    /// subscription wired in `init` still targets the default singleton
    /// while playback flows through the injected instance.
    func _testSetAudioCoordinator(_ coordinator: ConversationAudioCoordinator) {
        _testAudioCoordinator = coordinator
        subscribeToAudioCoordinatorFinishedEvents()
    }
    #endif

    // MARK: - Mention Autocomplete State

    @Published var mentionController: MentionComposerController = MentionComposerController(context: .conversation(id: ""))

    // MARK: - Search State

    @Published var searchResults: [SearchResultItem] = []
    @Published var isSearching = false
    @Published var searchHasMore = false
    @Published var currentSearchQuery: String?

    /// True when the user jumped to a search result and messages are loaded around that point
    @Published var isInJumpedState = false

    /// True while the ViewModel is actively searching for a quoted message
    /// that wasn't in the local collection when the user tapped its reply
    /// reference. Drives a pulsing indicator on the scroll-to-bottom button
    /// so the user knows the app is working to find the cited message.
    @Published var isSearchingQuotedMessage = false

    // Permanent mapping `optimistic id → server id` for the lifetime of the
    // ViewModel. The optimistic id (`temp_…` / `offline_…` / `retry_…`) is
    // the SwiftUI ForEach key for the row — we NEVER swap it in memory so the
    // bubble doesn't unmount/remount and flash. Backend operations
    // (delete/edit/react/pin) and cache writes resolve the real server id
    // through `serverId(for:)`. The mapping survives until the next reload
    // from cache (which already stores server ids), at which point the
    // optimistic id disappears naturally.
    var pendingServerIds: [String: String] = [:] {
        didSet { pendingServerIdSet = Set(pendingServerIds.values) }
    }
    var pendingServerIdSet: Set<String> = []

    // MARK: - Conversation-Wide Media

    typealias MediaSenderInfo = ConversationMediaSenderInfo

    // MARK: - Audio Items for Fullscreen Gallery

    typealias AudioItem = ConversationAudioItem

    // MARK: - Private

    let conversationId: String
    let memberJoinedAt: Date?
    /// La frontière de lecture (#7198, #7222) — reprise SYNCHRONE de la ligne
    /// de liste qui a ouvert ce fil (`ConversationView.init`, même idiome que
    /// `memberJoinedAt`), jamais de `currentConversation` (hydraté par un
    /// `Task` non attendu — une dépendance à son instant de résolution
    /// aurait couru contre `loadMessages()`). `lastReadMessageCreatedAt` est
    /// le rang 1 de `FirstUnreadBoundary.resolve` ; `lastReadAt` son rang 2
    /// (« à défaut »), `memberJoinedAt` le rang 3.
    let lastReadMessageId: String?
    let lastReadAt: Date?
    let lastReadMessageCreatedAt: Date?
    let isDirect: Bool
    let participantUserId: String?
    let initialUnreadCount: Int
    let limit = 30
    var nextMessageCursor: String?
    var cancellables = Set<AnyCancellable>()
    var messagesPersistCancellable: AnyCancellable?
    /// Subscription that mirrors `MessageStore.messagesDidChange` into the
    /// `messages` array.  Established once in `init` after `messageStore` is ready.
    var storeObservation: AnyCancellable?
    var socketHandler: ConversationSocketHandler?

    // MARK: - Split Orchestrators (incremental migration scaffold)
    //
    // The 3000-line legacy here is being progressively split into focused
    // handlers under `ViewModels/Conversation/`. For now the legacy keeps
    // owning `@Published var messages` and friends; the handlers mirror that
    // state into `stateStore.messages` so that the delegated methods
    // (currently `searchMessages`, `prefetchRecentMedia`, …) work against
    // the same source of truth. See `[[project_conversation_vm_split_staged]]`.
    /// Exposed so ConversationView and MessageListViewController can observe typing
    /// state independently — avoids triggering the full VM objectWillChange on every keystroke.
    let stateStore: ConversationStateStore
    let commands: any ConversationCommandProviding
    let mediaHandler: ConversationMediaHandler
    let searchHandler: ConversationSearchHandler

    // MARK: - GRDB Persistence (additive — parallel data source alongside @Published messages)

    /// GRDB-backed observable store for UICollectionView bridge.
    /// Created eagerly in init so it is available at first paint.
    private(set) var messageStore: MessageStore

    /// Actor for optimistic inserts and state-machine transitions.
    private(set) var messagePersistence: MessagePersistenceActor
    var lastOlderPaginationTime: Date = .distantPast
    static let paginationDebounceInterval: TimeInterval = 0.3

    let authManager: AuthManaging
    let messageService: MessageServiceProviding
    private let conversationService: ConversationServiceProviding
    let reactionService: ReactionServiceProviding
    let reportService: ReportServiceProviding
    let syncEngine: ConversationSyncEngineProviding
    private let mentionService: MentionServiceProviding
    let messageSocket: MessageSocketProviding
    let networkMonitor: NetworkMonitorProviding
    let offlineQueue: OfflineMessageQueueing
    let sendCoordinator: any ConversationSendCoordinatorProviding
    let translationSource: any ConversationTranslationSourcing
    let historyLoader: any ConversationHistoryLoading
    let collaborators: ConversationCollaborators
    /// #8303 — les flammes-œil vues pendant la visite, et ce que la sortie en fait.
    var afterReadVisit = AfterReadVisit()
    let afterReadConsumer: AfterReadConsumptionProviding
    /// #8305 — ce que la conversation garde armé, entre deux envois et deux visites.
    let protectionPreferences: ConversationProtectionPreferenceProviding
    /// #8307 — les images et vidéos reçues rejoignent l'album Meeshy à l'accusé de réception.
    let receivedMediaAutoSaver: ReceivedMediaAutoSaving
    private let activeCallService: ActiveCallServiceProviding
    private let liveCallJoin: LiveCallJoinContext
    let translationService: TranslationServiceProviding
    let attachmentTranslationService: AttachmentTranslationProviding
    let messageEncryptor: DirectMessageEncrypting
    let decryptionActor = DecryptionActor(provider: LiveSessionProvider())

    /// Captured at init so the heavy side-effects (DB observation, initial
    /// load, Combine subscriptions, singleton mutations) can be deferred out
    /// of `init` into `start()`. `init` MUST stay side-effect-free: SwiftUI
    /// reconstructs `ConversationView` — and therefore eagerly allocates a
    /// throwaway `ConversationViewModel` (discarded by `@StateObject`) — on
    /// every parent re-evaluation. Running the GRDB window read / observation
    /// registration / singleton thrash in `init` turned that into a constant
    /// main-thread storm (device trace: ~57% of a P-core, battery heating).
    /// See `start()`.
    let startupDependencies: ConversationDependencies
    let anonymousSession: AnonymousSessionContext?
    var hasStarted = false

    var currentUserId: String { authManager.currentUser?.id ?? "" }
    /// Public read-only accessor for the view layer (UIKit bridge needs the user id).
    var currentUserIdForView: String { currentUserId }
    var currentUsername: String? { authManager.currentUser?.username }

    // MARK: - Init

    init(
        conversationId: String,
        unreadCount: Int = 0,
        isDirect: Bool = false,
        participantUserId: String? = nil,
        memberJoinedAt: Date? = nil,
        lastReadMessageId: String? = nil,
        lastReadAt: Date? = nil,
        lastReadMessageCreatedAt: Date? = nil,
        closedAt: Date? = nil,
        anonymousSession: AnonymousSessionContext? = nil,
        authManager: AuthManaging = AuthManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        reactionService: ReactionServiceProviding = ReactionService.shared,
        reportService: ReportServiceProviding = ReportService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared,
        mentionService: MentionServiceProviding = MentionService.shared,
        mentionContacts: MentionContactsProviding = MentionContactsStore.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        dependencies: ConversationDependencies = .live,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared,
        offlineQueue: OfflineMessageQueueing = OfflineQueue.shared,
        activeCallService: ActiveCallServiceProviding = ActiveCallService.shared,
        liveCallJoin: LiveCallJoinContext = .live,
        translationService: TranslationServiceProviding = TranslationService.shared,
        attachmentTranslationService: AttachmentTranslationProviding = AttachmentService.shared,
        messageEncryptor: DirectMessageEncrypting = SessionManager.shared,
        afterReadConsumer: AfterReadConsumptionProviding = AfterReadConsumption.shared,
        protectionPreferences: ConversationProtectionPreferenceProviding = ConversationProtectionPreferenceStore.shared,
        receivedMediaAutoSaver: ReceivedMediaAutoSaving = ReceivedMediaAutoSaver.shared,
        sendCoordinator: (any ConversationSendCoordinatorProviding)? = nil,
        translationSource: (any ConversationTranslationSourcing)? = nil,
        commands: (any ConversationCommandProviding)? = nil,
        historyLoader: (any ConversationHistoryLoading)? = nil
    ) {
        self.receivedMediaAutoSaver = receivedMediaAutoSaver
        self.afterReadConsumer = afterReadConsumer
        self.protectionPreferences = protectionPreferences
        self.activeCallService = activeCallService
        self.liveCallJoin = liveCallJoin
        self.translationService = translationService
        self.attachmentTranslationService = attachmentTranslationService
        self.messageEncryptor = messageEncryptor
        self.conversationId = conversationId
        self.memberJoinedAt = memberJoinedAt
        self.lastReadMessageId = lastReadMessageId
        self.lastReadAt = lastReadAt
        self.lastReadMessageCreatedAt = lastReadMessageCreatedAt
        self.initialUnreadCount = unreadCount
        self.isDirect = isDirect
        self.participantUserId = participantUserId
        self.isConversationClosed = closedAt != nil
        self.authManager = authManager
        self.messageService = messageService
        self.conversationService = conversationService
        self.reactionService = reactionService
        self.reportService = reportService
        self.syncEngine = syncEngine
        self.mentionService = mentionService
        self.messageSocket = messageSocket
        self.networkMonitor = networkMonitor
        self.offlineQueue = offlineQueue
        self.sendCoordinator = sendCoordinator ?? ConversationSendCoordinator(conversationId: conversationId, messageService: messageService, messageSocket: messageSocket, offlineQueue: offlineQueue, persistence: dependencies.persistence)
        self.translationSource = translationSource ?? ConversationTranslationSource(persistence: dependencies.persistence)
        self.historyLoader = historyLoader ?? ConversationHistoryLoader(conversationId: conversationId, messageService: messageService, persistence: dependencies.persistence)
        self.collaborators = dependencies.collaborators ?? ConversationCollaborators(persistence: dependencies.persistence, syncEngine: syncEngine, messageService: messageService)
        // Eagerly create GRDB persistence so messageStore is available at first paint.
        self.messagePersistence = dependencies.persistence
        self.startupDependencies = dependencies
        self.anonymousSession = anonymousSession

        let stateStore = ConversationStateStore()
        self.stateStore = stateStore
        self.commands = commands ?? ConversationCommandHandler(
            state: stateStore,
            conversationId: conversationId,
            messageService: messageService,
            persistence: dependencies.persistence,
            offlineQueue: offlineQueue,
            networkMonitor: networkMonitor
        )
        self.mediaHandler = ConversationMediaHandler(state: stateStore)
        self.searchHandler = ConversationSearchHandler(
            state: stateStore,
            conversationId: conversationId,
            messageService: messageService,
            persistence: dependencies.persistence
        )
        let store = MessageStore(
            conversationId: conversationId,
            persistence: dependencies.persistence
        )
        self.messageStore = store
        wireMentionsAndSocket(mentionService: mentionService, mentionContacts: mentionContacts, persistence: dependencies.persistence)
        restoreArmedProtection()
    }

    /// Le contrôleur de mentions lit `mentionCandidates` (donc `messages`) à la demande : il se câble APRÈS
    /// `messageStore`. Le socket arme ses abonnements plus tard (`loadMessages`), jamais à l'init.
    private func wireMentionsAndSocket(
        mentionService: MentionServiceProviding, mentionContacts: MentionContactsProviding,
        persistence: MessagePersistenceActor
    ) {
        mentionController = MentionComposerController(
            context: .conversation(id: conversationId),
            participants: { [weak self] in self?.mentionCandidates ?? [] },
            service: mentionService,
            contacts: mentionContacts,
            currentUserId: authManager.currentUser?.id
        )
        let handler = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: authManager.currentUser?.id ?? "",
            messageSocket: messageSocket
        )
        handler.delegate = self
        handler.persistence = persistence
        socketHandler = handler
    }

    // MARK: - MessageStore Observation (Task 1.3)

    /// Monotonic token bumped on every store-driven refresh. An async
    /// decryption pass that finishes after a newer refresh started checks this
    /// before assigning, so a stale snapshot never overwrites a fresher one.
    /// Stockée ici et non dans l'extension qui la pilote (`ConversationViewModel+StoreObservation.swift`) :
    /// une extension Swift ne peut pas déclarer de propriété stockée.
    var storeRefreshGeneration: Int = 0

    nonisolated deinit {
        // socketHandler deinit handles room leave & typing cleanup
        socketHandler = nil
        newerPagesChain?.cancel()
        // Only undo the singleton mutations `start()` performed. A throwaway VM
        // (eagerly allocated by `ConversationView.init`, never activated because
        // `@StateObject` discarded it before its `.task` ran) MUST NOT clear the
        // anonymous token or the currently-open gate — doing so cancelled what
        // the live VM's `start()` had just set and fed the re-render storm.
        guard hasStarted else { return }
        APIClient.shared.anonymousSessionToken = nil
        // Relinquish THIS screen's opening so cross-conversation surfaces
        // (back-button pill on other screens) resume counting it. The engine
        // counts openings per conversation, so the close is order-safe by
        // construction: on a fast A→B switch, `deinit(A)` running after
        // `start(B)` closes A only — B stays open; and the same conversation
        // shown in two iPad windows stays open until its LAST screen goes.
        syncEngine.closeConversation(conversationId)
    }

    // MARK: - Load Messages (initial)

    /// Bandwidth optimization (Niveau 1 — Bug F) : flip to `true` once the
    /// first REST refresh has succeeded so subsequent refreshes can opt out
    /// of having the gateway return `translations` (text + audio metadata is
    /// already persisted in GRDB and the socket pushes future deltas live).
    /// First fetch (cold-start, GRDB empty) still requests them in full.
    /// Stockée ici et non dans l'extension qui la pilote (`ConversationViewModel+InitialLoad.swift`) :
    /// une extension Swift ne peut pas déclarer de propriété stockée.
    var hasCompletedInitialFetch = false

    /// Le pendant de `hasStarted` pour l'OUVERTURE (#4943). Le `.task` d'une
    /// vue SwiftUI est rejoué à chaque ré-apparition de l'écran ; `start()`
    /// s'en protégeait, `loadMessages()` non — et tout le chargement initial
    /// repartait alors que la liste était déjà peinte. Posée à `true`
    /// UNIQUEMENT quand l'ouverture a produit une fenêtre : un chargement
    /// stérile (GRDB froid + réseau KO) doit rester rejouable au réveil.
    /// Stockée ici et non dans l'extension qui la pilote (`ConversationViewModel+InitialLoad.swift`) :
    /// une extension Swift ne peut pas déclarer de propriété stockée.
    var hasLoadedInitialMessages = false

    // MARK: - Media Prefetch (delegated to ConversationMediaHandler)

    /// Stockée ici et non dans l'extension qui la pilote (`ConversationViewModel+Lifecycle.swift`) :
    /// une extension Swift ne peut pas déclarer de propriété stockée.
    var mediaPrefetchDebounce: Task<Void, Never>?

    // MARK: - Sync Engine Observation

    /// Slot dédié (et non `cancellables`) : `.task` re-fire à chaque
    /// ré-apparition de l'écran — la ré-assignation remplace l'abonnement
    /// précédent au lieu d'en accumuler N (chaque signal sync déclenchait
    /// sinon N reloads cache + reconciliations redondants).
    /// Stockée ici et non dans l'extension qui la pilote (`ConversationViewModel+Lifecycle.swift`) :
    /// une extension Swift ne peut pas déclarer de propriété stockée.
    var syncCancellable: AnyCancellable? {
        willSet { syncCancellable?.cancel() }
    }

    // MARK: - Audio Continuous Playback (Phase 4)

    private var callLauncher: ConversationCallLauncher {
        ConversationCallLauncher(
            conversationId: conversationId,
            isDirect: isDirect,
            participantUserId: participantUserId,
            isAnonymous: anonymousSession != nil,
            currentUserId: currentUserId,
            liveCallJoin: liveCallJoin,
            activeCallService: activeCallService,
            peerDisplayName: { [weak self] in self?.resolvedPeerDisplayName },
            conversationName: { [weak self] in self?.currentConversationName ?? "" }
        )
    }

    /// Rappel / reprise depuis une bulle de résumé d'appel — la règle vit dans
    /// `ConversationCallLauncher`.
    func callBack(for summary: CallSummaryMetadata) {
        callLauncher.callBack(for: summary)
    }

    /// Internal (pas private) pour la testabilité des branches.
    func joinOngoingCall(_ summary: CallSummaryMetadata) async {
        await callLauncher.joinOngoingCall(summary)
    }

    /// Best-effort peer display name from the most recent received message in
    /// the current snapshot (sender differs from the current user).
    private var resolvedPeerDisplayName: String? {
        messageStore.messages
            .last { $0.senderId != currentUserId && !($0.senderName ?? "").isEmpty }?
            .senderName
    }

    /// Mémoire des messages déjà vus par la file des vocaux — pilotée par
    /// `subscribeToMessagesForAudioQueue()` (`ConversationViewModel+AudioQueue.swift`).
    /// Stockée ici : une extension ne déclare pas de propriété stockée.
    var audioQueueTracker = AudioQueueAppendTracker()

    // MARK: - Mark as Read / Received

    /// - Parameter messageIds: identifiants SERVEUR des messages RÉELLEMENT
    ///   affichés, remontés par l'observateur de visibilité. `nil` signifie
    ///   « appelant non informé » et laisse le gateway sur son repli
    ///   historique par fenêtre temporelle, qui sur-déclare.
    ///
    ///   Rapporter dix messages sur deux cents ne veut pas dire que la
    ///   conversation est lue — le badge ne tombe donc PAS sur un lot
    ///   quelconque. Il tombe quand le lot contient le message le PLUS RÉCENT :
    ///   à cet instant l'utilisateur n'a plus de retard, et c'est exactement ce
    ///   que compte le badge.
    ///
    ///   Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    /// - Parameter visibleIds: ce que la surface MONTRE, distinct de ce qu'elle
    ///   a vu assez longtemps (#3902). Vide ⇒ règle d'avant, à l'identique.
    func markAsRead(messageIds: [String]? = nil, visibleIds: [String] = []) {
        #if DEBUG
        VitrineRendu.shared.conversationAffichee(self, visibles: visibleIds)
        #endif
        afterReadVisit.note(displayed: (messageIds ?? []) + visibleIds, among: messages)
        let caughtUpId = caughtUpMessageId(seen: messageIds, visible: visibleIds)
        if caughtUpId == nil, let messageIds { notePartialRead(seen: messageIds) }
        sendReadReceipt(messageIds: messageIds, caughtUpId: caughtUpId)
    }

    /// Rattrapage HORS mode Bulles — Résumé Vivant, Rivière (#3901). Ces deux
    /// modes ne rendent JAMAIS chaque bulle individuellement
    /// (`MessageListViewController.rendersThread` est faux pour eux), donc
    /// n'alimentent aucun `seenIds` : `markAsRead(messageIds:)` seul ne peut
    /// structurellement jamais y faire avancer le curseur serveur, quel que
    /// soit le nombre de fois où l'utilisateur rouvre la conversation — d'où
    /// un badge bloqué à vie au-delà du seuil de 25 non-lus.
    ///
    /// La preuve de consultation y est DIFFÉRENTE (Résumé affiché jusqu'au
    /// bout, Rivière stabilisée au présent) et vient de l'appelant plutôt que
    /// d'un lot `seen` — ce rattrapage avance donc directement le curseur
    /// jusqu'au dernier message CONNU DU SERVEUR, sans jamais passer par
    /// `seen.contains(newest)`. Comme en mode Bulles, seul le CURSEUR bouge :
    /// aucun `MessageStatusEntry.readAt` individuel n'est gelé pour un
    /// message que le lecteur n'a pas vu bulle par bulle.
    func markCaughtUpFromSummaryOrRiver() {
        afterReadVisit.noteAll(among: messages)
        // Marquée non lue à l'instant (iPad, depuis la liste) : la sortie ne rattrape pas — elle effacerait la pastille.
        guard !ExplicitUnreadMarks.consume(conversationId) else { return }
        guard !hasNewerMessages, let newest = newestServerMessageId() else { return }
        lastCaughtUpMessageId = newest
        sendReadReceipt(messageIds: nil, caughtUpId: newest)
    }

    private func sendReadReceipt(messageIds: [String]?, caughtUpId: String?) {
        // Résolu ICI, pas au moment de l'envoi : la file d'attente peut partir
        // longtemps après, et une traduction arrivée entre-temps ne change pas
        // ce que le lecteur avait sous les yeux.
        let languages = messageIds.map { splitConsumedLanguages(for: $0) }
        collaborators.readReceipts.send(
            conversationId: conversationId, messageIds: messageIds, caughtUpId: caughtUpId, languages: languages
        )
    }

    /// La LOI vit dans `ConversationCatchUpLaw`, pure et interrogeable sans ce
    /// modèle ; ce site lui fournit l'état et retient ce qu'elle rend.
    func caughtUpMessageId(seen: [String]?, visible: [String]) -> String? {
        let id = ConversationCatchUpLaw.caughtUpId(
            newestServerId: newestServerMessageId(),
            windowIsAtTip: !hasNewerMessages,
            seen: seen,
            visible: visible,
            memoized: lastCaughtUpMessageId
        )
        if let id { lastCaughtUpMessageId = id }
        return id
    }

    /// Le message le plus récent que le SERVEUR connaît : une bulle
    /// optimiste qu'on vient d'envoyer ne porte pas encore d'ObjectId, et
    /// l'annoncer comme borne de curseur ferait rejeter le corps entier.
    /// Partagé par `caughtUpMessageId(seen:)` et
    /// `markCaughtUpFromSummaryOrRiver()`.
    private func newestServerMessageId() -> String? {
        messages.reversed().lazy
            .map({ self.serverId(for: $0.id) })
            .first(where: { Self.isServerMessageId($0) })
    }

    /// Un ObjectId MongoDB : 24 caractères hexadécimaux. Le gateway valide le
    /// corps de `mark-read` avec ce format et rejette tout le lot sinon.
    nonisolated static func isServerMessageId(_ id: String) -> Bool {
        id.count == 24 && id.allSatisfy(\.isHexDigit)
    }

    /// Server-side delivery confirmation. Fully delegated to the command
    /// handler — the legacy variant did the exact same call with an
    /// equally permissive error path.
    func markAsReceived() {
        commands.markAsReceived()
        receivedMediaAutoSaver.consider(messages)
    }

    // MARK: - Préférences de langue (ardoise de cache)

    /// Stockée ici et non dans l'extension qui la pilote (`ConversationViewModel+Translations.swift`) :
    /// une extension Swift ne peut pas déclarer de propriété stockée.
    var _cachedLanguagePreferences: ConversationLanguagePreferences?

    /// Ordered language priority used by `preferredTranslation(for:)`.
    /// Extracted into ``ConversationLanguagePreferences`` (P4.2 step 1)
    /// so the resolution can be unit-tested without spinning up a full
    /// ViewModel + AuthManager + cached message graph. The cache is keyed
    /// on the source `MeeshyUser` rather than just userId so a profile
    /// edit (system/regional language change) is picked up immediately.
    var preferredLanguages: [String] {
        let prefs = ConversationLanguagePreferences(user: authManager.currentUser)
        if _cachedLanguagePreferences == prefs, let cached = _cachedLanguagePreferences {
            return cached.resolved
        }
        _cachedLanguagePreferences = prefs
        translationResolutionCache.removeAll()
        return prefs.resolved
    }
}
