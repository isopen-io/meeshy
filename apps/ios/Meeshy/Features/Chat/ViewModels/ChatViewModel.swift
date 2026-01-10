//
//  ChatViewModel.swift
//  Meeshy
//
//  ViewModel for chat with message loading, sending, and real-time updates
//  UPDATED: Uses offset/limit pagination pattern
//  iOS 16+
//

import Foundation
import SwiftUI
import Combine

// MARK: - Loading State

enum ChatLoadingState: Equatable {
    case idle
    case loading
    case loadingMore
    case sending
    case error(String)

    static func == (lhs: ChatLoadingState, rhs: ChatLoadingState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle), (.loading, .loading), (.loadingMore, .loadingMore), (.sending, .sending):
            return true
        case (.error(let a), .error(let b)):
            return a == b
        default:
            return false
        }
    }
}

// MARK: - Chat ViewModel

@MainActor
final class ChatViewModel: ObservableObject {

    // MARK: - Published Properties

    @Published var messages: [Message] = []
    @Published var loadingState: ChatLoadingState = .idle
    @Published var hasMoreMessages: Bool = true
    @Published var errorMessage: String?
    @Published var typingUsers: [String] = []
    @Published var lastReadMessageId: String?

    var isLoading: Bool { loadingState == .loading }
    var isLoadingMore: Bool { loadingState == .loadingMore }
    var isSending: Bool { loadingState == .sending }

    // MARK: - Properties

    let conversationId: String

    private let apiService: APIService
    private let webSocketService: WebSocketService
    private var cancellables = Set<AnyCancellable>()

    // Pagination state (offset-based)
    private var currentOffset: Int = 0
    private let limit: Int = 50
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
        currentOffset = 0

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

        chatLogger.info("ChatVM: Loading more messages (offset \(currentOffset + messages.count))")
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
        currentOffset = 0
        await fetchMessagesFromNetwork(isInitial: true)
    }

    // MARK: - Private: Network Fetch

    private func fetchMessagesFromNetwork(isInitial: Bool) async {
        do {
            let nextOffset = isInitial ? 0 : currentOffset + messages.count
            let response = try await apiService.fetchMessages(
                conversationId: conversationId,
                offset: nextOffset,
                limit: limit
            )

            let fetchedMessages = response.messages
            let hasMore = fetchedMessages.count >= limit

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
            self.currentOffset = nextOffset
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
                offset: 0,
                limit: limit
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
        sentiment: MessageSentiment? = nil
    ) async throws {
        guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || attachmentIds != nil else {
            chatLogger.warn("ChatVM: Cannot send empty message")
            return
        }

        chatLogger.info("ChatVM: Sending message (lang: \(detectedLanguage ?? "nil"), sentiment: \(sentiment?.rawValue ?? "nil"))")
        loadingState = .sending

        do {
            let request = MessageSendRequest(
                conversationId: conversationId,
                content: content,
                messageType: type,
                originalLanguage: detectedLanguage,
                attachmentIds: attachmentIds,
                replyToId: replyToId,
                localId: UUID().uuidString
            )

            let message = try await apiService.sendMessage(request)

            // Add to messages list
            messages.insert(message, at: 0)

            // Update cache
            await AppCache.messages.prependItems(key: cacheKey, items: [message])

            loadingState = .idle
            chatLogger.info("ChatVM: Message sent successfully: \(message.id)")

        } catch {
            chatLogger.error("ChatVM: Failed to send message: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
            loadingState = .error(error.localizedDescription)
            throw error
        }
    }

    // MARK: - Public API: Message Actions

    func editMessage(messageId: String, newContent: String) async throws {
        chatLogger.info("ChatVM: Editing message \(messageId)")

        let updatedMessage = try await apiService.editMessage(messageId: messageId, content: newContent)

        // Update in list
        if let index = messages.firstIndex(where: { $0.id == messageId }) {
            messages[index] = updatedMessage
        }

        chatLogger.info("ChatVM: Message edited successfully")
    }

    func deleteMessage(messageId: String) async throws {
        chatLogger.info("ChatVM: Deleting message \(messageId)")

        try await apiService.deleteMessage(messageId: messageId)

        // Remove from list
        messages.removeAll { $0.id == messageId }

        chatLogger.info("ChatVM: Message deleted successfully")
    }

    func addReaction(messageId: String, emoji: String) async throws {
        chatLogger.info("ChatVM: Adding reaction '\(emoji)' to message \(messageId)")

        let reaction = try await apiService.addReaction(messageId: messageId, emoji: emoji)

        // Update message in list
        if let index = messages.firstIndex(where: { $0.id == messageId }) {
            var updatedMessage = messages[index]
            var reactions = updatedMessage.reactions ?? []
            reactions.append(reaction)
            updatedMessage.reactions = reactions
            messages[index] = updatedMessage
        }

        chatLogger.info("ChatVM: Reaction added successfully")
    }

    func removeReaction(reactionId: String, fromMessageId messageId: String) async throws {
        chatLogger.info("ChatVM: Removing reaction \(reactionId) from message \(messageId)")

        try await apiService.removeReaction(reactionId: reactionId)

        // Update message in list
        if let index = messages.firstIndex(where: { $0.id == messageId }) {
            var updatedMessage = messages[index]
            var reactions = updatedMessage.reactions ?? []
            reactions.removeAll { $0.id == reactionId }
            updatedMessage.reactions = reactions
            messages[index] = updatedMessage
        }

        chatLogger.info("ChatVM: Reaction removed successfully")
    }

    // MARK: - Typing Indicator

    func startTyping() {
        webSocketService.startTyping(conversationId: conversationId)

        // Reset timer
        typingTimer?.invalidate()
        typingTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self] _ in
            self?.stopTyping()
        }
    }

    func stopTyping() {
        typingTimer?.invalidate()
        typingTimer = nil
        webSocketService.stopTyping(conversationId: conversationId)
    }

    // MARK: - Private: WebSocket Setup

    private func setupWebSocketListeners() {
        // TODO: Implement WebSocket event listeners using webSocketService.on() pattern
        // Example:
        // webSocketService.on(EnvironmentConfig.SocketEvent.newMessage) { [weak self] data in
        //     guard let self = self, let messageData = data.first as? [String: Any] else { return }
        //     // Parse and handle new message
        // }
        //
        // For now, messages are fetched via REST API and refreshed periodically
    }

    // MARK: - Cleanup

    deinit {
        typingTimer?.invalidate()
    }
}
