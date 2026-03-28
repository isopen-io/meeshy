import Foundation
import Combine
import UIKit
import MeeshySDK
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

@MainActor
class ConversationViewModel: ObservableObject {

    // MARK: - Published State

    @Published var messages: [Message] = [] {
        didSet {
            _messageIdIndex = nil
            _topActiveMembers = nil
            _mediaSenderInfoMap = nil
            _allVisualAttachments = nil
            _mediaCaptionMap = nil
            _allAudioItems = nil
            _replyCountMap = nil
            _mentionDisplayNames = nil
            _mentionCandidates = nil
            _cachedLastReceivedIndex = nil
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
    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var isLoadingNewer = false
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

    /// Detailed reaction data for a specific message (used by reaction detail sheet)
    @Published var reactionDetails: [ReactionGroup] = []
    @Published var isLoadingReactions = false

    /// ID of the first unread message (set once after initial load, cleared on scroll to bottom)
    @Published var firstUnreadMessageId: String?

    /// True during programmatic scrolls (initial load, send, scroll-to-bottom tap)
    /// When true, onAppear prefetch triggers are suppressed.
    @Published var isProgrammaticScroll = false

    /// Selected ephemeral duration for next message
    @Published var ephemeralDuration: EphemeralDuration?

    /// When true, next message will be sent with blur (recipient must tap to reveal)
    @Published var isBlurEnabled: Bool = false

    // MARK: - Mention Autocomplete State

    struct MentionCandidate: Identifiable, Equatable {
        let id: String          // userId or username
        let username: String
        let displayName: String
        let avatarURL: String?
    }

    @Published var mentionSuggestions: [MentionCandidate] = []
    @Published var activeMentionQuery: String? = nil

    // MARK: - Search State

    @Published var searchResults: [SearchResultItem] = []
    @Published var isSearching = false
    @Published var searchHasMore = false
    var searchNextCursor: String?

    /// True when the user jumped to a search result and messages are loaded around that point
    @Published var isInJumpedState = false
    private var savedMessages: [Message]?
    private var savedCursor: String?
    private var savedHasOlder: Bool = true

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
        messageIdIndex[id] != nil
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
    private var socketHandler: ConversationSocketHandler?
    private var lastOlderPaginationTime: Date = .distantPast
    private var lastNewerPaginationTime: Date = .distantPast
    private static let paginationDebounceInterval: TimeInterval = 1.0
    private static let paginationRetryCount: Int = 3
    private static let paginationRetryDelay: UInt64 = 500_000_000

    private let authManager: AuthManaging
    private let messageService: MessageServiceProviding
    private let conversationService: ConversationServiceProviding
    private let reactionService: ReactionServiceProviding
    private let reportService: ReportServiceProviding
    private let syncEngine: ConversationSyncEngineProviding

    private var currentUserId: String { authManager.currentUser?.id ?? "" }
    private var currentUsername: String? { authManager.currentUser?.username }
    private var _resolvedParticipantId: String?

    // MARK: - Mention Display Names (username → displayName) — cached

    private var _mentionDisplayNames: [String: String]?

    var mentionDisplayNames: [String: String] {
        if let cached = _mentionDisplayNames { return cached }
        var map: [String: String] = [:]
        for msg in messages {
            guard let username = msg.senderUsername, let displayName = msg.senderName else { continue }
            map[username] = displayName
        }
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

    /// Called from the composer's `onTextChange` callback.
    /// Detects `@query` at the end of typed text (after the last `@` that has no space before content).
    func handleMentionQuery(in text: String) {
        // Find the last @ that could start a mention (not preceded by alphanumeric)
        guard let atRange = text.range(of: "@", options: .backwards) else {
            clearMentionSuggestions()
            return
        }

        let afterAt = text[atRange.upperBound...]
        // Query with spaces is allowed — but stop if we see a newline
        let query = String(afterAt)
        guard !query.contains("\n") else {
            clearMentionSuggestions()
            return
        }

        activeMentionQuery = query
        let queryLower = query.lowercased()

        let filtered = mentionCandidates.filter { candidate in
            queryLower.isEmpty
                || candidate.username.lowercased().hasPrefix(queryLower)
                || candidate.displayName.lowercased().hasPrefix(queryLower)
        }

        mentionSuggestions = filtered
    }

    func clearMentionSuggestions() {
        mentionSuggestions = []
        activeMentionQuery = nil
    }

    /// Replaces the active `@query` at the end of `text` with `@DisplayName ` or `@username `.
    /// Returns the new text string.
    func insertMention(_ candidate: MentionCandidate, into text: String) -> String {
        let insertText: String
        if candidate.displayName != candidate.username {
            insertText = "@\(candidate.displayName) "
        } else {
            insertText = "@\(candidate.username) "
        }

        guard let atRange = text.range(of: "@", options: .backwards) else {
            return text + insertText
        }
        let newText = text[..<atRange.lowerBound] + insertText
        clearMentionSuggestions()
        return String(newText)
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
        anonymousSession: AnonymousSessionContext? = nil,
        authManager: AuthManaging = AuthManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        reactionService: ReactionServiceProviding = ReactionService.shared,
        reportService: ReportServiceProviding = ReportService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared
    ) {
        self.conversationId = conversationId
        self.memberJoinedAt = memberJoinedAt
        self.initialUnreadCount = unreadCount
        self.isDirect = isDirect
        self.participantUserId = participantUserId
        self.authManager = authManager
        self.messageService = messageService
        self.conversationService = conversationService
        self.reactionService = reactionService
        self.reportService = reportService
        self.syncEngine = syncEngine
        let handler = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: authManager.currentUser?.id ?? ""
        )
        handler.delegate = self
        self.socketHandler = handler
        if let session = anonymousSession {
            APIClient.shared.anonymousSessionToken = session.sessionToken
            MessageSocketManager.shared.connectAnonymous(sessionToken: session.sessionToken)
        }
    }

    deinit {
        // socketHandler deinit handles room leave & typing cleanup
        socketHandler = nil
        APIClient.shared.anonymousSessionToken = nil
    }

    // MARK: - Typing Emission (delegated to socketHandler)

    func onTextChanged(_ text: String) {
        socketHandler?.onTextChanged(text)
        if text.contains("@") {
            handleMentionQuery(in: text)
        } else {
            clearMentionSuggestions()
        }
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

        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        switch cached {
        case .fresh(let data, _):
            messages = data
        case .stale(let data, _):
            messages = data
            Task { [weak self] in
                guard let self else { return }
                await self.syncEngine.ensureMessages(for: self.conversationId)
            }
        case .expired, .empty:
            await syncEngine.ensureMessages(for: conversationId)
            let reloaded = await CacheCoordinator.shared.messages.load(for: conversationId)
            if let data = reloaded.value {
                messages = data
            }
        }

        // Calculate first unread message position
        if initialUnreadCount > 0 && messages.count >= initialUnreadCount {
            let unreadStartIndex = messages.count - initialUnreadCount
            let candidate = messages[unreadStartIndex]
            if !candidate.isMe {
                firstUnreadMessageId = candidate.id
            }
        }

        // Mark conversation as read (fire-and-forget)
        markAsRead()

        isLoadingInitial = false
    }

    // MARK: - Sync Engine Observation

    func observeSync() {
        syncEngine.messagesDidChange
            .filter { [weak self] id in id == self?.conversationId }
            .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                Task { [weak self] in
                    guard let self else { return }
                    let cached = await CacheCoordinator.shared.messages.load(for: self.conversationId)
                    switch cached {
                    case .fresh(let data, _), .stale(let data, _):
                        self.messages = data
                    case .expired, .empty:
                        break
                    }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Load Older Messages (infinite scroll)

    func loadOlderMessages() async {
        guard hasOlderMessages, !isLoadingOlder, !isLoadingInitial, !isProgrammaticScroll else { return }
        guard let oldestId = messages.first?.id else { return }

        // Debounce: ignore calls that arrive too soon after the last one
        let now = Date()
        guard now.timeIntervalSince(lastOlderPaginationTime) >= Self.paginationDebounceInterval else { return }
        lastOlderPaginationTime = now

        isLoadingOlder = true
        // Save anchor BEFORE prepend so the view can restore scroll position
        scrollAnchorId = oldestId

        let beforeValue = nextMessageCursor ?? oldestId

        await syncEngine.fetchOlderMessages(for: conversationId, before: beforeValue)

        // Reload from cache
        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        if let data = cached.value {
            let previousCount = messages.count
            messages = data
            hasOlderMessages = data.count > previousCount
        }

        isLoadingOlder = false
    }

    // MARK: - Decryption

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        guard isDirect else { return }

        await withTaskGroup(of: (Int, String?).self) { group in
            for i in 0..<msgs.count {
                let msg = msgs[i]
                if msg.isEncrypted, !msg.senderId.isEmpty, !msg.content.isEmpty, let data = Data(base64Encoded: msg.content) {
                    let senderId = msg.senderId
                    group.addTask {
                        do {
                            let decrypted = try await SessionManager.shared.decryptMessage(data, from: senderId)
                            if let text = String(data: decrypted, encoding: .utf8) {
                                return (i, text)
                            }
                        } catch {
                            return (i, "[Message chiffré - Échec du déchiffrement]")
                        }
                        return (i, nil)
                    }
                }
            }

            for await result in group {
                if let text = result.1 {
                    msgs[result.0].content = text
                }
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
    func sendMessage(content: String, replyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, localAttachments: [MeeshyMessageAttachment]? = nil, expiresAt: Date? = nil, isViewOnce: Bool? = nil, maxViewOnceCount: Int? = nil, isBlurred: Bool? = nil, originalLanguage: String? = nil) async -> Bool {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !(attachmentIds ?? []).isEmpty else { return false }

        // Offline: enqueue for later delivery instead of failing
        if NetworkMonitor.shared.isOffline {
            let queueItem = OfflineQueueItem(
                conversationId: conversationId,
                content: text,
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds
            )
            Task { await OfflineQueue.shared.enqueue(queueItem) }
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

        isSending = true

        // Build ReplyReference from quoted message
        var replyRef: ReplyReference?
        if let replyId = replyToId, let quoted = messages.first(where: { $0.id == replyId }) {
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

        // Optimistic insert
        let tempId = "temp_\(UUID().uuidString)"
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
        let optimisticMessage = Message(
            id: tempId,
            conversationId: conversationId,
            senderId: currentUserId,
            content: text,
            messageType: optimisticMessageType,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            expiresAt: resolvedExpiresAt,
            isViewOnce: resolvedIsViewOnce,
            maxViewOnceCount: resolvedMaxViewOnceCount,
            viewOnceCount: 0,
            isBlurred: resolvedBlur == true,
            createdAt: Date(),
            updatedAt: Date(),
            attachments: resolvedAttachments,
            replyTo: replyRef,
            deliveryStatus: .sending,
            isMe: true
        )
        messages.append(optimisticMessage)
        newMessageAppended += 1

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
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds,
                expiresAt: resolvedExpiresAt,
                ephemeralDuration: resolvedEphemeralDuration,
                isViewOnce: resolvedIsViewOnce ? true : nil,
                maxViewOnceCount: resolvedMaxViewOnceCount,
                isBlurred: resolvedBlur,
                isEncrypted: isEncrypted ? true : nil,
                encryptionMode: encryptionMode
            )
            let responseData = try await messageService.send(
                conversationId: conversationId, request: body
            )

            // Replace temp message with server version, preserving local attachments
            if let idx = messageIndex(for: tempId) {
                messages[idx] = Message(
                    id: responseData.id,
                    conversationId: conversationId,
                    senderId: currentUserId,
                    content: text,
                    messageType: optimisticMessageType,
                    replyToId: replyToId,
                    expiresAt: resolvedExpiresAt,
                    isViewOnce: resolvedIsViewOnce,
                    maxViewOnceCount: resolvedMaxViewOnceCount,
                    viewOnceCount: 0,
                    isBlurred: resolvedBlur == true,
                    createdAt: responseData.createdAt,
                    updatedAt: responseData.createdAt,
                    attachments: resolvedAttachments,
                    replyTo: replyRef,
                    deliveryStatus: .sent,
                    isMe: true
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
            isSending = false
            return true
        } catch {
            // Mark optimistic message as failed (keep in list for retry)
            if let idx = messageIndex(for: tempId) {
                messages[idx].deliveryStatus = .failed
            }
            self.error = error.localizedDescription
            isSending = false
            return false
        }
    }

    // MARK: - Retry Failed Message

    func retryMessage(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let failedMsg = messages[idx]
        guard failedMsg.deliveryStatus == .failed else { return }

        // Remove failed message and re-send
        let content = failedMsg.content
        let replyToId = failedMsg.replyToId
        messages.remove(at: idx)

        await sendMessage(content: content, replyToId: replyToId)
    }

    func removeFailedMessage(messageId: String) {
        messages.removeAll { $0.id == messageId && $0.deliveryStatus == .failed }
    }

    // MARK: - Handle Expired Messages

    func removeExpiredMessages() {
        let now = Date()
        messages.removeAll { msg in
            guard let expiresAt = msg.expiresAt else { return false }
            return expiresAt <= now
        }
    }

    // MARK: - Toggle Reaction

    func toggleReaction(messageId: String, emoji: String) {
        guard let idx = messageIndex(for: messageId) else { return }

        let participantId = _resolvedParticipantId ?? currentUserId
        let alreadyReacted = messages[idx].reactions.contains { $0.emoji == emoji && $0.participantId == participantId }

        if alreadyReacted {
            // Optimistic remove
            messages[idx].reactions.removeAll { $0.emoji == emoji && $0.participantId == participantId }
            // API call
            Task {
                try? await reactionService.remove(messageId: messageId, emoji: emoji)
            }
        } else {
            // Optimistic add
            let reaction = Reaction(messageId: messageId, participantId: participantId, emoji: emoji)
            messages[idx].reactions.append(reaction)
            // API call
            Task {
                try? await reactionService.add(messageId: messageId, emoji: emoji)
            }
        }

        // Resolve participantId lazily for future reactions
        if _resolvedParticipantId == nil {
            let convId = conversationId
            let userId = currentUserId
            Task {
                let cached = await CacheCoordinator.shared.participants.load(for: convId).value ?? []
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
            let result = try await reactionService.fetchDetails(messageId: messageId)
            reactionDetails = result.reactions
        } catch {
            reactionDetails = []
        }
    }

    // MARK: - Delete Message

    func deleteMessage(messageId: String) async {
        // Optimistic: mark as deleted locally
        if let idx = messageIndex(for: messageId) {
            messages[idx].deletedAt = Date()
            messages[idx].content = ""
        }

        do {
            try await messageService.delete(conversationId: conversationId, messageId: messageId)
        } catch {
            // Revert on failure
            if let idx = messageIndex(for: messageId) {
                messages[idx].deletedAt = nil
            }
            self.error = error.localizedDescription
        }
    }

    // MARK: - Pin / Unpin Message

    func togglePin(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let wasPinned = messages[idx].pinnedAt != nil

        if wasPinned {
            // Optimistic unpin
            messages[idx].pinnedAt = nil
            messages[idx].pinnedBy = nil

            do {
                try await messageService.unpin(conversationId: conversationId, messageId: messageId)
            } catch {
                // Revert
                messages[idx].pinnedAt = Date()
                self.error = error.localizedDescription
            }
        } else {
            // Optimistic pin
            let now = Date()
            messages[idx].pinnedAt = now
            messages[idx].pinnedBy = authManager.currentUser?.id

            do {
                try await messageService.pin(conversationId: conversationId, messageId: messageId)
            } catch {
                // Revert
                messages[idx].pinnedAt = nil
                messages[idx].pinnedBy = nil
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Consume View-Once Message

    func consumeViewOnce(messageId: String) async -> Bool {
        do {
            let result = try await messageService.consumeViewOnce(
                conversationId: conversationId, messageId: messageId
            )
            if let idx = messageIndex(for: messageId) {
                messages[idx].viewOnceCount = result.viewOnceCount
            }
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
        guard let idx = messageIndex(for: messageId) else { return }
        messages[idx].isBlurred = true
        messages[idx].content = "[Message vu]"
    }

    // MARK: - Edit Message

    func editMessage(messageId: String, newContent: String) async {
        let trimmed = newContent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Optimistic update
        var originalContent: String?
        if let idx = messageIndex(for: messageId) {
            originalContent = messages[idx].content
            messages[idx].content = trimmed
            messages[idx].isEdited = true
        }

        do {
            _ = try await messageService.edit(messageId: messageId, content: trimmed)
        } catch {
            // Revert on failure
            if let idx = messageIndex(for: messageId),
               let original = originalContent {
                messages[idx].content = original
                messages[idx].isEdited = false
            }
            self.error = error.localizedDescription
        }
    }

    // MARK: - Report Message

    func reportMessage(messageId: String, reportType: String, reason: String?) async -> Bool {
        do {
            try await reportService.reportMessage(messageId: messageId, reportType: reportType, reason: reason)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Mark as Read

    func markAsRead() {
        // Notify ConversationListViewModel immediately to clear the badge in the list
        NotificationCenter.default.post(name: .conversationMarkedRead, object: conversationId)
        Task {
            try? await conversationService.markRead(conversationId: conversationId)
        }
        markConversationAsRead()
    }

    func markConversationAsRead() {
        let convId = conversationId
        Task {
            do {
                let _: APIResponse<[String: String]> = try await APIClient.shared.request(
                    endpoint: "/conversations/\(convId)/mark-as-read",
                    method: "POST"
                )
            } catch {
                await PendingStatusQueue.shared.enqueue(.init(
                    conversationId: convId, type: "read", timestamp: Date()
                ))
            }
        }
    }


    // MARK: - Reconnection Sync (called by ConversationSocketHandler)

    func syncMissedMessages() async {
        guard !messages.isEmpty else { return }
        guard let lastMessage = messages.last else { return }

        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 30, includeReplies: true
            )

            let userId = currentUserId
            var fetchedMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: self.currentUsername) }
            await decryptMessagesIfNeeded(&fetchedMessages)
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)

            let newMessages = fetchedMessages.filter { !self.containsMessage(id: $0.id) }
                .filter { $0.createdAt > lastMessage.createdAt }

            if !newMessages.isEmpty {
                messages.append(contentsOf: newMessages)
                newMessageAppended += 1
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
            isSearching = false
            return
        }

        isSearching = true
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
        // Save current state so we can return later
        if !isInJumpedState {
            savedMessages = messages
            savedCursor = nextMessageCursor
            savedHasOlder = hasOlderMessages
        }

        do {
            let response = try await messageService.listAround(
                conversationId: conversationId, around: messageId, limit: limit, includeReplies: true
            )

            let userId = currentUserId
            var fetchedMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: self.currentUsername) }
            await decryptMessagesIfNeeded(&fetchedMessages)
            messages = fetchedMessages
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

                let userId = currentUserId
                var newMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: self.currentUsername) }
                await decryptMessagesIfNeeded(&newMessages)
                extractAttachmentTranscriptions(from: response.data)
                extractTextTranslations(from: response.data)
                let genuinelyNew = newMessages.filter { !self.containsMessage(id: $0.id) }

                if !genuinelyNew.isEmpty {
                    // Data is already chronologically sorted by the reversed() map and strictly newer,
                    // so purely appending maintains order optimally in O(k).
                    messages.append(contentsOf: genuinelyNew)
                }

                hasNewerMessages = response.hasNewer ?? false
                if !hasNewerMessages {
                    isInJumpedState = false
                    savedMessages = nil
                    savedCursor = nil
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

        if let saved = savedMessages {
            messages = saved
            nextMessageCursor = savedCursor
            hasOlderMessages = savedHasOlder
        } else {
            isInJumpedState = false
            hasNewerMessages = false
            await loadMessages()
            return
        }

        savedMessages = nil
        savedCursor = nil
        savedHasOlder = true
        isInJumpedState = false
        hasNewerMessages = false
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
}
