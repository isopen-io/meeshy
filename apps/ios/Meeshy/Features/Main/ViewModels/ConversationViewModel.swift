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

    @Published var messages: [Message] = [] {
        didSet {
            _messageIdIndex = nil
            _topActiveMembers = nil
            _mediaSenderInfoMap = nil
            _allVisualAttachments = nil
            _mediaCaptionMap = nil
            _allAudioItems = nil
            _replyCountMap = nil
        }
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
    @Published var messageTranslations: [String: [MessageTranslation]] = [:]
    @Published var messageTranscriptions: [String: MessageTranscription] = [:]
    @Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:]

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
                    if let translations = messageTranslations[msg.id],
                       let best = translations.first {
                        map[att.id] = best.translatedContent
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
    private let isDirect: Bool
    private let participantUserId: String?
    private let initialUnreadCount: Int
    private let limit = 50
    private var nextMessageCursor: String?
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Top Active Members (cached)

    private var _topActiveMembers: [ConversationActiveMember]?

    func topActiveMembersList(accentColor: String) -> [ConversationActiveMember] {
        if let cached = _topActiveMembers { return cached }
        var counts: [String: (name: String, color: String, avatarURL: String?, count: Int)] = [:]
        for msg in messages where !msg.isMe {
            guard let id = msg.senderId else { continue }
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

    init(conversationId: String, unreadCount: Int = 0, isDirect: Bool = false, participantUserId: String? = nil) {
        self.conversationId = conversationId
        self.initialUnreadCount = unreadCount
        self.isDirect = isDirect
        self.participantUserId = participantUserId
        let handler = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: AuthManager.shared.currentUser?.id ?? ""
        )
        handler.delegate = self
        self.socketHandler = handler
    }

    deinit {
        // socketHandler deinit handles room leave & typing cleanup
        socketHandler = nil
    }

    // MARK: - Typing Emission (delegated to socketHandler)

    func onTextChanged(_ text: String) {
        socketHandler?.onTextChanged(text)
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
            var loadedMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
            await decryptMessagesIfNeeded(&loadedMessages)
            messages = loadedMessages
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
                var olderMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
                await decryptMessagesIfNeeded(&olderMessages)
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

    // MARK: - Decryption

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        guard isDirect else { return }

        await withTaskGroup(of: (Int, String?).self) { group in
            for i in 0..<msgs.count {
                let msg = msgs[i]
                if msg.isEncrypted, let senderId = msg.senderId, let base64content = msg.content, let data = Data(base64Encoded: base64content) {
                    group.addTask {
                        do {
                            let decrypted = try await SessionManager.shared.decryptMessage(data, from: senderId, conversationId: msg.conversationId)
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

    @discardableResult
    func sendMessage(content: String, replyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, expiresAt: Date? = nil, isViewOnce: Bool? = nil, maxViewOnceCount: Int? = nil, isBlurred: Bool? = nil) async -> Bool {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !(attachmentIds ?? []).isEmpty else { return false }

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
        let optimisticMessage = Message(
            id: tempId,
            conversationId: conversationId,
            senderId: currentUserId,
            content: text,
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
                originalLanguage: nil,
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
            let responseData = try await MessageService.shared.send(
                conversationId: conversationId, request: body
            )

            // Replace temp message with server version
            if let idx = messageIndex(for: tempId) {
                messages[idx] = Message(
                    id: responseData.id,
                    conversationId: conversationId,
                    senderId: currentUserId,
                    content: text,
                    replyToId: replyToId,
                    expiresAt: resolvedExpiresAt,
                    isViewOnce: resolvedIsViewOnce,
                    maxViewOnceCount: resolvedMaxViewOnceCount,
                    viewOnceCount: 0,
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
        if let idx = messageIndex(for: messageId) {
            messages[idx].isDeleted = true
            messages[idx].content = ""
        }

        do {
            try await MessageService.shared.delete(conversationId: conversationId, messageId: messageId)
        } catch {
            // Revert on failure
            if let idx = messageIndex(for: messageId) {
                messages[idx].isDeleted = false
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
                    await MediaCacheManager.shared.remove(for: resolved)
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
            _ = try await MessageService.shared.edit(messageId: messageId, content: trimmed)
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


    // MARK: - Reconnection Sync (called by ConversationSocketHandler)

    func syncMissedMessages() async {
        guard !messages.isEmpty else { return }
        guard let lastMessage = messages.last else { return }

        do {
            let response = try await MessageService.shared.list(
                conversationId: conversationId, offset: 0, limit: 50, includeReplies: true
            )

            let userId = currentUserId
            var fetchedMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
            await decryptMessagesIfNeeded(&fetchedMessages)
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)

            let existingIds = Set(messages.map(\.id))
            let newMessages = fetchedMessages.filter { !existingIds.contains($0.id) }
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
            var fetchedMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
            await decryptMessagesIfNeeded(&fetchedMessages)
            messages = fetchedMessages
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
                var newMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
                await decryptMessagesIfNeeded(&newMessages)
                extractAttachmentTranscriptions(from: response.data)
                extractTextTranslations(from: response.data)
                let existingIds = Set(messages.map(\.id))
                let genuinelyNew = newMessages.filter { !existingIds.contains($0.id) }

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

extension ConversationViewModel: ConversationSocketDelegate {}
