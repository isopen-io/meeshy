import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

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

    // MARK: - Orchestrators

    private let stateStore: ConversationStateStore
    private let commandHandler: ConversationCommandHandler
    private let translationResolver: TranslationResolver
    private let searchHandler: ConversationSearchHandler
    private let mediaHandler: ConversationMediaHandler

    // MARK: - Legacy @Published properties (kept for view compatibility)

    @Published var messages: [Message] = [] {
        didSet { invalidateCaches(previousMessages: oldValue) }
    }

    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var isLoadingNewer = false
    @Published var isRevalidating = false
    @Published var editInProgress: Set<String> = []
    @Published var hasOlderMessages = true
    @Published var hasNewerMessages = false
    @Published var isSending = false
    @Published var error: String?
    @Published var scrollAnchorId: String?
    @Published var typingUsernames: [String] = []

    @Published var messageTranslations: [String: [MessageTranslation]] = [:] {
        didSet { _mediaCaptionMap = nil }
    }
    @Published var messageTranscriptions: [String: MessageTranscription] = [:] {
        didSet { _allAudioItems = nil }
    }
    @Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:] {
        didSet { _allAudioItems = nil }
    }

    @Published var activeTranslationOverrides: [String: MessageTranslation?] = [:]
    @Published var activeAudioLanguageOverrides: [String: String?] = [:]
    @Published var preferredLanguageRevision: Int = 0
    @Published var activeLiveLocations: [ActiveLiveLocation] = []
    @Published var lastUnreadMessage: Message?
    @Published private(set) var currentConversationUnreadCount: Int = 0
    @Published private(set) var otherConversationsUnread: Int = 0

    @Published var reactionDetails: [ReactionGroup] = []
    @Published var isLoadingReactions = false
    @Published var firstUnreadMessageId: String?
    @Published var isConversationClosed = false
    @Published var accessRevoked: Bool = false
    @Published var ephemeralDuration: EphemeralDuration?
    @Published var isBlurEnabled: Bool = false
    @Published var pendingEffects: MessageEffects = .none
    @Published var showEffectsPicker: Bool = false
    @Published var mentionController: MentionComposerController = MentionComposerController(context: .conversation(id: ""))

    @Published var searchResults: [SearchResultItem] = []
    @Published var isSearching = false
    @Published var searchHasMore = false
    @Published var currentSearchQuery: String?
    @Published var isInJumpedState = false
    @Published var isSearchingQuotedMessage = false
    @Published var quotedMessageSearchTarget: String? = nil

    var isCurrentlyNearBottom: Bool = true
    var isProgrammaticScroll = false

    // MARK: - Core Dependencies

    let conversationId: String
    let memberJoinedAt: Date?
    private let isDirect: Bool
    private let participantUserId: String?
    private let initialUnreadCount: Int
    private let limit = 30
    private var nextMessageCursor: String?
    private var cancellables = Set<AnyCancellable>()
    private var messagesPersistCancellable: AnyCancellable?
    private var storeObservation: AnyCancellable?
    private var socketHandler: ConversationSocketHandler?
    private(set) var messageStore: MessageStore
    private(set) var messagePersistence: MessagePersistenceActor
    private var lastOlderPaginationTime: Date = .distantPast
    private var lastNewerPaginationTime: Date = .distantPast

    private let authManager: AuthManaging
    private let messageService: MessageServiceProviding
    private let conversationService: ConversationServiceProviding
    private let reactionService: ReactionServiceProviding
    private let reportService: ReportServiceProviding
    private let syncEngine: ConversationSyncEngineProviding
    private let mentionService: MentionServiceProviding
    private let messageSocket: MessageSocketProviding
    private let decryptionActor = DecryptionActor(provider: LiveSessionProvider())

    private var currentUserId: String { authManager.currentUser?.id ?? "" }
    var currentUserIdForView: String { currentUserId }
    private var currentUsername: String? { authManager.currentUser?.username }
    private var _resolvedParticipantId: String?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conversation-vm")

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
        self.messageSocket = messageSocket

        self.stateStore = ConversationStateStore()
        self.commandHandler = ConversationCommandHandler(
            state: stateStore,
            conversationId: conversationId,
            messageService: messageService,
            persistence: dependencies.persistence,
            authManager: authManager,
            messageSocket: messageSocket,
            reportService: reportService
        )
        self.translationResolver = TranslationResolver(state: stateStore, authManager: authManager)
        self.searchHandler = ConversationSearchHandler(state: stateStore, conversationId: conversationId, messageService: messageService)
        self.mediaHandler = ConversationMediaHandler(state: stateStore)

        self.messagePersistence = dependencies.persistence
        self.messageStore = MessageStore(conversationId: conversationId, persistence: dependencies.persistence)

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

        syncEngine.setCurrentlyOpenConversation(conversationId)
        messageStore.startObserving(dbPool: dependencies.dbPool)

        Task { await messageStore.loadInitial() }

        setupSyncAndObservations()
        setupForwardingBindings()

        if let session = anonymousSession {
            APIClient.shared.anonymousSessionToken = session.sessionToken
            MessageSocketManager.shared.connectAnonymous(sessionToken: session.sessionToken)
        }
    }

    private func setupSyncAndObservations() {
        messagesPersistCancellable = $messages
            .dropFirst()
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] snapshot in
                guard let self, !snapshot.isEmpty else { return }
                Task { [weak self] in await self?.persistMessagesUsingServerIds() }
            }

        storeObservation = messageStore.messagesDidChange
            .sink { [weak self] in self?.handleStoreChange() }

        subscribeToQueueReconciliation()
        subscribeToLanguagePreferenceChanges()

        currentConversationUnreadCount = initialUnreadCount
        Publishers.CombineLatest(syncEngine.totalConversationsUnread, $currentConversationUnreadCount)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] total, current in
                self?.otherConversationsUnread = max(0, total - current)
            }
            .store(in: &cancellables)
    }

    private func setupForwardingBindings() {
        stateStore.$messages.assign(to: &$messages)
        stateStore.$isLoadingInitial.assign(to: &$isLoadingInitial)
        stateStore.$isLoadingOlder.assign(to: &$isLoadingOlder)
        stateStore.$isLoadingNewer.assign(to: &$isLoadingNewer)
        stateStore.$isRevalidating.assign(to: &$isRevalidating)
        stateStore.$editInProgress.assign(to: &$editInProgress)
        stateStore.$hasOlderMessages.assign(to: &$hasOlderMessages)
        stateStore.$hasNewerMessages.assign(to: &$hasNewerMessages)
        stateStore.$isSending.assign(to: &$isSending)
        stateStore.$error.assign(to: &$error)
        stateStore.$scrollAnchorId.assign(to: &$scrollAnchorId)
        stateStore.$typingUsernames.assign(to: &$typingUsernames)
        stateStore.$messageTranslations.assign(to: &$messageTranslations)
        stateStore.$messageTranscriptions.assign(to: &$messageTranscriptions)
        stateStore.$messageTranslatedAudios.assign(to: &$messageTranslatedAudios)
        stateStore.$activeTranslationOverrides.assign(to: &$activeTranslationOverrides)
        stateStore.$activeAudioLanguageOverrides.assign(to: &$activeAudioLanguageOverrides)
        stateStore.$preferredLanguageRevision.assign(to: &$preferredLanguageRevision)
        stateStore.$activeLiveLocations.assign(to: &$activeLiveLocations)
        stateStore.$lastUnreadMessage.assign(to: &$lastUnreadMessage)
        stateStore.$currentConversationUnreadCount.assign(to: &$currentConversationUnreadCount)
        stateStore.$otherConversationsUnread.assign(to: &$otherConversationsUnread)
        stateStore.$reactionDetails.assign(to: &$reactionDetails)
        stateStore.$isLoadingReactions.assign(to: &$isLoadingReactions)
        stateStore.$firstUnreadMessageId.assign(to: &$firstUnreadMessageId)
        stateStore.$isConversationClosed.assign(to: &$isConversationClosed)
        stateStore.$accessRevoked.assign(to: &$accessRevoked)
        stateStore.$ephemeralDuration.assign(to: &$ephemeralDuration)
        stateStore.$isBlurEnabled.assign(to: &$isBlurEnabled)
        stateStore.$pendingEffects.assign(to: &$pendingEffects)
        stateStore.$showEffectsPicker.assign(to: &$showEffectsPicker)
        stateStore.$searchResults.assign(to: &$searchResults)
        stateStore.$isSearching.assign(to: &$isSearching)
        stateStore.$searchHasMore.assign(to: &$searchHasMore)
        stateStore.$currentSearchQuery.assign(to: &$currentSearchQuery)
        stateStore.$isInJumpedState.assign(to: &$isInJumpedState)
        stateStore.$isSearchingQuotedMessage.assign(to: &$isSearchingQuotedMessage)
        stateStore.$quotedMessageSearchTarget.assign(to: &$quotedMessageSearchTarget)

        $isCurrentlyNearBottom.sink { [weak self] in self?.stateStore.isCurrentlyNearBottom = $0 }.store(in: &cancellables)
        $isProgrammaticScroll.sink { [weak self] in self?.stateStore.isProgrammaticScroll = $0 }.store(in: &cancellables)
    }

    private var storeRefreshGeneration: Int = 0

    private func handleStoreChange() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.storeRefreshGeneration &+= 1
            let generation = self.storeRefreshGeneration
            let userId = self.currentUserId
            let mapped = self.messageStore.messages.map { $0.toMessage(currentUserId: userId) }
            let needsDecryption = self.isDirect && mapped.contains { $0.isEncrypted && !$0.content.isEmpty }
            guard needsDecryption else { self.stateStore.messages = mapped; return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                var decrypted = mapped
                await self.decryptMessagesIfNeeded(&decrypted)
                guard generation == self.storeRefreshGeneration else { return }
                self.stateStore.messages = decrypted
            }
        }
    }

    // MARK: - Delegated Actions

    func markAsRead() { commandHandler.markAsRead(lastMessageId: messages.last?.id ?? "") }
    func deleteMessage(messageId: String, mode: DeleteMode = .everyone) async { await commandHandler.deleteMessage(messageId: messageId, serverId: serverId(for: messageId), mode: mode); if mode == .local { _messagesByDate = nil } }
    func editMessage(messageId: String, newContent: String) async { await commandHandler.editMessage(messageId: messageId, serverId: serverId(for: messageId), newContent: newContent) }
    func togglePin(messageId: String) async { let isPinned = messages.first(where: { $0.id == messageId })?.pinnedAt != nil; await commandHandler.togglePin(messageId: messageId, serverId: serverId(for: messageId), isPinned: isPinned, currentUserId: currentUserId) }
    func toggleReaction(messageId: String, emoji: String) { let pid = _resolvedParticipantId ?? currentUserId; commandHandler.toggleReaction(messageId: messageId, serverId: serverId(for: messageId), emoji: emoji, participantId: pid) }
    func toggleStar(messageId: String, conversationName: String? = nil, conversationAccentColor: String? = nil) -> Bool { guard let msg = messages.first(where: { $0.id == messageId }) else { return false }; let preview = preferredTranslation(for: messageId)?.translatedContent ?? msg.content; return commandHandler.toggleStar(message: msg, serverId: serverId(for: messageId), preview: preview, conversationName: conversationName, conversationAccentColor: conversationAccentColor) }
    func reportMessage(messageId: String, reportType: String, reason: String?) async -> Bool { await commandHandler.reportMessage(messageId: messageId, serverId: serverId(for: messageId), reportType: reportType, reason: reason) }
    func consumeViewOnce(messageId: String) async -> Bool { await commandHandler.consumeViewOnce(messageId: messageId, serverId: serverId(for: messageId)) }
    func deleteAttachment(messageId: String, attachmentId: String) async { guard let msg = messages.first(where: { $0.id == messageId }) else { return }; await commandHandler.deleteAttachment(messageId: messageId, attachmentId: attachmentId, originalAttachments: msg.attachments, serverId: serverId(for: messageId)) }

    func searchMessages(query: String) async { await searchHandler.searchMessages(query: query) }
    func prefetchRecentMedia() { mediaHandler.prefetchRecentMedia() }
    func preferredTranslation(for messageId: String) -> MessageTranslation? { guard let msg = messages.first(where: { $0.id == messageId }) else { return nil }; return translationResolver.preferredTranslation(for: msg) }

    // MARK: - Legacy Data Logic (Minimal extraction for view compatibility)

    func serverId(for messageId: String) -> String { stateStore.pendingServerIds[messageId] ?? messageId }
    func persistMessagesUsingServerIds() async { let rewritten = messages.map { m -> Message in guard let sid = stateStore.pendingServerIds[m.id] else { return m }; return m.copyWithId(sid) }; try? await CacheCoordinator.shared.messages.save(rewritten, for: conversationId) }
    private var _messageIdIndex: [String: Int]?
    private var messageIdIndex: [String: Int] { if let c = _messageIdIndex { return c }; var idx = [String: Int](minimumCapacity: messages.count); for (i, m) in messages.enumerated() { idx[m.id] = i }; _messageIdIndex = idx; return idx }
    func messageIndex(for id: String) -> Int? { messageIdIndex[id] }
    func containsMessage(id: String) -> Bool { messageIdIndex[id] != nil || stateStore.pendingServerIds.values.contains(id) }

    struct DateGroup: Identifiable { let id: String; let date: Date; let messages: [Message] }
    private var _messagesByDate: [DateGroup]?
    var messagesByDate: [DateGroup] { if let c = _messagesByDate { return c }; let hidden = LocallyHiddenMessagesStore.shared.allHiddenIds; let visible = hidden.isEmpty ? messages : messages.filter { !hidden.contains($0.id) }; let grouped = Dictionary(grouping: visible) { Calendar.current.dateComponents([.year, .month, .day], from: $0.createdAt) }; let res = grouped.map { (c, ms) in DateGroup(id: "\(c.year!)-\(c.month!)-\(c.day!)", date: ms.first?.createdAt ?? Date(), messages: ms) }.sorted { $0.date < $1.date }; _messagesByDate = res; return res }

    var allVisualAttachments: [MessageAttachment] { messages.flatMap { $0.attachments.filter { [.image, .video].contains($0.type) } } }
    var mediaCaptionMap: [String: String] { var map = [String: String](); for m in messages { let vis = m.attachments.filter { [.image, .video].contains($0.type) }; for a in vis { if let cap = a.caption, !cap.isEmpty { map[a.id] = cap } else if vis.count == 1 && !m.content.isEmpty { map[a.id] = preferredTranslation(for: m.id)?.translatedContent ?? m.content } } }; return map }
    var mediaSenderInfoMap: [String: MediaSenderInfo] { var map = [String: MediaSenderInfo](); for m in messages { let info = MediaSenderInfo(senderName: m.senderName ?? "?", senderAvatarURL: m.senderAvatarURL, senderColor: m.senderColor ?? "#999", sentAt: m.createdAt); for a in m.attachments { map[a.id] = info } }; return map }
    struct MediaSenderInfo { let senderName: String; let senderAvatarURL: String?; let senderColor: String; let sentAt: Date }

    // MARK: - Core Load Logic

    func loadMessages() async {
        guard !isLoadingInitial else { return }
        stateStore.isLoadingInitial = true
        stateStore.error = nil
        await messagePersistence.reconcileFailedFromOutbox(conversationId: conversationId)
        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        switch cached {
        case .fresh:
            await hydratePersistedTranslations(); await messageStore.loadInitial(); hydrateMetadataFromGRDB(); await hydrateTranslationsFromCache()
            stateStore.isRevalidating = !messageStore.messages.isEmpty
            Task { [weak self] in await self?.refreshMessagesFromAPI(); self?.stateStore.isRevalidating = false }
        case .stale:
            await hydratePersistedTranslations(); await messageStore.loadInitial()
            if messageStore.messages.isEmpty { await refreshMessagesFromAPI(); await hydrateTranslationsFromCache() }
            else { hydrateMetadataFromGRDB(); await hydrateTranslationsFromCache(); stateStore.isRevalidating = true; Task { [weak self] in await self?.refreshMessagesFromAPI(); self?.stateStore.isRevalidating = false } }
        case .expired, .empty: await refreshMessagesFromAPI()
        }
        if accessRevoked { stateStore.isLoadingInitial = false; return }
        if initialUnreadCount > 0 && messages.count >= initialUnreadCount { if let c = messages.dropFirst(messages.count - initialUnreadCount).first, !c.isMe { stateStore.firstUnreadMessageId = c.id } }
        socketHandler?.armSocketSubscriptions(); markAsRead(); commandHandler.markAsReceived(); prefetchRecentMedia()
        stateStore.isLoadingInitial = false
    }

    private func refreshMessagesFromAPI() async {
        do {
            let res = try await messageService.list(conversationId: conversationId, offset: 0, limit: 30, includeReplies: true)
            try? await messagePersistence.upsertFromAPIMessages(res.data)
            extractAttachmentTranscriptions(from: res.data); extractTextTranslations(from: res.data)
            await messageStore.loadInitial()
        } catch let error as MeeshyError { if case .forbidden(let r, _) = error { await handleAccessRevoked(reason: r) } } catch {}
    }

    private func handleAccessRevoked(reason: String?) async {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        try? await messagePersistence.deleteAll(conversationId: conversationId)
        stateStore.error = reason ?? "Acces refuse"
        stateStore.accessRevoked = true
    }

    func loadOlderMessages() async {
        guard hasOlderMessages, !isLoadingOlder, !isLoadingInitial else { return }
        stateStore.isLoadingOlder = true
        stateStore.scrollAnchorId = messages.first?.id
        do {
            let res = try await messageService.listBefore(conversationId: conversationId, before: nextMessageCursor ?? (messages.first?.id ?? ""), limit: 50, includeReplies: true)
            try? await messagePersistence.upsertFromAPIMessages(res.data)
            extractAttachmentTranscriptions(from: res.data); extractTextTranslations(from: res.data)
            await messageStore.loadOlder(before: messages.first?.createdAt ?? Date())
            nextMessageCursor = res.cursorPagination?.nextCursor
            stateStore.hasOlderMessages = res.cursorPagination?.hasMore ?? false
        } catch {}
        stateStore.isLoadingOlder = false
    }

    func loadNewerMessages() async {
        guard isInJumpedState, hasNewerMessages, !isLoadingNewer, !isProgrammaticScroll else { return }
        guard let lastMsg = messages.last else { return }
        stateStore.isLoadingNewer = true
        do {
            let res = try await messageService.listAround(conversationId: conversationId, around: lastMsg.id, limit: limit, includeReplies: true)
            try? await messagePersistence.upsertFromAPIMessages(res.data)
            extractAttachmentTranscriptions(from: res.data); extractTextTranslations(from: res.data)
            stateStore.hasNewerMessages = res.hasNewer ?? false
            if !hasNewerMessages { stateStore.isInJumpedState = false }
        } catch {}
        stateStore.isLoadingNewer = false
    }

    func returnToLatest() async {
        guard isInJumpedState else { return }
        stateStore.isInJumpedState = false
        stateStore.hasNewerMessages = false
        stateStore.currentSearchQuery = nil
        await messageStore.restoreLatestWindow()
        nextMessageCursor = nil
        stateStore.hasOlderMessages = true
    }

    func loadMoreSearchResults(query: String) async {
        guard searchHasMore, !isSearching else { return }
        stateStore.isSearching = true
        // Logic for loadMore would go in SearchHandler, omitted here for brevity of the extract
        stateStore.isSearching = false
    }

    // MARK: - Decoding & Decryption

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        guard isDirect else { return }
        let payloads = msgs.compactMap { m -> DecryptionPayload? in guard m.isEncrypted, !m.content.isEmpty, let d = Data(base64Encoded: m.content) else { return nil }; return DecryptionPayload(messageId: m.id, senderId: m.senderId, ciphertext: d) }
        if payloads.isEmpty { return }
        let res = await decryptionActor.decrypt(payloads); let map = Dictionary(uniqueKeysWithValues: res.map { ($0.messageId, $0.plaintext) })
        for i in msgs.indices { if let p = map[msgs[i].id] { msgs[i].content = p ?? "" } }
    }

    // MARK: - Send Flow & Optimistic Data

    func insertOptimisticMediaMessage(tempId: String, content: String, attachments: [MeeshyMessageAttachment], messageType: Message.MessageType, replyToId: String?) {
        let rec = MessageRecord(localId: tempId, conversationId: conversationId, senderId: currentUserId, content: content, messageType: messageType.rawValue, state: .sending, createdAt: Date(), updatedAt: Date())
        Task { try? await messagePersistence.insertOptimistic(rec) }
    }

    func retryMessage(messageId: String) async { guard let idx = messageIndex(for: messageId) else { return }; let msg = messages[idx]; try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date()); await sendMessage(content: msg.content, replyToId: msg.replyToId, existingTempId: messageId) }
    func removeFailedMessage(messageId: String) { Task { try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date()) } }

    func sendMessage(content: String, replyToId: String? = nil, attachmentIds: [String]? = nil, existingTempId: String? = nil) async -> Bool {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !(attachmentIds ?? []).isEmpty else { return false }
        stateStore.isSending = true; defer { stateStore.isSending = false }
        let tid = existingTempId ?? ClientMessageId.generate()
        let rec = MessageRecord(localId: tid, conversationId: conversationId, senderId: currentUserId, content: text, state: .sending, createdAt: Date(), updatedAt: Date())
        try? await messagePersistence.insertOptimistic(rec)
        do {
            let body = SendMessageRequest(content: text, replyToId: replyToId, attachmentIds: attachmentIds, clientMessageId: tid)
            let res = try await messageService.send(conversationId: conversationId, request: body)
            stateStore.pendingServerIds[tid] = res.id
            _ = try? await messagePersistence.applyEvent(localId: tid, event: .serverAck(serverId: res.id, at: res.createdAt))
            await persistMessagesUsingServerIds()
            return true
        } catch { _ = try? await messagePersistence.applyEvent(localId: tid, event: .sendFailed(error)); return false }
    }

    // MARK: - Metadata Extraction helpers

    private func extractTextTranslations(from msgs: [APIMessage]) { for m in msgs { if let ts = m.translations, !ts.isEmpty { stateStore.messageTranslations[m.id] = ts.map { MessageTranslation(id: $0.id, messageId: $0.messageId, sourceLanguage: $0.sourceLanguage ?? "auto", targetLanguage: $0.targetLanguage, translatedContent: $0.translatedContent, translationModel: $0.translationModel, confidenceScore: $0.confidenceScore) } } } }
    private func hydrateTranslationsFromCache() async { let cached = await CacheCoordinator.shared.cachedTranslations(for: messages.map(\.id)); for (mid, ts) in cached { stateStore.messageTranslations[mid] = ts.map { MessageTranslation(id: $0.id, messageId: $0.messageId, sourceLanguage: $0.sourceLanguage, targetLanguage: $0.targetLanguage, translatedContent: $0.translatedContent, translationModel: $0.translationModel, confidenceScore: $0.confidenceScore) } } }
    private func hydratePersistedTranslations() async { let trans: [String: [TranslationRecord]] = (try? await messagePersistence.reader.read { db in Dictionary(grouping: try TranslationRecord.fetchAll(db), by: \.messageLocalId) }) ?? [:]; for (mid, rs) in trans { stateStore.messageTranslations[mid] = rs.map { MessageTranslation(id: $0.id, messageId: mid, sourceLanguage: $0.sourceLanguage ?? "auto", targetLanguage: $0.targetLanguage, translatedContent: $0.translatedContent, translationModel: $0.translationModel, confidenceScore: $0.confidenceScore) } } }
    private func extractAttachmentTranscriptions(from msgs: [APIMessage]) { for m in msgs { for a in m.attachments ?? [] { if let t = a.transcription { stateStore.messageTranscriptions[m.id] = MessageTranscription(attachmentId: a.id, text: t.resolvedText, language: t.language ?? "?", confidence: t.confidence, durationMs: t.durationMs, segments: [], speakerCount: t.speakerCount) } } } }
    private func hydrateMetadataFromGRDB() { for r in messageStore.messages { let mid = r.serverId ?? r.localId; if let d = r.attachmentsJson, let atts = try? JSONDecoder().decode([MeeshyMessageAttachment].self, from: d) { for a in atts { if let t = a.transcription { stateStore.messageTranscriptions[mid] = MessageTranscription(attachmentId: a.id, text: t.text, language: t.language, confidence: t.confidence, durationMs: t.durationMs, segments: [], speakerCount: t.speakerCount) } } } } }

    private func subscribeToQueueReconciliation() {
        OfflineQueue.shared.retrySucceeded.receive(on: DispatchQueue.main).sink { [weak self] p in guard let self, p.conversationId == self.conversationId, p.kind == .sendMessage else { return }; self.stateStore.pendingServerIds[p.tempId] = p.serverId; Task { [weak self] in _ = try? await self?.messagePersistence.applyEvent(localId: p.tempId, event: .serverAck(serverId: p.serverId, at: Date())) } }.store(in: &cancellables)
    }
    private func subscribeToLanguagePreferenceChanges() { authManager.currentUserPublisher.removeDuplicates { $0?.systemLanguage == $1?.systemLanguage && $0?.regionalLanguage == $1?.regionalLanguage && $0?.customDestinationLanguage == $1?.customDestinationLanguage }.dropFirst().sink { [weak self] _ in self?.translationResolver.invalidatePreferenceCache(); self?.stateStore.preferredLanguageRevision &+= 1 }.store(in: &cancellables) }
    private var mentionCandidates: [MentionCandidate] { var seen = Set<String>(); var cs = [MentionCandidate](); for m in messages { guard let u = m.senderUsername, !seen.contains(u) else { continue }; seen.insert(u); cs.append(MentionCandidate(id: m.senderId.isEmpty ? u : m.senderId, username: u, displayName: m.senderName ?? u, avatarURL: m.senderAvatarURL)) }; return cs }

    func observeSync() {}
    func onTextChanged(_ text: String) { socketHandler?.onTextChanged(text); mentionController.handleQuery(in: text) }
    func stopTypingEmission() { socketHandler?.stopTypingEmission() }
    func markProgrammaticScroll() { isProgrammaticScroll = true; DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.isProgrammaticScroll = false } }

    func setActiveAudioLanguage(for messageId: String, language: String?) { stateStore.activeAudioLanguageOverrides[messageId] = language }
    func isEditSaving(messageId: String) -> Bool { editInProgress.contains(messageId) }
    func editRevisions(for messageId: String) -> [EditRevision] { EditHistoryStore.shared.revisions(for: serverId(for: messageId)) }
    func fetchReactionDetails(messageId: String) async { stateStore.isLoadingReactions = true; reactionDetails = (try? await reactionService.fetchDetails(messageId: serverId(for: messageId)).reactions) ?? []; stateStore.isLoadingReactions = false }
    func removeExpiredMessages() { Task { try? await messagePersistence.deleteExpiredEphemeral(before: Date()) } }

    enum DeleteMode { case local; case everyone }
}

extension ConversationViewModel: ConversationSocketDelegate {
    func handleParticipantRoleUpdated(participantId: String, newRole: String) { objectWillChange.send() }
    func handleSocketAccessRevoked(reason: String?) { Task { await handleAccessRevoked(reason: reason) } }
    func evictViewOnceMedia(message: Message) { for a in message.attachments { let urls = [a.fileUrl, a.thumbnailUrl].compactMap { $0 }.filter { !$0.isEmpty }; for u in urls { Task { let res = MeeshyConfig.resolveMediaURL(u)?.absoluteString ?? u; await CacheCoordinator.shared.images.remove(for: res) } } } }
    func markMessageAsConsumed(messageId: String) { commandHandler.markAsRead(lastMessageId: messageId) }
    func syncMissedMessages() async {}
    var pendingServerIds: [String : String] { get { stateStore.pendingServerIds } set { stateStore.pendingServerIds = newValue } }
}
