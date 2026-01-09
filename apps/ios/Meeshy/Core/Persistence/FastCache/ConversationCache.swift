//
//  ConversationCache.swift
//  Meeshy
//
//  Ultra-fast JSON-based cache for conversations
//  Provides instant app startup by avoiding CoreData overhead
//  Thread-safe with actor isolation
//
//  Performance: ~10ms load vs ~500ms+ CoreData
//

import Foundation

// MARK: - Cached Conversation Model

struct CachedConversationData: Codable, Sendable {
    let id: String
    let identifier: String  // CRITICAL: Preserve identifier for conversation display
    let type: String
    let title: String?
    let avatar: String?
    let communityId: String?  // CRITICAL: Preserve communityId for community filtering
    let unreadCount: Int
    let isArchived: Bool
    let isMuted: Bool
    let isPinned: Bool
    let lastMessageAt: Date
    let createdAt: Date
    let updatedAt: Date
    let lastMessage: CachedLastMessage?

    // CRITICAL: User preferences for category/tag display
    let categoryId: String?
    let category: CachedCategory?
    let tags: [String]

    // CRITICAL: Participant counts from API
    let totalMemberCount: Int
    let totalAnonymousCount: Int
    let totalParticipantCount: Int

    // CRITICAL: Other participant info for direct conversations (v4)
    let otherParticipant: CachedOtherParticipant?

    struct CachedLastMessage: Codable, Sendable {
        let id: String
        let senderId: String?
        let content: String
        let messageType: String
        let createdAt: Date
        let senderUsername: String?
        let senderDisplayName: String?
        let senderAvatar: String?
    }

    struct CachedCategory: Codable, Sendable {
        let id: String
        let name: String
        let color: String?
        let icon: String?
        let order: Int
    }

    struct CachedOtherParticipant: Codable, Sendable {
        let odId: String  // odId = other participant id (userId)
        let username: String
        let displayName: String?
        let firstName: String?
        let lastName: String?
        let avatar: String?
        let isOnline: Bool
        /// Updated on every detectable activity (heartbeat, API request, typing, message send)
        let lastActiveAt: Date?
    }

    // MARK: - Custom Decoder for backwards compatibility
    // Handles old cache files that don't have identifier or communityId fields

    private enum CodingKeys: String, CodingKey {
        case id, identifier, type, title, avatar, communityId, unreadCount
        case isArchived, isMuted, isPinned, lastMessageAt, createdAt, updatedAt
        case lastMessage, categoryId, category, tags
        case totalMemberCount, totalAnonymousCount, totalParticipantCount
        case otherParticipant  // v4: for direct conversations
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        // BACKWARDS COMPATIBILITY: Use id as fallback for identifier if not present in old cache
        identifier = try container.decodeIfPresent(String.self, forKey: .identifier) ?? id
        type = try container.decode(String.self, forKey: .type)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
        // BACKWARDS COMPATIBILITY: communityId may not exist in old cache
        communityId = try container.decodeIfPresent(String.self, forKey: .communityId)
        unreadCount = try container.decode(Int.self, forKey: .unreadCount)
        isArchived = try container.decode(Bool.self, forKey: .isArchived)
        isMuted = try container.decode(Bool.self, forKey: .isMuted)
        isPinned = try container.decode(Bool.self, forKey: .isPinned)
        lastMessageAt = try container.decode(Date.self, forKey: .lastMessageAt)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        lastMessage = try container.decodeIfPresent(CachedLastMessage.self, forKey: .lastMessage)
        categoryId = try container.decodeIfPresent(String.self, forKey: .categoryId)
        category = try container.decodeIfPresent(CachedCategory.self, forKey: .category)
        tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        totalMemberCount = try container.decode(Int.self, forKey: .totalMemberCount)
        totalAnonymousCount = try container.decode(Int.self, forKey: .totalAnonymousCount)
        totalParticipantCount = try container.decode(Int.self, forKey: .totalParticipantCount)
        // v4: Other participant for direct conversations (optional for backwards compatibility)
        otherParticipant = try container.decodeIfPresent(CachedOtherParticipant.self, forKey: .otherParticipant)
    }

    // MARK: - Standard Initializer

    init(
        id: String,
        identifier: String,
        type: String,
        title: String?,
        avatar: String?,
        communityId: String?,
        unreadCount: Int,
        isArchived: Bool,
        isMuted: Bool,
        isPinned: Bool,
        lastMessageAt: Date,
        createdAt: Date,
        updatedAt: Date,
        lastMessage: CachedLastMessage?,
        categoryId: String?,
        category: CachedCategory?,
        tags: [String],
        totalMemberCount: Int,
        totalAnonymousCount: Int,
        totalParticipantCount: Int,
        otherParticipant: CachedOtherParticipant?
    ) {
        self.id = id
        self.identifier = identifier
        self.type = type
        self.title = title
        self.avatar = avatar
        self.communityId = communityId
        self.unreadCount = unreadCount
        self.isArchived = isArchived
        self.isMuted = isMuted
        self.isPinned = isPinned
        self.lastMessageAt = lastMessageAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastMessage = lastMessage
        self.categoryId = categoryId
        self.category = category
        self.tags = tags
        self.totalMemberCount = totalMemberCount
        self.totalAnonymousCount = totalAnonymousCount
        self.otherParticipant = otherParticipant
        self.totalParticipantCount = totalParticipantCount
    }
}

// MARK: - Cache Metadata

struct CacheMetadata: Codable, Sendable {
    let version: Int
    let lastUpdated: Date
    let count: Int

    // IMPORTANT: Increment this when CachedConversationData schema changes
    // v1 -> v2: Added identifier and communityId fields for community filtering
    // v2 -> v3: Fixed isArchived/isMuted/isPinned persistence + force fresh fetch to break 50 limit
    // v3 -> v4: Added otherParticipant for direct conversations (interlocutor name/avatar)
    static let currentVersion = 4
}

// MARK: - Conversation Cache Actor

actor ConversationCache {

    // MARK: - Singleton

    static let shared = ConversationCache()

    // MARK: - Properties

    private let fileManager = FileManager.default
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private var cachedData: [CachedConversationData]?
    private var isDirty = false

    // File paths - stored properties for init access
    private let cacheDirectory: URL
    private let dataFileURL: URL
    private let metadataFileURL: URL

    // MARK: - Initialization

    private init() {
        // Calculate paths first (before any actor isolation)
        let fm = FileManager.default
        let cacheDir = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ConversationCache", isDirectory: true)
        self.cacheDirectory = cacheDir
        self.dataFileURL = cacheDir.appendingPathComponent("conversations.json")
        self.metadataFileURL = cacheDir.appendingPathComponent("metadata.json")

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys] // Consistent output for debugging

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        // Ensure cache directory exists
        try? fm.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    // MARK: - Public API

    /// Load conversations from cache (ultra-fast, ~10ms)
    /// Automatically clears outdated cache when version changes
    func loadConversations() async -> [Conversation] {
        // Return in-memory cache if available
        if let cached = cachedData {
            return cached.compactMap { mapToConversation($0) }
        }

        // Check if cache exists
        guard fileManager.fileExists(atPath: dataFileURL.path) else {
            cacheLogger.debug("ConversationCache: No cache file exists")
            return []
        }

        // CRITICAL: Check cache version before loading
        // Clear outdated cache to force fresh data fetch with new fields (e.g., communityId)
        if let metadata = getMetadata(), metadata.version < CacheMetadata.currentVersion {
            cacheLogger.warn("ConversationCache: Clearing outdated cache (v\(metadata.version) -> v\(CacheMetadata.currentVersion))")
            await clearCache()
            return []
        }

        do {
            let startTime = CFAbsoluteTimeGetCurrent()

            let data = try Data(contentsOf: dataFileURL)
            let cached = try decoder.decode([CachedConversationData].self, from: data)

            let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            cacheLogger.info("ConversationCache: Loaded \(cached.count) conversations in \(String(format: "%.1f", elapsed))ms")

            self.cachedData = cached
            return cached.compactMap { mapToConversation($0) }

        } catch {
            cacheLogger.error("ConversationCache: Failed to load - \(error.localizedDescription)")
            // Clear corrupted cache to force fresh fetch
            await clearCache()
            return []
        }
    }

    /// Save conversations to cache
    func saveConversations(_ conversations: [Conversation]) async {
        let startTime = CFAbsoluteTimeGetCurrent()

        // Get current user ID from MainActor for filtering direct conversations
        let currentUserId = await MainActor.run {
            AuthenticationManager.shared.currentUser?.id ?? ""
        }

        let cached = conversations.map { mapToCachedData($0, currentUserId: currentUserId) }
        self.cachedData = cached

        do {
            let data = try encoder.encode(cached)
            try data.write(to: dataFileURL, options: [.atomic])

            // Update metadata
            let metadata = CacheMetadata(
                version: CacheMetadata.currentVersion,
                lastUpdated: Date(),
                count: cached.count
            )
            let metadataData = try encoder.encode(metadata)
            try metadataData.write(to: metadataFileURL, options: [.atomic])

            let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            cacheLogger.info("ConversationCache: Saved \(cached.count) conversations in \(String(format: "%.1f", elapsed))ms")

            isDirty = false

        } catch {
            cacheLogger.error("ConversationCache: Failed to save - \(error.localizedDescription)")
        }
    }

    /// Update a single conversation in cache
    func updateConversation(_ conversation: Conversation) async {
        if cachedData == nil {
            _ = await loadConversations()
        }

        // Get current user ID from MainActor for filtering direct conversations
        let currentUserId = await MainActor.run {
            AuthenticationManager.shared.currentUser?.id ?? ""
        }

        let cached = mapToCachedData(conversation, currentUserId: currentUserId)

        if let index = cachedData?.firstIndex(where: { $0.id == conversation.id }) {
            cachedData?[index] = cached
        } else {
            cachedData?.insert(cached, at: 0)
        }

        // Sort by lastMessageAt
        cachedData?.sort { $0.lastMessageAt > $1.lastMessageAt }

        isDirty = true

        // Debounced save (save after 500ms of no updates)
        await debouncedSave()
    }

    /// Remove a conversation from cache
    func removeConversation(id: String) async {
        cachedData?.removeAll { $0.id == id }
        isDirty = true
        await debouncedSave()
    }

    /// Clear all cached data
    func clearCache() async {
        cachedData = nil

        try? fileManager.removeItem(at: dataFileURL)
        try? fileManager.removeItem(at: metadataFileURL)

        cacheLogger.info("ConversationCache: Cache cleared")
    }

    /// Force save if dirty
    func flushIfNeeded() async {
        guard isDirty, let cached = cachedData else { return }
        await saveConversations(cached.compactMap { mapToConversation($0) })
    }

    /// Get cache metadata
    func getMetadata() -> CacheMetadata? {
        guard fileManager.fileExists(atPath: metadataFileURL.path) else { return nil }

        do {
            let data = try Data(contentsOf: metadataFileURL)
            return try decoder.decode(CacheMetadata.self, from: data)
        } catch {
            return nil
        }
    }

    // MARK: - Private Methods

    private var saveTask: Task<Void, Never>?

    private func debouncedSave() async {
        saveTask?.cancel()

        saveTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000) // 500ms debounce

            guard !Task.isCancelled else { return }

            if let cached = cachedData {
                await saveConversations(cached.compactMap { mapToConversation($0) })
            }
        }
    }

    // MARK: - Mapping

    private func mapToCachedData(_ conversation: Conversation, currentUserId: String) -> CachedConversationData {
        var lastMessageData: CachedConversationData.CachedLastMessage? = nil

        if let msg = conversation.lastMessage {
            lastMessageData = CachedConversationData.CachedLastMessage(
                id: msg.id,
                senderId: msg.senderId,
                content: msg.content,
                messageType: msg.messageType.rawValue,
                createdAt: msg.createdAt,
                senderUsername: msg.sender?.username,
                senderDisplayName: msg.sender?.displayName,
                senderAvatar: msg.sender?.avatar
            )
        }

        // Extract category from userPreferences or legacy preferences
        let categoryId = conversation.userPreferences?.categoryId
            ?? conversation.userPreferences?.category?.id
            ?? conversation.preferences?.category?.id

        var cachedCategory: CachedConversationData.CachedCategory? = nil
        if let cat = conversation.userPreferences?.category {
            cachedCategory = CachedConversationData.CachedCategory(
                id: cat.id,
                name: cat.name,
                color: cat.color,
                icon: cat.icon,
                order: cat.order
            )
        } else if let cat = conversation.preferences?.category {
            cachedCategory = CachedConversationData.CachedCategory(
                id: cat.id,
                name: cat.name,
                color: cat.color,
                icon: cat.icon,
                order: cat.order
            )
        }

        // Extract tags from userPreferences or legacy preferences
        let tags = conversation.userPreferences?.tags
            ?? conversation.preferences?.tags
            ?? []

        // BUGFIX: isArchived doit verifier TOUTES les sources (direct + userPreferences + preferences)
        // Sinon les archives ne sont pas correctement persistees dans le cache
        let isArchived = conversation.isArchived
            || (conversation.userPreferences?.isArchived ?? false)
            || (conversation.preferences?.isArchived ?? false)

        // BUGFIX: isMuted et isPinned doivent aussi verifier toutes les sources
        let isMuted = conversation.isMuted
            || (conversation.userPreferences?.isMuted ?? false)
            || (conversation.preferences?.isMuted ?? false)

        let isPinned = conversation.isPinned
            || (conversation.userPreferences?.isPinned ?? false)
            || (conversation.preferences?.isPinned ?? false)

        // v4: Extract other participant for direct conversations
        var cachedOtherParticipant: CachedConversationData.CachedOtherParticipant? = nil
        if conversation.isDirect, let members = conversation.members, !currentUserId.isEmpty {
            // Find the "other" participant (not the current user)
            if let other = members.first(where: { $0.userId != currentUserId && $0.isActive }) {
                cachedOtherParticipant = CachedConversationData.CachedOtherParticipant(
                    odId: other.userId,
                    username: other.user?.username ?? other.userId,
                    displayName: other.user?.displayName,
                    firstName: other.user?.firstName,
                    lastName: other.user?.lastName,
                    avatar: other.avatar ?? other.user?.avatar,
                    isOnline: other.isOnline,
                    lastActiveAt: other.lastActiveAt
                )
            }
        }

        return CachedConversationData(
            id: conversation.id,
            identifier: conversation.identifier,  // CRITICAL: Preserve identifier
            type: conversation.type.rawValue,
            title: conversation.title,
            avatar: conversation.avatar,
            communityId: conversation.communityId,  // CRITICAL: Preserve communityId for filtering
            unreadCount: conversation.unreadCount,
            isArchived: isArchived,  // BUGFIX: Use computed value from all sources
            isMuted: isMuted,        // BUGFIX: Use computed value from all sources
            isPinned: isPinned,      // BUGFIX: Use computed value from all sources
            lastMessageAt: conversation.lastMessageAt,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            lastMessage: lastMessageData,
            categoryId: categoryId,
            category: cachedCategory,
            tags: tags,
            totalMemberCount: conversation.totalMemberCount,
            totalAnonymousCount: conversation.totalAnonymousCount,
            totalParticipantCount: conversation.totalParticipantCount,
            otherParticipant: cachedOtherParticipant
        )
    }

    private func mapToConversation(_ cached: CachedConversationData) -> Conversation? {
        guard let type = ConversationType(rawValue: cached.type) else { return nil }

        var lastMessage: Message? = nil

        if let msg = cached.lastMessage {
            let sender: MessageSender? = {
                guard let username = msg.senderUsername else { return nil }
                return MessageSender(
                    id: msg.senderId ?? "",
                    username: username,
                    displayName: msg.senderDisplayName,
                    avatar: msg.senderAvatar
                )
            }()

            lastMessage = Message(
                id: msg.id,
                conversationId: cached.id,
                senderId: msg.senderId,
                anonymousSenderId: nil,
                content: msg.content,
                originalLanguage: "fr",
                messageType: MessageContentType(rawValue: msg.messageType) ?? .text,
                isEdited: false,
                editedAt: nil,
                isDeleted: false,
                deletedAt: nil,
                replyToId: nil,
                validatedMentions: [],
                createdAt: msg.createdAt,
                updatedAt: msg.createdAt,
                sender: sender,
                attachments: nil,
                reactions: nil,
                mentions: nil,
                status: nil,
                localId: nil,
                isSending: false,
                sendError: nil
            )
        }

        // Restore userPreferences with category and tags from cache
        var userPreferences: UserConversationPreferences? = nil
        if cached.categoryId != nil || cached.category != nil || !cached.tags.isEmpty || cached.isPinned {
            let restoredCategory: UserConversationCategory? = cached.category.map { cat in
                UserConversationCategory(
                    id: cat.id,
                    name: cat.name,
                    color: cat.color,
                    icon: cat.icon,
                    order: cat.order
                )
            }

            userPreferences = UserConversationPreferences(
                id: "cached_\(cached.id)",  // Generated ID for cache-restored preferences
                userId: "",  // Not persisted in cache
                conversationId: cached.id,
                isPinned: cached.isPinned,
                isMuted: cached.isMuted,
                isArchived: cached.isArchived,
                tags: cached.tags,
                categoryId: cached.categoryId,
                orderInCategory: nil,
                customName: nil,
                reaction: nil,
                lastReadMessageId: nil,
                unreadCount: cached.unreadCount,
                createdAt: cached.createdAt,
                updatedAt: cached.updatedAt,
                category: restoredCategory
            )
        }

        // v4: Restore members array with cached other participant for direct conversations
        var members: [ConversationMember]? = nil
        if let other = cached.otherParticipant {
            // Create user object from cached data
            let user = ConversationMember.ConversationMemberUser(
                id: other.odId,
                username: other.username,
                displayName: other.displayName,
                firstName: other.firstName,
                lastName: other.lastName,
                avatar: other.avatar,
                isOnline: other.isOnline,
                lastActiveAt: other.lastActiveAt
            )

            // Create minimal member with user info
            let member = ConversationMember(
                id: "cached_member_\(other.odId)",
                conversationId: cached.id,
                userId: other.odId,
                role: .member,
                canSendMessage: true,
                canSendFiles: true,
                canSendImages: true,
                canSendVideos: true,
                canSendAudios: true,
                canSendLocations: true,
                canSendLinks: true,
                joinedAt: cached.createdAt,
                leftAt: nil,
                isActive: true,
                user: user,
                readCursor: nil
            )
            members = [member]
        }

        return Conversation(
            id: cached.id,
            identifier: cached.identifier,  // CRITICAL: Restore identifier
            type: type,
            title: cached.title,
            description: nil,
            image: nil,
            avatar: cached.avatar,
            communityId: cached.communityId,  // CRITICAL: Restore communityId for community filtering
            isActive: true,
            isArchived: cached.isArchived,
            lastMessageAt: cached.lastMessageAt,
            createdAt: cached.createdAt,
            updatedAt: cached.updatedAt,
            members: members,  // v4: Restored from cached other participant
            lastMessage: lastMessage,
            shareLinks: nil,
            anonymousParticipants: nil,
            userPreferences: userPreferences,
            totalMemberCount: cached.totalMemberCount,
            totalAnonymousCount: cached.totalAnonymousCount,
            totalParticipantCount: cached.totalParticipantCount,
            preferences: nil,  // Legacy preferences not cached
            unreadCount: cached.unreadCount,
            isMuted: cached.isMuted,
            isPinned: cached.isPinned
        )
    }
}

// MARK: - Convenience Extension

extension ConversationCache {
    /// Preload cache into memory (call at app startup)
    func preload() async {
        _ = await loadConversations()
    }

    /// Check if cache has valid data
    var hasValidCache: Bool {
        get async {
            if cachedData != nil { return true }
            return fileManager.fileExists(atPath: dataFileURL.path)
        }
    }
}
