import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// MARK: - Real-time Translation Type (text translations, not in SDK)

struct MessageTranslation: Identifiable {
    let id: String
    let messageId: String
    let sourceLanguage: String
    let targetLanguage: String
    let translatedContent: String
    let translationModel: String
    let confidenceScore: Double?
}

// MessageTranscription, MessageTranscriptionSegment, MessageTranslatedAudio
// are defined in MeeshySDK.TranscriptionModels — use those directly.

// MARK: - ConversationDependencies

struct ConversationDependencies {
    let dbPool: any DatabaseWriter
    let persistence: MessagePersistenceActor

    @MainActor
    static var live: ConversationDependencies {
        ConversationDependencies(
            dbPool: DependencyContainer.shared.dbPool,
            persistence: DependencyContainer.shared.messagePersistence
        )
    }
}

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
        _cachedLastReceivedIndex = nil
        _cachedLastSentIndex = nil

        if structureChanged {
            _messagesByDate = nil
            _topActiveMembers = nil
            _mediaSenderInfoMap = nil
            _allVisualAttachments = nil
            _mediaCaptionMap = nil
            _allAudioItems = nil
            _replyCountMap = nil
            _mentionDisplayNames = nil
            _mentionCandidates = nil
        }
    }

    // Double-optional: nil = not computed, .some(nil) = computed but no match, .some(.some(N)) = found at N
    private var _cachedLastReceivedIndex: Int?? = nil
    var cachedLastReceivedIndex: Int? {
        if let cached = _cachedLastReceivedIndex { return cached }
        let result = messages.indices.last(where: { !messages[$0].isMe })
        _cachedLastReceivedIndex = .some(result)
        return result
    }

    private var _cachedLastSentIndex: Int?? = nil
    var cachedLastSentIndex: Int? {
        if let cached = _cachedLastSentIndex { return cached }
        let result = messages.indices.last(where: { messages[$0].isMe })
        _cachedLastSentIndex = .some(result)
        return result
    }

    var lastReceivedMessageId: String? {
        cachedLastReceivedIndex.map { messages[$0].id }
    }
    var lastSentMessageId: String? {
        cachedLastSentIndex.map { messages[$0].id }
    }

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
    @Published var error: String?

    /// Set before prepend so the view can restore scroll position
    @Published var scrollAnchorId: String?
    /// Incremented when a new message is appended at the end (not prepended)
    @Published var newMessageAppended: Int = 0

    /// Users currently typing in this conversation
    @Published var typingUsernames: [String] = []

    /// Real-time translation/transcription/audio data keyed by messageId
    @Published var messageTranslations: [String: [MessageTranslation]] = [:] {
        didSet { _mediaCaptionMap = nil }
    }
    @Published var messageTranscriptions: [String: MessageTranscription] = [:] {
        didSet { _allAudioItems = nil }
    }
    @Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:] {
        didSet { _allAudioItems = nil }
    }

    /// Manual translation override per message (user selected a specific language in Language tab)
    /// nil value means user chose "show original"
    @Published var activeTranslationOverrides: [String: MessageTranslation?] = [:]

    /// Manual audio language override per message (user selected a language in Language tab for audio)
    /// nil value means user chose "show original audio"
    @Published var activeAudioLanguageOverrides: [String: String?] = [:]

    /// Active live location sessions in this conversation
    @Published var activeLiveLocations: [ActiveLiveLocation] = []

    /// Last unread message from another user (set only via socket, cleared on scroll-to-bottom)
    @Published var lastUnreadMessage: Message?

    /// Updated by the MessageListViewController's scroll delegate via the
    /// `onNearBottomChanged` callback. Drives the anticipatory prefetch:
    /// when the user is NOT near the bottom (scrolling up into history),
    /// `loadOlderMessages` eagerly prefetches the next page after each
    /// successful load so older messages are ready before the user reaches them.
    var isCurrentlyNearBottom: Bool = true

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

    /// Pending message effects selected via the effects picker
    @Published var pendingEffects: MessageEffects = .none

    /// When true, the effects picker sheet is presented
    @Published var showEffectsPicker: Bool = false

    // MARK: - Mention Autocomplete State

    @Published var mentionController: MentionComposerController = MentionComposerController(context: .conversation(id: ""))

    // MARK: - Mention Forwarding (backwards compat for ConversationView)

    var mentionSuggestions: [MentionCandidate] { mentionController.suggestions }
    var activeMentionQuery: String? { mentionController.activeQuery }

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
    var pendingServerIds: [String: String] = [:]

    /// Resolve the authoritative server id for an in-memory message. Falls
    /// back to the supplied id when no mapping exists (the message id is
    /// already a server id, e.g. messages received from other users).
    func serverId(for messageId: String) -> String {
        pendingServerIds[messageId] ?? messageId
    }

    /// Persist the current `messages` snapshot to the cache using server ids
    /// for every reconciled optimistic row, so a future cold-start REST fetch
    /// reconciles cleanly without producing duplicate `temp_…` / server-id
    /// pairs. Called after the socket reconciliation in `ConversationSocketHandler`.
    func persistMessagesUsingServerIds() async {
        let convId = conversationId
        let mapping = pendingServerIds
        let snapshot = messages
        let rewritten: [Message] = snapshot.map { msg -> Message in
            guard let serverId = mapping[msg.id] else { return msg }
            // Message.id is `let` — copy via init with overridden id.
            return Message(
                id: serverId,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                content: msg.content,
                originalLanguage: msg.originalLanguage,
                messageType: msg.messageType,
                messageSource: msg.messageSource,
                isEdited: msg.isEdited,
                editedAt: msg.editedAt,
                deletedAt: msg.deletedAt,
                replyToId: msg.replyToId,
                storyReplyToId: msg.storyReplyToId,
                forwardedFromId: msg.forwardedFromId,
                forwardedFromConversationId: msg.forwardedFromConversationId,
                expiresAt: msg.expiresAt,
                effects: msg.effects,
                maxViewOnceCount: msg.maxViewOnceCount,
                viewOnceCount: msg.viewOnceCount,
                pinnedAt: msg.pinnedAt,
                pinnedBy: msg.pinnedBy,
                isEncrypted: msg.isEncrypted,
                encryptionMode: msg.encryptionMode,
                createdAt: msg.createdAt,
                updatedAt: msg.updatedAt,
                attachments: msg.attachments,
                reactions: msg.reactions,
                replyTo: msg.replyTo,
                forwardedFrom: msg.forwardedFrom,
                senderName: msg.senderName,
                senderUsername: msg.senderUsername,
                senderColor: msg.senderColor,
                senderAvatarURL: msg.senderAvatarURL,
                senderUserId: msg.senderUserId,
                deliveryStatus: msg.deliveryStatus,
                isMe: msg.isMe,
                deliveredToAllAt: msg.deliveredToAllAt,
                readByAllAt: msg.readByAllAt,
                deliveredCount: msg.deliveredCount,
                readCount: msg.readCount
            )
        }
        try? await CacheCoordinator.shared.messages.save(rewritten, for: convId)
    }

    // MARK: - O(1) Message Index

    private var _messageIdIndex: [String: Int]?

    private var messageIdIndex: [String: Int] {
        if let cached = _messageIdIndex { return cached }
        var index = [String: Int](minimumCapacity: messages.count)
        for (i, msg) in messages.enumerated() {
            index[msg.id] = i
        }
        _messageIdIndex = index
        return index
    }

    func messageIndex(for id: String) -> Int? {
        messageIdIndex[id]
    }

    func containsMessage(id: String) -> Bool {
        messageIdIndex[id] != nil || pendingServerIds.values.contains(id)
    }

    // MARK: - Date-Grouped Messages

    struct DateGroup: Identifiable {
        let id: String
        let date: Date
        let messages: [Message]
    }

    private var _messagesByDate: [DateGroup]?

    var messagesByDate: [DateGroup] {
        if let cached = _messagesByDate { return cached }
        // Exclude rows the user deleted locally (WhatsApp "Delete for me"
        // behaviour) so they never reappear across cache reloads, REST
        // refreshes, or new socket arrivals of older messages.
        let hiddenIds = LocallyHiddenMessagesStore.shared.allHiddenIds
        let visible = hiddenIds.isEmpty ? messages : messages.filter { !hiddenIds.contains($0.id) }
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: visible) { msg -> DateComponents in
            calendar.dateComponents([.year, .month, .day], from: msg.createdAt)
        }
        let result = grouped.map { (comps, msgs) in
            let dateKey = "\(comps.year ?? 0)-\(comps.month ?? 0)-\(comps.day ?? 0)"
            let representativeDate = msgs.first?.createdAt ?? Date()
            return DateGroup(id: dateKey, date: representativeDate, messages: msgs)
        }
        .sorted { $0.date < $1.date }
        _messagesByDate = result
        return result
    }

    // MARK: - Conversation-Wide Media

    struct MediaSenderInfo {
        let senderName: String
        let senderAvatarURL: String?
        let senderColor: String
        let sentAt: Date
    }

    private var _mediaSenderInfoMap: [String: MediaSenderInfo]?
    var mediaSenderInfoMap: [String: MediaSenderInfo] {
        if let cached = _mediaSenderInfoMap { return cached }
        var map = [String: MediaSenderInfo](minimumCapacity: messages.count)
        for msg in messages {
            let info = MediaSenderInfo(
                senderName: msg.senderName ?? "?",
                senderAvatarURL: msg.senderAvatarURL,
                senderColor: msg.senderColor ?? "#999",
                sentAt: msg.createdAt
            )
            for att in msg.attachments {
                map[att.id] = info
            }
        }
        _mediaSenderInfoMap = map
        return map
    }

    /// All visual attachments (images + videos) across every loaded message, in chronological order.
    private var _allVisualAttachments: [MessageAttachment]?
    var allVisualAttachments: [MessageAttachment] {
        if let cached = _allVisualAttachments { return cached }
        let result = messages.flatMap { msg in
            msg.attachments.filter { [.image, .video].contains($0.type) }
        }
        _allVisualAttachments = result
        return result
    }

    // MARK: - Audio Items for Fullscreen Gallery

    struct AudioItem: Identifiable {
        let id: String // attachment.id
        let attachment: MessageAttachment
        let message: Message
        let transcription: MessageTranscription?
        let translatedAudios: [MessageTranslatedAudio]
    }

    private var _allAudioItems: [AudioItem]?
    var allAudioItems: [AudioItem] {
        if let cached = _allAudioItems { return cached }
        let result = messages.flatMap { msg in
            msg.attachments
                .filter { $0.type == .audio }
                .map { att in
                    AudioItem(
                        id: att.id,
                        attachment: att,
                        message: msg,
                        transcription: messageTranscriptions[msg.id],
                        translatedAudios: messageTranslatedAudios[msg.id] ?? []
                    )
                }
        }
        _allAudioItems = result
        return result
    }

    /// Maps attachment.id -> caption text for the fullscreen gallery.
    /// Priority: 1) attachment.caption  2) message text (only if single visual attachment)
    private var _mediaCaptionMap: [String: String]?
    var mediaCaptionMap: [String: String] {
        if let cached = _mediaCaptionMap { return cached }
        var map: [String: String] = [:]
        for msg in messages {
            let visuals = msg.attachments.filter { [.image, .video].contains($0.type) }
            for att in visuals {
                if let caption = att.caption, !caption.isEmpty {
                    map[att.id] = caption
                } else if visuals.count == 1 && !msg.content.isEmpty {
                    // Single visual + message text -> show as caption
                    // Use translation if available, otherwise original content
                    if let preferred = preferredTranslation(for: msg.id) {
                        map[att.id] = preferred.translatedContent
                    } else {
                        map[att.id] = msg.content
                    }
                }
            }
        }
        _mediaCaptionMap = map
        return map
    }

    // MARK: - Reply Count Map (cached, O(1) lookup per message)

    private var _replyCountMap: [String: Int]?
    var replyCountMap: [String: Int] {
        if let cached = _replyCountMap { return cached }
        var map = [String: Int]()
        for msg in messages {
            if let parentId = msg.replyToId {
                map[parentId, default: 0] += 1
            }
        }
        _replyCountMap = map
        return map
    }

    // MARK: - Private

    let conversationId: String
    let memberJoinedAt: Date?
    private let isDirect: Bool
    private let participantUserId: String?
    private let initialUnreadCount: Int
    private let limit = 30
    private var nextMessageCursor: String?
    private var cancellables = Set<AnyCancellable>()
    private var messagesPersistCancellable: AnyCancellable?
    /// Subscription that mirrors `MessageStore.messagesDidChange` into the
    /// `messages` array.  Established once in `init` after `messageStore` is ready.
    private var storeObservation: AnyCancellable?
    private var socketHandler: ConversationSocketHandler?

    // MARK: - GRDB Persistence (additive — parallel data source alongside @Published messages)

    /// GRDB-backed observable store for UICollectionView bridge.
    /// Created eagerly in init so it is available at first paint.
    private(set) var messageStore: MessageStore

    /// Actor for optimistic inserts and state-machine transitions.
    private(set) var messagePersistence: MessagePersistenceActor
    private var lastOlderPaginationTime: Date = .distantPast
    private var lastNewerPaginationTime: Date = .distantPast
    private static let paginationDebounceInterval: TimeInterval = 0.3
    private static let paginationRetryCount: Int = 3
    private static let paginationRetryDelay: UInt64 = 500_000_000

    private let authManager: AuthManaging
    private let messageService: MessageServiceProviding
    private let conversationService: ConversationServiceProviding
    private let reactionService: ReactionServiceProviding
    private let reportService: ReportServiceProviding
    private let syncEngine: ConversationSyncEngineProviding
    private let mentionService: MentionServiceProviding
    private let decryptionActor = DecryptionActor(provider: LiveSessionProvider())

    private var currentUserId: String { authManager.currentUser?.id ?? "" }
    /// Public read-only accessor for the view layer (UIKit bridge needs the user id).
    var currentUserIdForView: String { currentUserId }
    private var currentUsername: String? { authManager.currentUser?.username }
    private var _resolvedParticipantId: String?

    // Token bucket rate limiter for reaction spam prevention.
    // Allows burst of 10, refills at 3 tokens/second.
    private var reactionTokens: Double = 10
    private var reactionLastRefill: Date = Date()
    private static let reactionMaxTokens: Double = 10
    private static let reactionRefillRate: Double = 3

    private func consumeReactionToken() -> Bool {
        let now = Date()
        let elapsed = now.timeIntervalSince(reactionLastRefill)
        reactionTokens = min(Self.reactionMaxTokens, reactionTokens + elapsed * Self.reactionRefillRate)
        reactionLastRefill = now
        guard reactionTokens >= 1 else { return false }
        reactionTokens -= 1
        return true
    }

    // MARK: - Mention Display Names (username → displayName) — cached

    private var _mentionDisplayNames: [String: String]?

    var mentionDisplayNames: [String: String] {
        if let cached = _mentionDisplayNames { return cached }
        UserDisplayNameCache.shared.trackFromMessages(messages)
        let map = UserDisplayNameCache.shared.allMappings()
        _mentionDisplayNames = map
        return map
    }

    // MARK: - Mention Autocomplete Logic — cached

    private var _mentionCandidates: [MentionCandidate]?

    private var mentionCandidates: [MentionCandidate] {
        if let cached = _mentionCandidates { return cached }
        var seen = Set<String>()
        var candidates: [MentionCandidate] = []
        for msg in messages {
            guard let username = msg.senderUsername, !seen.contains(username) else { continue }
            seen.insert(username)
            candidates.append(MentionCandidate(
                id: msg.senderId.isEmpty ? username : msg.senderId,
                username: username,
                displayName: msg.senderName ?? username,
                avatarURL: msg.senderAvatarURL
            ))
        }
        _mentionCandidates = candidates
        return candidates
    }

    // MARK: - Mention Delegation

    /// Delegates to the controller. Called from `onTextChanged`.
    func handleMentionQuery(in text: String) {
        mentionController.handleQuery(in: text)
    }

    func clearMentionSuggestions() {
        mentionController.clearSuggestions()
    }

    /// Delegates insertion to the controller and returns the updated text.
    func insertMention(_ candidate: MentionCandidate, into text: String) -> String {
        mentionController.insertMention(candidate, into: text)
    }

    // MARK: - Top Active Members (cached)

    private var _topActiveMembers: [ConversationActiveMember]?

    func topActiveMembersList(accentColor: String) -> [ConversationActiveMember] {
        if let cached = _topActiveMembers { return cached }
        var counts: [String: (name: String, color: String, avatarURL: String?, count: Int)] = [:]
        for msg in messages where !msg.isMe {
            let id = msg.senderId
            guard !id.isEmpty else { continue }
            if var existing = counts[id] {
                existing.count += 1
                counts[id] = existing
            } else {
                counts[id] = (
                    name: msg.senderName ?? "?",
                    color: msg.senderColor ?? accentColor,
                    avatarURL: msg.senderAvatarURL,
                    count: 1
                )
            }
        }
        let result = counts
            .sorted { $0.value.count > $1.value.count }
            .prefix(3)
            .map { ConversationActiveMember(id: $0.key, name: $0.value.name, color: $0.value.color, avatarURL: $0.value.avatarURL) }
        _topActiveMembers = result
        return result
    }

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
        dependencies: ConversationDependencies = .live
    ) {
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
        // Wire up the mention controller for this conversation.
        // localCandidates closure is evaluated lazily when a mention query fires,
        // so mentionCandidates (which depend on messages) is always up-to-date.
        self.mentionController = MentionComposerController(
            context: .conversation(id: conversationId),
            localCandidates: { [weak self] in self?.mentionCandidates ?? [] },
            service: mentionService
        )
        // Eagerly create GRDB persistence so messageStore is available at first paint.
        self.messagePersistence = dependencies.persistence
        let store = MessageStore(
            conversationId: conversationId,
            persistence: dependencies.persistence
        )
        self.messageStore = store
        let handler = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: authManager.currentUser?.id ?? ""
        )
        handler.delegate = self
        handler.persistence = dependencies.persistence
        self.socketHandler = handler
        store.startObserving(dbPool: dependencies.dbPool)
        Task { await store.loadInitial() }
        messagesPersistCancellable = $messages
            .dropFirst()
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] snapshot in
                guard let self, !snapshot.isEmpty else { return }
                // Route through the id-mapping persister so any reconciled
                // optimistic rows land in cache under their server ids.
                Task { [weak self] in await self?.persistMessagesUsingServerIds() }
            }
        subscribeToMessageStore()
        subscribeToQueueReconciliation()
        subscribeToLanguagePreferenceChanges()
        if let session = anonymousSession {
            APIClient.shared.anonymousSessionToken = session.sessionToken
            MessageSocketManager.shared.connectAnonymous(sessionToken: session.sessionToken)
        }
    }

    /// Reconcile optimistic messages with their server-assigned ids when the
    /// unified `OfflineQueue` finally lands the send, and flip rows to
    /// `.failed` when the retry budget is exhausted. Without this mapping a
    /// `message:new` socket broadcast arrives with an unknown id and the
    /// optimistic row would stay stuck in `.sending` forever while a duplicate
    /// appears.
    ///
    /// Wave 1 Task 3.6 — collapsed onto the unified `OfflineQueue.retrySucceeded` /
    /// `.retryExhausted` / `.retryDropped` signals, replacing the legacy
    /// per-queue publishers from `MessageRetryQueue` and `ReactionQueue`.
    // MARK: - MessageStore Observation (Task 1.3)

    /// Subscribes to `messageStore.messagesDidChange` so that GRDB-driven
    /// inserts/updates (optimistic sends, offline queue reconciliation) are
    /// reflected in `messages` without an explicit assignment at the call site.
    ///
    /// When the store emits a change, this method maps the `[MessageRecord]`
    /// snapshot to `[MeeshyMessage]`, replaces `messages`, and calls
    /// `objectWillChange` so SwiftUI re-renders.
    private func subscribeToMessageStore() {
        storeObservation = messageStore.messagesDidChange
            .sink { [weak self] in
                // Defer to a fresh runloop tick via DispatchQueue.main.async — a
                // synchronous .receive(on: DispatchQueue.main) handler can fire
                // mid-view-update on the SwiftUI render runloop, which trips
                // "Publishing changes from within view updates" when @Published
                // self.messages is mutated. async-dispatch from any thread
                // guarantees the @Published mutation lands on a fresh runloop
                // iteration AFTER the current view body evaluation completes.
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    let userId = self.currentUserId
                    let previousCount = self.messages.count
                    let mapped = self.messageStore.messages.map { $0.toMessage(currentUserId: userId) }
                    self.messages = mapped
                    // Increment scroll-to-bottom counter when an optimistic send
                    // surfaces via store observation (replaces the former increment
                    // that sat next to messages.append in sendMessage).
                    if mapped.count > previousCount {
                        self.newMessageAppended += 1
                    }
                }
            }
    }

    private func subscribeToQueueReconciliation() {
        // Wave 1 Task 3.6 — unified `OfflineQueue.retrySucceeded` covers both
        // message-centric (sendMessage/edit/delete) and reaction
        // (sendReaction) outbox kinds. We only act on `.sendMessage` here
        // because that's the only kind that produces a server-assigned id
        // worth reconciling with the optimistic local id. Reaction success
        // is a no-op at the ViewModel level — the `reaction:added` /
        // `reaction:removed` socket broadcast keeps every client in sync.
        OfflineQueue.shared.retrySucceeded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self, payload.conversationId == self.conversationId else { return }
                guard payload.kind == .sendMessage else { return }
                pendingServerIds[payload.tempId] = payload.serverId
                let localId = payload.tempId
                let serverId = payload.serverId
                Task { [weak self] in
                    _ = try? await self?.messagePersistence.applyEvent(
                        localId: localId,
                        event: .serverAck(serverId: serverId, at: Date())
                    )
                }
            }
            .store(in: &cancellables)

        // Unified terminal-failure signal — fires both for message sends
        // exhausted by `OutboxFlusher` (5 attempts) and for reactions that
        // the dispatcher rejected permanently (404/409/410). We dispatch on
        // `kind` to apply the right rollback strategy.
        OfflineQueue.shared.retryExhausted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self, payload.conversationId == self.conversationId else { return }
                switch payload.kind {
                case .sendMessage:
                    let localId = payload.tempId
                    Task { [weak self] in
                        _ = try? await self?.messagePersistence.applyEvent(
                            localId: localId,
                            event: .retryExhausted
                        )
                    }
                case .sendReaction:
                    guard let reaction = payload.reaction else { return }
                    let participantId = self._resolvedParticipantId ?? self.currentUserId
                    let localId = reaction.messageId
                    let emoji = reaction.emoji
                    switch reaction.action {
                    case .add:
                        // Optimistic add failed permanently — remove the
                        // reaction we wrote.
                        Task { [weak self] in
                            try? await self?.messagePersistence.removeReaction(
                                localId: localId, emoji: emoji, participantId: participantId
                            )
                        }
                    case .remove:
                        // Optimistic remove failed permanently — restore the
                        // reaction we erased.
                        let remoteId = self.serverId(for: localId)
                        Task { [weak self] in
                            try? await self?.messagePersistence.appendReaction(
                                localId: localId, reactionId: UUID().uuidString,
                                messageId: remoteId, participantId: participantId, emoji: emoji
                            )
                        }
                    }
                default:
                    // Other outbox kinds (edit, delete, blockUser, etc.)
                    // surface their own exhausted paths through dedicated
                    // ViewModels ; this conversation-level subscription is
                    // scoped to the optimistic message+reaction lifecycle.
                    break
                }
            }
            .store(in: &cancellables)
    }

    private func subscribeToLanguagePreferenceChanges() {
        authManager.currentUserPublisher
            .removeDuplicates { old, new in
                old?.systemLanguage == new?.systemLanguage
                && old?.regionalLanguage == new?.regionalLanguage
                && old?.customDestinationLanguage == new?.customDestinationLanguage
            }
            .dropFirst()
            .sink { [weak self] _ in
                self?._cachedPreferredLanguages = nil
                self?._cachedPreferredLanguagesUserId = nil
            }
            .store(in: &cancellables)
    }

    deinit {
        // socketHandler deinit handles room leave & typing cleanup
        socketHandler = nil
        APIClient.shared.anonymousSessionToken = nil
    }

    // MARK: - Typing Emission (delegated to socketHandler)

    func onTextChanged(_ text: String) {
        socketHandler?.onTextChanged(text)
        mentionController.handleQuery(in: text)
    }

    func stopTypingEmission() {
        socketHandler?.stopTypingEmission()
    }

    // MARK: - Programmatic Scroll Guard

    /// Call before any programmatic scroll. Resets after a short delay.
    func markProgrammaticScroll() {
        isProgrammaticScroll = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.isProgrammaticScroll = false
        }
    }

    // MARK: - Message Processing Pipeline

    private func processAPIMessages(_ apiMessages: [APIMessage]) async -> [Message] {
        let userId = currentUserId
        var msgs = apiMessages.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: self.currentUsername) }
        await decryptMessagesIfNeeded(&msgs)
        extractAttachmentTranscriptions(from: apiMessages)
        extractTextTranslations(from: apiMessages)
        return msgs
    }

    // MARK: - Load Messages (initial)

    func loadMessages() async {
        guard !isLoadingInitial else { return }
        isLoadingInitial = true
        error = nil

        print("[DIAG] loadMessages start conv=\(conversationId) storeAtStart=\(messageStore.messages.count)")
        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        switch cached {
        case .fresh:
            // Surface GRDB data immediately (fast path for returning to a conversation).
            await messageStore.loadInitial()
            await hydrateTranslationsFromCache()
            hydrateMetadataFromGRDB()
            // Always revalidate from API in background — the GRDB local store may only
            // contain messages WE sent (optimistic inserts) while messages received from
            // other participants while the conversation was closed are absent because
            // `handleNewMessage` only buffers into GRDB when the socket handler is armed
            // (i.e. the conversation is open). Without this background refresh, messages
            // received offline (e.g. Belva's messages while the app was in background)
            // never appear until the user manually scrolls up to trigger pagination.
            isRevalidating = !messageStore.messages.isEmpty
            Task { [weak self] in
                guard let self else { return }
                await self.refreshMessagesFromAPI()
                await MainActor.run { self.isRevalidating = false }
            }

        case .stale:
            // Surface GRDB data immediately, then revalidate in background.
            await messageStore.loadInitial()
            if messageStore.messages.isEmpty {
                // GRDB cold for this conversation — fetch synchronously to render now.
                await refreshMessagesFromAPI()
                await hydrateTranslationsFromCache()
            } else {
                await hydrateTranslationsFromCache()
                hydrateMetadataFromGRDB()
                isRevalidating = true
                Task { [weak self] in
                    guard let self else { return }
                    await self.refreshMessagesFromAPI()
                    await MainActor.run { self.isRevalidating = false }
                }
            }

        case .expired, .empty:
            // Fetch from API; refreshMessagesFromAPI upserts to GRDB and the store
            // observation surfaces the result automatically.
            await refreshMessagesFromAPI()
        }

        // If the refresh discovered we no longer have access, the View is
        // already dismissing via the `accessRevoked` observer — skip the
        // socket arming, mark-as-read calls, and media prefetch which would
        // all just fire 403s of their own.
        if accessRevoked {
            isLoadingInitial = false
            return
        }

        // Calculate first unread message position
        if initialUnreadCount > 0 && messages.count >= initialUnreadCount {
            let unreadStartIndex = messages.count - initialUnreadCount
            let candidate = messages[unreadStartIndex]
            if !candidate.isMe {
                firstUnreadMessageId = candidate.id
            }
        }

        // Arm socket subscriptions now that messages are loaded — deferred
        // from SocketHandler.init to avoid 10-16ms of synchronous Combine
        // subscription setup blocking the first render.
        socketHandler?.armSocketSubscriptions()

        print("[DIAG] loadMessages done conv=\(conversationId) messages=\(messages.count) storeMessages=\(messageStore.messages.count)")
        // Mark conversation as read + received (fire-and-forget)
        markAsRead()
        markAsReceived()

        // Prefetch media for visible messages
        prefetchRecentMedia()

        isLoadingInitial = false
    }

    private func refreshMessagesFromAPI() async {
        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 30, includeReplies: true
            )

            // Upsert authoritative server data into GRDB; the MessageStore observation
            // surfaces new/updated rows to `messages` automatically — no direct assignment.
            try? await messagePersistence.upsertFromAPIMessages(response.data)
            await messageStore.loadInitial()

            // Keep legacy CacheCoordinator in sync so other parts of the app
            // (ConversationList preview, unread badge) that still read from it remain correct.
            let freshMessages = await processAPIMessages(response.data)
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            scheduleTranscriptionRetry(for: response.data)
            let snapshot = freshMessages
            await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { cached in
                let snapshotIds = Set(snapshot.map(\.id))
                let fromCacheOnly = cached.filter { !snapshotIds.contains($0.id) }
                return (snapshot + fromCacheOnly).sorted { $0.createdAt < $1.createdAt }
            }
        } catch let error as MeeshyError {
            switch error {
            case .forbidden(let reason):
                // 403: still authenticated, but no longer authorised on
                // THIS resource (kicked, group dissolved, blocked, etc.).
                await handleAccessRevoked(reason: reason)
                return
            case .server(404, let message), .server(410, let message):
                // 404/410: the conversation no longer exists (deleted by
                // owner, expired share-link target, hard-purged on the
                // server side). Same effect as a revoked access from the
                // user's perspective — the cached messages can no longer
                // be displayed, and we must dismiss the view rather than
                // leave stale content on screen for a conversation that
                // is gone. Without this branch the catch-all would treat
                // it as transient and the user would see ghost messages.
                await handleAccessRevoked(
                    reason: message.isEmpty
                        ? String(localized: "Cette conversation n'existe plus", defaultValue: "Cette conversation n'existe plus")
                        : message
                )
                return
            default:
                // Other server / network / unknown errors are transient —
                // keep cached data on screen, user retries on reload.
                break
            }
        } catch {
            // Cancellation / unknown — keep cached data displayed.
        }
    }

    /// Per-conversation cache scrub run when the server returns 403 on a
    /// messages fetch. Wipes only this conversation's footprint — other
    /// conversations the user still has access to remain hot.
    private func handleAccessRevoked(reason: String?) async {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        await CacheCoordinator.shared.conversations.invalidate(for: conversationId)
        await CacheCoordinator.shared.participants.invalidate(for: conversationId)

        // Wipe GRDB rows; the store observation fires with an empty result,
        // clearing `messages` through the single legitimate write site.
        try? await messagePersistence.deleteAll(conversationId: conversationId)

        error = reason ?? "Vous n'avez plus acces a cette conversation"
        accessRevoked = true
    }

    // MARK: - Media Prefetch

    private var mediaPrefetchTask: Task<Void, Never>?
    private var mediaPrefetchDebounce: Task<Void, Never>?

    /// Prefetch media for the most recent messages with attachments.
    /// Debounced to avoid thrashing from rapid socket updates.
    func prefetchRecentMedia() {
        mediaPrefetchDebounce?.cancel()
        mediaPrefetchDebounce = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            executePrefetchRecentMedia()
        }
    }

    private func executePrefetchRecentMedia() {
        mediaPrefetchTask?.cancel()
        let snapshot = Array(messages.suffix(30).filter { !$0.attachments.isEmpty })
        mediaPrefetchTask = Task(priority: .utility) {
            guard !snapshot.isEmpty else { return }

            let imageStore = await CacheCoordinator.shared.images

            // Parallel prefetch: images/thumbnails/audio in TaskGroup
            await withTaskGroup(of: Void.self) { group in
                for message in snapshot {
                    for attachment in message.attachments {
                        guard !Task.isCancelled else { return }

                        switch attachment.type {
                        case .image:
                            if let thumbUrl = attachment.thumbnailUrl, !thumbUrl.isEmpty,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }
                            if !attachment.fileUrl.isEmpty,
                               let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }

                        case .video:
                            if let thumbUrl = attachment.thumbnailUrl, !thumbUrl.isEmpty,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            } else if !attachment.fileUrl.isEmpty,
                                      let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl) {
                                group.addTask { _ = await StoryMediaLoader.shared.videoThumbnail(url: resolved) }
                            }

                        case .audio:
                            if !attachment.fileUrl.isEmpty,
                               let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString {
                                group.addTask { _ = try? await CacheCoordinator.shared.audio.data(for: resolved) }
                            }

                        default:
                            break
                        }
                    }
                }
            }

            // Video preroll: fire-and-forget, non-blocking
            if let firstVideoAtt = snapshot.flatMap(\.attachments).first(where: { $0.type == .video }),
               !firstVideoAtt.fileUrl.isEmpty,
               let resolved = MeeshyConfig.resolveMediaURL(firstVideoAtt.fileUrl) {
                Task(priority: .utility) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: resolved)
                }
            }
        }
    }

    // MARK: - Sync Engine Observation

    func observeSync() {
        let targetId = conversationId
        let publisher = syncEngine.messagesDidChange
        publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] changedId in
                guard changedId == targetId else { return }
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let cached = await CacheCoordinator.shared.messages.load(for: targetId)
                    switch cached {
                    case .fresh(let data, _), .stale(let data, _):
                        // Update delivery counters on existing own-message records via GRDB;
                        // the store observation surfaces the changes to `messages` automatically.
                        let persistence = self.messagePersistence
                        let ownMessages = self.messages.filter(\.isMe)
                        for existing in ownMessages {
                            guard let fresh = data.first(where: { $0.id == existing.id }),
                                  fresh.deliveryStatus.isBetterThan(existing.deliveryStatus)
                            else { continue }
                            try? await persistence.updateDeliveryCounters(
                                localId: existing.id,
                                deliveredCount: fresh.deliveredCount,
                                readCount: fresh.readCount,
                                deliveredToAllAt: fresh.deliveredToAllAt,
                                readByAllAt: fresh.readByAllAt
                            )
                        }
                        // Surface any messages in the cache that aren't yet in GRDB.
                        let currentIds = Set(self.messages.map(\.id))
                        let newFromCache = data.filter { !currentIds.contains($0.id) }
                        if !newFromCache.isEmpty {
                            // Convert domain messages back to IncomingMessageData for GRDB upsert.
                            let incoming = newFromCache.map { msg in
                                MessagePersistenceActor.IncomingMessageData(
                                    id: msg.id,
                                    conversationId: msg.conversationId,
                                    senderId: msg.senderId,
                                    content: msg.content.isEmpty ? nil : msg.content,
                                    createdAt: msg.createdAt,
                                    computedState: .delivered
                                )
                            }
                            await self.messagePersistence.bufferIncoming(incoming)
                            self.prefetchRecentMedia()
                        }
                    case .expired, .empty:
                        break
                    }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Load Older Messages (infinite scroll)

    func loadOlderMessages() async {
        // Defensive reset: isProgrammaticScroll can get stuck true when a
        // programmatic scroll is interrupted (e.g. view transition cancellation).
        // Since loadOlderMessages is only invoked by manual user scrolling,
        // it is always safe to clear the flag here.
        if isProgrammaticScroll { isProgrammaticScroll = false }

        guard hasOlderMessages, !isLoadingOlder, !isLoadingInitial else { return }
        guard let oldestMsg = messages.first else { return }
        let oldestId = oldestMsg.id
        let oldestCreatedAt = oldestMsg.createdAt

        // Debounce: ignore calls that arrive too soon after the last one
        let now = Date()
        guard now.timeIntervalSince(lastOlderPaginationTime) >= Self.paginationDebounceInterval else { return }
        lastOlderPaginationTime = now

        isLoadingOlder = true
        // Save anchor BEFORE prepend so the view can restore scroll position
        scrollAnchorId = oldestId

        let beforeValue = nextMessageCursor ?? oldestId

        do {
            // Direct REST + GRDB persistence path. We DO NOT route through
            // ConversationSyncEngine.fetchOlderMessages because it only writes
            // to the legacy CacheCoordinator. MessageStore reads MessageRecord
            // rows from GRDB, so going through the sync engine would leave the
            // GRDB window stuck on the initial load and latch
            // hasOlderMessages to false on the very first scroll trigger.
            let response = try await messageService.listBefore(
                conversationId: conversationId,
                before: beforeValue,
                limit: 50,
                includeReplies: true
            )

            // GRDB write and legacy CacheCoordinator processing are
            // independent — race them so the slower path (network-bound
            // GRDB on a background actor) doesn't gate the legacy cache
            // coherence path that the unread badge / preview rely on.
            async let persistTask: Void? = try? messagePersistence.upsertFromAPIMessages(response.data)
            async let olderProcessedTask = processAPIMessages(response.data)
            _ = await persistTask
            let olderProcessed = await olderProcessedTask

            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            scheduleTranscriptionRetry(for: response.data)
            await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { existing in
                let existingIds = Set(existing.map(\.id))
                let newOnly = olderProcessed.filter { !existingIds.contains($0.id) }
                return (newOnly + existing).sorted { $0.createdAt < $1.createdAt }
            }

            // Slide the GRDB window anchor backwards; store observation
            // surfaces the prepended older rows to `messages` automatically.
            let didLoad = await messageStore.loadOlder(before: oldestCreatedAt)
            if didLoad { prefetchRecentMedia() }

            // Server is the source of truth for pagination state.
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? false
        } catch {
            // Transient failure — keep hasOlderMessages so the next scroll
            // retries. Debounce prevents tight retry loops.
            Logger.messages.error("loadOlderMessages failed: \(error.localizedDescription)")
        }

        isLoadingOlder = false

        // Anticipatory prefetch: if the server has more pages AND the user
        // is still scrolled away from the bottom (likely scrolling fast),
        // immediately kick off the NEXT page in the background so it's
        // ready by the time the scroll reaches the new edge. This eliminates
        // the "hit the wall and wait" stutter on fast scrolls.
        if hasOlderMessages, !isCurrentlyNearBottom {
            Task { [weak self] in
                // Small delay to let the current batch render and the
                // scroll position stabilize before we start the next fetch.
                try? await Task.sleep(nanoseconds: 150_000_000)
                guard let self, !self.isLoadingOlder else { return }
                await self.loadOlderMessages()
            }
        }
    }

    // MARK: - Decryption

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        guard isDirect else { return }

        let payloads: [DecryptionPayload] = msgs.compactMap { msg in
            guard msg.isEncrypted, !msg.senderId.isEmpty,
                  !msg.content.isEmpty,
                  let data = Data(base64Encoded: msg.content)
            else { return nil }
            return DecryptionPayload(messageId: msg.id, senderId: msg.senderId, ciphertext: data)
        }
        guard !payloads.isEmpty else { return }

        let results = await decryptionActor.decrypt(payloads)
        let resultsByMessageId = Dictionary(uniqueKeysWithValues: results.map { ($0.messageId, $0) })

        for i in msgs.indices {
            if let plaintext = resultsByMessageId[msgs[i].id]?.plaintext {
                msgs[i].content = plaintext
            }
        }
    }

    // MARK: - Send Message

    private func detectKeyboardLanguage() -> String {
        if let primaryLanguage = UITextInputMode.activeInputModes.first?.primaryLanguage {
            return String(primaryLanguage.prefix(2))
        }
        return authManager.currentUser?.systemLanguage ?? "fr"
    }

    @discardableResult
    func sendMessage(content: String, replyToId: String? = nil, storyReplyToId: String? = nil, storyReplyReference: ReplyReference? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, localAttachments: [MeeshyMessageAttachment]? = nil, expiresAt: Date? = nil, isViewOnce: Bool? = nil, maxViewOnceCount: Int? = nil, isBlurred: Bool? = nil, originalLanguage: String? = nil, existingTempId: String? = nil) async -> Bool {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !(attachmentIds ?? []).isEmpty else { return false }
        // Debounce: a fast double-tap on the send button used to trigger two
        // concurrent `sendMessage` runs, both inserting their own optimistic
        // record with a fresh `tempId`, both POSTing the request — the user
        // saw the same content twice in the bubble list. The `isSending`
        // flag flips to `true` for the duration of the online send (cleared
        // in both the success and failure paths), so the second tap exits
        // early instead of duplicating. Retries from the offline / retry
        // queues bypass this entry point — they call lower-level paths
        // directly with the same `clientMessageId` already used by the
        // original send.
        //
        // Phase 4 §6.1 — the offline path runs BEFORE the debounce guard so
        // a user typing quickly while disconnected (subway, airplane) can
        // queue back-to-back messages without the second one being silently
        // dropped. The offline branch is itself debounced inside `OfflineQueue`
        // by the `clientMessageId` coalescing rules.

        // Offline: enqueue for later delivery + show optimistic message.
        // NOTE: we only gate on network availability here — NOT on socket
        // connection state. The send path is a plain REST POST which works
        // regardless of socket status. Routing through the offline queue when
        // the socket is still handshaking (common at startup) caused the clock
        // indicator to stay visible for seconds while waiting for retryAll().
        if NetworkMonitor.shared.isOffline {
            let offlineClientMessageId = existingTempId ?? ClientMessageId.generate()
            let queueItem = OfflineQueueItem(
                conversationId: conversationId,
                content: text,
                clientMessageId: offlineClientMessageId,
                originalLanguage: originalLanguage,
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds
            )
            Task { try? await OfflineQueue.shared.enqueue(queueItem) }

            let offlineTempId = queueItem.tempId
            let offlineMessage = Message(
                id: offlineTempId,
                conversationId: conversationId,
                senderId: currentUserId,
                content: text,
                messageType: .text,
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                createdAt: Date(),
                updatedAt: Date(),
                deliveryStatus: .sending,
                isMe: true
            )
            // Persist offline message to GRDB; store observation surfaces the row
            // automatically — no direct messages.append needed.
            let offlineRecord = MessageRecord(
                localId: offlineTempId, serverId: nil,
                conversationId: conversationId, senderId: currentUserId,
                content: text.isEmpty ? nil : text,
                originalLanguage: "fr",
                messageType: "text", messageSource: "user", contentType: "text",
                state: .sending, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: replyToId, storyReplyToId: nil,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                replyToJson: nil, forwardedFromJson: nil,
                expiresAt: nil, effectFlags: 0,
                maxViewOnceCount: nil, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: authManager.currentUser?.displayName,
                senderUsername: authManager.currentUser?.username,
                senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )
            let persistence = messagePersistence
            Task.detached(priority: .utility) {
                try? await persistence.insertOptimistic(offlineRecord)
            }

            let convId = conversationId
            let offlineMsgForCache = offlineMessage
            Task.detached(priority: .utility) {
                await CacheCoordinator.shared.messages.mergeUpdate(for: convId) { cached in
                    let cachedIds = Set(cached.map(\.id))
                    guard !cachedIds.contains(offlineMsgForCache.id) else { return cached }
                    return (cached + [offlineMsgForCache]).sorted { $0.createdAt < $1.createdAt }
                }
            }

            // Bump the conversation preview locally so the list shows the
            // just-typed message — with the correct author name — even before
            // the network returns. Without this the preview keeps the previous
            // author/content while the user waits for connectivity.
            let previewContent = text
            let previewAt = offlineMessage.createdAt
            let senderName = authManager.currentUser?.displayName ?? authManager.currentUser?.username
            Task {
                await ConversationSyncEngine.shared.updateConversationAfterSend(
                    conversationId: convId,
                    messagePreview: previewContent,
                    messageAt: previewAt,
                    senderName: senderName
                )
            }

            Logger.messages.info("Message enqueued for offline delivery")
            return true
        }

        // Stop typing emission on send
        socketHandler?.stopTypingEmission()

        // Resolve ephemeral: use explicit param or ViewModel state
        let resolvedExpiresAt = expiresAt ?? ephemeralDuration?.expiresAt
        let resolvedEphemeralDuration = ephemeralDuration?.rawValue

        // Resolve view-once: explicit param or derive from ephemeralDuration
        let resolvedIsViewOnce = isViewOnce ?? false
        let resolvedMaxViewOnceCount = maxViewOnceCount

        // Resolve blur: use explicit param or ViewModel state
        let resolvedBlur = isBlurred ?? (isBlurEnabled ? true : nil)

        // Phase 4 §6.1 — debounce only the ONLINE send path. The offline
        // branch above already returned, so a fast double-tap while offline
        // queues both messages (deduped server-side via `clientMessageId`).
        // For online sends, two concurrent runs would each post an HTTP
        // request — `isSending` blocks the second tap.
        guard !isSending else { return false }
        isSending = true

        // Build ReplyReference from quoted message or story
        var replyRef: ReplyReference?
        if let storyRef = storyReplyReference {
            replyRef = storyRef
        } else if let replyId = replyToId, let quoted = messages.first(where: { $0.id == replyId }) {
            let previewText: String = {
                if !quoted.content.isEmpty { return quoted.content }
                if let first = quoted.attachments.first {
                    switch first.type {
                    case .image: return "\u{1F4F7} Photo"
                    case .video: return "\u{1F3AC} Video"
                    case .audio: return "\u{1F3B5} Message vocal"
                    case .file: return "\u{1F4CE} Fichier"
                    default: return "\u{1F4CE} Piece jointe"
                    }
                }
                return ""
            }()
            replyRef = ReplyReference(
                messageId: replyId,
                authorName: quoted.senderName ?? "Utilisateur",
                previewText: previewText,
                isMe: quoted.isMe,
                authorColor: quoted.senderColor,
                attachmentType: quoted.attachments.first?.type.rawValue,
                attachmentThumbnailUrl: quoted.attachments.first?.thumbnailUrl
            )
        }

        // Optimistic insert.
        // Phase 4 §6.1 — local id is the canonical `cid_<uuid v4 lowercase>`
        // sent end-to-end so the gateway can dedup via the unique
        // `(conversationId, clientMessageId)` index and the iOS reconciliation
        // by-cid path can match the server-assigned record without ambiguity.
        // The legacy `temp_/offline_/retry_*` prefix scheme is gone — every
        // local id (online send, offline queue, retry queue) now flows through
        // `ClientMessageId.generate()`.
        let tempId = existingTempId ?? ClientMessageId.generate()
        // Phase A real-time instrumentation: chronometer the send → ACK delta
        // so we can correlate it with the gateway-side `perf:http.message.post`
        // / `perf:messaging.handleMessage` logs through the same cmid.
        let sendStartedAt = Date()
        Logger.messages.info("perf:ios.send.start clientMessageId=\(tempId, privacy: .public) conversationId=\(self.conversationId, privacy: .public) existingTempId=\(existingTempId != nil, privacy: .public)")
        let resolvedAttachments = localAttachments ?? []
        let optimisticMessageType: Message.MessageType = {
            guard let first = resolvedAttachments.first else { return .text }
            switch first.type {
            case .image: return .image
            case .video: return .video
            case .audio: return .audio
            case .file: return .file
            case .location: return .location
            }
        }()
        // GRDB optimistic insert — the store observation surfaces the row in `messages`
        // automatically (Task 1.5: no direct messages.append here).
        if existingTempId == nil {
            let persistence = messagePersistence
            let optimisticRecord = MessageRecord(
                localId: tempId, serverId: nil,
                conversationId: conversationId, senderId: currentUserId,
                content: text.isEmpty ? nil : text,
                originalLanguage: originalLanguage ?? "fr",
                messageType: optimisticMessageType.rawValue,
                messageSource: "user", contentType: "text",
                state: .sending, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: replyToId, storyReplyToId: storyReplyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                replyToJson: replyRef.flatMap { try? JSONEncoder().encode($0) }, forwardedFromJson: nil,
                expiresAt: resolvedExpiresAt, effectFlags: pendingEffects.hasAnyEffect ? pendingEffects.flags.rawValue : 0,
                maxViewOnceCount: resolvedMaxViewOnceCount, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: authManager.currentUser?.displayName,
                senderUsername: authManager.currentUser?.username,
                senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )
            do {
                try await persistence.insertOptimistic(optimisticRecord)
                print("[SendFlow] insertOptimistic OK tempId=\(tempId) state=.sending convId=\(conversationId)")
            } catch {
                print("[SendFlow] insertOptimistic FAILED tempId=\(tempId) error=\(error.localizedDescription)")
            }
        }

        do {
            var finalContent: String? = text.isEmpty ? nil : text
            var isEncrypted = false
            var encryptionMode: String? = nil

            // E2EE logic for Direct Messages
            if isDirect, let targetUserId = participantUserId, let textContent = finalContent {
                do {
                    let payloadData = Data(textContent.utf8)
                    let encryptedData = try await SessionManager.shared.encryptMessage(payloadData, for: targetUserId, conversationId: conversationId)
                    finalContent = encryptedData.base64EncodedString()
                    isEncrypted = true
                    encryptionMode = "E2EE"
                } catch {
                    Logger.messages.error("Failed to encrypt message: \(error.localizedDescription)")
                    // For MVP, we'll fall back to plaintext if encryption fails or session isn't established
                    // In a production secure messaging app, we should throw an error here to prevent accidental plaintext sends.
                }
            }

            let body = SendMessageRequest(
                content: finalContent,
                originalLanguage: originalLanguage ?? detectKeyboardLanguage(),
                replyToId: replyToId,
                storyReplyToId: storyReplyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds,
                expiresAt: resolvedExpiresAt,
                ephemeralDuration: resolvedEphemeralDuration,
                isViewOnce: resolvedIsViewOnce ? true : nil,
                maxViewOnceCount: resolvedMaxViewOnceCount,
                isBlurred: resolvedBlur,
                effectFlags: pendingEffects.hasAnyEffect ? pendingEffects.flags.rawValue : nil,
                isEncrypted: isEncrypted ? true : nil,
                encryptionMode: encryptionMode,
                clientMessageId: tempId
            )
            // WebSocket-first — emit `message:send` over the already-open
            // Socket.IO connection (parity with reactions / comments / status,
            // which already travel over the socket). REST is the fallback:
            // socket down, no ACK within the timeout, OR a message carrying
            // fields the `message:send` event does not transport — E2EE
            // payload, ephemeral timer, view-once, blur, effects, attachments —
            // which keep the REST / dedicated send paths.
            let socketEligible = !isEncrypted
                && resolvedExpiresAt == nil
                && resolvedEphemeralDuration == nil
                && !resolvedIsViewOnce
                && resolvedMaxViewOnceCount == nil
                && resolvedBlur != true
                && !pendingEffects.hasAnyEffect
                && (attachmentIds ?? []).isEmpty

            let serverId: String
            let serverCreatedAt: Date
            let sentViaSocket: Bool

            if socketEligible,
               MessageSocketManager.shared.isConnected,
               let ack = await MessageSocketManager.shared.sendAsync(
                   conversationId: conversationId,
                   content: finalContent,
                   originalLanguage: body.originalLanguage,
                   replyToId: replyToId,
                   storyReplyToId: storyReplyToId,
                   forwardedFromId: forwardedFromId,
                   forwardedFromConversationId: forwardedFromConversationId,
                   clientMessageId: tempId
               ) {
                serverId = ack.messageId
                serverCreatedAt = ack.createdAt ?? Date()
                sentViaSocket = true
                print("[SendFlow] WS message:send OK tempId=\(tempId) serverId=\(serverId)")
            } else {
                print("[SendFlow] POST /messages tempId=\(tempId) — awaiting response")
                let responseData = try await messageService.send(
                    conversationId: conversationId, request: body
                )
                serverId = responseData.id
                serverCreatedAt = responseData.createdAt
                sentViaSocket = false
                print("[SendFlow] POST OK tempId=\(tempId) serverId=\(responseData.id) createdAt=\(responseData.createdAt)")
            }

            // Register tempId → serverId mapping so the socket handler can reconcile
            // the `message:new` broadcast without creating a duplicate row.
            // UI update (sent state) flows through persistence → store observation.
            pendingServerIds[tempId] = serverId

            // GRDB server ack — state machine transitions to .sent; store observation
            // surfaces the change to the view without a direct messages[idx] write.
            // Logging the result so we can see whether the ⏱→✓ transition actually
            // took effect (the `try?` swallows both errors AND a nil return when
            // the state machine rejects the event or the record is missing).
            let ackResult = try? await messagePersistence.applyEvent(
                localId: tempId,
                event: .serverAck(serverId: serverId, at: serverCreatedAt)
            )
            print("[SendFlow] applyEvent serverAck tempId=\(tempId) → resultState=\(ackResult.map { String(describing: $0) } ?? "nil")")
            let ackElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
            Logger.messages.info("perf:ios.send.ack clientMessageId=\(tempId, privacy: .public) serverId=\(serverId, privacy: .public) transport=\(sentViaSocket ? "ws" : "rest", privacy: .public) durationMs=\(ackElapsedMs, privacy: .public)")

            // Move conversation to top of list immediately (optimistic)
            let convId = conversationId
            let msgContent = text
            let msgTime = serverCreatedAt

            // Persist the server-id mapping so that a future cold-start REST fetch
            // reconciles without duplicate `temp_…` / server-id pairs.
            Task { [weak self] in
                await self?.persistMessagesUsingServerIds()
            }
            let sentSenderName = authManager.currentUser?.displayName ?? authManager.currentUser?.username
            Task {
                await ConversationSyncEngine.shared.updateConversationAfterSend(
                    conversationId: convId,
                    messagePreview: msgContent,
                    messageAt: msgTime,
                    senderName: sentSenderName
                )
            }

            // Clear ephemeral duration after successful send
            if ephemeralDuration != nil {
                ephemeralDuration = nil
            }
            // Clear blur after successful send
            if isBlurEnabled {
                isBlurEnabled = false
            }
            // Clear pending effects after successful send
            if pendingEffects.hasAnyEffect {
                pendingEffects = .none
            }
            mentionController.clearDraft()
            isSending = false
            return true
        } catch {
            let failElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
            Logger.messages.warning("perf:ios.send.fail clientMessageId=\(tempId, privacy: .public) durationMs=\(failElapsedMs, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
            // Apply sendFailed — state machine increments retryCount and transitions
            // to .queued (retries remaining) or .failed (budget exhausted).
            // The store observation surfaces the updated state to the view.
            _ = try? await messagePersistence.applyEvent(
                localId: tempId,
                event: .sendFailed(error)
            )

            // Enqueue for persistent auto-retry. The unified outbox
            // (`OfflineQueue` + `OutboxFlusher`) owns the retry loop now —
            // exponential backoff up to 5 attempts (`OutboxFlusher.maxAttempts`)
            // with `retryExhausted` firing on the unified signal at the end.
            // Wave 1 Task 3.6 — the deleted `MessageRetryQueue` used to own a
            // parallel retry loop ; both paths converged on the same outbox
            // table so behavior is preserved while LoC drops by ~600.
            let retryItem = OfflineQueueItem(
                conversationId: conversationId,
                content: text,
                clientMessageId: tempId,
                originalLanguage: originalLanguage ?? "fr",
                replyToId: replyToId,
                attachmentIds: attachmentIds
            )
            Task { try? await OfflineQueue.shared.enqueue(retryItem) }

            isSending = false
            return false
        }
    }

    // MARK: - Retry Failed Message

    func retryMessage(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let failedMsg = messages[idx]
        guard failedMsg.deliveryStatus == .failed else { return }

        // Delete the failed row from GRDB; store observation removes it from
        // `messages` automatically. Then re-send, which inserts a fresh
        // optimistic row.
        //
        // Phase 4 §6.2 — reuse the failed message's `clientMessageId` so
        // the gateway dedup contract `(conversationId, clientMessageId)`
        // catches a previous attempt that DID reach the server (e.g. ACK
        // was lost mid-flight). A fresh `cid_*` here would bypass the
        // dedup index and produce a duplicate server-side record.
        // The local id of a Phase 4 optimistic message IS its
        // `clientMessageId` (legacy `temp_/offline_/retry_*` prefixes are
        // gone), so passing `messageId` straight through is correct.
        let content = failedMsg.content
        let replyToId = failedMsg.replyToId
        let priorClientMessageId = messageId
        try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date())

        await sendMessage(content: content, replyToId: replyToId, existingTempId: priorClientMessageId)
    }

    func removeFailedMessage(messageId: String) {
        Task { [weak self] in
            guard let self else { return }
            try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date())
        }
    }

    /// Insère un MessageRecord optimiste GRDB pour un message média (image,
    /// vidéo, audio, fichier) AVANT que l'upload TUS ne soit terminé. Les
    /// attachments fournis pointent sur les fichiers locaux (file:// URLs)
    /// pour que la bulle affiche l'image / le player audio immédiatement —
    /// y compris hors-ligne. Le store observation surface la nouvelle ligne
    /// dans `messages` automatiquement, donc l'appelant n'a PAS besoin de
    /// faire `messages.append(...)` en parallèle (cela serait écrasé à la
    /// prochaine emission du publisher).
    ///
    /// `tempId` est la clé locale (= `MessageRecord.localId` dans GRDB).
    /// Préfixes attendus : `temp_<UUID>` (envoi en ligne), `offline_<UUID>`
    /// (queue offline), `retry_<UUID>` (queue retry).
    ///
    /// `originalLanguage` doit être la langue du composer (sélectionnée par
    /// l'utilisateur ou détectée). Hardcoder "fr" violerait le Prisme
    /// Linguistique pour les utilisateurs non-francophones — l'affichage
    /// optimiste afficherait le mauvais drapeau de langue jusqu'à la
    /// réconciliation serveur.
    func insertOptimisticMediaMessage(
        tempId: String,
        content: String,
        attachments: [MeeshyMessageAttachment],
        messageType: Message.MessageType,
        replyToId: String?,
        storyReplyToId: String? = nil,
        replyReference: ReplyReference? = nil,
        originalLanguage: String? = nil
    ) {
        let now = Date()
        let attachmentsJson = attachments.isEmpty ? nil : try? JSONEncoder().encode(attachments)
        let replyToJson = replyReference.flatMap { try? JSONEncoder().encode($0) }
        let resolvedOriginalLanguage = originalLanguage ?? detectKeyboardLanguage()
        let record = MessageRecord(
            localId: tempId, serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: content.isEmpty ? nil : content,
            originalLanguage: resolvedOriginalLanguage,
            messageType: messageType.rawValue, messageSource: "user", contentType: messageType.rawValue,
            state: .sending, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: replyToJson, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: authManager.currentUser?.displayName,
            senderUsername: authManager.currentUser?.username,
            senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: now, sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: now,
            attachmentsJson: attachmentsJson, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 0
        )
        let persistence = messagePersistence
        Task.detached(priority: .userInitiated) {
            do {
                try await persistence.insertOptimistic(record)
                print("[SendFlow] insertOptimisticMedia OK tempId=\(tempId) state=.sending convId=\(record.conversationId) attachments=\(attachments.count)")
            } catch {
                print("[SendFlow] insertOptimisticMedia FAILED tempId=\(tempId) error=\(error.localizedDescription)")
            }
        }
    }

    // MARK: - Handle Expired Messages

    func removeExpiredMessages() {
        let now = Date()
        let persistence = messagePersistence
        Task.detached(priority: .utility) {
            // Delete expired rows from GRDB; the store observation removes them
            // from `messages` automatically — no direct removeAll needed.
            try? await persistence.deleteExpiredEphemeral(before: now)
        }
    }

    // MARK: - Star / Bookmark

    /// Toggle the starred state for a message. Local-only (the backend
    /// doesn't expose a message-level star endpoint yet); the snapshot
    /// captured here is what the `StarredMessagesView` renders, so the
    /// row survives edits, `.local` deletions, and conversation archives
    /// without needing to re-hydrate the original bubble.
    @discardableResult
    func toggleStar(messageId: String, conversationName: String? = nil, conversationAccentColor: String? = nil) -> Bool {
        guard let idx = messageIndex(for: messageId) else { return false }
        let msg = messages[idx]
        let canonicalId = serverId(for: messageId)

        let attachmentKind = msg.attachments.first.map { att -> String in
            switch att.type {
            case .image: return "image"
            case .video: return "video"
            case .audio: return "audio"
            case .file: return "file"
            case .location: return "location"
            }
        }

        // Prefer the active translation for the user's preferred language so
        // the starred preview matches what the user actually read, not the
        // raw original content.
        let preview: String = {
            if let translation = preferredTranslation(for: messageId),
               !translation.translatedContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return translation.translatedContent
            }
            if msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                switch attachmentKind {
                case "image": return "\u{1F4F7} Photo"
                case "video": return "\u{1F3AC} Video"
                case "audio": return "\u{1F3B5} Message vocal"
                case "file": return "\u{1F4CE} Fichier"
                case "location": return "\u{1F4CD} Localisation"
                default: return ""
                }
            }
            return msg.content
        }()

        let snapshot = StarredMessageSnapshot(
            id: canonicalId,
            conversationId: conversationId,
            conversationName: conversationName,
            conversationAccentColor: conversationAccentColor,
            senderUserId: msg.senderUserId,
            senderName: msg.senderName ?? msg.senderUsername,
            contentPreview: String(preview.prefix(280)),
            attachmentKind: attachmentKind,
            starredAt: Date(),
            sentAt: msg.createdAt
        )
        return StarredMessagesStore.shared.toggle(snapshot)
    }

    func isStarred(messageId: String) -> Bool {
        StarredMessagesStore.shared.isStarred(messageId: serverId(for: messageId))
    }

    // MARK: - Toggle Reaction

    func toggleReaction(messageId: String, emoji: String) {
        guard consumeReactionToken() else { return }
        guard let idx = messageIndex(for: messageId) else { return }

        let participantId = _resolvedParticipantId ?? currentUserId
        let alreadyReacted = messages[idx].reactions.contains { $0.emoji == emoji && $0.participantId == participantId }
        let convId = conversationId
        // Resolve the canonical server id so the queue replays against the
        // real backend message, not the optimistic in-memory placeholder.
        let remoteId = serverId(for: messageId)

        if alreadyReacted {
            Task { [weak self] in
                try? await self?.messagePersistence.removeReaction(
                    localId: messageId, emoji: emoji, participantId: participantId
                )
            }
            // Wave 1 Task 3.6 — unified outbox replaces the legacy
            // ReactionQueue. `enqueueReaction` preserves the coalescing state
            // machine (add+remove cancels, idempotent dedup) and the
            // `OutboxFlusher` drives retry on the next reconnect tick.
            Task {
                try? await OfflineQueue.shared.enqueueReaction(
                    messageId: remoteId, emoji: emoji, action: .remove, conversationId: convId
                )
            }
        } else {
            let reactionId = UUID().uuidString
            Task { [weak self] in
                try? await self?.messagePersistence.appendReaction(
                    localId: messageId, reactionId: reactionId,
                    messageId: remoteId, participantId: participantId, emoji: emoji
                )
            }
            Task {
                try? await OfflineQueue.shared.enqueueReaction(
                    messageId: remoteId, emoji: emoji, action: .add, conversationId: convId
                )
            }
        }

        // Resolve participantId lazily for future reactions.
        //
        // SWR: a fresh or stale cache hit is enough — participantId is an
        // immutable mapping (userId × conversationId → participantId) so
        // staleness has no impact. `.expired` / `.empty` means we have no
        // cached members; the next reaction will retry naturally once
        // `ensureConversationDetail` (or a socket join event) populates the
        // participants cache.
        if _resolvedParticipantId == nil {
            let convId = conversationId
            let userId = currentUserId
            Task {
                let result = await CacheCoordinator.shared.participants.load(for: convId)
                let cached: [PaginatedParticipant]
                switch result {
                case .fresh(let v, _), .stale(let v, _):
                    cached = v
                case .expired, .empty:
                    cached = []
                }
                if let match = cached.first(where: { $0.userId == userId }) {
                    self._resolvedParticipantId = match.id
                }
            }
        }
    }

    // MARK: - Fetch Reaction Details

    func fetchReactionDetails(messageId: String) async {
        isLoadingReactions = true
        defer { isLoadingReactions = false }
        do {
            let result = try await reactionService.fetchDetails(messageId: serverId(for: messageId))
            reactionDetails = result.reactions
        } catch {
            reactionDetails = []
        }
    }

    // MARK: - Delete Message

    /// Matches the WhatsApp semantics: `local` hides the message for this
    /// device only (no server round-trip), `everyone` soft-deletes on the
    /// backend and broadcasts `message:deleted` to all recipients. The UI
    /// gates the `everyone` option on sender+time-window rules via
    /// `canDeleteForEveryone(_:)`.
    enum DeleteMode {
        case local
        case everyone
    }

    func canDeleteForEveryone(_ message: Message, window: TimeInterval = 2 * 3600) -> Bool {
        guard message.isMe else { return false }
        guard let sentAt = message.createdAt as Date? else { return false }
        return Date().timeIntervalSince(sentAt) <= window
    }

    func deleteMessage(messageId: String, mode: DeleteMode = .everyone) async {
        switch mode {
        case .local:
            // Optimistic: hide locally. LocallyHiddenMessagesStore persists
            // the hidden id; messagesByDate filters it out on next evaluation.
            // Reversible — an "Undo" affordance can call .unhide(messageId)
            // without any network round-trip.
            LocallyHiddenMessagesStore.shared.hide(messageId)
            // Invalidate the date-group cache so the next messagesByDate
            // recomputes without the hidden row.
            _messagesByDate = nil
        case .everyone:
            // Optimistic: mark as deleted locally + blank content
            try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date())
            do {
                try await messageService.delete(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Rollback: restore the message to a non-deleted state
                try? await messagePersistence.markUndeleted(localId: messageId)
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Delete Attachment

    func deleteAttachment(messageId: String, attachmentId: String) async {
        guard let msgIdx = messageIndex(for: messageId) else { return }
        let message = messages[msgIdx]
        let isLastAttachment = message.attachments.count <= 1
        let hasTextContent = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        // If it's the only attachment AND no text content → delete the whole message
        if isLastAttachment && !hasTextContent {
            await deleteMessage(messageId: messageId)
            return
        }

        // Optimistic: remove attachment from local message via persistence
        let originalAttachments = message.attachments
        let updatedAttachments = originalAttachments.filter { $0.id != attachmentId }
        let updatedJson = try? JSONEncoder().encode(updatedAttachments)
        try? await messagePersistence.updateAttachmentsJson(localId: messageId, attachmentsJson: updatedJson)

        do {
            try await AttachmentService.shared.delete(attachmentId: attachmentId)
        } catch {
            // Revert on failure
            let originalJson = try? JSONEncoder().encode(originalAttachments)
            try? await messagePersistence.updateAttachmentsJson(localId: messageId, attachmentsJson: originalJson)
            self.error = error.localizedDescription
        }
    }

    // MARK: - Pin / Unpin Message

    func togglePin(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let wasPinned = messages[idx].pinnedAt != nil
        let previousPinnedAt = messages[idx].pinnedAt
        let previousPinnedBy = messages[idx].pinnedBy

        if wasPinned {
            // Optimistic unpin
            try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)

            do {
                try await messageService.unpin(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Revert
                try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: previousPinnedAt, pinnedBy: previousPinnedBy)
                self.error = error.localizedDescription
            }
        } else {
            // Optimistic pin
            let now = Date()
            let pinnedById = authManager.currentUser?.id
            try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: now, pinnedBy: pinnedById)

            do {
                try await messageService.pin(conversationId: conversationId, messageId: serverId(for: messageId))
            } catch {
                // Revert
                try? await messagePersistence.updatePinned(localId: messageId, pinnedAt: nil, pinnedBy: nil)
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Consume View-Once Message

    func consumeViewOnce(messageId: String) async -> Bool {
        do {
            let result = try await messageService.consumeViewOnce(
                conversationId: conversationId, messageId: serverId(for: messageId)
            )
            try? await messagePersistence.updateViewOnceCount(localId: messageId, count: result.viewOnceCount)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func evictViewOnceMedia(message: Message) {
        for attachment in message.attachments {
            let urls = [attachment.fileUrl, attachment.thumbnailUrl].compactMap { $0 }.filter { !$0.isEmpty }
            for urlStr in urls {
                Task {
                    let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString ?? urlStr
                    await CacheCoordinator.shared.images.remove(for: resolved)
                }
            }
        }
    }

    func markMessageAsConsumed(messageId: String) {
        // Write through persistence; the store observation will surface the
        // updated effectFlags (blurred) and cleared content to the view.
        Task { [weak self] in
            try? await self?.messagePersistence.markConsumed(localId: messageId)
        }
    }

    // MARK: - Edit Message

    func editMessage(messageId: String, newContent: String) async {
        let trimmed = newContent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Snapshot original content for rollback and edit history before
        // writing the optimistic update through persistence.
        let originalContent: String? = messageIndex(for: messageId).map { messages[$0].content }

        // Record history entry before overwriting (the backend does not
        // expose edit history, so we maintain it locally).
        if let original = originalContent, original != trimmed {
            EditHistoryStore.shared.recordRevision(
                messageId: serverId(for: messageId),
                previousContent: original
            )
        }

        // Optimistic update: write through persistence so the store
        // observation surfaces the change without a direct messages mutation.
        let editedAt = Date()
        try? await messagePersistence.markEdited(localId: messageId, newContent: trimmed, editedAt: editedAt)

        editInProgress.insert(messageId)
        defer { editInProgress.remove(messageId) }

        do {
            _ = try await messageService.edit(messageId: serverId(for: messageId), content: trimmed)
        } catch {
            // Revert on failure — both the persisted content AND the history
            // entry we just wrote (so the user doesn't see a phantom
            // revision that never actually reached the server).
            if let original = originalContent {
                try? await messagePersistence.markEdited(localId: messageId, newContent: original, editedAt: editedAt)
                EditHistoryStore.shared.removeHistory(for: serverId(for: messageId))
            }
            self.error = error.localizedDescription
        }
    }

    /// History of prior revisions for a message, for the MessageDetailSheet
    /// "View edits" list. Resolves through `serverId(for:)` so the history
    /// keyed on the canonical id survives tempId → serverId reconciliation.
    func editRevisions(for messageId: String) -> [EditRevision] {
        EditHistoryStore.shared.revisions(for: serverId(for: messageId))
    }

    func isEditSaving(messageId: String) -> Bool {
        editInProgress.contains(messageId)
    }

    // MARK: - Report Message

    func reportMessage(messageId: String, reportType: String, reason: String?) async -> Bool {
        do {
            try await reportService.reportMessage(messageId: serverId(for: messageId), reportType: reportType, reason: reason)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Mark as Read / Received

    func markAsRead() {
        let convId = conversationId
        // 1. Update cache immediately (local-first) — survives reloadFromCache()
        Task { await ConversationSyncEngine.shared.markConversationReadLocally(convId) }
        // 2. Notify ConversationListViewModel to clear badge in current @Published state
        NotificationCenter.default.post(name: .conversationMarkedRead, object: convId)
        // 3. Send to server in background (fire-and-forget, queue on failure)
        guard UserPreferencesManager.shared.privacy.showReadReceipts else { return }
        // Wave 1 Phase C — route through the offline outbox so a read
        // receipt produced while offline survives an app kill and replays
        // on reconnect. The gateway route is naturally idempotent (read
        // cursor only moves forward) so a replay is harmless ; we still
        // tag it with a cmid for instrumentation parity with the other
        // outbox kinds. Fall back to the legacy `PendingStatusQueue` if
        // the outbox enqueue itself fails (e.g. pool not configured).
        let lastMessageId = messages.last?.id ?? ""
        Task {
            let cmid = ClientMutationId.generate()
            let payload = MarkAsReadPayload(
                clientMutationId: cmid,
                conversationId: convId,
                upToMessageId: lastMessageId
            )
            do {
                try await OfflineQueue.shared.enqueue(.markAsRead, payload: payload, conversationId: convId)
            } catch {
                await PendingStatusQueue.shared.enqueue(.init(
                    conversationId: convId, type: "read", timestamp: Date()
                ))
            }
        }
    }

    func markAsReceived() {
        let convId = conversationId
        Task {
            do {
                try await conversationService.markAsReceived(conversationId: convId)
            } catch {
                // Non-critical — server will still count as received on next sync
            }
        }
    }


    // MARK: - Reconnection Sync (called by ConversationSocketHandler)

    func syncMissedMessages() async {
        guard !messages.isEmpty else { return }

        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 30, includeReplies: true
            )

            // Upsert missed messages to GRDB; store observation surfaces them automatically.
            try? await messagePersistence.upsertFromAPIMessages(response.data)
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)

            let userId = currentUserId
            let fetchedMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: self.currentUsername) }
            let newMessages = fetchedMessages.filter { !self.containsMessage(id: $0.id) }

            if !newMessages.isEmpty {
                let convId = conversationId
                let snapshot = fetchedMessages
                Task.detached(priority: .utility) {
                    await CacheCoordinator.shared.messages.mergeUpdate(for: convId) { cached in
                        let cachedIds = Set(cached.map(\.id))
                        let newOnly = snapshot.filter { !cachedIds.contains($0.id) }
                        guard !newOnly.isEmpty else { return cached }
                        return (cached + newOnly).sorted { $0.createdAt < $1.createdAt }
                    }
                }
                Logger.socket.info("Synced \(newMessages.count) missed message(s) for conversation \(self.conversationId)")
            }
        } catch {
            Logger.socket.error("Failed to sync missed messages: \(error)")
        }
    }

    // MARK: - Search Messages

    func searchMessages(query: String) async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            searchResults = []
            currentSearchQuery = nil
            isSearching = false
            return
        }

        isSearching = true
        currentSearchQuery = trimmed
        searchNextCursor = nil

        do {
            let response = try await messageService.search(
                conversationId: conversationId, query: trimmed, limit: 20
            )

            searchResults = response.data.map { buildSearchResult($0, query: trimmed) }
            searchNextCursor = response.cursorPagination?.nextCursor
            searchHasMore = response.cursorPagination?.hasMore ?? false
        } catch {
            searchResults = []
        }

        isSearching = false
    }

    func loadMoreSearchResults(query: String) async {
        guard searchHasMore, let cursor = searchNextCursor, !isSearching else { return }
        isSearching = true

        do {
            let response = try await messageService.searchWithCursor(
                conversationId: conversationId, query: query, cursor: cursor
            )

            let newResults = response.data.map { buildSearchResult($0, query: query) }
            searchResults.append(contentsOf: newResults)
            searchNextCursor = response.cursorPagination?.nextCursor
            searchHasMore = response.cursorPagination?.hasMore ?? false
        } catch {
            // Ignore pagination errors
        }

        isSearching = false
    }

    private func buildSearchResult(_ apiMsg: APIMessage, query: String) -> SearchResultItem {
        let senderName = apiMsg.sender?.displayName ?? apiMsg.sender?.username ?? "?"
        let content = apiMsg.content ?? ""
        let queryLower = query.lowercased()

        // Check if the match is in original content
        if content.lowercased().contains(queryLower) {
            return SearchResultItem(
                id: apiMsg.id, conversationId: apiMsg.conversationId,
                content: content, matchedText: content, matchType: "content",
                senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
            )
        }

        // Match is in a translation — find which one
        if let translations = apiMsg.translations {
            for t in translations where t.translatedContent.lowercased().contains(queryLower) {
                return SearchResultItem(
                    id: apiMsg.id, conversationId: apiMsg.conversationId,
                    content: content, matchedText: t.translatedContent, matchType: "translation",
                    senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
                )
            }
        }

        // Fallback (shouldn't happen but safe)
        return SearchResultItem(
            id: apiMsg.id, conversationId: apiMsg.conversationId,
            content: content, matchedText: content, matchType: "content",
            senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
        )
    }

    // MARK: - Jump to Message (load messages around a specific message)

    func loadMessagesAround(messageId: String) async {
        do {
            let response = try await messageService.listAround(
                conversationId: conversationId, around: messageId, limit: limit, includeReplies: true
            )

            // Upsert the API batch into GRDB so the window has fresh content.
            try? await messagePersistence.upsertFromAPIMessages(response.data)

            // Switch the store window to be centered on the target message.
            let targetDate = response.data.first(where: { $0.id == messageId })?.createdAt
                ?? response.data.last?.createdAt
                ?? Date()
            await messageStore.loadWindow(around: targetDate)

            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? false
            hasNewerMessages = response.hasNewer ?? false
            isInJumpedState = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Outcome of `jumpToQuotedMessage`.
    enum JumpResult {
        /// The message was already present in the local store — caller should
        /// perform an instant scroll + highlight.
        case foundLocally
        /// The message was fetched from the server and loaded into the store.
        /// Caller should scroll + highlight after the snapshot settles.
        case loadedFromServer
        /// The message could not be found (deleted, not accessible, network error).
        case notFound
    }

    /// High-level "jump to a quoted message" flow called when the user taps
    /// a reply reference. If the message is already in the local store's
    /// snapshot, returns `.foundLocally` immediately. Otherwise sets
    /// `isSearchingQuotedMessage = true` (driving the pulsing scroll-button
    /// indicator), fetches from the server via `loadMessagesAround`, and
    /// returns `.loadedFromServer` or `.notFound`.
    func jumpToQuotedMessage(messageId: String) async -> JumpResult {
        // Fast path: message is already visible — instant scroll
        if messageStore.messages.contains(where: {
            $0.localId == messageId || $0.serverId == messageId
        }) {
            return .foundLocally
        }

        // Slow path: need to fetch from server
        isSearchingQuotedMessage = true
        quotedMessageSearchTarget = messageId

        defer {
            isSearchingQuotedMessage = false
            quotedMessageSearchTarget = nil
        }

        do {
            let response = try await messageService.listAround(
                conversationId: conversationId, around: messageId, limit: limit, includeReplies: true
            )

            // Upsert the API batch into GRDB so the window has fresh content.
            try? await messagePersistence.upsertFromAPIMessages(response.data)

            // Check if the target message was in the response
            let found = response.data.contains(where: { $0.id == messageId })
            guard found else { return .notFound }

            // Switch the store window to be centered on the target message.
            let targetDate = response.data.first(where: { $0.id == messageId })?.createdAt
                ?? response.data.last?.createdAt
                ?? Date()
            await messageStore.loadWindow(around: targetDate)

            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? false
            hasNewerMessages = response.hasNewer ?? false
            isInJumpedState = true

            // Small delay to let the diffable datasource apply the new snapshot
            // before the caller triggers scroll — otherwise the index path
            // won't exist yet.
            try? await Task.sleep(nanoseconds: 150_000_000)

            return .loadedFromServer
        } catch {
            Logger.messages.error("[JumpToQuoted] Failed to load messages around \(messageId): \(error.localizedDescription)")
            return .notFound
        }
    }

    func loadNewerMessages() async {
        guard isInJumpedState, hasNewerMessages, !isLoadingNewer, !isProgrammaticScroll else { return }
        guard let lastMsg = messages.last else { return }

        // Debounce: ignore calls that arrive too soon after the last one
        let now = Date()
        guard now.timeIntervalSince(lastNewerPaginationTime) >= Self.paginationDebounceInterval else { return }
        lastNewerPaginationTime = now

        isLoadingNewer = true

        var lastError: Error?
        for attempt in 1...Self.paginationRetryCount {
            do {
                let response = try await messageService.listAround(
                    conversationId: conversationId, around: lastMsg.id, limit: limit, includeReplies: true
                )

                // Upsert newer messages into GRDB; the GRDB DatabaseRegionObservation
                // fires automatically and the store refreshes its window — no direct
                // messages mutation needed.
                try? await messagePersistence.upsertFromAPIMessages(response.data)
                extractAttachmentTranscriptions(from: response.data)
                extractTextTranslations(from: response.data)

                hasNewerMessages = response.hasNewer ?? false
                if !hasNewerMessages {
                    isInJumpedState = false
                }
                lastError = nil
                break
            } catch {
                lastError = error
                if attempt < Self.paginationRetryCount {
                    Logger.messages.warning("loadNewerMessages attempt \(attempt) failed, retrying: \(error.localizedDescription)")
                    try? await Task.sleep(nanoseconds: Self.paginationRetryDelay)
                }
            }
        }

        if let lastError {
            Logger.messages.error("loadNewerMessages failed after \(Self.paginationRetryCount) attempts: \(lastError.localizedDescription)")
        }

        isLoadingNewer = false
    }

    func returnToLatest() async {
        guard isInJumpedState else { return }

        isInJumpedState = false
        hasNewerMessages = false
        currentSearchQuery = nil

        // Restore the latest window from GRDB; the store observation surfaces
        // the updated messages slice automatically — no snapshot-restore needed.
        await messageStore.restoreLatestWindow()

        // nextMessageCursor will be lazily re-fetched on the next loadOlderMessages
        // call; hasOlderMessages defaults to true until corrected by the first page.
        nextMessageCursor = nil
        hasOlderMessages = true
    }

    // MARK: - Extract Text Translations from REST Responses

    private func extractTextTranslations(from apiMessages: [APIMessage]) {
        for msg in apiMessages {
            guard let translations = msg.translations, !translations.isEmpty else { continue }
            var existing = messageTranslations[msg.id] ?? []
            for t in translations {
                let mt = MessageTranslation(
                    id: t.id,
                    messageId: t.messageId,
                    sourceLanguage: t.sourceLanguage ?? msg.originalLanguage ?? "auto",
                    targetLanguage: t.targetLanguage,
                    translatedContent: t.translatedContent,
                    translationModel: t.translationModel,
                    confidenceScore: t.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msg.id] = existing
        }
    }

    private func hydrateTranslationsFromCache() async {
        let msgIds = messages.map(\.id)

        // 1. In-memory CacheCoordinator (fast, volatile)
        let cached = await CacheCoordinator.shared.cachedTranslations(for: msgIds)
        for (msgId, translations) in cached {
            var existing = messageTranslations[msgId] ?? []
            for t in translations {
                let mt = MessageTranslation(
                    id: t.id,
                    messageId: t.messageId,
                    sourceLanguage: t.sourceLanguage,
                    targetLanguage: t.targetLanguage,
                    translatedContent: t.translatedContent,
                    translationModel: t.translationModel,
                    confidenceScore: t.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msgId] = existing
        }

        // 2. GRDB fallback — for message IDs not covered by the volatile cache,
        //    read persisted TranslationRecords so cold-start shows translations
        //    instantly without waiting for a REST round-trip.
        let uncoveredIds = msgIds.filter { messageTranslations[$0] == nil || messageTranslations[$0]?.isEmpty == true }
        guard !uncoveredIds.isEmpty else { return }
        let reader = messagePersistence.reader
        let grdbTranslations: [String: [TranslationRecord]] = (try? await reader.read { db in
            let records = try TranslationRecord
                .filter(uncoveredIds.contains(Column("messageLocalId")))
                .fetchAll(db)
            return Dictionary(grouping: records, by: \.messageLocalId)
        }) ?? [:]

        for (msgId, records) in grdbTranslations {
            var existing = messageTranslations[msgId] ?? []
            for r in records {
                let mt = MessageTranslation(
                    id: r.id,
                    messageId: msgId,
                    sourceLanguage: r.sourceLanguage ?? "auto",
                    targetLanguage: r.targetLanguage,
                    translatedContent: r.translatedContent,
                    translationModel: r.translationModel,
                    confidenceScore: r.confidenceScore
                )
                if let idx = existing.firstIndex(where: { $0.targetLanguage == mt.targetLanguage }) {
                    existing[idx] = mt
                } else {
                    existing.append(mt)
                }
            }
            messageTranslations[msgId] = existing
        }
    }

    func setActiveTranslation(for messageId: String, translation: MessageTranslation?) {
        activeTranslationOverrides[messageId] = translation
    }

    func setActiveAudioLanguage(for messageId: String, language: String?) {
        activeAudioLanguageOverrides[messageId] = language
    }

    private var _cachedPreferredLanguages: [String]?
    private var _cachedPreferredLanguagesUserId: String?

    private var preferredLanguages: [String] {
        let userId = currentUserId
        if let cached = _cachedPreferredLanguages, _cachedPreferredLanguagesUserId == userId {
            return cached
        }
        let user = authManager.currentUser
        var preferred: [String] = []
        // 1. Primary language (systemLanguage) — highest priority
        if let sys = user?.systemLanguage, !preferred.contains(where: { $0.lowercased() == sys.lowercased() }) {
            preferred.append(sys)
        }
        // 2. Secondary language (regionalLanguage)
        if let reg = user?.regionalLanguage, !preferred.contains(where: { $0.lowercased() == reg.lowercased() }) {
            preferred.append(reg)
        }
        // 3. Custom destination language (lowest auto-priority)
        if let custom = user?.customDestinationLanguage, !preferred.contains(where: { $0.lowercased() == custom.lowercased() }) {
            preferred.append(custom)
        }
        // NOTE: Device locale (Locale.current) is NOT added here — it is the UI interface
        // language, not the user's content language preference. Content languages are
        // systemLanguage (primary) and regionalLanguage (secondary) configured in-app.
        _cachedPreferredLanguages = preferred
        _cachedPreferredLanguagesUserId = userId
        return preferred
    }

    func preferredTranslation(for messageId: String) -> MessageTranslation? {
        if let override = activeTranslationOverrides[messageId] {
            return override
        }
        guard let translations = messageTranslations[messageId], !translations.isEmpty else { return nil }

        // Determine original language of this message
        let originalLang = messageIndex(for: messageId)
            .map { messages[$0].originalLanguage.lowercased() }

        let langs = preferredLanguages
        for lang in langs {
            let langLower = lang.lowercased()
            // If the original is already in this preferred language, show original (no translation needed)
            if let orig = originalLang, orig == langLower { return nil }
            if let match = translations.first(where: { $0.targetLanguage.lowercased() == langLower }) {
                return match
            }
        }
        return nil
    }

    // MARK: - Transcription Retry for Audio Messages

    /// When Whisper has not finished transcribing an audio attachment by the
    /// time the REST response arrives, `attachment.transcription` is nil.
    /// This method collects those message IDs and schedules a single retry
    /// fetch after 5 seconds so the transcription is surfaced on the second
    /// attempt (Whisper typically completes within 3–15 s).
    private func scheduleTranscriptionRetry(for apiMessages: [APIMessage]) {
        let audioMissingTranscription = apiMessages.filter { msg in
            msg.attachments?.contains(where: { att in
                guard let mime = att.mimeType, mime.hasPrefix("audio/") else { return false }
                return att.transcription == nil
            }) ?? false
        }
        guard !audioMissingTranscription.isEmpty else { return }

        let msgIds = audioMissingTranscription.map(\.id)
        let convId = conversationId
        Logger.messages.info("[TranscriptionRetry] Scheduling retry for \(msgIds.count) audio message(s) missing transcription")

        Task { [weak self, messageService] in
            try? await Task.sleep(nanoseconds: 5_000_000_000) // 5 seconds
            guard let self, !Task.isCancelled else { return }

            // Re-fetch the same messages from REST; by now Whisper should have
            // finished transcribing. We use `listAround` with the first message
            // to get a window that includes the missing ones.
            for msgId in msgIds {
                guard !Task.isCancelled else { return }
                do {
                    let response = try await messageService.listAround(
                        conversationId: convId,
                        around: msgId,
                        limit: 5,
                        includeReplies: false
                    )
                    await MainActor.run {
                        self.extractAttachmentTranscriptions(from: response.data)
                    }
                } catch {
                    Logger.messages.warning("[TranscriptionRetry] Retry failed for \(msgId): \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Extract Transcription/Translation Data from REST Responses

    private func extractAttachmentTranscriptions(from apiMessages: [APIMessage]) {
        for msg in apiMessages {
            for att in msg.attachments ?? [] {
                if let t = att.transcription {
                    let segments = (t.segments ?? []).map {
                        MessageTranscriptionSegment(
                            text: $0.text,
                            startTime: $0.startTime,
                            endTime: $0.endTime,
                            speakerId: $0.speakerId
                        )
                    }
                    messageTranscriptions[msg.id] = MessageTranscription(
                        attachmentId: att.id,
                        text: t.resolvedText,
                        language: t.language ?? "?",
                        confidence: t.confidence,
                        durationMs: t.durationMs,
                        segments: segments,
                        speakerCount: t.speakerCount
                    )
                }
                if let translations = att.translations {
                    var audios: [MessageTranslatedAudio] = []
                    for (lang, trans) in translations {
                        guard let url = trans.url, !url.isEmpty else { continue }
                        let segments = (trans.segments ?? []).map {
                            MessageTranscriptionSegment(
                                text: $0.text,
                                startTime: $0.startTime,
                                endTime: $0.endTime,
                                speakerId: $0.speakerId
                            )
                        }
                        audios.append(MessageTranslatedAudio(
                            id: "\(att.id)_\(lang)",
                            attachmentId: att.id,
                            targetLanguage: lang,
                            url: url,
                            transcription: trans.transcription ?? "",
                            durationMs: trans.durationMs ?? 0,
                            format: trans.format ?? "mp3",
                            cloned: trans.cloned ?? false,
                            quality: trans.quality ?? 0,
                            voiceModelId: trans.voiceModelId,
                            ttsModel: trans.ttsModel ?? "xtts",
                            segments: segments
                        ))
                    }
                    if !audios.isEmpty {
                        messageTranslatedAudios[msg.id] = audios
                    }
                }
            }
        }
    }

    // MARK: - Hydrate metadata from GRDB (instant load)

    /// Reads the embedded transcription/translation metadata from GRDB's
    /// `attachmentsJson` blobs and populates `messageTranscriptions` and
    /// `messageTranslatedAudios` dictionaries **before** any REST call.
    /// This ensures that audio bubbles show transcriptions and language
    /// buttons on the very first render frame.
    private func hydrateMetadataFromGRDB() {
        let decoder = JSONDecoder()
        for record in messageStore.messages {
            let msgId = record.serverId ?? record.localId
            guard let data = record.attachmentsJson,
                  let attachments = try? decoder.decode([MeeshyMessageAttachment].self, from: data)
            else { continue }

            for att in attachments {
                // Hydrate transcription
                if let t = att.transcription, messageTranscriptions[msgId] == nil {
                    let segments = (t.segments ?? []).map {
                        MessageTranscriptionSegment(
                            text: $0.text,
                            startTime: $0.startTime,
                            endTime: $0.endTime,
                            speakerId: $0.speakerId
                        )
                    }
                    messageTranscriptions[msgId] = MessageTranscription(
                        attachmentId: att.id,
                        text: t.text,
                        language: t.language,
                        confidence: t.confidence,
                        durationMs: t.durationMs,
                        segments: segments,
                        speakerCount: t.speakerCount
                    )
                }

                // Hydrate audio translations
                if let translations = att.audioTranslations, !translations.isEmpty,
                   messageTranslatedAudios[msgId] == nil {
                    var audios: [MessageTranslatedAudio] = []
                    for (lang, trans) in translations {
                        let segments = (trans.segments ?? []).map {
                            MessageTranscriptionSegment(
                                text: $0.text,
                                startTime: $0.startTime,
                                endTime: $0.endTime,
                                speakerId: $0.speakerId
                            )
                        }
                        audios.append(MessageTranslatedAudio(
                            id: "\(att.id)_\(lang)",
                            attachmentId: att.id,
                            targetLanguage: lang,
                            url: trans.url,
                            transcription: trans.transcription ?? "",
                            durationMs: trans.durationMs ?? 0,
                            format: trans.format ?? "mp3",
                            cloned: trans.cloned ?? false,
                            quality: trans.quality ?? 0,
                            voiceModelId: trans.voiceModelId,
                            ttsModel: trans.ttsModel ?? "xtts",
                            segments: segments
                        ))
                    }
                    if !audios.isEmpty {
                        messageTranslatedAudios[msgId] = audios
                    }
                }
            }
        }
    }

    // MARK: - Location Sharing

    func shareLocation(latitude: Double, longitude: Double, placeName: String? = nil, address: String? = nil) {
        LocationService.shared.shareLocation(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            placeName: placeName, address: address
        )
    }

    func startLiveLocation(latitude: Double, longitude: Double, durationMinutes: Int) {
        LocationService.shared.startLiveLocation(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            durationMinutes: durationMinutes
        )
    }

    func stopLiveLocation() {
        LocationService.shared.stopLiveLocation(conversationId: conversationId)
    }

    func updateLiveLocation(latitude: Double, longitude: Double, speed: Double? = nil, heading: Double? = nil) {
        LocationService.shared.updateLiveLocation(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            speed: speed, heading: heading
        )
    }
}

// MARK: - ConversationSocketDelegate Conformance

extension ConversationViewModel: ConversationSocketDelegate {
    func handleParticipantRoleUpdated(participantId: String, newRole: String) {
        Logger.socket.info("Participant \(participantId) role changed to \(newRole)")
        _topActiveMembers = nil
        objectWillChange.send()
    }

    /// Bridge for `ConversationSocketHandler` — reuses the same purge +
    /// dismiss path as the REST 403 case so socket-rejected joins look
    /// identical to API-rejected loads from the user's perspective.
    func handleSocketAccessRevoked(reason: String?) {
        Task { [weak self] in
            await self?.handleAccessRevoked(reason: reason)
        }
    }
}
