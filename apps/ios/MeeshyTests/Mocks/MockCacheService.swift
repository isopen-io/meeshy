//
//  MockCacheService.swift
//  MeeshyTests
//
//  Mock Cache Service for unit testing
//

import Foundation
@testable import Meeshy

final class MockCacheService {
    // MARK: - Storage

    private var cachedMessages: [String: [Message]] = [:]
    private var cachedConversations: [Conversation] = []
    private var cachedUsers: [String: User] = [:]

    // MARK: - Configuration

    var shouldFail = false
    var cacheDelay: TimeInterval = 0.0

    // MARK: - Call Tracking

    var getCachedMessagesCallCount = 0
    var cacheMessageCallCount = 0
    var cacheMessagesCallCount = 0
    var getCachedConversationsCallCount = 0
    var cacheConversationsCallCount = 0
    var clearAllCallCount = 0

    // MARK: - Message Caching

    func getCachedMessages(conversationId: String, limit: Int, offset: Int) -> [Message] {
        getCachedMessagesCallCount += 1

        if shouldFail {
            return []
        }

        let messages = cachedMessages[conversationId] ?? []
        let start = min(offset, messages.count)
        let end = min(offset + limit, messages.count)

        return Array(messages[start..<end])
    }

    func cacheMessage(_ message: Message, conversationId: String) {
        cacheMessageCallCount += 1

        if shouldFail {
            return
        }

        if cachedMessages[conversationId] == nil {
            cachedMessages[conversationId] = []
        }

        // Add or update message
        if let index = cachedMessages[conversationId]?.firstIndex(where: { $0.id == message.id }) {
            cachedMessages[conversationId]?[index] = message
        } else {
            cachedMessages[conversationId]?.insert(message, at: 0)
        }
    }

    func cacheMessages(_ messages: [Message], conversationId: String) {
        cacheMessagesCallCount += 1

        if shouldFail {
            return
        }

        cachedMessages[conversationId] = messages
    }

    // MARK: - Conversation Caching

    func getCachedConversations() -> [Conversation] {
        getCachedConversationsCallCount += 1

        if shouldFail {
            return []
        }

        return cachedConversations
    }

    func cacheConversations(_ conversations: [Conversation]) {
        cacheConversationsCallCount += 1

        if shouldFail {
            return
        }

        cachedConversations = conversations
    }

    func cacheConversation(_ conversation: Conversation) {
        if let index = cachedConversations.firstIndex(where: { $0.id == conversation.id }) {
            cachedConversations[index] = conversation
        } else {
            cachedConversations.append(conversation)
        }
    }

    // MARK: - User Caching

    func getCachedUser(id: String) -> User? {
        return cachedUsers[id]
    }

    func cacheUser(_ user: User) {
        cachedUsers[user.id] = user
    }

    // MARK: - Clear Cache

    func clearAll() {
        clearAllCallCount += 1
        cachedMessages.removeAll()
        cachedConversations.removeAll()
        cachedUsers.removeAll()
    }

    func clearConversation(id: String) {
        cachedMessages.removeValue(forKey: id)
    }

    // MARK: - Reset

    func reset() {
        clearAll()
        shouldFail = false
        cacheDelay = 0.0
        getCachedMessagesCallCount = 0
        cacheMessageCallCount = 0
        cacheMessagesCallCount = 0
        getCachedConversationsCallCount = 0
        cacheConversationsCallCount = 0
        clearAllCallCount = 0
    }
}
