import Foundation
import Combine
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

    @Published var messages: [Message] = []
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
    @Published var messageTranslations: [String: [MessageTranslation]] = [:]
    @Published var messageTranscriptions: [String: MessageTranscription] = [:]
    @Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:]

    /// Manual translation override per message (user selected a specific language in Language tab)
    /// nil value means user chose "show original"
    @Published var activeTranslationOverrides: [String: MessageTranslation?] = [:]

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

    // MARK: - Conversation-Wide Media

    struct MediaSenderInfo {
        let senderName: String
        let senderAvatarURL: String?
        let senderColor: String
        let sentAt: Date
    }

    var mediaSenderInfoMap: [String: MediaSenderInfo] {
        var map: [String: MediaSenderInfo] = [:]
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
        return map
    }

    /// All visual attachments (images + videos) across every loaded message, in chronological order.
    var allVisualAttachments: [MessageAttachment] {
        messages.flatMap { msg in
            msg.attachments.filter { [.image, .video].contains($0.type) }
        }
    }

    /// Maps attachment.id -> caption text for the fullscreen gallery.
    /// Priority: 1) attachment.caption  2) message text (only if single visual attachment)
    var mediaCaptionMap: [String: String] {
        var map: [String: String] = [:]
        for msg in messages {
            let visuals = msg.attachments.filter { [.image, .video].contains($0.type) }
            for att in visuals {
                if let caption = att.caption, !caption.isEmpty {
                    map[att.id] = caption
                } else if visuals.count == 1 && !msg.content.isEmpty {
                    // Single visual + message text -> show as caption
                    // Use translation if available, otherwise original content
                    if let translations = messageTranslations[msg.id],
                       let best = translations.first {
                        map[att.id] = best.translatedContent
                    } else {
                        map[att.id] = msg.content
                    }
                }
            }
        }
        return map
    }

    // MARK: - Private

    let conversationId: String
    private let initialUnreadCount: Int
    private let limit = 50
    private var nextMessageCursor: String?
    private var cancellables = Set<AnyCancellable>()

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    // Pagination safety
    private static let paginationRetryCount = 3
    private static let paginationRetryDelay: UInt64 = 1_000_000_000  // 1s in nanoseconds
    private static let paginationDebounceInterval: TimeInterval = 0.3
    private var lastOlderPaginationTime: Date = .distantPast
    private var lastNewerPaginationTime: Date = .distantPast

    // Typing emission state
    private var typingTimer: Timer?
    private var isEmittingTyping = false
    private static let typingDebounceInterval: TimeInterval = 3.0
    private static let typingSafetyTimeout: TimeInterval = 15.0

    // Safety timers for stuck typing indicators
    private var typingSafetyTimers: [String: Timer] = [:]

    // MARK: - Init

    init(conversationId: String, unreadCount: Int = 0) {
        self.conversationId = conversationId
        self.initialUnreadCount = unreadCount
        subscribeToSocket()
        subscribeToReconnect()
        joinRoom()
    }

    deinit {
        leaveRoom()
        MessageSocketManager.shared.activeConversationId = nil
        // Direct cleanup -- can't call @MainActor methods from deinit
        typingTimer?.invalidate()
        if isEmittingTyping {
            MessageSocketManager.shared.emitTypingStop(conversationId: conversationId)
        }
        typingSafetyTimers.values.forEach { $0.invalidate() }
    }

    // MARK: - Room Management

    private func joinRoom() {
        MessageSocketManager.shared.activeConversationId = conversationId
        MessageSocketManager.shared.joinConversation(conversationId)
    }

    private nonisolated func leaveRoom() {
        MessageSocketManager.shared.leaveConversation(conversationId)
    }

    // MARK: - Typing Emission

    func onTextChanged(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            startTypingEmission()
        } else {
            stopTypingEmission()
        }
    }

    private func startTypingEmission() {
        typingTimer?.invalidate()

        if !isEmittingTyping {
            isEmittingTyping = true
            MessageSocketManager.shared.emitTypingStart(conversationId: conversationId)
        }

        // Auto-stop after debounce interval of no typing
        typingTimer = Timer.scheduledTimer(withTimeInterval: Self.typingDebounceInterval, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.stopTypingEmission()
            }
        }
    }

    func stopTypingEmission() {
        typingTimer?.invalidate()
        typingTimer = nil

        guard isEmittingTyping else { return }
        isEmittingTyping = false
        MessageSocketManager.shared.emitTypingStop(conversationId: conversationId)
    }

    // MARK: - Programmatic Scroll Guard

    /// Call before any programmatic scroll. Resets after a short delay.
    func markProgrammaticScroll() {
        isProgrammaticScroll = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.isProgrammaticScroll = false
        }
    }

    // MARK: - Load Messages (initial)

    func loadMessages() async {
        guard !isLoadingInitial else { return }
        isLoadingInitial = true
        error = nil

        // Show cached messages immediately while fetching from API
        if messages.isEmpty {
            let cached = await LocalStore.shared.loadMessages(for: conversationId)
            if !cached.isEmpty {
                messages = cached
            }
        }

        do {
            let response = try await MessageService.shared.list(
                conversationId: conversationId, offset: 0, limit: limit, includeReplies: true
            )

            let userId = currentUserId
            // API returns newest first, reverse to oldest-first for display
            messages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            self.nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? response.pagination?.hasMore ?? false

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

            // Update cache in background
            let conversationId = self.conversationId
            Task.detached(priority: .utility) { [messages] in
                await LocalStore.shared.saveMessages(messages, for: conversationId)
            }
        } catch {
            self.error = error.localizedDescription
        }

        isLoadingInitial = false
    }

    // MARK: - Load Older Messages (infinite scroll)

    func loadOlderMessages() async {
        guard hasOlderMessages, !isLoadingOlder, !isProgrammaticScroll else { return }
        guard let oldestId = messages.first?.id else { return }

        // Debounce: ignore calls that arrive too soon after the last one
        let now = Date()
        guard now.timeIntervalSince(lastOlderPaginationTime) >= Self.paginationDebounceInterval else { return }
        lastOlderPaginationTime = now

        isLoadingOlder = true
        // Save anchor BEFORE prepend so the view can restore scroll position
        scrollAnchorId = oldestId

        let beforeValue = nextMessageCursor ?? oldestId

        var lastError: Error?
        for attempt in 1...Self.paginationRetryCount {
            do {
                let response = try await MessageService.shared.listBefore(
                    conversationId: conversationId, before: beforeValue, limit: limit, includeReplies: true
                )

                let userId = currentUserId
                let olderMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
                extractAttachmentTranscriptions(from: response.data)
                extractTextTranslations(from: response.data)

                // Dedup and prepend
                let existingIds = Set(messages.map(\.id))
                let newMessages = olderMessages.filter { !existingIds.contains($0.id) }
                messages.insert(contentsOf: newMessages, at: 0)

                self.nextMessageCursor = response.cursorPagination?.nextCursor
                hasOlderMessages = response.cursorPagination?.hasMore ?? response.pagination?.hasMore ?? false
                lastError = nil
                break
            } catch {
                lastError = error
                if attempt < Self.paginationRetryCount {
                    Logger.messages.warning("loadOlderMessages attempt \(attempt) failed, retrying: \(error.localizedDescription)")
                    try? await Task.sleep(nanoseconds: Self.paginationRetryDelay)
                }
            }
        }

        if let lastError {
            Logger.messages.error("loadOlderMessages failed after \(Self.paginationRetryCount) attempts: \(lastError.localizedDescription)")
            self.error = lastError.localizedDescription
        }

        isLoadingOlder = false
    }

    // MARK: - Send Message

    func sendMessage(content: String, replyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, expiresAt: Date? = nil, isBlurred: Bool? = nil) async {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !(attachmentIds ?? []).isEmpty else { return }

        // Stop typing emission on send
        stopTypingEmission()

        // Resolve ephemeral: use explicit param or ViewModel state
        let resolvedExpiresAt = expiresAt ?? ephemeralDuration?.expiresAt

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
        let optimisticMessage = Message(
            id: tempId,
            conversationId: conversationId,
            senderId: currentUserId,
            content: text,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            expiresAt: resolvedExpiresAt,
            isViewOnce: false, maxViewOnceCount: nil, viewOnceCount: 0,
            isBlurred: resolvedBlur == true,
            createdAt: Date(),
            updatedAt: Date(),
            replyTo: replyRef,
            deliveryStatus: .sending,
            isMe: true
        )
        messages.append(optimisticMessage)
        newMessageAppended += 1

        do {
            let body = SendMessageRequest(
                content: text.isEmpty ? nil : text,
                originalLanguage: nil,
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds,
                expiresAt: resolvedExpiresAt,
                isBlurred: resolvedBlur
            )
            let responseData = try await MessageService.shared.send(
                conversationId: conversationId, request: body
            )

            // Replace temp message with server version
            if let idx = messages.firstIndex(where: { $0.id == tempId }) {
                messages[idx] = Message(
                    id: responseData.id,
                    conversationId: conversationId,
                    senderId: currentUserId,
                    content: text,
                    replyToId: replyToId,
                    expiresAt: resolvedExpiresAt,
                    isViewOnce: false, maxViewOnceCount: nil, viewOnceCount: 0,
                    isBlurred: resolvedBlur == true,
                    createdAt: responseData.createdAt,
                    updatedAt: responseData.createdAt,
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
        } catch {
            // Mark optimistic message as failed (keep in list for retry)
            if let idx = messages.firstIndex(where: { $0.id == tempId }) {
                messages[idx].deliveryStatus = .failed
            }
            self.error = error.localizedDescription
        }

        isSending = false
    }

    // MARK: - Retry Failed Message

    func retryMessage(messageId: String) async {
        guard let idx = messages.firstIndex(where: { $0.id == messageId }) else { return }
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
        guard let idx = messages.firstIndex(where: { $0.id == messageId }) else { return }

        let userId = currentUserId
        let alreadyReacted = messages[idx].reactions.contains { $0.emoji == emoji && $0.userId == userId }

        if alreadyReacted {
            // Optimistic remove
            messages[idx].reactions.removeAll { $0.emoji == emoji && $0.userId == userId }
            // API call
            Task {
                try? await ReactionService.shared.remove(messageId: messageId, emoji: emoji)
            }
        } else {
            // Optimistic add
            let reaction = Reaction(messageId: messageId, userId: userId, emoji: emoji)
            messages[idx].reactions.append(reaction)
            // API call
            Task {
                try? await ReactionService.shared.add(messageId: messageId, emoji: emoji)
            }
        }
    }

    // MARK: - Fetch Reaction Details

    func fetchReactionDetails(messageId: String) async {
        isLoadingReactions = true
        defer { isLoadingReactions = false }
        do {
            let result = try await ReactionService.shared.fetchDetails(messageId: messageId)
            reactionDetails = result.reactions
        } catch {
            reactionDetails = []
        }
    }

    // MARK: - Delete Message

    func deleteMessage(messageId: String) async {
        // Optimistic: mark as deleted locally
        if let idx = messages.firstIndex(where: { $0.id == messageId }) {
            messages[idx].isDeleted = true
            messages[idx].content = ""
        }

        do {
            try await MessageService.shared.delete(conversationId: conversationId, messageId: messageId)
        } catch {
            // Revert on failure
            if let idx = messages.firstIndex(where: { $0.id == messageId }) {
                messages[idx].isDeleted = false
            }
            self.error = error.localizedDescription
        }
    }

    // MARK: - Pin / Unpin Message

    func togglePin(messageId: String) async {
        guard let idx = messages.firstIndex(where: { $0.id == messageId }) else { return }
        let wasPinned = messages[idx].pinnedAt != nil

        if wasPinned {
            // Optimistic unpin
            messages[idx].pinnedAt = nil
            messages[idx].pinnedBy = nil

            do {
                try await MessageService.shared.unpin(conversationId: conversationId, messageId: messageId)
            } catch {
                // Revert
                messages[idx].pinnedAt = Date()
                self.error = error.localizedDescription
            }
        } else {
            // Optimistic pin
            let now = Date()
            messages[idx].pinnedAt = now
            messages[idx].pinnedBy = AuthManager.shared.currentUser?.id

            do {
                try await MessageService.shared.pin(conversationId: conversationId, messageId: messageId)
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
            let result = try await MessageService.shared.consumeViewOnce(
                conversationId: conversationId, messageId: messageId
            )
            if let idx = messages.firstIndex(where: { $0.id == messageId }) {
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
                    await MediaCacheManager.shared.remove(for: resolved)
                }
            }
        }
    }

    func markMessageAsConsumed(messageId: String) {
        guard let idx = messages.firstIndex(where: { $0.id == messageId }) else { return }
        messages[idx].isBlurred = true
        messages[idx].content = "[Message vu]"
    }

    // MARK: - Edit Message

    func editMessage(messageId: String, newContent: String) async {
        let trimmed = newContent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Optimistic update
        var originalContent: String?
        if let idx = messages.firstIndex(where: { $0.id == messageId }) {
            originalContent = messages[idx].content
            messages[idx].content = trimmed
            messages[idx].isEdited = true
        }

        do {
            _ = try await MessageService.shared.edit(messageId: messageId, content: trimmed)
        } catch {
            // Revert on failure
            if let idx = messages.firstIndex(where: { $0.id == messageId }),
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
            try await ReportService.shared.reportMessage(messageId: messageId, reportType: reportType, reason: reason)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Mark as Read

    func markAsRead() {
        Task {
            try? await ConversationService.shared.markRead(conversationId: conversationId)
        }
    }

    // MARK: - Typing Safety Timeout

    private func resetTypingSafetyTimer(for username: String) {
        typingSafetyTimers[username]?.invalidate()
        typingSafetyTimers[username] = Timer.scheduledTimer(withTimeInterval: Self.typingSafetyTimeout, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.typingUsernames.removeAll { $0 == username }
                self?.typingSafetyTimers.removeValue(forKey: username)
            }
        }
    }

    private func clearTypingSafetyTimer(for username: String) {
        typingSafetyTimers[username]?.invalidate()
        typingSafetyTimers.removeValue(forKey: username)
    }

    // MARK: - Socket Subscriptions

    private func subscribeToSocket() {
        let socketManager = MessageSocketManager.shared
        let convId = conversationId
        let userId = currentUserId

        // New messages
        socketManager.messageReceived
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                guard let self else { return }
                // Skip if already in list (e.g. our own optimistic message)
                guard !self.messages.contains(where: { $0.id == apiMsg.id }) else { return }
                // Skip own messages (already added optimistically)
                if apiMsg.senderId == userId { return }
                let msg = apiMsg.toMessage(currentUserId: userId)
                self.messages.append(msg)
                self.lastUnreadMessage = msg
                self.newMessageAppended += 1

                // Clear typing for the sender (they just sent a message)
                if let sender = apiMsg.sender {
                    let senderName = sender.displayName ?? sender.username
                    self.typingUsernames.removeAll { $0 == senderName }
                    self.clearTypingSafetyTimer(for: senderName)
                }
            }
            .store(in: &cancellables)

        // Edited messages
        socketManager.messageEdited
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == apiMsg.id }) {
                    self.messages[idx].content = apiMsg.content ?? ""
                    self.messages[idx].isEdited = true
                }
            }
            .store(in: &cancellables)

        // Deleted messages
        socketManager.messageDeleted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == event.messageId }) {
                    self.messages[idx].isDeleted = true
                    self.messages[idx].content = ""
                }
            }
            .store(in: &cancellables)

        // Reactions added (with deduplication)
        socketManager.reactionAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == event.messageId }) {
                    // Deduplicate: don't add if same user+emoji already exists
                    let exists = self.messages[idx].reactions.contains {
                        $0.emoji == event.emoji && $0.userId == event.userId
                    }
                    if !exists {
                        let reaction = Reaction(messageId: event.messageId, userId: event.userId, emoji: event.emoji)
                        self.messages[idx].reactions.append(reaction)
                    }
                }
            }
            .store(in: &cancellables)

        // Reactions removed
        socketManager.reactionRemoved
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == event.messageId }) {
                    self.messages[idx].reactions.removeAll {
                        $0.emoji == event.emoji && $0.userId == event.userId
                    }
                }
            }
            .store(in: &cancellables)

        // Typing started (with safety timeout)
        socketManager.typingStarted
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if event.userId != userId, !self.typingUsernames.contains(event.username) {
                    self.typingUsernames.append(event.username)
                }
                // Reset safety timer (even if already in list -- they're still typing)
                if event.userId != userId {
                    self.resetTypingSafetyTimer(for: event.username)
                }
            }
            .store(in: &cancellables)

        // Typing stopped
        socketManager.typingStopped
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.typingUsernames.removeAll { $0 == event.username }
                self.clearTypingSafetyTimer(for: event.username)
            }
            .store(in: &cancellables)

        // Read status updated (delivered / read)
        socketManager.readStatusUpdated
            .filter { $0.conversationId == convId }
            .filter { $0.userId != userId } // Only care about OTHER users reading/receiving
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let newStatus: Message.DeliveryStatus = event.type == "read" ? .read : .delivered
                // Update all own messages that were created before the read/delivered timestamp
                for i in self.messages.indices.reversed() {
                    guard self.messages[i].isMe else { continue }
                    guard self.messages[i].deliveryStatus.rawValue != Message.DeliveryStatus.read.rawValue else { continue }
                    if self.messages[i].createdAt <= event.updatedAt {
                        // Only upgrade status (sent -> delivered -> read), never downgrade
                        let current = self.messages[i].deliveryStatus
                        if newStatus == .read || (newStatus == .delivered && current != .read) {
                            self.messages[i].deliveryStatus = newStatus
                        }
                    }
                }
            }
            .store(in: &cancellables)

        // View-once consumed
        socketManager.messageConsumed
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == event.messageId }) {
                    self.messages[idx].viewOnceCount = event.viewOnceCount
                    if event.isFullyConsumed {
                        self.evictViewOnceMedia(message: self.messages[idx])
                        self.markMessageAsConsumed(messageId: event.messageId)
                    }
                }
            }
            .store(in: &cancellables)

        // Translation received
        socketManager.translationReceived
            .filter { [weak self] event in
                self?.messages.contains { $0.id == event.messageId } ?? false
            }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let msgId = event.messageId
                let newTranslations = event.translations.map { t in
                    MessageTranslation(
                        id: t.id,
                        messageId: t.messageId,
                        sourceLanguage: t.sourceLanguage,
                        targetLanguage: t.targetLanguage,
                        translatedContent: t.translatedContent,
                        translationModel: t.translationModel,
                        confidenceScore: t.confidenceScore
                    )
                }
                var existing = self.messageTranslations[msgId] ?? []
                for translation in newTranslations {
                    if let idx = existing.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) {
                        existing[idx] = translation
                    } else {
                        existing.append(translation)
                    }
                }
                self.messageTranslations[msgId] = existing
            }
            .store(in: &cancellables)

        // Transcription ready
        socketManager.transcriptionReady
            .filter { $0.conversationId == convId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let segments = (event.transcription.segments ?? []).map { s in
                    MessageTranscriptionSegment(
                        text: s.text,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        speakerId: s.speakerId
                    )
                }
                self.messageTranscriptions[event.messageId] = MessageTranscription(
                    attachmentId: event.attachmentId,
                    text: event.transcription.text,
                    language: event.transcription.language,
                    confidence: event.transcription.confidence,
                    durationMs: event.transcription.durationMs,
                    segments: segments,
                    speakerCount: event.transcription.speakerCount
                )
            }
            .store(in: &cancellables)

        // Audio translation (all 3 events use same handler)
        let audioHandler: (AudioTranslationEvent) -> Void = { [weak self] event in
            guard let self else { return }
            guard event.conversationId == convId else { return }
            let msgId = event.messageId
            let segments = (event.translatedAudio.segments ?? []).map { s in
                MessageTranscriptionSegment(
                    text: s.text,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    speakerId: s.speakerId
                )
            }
            let audio = MessageTranslatedAudio(
                id: event.translatedAudio.id,
                attachmentId: event.attachmentId,
                targetLanguage: event.translatedAudio.targetLanguage,
                url: event.translatedAudio.url,
                transcription: event.translatedAudio.transcription,
                durationMs: event.translatedAudio.durationMs,
                format: event.translatedAudio.format,
                cloned: event.translatedAudio.cloned,
                quality: event.translatedAudio.quality,
                ttsModel: event.translatedAudio.ttsModel,
                segments: segments
            )
            var existing = self.messageTranslatedAudios[msgId] ?? []
            if let idx = existing.firstIndex(where: { $0.targetLanguage == audio.targetLanguage }) {
                existing[idx] = audio
            } else {
                existing.append(audio)
            }
            self.messageTranslatedAudios[msgId] = existing
        }

        socketManager.audioTranslationReady
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
            .store(in: &cancellables)

        socketManager.audioTranslationProgressive
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
            .store(in: &cancellables)

        socketManager.audioTranslationCompleted
            .receive(on: DispatchQueue.main)
            .sink(receiveValue: audioHandler)
            .store(in: &cancellables)
    }

    // MARK: - Reconnection Sync

    private func subscribeToReconnect() {
        MessageSocketManager.shared.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                Task { [weak self] in
                    await self?.syncMissedMessages()
                }
            }
            .store(in: &cancellables)
    }

    private func syncMissedMessages() async {
        guard !messages.isEmpty else { return }
        guard let lastMessage = messages.last else { return }

        do {
            let response = try await MessageService.shared.list(
                conversationId: conversationId, offset: 0, limit: 50, includeReplies: true
            )

            let userId = currentUserId
            let fetchedMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)

            let existingIds = Set(messages.map(\.id))
            let newMessages = fetchedMessages.filter { !existingIds.contains($0.id) }
                .filter { $0.createdAt > lastMessage.createdAt }

            if !newMessages.isEmpty {
                messages.append(contentsOf: newMessages)
                messages.sort { $0.createdAt < $1.createdAt }
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
            let response = try await MessageService.shared.search(
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
            let response = try await MessageService.shared.searchWithCursor(
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
            let response = try await MessageService.shared.listAround(
                conversationId: conversationId, around: messageId, limit: limit, includeReplies: true
            )

            let userId = currentUserId
            messages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? response.pagination?.hasMore ?? false
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
                let response = try await MessageService.shared.listAround(
                    conversationId: conversationId, around: lastMsg.id, limit: limit, includeReplies: true
                )

                let userId = currentUserId
                let newMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
                extractAttachmentTranscriptions(from: response.data)
                extractTextTranslations(from: response.data)
                let existingIds = Set(messages.map(\.id))
                let genuinelyNew = newMessages.filter { !existingIds.contains($0.id) }

                if !genuinelyNew.isEmpty {
                    messages.append(contentsOf: genuinelyNew)
                    messages.sort { $0.createdAt < $1.createdAt }
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

    func preferredTranslation(for messageId: String) -> MessageTranslation? {
        // Manual override from Language tab takes priority
        if let override = activeTranslationOverrides[messageId] {
            return override  // nil means user chose "original"
        }

        // Automatic resolution — mirrors gateway resolveUserLanguage() logic
        guard let translations = messageTranslations[messageId], !translations.isEmpty else { return nil }
        let user = AuthManager.shared.currentUser

        // Build priority list respecting boolean preferences (same as packages/shared resolveUserLanguage)
        var preferred: [String] = []

        if user?.useCustomDestination == true, let custom = user?.customDestinationLanguage {
            preferred.append(custom)
        }
        if user?.translateToSystemLanguage == true, let sys = user?.systemLanguage {
            preferred.append(sys)
        }
        if user?.translateToRegionalLanguage == true, let reg = user?.regionalLanguage {
            preferred.append(reg)
        }
        // Fallback: systemLanguage (unconditional), then device locale
        if let sys = user?.systemLanguage, !preferred.contains(where: { $0.lowercased() == sys.lowercased() }) {
            preferred.append(sys)
        }
        if let deviceLang = Locale.current.language.languageCode?.identifier,
           !preferred.contains(where: { $0.lowercased() == deviceLang.lowercased() }) {
            preferred.append(deviceLang)
        }

        for lang in preferred {
            if let match = translations.first(where: { $0.targetLanguage.lowercased() == lang.lowercased() }) {
                return match
            }
        }
        return translations.first
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
}
