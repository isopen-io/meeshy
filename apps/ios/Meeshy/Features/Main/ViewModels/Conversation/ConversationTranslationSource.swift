import Foundation
import GRDB
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
        let reader = persistence.reader
        let grouped: [String: [TranslationRecord]] = (try? await reader.read { db in
            let records = try TranslationRecord
                .filter(messageIds.contains(Column("messageLocalId")))
                .fetchAll(db)
            return Dictionary(grouping: records, by: \.messageLocalId)
        }) ?? [:]
        return grouped
    }

    func recentPersisted(conversationId: String, limit: Int) async -> [String: [TranslationRecord]] {
        let reader = persistence.reader
        let grouped: [String: [TranslationRecord]] = (try? await reader.read { db in
            let localIds = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .order(Column("createdAt").desc)
                .limit(limit)
                .fetchAll(db)
                .flatMap { [$0.localId, $0.serverId].compactMap { $0 } }
            guard !localIds.isEmpty else { return [:] }
            let records = try TranslationRecord
                .filter(localIds.contains(Column("messageLocalId")))
                .fetchAll(db)
            return Dictionary(grouping: records, by: \.messageLocalId)
        }) ?? [:]
        return grouped
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
