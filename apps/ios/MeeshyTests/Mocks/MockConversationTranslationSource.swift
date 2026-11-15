import Foundation
import MeeshySDK
@testable import Meeshy

@MainActor
final class MockConversationTranslationSource: ConversationTranslationSourcing {
    nonisolated deinit {}

    var cachedResult: [String: [TranslationData]] = [:]
    var persistedResult: [String: [TranslationRecord]] = [:]
    var recentResult: [String: [TranslationRecord]] = [:]

    private(set) var cachedRequests: [[String]] = []
    private(set) var persistedRequests: [[String]] = []
    private(set) var recentRequests: [String] = []
    private(set) var purged: [[String]] = []

    func cached(for messageIds: [String]) async -> [String: [TranslationData]] {
        cachedRequests.append(messageIds)
        return cachedResult
    }

    func persisted(for messageIds: [String]) async -> [String: [TranslationRecord]] {
        persistedRequests.append(messageIds)
        return persistedResult
    }

    func recentPersisted(conversationId: String, limit: Int) async -> [String: [TranslationRecord]] {
        recentRequests.append(conversationId)
        return recentResult
    }

    func purge(ids: [String]) async {
        purged.append(ids)
    }
}
