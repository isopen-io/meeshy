import Foundation
import os

// MARK: - Local Store

public actor LocalStore {
    public static let shared = LocalStore()

    private let fileManager = FileManager.default
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "localstore")

    private static let conversationsFileName = "cached_conversations.json"
    private static let messagesDirectoryName = "cached_messages"
    private static let metadataFileName = "cache_metadata.json"
    private static let maxCachedMessagesPerConversation = 50
    private static let staleConversationThresholdDays = 30

    private init() {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    // MARK: - Directory Helpers

    private var cacheDirectory: URL {
        let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !fileManager.fileExists(atPath: cacheDir.path) {
            try? fileManager.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        }
        return cacheDir
    }

    private var messagesDirectory: URL {
        let dir = cacheDirectory.appendingPathComponent(Self.messagesDirectoryName, isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private var conversationsFileURL: URL {
        cacheDirectory.appendingPathComponent(Self.conversationsFileName)
    }

    private var metadataFileURL: URL {
        cacheDirectory.appendingPathComponent(Self.metadataFileName)
    }

    private func messagesFileURL(for conversationId: String) -> URL {
        messagesDirectory.appendingPathComponent("\(conversationId).json")
    }

    // MARK: - Conversations

    public func saveConversations(_ conversations: [MeeshyConversation]) {
        do {
            let data = try encoder.encode(conversations)
            try data.write(to: conversationsFileURL, options: .atomic)
            logger.debug("Saved \(conversations.count) conversations to cache")
        } catch {
            logger.error("Failed to save conversations: \(error.localizedDescription)")
        }
    }

    public func loadConversations() -> [MeeshyConversation] {
        let url = conversationsFileURL
        guard fileManager.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let conversations = try decoder.decode([MeeshyConversation].self, from: data)
            logger.debug("Loaded \(conversations.count) conversations from cache")
            return conversations
        } catch {
            logger.error("Failed to load conversations: \(error.localizedDescription)")
            return []
        }
    }

    // MARK: - Messages

    public func saveMessages(_ messages: [MeeshyMessage], for conversationId: String) {
        do {
            let trimmed = Array(messages.suffix(Self.maxCachedMessagesPerConversation))
            let data = try encoder.encode(trimmed)
            try data.write(to: messagesFileURL(for: conversationId), options: .atomic)
            updateMetadata(conversationId: conversationId)
            logger.debug("Saved \(trimmed.count) messages for conversation \(conversationId)")
        } catch {
            logger.error("Failed to save messages for \(conversationId): \(error.localizedDescription)")
        }
    }

    public func loadMessages(for conversationId: String) -> [MeeshyMessage] {
        let url = messagesFileURL(for: conversationId)
        guard fileManager.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let messages = try decoder.decode([MeeshyMessage].self, from: data)
            logger.debug("Loaded \(messages.count) cached messages for conversation \(conversationId)")
            return messages
        } catch {
            logger.error("Failed to load messages for \(conversationId): \(error.localizedDescription)")
            return []
        }
    }

    // MARK: - Metadata Tracking

    private struct CacheMetadata: Codable {
        var conversationAccessDates: [String: Date]
    }

    private func loadMetadata() -> CacheMetadata {
        let url = metadataFileURL
        guard fileManager.fileExists(atPath: url.path) else {
            return CacheMetadata(conversationAccessDates: [:])
        }
        do {
            let data = try Data(contentsOf: url)
            return try decoder.decode(CacheMetadata.self, from: data)
        } catch {
            return CacheMetadata(conversationAccessDates: [:])
        }
    }

    private func saveMetadata(_ metadata: CacheMetadata) {
        do {
            let data = try encoder.encode(metadata)
            try data.write(to: metadataFileURL, options: .atomic)
        } catch {
            logger.error("Failed to save metadata: \(error.localizedDescription)")
        }
    }

    private func updateMetadata(conversationId: String) {
        var metadata = loadMetadata()
        metadata.conversationAccessDates[conversationId] = Date()
        saveMetadata(metadata)
    }

    // MARK: - Cleanup

    public func cleanupStaleMessageCaches() {
        let metadata = loadMetadata()
        let threshold = Calendar.current.date(
            byAdding: .day,
            value: -Self.staleConversationThresholdDays,
            to: Date()
        ) ?? Date()

        var updatedMetadata = metadata
        var removedCount = 0

        for (conversationId, lastAccess) in metadata.conversationAccessDates {
            if lastAccess < threshold {
                let fileURL = messagesFileURL(for: conversationId)
                try? fileManager.removeItem(at: fileURL)
                updatedMetadata.conversationAccessDates.removeValue(forKey: conversationId)
                removedCount += 1
            }
        }

        if removedCount > 0 {
            saveMetadata(updatedMetadata)
            logger.info("Cleaned up \(removedCount) stale message caches")
        }
    }

    // MARK: - Clear All

    public func clearAll() {
        try? fileManager.removeItem(at: cacheDirectory)
        logger.info("Cleared all local cache")
    }
}
