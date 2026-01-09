//
//  CacheManager.swift
//  Meeshy
//
//  Complete caching strategy with TTL and invalidation
//  UPDATED: Uses offset/limit pagination pattern
//

import Foundation

class CacheManager: @unchecked Sendable {

    // MARK: - Singleton

    static let shared = CacheManager()

    // MARK: - Cache Policy

    enum CachePolicy: String, Codable {
        case conversations // 24 hours
        case messages // 7 days
        case users // 1 hour
        case attachments // indefinite
        case translations // 30 days
        case notifications // 1 day

        var ttl: TimeInterval {
            switch self {
            case .conversations:
                return 24 * 60 * 60 // 24 hours
            case .messages:
                return 7 * 24 * 60 * 60 // 7 days
            case .users:
                return 60 * 60 // 1 hour
            case .attachments:
                return .infinity // indefinite
            case .translations:
                return 30 * 24 * 60 * 60 // 30 days
            case .notifications:
                return 24 * 60 * 60 // 1 day
            }
        }
    }

    // MARK: - Cache Entry

    private struct CacheEntry<T: Codable>: Codable {
        let value: T
        let expirationDate: Date
        let policy: CachePolicy

        var isExpired: Bool {
            Date() > expirationDate
        }
    }

    // MARK: - Properties

    private let memoryCache = NSCache<NSString, NSData>()
    private let diskCacheURL: URL
    private let fileManager = FileManager.default
    private let cacheQueue = DispatchQueue(label: "com.meeshy.cache", attributes: .concurrent)
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // MARK: - Smart Message Caching State

    /// Tracks known message IDs per conversation for bridge detection
    private var cachedMessageIds: [String: Set<String>] = [:]

    /// Tracks whether fresh data has connected with cached data per conversation
    private var messageCacheBridged: [String: Bool] = [:]

    // MARK: - Initialization

    private init() {
        // Setup disk cache directory
        let cachesDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        diskCacheURL = cachesDirectory.appendingPathComponent("MeeshyCache", isDirectory: true)

        try? fileManager.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)

        // Configure memory cache
        memoryCache.countLimit = 100 // Maximum 100 items in memory
        memoryCache.totalCostLimit = 50 * 1024 * 1024 // Maximum 50MB in memory

        // Configure JSON encoder/decoder
        encoder.dateEncodingStrategy = .iso8601WithFractionalSeconds
        decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds

        // Clean expired entries on launch
        cleanExpiredEntries()
    }

    // MARK: - Public Methods

    /// Save value to cache with policy
    func save<T: Codable>(_ value: T, forKey key: String, policy: CachePolicy) {
        cacheQueue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }

            let expirationDate = Date().addingTimeInterval(policy.ttl)
            let entry = CacheEntry(value: value, expirationDate: expirationDate, policy: policy)

            // Save to memory cache
            if let data = try? self.encoder.encode(entry) {
                self.memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)

                // Save to disk cache
                let fileURL = self.diskCacheURL.appendingPathComponent(key.hash.description)
                try? data.write(to: fileURL)
            }
        }
    }

    /// Load value from cache
    func load<T: Codable>(forKey key: String, as type: T.Type) -> T? {
        var result: T?

        cacheQueue.sync {
            // Try memory cache first
            if let data = memoryCache.object(forKey: key as NSString) as Data?,
               let entry = try? decoder.decode(CacheEntry<T>.self, from: data) {
                if !entry.isExpired {
                    result = entry.value
                    return
                } else {
                    // Remove expired entry
                    memoryCache.removeObject(forKey: key as NSString)
                }
            }

            // Try disk cache
            let fileURL = diskCacheURL.appendingPathComponent(key.hash.description)
            if let data = try? Data(contentsOf: fileURL),
               let entry = try? decoder.decode(CacheEntry<T>.self, from: data) {
                if !entry.isExpired {
                    // Restore to memory cache
                    memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)
                    result = entry.value
                } else {
                    // Remove expired file
                    try? fileManager.removeItem(at: fileURL)
                }
            }
        }

        return result
    }

    /// Remove value from cache
    func remove(forKey key: String) {
        cacheQueue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }

            // Remove from memory
            self.memoryCache.removeObject(forKey: key as NSString)

            // Remove from disk
            let fileURL = self.diskCacheURL.appendingPathComponent(key.hash.description)
            try? self.fileManager.removeItem(at: fileURL)
        }
    }

    /// Clear all cache entries for a specific policy
    func clearCache(for policy: CachePolicy) {
        cacheQueue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }

            // Clear memory cache completely (can't filter by policy efficiently)
            self.memoryCache.removeAllObjects()

            // Clear disk cache entries matching policy
            guard let files = try? self.fileManager.contentsOfDirectory(at: self.diskCacheURL, includingPropertiesForKeys: nil) else {
                return
            }

            for fileURL in files {
                if let data = try? Data(contentsOf: fileURL),
                   let entryData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let policyString = entryData["policy"] as? String,
                   policyString == "\(policy)" {
                    try? self.fileManager.removeItem(at: fileURL)
                }
            }
        }
    }

    /// Clear all cache
    func clearAll() {
        cacheQueue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }

            // Clear memory
            self.memoryCache.removeAllObjects()

            // Clear disk
            try? self.fileManager.removeItem(at: self.diskCacheURL)
            try? self.fileManager.createDirectory(at: self.diskCacheURL, withIntermediateDirectories: true)
        }
    }

    /// Get cache size in bytes
    func getCacheSize() -> Int64 {
        var size: Int64 = 0

        cacheQueue.sync {
            guard let files = try? fileManager.contentsOfDirectory(at: diskCacheURL, includingPropertiesForKeys: [.fileSizeKey]) else {
                return
            }

            for fileURL in files {
                if let resourceValues = try? fileURL.resourceValues(forKeys: [.fileSizeKey]),
                   let fileSize = resourceValues.fileSize {
                    size += Int64(fileSize)
                }
            }
        }

        return size
    }

    /// Clean expired entries
    func cleanExpiredEntries() {
        cacheQueue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }

            guard let files = try? self.fileManager.contentsOfDirectory(at: self.diskCacheURL, includingPropertiesForKeys: nil) else {
                return
            }

            for fileURL in files {
                if let data = try? Data(contentsOf: fileURL),
                   let entryData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let expirationString = entryData["expirationDate"] as? String,
                   let expirationDate = ISO8601DateFormatter().date(from: expirationString) {
                    if Date() > expirationDate {
                        try? self.fileManager.removeItem(at: fileURL)
                    }
                }
            }
        }
    }
}

// MARK: - Cache Keys

extension CacheManager {
    /// Generate cache key for conversation
    static func conversationKey(_ conversationId: String) -> String {
        return "conversation:\(conversationId)"
    }

    /// Generate cache key for conversation list (offset-based)
    static func conversationListKey(offset: Int, limit: Int) -> String {
        return "conversations:offset:\(offset):limit:\(limit)"
    }

    /// Generate cache key for messages (offset-based)
    static func messagesKey(conversationId: String, offset: Int, limit: Int) -> String {
        return "messages:\(conversationId):offset:\(offset):limit:\(limit)"
    }

    /// Generate cache key for message
    static func messageKey(_ messageId: String) -> String {
        return "message:\(messageId)"
    }

    /// Generate cache key for user
    static func userKey(_ userId: String) -> String {
        return "user:\(userId)"
    }

    /// Generate cache key for translation
    static func translationKey(messageId: String, language: String) -> String {
        return "translation:\(messageId):\(language)"
    }

    /// Generate cache key for attachment
    static func attachmentKey(_ attachmentId: String) -> String {
        return "attachment:\(attachmentId)"
    }

    /// Generate cache key for notifications (offset-based)
    static func notificationsKey(offset: Int, limit: Int) -> String {
        return "notifications:offset:\(offset):limit:\(limit)"
    }
}

// MARK: - Cache Invalidation

extension CacheManager {
    /// Invalidate conversation cache
    func invalidateConversation(_ conversationId: String) {
        remove(forKey: CacheManager.conversationKey(conversationId))
        clearCache(for: .conversations)
    }

    /// Invalidate messages cache for conversation
    func invalidateMessages(conversationId: String) {
        // Remove all message batches for this conversation
        cacheQueue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }

            let prefix = "messages:\(conversationId)"

            // Remove from memory cache
            // Note: NSCache doesn't provide enumeration, so we clear all
            self.memoryCache.removeAllObjects()

            // Remove from disk cache
            guard let files = try? self.fileManager.contentsOfDirectory(at: self.diskCacheURL, includingPropertiesForKeys: nil) else {
                return
            }

            for fileURL in files {
                if fileURL.lastPathComponent.hasPrefix(prefix) {
                    try? self.fileManager.removeItem(at: fileURL)
                }
            }

            // Also clear smart caching state
            self.cachedMessageIds.removeValue(forKey: conversationId)
            self.messageCacheBridged.removeValue(forKey: conversationId)
        }
    }

    /// Invalidate user cache
    func invalidateUser(_ userId: String) {
        remove(forKey: CacheManager.userKey(userId))
    }

    /// Invalidate all caches on logout
    func invalidateAll() {
        clearAll()
        // Also clear smart caching state
        cacheQueue.async(flags: .barrier) { [weak self] in
            self?.cachedMessageIds.removeAll()
            self?.messageCacheBridged.removeAll()
        }
    }
}

// MARK: - Smart Message Caching

extension CacheManager {
    /// Check if fresh message IDs overlap with previously cached IDs (bridge detection)
    /// Returns true if overlap found, meaning fresh data has connected with cache
    func checkMessageBridge(conversationId: String, freshMessageIds: Set<String>) -> Bool {
        var hasOverlap = false
        cacheQueue.sync {
            if let cachedIds = cachedMessageIds[conversationId] {
                hasOverlap = !cachedIds.isDisjoint(with: freshMessageIds)
            }
        }
        return hasOverlap
    }

    /// Update cached message IDs for a conversation
    func updateCachedMessageIds(conversationId: String, messageIds: Set<String>) {
        cacheQueue.async(flags: .barrier) { [weak self] in
            if self?.cachedMessageIds[conversationId] == nil {
                self?.cachedMessageIds[conversationId] = []
            }
            self?.cachedMessageIds[conversationId]?.formUnion(messageIds)
        }
    }

    /// Get bridge state for a conversation
    func isMessageCacheBridged(conversationId: String) -> Bool {
        var bridged = false
        cacheQueue.sync {
            bridged = messageCacheBridged[conversationId] ?? false
        }
        return bridged
    }

    /// Set bridge state for a conversation
    func setMessageCacheBridged(conversationId: String, bridged: Bool) {
        cacheQueue.async(flags: .barrier) { [weak self] in
            self?.messageCacheBridged[conversationId] = bridged
        }
    }

    /// Reset bridge state when opening a conversation (start fresh detection)
    func resetMessageBridgeState(conversationId: String) {
        cacheQueue.async(flags: .barrier) { [weak self] in
            self?.messageCacheBridged[conversationId] = false
        }
    }

    /// Clear message cache state for a conversation (called on invalidate)
    func clearMessageCacheState(conversationId: String) {
        cacheQueue.async(flags: .barrier) { [weak self] in
            self?.cachedMessageIds.removeValue(forKey: conversationId)
            self?.messageCacheBridged.removeValue(forKey: conversationId)
        }
    }
}

// MARK: - Attachment URL Storage

extension CacheManager {
    /// Load attachment URL from cache
    func loadAttachmentURL(forKey key: String) -> URL? {
        guard let urlString = load(forKey: key, as: String.self) else {
            return nil
        }
        return URL(string: urlString)
    }

    /// Save attachment URL to cache
    func saveAttachmentURL(_ url: URL, forKey key: String) {
        save(url.absoluteString, forKey: key, policy: .attachments)
    }
}
