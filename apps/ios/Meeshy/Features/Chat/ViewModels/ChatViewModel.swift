//
//  ChatViewModel.swift
//  Meeshy
//
//  Chat screen view model with real-time messaging
//  UPDATED: Production-ready infinite scroll with proper pagination
//  iOS 16+
//
//  FEATURES:
//  - Proper infinite scroll with prefetching for messages
//  - Loading states: idle, loading, loadingMore, error
//  - Deduplication by message ID
//  - Optimistic updates for sent messages
//  - Real-time WebSocket integration
//  - In-memory message caching
//

import Foundation
import Combine

// MARK: - Sendable Wrapper for WebSocket Data

/// Wrapper to safely pass non-Sendable dictionary across actor boundaries
private struct SendableDict: @unchecked Sendable {
    let value: [String: Any]
}

// MARK: - Message Loading State

enum MessageLoadingState: Equatable {
    case idle
    case loading          // Initial load
    case loadingMore      // Loading older messages
    case sending          // Sending a message
    case error(String)

    var isLoading: Bool {
        switch self {
        case .loading, .loadingMore, .sending:
            return true
        default:
            return false
        }
    }
}

// MARK: - Chat ViewModel

@MainActor
final class ChatViewModel: ObservableObject {

    // MARK: - Published Properties

    /// All messages (sorted by createdAt, newest first for display)
    @Published private(set) var messages: [Message] = []

    /// Current loading state
    @Published private(set) var loadingState: MessageLoadingState = .idle

    /// Whether there are more older messages to load
    @Published private(set) var hasMoreMessages: Bool = true

    /// Typing indicator users
    @Published private(set) var typingUsers: Set<String> = []

    /// Error message (for UI display)
    @Published var errorMessage: String?

    // MARK: - Convenience Computed Properties

    var isLoading: Bool { loadingState == .loading }
    var isLoadingMore: Bool { loadingState == .loadingMore }
    var isSending: Bool { loadingState == .sending }

    // MARK: - Properties

    let conversationId: String

    private let apiService: APIService
    private let webSocketService: WebSocketService
    private var cancellables = Set<AnyCancellable>()

    // Pagination state
    private var currentPage: Int = 1
    private let pageSize: Int = 50
    private let prefetchThreshold: Int = 10

    // Typing indicator
    private var typingTimer: Timer?

    // Cache key for messages
    private var cacheKey: String { "messages_\(conversationId)" }

    // MARK: - Initialization

    init(
        conversationId: String,
        apiService: APIService = .shared,
        webSocketService: WebSocketService = .shared
    ) {
        self.conversationId = conversationId
        self.apiService = apiService
        self.webSocketService = webSocketService

        setupWebSocketListeners()
    }

    // MARK: - Public API: Message Loading

    /// Load initial messages
    /// Call this when chat view appears
    func loadMessages() async {
        guard loadingState != .loading else {
            chatLogger.debug("ChatVM: Already loading messages, skipping")
            return
        }

        chatLogger.info("ChatVM: Loading messages for \(conversationId)")
        loadingState = .loading
        errorMessage = nil
        currentPage = 1

        // Check cache first
        let cachedMessages = await AppCache.messages.getItems(forKey: cacheKey)
        if !cachedMessages.isEmpty {
            self.messages = cachedMessages.sorted { $0.createdAt > $1.createdAt }
            let metadata = await AppCache.messages.getMetadata(forKey: cacheKey)
            self.hasMoreMessages = metadata?.hasMore ?? true
            loadingState = .idle

            chatLogger.info("ChatVM: Loaded \(cachedMessages.count) cached messages")

            // Refresh in background
            Task {
                await refreshMessagesInBackground()
            }
            return
        }

        // Fetch from network
        await fetchMessagesFromNetwork(isInitial: true)
    }

    /// Load more (older) messages
    /// Call this when scrolling to load older messages
    func loadMoreMessages() async {
        guard loadingState == .idle && hasMoreMessages else {
            chatLogger.debug("ChatVM: Cannot load more (state: \(loadingState), hasMore: \(hasMoreMessages))")
            return
        }

        chatLogger.info("ChatVM: Loading more messages (page \(currentPage + 1))")
        loadingState = .loadingMore

        await fetchMessagesFromNetwork(isInitial: false)
    }

    /// Check if should prefetch based on message position
    /// Call this in onAppear for message rows
    func onMessageAppear(_ message: Message) async {
        // For messages, we load older ones when near the END of the list (oldest messages)
        guard let index = messages.firstIndex(where: { $0.id == message.id }) else {
            return
        }

        // Messages are sorted newest first, so end of array = oldest
        let distanceFromEnd = messages.count - index - 1

        if distanceFromEnd <= prefetchThreshold && hasMoreMessages && loadingState == .idle {
            chatLogger.debug("ChatVM: Prefetch triggered at index \(index)")
            await loadMoreMessages()
        }
    }

    /// Refresh messages (pull-to-refresh equivalent)
    func refreshMessages() async {
        chatLogger.info("ChatVM: Refreshing messages")
        currentPage = 1
        await fetchMessagesFromNetwork(isInitial: true)
    }

    // MARK: - Private: Network Fetch

    private func fetchMessagesFromNetwork(isInitial: Bool) async {
        do {
            let nextPage = isInitial ? 1 : currentPage + 1
            let response = try await apiService.fetchMessages(
                conversationId: conversationId,
                page: nextPage,
                limit: pageSize
            )

            let fetchedMessages = response.messages
            let hasMore = fetchedMessages.count >= pageSize

            if isInitial {
                // Replace all messages
                self.messages = fetchedMessages.sorted { $0.createdAt > $1.createdAt }

                // Update cache
                await AppCache.messages.setInitialPage(
                    key: cacheKey,
                    items: fetchedMessages,
                    hasMore: hasMore
                )
            } else {
                // Deduplicate and append older messages
                let existingIds = Set(messages.map { $0.id })
                let newMessages = fetchedMessages.filter { !existingIds.contains($0.id) }

                messages.append(contentsOf: newMessages)
                messages.sort { $0.createdAt > $1.createdAt }

                // Update cache
                await AppCache.messages.appendPage(
                    key: cacheKey,
                    items: newMessages,
                    hasMore: hasMore
                )
            }

            self.hasMoreMessages = hasMore
            self.currentPage = nextPage
            self.loadingState = .idle

            chatLogger.info("ChatVM: Fetched \(fetchedMessages.count) messages, total: \(messages.count), hasMore: \(hasMore)")

        } catch {
            chatLogger.error("ChatVM: Failed to fetch messages: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
            loadingState = .error(error.localizedDescription)
        }
    }

    private func refreshMessagesInBackground() async {
        do {
            let response = try await apiService.fetchMessages(
                conversationId: conversationId,
                page: 1,
                limit: pageSize
            )

            // Merge with existing messages
            let existingIds = Set(messages.map { $0.id })
            let newMessages = response.messages.filter { !existingIds.contains($0.id) }

            if !newMessages.isEmpty {
                messages.insert(contentsOf: newMessages, at: 0)
                messages.sort { $0.createdAt > $1.createdAt }

                chatLogger.info("ChatVM: Background refresh added \(newMessages.count) new messages")
            }

        } catch {
            chatLogger.error("ChatVM: Background refresh failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Public API: Send Message

    /// Send a message with optional detected language and sentiment
    /// - Parameters:
    ///   - content: Message text content
    ///   - type: Message content type (default: .text)
    ///   - attachmentIds: Array of attachment IDs (optional)
    ///   - replyToId: ID of message being replied to (optional)
    ///   - detectedLanguage: Language code detected from user input (e.g., "fr", "en")
    ///   - sentiment: Sentiment category of the message (optional)
    func sendMessage(
        content: String,
        type: MessageContentType = .text,
        attachmentIds: [String]? = nil,
        replyToId: String? = nil,
        detectedLanguage: String? = nil,
        sentiment: SentimentCategory? = nil
    ) async {
        guard !content.isEmpty || attachmentIds?.isEmpty == false else { return }

        loadingState = .sending

        // Use detected language or fall back to French (app default)
        let messageLanguage = detectedLanguage ?? "fr"

        // Log the message being sent with language and sentiment
        chatLogger.info("ChatVM: Sending message", [
            "conversationId": conversationId,
            "detectedLanguage": messageLanguage,
            "sentiment": sentiment?.rawValue ?? "unknown",
            "hasAttachments": attachmentIds?.isEmpty == false,
            "isReply": replyToId != nil
        ])

        // Create optimistic message
        let localId = UUID()
        let optimisticMessage = Message(
            id: localId.uuidString,
            conversationId: conversationId,
            senderId: AuthenticationManager.shared.currentUser?.id ?? "",
            anonymousSenderId: nil,
            content: content,
            originalLanguage: messageLanguage,
            messageType: type,
            isEdited: false,
            editedAt: nil,
            isDeleted: false,
            deletedAt: nil,
            replyToId: replyToId,
            validatedMentions: [],
            createdAt: Date(),
            updatedAt: Date(),
            sender: nil,
            attachments: nil,
            reactions: nil,
            mentions: nil,
            status: nil,
            localId: localId,
            isSending: true,
            sendError: nil
        )

        // Add optimistically (at the beginning since sorted newest first)
        messages.insert(optimisticMessage, at: 0)

        // Prepare request
        let request = MessageSendRequest(
            conversationId: conversationId,
            content: content,
            messageType: type,
            originalLanguage: messageLanguage,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            localId: localId.uuidString
        )

        do {
            let sentMessage = try await apiService.sendMessage(request)

            // Replace optimistic message with server response
            if let index = messages.firstIndex(where: { $0.id == localId.uuidString }) {
                messages[index] = sentMessage
            }

            // Update cache
            await AppCache.messages.prependItems(key: cacheKey, items: [sentMessage])

            chatLogger.info("Message sent successfully: \(sentMessage.id)")
            loadingState = .idle

        } catch {
            // Mark optimistic message as failed
            if let index = messages.firstIndex(where: { $0.id == localId.uuidString }) {
                var failedMessage = messages[index]
                failedMessage.isSending = false
                failedMessage.sendError = error.localizedDescription
                messages[index] = failedMessage
            }

            chatLogger.error("Failed to send message: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
            loadingState = .idle
        }
    }

    /// Retry sending a failed message
    func retrySendMessage(_ messageId: String) async {
        guard let index = messages.firstIndex(where: { $0.id == messageId }),
              let _ = messages[index].sendError else {
            return
        }

        let failedMessage = messages[index]

        // Remove the failed message
        messages.remove(at: index)

        // Resend
        await sendMessage(
            content: failedMessage.content,
            type: failedMessage.messageType,
            attachmentIds: failedMessage.attachments?.map { $0.id },
            replyToId: failedMessage.replyToId
        )
    }

    // MARK: - Public API: Edit Message

    func editMessage(messageId: String, newContent: String) async {
        guard let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

        // Store original content for rollback
        let originalContent = messages[index].content
        let wasEdited = messages[index].isEdited
        let originalEditedAt = messages[index].editedAt

        // Optimistic update
        messages[index].content = newContent
        messages[index].isEdited = true
        messages[index].editedAt = Date()

        do {
            let editedMessage = try await apiService.editMessage(messageId: messageId, content: newContent)

            // MEMORY FIX: Find by ID again since array may have changed during await
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                messages[newIndex] = editedMessage
            }

            await AppCache.messages.updateItem(editedMessage)

            chatLogger.info("Message edited successfully: \(messageId)")

        } catch {
            // MEMORY FIX: Find by ID again for rollback since array may have changed
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                messages[newIndex].content = originalContent
                messages[newIndex].isEdited = wasEdited
                messages[newIndex].editedAt = originalEditedAt
            }

            chatLogger.error("Failed to edit message: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Public API: Delete Message

    func deleteMessage(messageId: String) async {
        guard let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

        // Store for potential revert
        let deletedMessage = messages[index]

        // Optimistic removal
        messages.remove(at: index)

        do {
            try await apiService.deleteMessage(messageId: messageId)
            await AppCache.messages.removeItem(messageId)

            chatLogger.info("Message deleted successfully: \(messageId)")

        } catch {
            // Revert on failure
            messages.insert(deletedMessage, at: min(index, messages.count))
            messages.sort { $0.createdAt > $1.createdAt }

            chatLogger.error("Failed to delete message: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Public API: Reactions

    func addReaction(to messageId: String, emoji: String) async {
        guard let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

        // Store original for rollback
        let originalReactions = messages[index].reactions

        // Optimistic update with temp ID
        let tempReaction = Reaction(
            id: "temp_\(UUID().uuidString)",
            messageId: messageId,
            userId: AuthenticationManager.shared.currentUser?.id,
            anonymousUserId: nil,
            emoji: emoji,
            createdAt: Date(),
            updatedAt: Date()
        )
        var reactions = messages[index].reactions ?? []
        reactions.append(tempReaction)
        messages[index].reactions = reactions

        // Call the API to add reaction
        do {
            let newReaction = try await apiService.addReaction(messageId: messageId, emoji: emoji)

            // Update optimistic reaction with server-assigned ID
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                // Replace temp reaction with actual reaction from server
                messages[newIndex].reactions?.removeAll { $0.id == tempReaction.id }
                messages[newIndex].reactions?.append(newReaction)
                await AppCache.messages.updateItem(messages[newIndex])
            }
            chatLogger.info("Added reaction to message: \(messageId), emoji: \(emoji), reactionId: \(newReaction.id)")
        } catch {
            // Rollback on failure - find by ID again
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                messages[newIndex].reactions = originalReactions
            }
            chatLogger.error("Failed to add reaction: \(error.localizedDescription)")
        }
    }

    func removeReaction(from messageId: String, emoji: String) async {
        guard let index = messages.firstIndex(where: { $0.id == messageId }) else { return }

        let currentUserId = AuthenticationManager.shared.currentUser?.id

        // FIX: Find the reaction ID to remove (API requires reactionId, not messageId+emoji)
        guard let reactionToRemove = messages[index].reactions?.first(where: {
            $0.emoji == emoji && $0.userId == currentUserId
        }) else {
            chatLogger.warn("Reaction not found to remove: \(messageId), emoji: \(emoji)")
            return
        }

        let reactionId = reactionToRemove.id

        // Store original for rollback
        let originalReactions = messages[index].reactions

        // Optimistic update
        messages[index].reactions?.removeAll { $0.id == reactionId }

        // FIX: Call API with reactionId
        do {
            try await apiService.removeReaction(reactionId: reactionId)

            // Update cache - find by ID again
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                await AppCache.messages.updateItem(messages[newIndex])
            }
            chatLogger.info("Removed reaction from message: \(messageId), emoji: \(emoji), reactionId: \(reactionId)")
        } catch {
            // Rollback on failure - find by ID again
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                messages[newIndex].reactions = originalReactions
            }
            chatLogger.error("Failed to remove reaction: \(error.localizedDescription)")
        }
    }

    // MARK: - Public API: Mark as Read

    func markAsRead() {
        Task {
            do {
                try await apiService.markAsRead(conversationId: conversationId)
                chatLogger.debug("Marked conversation as read")
            } catch {
                chatLogger.error("Failed to mark as read: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Public API: Typing Indicator

    func startTyping() {
        webSocketService.startTyping(conversationId: conversationId)

        // Auto-stop typing after 3 seconds
        typingTimer?.invalidate()
        typingTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self] _ in
            self?.stopTyping()
        }
    }

    func stopTyping() {
        webSocketService.stopTyping(conversationId: conversationId)
        typingTimer?.invalidate()
        typingTimer = nil
    }

    // MARK: - Private: WebSocket Listeners

    /// Unique subscriber ID for this ViewModel instance
    private lazy var subscriberId: String = "ChatViewModel_\(conversationId)"

    private func setupWebSocketListeners() {
        let convId = conversationId
        let cacheKeyLocal = cacheKey

        // New message received
        webSocketService.on(EnvironmentConfig.SocketEvent.messageNew, subscriberId: subscriberId) { [weak self] data in
            guard let messageData = data as? [String: Any],
                  let messageConversationId = messageData["conversationId"] as? String,
                  messageConversationId == convId else { return }

            let wrapper = SendableDict(value: messageData)
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                if let message = self.parseMessage(from: wrapper.value) {
                    // Check if message already exists (avoid duplicates)
                    if !self.messages.contains(where: { $0.id == message.id }) {
                        self.messages.insert(message, at: 0)

                        // Update cache
                        await AppCache.messages.prependItems(key: cacheKeyLocal, items: [message])

                        chatLogger.debug("Received new message via WebSocket: \(message.id)")
                    }
                }
            }
        }

        // Message updated (edited)
        webSocketService.on(EnvironmentConfig.SocketEvent.messageEdited, subscriberId: subscriberId) { [weak self] data in
            guard let messageData = data as? [String: Any] else { return }

            let wrapper = SendableDict(value: messageData)
            Task { @MainActor [weak self] in
                guard let self = self,
                      let message = self.parseMessage(from: wrapper.value) else { return }
                if let index = self.messages.firstIndex(where: { $0.id == message.id }) {
                    self.messages[index] = message
                    await AppCache.messages.updateItem(message)
                    chatLogger.debug("Message updated via WebSocket: \(message.id)")
                }
            }
        }

        // Message deleted
        webSocketService.on(EnvironmentConfig.SocketEvent.messageDeleted, subscriberId: subscriberId) { [weak self] data in
            guard let deleteData = data as? [String: Any],
                  let messageId = deleteData["messageId"] as? String else { return }

            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.messages.removeAll { $0.id == messageId }
                await AppCache.messages.removeItem(messageId)
                chatLogger.debug("Message deleted via WebSocket: \(messageId)")
            }
        }

        // Typing start (aligned with backend: typing:start)
        webSocketService.on(EnvironmentConfig.SocketEvent.typingStart, subscriberId: subscriberId) { [weak self] data in
            guard let typingData = data as? [String: Any],
                  let typingConversationId = typingData["conversationId"] as? String,
                  typingConversationId == convId,
                  let userId = typingData["userId"] as? String else { return }

            Task { @MainActor [weak self] in
                self?.typingUsers.insert(userId)
            }
        }

        // Typing stop (aligned with backend: typing:stop)
        webSocketService.on(EnvironmentConfig.SocketEvent.typingStop, subscriberId: subscriberId) { [weak self] data in
            guard let typingData = data as? [String: Any],
                  let typingConversationId = typingData["conversationId"] as? String,
                  typingConversationId == convId,
                  let userId = typingData["userId"] as? String else { return }

            Task { @MainActor [weak self] in
                self?.typingUsers.remove(userId)
            }
        }

        // Reaction added
        webSocketService.on(EnvironmentConfig.SocketEvent.reactionAdded, subscriberId: subscriberId) { [weak self] data in
            guard let reactionData = data as? [String: Any],
                  let messageId = reactionData["messageId"] as? String else { return }

            Task { @MainActor [weak self] in
                guard self != nil else { return }
                chatLogger.debug("Reaction added via WebSocket: \(messageId)")
                // Could refresh the specific message to get updated reactions
            }
        }

        // Reaction removed
        webSocketService.on(EnvironmentConfig.SocketEvent.reactionRemoved, subscriberId: subscriberId) { [weak self] data in
            guard let reactionData = data as? [String: Any],
                  let messageId = reactionData["messageId"] as? String else { return }

            Task { @MainActor [weak self] in
                guard self != nil else { return }
                chatLogger.debug("Reaction removed via WebSocket: \(messageId)")
            }
        }
    }

    // MARK: - Private: Helpers

    private func parseMessage(from data: [String: Any]) -> Message? {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let message = try decoder.decode(Message.self, from: jsonData)
            return message
        } catch {
            chatLogger.error("Failed to parse message from WebSocket: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Cleanup

    func cleanup() {
        stopTyping()
        typingTimer?.invalidate()
        typingTimer = nil

        // Unsubscribe this ViewModel from all WebSocket events (uses subscriber ID - won't affect other subscribers)
        webSocketService.offAll(subscriberId: subscriberId)
    }

    deinit {
        // Note: cleanup() should be called manually before deinit
        // since deinit cannot be async and cleanup involves MainActor
    }
}

// MARK: - Message Translation Support

extension ChatViewModel {
    func translateMessage(_ messageId: String) async {
        // Mock implementation - would call translation service
        chatLogger.info("Translating message: \(messageId)")
    }
}
