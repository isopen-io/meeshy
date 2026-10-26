import Foundation
import MeeshySDK
import os

@MainActor
protocol ConversationTranslationSourcing: AnyObject {
    func cached(for messageIds: [String]) async -> [String: [TranslationData]]
    func persisted(for messageIds: [String]) async -> [String: [TranslationRecord]]
    func recentPersisted(conversationId: String, limit: Int) async -> [String: [TranslationRecord]]
    func purge(ids: [String]) async
}

@MainActor
final class ConversationTranslationSource: ConversationTranslationSourcing {
    nonisolated deinit {}

    private let persistence: MessagePersistenceActor

    init(persistence: MessagePersistenceActor) {
        self.persistence = persistence
    }

    func cached(for messageIds: [String]) async -> [String: [TranslationData]] {
        await CacheCoordinator.shared.cachedTranslations(for: messageIds)
    }

    func persisted(for messageIds: [String]) async -> [String: [TranslationRecord]] {
        (try? await MessageRepository(persistence: persistence).translations(forMessageIds: messageIds)) ?? [:]
    }

    func recentPersisted(conversationId: String, limit: Int) async -> [String: [TranslationRecord]] {
        (try? await MessageRepository(persistence: persistence)
            .recentTranslations(conversationId: conversationId, limit: limit)) ?? [:]
    }

    func purge(ids: [String]) async {
        for id in ids {
            await CacheCoordinator.shared.invalidateTranslations(for: id)
            do {
                try await persistence.deleteTranslations(messageLocalId: id)
            } catch {
                Logger.messages.warning("[ConversationVM] deleteTranslations failed \(id, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
