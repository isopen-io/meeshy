//
//  ModernChatViewModel.swift
//  Meeshy
//
//  ViewModel for ModernConversationView with presence, typing, reactions
//  UPDATED: Bidirectional loading around last read message + caching
//  iOS 17+
//

import Foundation
import Combine

// MARK: - Sendable Wrapper for WebSocket Data

/// Wrapper to safely pass non-Sendable dictionary across actor boundaries
private struct SendableDict: @unchecked Sendable {
    let value: [String: Any]
}

@MainActor
final class ModernChatViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var messages: [Message] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var isLoadingNewer = false
    @Published var isSending = false
    @Published var error: String?
    @Published var typingUsers: [TypingUserInfo] = []
    @Published var otherUserPresence: MemberPresenceStatus?

    /// Message ID to scroll to on initial load (last read message)
    @Published var scrollToMessageId: String?

    /// Whether initial scroll has been performed
    @Published var hasPerformedInitialScroll = false

    // MARK: - Properties

    let conversation: Conversation
    var currentUserId: String? {
        AuthenticationManager.shared.currentUser?.id
    }

    /// Last read message ID from user preferences
    private(set) var lastReadMessageId: String?

    /// Message status cursors by userId - tracks read/receive position per member
    @Published var memberCursors: [String: MessageStatus] = [:]

    /// Current user's last read date (for unread badge calculation)
    var currentUserLastReadDate: Date? {
        guard let userId = currentUserId else { return nil }
        return memberCursors[userId]?.readAt
    }

    private let apiService = APIService.shared
    private let webSocketService = WebSocketService.shared
    private let encryptionService = E2EEncryptionService.shared

    private var cancellables = Set<AnyCancellable>()
    private let pageSize = 50
    var hasMoreMessages = true        // Older messages available
    var hasNewerMessages = false      // Newer messages available (when loading around cursor)

    private var typingTimer: Timer?
    private var presenceTimer: Timer?

    // MEMORY FIX: Track typing indicator timers per user to avoid race conditions
    private var typingUserTimers: [String: DispatchWorkItem] = [:]

    // MEMORY FIX: Maximum messages to keep in memory (sliding window)
    private let maxMessagesInMemory = 300

    /// Cache key for this conversation's messages
    private var cacheKey: String { "messages_\(conversation.id)" }

    // MARK: - Member Cache

    /// Cached members for this conversation (populated async)
    @Published private(set) var members: [ConversationMember] = []

    /// Whether members are being loaded
    @Published private(set) var isLoadingMembers = false

    private let conversationService = ConversationService.shared

    // MARK: - Initialization

    init(conversation: Conversation) {
        self.conversation = conversation

        // Get lastReadMessageId from userPreferences
        self.lastReadMessageId = conversation.userPreferences?.lastReadMessageId

        // Initialize with conversation's sample members if available
        if let sampleMembers = conversation.members {
            self.members = sampleMembers
        }

        setupWebSocketListeners()
        loadMessagesAroundLastRead()
        fetchPresenceStatus()
        loadMembers() // Load full member list
        markConversationAsRead() // Mark as read when opening
    }

    // MARK: - Mark as Read

    /// Track if we've already marked as read to avoid duplicate calls
    private var hasMarkedAsRead = false

    /// Mark the conversation as read when opening it
    /// Updates local state immediately, then syncs with backend
    /// FIX: Capture lastMessageId immediately to avoid race conditions
    private func markConversationAsRead() {
        // Capture the last message ID immediately to avoid race conditions
        let lastMessageId = messages.last?.id ?? conversation.lastMessage?.id
        let conversationId = conversation.id

        // Avoid duplicate mark-as-read calls
        guard !hasMarkedAsRead else { return }
        hasMarkedAsRead = true

        Task {
            // 1. Update local conversation unread count immediately (optimistic)
            NotificationCenter.default.post(
                name: .conversationMarkedAsRead,
                object: nil,
                userInfo: ["conversationId": conversationId]
            )

            // 2. Send read status via WebSocket with the captured last message ID
            if let messageId = lastMessageId {
                webSocketService.sendReadStatus(
                    conversationId: conversationId,
                    messageId: messageId
                )
                chatLogger.info("Sent read status for message \(messageId)")
            }

            // 3. REST API as fallback only if WebSocket fails or is disconnected
            if !webSocketService.isReady {
                do {
                    try await conversationService.markAsRead(conversationId: conversationId)
                    chatLogger.info("Marked conversation \(conversationId) as read via REST API")
                } catch {
                    chatLogger.error("Failed to mark conversation as read: \(error.localizedDescription)")
                }
            }
        }
    }

    /// Called when initial scroll is complete - confirms read status with the latest messages
    func onInitialScrollComplete() {
        // Re-confirm read status after scroll is complete
        // This ensures we mark as read with the actual last message visible
        markConversationAsRead()
    }

    // MARK: - Member Loading

    /// Load and cache all members for this conversation
    /// Uses cached data when available (48h TTL with 5min rate limiting)
    private func loadMembers() {
        isLoadingMembers = true

        Task {
            do {
                // Use cache first - only fetches from network if cache is expired/missing
                // Cache has 48h TTL and 5min rate limiting between refreshes
                let fetchedMembers = try await conversationService.fetchMembers(
                    conversationId: conversation.id,
                    forceRefresh: false  // Use cache when valid
                )
                await MainActor.run {
                    self.members = fetchedMembers
                    self.isLoadingMembers = false
                    chatLogger.info("[ModernChatViewModel] Loaded \(fetchedMembers.count) members for conversation \(self.conversation.id)")
                }
            } catch {
                chatLogger.error("[ModernChatViewModel] Failed to load members: \(error.localizedDescription)")
                await MainActor.run {
                    self.isLoadingMembers = false
                }
            }
        }
    }

    /// Force refresh members from network
    func refreshMembers() {
        Task {
            do {
                let fetchedMembers = try await conversationService.fetchMembers(
                    conversationId: conversation.id,
                    forceRefresh: true
                )
                await MainActor.run {
                    self.members = fetchedMembers
                }
            } catch {
                chatLogger.error("Failed to refresh members: \(error.localizedDescription)")
            }
        }
    }

    /// Get member by userId (from cached members)
    func getMember(byUserId userId: String) -> ConversationMember? {
        return members.first { $0.userId == userId }
    }

    /// Get the current user's role in this conversation
    var currentUserRole: ConversationMemberRole? {
        guard let userId = currentUserId else { return nil }
        return getMember(byUserId: userId)?.role
    }

    /// Get user display info by userId
    /// Returns (displayName, avatar) or fallback values
    func getUserInfo(userId: String) -> (name: String, avatar: String?) {
        if let member = getMember(byUserId: userId) {
            return (member.preferredName, member.avatar)
        }
        // Don't trigger refresh on every lookup - too slow
        return ("Utilisateur", nil)
    }

    /// Get all conversation members (excluding current user)
    /// Returns array of (userId, displayName, avatar)
    func getAllMembers() -> [(userId: String, name: String, avatar: String?)] {
        return members
            .filter { $0.userId != currentUserId }
            .map { member in
                (userId: member.userId, name: member.preferredName, avatar: member.avatar)
            }
    }

    /// Get all conversation members with their read cursors (excluding current user)
    /// Returns tuples of (member, cursor) for status display
    func getAllMembersWithCursors() -> [(member: ConversationMember, cursor: MessageStatus?)] {
        return members
            .filter { $0.userId != currentUserId }
            .map { member in
                (member: member, cursor: memberCursors[member.userId])
            }
    }

    /// Get cursor for a specific user
    func getCursor(for userId: String) -> MessageStatus? {
        return memberCursors[userId]
    }

    /// Build member cursors from message delivery statuses
    /// This constructs cursor positions from the messages' status arrays
    /// Each user's cursor is their most recent read/received message
    private func buildMemberCursorsFromMessages(_ messages: [Message]) {
        chatLogger.debug("[buildMemberCursors] Building cursors from \(messages.count) messages")

        // For each message, update cursors with user statuses
        // We track the most recent status per user
        var cursorsByUser: [String: MessageStatus] = [:]

        // Process messages in chronological order (oldest first)
        let sortedMessages = messages.sorted { $0.createdAt < $1.createdAt }

        for message in sortedMessages {
            guard let statusArray = message.status else { continue }

            for status in statusArray {
                // Skip current user's status
                if status.userId == currentUserId { continue }

                // Convert MessageDeliveryStatus to MessageStatus cursor
                // The cursor points to this message for this user
                let cursor = MessageStatus(
                    id: status.id ?? UUID().uuidString,
                    conversationId: status.conversationId,
                    messageId: status.messageId,
                    userId: status.userId,
                    receivedAt: status.receivedAt,
                    readAt: status.readAt,
                    updatedAt: status.updatedAt ?? status.readAt ?? status.receivedAt ?? Date()
                )

                // Update cursor if this message is more recent than existing cursor
                // FIX: Use timestamps instead of string comparison on message IDs
                if let existing = cursorsByUser[status.userId] {
                    let cursorTime = cursor.updatedAt ?? cursor.readAt ?? cursor.receivedAt ?? Date.distantPast
                    let existingTime = existing.updatedAt ?? existing.readAt ?? existing.receivedAt ?? Date.distantPast
                    if cursorTime > existingTime {
                        cursorsByUser[status.userId] = cursor
                    }
                } else {
                    cursorsByUser[status.userId] = cursor
                }
            }
        }

        // Update published property
        self.memberCursors = cursorsByUser

        chatLogger.debug("[buildMemberCursors] Built \(cursorsByUser.count) cursors:")
        for (userId, cursor) in cursorsByUser {
            chatLogger.debug("  - User \(userId.prefix(8))...: messageId=\(cursor.messageId.prefix(8))..., isRead=\(cursor.isRead), isReceived=\(cursor.isReceived)")
        }
    }

    // MARK: - Load Messages Around Last Read

    /// Load messages centered around the last read message
    /// This enables bidirectional scrolling from the read position
    /// Uses offline-first strategy: memory cache -> disk cache -> network
    private func loadMessagesAroundLastRead() {
        isLoading = true
        error = nil

        Task {
            // 1. First check memory cache (fastest)
            let memoryCached = await AppCache.messages.getItems(forKey: cacheKey)
            if !memoryCached.isEmpty {
                self.messages = memoryCached.sorted { $0.createdAt < $1.createdAt }
                buildMemberCursorsFromMessages(self.messages)

                // Set scroll position to last read message if it exists in cache
                if let lastReadId = lastReadMessageId,
                   memoryCached.contains(where: { $0.id == lastReadId }) {
                    self.scrollToMessageId = lastReadId
                } else {
                    // Scroll to bottom (most recent)
                    self.scrollToMessageId = memoryCached.sorted { $0.createdAt < $1.createdAt }.last?.id
                }

                let metadata = await AppCache.messages.getMetadata(forKey: cacheKey)
                self.hasMoreMessages = metadata?.hasMore ?? true
                self.isLoading = false

                chatLogger.info("Loaded \(memoryCached.count) messages from memory cache for \(conversation.id)")

                // Refresh in background
                Task {
                    await refreshMessagesInBackground()
                }
                return
            }

            // 2. Check SQLite cache (MessageStore - fast disk access)
            let persistedMessages = await MessageStore.shared.loadMessages(
                conversationId: conversation.id,
                limit: 50,
                offset: 0
            )
            if !persistedMessages.isEmpty {
                self.messages = persistedMessages.sorted { $0.createdAt < $1.createdAt }
                buildMemberCursorsFromMessages(self.messages)

                // Set scroll position
                if let lastReadId = lastReadMessageId,
                   persistedMessages.contains(where: { $0.id == lastReadId }) {
                    self.scrollToMessageId = lastReadId
                } else {
                    self.scrollToMessageId = persistedMessages.sorted { $0.createdAt < $1.createdAt }.last?.id
                }

                self.hasMoreMessages = true // May have more on server
                self.isLoading = false

                chatLogger.info("Loaded \(persistedMessages.count) messages from SQLite for \(conversation.id)")

                // Load into memory cache
                await AppCache.messages.setInitialPage(
                    key: cacheKey,
                    items: persistedMessages,
                    hasMore: true,
                    ttl: .infinity
                )

                // Refresh in background
                Task {
                    await refreshMessagesInBackground()
                }
                return
            }

            // 3. No cache - fetch from network (slowest)
            do {
                if let lastReadId = lastReadMessageId {
                    // Load messages around the last read message
                    try await loadMessagesAroundCursor(messageId: lastReadId)
                } else {
                    // No last read - load most recent messages
                    try await loadRecentMessages()
                }
            } catch {
                self.error = error.localizedDescription
                chatLogger.error("Failed to load messages: \(error.localizedDescription)")
            }

            self.isLoading = false
        }
    }

    /// Load messages around a specific message ID (bidirectional)
    private func loadMessagesAroundCursor(messageId: String) async throws {
        // Fetch messages before and after the cursor
        let beforeResponse = try await apiService.fetchMessages(
            conversationId: conversation.id,
            before: messageId,
            limit: pageSize / 2
        )

        let afterResponse = try await apiService.fetchMessages(
            conversationId: conversation.id,
            after: messageId,
            limit: pageSize / 2,
            includeMessage: true  // Include the cursor message itself
        )

        // Combine and deduplicate - FIX: seenIds must be mutable and updated
        var allMessages = beforeResponse.messages + afterResponse.messages
        var seenIds = Set<String>()
        allMessages = allMessages.filter { msg in
            if seenIds.contains(msg.id) { return false }
            seenIds.insert(msg.id)
            return true
        }

        // Sort by date (oldest first for display)
        self.messages = allMessages.sorted { $0.createdAt < $1.createdAt }
        buildMemberCursorsFromMessages(self.messages)

        // Set scroll position
        self.scrollToMessageId = messageId

        // Determine if there are more messages in each direction
        self.hasMoreMessages = beforeResponse.messages.count >= pageSize / 2
        self.hasNewerMessages = afterResponse.messages.count >= pageSize / 2

        // Cache messages
        await cacheMessages(allMessages, hasMore: hasMoreMessages)

        chatLogger.info("Loaded \(allMessages.count) messages around cursor \(messageId)")
    }

    /// Load most recent messages (when no last read position)
    private func loadRecentMessages() async throws {
        let response = try await apiService.fetchMessages(
            conversationId: conversation.id,
            offset: 0,
            limit: pageSize
        )

        self.messages = response.messages.sorted { $0.createdAt < $1.createdAt }
        buildMemberCursorsFromMessages(self.messages)
        self.hasMoreMessages = response.messages.count >= pageSize
        self.hasNewerMessages = false  // Already at most recent

        // Scroll to bottom (most recent message)
        self.scrollToMessageId = messages.last?.id

        // Cache messages
        await cacheMessages(response.messages, hasMore: hasMoreMessages)

        chatLogger.info("Loaded \(response.messages.count) recent messages")
    }

    /// Cache messages for this conversation (memory + disk)
    private func cacheMessages(_ messages: [Message], hasMore: Bool) async {
        await AppCache.messages.setInitialPage(
            key: cacheKey,
            items: messages,
            hasMore: hasMore,
            ttl: .infinity
        )

        // Also persist to CoreData (keeps last 50 messages)
        AppCache.persistMessages(messages, conversationId: conversation.id)
    }

    /// Refresh messages in background without blocking UI
    private func refreshMessagesInBackground() async {
        do {
            let response = try await apiService.fetchMessages(
                conversationId: conversation.id,
                offset: 0,
                limit: pageSize
            )

            // Merge new messages
            let existingIds = Set(messages.map { $0.id })
            let newMessages = response.messages.filter { !existingIds.contains($0.id) }

            if !newMessages.isEmpty {
                messages.append(contentsOf: newMessages)
                messages.sort { $0.createdAt < $1.createdAt }

                // Update memory cache
                await AppCache.messages.prependItems(key: cacheKey, items: newMessages, ttl: .infinity)

                chatLogger.debug("Background refresh added \(newMessages.count) new messages")
            }

            // Update CoreData with current messages
            AppCache.persistMessages(messages, conversationId: conversation.id)
        } catch {
            chatLogger.error("Background refresh failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Force Refresh (Pull-to-Refresh)

    /// Force refresh messages from server (called by pull-to-refresh)
    /// This bypasses the cache and fetches fresh data from the API
    /// Also fetches any new messages that arrived since last fetch
    @Published var isRefreshing = false

    func forceRefresh() async {
        guard !isRefreshing else { return }

        isRefreshing = true
        error = nil

        do {
            // Fetch latest messages from server
            let response = try await apiService.fetchMessages(
                conversationId: conversation.id,
                offset: 0,
                limit: pageSize
            )

            // If we have existing messages, also check for newer ones
            if let newestMessage = messages.last {
                let newerResponse = try await apiService.fetchMessages(
                    conversationId: conversation.id,
                    after: newestMessage.id,
                    limit: pageSize
                )

                // Merge newer messages
                let existingIds = Set(messages.map { $0.id })
                let newerMessages = newerResponse.messages.filter { !existingIds.contains($0.id) }

                if !newerMessages.isEmpty {
                    messages.append(contentsOf: newerMessages)
                    chatLogger.info("Force refresh: Added \(newerMessages.count) newer messages")
                }
            }

            // Update existing messages with fresh data from server
            // This updates edited content, reactions, read status, etc.
            for serverMessage in response.messages {
                if let index = messages.firstIndex(where: { $0.id == serverMessage.id }) {
                    // Update existing message with server version
                    messages[index] = serverMessage
                } else {
                    // New message not in our list
                    messages.append(serverMessage)
                }
            }

            // Sort messages chronologically
            messages.sort { $0.createdAt < $1.createdAt }

            // Rebuild member cursors from updated messages
            buildMemberCursorsFromMessages(messages)

            // Update pagination state
            hasMoreMessages = response.messages.count >= pageSize
            hasNewerMessages = false // We just fetched the latest

            // Update caches
            await cacheMessages(messages, hasMore: hasMoreMessages)

            chatLogger.info("Force refresh completed: \(messages.count) total messages")

        } catch is CancellationError {
            // Task was cancelled (e.g., user released pull-to-refresh or view was dismissed)
            // This is normal behavior, not an error
            chatLogger.debug("Force refresh cancelled")
        } catch {
            self.error = error.localizedDescription
            chatLogger.error("Force refresh failed: \(error.localizedDescription)")
        }

        isRefreshing = false
    }

    // MARK: - Load More (Older) Messages

    func loadMoreMessages() {
        guard !isLoadingMore && hasMoreMessages else { return }

        isLoadingMore = true

        Task {
            do {
                // Get oldest message as cursor
                guard let oldestMessage = messages.first else {
                    isLoadingMore = false
                    return
                }

                let response = try await apiService.fetchMessages(
                    conversationId: conversation.id,
                    before: oldestMessage.id,
                    limit: pageSize
                )

                // Prepend older messages
                let existingIds = Set(messages.map { $0.id })
                let newMessages = response.messages.filter { !existingIds.contains($0.id) }

                messages.insert(contentsOf: newMessages.sorted { $0.createdAt < $1.createdAt }, at: 0)
                hasMoreMessages = response.messages.count >= pageSize

                // Update cache
                await AppCache.messages.appendPage(
                    key: cacheKey,
                    items: newMessages,
                    hasMore: hasMoreMessages
                )

                chatLogger.debug("Loaded \(newMessages.count) older messages")

                // MEMORY FIX: Trim messages if exceeding limit
                trimMessagesIfNeeded()
            } catch {
                chatLogger.error("Failed to load more messages: \(error.localizedDescription)")
            }
            isLoadingMore = false
        }
    }

    // MEMORY FIX: Trim messages array to avoid unbounded growth
    private func trimMessagesIfNeeded() {
        guard messages.count > maxMessagesInMemory else { return }

        let excessCount = messages.count - maxMessagesInMemory

        // Remove oldest messages (at the beginning of the array)
        messages.removeFirst(excessCount)

        // Set flag that we have more messages to load
        hasMoreMessages = true

        chatLogger.debug("Trimmed \(excessCount) oldest messages to stay under \(maxMessagesInMemory) limit")
    }

    // MARK: - Load Newer Messages

    func loadNewerMessages() {
        guard !isLoadingNewer && hasNewerMessages else { return }

        isLoadingNewer = true

        Task {
            do {
                // Get newest message as cursor
                guard let newestMessage = messages.last else {
                    isLoadingNewer = false
                    return
                }

                let response = try await apiService.fetchMessages(
                    conversationId: conversation.id,
                    after: newestMessage.id,
                    limit: pageSize
                )

                // Append newer messages
                let existingIds = Set(messages.map { $0.id })
                let newMessages = response.messages.filter { !existingIds.contains($0.id) }

                messages.append(contentsOf: newMessages.sorted { $0.createdAt < $1.createdAt })
                hasNewerMessages = response.messages.count >= pageSize

                // Update cache
                await AppCache.messages.prependItems(key: cacheKey, items: newMessages)

                chatLogger.debug("Loaded \(newMessages.count) newer messages")
            } catch {
                chatLogger.error("Failed to load newer messages: \(error.localizedDescription)")
            }
            isLoadingNewer = false
        }
    }

    /// Mark initial scroll as completed
    func markInitialScrollComplete() {
        hasPerformedInitialScroll = true
    }

    // MARK: - Send Message

    /// Send a message with optional detected language and sentiment
    /// Uses Socket.IO as primary transport with REST fallback
    /// - Parameters:
    ///   - content: Message text content
    ///   - replyToId: ID of message being replied to (optional)
    ///   - attachmentIds: Array of attachment IDs (optional)
    ///   - detectedLanguage: Language code detected from user input (e.g., "fr", "en")
    ///   - sentiment: Sentiment category of the message (optional)
    func sendMessage(
        content: String,
        replyToId: String? = nil,
        attachmentIds: [String]? = nil,
        detectedLanguage: String? = nil,
        sentiment: SentimentCategory? = nil
    ) {
        guard !content.isEmpty || attachmentIds?.isEmpty == false else { return }

        isSending = true

        // Use detected language or fall back to French (app default)
        let messageLanguage = detectedLanguage ?? "fr"

        // Check if conversation has E2E encryption enabled
        let shouldEncrypt = conversation.isE2EEncrypted

        let localId = UUID()

        // For E2E encrypted conversations, show placeholder content in optimistic message
        let displayContent = shouldEncrypt ? "[Encrypted message]" : content

        let optimisticMessage = Message(
            id: localId.uuidString,
            conversationId: conversation.id,
            senderId: currentUserId,
            anonymousSenderId: nil,
            content: displayContent,
            originalLanguage: messageLanguage,
            messageType: .text,
            isEdited: false,
            editedAt: nil,
            isDeleted: false,
            deletedAt: nil,
            replyToId: replyToId,
            validatedMentions: [],
            createdAt: Date(),
            updatedAt: Date(),
            attachments: [],
            reactions: nil,
            mentions: nil,
            status: nil as [MessageDeliveryStatus]?,
            localId: localId,
            isSending: true,
            sendError: nil,
            encryptedContent: shouldEncrypt ? content : nil,  // Store original for local display
            encryptionMetadata: shouldEncrypt ? .e2ee() : nil
        )

        // Optimistic update
        messages.insert(optimisticMessage, at: 0)

        // Log the message being sent with language and sentiment
        chatLogger.info("Sending message", [
            "conversationId": conversation.id,
            "detectedLanguage": messageLanguage,
            "sentiment": sentiment?.rawValue ?? "unknown",
            "hasAttachments": attachmentIds?.isEmpty == false,
            "isReply": replyToId != nil,
            "encrypted": shouldEncrypt
        ])

        Task {
            var messageSent = false

            // STRATEGY: Try Socket.IO first, fallback to REST on failure
            // Socket.IO provides real-time delivery confirmation via ACK

            // Prepare content - encrypt if E2E encryption is enabled
            var contentToSend = content
            var encryptedPayloadJson: String?

            if shouldEncrypt {
                do {
                    let encryptedPayload = try await encryptionService.encrypt(content, for: conversation.id)
                    encryptedPayloadJson = encryptedPayload.jsonString
                    contentToSend = "[Encrypted]"  // Placeholder for server
                    chatLogger.info("Message encrypted for E2E", ["conversationId": conversation.id])
                } catch {
                    chatLogger.error("E2E encryption failed, sending unencrypted", ["error": error.localizedDescription])
                    // Fall back to unencrypted on encryption failure
                }
            }

            // Step 1: Try Socket.IO if connected
            if WebSocketService.shared.isReady {
                chatLogger.info("📡 Attempting Socket.IO send...")

                let socketResult: WebSocketService.SocketMessageResult
                if let attachIds = attachmentIds, !attachIds.isEmpty {
                    socketResult = await WebSocketService.shared.sendMessageWithAttachmentsAsync(
                        conversationId: conversation.id,
                        content: contentToSend,
                        attachmentIds: attachIds,
                        originalLanguage: messageLanguage,
                        messageType: "text",
                        replyToId: replyToId,
                        encryptedContent: encryptedPayloadJson
                    )
                } else {
                    socketResult = await WebSocketService.shared.sendMessageAsync(
                        conversationId: conversation.id,
                        content: contentToSend,
                        originalLanguage: messageLanguage,
                        messageType: "text",
                        replyToId: replyToId,
                        encryptedContent: encryptedPayloadJson
                    )
                }

                if socketResult.success {
                    messageSent = true
                    chatLogger.info("✅ Message sent via Socket.IO", ["messageId": socketResult.messageId ?? "unknown"])

                    // Update optimistic message with server ID if available
                    if let serverMessageId = socketResult.messageId,
                       let index = self.messages.firstIndex(where: { $0.id == localId.uuidString }) {
                        // Create updated message with server ID
                        var updatedMessage = self.messages[index]
                        updatedMessage = Message(
                            id: serverMessageId,
                            conversationId: updatedMessage.conversationId,
                            senderId: updatedMessage.senderId,
                            anonymousSenderId: updatedMessage.anonymousSenderId,
                            content: updatedMessage.content,
                            originalLanguage: updatedMessage.originalLanguage,
                            messageType: updatedMessage.messageType,
                            isEdited: updatedMessage.isEdited,
                            editedAt: updatedMessage.editedAt,
                            isDeleted: updatedMessage.isDeleted,
                            deletedAt: updatedMessage.deletedAt,
                            replyToId: updatedMessage.replyToId,
                            validatedMentions: updatedMessage.validatedMentions,
                            createdAt: updatedMessage.createdAt,
                            updatedAt: updatedMessage.updatedAt,
                            attachments: updatedMessage.attachments,
                            reactions: updatedMessage.reactions,
                            mentions: updatedMessage.mentions,
                            status: updatedMessage.status,
                            localId: localId,
                            isSending: false,
                            sendError: nil
                        )
                        self.messages[index] = updatedMessage
                    }

                    // Notify ConversationListViewModel
                    NotificationCenter.default.post(
                        name: .messageSentFromChat,
                        object: nil,
                        userInfo: [
                            "conversationId": conversation.id,
                            "messageId": socketResult.messageId ?? localId.uuidString
                        ]
                    )
                } else {
                    chatLogger.warn("⚠️ Socket.IO send failed: \(socketResult.error ?? "unknown"), falling back to REST")
                }
            } else {
                chatLogger.info("📡 Socket.IO not ready, using REST directly")
            }

            // Step 2: Fallback to REST if Socket.IO failed
            if !messageSent {
                chatLogger.info("🌐 Attempting REST fallback...")

                let request = MessageSendRequest(
                    conversationId: conversation.id,
                    content: contentToSend,
                    messageType: .text,
                    originalLanguage: messageLanguage,
                    attachmentIds: attachmentIds,
                    replyToId: replyToId,
                    localId: localId.uuidString,
                    encryptedContent: encryptedPayloadJson
                )

                do {
                    var sentMessage = try await apiService.sendMessage(request)

                    // If encrypted, decrypt the message for local display
                    if shouldEncrypt, let encPayload = sentMessage.encryptedContent,
                       let payload = EncryptedPayload.from(jsonString: encPayload) {
                        do {
                            let decryptedContent = try await encryptionService.decrypt(payload, for: conversation.id)
                            sentMessage.content = decryptedContent
                        } catch {
                            chatLogger.error("Failed to decrypt sent message for display", ["error": error.localizedDescription])
                        }
                    }

                    messageSent = true

                    if let index = self.messages.firstIndex(where: { $0.id == localId.uuidString }) {
                        self.messages[index] = sentMessage
                    }

                    chatLogger.info("✅ Message sent via REST fallback", ["messageId": sentMessage.id])

                    // Notify ConversationListViewModel
                    NotificationCenter.default.post(
                        name: .messageSentFromChat,
                        object: nil,
                        userInfo: [
                            "conversationId": conversation.id,
                            "message": sentMessage
                        ]
                    )
                } catch {
                    chatLogger.error("❌ REST fallback also failed", ["error": error.localizedDescription])
                }
            }

            // Step 3: Handle complete failure
            if !messageSent {
                self.messages.removeAll { $0.id == localId.uuidString }
                self.error = "Échec de l'envoi du message. Veuillez réessayer."
                chatLogger.error("❌ Message send failed on all channels")
            }

            self.isSending = false
        }
    }

    /// Send a message with local attachments that need to be uploaded first
    /// Uses Socket.IO as primary transport with REST fallback
    /// - Parameters:
    ///   - content: Message text content
    ///   - attachments: Array of local InputAttachment objects to upload
    ///   - replyToId: ID of message being replied to (optional)
    ///   - detectedLanguage: Language code detected from user input
    ///   - sentiment: Sentiment category of the message
    func sendMessageWithAttachments(
        content: String,
        attachments: [InputAttachment],
        replyToId: String? = nil,
        detectedLanguage: String? = nil,
        sentiment: SentimentCategory? = nil
    ) {
        // If no attachments, use regular sendMessage
        guard !attachments.isEmpty else {
            sendMessage(
                content: content,
                replyToId: replyToId,
                attachmentIds: nil,
                detectedLanguage: detectedLanguage,
                sentiment: sentiment
            )
            return
        }

        isSending = true

        Task {
            do {
                var uploadedAttachmentIds: [String] = []
                var uploadedAttachments: [Attachment] = [] // Store full uploaded attachments with server URLs

                // Upload each attachment first (this always uses REST)
                for inputAttachment in attachments {
                    // Convert InputAttachment to Attachment model
                    let attachment = convertToAttachment(inputAttachment)

                    chatLogger.info("Uploading attachment", [
                        "type": attachment.type.rawValue,
                        "fileName": attachment.fileName
                    ])

                    // Upload and get the server attachment with ID
                    let uploadedAttachment = try await AttachmentUploadManager.shared.uploadAttachment(
                        attachment,
                        to: conversation.id
                    )

                    uploadedAttachmentIds.append(uploadedAttachment.id)
                    uploadedAttachments.append(uploadedAttachment) // Store for optimistic message

                    chatLogger.info("Attachment uploaded", [
                        "attachmentId": uploadedAttachment.id,
                        "url": uploadedAttachment.url
                    ])
                }

                // Determine message type based on attachments
                let messageType: MessageContentType = determineMessageType(from: attachments)
                let messageTypeString = messageType.rawValue

                // Now send the message with the uploaded attachment IDs
                let messageLanguage = detectedLanguage ?? "fr"
                let localId = UUID()

                let optimisticMessage = Message(
                    id: localId.uuidString,
                    conversationId: conversation.id,
                    senderId: currentUserId,
                    anonymousSenderId: nil,
                    content: content,
                    originalLanguage: messageLanguage,
                    messageType: messageType,
                    isEdited: false,
                    editedAt: nil,
                    isDeleted: false,
                    deletedAt: nil,
                    replyToId: replyToId,
                    validatedMentions: [],
                    createdAt: Date(),
                    updatedAt: Date(),
                    attachments: convertUploadedToMessageAttachments(uploadedAttachments),
                    reactions: nil,
                    mentions: nil,
                    status: nil as [MessageDeliveryStatus]?,
                    localId: localId,
                    isSending: true,
                    sendError: nil
                )

                // Optimistic update
                messages.insert(optimisticMessage, at: 0)

                var messageSent = false

                // STRATEGY: Try Socket.IO first, fallback to REST on failure
                if WebSocketService.shared.isReady {
                    chatLogger.info("📡 Attempting Socket.IO send with attachments...")

                    let socketResult = await WebSocketService.shared.sendMessageWithAttachmentsAsync(
                        conversationId: conversation.id,
                        content: content,
                        attachmentIds: uploadedAttachmentIds,
                        originalLanguage: messageLanguage,
                        messageType: messageTypeString,
                        replyToId: replyToId
                    )

                    if socketResult.success {
                        messageSent = true
                        chatLogger.info("✅ Message with attachments sent via Socket.IO", [
                            "messageId": socketResult.messageId ?? "unknown",
                            "attachmentCount": uploadedAttachmentIds.count
                        ])

                        // Update optimistic message with server ID if available
                        if let serverMessageId = socketResult.messageId,
                           let index = self.messages.firstIndex(where: { $0.id == localId.uuidString }) {
                            var updatedMessage = self.messages[index]
                            updatedMessage = Message(
                                id: serverMessageId,
                                conversationId: updatedMessage.conversationId,
                                senderId: updatedMessage.senderId,
                                anonymousSenderId: updatedMessage.anonymousSenderId,
                                content: updatedMessage.content,
                                originalLanguage: updatedMessage.originalLanguage,
                                messageType: updatedMessage.messageType,
                                isEdited: updatedMessage.isEdited,
                                editedAt: updatedMessage.editedAt,
                                isDeleted: updatedMessage.isDeleted,
                                deletedAt: updatedMessage.deletedAt,
                                replyToId: updatedMessage.replyToId,
                                validatedMentions: updatedMessage.validatedMentions,
                                createdAt: updatedMessage.createdAt,
                                updatedAt: updatedMessage.updatedAt,
                                attachments: updatedMessage.attachments,
                                reactions: updatedMessage.reactions,
                                mentions: updatedMessage.mentions,
                                status: updatedMessage.status,
                                localId: localId,
                                isSending: false,
                                sendError: nil
                            )
                            self.messages[index] = updatedMessage
                        }

                        // Notify ConversationListViewModel
                        NotificationCenter.default.post(
                            name: .messageSentFromChat,
                            object: nil,
                            userInfo: [
                                "conversationId": conversation.id,
                                "messageId": socketResult.messageId ?? localId.uuidString
                            ]
                        )
                    } else {
                        chatLogger.warn("⚠️ Socket.IO send failed: \(socketResult.error ?? "unknown"), falling back to REST")
                    }
                } else {
                    chatLogger.info("📡 Socket.IO not ready, using REST directly")
                }

                // Fallback to REST if Socket.IO failed
                if !messageSent {
                    chatLogger.info("🌐 Attempting REST fallback for message with attachments...")

                    let request = MessageSendRequest(
                        conversationId: conversation.id,
                        content: content,
                        messageType: messageType,
                        originalLanguage: messageLanguage,
                        attachmentIds: uploadedAttachmentIds,
                        replyToId: replyToId,
                        localId: localId.uuidString
                    )

                    let sentMessage = try await apiService.sendMessage(request)
                    messageSent = true

                    if let index = self.messages.firstIndex(where: { $0.id == localId.uuidString }) {
                        self.messages[index] = sentMessage
                    }

                    chatLogger.info("✅ Message with attachments sent via REST fallback", [
                        "messageId": sentMessage.id,
                        "attachmentCount": uploadedAttachmentIds.count
                    ])

                    // Notify ConversationListViewModel
                    NotificationCenter.default.post(
                        name: .messageSentFromChat,
                        object: nil,
                        userInfo: [
                            "conversationId": conversation.id,
                            "message": sentMessage
                        ]
                    )
                }

                if !messageSent {
                    self.messages.removeAll { $0.id == localId.uuidString }
                    self.error = "Échec de l'envoi du message avec pièces jointes."
                    chatLogger.error("❌ Message with attachments failed on all channels")
                }

            } catch {
                self.error = error.localizedDescription
                chatLogger.error("Failed to send message with attachments", ["error": error.localizedDescription])
            }

            self.isSending = false
        }
    }

    /// Convert InputAttachment to Attachment model for upload
    private func convertToAttachment(_ input: InputAttachment) -> Attachment {
        let mediaType: AttachmentMediaType
        switch input.type {
        case .image: mediaType = .image
        case .video: mediaType = .video
        case .audio: mediaType = .audio
        case .document: mediaType = .file
        case .location: mediaType = .location
        case .contact: mediaType = .file
        }

        let mimeType = determineMimeType(for: input)
        let fileSize = determineFileSize(for: input)

        return Attachment(
            id: input.id,
            type: mediaType,
            url: input.localURL?.absoluteString ?? "",
            fileName: input.fileName ?? "attachment",
            fileSize: fileSize,
            mimeType: mimeType,
            thumbnailUrl: nil,
            metadata: input.duration != nil ? ["duration": input.duration!] : nil,
            localURL: input.localURL,
            createdAt: Date()
        )
    }

    /// Convert InputAttachments to MessageAttachment array for optimistic UI (uses local URLs - legacy)
    private func convertToMessageAttachments(_ inputs: [InputAttachment]) -> [MessageAttachment] {
        return inputs.map { input in
            let mimeType = determineMimeType(for: input)
            let name = input.fileName ?? "attachment"
            return MessageAttachment(
                id: input.id,
                fileName: name,
                originalName: name,
                mimeType: mimeType,
                fileSize: 0,
                fileUrl: input.localURL?.absoluteString ?? ""
            )
        }
    }

    /// Convert uploaded Attachments to MessageAttachment array (uses SERVER URLs for immediate display)
    private func convertUploadedToMessageAttachments(_ uploaded: [Attachment]) -> [MessageAttachment] {
        return uploaded.map { attachment in
            MessageAttachment(
                id: attachment.id,
                fileName: attachment.fileName,
                originalName: attachment.fileName,
                mimeType: attachment.mimeType,
                fileSize: Int(attachment.fileSize), // Convert Int64 to Int
                fileUrl: attachment.url // Server URL for immediate display!
            )
        }
    }

    /// Determine the message type based on attachments
    private func determineMessageType(from attachments: [InputAttachment]) -> MessageContentType {
        guard let first = attachments.first else { return .text }

        switch first.type {
        case .image: return .image
        case .video: return .video
        case .audio: return .audio
        case .document: return .file
        case .location: return .location
        case .contact: return .file  // Contact cards stored as files
        }
    }

    /// Determine MIME type from InputAttachment
    private func determineMimeType(for input: InputAttachment) -> String {
        switch input.type {
        case .image:
            return "image/jpeg"
        case .video:
            return "video/mp4"
        case .audio:
            return "audio/m4a"
        case .document:
            let ext = (input.fileName as NSString?)?.pathExtension.lowercased() ?? ""
            switch ext {
            case "pdf": return "application/pdf"
            case "doc", "docx": return "application/msword"
            case "xls", "xlsx": return "application/vnd.ms-excel"
            default: return "application/octet-stream"
            }
        case .location:
            return "application/json"
        case .contact:
            return "text/vcard"
        }
    }

    /// Determine file size from local URL
    private func determineFileSize(for input: InputAttachment) -> Int64 {
        guard let localURL = input.localURL else { return 0 }
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: localURL.path)
            return attributes[.size] as? Int64 ?? 0
        } catch {
            return 0
        }
    }

    // MARK: - Edit & Delete

    func editMessage(messageId: String, newContent: String) {
        Task {
            do {
                let editedMessage = try await apiService.editMessage(messageId: messageId, content: newContent)

                if let index = self.messages.firstIndex(where: { $0.id == messageId }) {
                    self.messages[index] = editedMessage
                }
                
                // Update cache
                await AppCache.messages.updateItem(editedMessage)

                chatLogger.info("Message edited successfully", ["messageId": messageId])
            } catch {
                self.error = error.localizedDescription
                chatLogger.error("Failed to edit message", ["messageId": messageId, "error": error.localizedDescription])
            }
        }
    }

    func deleteMessage(messageId: String) {
        Task {
            do {
                try await apiService.deleteMessage(messageId: messageId)
                self.messages.removeAll { $0.id == messageId }

                chatLogger.info("Message deleted successfully", ["messageId": messageId])
            } catch {
                self.error = error.localizedDescription
                chatLogger.error("Failed to delete message", ["messageId": messageId, "error": error.localizedDescription])
            }
        }
    }

    // MARK: - Reactions

    func toggleReaction(messageId: String, emoji: String) async {
        guard let userId = currentUserId else { return }

        // Check if user already has this reaction
        if let messageIndex = messages.firstIndex(where: { $0.id == messageId }),
           let reactions = messages[messageIndex].reactions,
           reactions.contains(where: { $0.emoji == emoji && $0.userId == userId }) {
            // Remove reaction (optimistic)
            await removeReaction(messageId: messageId, emoji: emoji)
        } else {
            // Add reaction (optimistic)
            await addReaction(messageId: messageId, emoji: emoji)
        }
    }

    private func addReaction(messageId: String, emoji: String) async {
        guard let messageIndex = messages.firstIndex(where: { $0.id == messageId }) else { return }

        // Store original state for rollback
        let originalReactions = messages[messageIndex].reactions

        // Optimistic update with temporary local ID
        let tempReaction = Reaction(
            id: "temp_\(UUID().uuidString)",
            messageId: messageId,
            userId: currentUserId,
            anonymousId: nil,
            emoji: emoji,
            createdAt: Date(),
            updatedAt: Date()
        )

        var message = messages[messageIndex]
        var reactions = message.reactions ?? []
        reactions.append(tempReaction)
        message.reactions = reactions
        messages[messageIndex] = message

        // Call the API to add reaction
        do {
            let newReaction = try await apiService.addReaction(messageId: messageId, emoji: emoji)

            // Update optimistic reaction with server-assigned ID
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                var message = messages[newIndex]
                // Replace temp reaction with actual reaction from server
                message.reactions?.removeAll { $0.id == tempReaction.id }
                message.reactions?.append(newReaction)
                messages[newIndex] = message

                // Update cache
                await AppCache.messages.updateItem(message)
            }
            chatLogger.info("Added reaction", ["messageId": messageId, "emoji": emoji, "reactionId": newReaction.id])
        } catch {
            // Rollback optimistic update on failure
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                var rollbackMessage = messages[newIndex]
                rollbackMessage.reactions = originalReactions
                messages[newIndex] = rollbackMessage
            }
            chatLogger.error("Failed to add reaction", ["messageId": messageId, "emoji": emoji, "error": error.localizedDescription])
        }
    }

    private func removeReaction(messageId: String, emoji: String) async {
        guard let messageIndex = messages.firstIndex(where: { $0.id == messageId }),
              let userId = currentUserId else { return }

        // FIX: Find the reaction ID to remove (API requires reactionId, not messageId+emoji)
        guard let reactionToRemove = messages[messageIndex].reactions?.first(where: {
            $0.emoji == emoji && $0.userId == userId
        }) else {
            chatLogger.warn("Reaction not found to remove", ["messageId": messageId, "emoji": emoji])
            return
        }

        let reactionId = reactionToRemove.id

        // Store original state for rollback
        let originalReactions = messages[messageIndex].reactions

        // Optimistic update
        var message = messages[messageIndex]
        message.reactions?.removeAll { $0.id == reactionId }
        messages[messageIndex] = message

        // FIX: Call API with reactionId
        do {
            try await apiService.removeReaction(reactionId: reactionId)

            // Update cache (find by messageId since index may have changed)
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                await AppCache.messages.updateItem(messages[newIndex])
            }
            chatLogger.info("Removed reaction", ["messageId": messageId, "emoji": emoji, "reactionId": reactionId])
        } catch {
            // Rollback optimistic update on failure
            if let newIndex = messages.firstIndex(where: { $0.id == messageId }) {
                var rollbackMessage = messages[newIndex]
                rollbackMessage.reactions = originalReactions
                messages[newIndex] = rollbackMessage
            }
            chatLogger.error("Failed to remove reaction", ["messageId": messageId, "emoji": emoji, "error": error.localizedDescription])
        }
    }

    // MARK: - Translation

    func requestTranslation(messageId: String, targetLanguage: String) async {
        // TODO: Call translation API
        chatLogger.info("Translation requested", ["messageId": messageId, "targetLanguage": targetLanguage])
    }

    // MARK: - Typing Indicator

    func startTyping() {
        // Aligned with backend: typing:start event
        webSocketService.startTyping(conversationId: conversation.id)

        typingTimer?.invalidate()
        typingTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.stopTyping()
            }
        }
    }

    func stopTyping() {
        // Aligned with backend: typing:stop event
        webSocketService.stopTyping(conversationId: conversation.id)
        typingTimer?.invalidate()
    }

    // MARK: - Presence

    private func fetchPresenceStatus() {
        guard conversation.isDirect,
              let members = conversation.members,
              let otherMember = members.first(where: { $0.userId != currentUserId }) else {
            return
        }

        // Calculate presence based on isOnline and lastActiveAt
        otherUserPresence = otherMember.presenceStatus

        // Refresh presence periodically (recalculate based on lastActiveAt)
        presenceTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.refreshPresence()
            }
        }
    }

    private func refreshPresence() {
        // Recalculate presence based on current time and lastActiveAt
        guard conversation.isDirect,
              let members = conversation.members,
              let otherMember = members.first(where: { $0.userId != currentUserId }) else {
            return
        }
        otherUserPresence = otherMember.presenceStatus
    }

    // MARK: - WebSocket Listeners

    /// Unique subscriber ID for this ViewModel instance
    private lazy var subscriberId: String = "ModernChatViewModel_\(conversation.id)"

    /// Setup WebSocket listeners using batch subscription for better performance
    /// This replaces 11 individual on() calls with a single batch operation
    private func setupWebSocketListeners() {
        let conversationId = conversation.id

        // Use batch subscription for all chat events (single operation instead of 11)
        // Note: Handlers must use Task { @MainActor in } because they are called from non-isolated context
        // We wrap `data` in SendableDict to safely pass it across isolation boundaries
        let handlers = WebSocketService.ChatEventHandlers(
            onMessageNew: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleMessageNew(wrapped.value, conversationId: conversationId) }
            },
            onMessageEdited: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleMessageEdited(wrapped.value) }
            },
            onMessageDeleted: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleMessageDeleted(wrapped.value) }
            },
            onTypingStart: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleTypingStart(wrapped.value, conversationId: conversationId) }
            },
            onTypingStop: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleTypingStop(wrapped.value, conversationId: conversationId) }
            },
            onUserPresence: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleUserPresence(wrapped.value) }
            },
            onReactionAdded: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleReactionAdded(wrapped.value) }
            },
            onReactionRemoved: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleReactionRemoved(wrapped.value) }
            },
            onReactionSync: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleReactionSync(wrapped.value) }
            },
            onReadStatusUpdated: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleReadStatusUpdated(wrapped.value, conversationId: conversationId) }
            },
            onMessageTranslation: { [weak self] data in
                guard let dict = data as? [String: Any] else { return }
                let wrapped = SendableDict(value: dict)
                Task { @MainActor in self?.handleMessageTranslation(wrapped.value) }
            }
        )

        webSocketService.subscribeToChatEvents(subscriberId: subscriberId, handlers: handlers)
    }

    // MARK: - WebSocket Event Handlers

    private func handleMessageNew(_ data: [String: Any], conversationId: String) {
        guard let msgConversationId = data["conversationId"] as? String,
              msgConversationId == conversationId else { return }

        if var message = parseMessage(from: data),
           !messages.contains(where: { $0.id == message.id }) {
            // Decrypt if message has encrypted content
            if message.isEncrypted, let encPayloadJson = message.encryptedContent,
               let payload = EncryptedPayload.from(jsonString: encPayloadJson) {
                Task {
                    do {
                        let decryptedContent = try await encryptionService.decrypt(payload, for: conversationId)
                        // Update message with decrypted content
                        if let index = self.messages.firstIndex(where: { $0.id == message.id }) {
                            var decryptedMessage = self.messages[index]
                            decryptedMessage.content = decryptedContent
                            self.messages[index] = decryptedMessage
                        } else {
                            message.content = decryptedContent
                            self.messages.insert(message, at: 0)
                        }
                        chatLogger.info("Decrypted incoming message", ["messageId": message.id])
                    } catch {
                        chatLogger.error("Failed to decrypt incoming message", ["messageId": message.id, "error": error.localizedDescription])
                        // Still insert the message with placeholder content
                        message.content = "[Unable to decrypt message]"
                        self.messages.insert(message, at: 0)
                    }
                }
            } else {
                messages.insert(message, at: 0)
            }
        }
    }

    private func handleMessageEdited(_ data: [String: Any]) {
        guard let message = parseMessage(from: data) else { return }

        if let index = messages.firstIndex(where: { $0.id == message.id }) {
            messages[index] = message
        }
    }

    private func handleMessageDeleted(_ data: [String: Any]) {
        guard let messageId = data["messageId"] as? String else { return }

        messages.removeAll { $0.id == messageId }
    }

    private func handleTypingStart(_ data: [String: Any], conversationId: String) {
        guard let typingConversationId = data["conversationId"] as? String,
              typingConversationId == conversationId,
              let userId = data["userId"] as? String,
              userId != currentUserId else { return }

        let userName = data["username"] as? String ?? "Utilisateur"
        let avatar = data["avatar"] as? String

        if !typingUsers.contains(where: { $0.id == userId }) {
            typingUsers.append(TypingUserInfo(
                id: userId,
                displayName: userName,
                avatar: avatar
            ))
        }

        // Cancel existing timer for this user (avoids race condition)
        typingUserTimers[userId]?.cancel()

        // Create new tracked timer for auto-remove
        let workItem = DispatchWorkItem { [weak self] in
            self?.typingUsers.removeAll { $0.id == userId }
            self?.typingUserTimers.removeValue(forKey: userId)
        }
        typingUserTimers[userId] = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: workItem)
    }

    private func handleTypingStop(_ data: [String: Any], conversationId: String) {
        guard let typingConversationId = data["conversationId"] as? String,
              typingConversationId == conversationId,
              let userId = data["userId"] as? String else { return }

        typingUserTimers[userId]?.cancel()
        typingUserTimers.removeValue(forKey: userId)
        typingUsers.removeAll { $0.id == userId }
    }

    private func handleUserPresence(_ data: [String: Any]) {
        guard let userId = data["userId"] as? String,
              let status = data["status"] as? String else { return }

        if conversation.isDirect,
           conversation.members?.contains(where: { $0.userId == userId && $0.userId != currentUserId }) == true {
            switch status {
            case "online":
                otherUserPresence = .online
            case "away":
                otherUserPresence = .away
            default:
                otherUserPresence = .offline
            }
        }
    }

    private func handleReactionAdded(_ data: [String: Any]) {
        guard let messageId = data["messageId"] as? String,
              let emoji = data["emoji"] as? String,
              let userId = data["userId"] as? String else { return }

        let reactionId = data["id"] as? String ?? UUID().uuidString

        if let index = messages.firstIndex(where: { $0.id == messageId }) {
            var message = messages[index]
            var reactions = message.reactions ?? []

            if !reactions.contains(where: { $0.emoji == emoji && $0.userId == userId }) {
                let reaction = Reaction(
                    id: reactionId,
                    messageId: messageId,
                    userId: userId,
                    anonymousId: nil,
                    emoji: emoji,
                    createdAt: Date(),
                    updatedAt: Date()
                )
                reactions.append(reaction)
                message.reactions = reactions
                messages[index] = message
            }
        }
    }

    private func handleReactionRemoved(_ data: [String: Any]) {
        guard let messageId = data["messageId"] as? String,
              let emoji = data["emoji"] as? String,
              let userId = data["userId"] as? String else { return }

        if let index = messages.firstIndex(where: { $0.id == messageId }) {
            var message = messages[index]
            message.reactions?.removeAll { $0.emoji == emoji && $0.userId == userId }
            messages[index] = message
        }
    }

    private func handleReactionSync(_ data: [String: Any]) {
        guard let messageId = data["messageId"] as? String,
              let reactionsData = data["reactions"] as? [[String: Any]] else { return }

        if let index = messages.firstIndex(where: { $0.id == messageId }) {
            var message = messages[index]
            let reactions = reactionsData.compactMap { dict -> Reaction? in
                guard let id = dict["id"] as? String,
                      let emoji = dict["emoji"] as? String else { return nil }
                return Reaction(
                    id: id,
                    messageId: messageId,
                    userId: dict["userId"] as? String,
                    anonymousId: dict["anonymousId"] as? String,
                    emoji: emoji,
                    createdAt: nil,
                    updatedAt: nil
                )
            }
            message.reactions = reactions
            messages[index] = message
            chatLogger.debug("Synced \(reactions.count) reactions for message \(messageId)")
        }
    }

    private func handleReadStatusUpdated(_ data: [String: Any], conversationId: String) {
        guard let statusConversationId = data["conversationId"] as? String,
              statusConversationId == conversationId else { return }

        let statusType = data["type"] as? String ?? "received"
        let statusUserId = data["userId"] as? String
        let messageId = data["messageId"] as? String
        let receivedBy = data["receivedBy"] as? [String]

        chatLogger.debug("Read status updated", [
            "conversationId": statusConversationId,
            "type": statusType,
            "userId": statusUserId ?? "multiple",
            "messageId": messageId ?? "all"
        ])

        NotificationCenter.default.post(
            name: .readStatusUpdated,
            object: [
                "conversationId": statusConversationId,
                "type": statusType,
                "userId": statusUserId as Any,
                "messageId": messageId as Any,
                "receivedBy": receivedBy as Any
            ]
        )
    }

    private func handleMessageTranslation(_ data: [String: Any]) {
        guard let messageId = data["messageId"] as? String,
              let translatedContent = data["translatedContent"] as? String,
              let targetLanguage = data["targetLanguage"] as? String else { return }

        let translationId = data["id"] as? String ?? UUID().uuidString
        let sourceLanguage = data["sourceLanguage"] as? String
        let detectedLanguage = data["detectedLanguage"] as? String
        let confidenceScore = data["confidenceScore"] as? Double
        let processingTimeMs = data["processingTimeMs"] as? Int
        let cached = data["cached"] as? Bool

        if let index = messages.firstIndex(where: { $0.id == messageId }) {
            var message = messages[index]

            let translation = MessageTranslation(
                id: translationId,
                messageId: messageId,
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                translatedContent: translatedContent,
                detectedLanguage: detectedLanguage,
                translationModel: nil,
                provider: nil,
                cacheKey: nil,
                confidenceScore: confidenceScore,
                processingTimeMs: processingTimeMs,
                cached: cached,
                createdAt: Date(),
                updatedAt: Date()
            )

            var translations = message.translations ?? []
            translations.removeAll { $0.targetLanguage == targetLanguage }
            translations.append(translation)
            message.translations = translations
            messages[index] = message

            Task {
                await AppCache.messages.updateItem(message)
            }

            chatLogger.info("Translation stored in message", [
                "messageId": messageId,
                "targetLanguage": targetLanguage,
                "contentLength": translatedContent.count
            ])

            NotificationCenter.default.post(
                name: .messageTranslationReceived,
                object: [
                    "messageId": messageId,
                    "translatedContent": translatedContent,
                    "targetLanguage": targetLanguage,
                    "sourceLanguage": sourceLanguage ?? "unknown"
                ]
            )
        }
    }

    // MARK: - Helpers

    private func parseMessage(from data: [String: Any]) -> Message? {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds
            return try decoder.decode(Message.self, from: jsonData)
        } catch {
            chatLogger.error("Failed to parse message", ["error": error.localizedDescription])
            return nil
        }
    }

    // MARK: - Cleanup

    func cleanup() {
        stopTyping()
        typingTimer?.invalidate()
        typingTimer = nil
        presenceTimer?.invalidate()
        presenceTimer = nil

        // MEMORY FIX: Cancel all typing indicator timers
        for (_, workItem) in typingUserTimers {
            workItem.cancel()
        }
        typingUserTimers.removeAll()

        // Unsubscribe this ViewModel from all WebSocket events (uses subscriber ID - won't affect other subscribers)
        webSocketService.offAll(subscriberId: subscriberId)
    }

    // MEMORY FIX: Note about cleanup
    // Due to Swift 6 concurrency restrictions, deinit cannot access non-Sendable properties
    // in @MainActor classes. Therefore, cleanup() MUST be called from the view's onDisappear.
    // The cleanup() method properly invalidates all timers and removes WebSocket handlers.
}
