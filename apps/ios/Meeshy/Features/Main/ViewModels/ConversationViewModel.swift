import Foundation
import Combine
import MeeshySDK

// MARK: - Real-time Translation/Transcription/Audio Types

struct MessageTranslation: Identifiable {
    let id: String
    let messageId: String
    let sourceLanguage: String
    let targetLanguage: String
    let translatedContent: String
    let translationModel: String
    let confidenceScore: Double?
}

struct MessageTranscriptionSegment: Identifiable {
    let id = UUID()
    let text: String
    let startTime: Double?
    let endTime: Double?
    let speakerId: String?
}

struct MessageTranscription {
    let attachmentId: String
    let text: String
    let language: String
    let confidence: Double?
    let durationMs: Int?
    let segments: [MessageTranscriptionSegment]
    let speakerCount: Int?
}

struct MessageTranslatedAudio: Identifiable {
    let id: String
    let attachmentId: String
    let targetLanguage: String
    let url: String
    let transcription: String
    let durationMs: Int
    let format: String
    let cloned: Bool
    let quality: Double
    let ttsModel: String
    let segments: [MessageTranscriptionSegment]
}

@MainActor
class ConversationViewModel: ObservableObject {

    // MARK: - Published State

    @Published var messages: [Message] = []
    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var hasOlderMessages = true
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

    /// Last unread message from another user (set only via socket, cleared on scroll-to-bottom)
    @Published var lastUnreadMessage: Message?

    /// ID of the first unread message (set once after initial load, cleared on scroll to bottom)
    @Published var firstUnreadMessageId: String?

    /// True during programmatic scrolls (initial load, send, scroll-to-bottom tap)
    /// When true, onAppear prefetch triggers are suppressed.
    @Published var isProgrammaticScroll = false

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

    // MARK: - Private

    let conversationId: String
    private let initialUnreadCount: Int
    private let limit = 50
    private var nextMessageCursor: String?
    private var cancellables = Set<AnyCancellable>()

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

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
        joinRoom()
    }

    deinit {
        leaveRoom()
        // Direct cleanup — can't call @MainActor methods from deinit
        typingTimer?.invalidate()
        if isEmittingTyping {
            MessageSocketManager.shared.emitTypingStop(conversationId: conversationId)
        }
        typingSafetyTimers.values.forEach { $0.invalidate() }
    }

    // MARK: - Room Management

    private func joinRoom() {
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

        do {
            let response: MessagesAPIResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages",
                queryItems: [
                    URLQueryItem(name: "limit", value: "\(limit)"),
                    URLQueryItem(name: "offset", value: "0"),
                    URLQueryItem(name: "include_replies", value: "true"),
                ]
            )

            let userId = currentUserId
            // API returns newest first, reverse to oldest-first for display
            messages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
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
        } catch {
            self.error = error.localizedDescription
        }

        isLoadingInitial = false
    }

    // MARK: - Load Older Messages (infinite scroll)

    func loadOlderMessages() async {
        guard hasOlderMessages, !isLoadingOlder else { return }
        guard let oldestId = messages.first?.id else { return }

        isLoadingOlder = true
        // Save anchor BEFORE prepend so the view can restore scroll position
        scrollAnchorId = oldestId

        let beforeValue = nextMessageCursor ?? oldestId

        do {
            let response: MessagesAPIResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages",
                queryItems: [
                    URLQueryItem(name: "limit", value: "\(limit)"),
                    URLQueryItem(name: "before", value: beforeValue),
                    URLQueryItem(name: "include_replies", value: "true"),
                ]
            )

            let userId = currentUserId
            let olderMessages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }

            // Dedup and prepend
            let existingIds = Set(messages.map(\.id))
            let newMessages = olderMessages.filter { !existingIds.contains($0.id) }
            messages.insert(contentsOf: newMessages, at: 0)

            self.nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? response.pagination?.hasMore ?? false
        } catch {
            self.error = error.localizedDescription
        }

        isLoadingOlder = false
    }

    // MARK: - Send Message

    func sendMessage(content: String, replyToId: String? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil) async {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !(attachmentIds ?? []).isEmpty else { return }

        // Stop typing emission on send
        stopTypingEmission()

        isSending = true

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
            createdAt: Date(),
            updatedAt: Date(),
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
                attachmentIds: attachmentIds
            )
            let response: APIResponse<SendMessageResponseData> = try await APIClient.shared.post(
                endpoint: "/conversations/\(conversationId)/messages",
                body: body
            )

            // Replace temp message with server version
            if let idx = messages.firstIndex(where: { $0.id == tempId }) {
                messages[idx] = Message(
                    id: response.data.id,
                    conversationId: conversationId,
                    senderId: currentUserId,
                    content: text,
                    replyToId: replyToId,
                    createdAt: response.data.createdAt,
                    updatedAt: response.data.createdAt,
                    deliveryStatus: .sent,
                    isMe: true
                )
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
                let encoded = emoji.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? emoji
                let _: APIResponse<[String: String]>? = try? await APIClient.shared.request(
                    endpoint: "/reactions/\(messageId)/\(encoded)",
                    method: "DELETE"
                )
            }
        } else {
            // Optimistic add
            let reaction = Reaction(messageId: messageId, userId: userId, emoji: emoji)
            messages[idx].reactions.append(reaction)
            // API call
            Task {
                struct AddReactionBody: Encodable {
                    let messageId: String
                    let emoji: String
                }
                let _: APIResponse<[String: String]>? = try? await APIClient.shared.post(
                    endpoint: "/reactions",
                    body: AddReactionBody(messageId: messageId, emoji: emoji)
                )
            }
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
            let _: APIResponse<[String: Bool]> = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages/\(messageId)",
                method: "DELETE"
            )
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
                let _: APIResponse<[String: Bool]> = try await APIClient.shared.request(
                    endpoint: "/conversations/\(conversationId)/messages/\(messageId)/pin",
                    method: "DELETE"
                )
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
                let _: APIResponse<[String: String]> = try await APIClient.shared.request(
                    endpoint: "/conversations/\(conversationId)/messages/\(messageId)/pin",
                    method: "PUT"
                )
            } catch {
                // Revert
                messages[idx].pinnedAt = nil
                messages[idx].pinnedBy = nil
                self.error = error.localizedDescription
            }
        }
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
            struct EditBody: Encodable { let content: String }
            let _: APIResponse<[String: String]> = try await APIClient.shared.put(
                endpoint: "/messages/\(messageId)",
                body: EditBody(content: trimmed)
            )
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

    // MARK: - Mark as Read

    func markAsRead() {
        Task {
            let _: APIResponse<[String: String]>? = try? await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/mark-as-read",
                method: "POST"
            )
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
                // Reset safety timer (even if already in list — they're still typing)
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
                        // Only upgrade status (sent → delivered → read), never downgrade
                        let current = self.messages[i].deliveryStatus
                        if newStatus == .read || (newStatus == .delivered && current != .read) {
                            self.messages[i].deliveryStatus = newStatus
                        }
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
            let response: MessagesAPIResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages",
                queryItems: [
                    URLQueryItem(name: "search", value: trimmed),
                    URLQueryItem(name: "limit", value: "20"),
                ]
            )

            let userId = currentUserId
            searchResults = response.data.map { apiMsg in
                let senderName = apiMsg.sender?.displayName ?? apiMsg.sender?.username ?? "?"
                let content = apiMsg.content ?? ""
                return SearchResultItem(
                    id: apiMsg.id,
                    conversationId: apiMsg.conversationId,
                    content: content,
                    matchedText: content,
                    matchType: "content",
                    senderName: senderName,
                    senderAvatar: apiMsg.sender?.avatar,
                    createdAt: apiMsg.createdAt
                )
            }
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
            let response: MessagesAPIResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages",
                queryItems: [
                    URLQueryItem(name: "search", value: query),
                    URLQueryItem(name: "limit", value: "20"),
                    URLQueryItem(name: "before", value: cursor),
                ]
            )

            let newResults = response.data.map { apiMsg in
                let senderName = apiMsg.sender?.displayName ?? apiMsg.sender?.username ?? "?"
                let content = apiMsg.content ?? ""
                return SearchResultItem(
                    id: apiMsg.id,
                    conversationId: apiMsg.conversationId,
                    content: content,
                    matchedText: content,
                    matchType: "content",
                    senderName: senderName,
                    senderAvatar: apiMsg.sender?.avatar,
                    createdAt: apiMsg.createdAt
                )
            }
            searchResults.append(contentsOf: newResults)
            searchNextCursor = response.cursorPagination?.nextCursor
            searchHasMore = response.cursorPagination?.hasMore ?? false
        } catch {
            // Ignore pagination errors
        }

        isSearching = false
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
            let response: MessagesAPIResponse = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages",
                queryItems: [
                    URLQueryItem(name: "around", value: messageId),
                    URLQueryItem(name: "limit", value: "\(limit)"),
                    URLQueryItem(name: "include_replies", value: "true"),
                ]
            )

            let userId = currentUserId
            messages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore ?? response.pagination?.hasMore ?? false
            isInJumpedState = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    func returnToLatest() async {
        guard isInJumpedState else { return }

        if let saved = savedMessages {
            messages = saved
            nextMessageCursor = savedCursor
            hasOlderMessages = savedHasOlder
        } else {
            // Reload from scratch
            isInJumpedState = false
            await loadMessages()
            return
        }

        savedMessages = nil
        savedCursor = nil
        savedHasOlder = true
        isInJumpedState = false
    }
}
