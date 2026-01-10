//
//  APIService.swift
//  Meeshy
//
//  High-level API service layer with all endpoint wrappers
//  Converted to pure Swift concurrency (async/await)
//  UPDATED: Uses offset/limit pagination pattern
//

import Foundation

final class APIService: Sendable {

    // MARK: - Singleton

    static let shared = APIService()

    // MARK: - Properties

    private let apiClient: APIClient
    private let cacheManager: CacheManager

    // MARK: - Initialization

    private init() {
        self.apiClient = APIClient.shared
        self.cacheManager = CacheManager.shared
    }

    // MARK: - Authentication

    func login(username: String, password: String) async throws -> User {
        return try await AuthenticationManager.shared.login(username: username, password: password)
    }

    func register(
        username: String,
        email: String,
        password: String,
        phoneNumber: String? = nil,
        displayName: String? = nil
    ) async throws -> User {
        return try await AuthenticationManager.shared.register(
            username: username,
            email: email,
            password: password,
            phoneNumber: phoneNumber,
            displayName: displayName
        )
    }

    func logout() async throws {
        try await AuthenticationManager.shared.logout()
    }

    func joinAnonymous(linkId: String, data: JoinAnonymousRequest) async throws -> APIResponse<AnonymousJoinResponse> {
        // Create the endpoint request
        // This will need to be implemented once AuthEndpoints has the joinAnonymous endpoint
        // For now, we'll throw an error
        throw MeeshyError.auth(.unauthorized)
    }

    // MARK: - Users

    func getCurrentUser() async throws -> User {
        let response: APIResponse<User> = try await apiClient.request(UserEndpoints.getCurrentUser)

        guard let user = response.data else {
            throw MeeshyError.unknown
        }

        // Cache user data
        cacheManager.save(user, forKey: CacheManager.userKey(user.id), policy: .users)
        return user
    }

    func getUser(userId: String) async throws -> User {
        // Try cache first
        if let cachedUser = cacheManager.load(forKey: CacheManager.userKey(userId), as: User.self) {
            return cachedUser
        }

        let response: APIResponse<User> = try await apiClient.request(UserEndpoints.getUser(userId: userId))

        guard let user = response.data else {
            throw MeeshyError.unknown
        }

        cacheManager.save(user, forKey: CacheManager.userKey(userId), policy: .users)
        return user
    }

    func updateProfile(_ request: UserProfileUpdateRequest) async throws -> User {
        let response: APIResponse<User> = try await apiClient.request(UserEndpoints.updateProfile(request))

        guard let user = response.data else {
            throw MeeshyError.unknown
        }

        // Update cache
        cacheManager.save(user, forKey: CacheManager.userKey(user.id), policy: .users)
        return user
    }

    func searchUsers(query: String, offset: Int = 0, limit: Int = 20) async throws -> UserSearchResponse {
        let response: APIResponse<UserSearchResponse> = try await apiClient.request(
            UserEndpoints.searchUsers(query: query, offset: offset, limit: limit)
        )

        guard let searchResponse = response.data else {
            throw MeeshyError.unknown
        }

        return searchResponse
    }

    func updateStatus(_ presence: UserPresence) async throws {
        let request = UserStatusUpdateRequest(presence: presence)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(UserEndpoints.updateStatus(request))
    }

    // MARK: - Device Token Registration

    /// Register device token (APNS/VoIP) with backend
    /// Aligned with gateway API: POST /api/users/register-device-token
    func registerDeviceToken(apnsToken: String, platform: String = "ios") async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(
            UserEndpoints.registerDeviceToken(apnsToken: apnsToken, platform: platform)
        )
    }

    /// Unregister device token from backend
    /// Aligned with gateway API: DELETE /api/users/register-device-token
    func unregisterDeviceToken() async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(UserEndpoints.unregisterDeviceToken)
    }

    // MARK: - Conversations

    func fetchConversations(offset: Int = 0, limit: Int = PaginationConfig.conversationsLimit) async throws -> ConversationListResponse {
        // Try cache first
        let cacheKey = CacheManager.conversationListKey(offset: offset, limit: limit)
        if let cached = cacheManager.load(forKey: cacheKey, as: ConversationListResponse.self) {
            return cached
        }

        // API returns: {"success": true, "data": [Conversation], "pagination": {...}}
        // Use PaginatedAPIResponse to properly decode this format
        let response: PaginatedAPIResponse<[Conversation]> = try await apiClient.requestPaginated(
            ConversationEndpoints.fetchConversations(offset: offset, limit: limit)
        )

        // Convert to ConversationListResponse for compatibility
        // Use centralized pagination config for hasMore detection
        let hasMore = response.pagination?.hasMore ?? PaginationConfig.hasMore(receivedCount: response.data.count, limit: limit)

        let conversationList = ConversationListResponse(
            conversations: response.data,
            offset: offset,
            limit: response.pagination?.limit ?? limit,
            total: response.pagination?.total ?? response.data.count,
            hasMore: hasMore
        )

        // Cache conversations
        cacheManager.save(conversationList, forKey: cacheKey, policy: .conversations)
        return conversationList
    }

    func createConversation(_ request: ConversationCreateRequest) async throws -> Conversation {
        let response: APIResponse<Conversation> = try await apiClient.request(
            ConversationEndpoints.createConversation(request)
        )

        guard let conversation = response.data else {
            throw MeeshyError.unknown
        }

        // Invalidate conversation list cache
        cacheManager.clearCache(for: .conversations)
        return conversation
    }

    func getConversation(id: String) async throws -> Conversation {
        // Try cache first
        let cacheKey = CacheManager.conversationKey(id)
        if let cached = cacheManager.load(forKey: cacheKey, as: Conversation.self) {
            return cached
        }

        let response: APIResponse<Conversation> = try await apiClient.request(
            ConversationEndpoints.getConversation(id: id)
        )

        guard let conversation = response.data else {
            throw MeeshyError.unknown
        }

        cacheManager.save(conversation, forKey: cacheKey, policy: .conversations)
        return conversation
    }

    func updateConversation(id: String, request: ConversationUpdateRequest) async throws -> Conversation {
        let response: APIResponse<Conversation> = try await apiClient.request(
            ConversationEndpoints.updateConversation(id: id, request)
        )

        guard let conversation = response.data else {
            throw MeeshyError.unknown
        }

        // Update cache
        cacheManager.save(conversation, forKey: CacheManager.conversationKey(id), policy: .conversations)
        return conversation
    }

    func markAsRead(conversationId: String) async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(
            ConversationEndpoints.markAsRead(conversationId: conversationId)
        )

        // Invalidate conversation cache
        cacheManager.invalidateConversation(conversationId)
    }

    // MARK: - Messages

    func fetchMessages(conversationId: String, offset: Int = 0, limit: Int = 50) async throws -> MessageListResponse {
        // Smart caching algorithm:
        // 1. Always fetch offset 0 fresh
        // 2. Check if fresh messages overlap with cached messages (bridge detection)
        // 3. If bridged: use cache for older messages
        // 4. If not bridged or cache miss: fetch fresh and cache

        let cacheKey = CacheManager.messagesKey(conversationId: conversationId, offset: offset, limit: limit)

        if offset == 0 {
            // Reset bridge state for new conversation load
            cacheManager.resetMessageBridgeState(conversationId: conversationId)
        } else if cacheManager.isMessageCacheBridged(conversationId: conversationId) {
            // Bridged: try cache first for older messages
            if let cached = cacheManager.load(forKey: cacheKey, as: MessageListResponse.self) {
                return cached
            }
            // Cache miss (TTL expired) - fall through to fetch fresh
        }

        // Fetch fresh from network
        let response: APIResponse<MessageListResponse> = try await apiClient.request(
            MessageEndpoints.fetchMessages(conversationId: conversationId, offset: offset, limit: limit)
        )

        guard let messageList = response.data else {
            throw MeeshyError.unknown
        }

        // Extract message IDs for bridge detection
        let freshMessageIds = Set(messageList.messages.map { $0.id })

        // Check if this batch bridges with cached data
        if cacheManager.checkMessageBridge(conversationId: conversationId, freshMessageIds: freshMessageIds) {
            // Found overlap! Fresh data has connected with cache
            cacheManager.setMessageCacheBridged(conversationId: conversationId, bridged: true)
        }

        // Update cached message IDs for future bridge detection
        cacheManager.updateCachedMessageIds(conversationId: conversationId, messageIds: freshMessageIds)

        // Cache this batch
        cacheManager.save(messageList, forKey: cacheKey, policy: .messages)

        return messageList
    }

    /// Fetch messages before a specific message ID (cursor-based pagination)
    func fetchMessages(conversationId: String, before messageId: String, limit: Int = 50) async throws -> MessageListResponse {
        let response: APIResponse<MessageListResponse> = try await apiClient.request(
            MessageEndpoints.fetchMessagesBefore(conversationId: conversationId, beforeId: messageId, limit: limit)
        )

        guard let messageList = response.data else {
            throw MeeshyError.unknown
        }

        return messageList
    }

    /// Fetch messages after a specific message ID (cursor-based pagination)
    func fetchMessages(conversationId: String, after messageId: String, limit: Int = 50, includeMessage: Bool = false) async throws -> MessageListResponse {
        let response: APIResponse<MessageListResponse> = try await apiClient.request(
            MessageEndpoints.fetchMessagesAfter(conversationId: conversationId, afterId: messageId, limit: limit, includeMessage: includeMessage)
        )

        guard let messageList = response.data else {
            throw MeeshyError.unknown
        }

        return messageList
    }

    func sendMessage(_ request: MessageSendRequest) async throws -> Message {
        let response: APIResponse<Message> = try await apiClient.request(MessageEndpoints.sendMessage(conversationId: request.conversationId, request))

        guard let message = response.data else {
            throw MeeshyError.unknown
        }

        // Invalidate message cache for conversation
        cacheManager.invalidateMessages(conversationId: request.conversationId)
        return message
    }

    func editMessage(messageId: String, content: String) async throws -> Message {
        let request = MessageEditRequest(messageId: messageId, content: content)
        let response: APIResponse<Message> = try await apiClient.request(
            MessageEndpoints.editMessage(messageId: messageId, request)
        )

        guard let message = response.data else {
            throw MeeshyError.unknown
        }

        return message
    }

    func deleteMessage(messageId: String) async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(
            MessageEndpoints.deleteMessage(messageId: messageId)
        )
    }

    func addReaction(messageId: String, emoji: String) async throws -> Reaction {
        let request = ReactionAddRequest(messageId: messageId, emoji: emoji)
        let response: APIResponse<Reaction> = try await apiClient.request(
            MessageEndpoints.addReaction(request)
        )

        guard let reaction = response.data else {
            throw MeeshyError.unknown
        }

        return reaction
    }

    // FIX: removeReaction uses reactionId (not messageId+emoji)
    func removeReaction(reactionId: String) async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(
            MessageEndpoints.removeReaction(reactionId: reactionId)
        )
    }

    func getTranslation(messageId: String, targetLanguage: String) async throws -> MessageTranslation {
        // Try cache first
        let cacheKey = CacheManager.translationKey(messageId: messageId, language: targetLanguage)
        if let cached = cacheManager.load(forKey: cacheKey, as: MessageTranslation.self) {
            return cached
        }

        let request = MessageTranslationRequest(messageId: messageId, targetLanguage: targetLanguage, model: nil)
        let response: APIResponse<MessageTranslation> = try await apiClient.request(
            MessageEndpoints.getTranslation(messageId: messageId, request)
        )

        guard let translation = response.data else {
            throw MeeshyError.unknown
        }

        cacheManager.save(translation, forKey: cacheKey, policy: .translations)
        return translation
    }

    // MARK: - Notifications

    func fetchNotifications(offset: Int = 0, limit: Int = 50) async throws -> NotificationListResponse {
        let response: APIResponse<NotificationListResponse> = try await apiClient.request(
            NotificationEndpoints.fetchNotifications(offset: offset, limit: limit)
        )

        guard let notificationList = response.data else {
            throw MeeshyError.unknown
        }

        return notificationList
    }

    func markNotificationAsRead(notificationId: String) async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(
            NotificationEndpoints.markAsRead(notificationId: notificationId)
        )
    }

    func markAllNotificationsAsRead() async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(NotificationEndpoints.markAllAsRead)
    }

    // MARK: - Attachments

    func uploadFile(
        fileData: Data,
        mimeType: String,
        fileName: String,
        conversationId: String,
        attachmentType: AttachmentType = .file,
        duration: Double? = nil
    ) async throws -> MessageAttachment {
        // Build metadata matching webapp format
        let metadata = AttachmentUploadMetadata(
            type: attachmentType,
            conversationId: conversationId,
            duration: duration
        )
        let endpoint = AttachmentEndpoints.upload(metadata: metadata)

        let response: APIResponse<MessageAttachment> = try await apiClient.upload(
            endpoint,
            fileData: fileData,
            mimeType: mimeType,
            fileName: fileName
        )

        guard let attachment = response.data else {
            throw MeeshyError.unknown
        }

        return attachment
    }

    func downloadFile(attachmentId: String) async throws -> URL {
        // Try cache first
        let cacheKey = CacheManager.attachmentKey(attachmentId)
        if let cachedURL = cacheManager.loadAttachmentURL(forKey: cacheKey) {
            return cachedURL
        }

        let url = try await apiClient.download(
            AttachmentEndpoints.download(attachmentId: attachmentId)
        )

        // Cache the URL
        cacheManager.saveAttachmentURL(url, forKey: cacheKey)
        return url
    }

    // MARK: - Communities

    func fetchCommunities() async throws -> [Community] {
        let response: APIResponse<[Community]> = try await apiClient.request(CommunityEndpoints.fetchCommunities)

        guard let communities = response.data else {
            throw MeeshyError.unknown
        }

        return communities
    }

    func getCommunity(id: String) async throws -> Community {
        let response: APIResponse<Community> = try await apiClient.request(CommunityEndpoints.getCommunity(id: id))

        guard let community = response.data else {
            throw MeeshyError.unknown
        }

        return community
    }

    func joinCommunity(id: String) async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(CommunityEndpoints.joinCommunity(id: id))
    }

    func leaveCommunity(id: String) async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(CommunityEndpoints.leaveCommunity(id: id))
    }

    // MARK: - Availability Checks (Registration)

    /// Check if username is available
    func checkUsernameAvailability(username: String) async throws -> AvailabilityResponse {
        let response: APIResponse<AvailabilityResponse> = try await apiClient.request(
            UserEndpoints.checkUsernameAvailability(username: username)
        )

        guard let result = response.data else {
            throw MeeshyError.unknown
        }

        return result
    }

    /// Check if email is available
    func checkEmailAvailability(email: String) async throws -> AvailabilityResponse {
        let response: APIResponse<AvailabilityResponse> = try await apiClient.request(
            UserEndpoints.checkEmailAvailability(email: email)
        )

        guard let result = response.data else {
            throw MeeshyError.unknown
        }

        return result
    }

    /// Check if phone number is available
    func checkPhoneAvailability(phone: String) async throws -> AvailabilityResponse {
        let response: APIResponse<AvailabilityResponse> = try await apiClient.request(
            UserEndpoints.checkPhoneAvailability(phone: phone)
        )

        guard let result = response.data else {
            throw MeeshyError.unknown
        }

        return result
    }
}

// MARK: - Availability Response

struct AvailabilityResponse: Codable {
    let available: Bool
    let suggestions: [String]?
}
