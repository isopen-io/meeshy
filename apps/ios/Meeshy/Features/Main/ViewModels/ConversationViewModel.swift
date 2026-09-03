import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

@MainActor
class ConversationViewModel: ObservableObject {

    // MARK: - Published State

    @Published var messages: [Message] = [] {
        didSet {
            invalidateCaches(previousMessages: oldValue)
        }
    }

    // MARK: - Cache Invalidation

    /// Invalidates all derived caches that depend on `messages`.
    /// Called both from the `messages.didSet` observer (legacy pipeline) and
    /// from the MessageStore observation subscription (GRDB pipeline).
    private func invalidateCaches(previousMessages: [Message]? = nil) {
        let structureChanged: Bool
        if let oldValue = previousMessages {
            structureChanged = messages.count != oldValue.count
                || messages.first?.id != oldValue.first?.id
                || messages.last?.id != oldValue.last?.id
        } else {
            structureChanged = true
        }

        _messageIdIndex = nil
        _cachedLastReceivedIndex = .uncomputed
        _cachedLastSentIndex = .uncomputed

        if structureChanged {
            _messagesByDate = nil
            _topActiveMembers = nil
            _mediaSenderInfoMap = nil
            _allVisualAttachments = nil
            _mediaCaptionMap = nil
            _allAudioItems = nil
            _mentionDisplayNames = nil
            _mentionCandidates = nil
        }
    }

    var _cachedLastReceivedIndex: IndexCache = .uncomputed

    var _cachedLastSentIndex: IndexCache = .uncomputed

    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var isLoadingNewer = false
    /// `true` when we painted stale cache data and a background refresh is
    /// in flight. Drives the subtle "revalidating" sparkle in the header so
    /// the user knows fresher data is on its way without seeing a blocking
    /// spinner (cache-first + stale-while-revalidate discipline).
    @Published var isRevalidating = false

    /// Message ids whose `messageService.edit` round-trip is in flight. The
    /// bubble renders a "Enregistrement…" indicator next to the "Modifie"
    /// badge while the set contains its id so the user never wonders if
    /// their edit actually landed.
    @Published var editInProgress: Set<String> = []
    @Published var hasOlderMessages = true
    @Published var hasNewerMessages = false
    @Published var isSending = false
    /// Number of sends currently awaiting their network round-trip. Backs
    /// `isSending` (true ⇔ ≥1 in flight) WITHOUT gating new sends — DISTINCT
    /// messages send concurrently (2026-06-09). See `sendMessage`'s dedup.
    var inFlightSendCount = 0
    /// Last (dedupKey, timestamp) accepted by `sendMessage`. Guards against an
    /// accidental double-tap of the SAME logical message within
    /// `Self.duplicateSendDebounce`; DISTINCT messages are never blocked.
    var lastAcceptedSend: (key: String, at: Date)?
    /// Window within which an identical re-send is treated as a double-tap.
    static let duplicateSendDebounce: TimeInterval = 0.6
    @Published var error: String?

    /// Maps a raw error to a string safe to show verbatim in the conversation
    /// error banner. `MeeshyError.server` carries a raw debug/decoding
    /// message meant for logs, not end users — it is swapped for a generic
    /// localized message. Every other error keeps its `localizedDescription`
    /// (already user-facing: `AuthError`, `NetworkError`, `MessageError`, ...).
    func userFacingMessage(for error: Error) -> String {
        if let meeshyError = error as? MeeshyError, case .server = meeshyError {
            return String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main)
        }
        return error.localizedDescription
    }

    /// Set before prepend so the view can restore scroll position
    @Published var scrollAnchorId: String?

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
            _mediaCaptionMap = nil
            translationResolutionCache.removeAll()
        }
    }
    @Published var messageTranscriptions: [String: MessageTranscription] = [:] {
        didSet { _allAudioItems = nil }
    }
    /// Per-attachment transcription keyed by `attachmentId`. The per-message
    /// `messageTranscriptions` slot only holds ONE transcription per message —
    /// for a multi-audio message it is overwritten in the hydration loop so
    /// only the LAST track survives. This dict keeps EACH track's own
    /// transcription so the audio carousel can show per-page karaoke.
    /// The single-audio path still reads `messageTranscriptions[msg.id]`.
    @Published var messageTranscriptionsByAttachment: [String: MessageTranscription] = [:] {
        didSet { _allAudioItems = nil }
    }
    @Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:] {
        didSet { _allAudioItems = nil }
    }
    /// Per-attachment translated audios keyed by `attachmentId`. The per-message
    /// `messageTranslatedAudios` slot only holds ONE attachment's audios per
    /// message — for a multi-audio message it is overwritten in the hydration
    /// loop so only the LAST track survives. This dict keeps EACH track's own
    /// translated audios so the audio carousel can show per-page language
    /// buttons (Prisme Linguistique). The single-audio path still falls back to
    /// `messageTranslatedAudios[msg.id]`. Mirrors `messageTranscriptionsByAttachment`.
    @Published var messageTranslatedAudiosByAttachment: [String: [MessageTranslatedAudio]] = [:] {
        didSet { _allAudioItems = nil }
    }

    /// On-demand translation requests currently in flight, keyed by messageId
    /// then by target language. Owned here — not as `@State` on
    /// `MessageLanguageDetailView` — so the "Traduire" button's loader
    /// survives the language sheet being dismissed and re-presented: the VM
    /// outlives the sheet, the view's `@State` does not.
    @Published var translatingTextLanguages: [String: Set<String>] = [:]
    @Published var translatingAudioLanguages: [String: Set<String>] = [:]

    struct TranslationRequestFailure: Equatable {
        enum Kind { case text, audio }
        let messageId: String
        let language: String
        let kind: Kind
        let message: String
    }

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

    struct BubbleLanguageSelection: Equatable {
        var activeDisplayLangCode: String?
        var secondaryLangCode: String?
    }

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
        audioCoordinator.syncActiveTrack(
            urlString: effectiveAudioTrackUrl(for: attachment, message: message)
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

    /// Dernier message dont l'affichage a fait « rattraper » la conversation.
    /// Rendu obsolète tout seul dès qu'un message plus récent arrive — la
    /// comparaison se fait sur le message le plus récent du moment.
    /// Cf. `caughtUpMessageId(seen:)`.
    private var lastCaughtUpMessageId: String?

    /// Detailed reaction data for a specific message (used by reaction detail sheet)
    @Published var reactionDetails: [ReactionGroup] = []
    @Published var isLoadingReactions = false

    /// ID of the first unread message (set once after initial load, cleared on scroll to bottom)
    @Published var firstUnreadMessageId: String?

    /// True during programmatic scrolls (initial load, send, scroll-to-bottom tap)
    /// When true, onAppear prefetch triggers are suppressed.
    var isProgrammaticScroll = false

    /// True when the conversation has been closed (no more messages can be sent)
    @Published var isConversationClosed = false

    /// True when the server has revoked access to this conversation (user
    /// removed from the participants list, group disbanded, etc.). The
    /// view must dismiss itself when this flips so the user cannot keep
    /// viewing/sending into a conversation they no longer belong to.
    @Published var accessRevoked: Bool = false

    /// Selected ephemeral duration for next message
    @Published var ephemeralDuration: EphemeralDuration?

    /// When true, next message will be sent with blur (recipient must tap to reveal)
    @Published var isBlurEnabled: Bool = false

    /// When true, next message will be sent as view-once (revealed once, then
    /// burned). Surfaced by the notification preview composer.
    @Published var isViewOnceEnabled: Bool = false

    /// Pending message effects selected via the effects picker
    @Published var pendingEffects: MessageEffects = .none

    /// When true, the effects picker sheet is presented
    @Published var showEffectsPicker: Bool = false

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
    private var audioCoordinator: ConversationAudioCoordinator {
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
    var searchNextCursor: String?

    /// True when the user jumped to a search result and messages are loaded around that point
    @Published var isInJumpedState = false

    /// True while the ViewModel is actively searching for a quoted message
    /// that wasn't in the local collection when the user tapped its reply
    /// reference. Drives a pulsing indicator on the scroll-to-bottom button
    /// so the user knows the app is working to find the cited message.
    @Published var isSearchingQuotedMessage = false
    /// The message id the user is trying to jump to. Set alongside
    /// `isSearchingQuotedMessage` and cleared once the jump completes
    /// (or fails). Read by the scroll button to display contextual text.
    @Published var quotedMessageSearchTarget: String? = nil

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

    // MARK: - O(1) Message Index

    var _messageIdIndex: [String: Int]?

    // MARK: - Date-Grouped Messages

    struct DateGroup: Identifiable {
        let id: String
        let date: Date
        let messages: [Message]
    }

    var _messagesByDate: [DateGroup]?

    // MARK: - Conversation-Wide Media

    struct MediaSenderInfo {
        let senderName: String
        let senderAvatarURL: String?
        let senderColor: String
        let sentAt: Date
    }

    var _mediaSenderInfoMap: [String: MediaSenderInfo]?

    /// All visual attachments (images + videos) across every loaded message, in chronological order.
    var _allVisualAttachments: [MessageAttachment]?

    // MARK: - Audio Items for Fullscreen Gallery

    struct AudioItem: Identifiable {
        let id: String // attachment.id
        let attachment: MessageAttachment
        let message: Message
        let transcription: MessageTranscription?
        let translatedAudios: [MessageTranslatedAudio]
    }

    var _allAudioItems: [AudioItem]?

    /// Maps attachment.id -> caption text for the fullscreen gallery.
    /// Priority: 1) attachment.caption  2) message text (only if single visual attachment)
    var _mediaCaptionMap: [String: String]?

    // MARK: - Private

    let conversationId: String
    let memberJoinedAt: Date?
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
    let commandHandler: ConversationCommandHandler
    let mediaHandler: ConversationMediaHandler
    let searchHandler: ConversationSearchHandler

    // MARK: - GRDB Persistence (additive — parallel data source alongside @Published messages)

    /// GRDB-backed observable store for UICollectionView bridge.
    /// Created eagerly in init so it is available at first paint.
    private(set) var messageStore: MessageStore

    /// Actor for optimistic inserts and state-machine transitions.
    private(set) var messagePersistence: MessagePersistenceActor
    var lastOlderPaginationTime: Date = .distantPast
    var lastNewerPaginationTime: Date = .distantPast
    static let paginationDebounceInterval: TimeInterval = 0.3
    static let paginationRetryCount: Int = 3
    private static let paginationRetryDelay: UInt64 = 500_000_000

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
    private let activeCallService: ActiveCallServiceProviding
    private let liveCallJoin: LiveCallJoinContext
    let translationService: TranslationServiceProviding
    let attachmentTranslationService: AttachmentTranslationProviding
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

    // Token bucket rate limiter for reaction spam prevention.
    // Allows burst of 10, refills at 3 tokens/second.
    private var reactionTokens: Double = 10
    private var reactionLastRefill: Date = Date()
    private static let reactionMaxTokens: Double = 10
    private static let reactionRefillRate: Double = 3

    func consumeReactionToken() -> Bool {
        let now = Date()
        let elapsed = now.timeIntervalSince(reactionLastRefill)
        reactionTokens = min(Self.reactionMaxTokens, reactionTokens + elapsed * Self.reactionRefillRate)
        reactionLastRefill = now
        guard reactionTokens >= 1 else { return false }
        reactionTokens -= 1
        return true
    }

    // MARK: - Mention Display Names (username → displayName) — cached

    var _mentionDisplayNames: [String: String]?

    // MARK: - Mention Autocomplete Logic — cached

    var _mentionCandidates: [MentionCandidate]?

    // MARK: - Top Active Members (cached)

    var _topActiveMembers: [ConversationActiveMember]?

    // MARK: - Init

    init(
        conversationId: String,
        unreadCount: Int = 0,
        isDirect: Bool = false,
        participantUserId: String? = nil,
        memberJoinedAt: Date? = nil,
        closedAt: Date? = nil,
        anonymousSession: AnonymousSessionContext? = nil,
        authManager: AuthManaging = AuthManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        reactionService: ReactionServiceProviding = ReactionService.shared,
        reportService: ReportServiceProviding = ReportService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared,
        mentionService: MentionServiceProviding = MentionService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        dependencies: ConversationDependencies = .live,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared,
        offlineQueue: OfflineMessageQueueing = OfflineQueue.shared,
        activeCallService: ActiveCallServiceProviding = ActiveCallService.shared,
        liveCallJoin: LiveCallJoinContext = .live,
        translationService: TranslationServiceProviding = TranslationService.shared,
        attachmentTranslationService: AttachmentTranslationProviding = AttachmentService.shared
    ) {
        self.activeCallService = activeCallService
        self.liveCallJoin = liveCallJoin
        self.translationService = translationService
        self.attachmentTranslationService = attachmentTranslationService
        self.conversationId = conversationId
        self.memberJoinedAt = memberJoinedAt
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
        // Eagerly create GRDB persistence so messageStore is available at first paint.
        self.messagePersistence = dependencies.persistence
        self.startupDependencies = dependencies
        self.anonymousSession = anonymousSession

        // Split-handler scaffolding — see ConversationStateStore et al.
        // Built before MessageStore/socket so subsequent delegations always
        // have a non-nil handler to call. The handlers don't drive any state
        // yet; they mirror the legacy @Published values via the messages
        // sink below so `searchHandler` / `mediaHandler` can read off
        // `stateStore.messages` without forking the source of truth.
        let stateStore = ConversationStateStore()
        self.stateStore = stateStore
        self.commandHandler = ConversationCommandHandler(
            state: stateStore,
            conversationId: conversationId,
            messageService: messageService,
            persistence: dependencies.persistence
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
        // Wire up the mention controller for this conversation.
        // localCandidates closure is evaluated lazily when a mention query fires,
        // so mentionCandidates (which depend on messages) is always up-to-date.
        // messageStore is initialized first: the localCandidates closure
        // transitively reads it through `mentionCandidates` -> `messages`,
        // so forming it before messageStore is set is a use-before-init error.
        self.mentionController = MentionComposerController(
            context: .conversation(id: conversationId),
            localCandidates: { [weak self] in self?.mentionCandidates ?? [] },
            service: mentionService
        )
        let handler = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: authManager.currentUser?.id ?? ""
        )
        handler.delegate = self
        handler.persistence = dependencies.persistence
        self.socketHandler = handler
    }

    // MARK: - MessageStore Observation (Task 1.3)

    /// Monotonic token bumped on every store-driven refresh. An async
    /// decryption pass that finishes after a newer refresh started checks this
    /// before assigning, so a stale snapshot never overwrites a fresher one.
    /// Stockée ici et non dans l'extension qui la pilote (`ConversationViewModel+StoreObservation.swift`) :
    /// une extension Swift ne peut pas déclarer de propriété stockée.
    var storeRefreshGeneration: Int = 0

    deinit {
        // socketHandler deinit handles room leave & typing cleanup
        socketHandler = nil
        // Only undo the singleton mutations `start()` performed. A throwaway VM
        // (eagerly allocated by `ConversationView.init`, never activated because
        // `@StateObject` discarded it before its `.task` ran) MUST NOT clear the
        // anonymous token or the currently-open gate — doing so cancelled what
        // the live VM's `start()` had just set and fed the re-render storm.
        guard hasStarted else { return }
        APIClient.shared.anonymousSessionToken = nil
        // Relinquish the currently-open conversation gate so cross-conversation
        // surfaces (back-button pill on other screens) resume counting it — but
        // ONLY if the gate still points at THIS conversation. On a fast A→B
        // switch the next VM's `start()` may set the gate to B before A's
        // `deinit` runs (ARC teardown order is not guaranteed vs the async
        // `.task`); an unconditional clear would then blank the gate while B is
        // on screen — phantom unread on B + B re-counted in the back-button pill.
        // Clearing by identity makes deinit order-safe.
        if syncEngine.currentlyOpenConversationId == conversationId {
            syncEngine.setCurrentlyOpenConversation(nil)
        }
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

    /// Re-initiate ("call back") a call from a tapped call-summary notice —
    /// or JOIN it when the notice is the LIVE message (`kind: 'call-live'`,
    /// "Appel … en cours"). Mirrors the conversation header's call entry
    /// point: direct (1:1) calls only, re-using the SAME media type
    /// (audio/video) as the summarized call. The peer display name is
    /// resolved best-effort from a received message so the CallKit / in-app
    /// outgoing UI shows a name, not a raw id.
    func callBack(for summary: CallSummaryMetadata) {
        // Anonymous shared-link guests never get a calling affordance — mirrors
        // the header's `anonymousHeaderBar` swap (ConversationView) which hides
        // the call buttons entirely for this session kind. A call-summary
        // bubble further down history must honor the SAME gate, otherwise a
        // guest can trigger the OS microphone permission prompt from a bubble
        // tap before the gateway's own isAnonymous check ever runs.
        guard anonymousSession == nil else { return }
        guard isDirect, let peerUserId = participantUserId, !peerUserId.isEmpty else { return }
        if summary.isLive {
            Task { await joinOngoingCall(summary) }
            return
        }
        let displayName = resolvedPeerDisplayName
            ?? String(localized: "call.peer.fallback", defaultValue: "Appel", bundle: .main)
        Task { @MainActor in
            await CallManager.shared.requestPermissionsThenStartCall(
                conversationId: conversationId,
                userId: peerUserId,
                displayName: displayName,
                isVideo: summary.callType == .video
            )
        }
    }

    /// Rejoint l'appel EN COURS annoncé par la bulle vivante — 4 branches :
    ///   1. ce device est déjà sur CET appel (actif ou en négociation) →
    ///      ramener l'UI d'appel au premier plan ;
    ///   2. ce device SONNE sur cet appel (bannière call-waiting) → laisser la
    ///      bannière/CallKit porter le geste de réponse, pas de double-join ;
    ///   3. l'appel est actif côté serveur (revalidé via active-call) →
    ///      `rejoinActiveCall` (réhydratation à froid — app relancée mi-appel) ;
    ///   4. l'appel n'existe plus → toast « L'appel est terminé » (la bulle
    ///      sera éditée au terminal dès que le message:edited arrive).
    /// Internal (pas private) pour la testabilité des branches.
    func joinOngoingCall(_ summary: CallSummaryMetadata) async {
        // Same anonymity gate as `callBack(for:)` — this is also reachable
        // directly from `callBack` for the isLive branch, but joining is a
        // distinct code path (revalidated server round-trip) so it re-asserts
        // the guard rather than relying on the caller alone.
        guard anonymousSession == nil else { return }
        // 1 — déjà sur cet appel : l'UI d'appel revient au premier plan.
        if liveCallJoin.currentCallId() == summary.callId, !liveCallJoin.isIdle() {
            liveCallJoin.bringCallUIForward()
            return
        }
        // 2 — cet appel sonne en attente sur ce device : répondre reste le
        // geste de la bannière (jamais de rejoin concurrent).
        if liveCallJoin.hasPendingIncomingCall(summary.callId) {
            return
        }
        // 3/4 — réhydratation à froid : revalider côté serveur avant tout média.
        do {
            let session = try await activeCallService.activeCall(conversationId: conversationId)
            guard let session, session.id == summary.callId else {
                FeedbackToastManager.shared.show(
                    String(localized: "bubble.call.join.ended", defaultValue: "L'appel est terminé", bundle: .main),
                    type: .info
                )
                return
            }
            let remote = session.remoteParticipant(currentUserId: currentUserId)
            let displayName = remote?.user?.displayName
                ?? remote?.user?.username
                ?? resolvedPeerDisplayName
                ?? String(localized: "call.peer.fallback", defaultValue: "Appel", bundle: .main)
            let joined = liveCallJoin.rejoinActiveCall(
                summary.callId,
                conversationId,
                remote?.userId ?? participantUserId ?? "",
                displayName,
                summary.callType == .video
            )
            if !joined {
                Logger.messages.warning("[ConversationVM] rejoinActiveCall refused (state non-idle) for \(summary.callId, privacy: .public)")
            }
        } catch {
            FeedbackToastManager.shared.showError(
                String(localized: "bubble.call.join.failed", defaultValue: "Impossible de rejoindre l'appel", bundle: .main)
            )
        }
    }

    /// Best-effort peer display name from the most recent received message in
    /// the current snapshot (sender differs from the current user).
    private var resolvedPeerDisplayName: String? {
        messageStore.messages
            .last { $0.senderId != currentUserId && !($0.senderName ?? "").isEmpty }?
            .senderName
    }

    /// Kicks off conversation-wide audio playback starting at `attachmentId`.
    ///
    /// Resolves the message/attachment in the current `messages` snapshot,
    /// asks `AudioQueueBuilder` for the unlistened, non-self tail of audios
    /// strictly after this one, then routes the whole queue through the app
    /// coordinator (which gates on CallKit + auth and exposes the mini-player
    /// state to the rest of the app).
    func playAudio(attachmentId: String) {
        guard let (message, attachment) = findAudioAttachment(id: attachmentId),
              attachment.type == .audio,
              authManager.currentUser?.id != nil else { return }

        let current = QueuedAudio(
            attachmentId: attachment.id,
            messageId: message.id,
            conversationId: message.conversationId,
            // La piste EFFECTIVE, pas l'original en dur : le drapeau-toggle
            // et le Prisme décident (user 2026-08-18 — le widget affichait
            // la piste traduite pendant que le coordinateur rejouait
            // l'original).
            fileUrl: effectiveAudioTrackUrl(for: attachment, message: message),
            durationMs: attachment.duration ?? 0,
            senderName: message.senderName ?? "",
            senderAvatarURL: message.senderAvatarURL,
            receivedAt: message.createdAt
        )

        let tail = audioQueueTail(after: attachment.id)

        audioCoordinator.play(
            current: current,
            tail: tail,
            conversationName: currentConversationName,
            conversationArtworkURL: currentConversationArtworkURL
        )
    }

    /// File des vocaux non écoutés strictement APRÈS `attachmentId` — partagée
    /// entre `playAudio` et le plein écran (`AudioFullscreenSource.queueTailProvider`).
    func audioQueueTail(after attachmentId: String) -> [QueuedAudio] {
        guard let currentUserId = authManager.currentUser?.id else { return [] }
        return AudioQueueBuilder.build(
            from: messages,
            startingAfterAttachmentId: attachmentId,
            currentUserId: currentUserId,
            listenedAttachmentIds: listenedAttachmentIds,
            // L'auto-avance joue la piste EFFECTIVE de chaque vocal — sans
            // ce résolveur, le 2e vocal sortait en V.O. pendant que sa bulle
            // affichait le karaoké traduit (revue adversariale 2026-08-18).
            trackUrlResolver: { [weak self] message, attachment in
                self?.effectiveAudioTrackUrl(for: attachment, message: message) ?? attachment.fileUrl
            }
        )
    }

    /// O(n) scan over `messages` for the message that owns `attachmentId`.
    /// `messages` rarely exceeds a few hundred rows in memory; an index would
    /// have to invalidate on every attachment update for negligible gain.
    private func findAudioAttachment(id: String) -> (Message, MessageAttachment)? {
        for message in messages {
            if let att = message.attachments.first(where: { $0.id == id && $0.type == .audio }) {
                return (message, att)
            }
        }
        return nil
    }

    /// Pistes traduites d'un attachement — MÊME source que `allAudioItems`
    /// (par-attachement d'abord, repli par-message filtré), jamais une
    /// troisième résolution.
    private func translatedAudioTracks(for attachment: MessageAttachment, messageId: String) -> [MessageTranslatedAudio] {
        messageTranslatedAudiosByAttachment[attachment.id]
            ?? (messageTranslatedAudios[messageId] ?? []).filter { $0.attachmentId == attachment.id }
    }

    /// URL de la piste audio EFFECTIVE d'un attachement — la même loi que le
    /// widget (`AudioTrackLanguageResolver` : bascule manuelle du drapeau
    /// puis Prisme). C'est CETTE url que le coordinateur doit jouer pour que
    /// l'audio entendu corresponde au texte et aux segments affichés.
    private func effectiveAudioTrackUrl(for attachment: MessageAttachment, message: Message) -> String {
        let tracks = translatedAudioTracks(for: attachment, messageId: message.id)
        let lang = AudioTrackLanguageResolver.resolve(
            manualOverride: bubbleLanguageSelections[message.id]?.activeDisplayLangCode,
            originalLanguage: message.originalLanguage,
            preferredLanguages: ConversationLanguagePreferences(user: authManager.currentUser).resolved,
            translatedAudios: tracks
        )
        return AudioTrackLanguageResolver.url(for: lang, translatedAudios: tracks, originalUrl: attachment.fileUrl)
    }

    /// Subscribes to `$messages` and forwards any newly-inserted audio messages
    /// — from someone else, in the conversation currently being played by the
    /// coordinator — into the active playback queue via `appendUpcoming`.
    ///
    /// Uses a snapshot of seen message ids to detect genuinely new inserts and
    /// ignore re-orderings or in-place mutations (edits, reactions, etc.).
    private var seenMessageIdsForAudioQueue: Set<String> = []
    private var didSeedAudioQueueSnapshot = false

    func subscribeToMessagesForAudioQueue() {
        // Hot-path filter: `$messages` fires on EVERY mutation (insert,
        // delete, edit, reaction, translation update, …). On a busy
        // conversation with reactions in burst, that can be 20-50 emissions
        // per second. The handler only cares about inserts/deletes (those
        // are the only mutations that change the message-id set), so we
        // dedupe on the id sequence to skip in-place mutations cheaply.
        //
        // Trade-off: an edit that REPLACES a message in place with a new
        // audio attachment would not refire here. That case is rare in
        // practice — audio attachments are not typically added to an
        // existing message — and the seenMessageIdsForAudioQueue set below
        // would still skip it correctly if the id is preserved.
        $messages
            .map { $0.map(\.id) }
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.processMessagesForAudioQueueAppend(self.messages)
            }
            .store(in: &cancellables)
    }

    /// Subscribes to the shared `ConversationAudioCoordinator`'s
    /// `attachmentFinishedPublisher` so this VM records each natural-end /
    /// failed-load event in `listenedAttachmentIds`. Filters by
    /// `event.conversationId == self.conversationId` so a coordinator owned
    /// by another conversation (the singleton is process-wide) NEVER
    /// pollutes this VM's listened set with foreign attachment ids.
    /// The subscription auto-cleans on `deinit` via `cancellables`.
    func subscribeToAudioCoordinatorFinishedEvents() {
        let ownConversationId = conversationId
        audioCoordinator.attachmentFinishedPublisher
            .filter { event in event.conversationId == ownConversationId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.listenedAttachmentIds.insert(event.attachmentId)
            }
            .store(in: &cancellables)
    }

    private func processMessagesForAudioQueueAppend(_ snapshot: [Message]) {
        // First emission (and any emission while no coordinator session is
        // active for THIS conversation) just refreshes the baseline so the
        // backlog never replays as "new" once playback starts.
        guard didSeedAudioQueueSnapshot,
              let activeConvId = audioCoordinator.activeContext?.conversationId,
              activeConvId == conversationId,
              let currentUserId = authManager.currentUser?.id else {
            seenMessageIdsForAudioQueue = Set(snapshot.map(\.id))
            didSeedAudioQueueSnapshot = true
            return
        }

        for message in snapshot where !seenMessageIdsForAudioQueue.contains(message.id) {
            seenMessageIdsForAudioQueue.insert(message.id)
            guard message.senderId != currentUserId,
                  message.conversationId == activeConvId else { continue }
            for attachment in message.attachments
                where attachment.type == .audio
                && !listenedAttachmentIds.contains(attachment.id) {
                audioCoordinator.appendUpcoming(QueuedAudio(
                    attachmentId: attachment.id,
                    messageId: message.id,
                    conversationId: message.conversationId,
                    // Piste EFFECTIVE — même loi que playAudio/la tail.
                    fileUrl: effectiveAudioTrackUrl(for: attachment, message: message),
                    durationMs: attachment.duration ?? 0,
                    senderName: message.senderName ?? "",
                    senderAvatarURL: message.senderAvatarURL,
                    receivedAt: message.createdAt
                ))
            }
        }
    }

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
        sendReadReceipt(messageIds: messageIds, caughtUpId: caughtUpMessageId(seen: messageIds, visible: visibleIds))
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
        guard !hasNewerMessages, let newest = newestServerMessageId() else { return }
        lastCaughtUpMessageId = newest
        sendReadReceipt(messageIds: nil, caughtUpId: newest)
    }

    /// Marque localement (badge, cache, widget) puis envoie au serveur —
    /// partagé par `markAsRead` et `markCaughtUpFromSummaryOrRiver`, seule la
    /// provenance de `caughtUpId` diffère entre les deux.
    private func sendReadReceipt(messageIds: [String]?, caughtUpId: String?) {
        let convId = conversationId
        if messageIds == nil || caughtUpId != nil {
            // Les trois surfaces locales d'un seul geste — cache + frontière,
            // lignes @Published + `ConversationStore`, badge d'icône + widget.
            // Ce chemin n'en écrivait que deux : le badge d'icône restait au
            // compte d'avant jusqu'à un `read-status:updated` serveur.
            ConversationReadSignal.markReadLocally(convId, syncEngine: syncEngine)
        }
        // 3. Send to server in background (fire-and-forget, queue on failure)
        //
        // PAS de gate client sur showReadReceipts : le gateway gate déjà le
        // broadcast aux pairs selon la préférence (divulgation), mais il a
        // BESOIN de l'appel pour avancer le curseur de lecture — c'est lui qui
        // alimente `conversation:unread-updated` (badge multi-appareils, icône,
        // widget). Le même gate a été délibérément retiré du chemin
        // ConversationListViewModel pour la même raison ; avec le gate, un
        // utilisateur accusés-OFF gardait un badge fantôme sur ses autres
        // appareils et sur l'icône de l'app.
        // Wave 1 Phase C — route through the offline outbox so a read
        // receipt produced while offline survives an app kill and replays
        // on reconnect. The gateway route is naturally idempotent (read
        // cursor only moves forward) so a replay is harmless ; we still
        // tag it with a cmid for instrumentation parity with the other
        // outbox kinds. Fall back to the legacy `PendingStatusQueue` if
        // the outbox enqueue itself fails (e.g. pool not configured).
        // Résolu ICI, pas au moment de l'envoi : la file d'attente peut partir
        // longtemps après, et une traduction arrivée entre-temps ne change pas
        // ce que le lecteur avait sous les yeux.
        let languages = messageIds.map { splitConsumedLanguages(for: $0) }
        Task {
            let cmid = ClientMutationId.generate()
            let payload = MarkAsReadPayload(
                clientMutationId: cmid,
                conversationId: convId,
                messageIds: messageIds,
                language: languages?.language,
                messageLanguages: languages?.exceptions,
                caughtUpToMessageId: caughtUpId
            )
            do {
                try await OfflineQueue.shared.enqueue(.markAsRead, payload: payload, conversationId: convId)
                // Mirror of ConversationCommandHandler.markAsRead: without
                // an explicit flushNow() the markAsRead row sits .pending
                // until an unrelated mutation (reaction, send, etc.) wakes
                // the flusher up, leaving "Synchronisation des lus" stuck
                // in the SyncPill indefinitely.
                await OutboxFlushTrigger.flushNow()
            } catch {
                await PendingStatusQueue.shared.enqueue(.init(
                    conversationId: convId, type: "read", timestamp: Date()
                ))
            }
        }
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
        commandHandler.markAsReceived()
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
        return prefs.resolved
    }
}
