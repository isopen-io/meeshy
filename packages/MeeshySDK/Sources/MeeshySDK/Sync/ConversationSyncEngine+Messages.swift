import Foundation
import Combine
import os

// ConversationSyncEngine — les MESSAGES : fenêtre courante, pages anciennes, rétention.
// Voir la note d'extraction en tête de `ConversationSyncEngine.swift` (#4172).

extension ConversationSyncEngine {
    public func ensureMessages(for conversationId: String, force: Bool) async {
        if !force {
            let cached = await cache.messages.load(for: conversationId)
            switch cached {
            case .fresh:
                return
            case .stale, .expired, .empty:
                break
            }
        }

        // #8656 — la page appartient au compte qui l'a DEMANDÉE : lue sous son
        // jeton, elle ne s'écrit ni dans le cache ni dans la base locale d'un
        // compte arrivé pendant la requête.
        let owner = await currentUserId()
        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 30, includeReplies: true, includeTranslations: true, languages: nil
            )
            await Self.$syncOwner.withValue(owner) {
                await absorbFetchedWindow(response, into: conversationId)
            }
        } catch {
            Self.logger.error("[SyncEngine] ensureMessages error: \(error.localizedDescription)")
        }
    }

    private func absorbFetchedWindow(_ response: MessagesAPIResponse, into conversationId: String) async {
        guard await ownsSession() else {
            Self.logger.notice("[SyncEngine] fenêtre de messages refusée : le compte a changé pendant la requête")
            return
        }
        let userId = await currentUserId(); let username = await currentUsername()
        let preferredLanguages = await currentPreferredLanguages()
        if let mentionedUsers = response.meta?.mentionedUsers {
            UserDisplayNameCache.shared.trackFromMentionedUsers(mentionedUsers)
        }
        let freshMessages = response.data.map { $0.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: preferredLanguages) }
        // Atomic merge: keep any messages that arrived via socket between the
        // REST request and this write, so they are never silently overwritten.
        await cache.messages.mergeUpdate(for: conversationId) { existing in
            let freshIds = Set(freshMessages.map(\.id))
            let fromCacheOnly = existing.filter { !freshIds.contains($0.id) }
            return (freshMessages + fromCacheOnly).sorted { $0.createdAt < $1.createdAt }
        }
        // Mirror the fetched window into the app's on-device message store
        // so the conversation timeline (GRDB-backed) is already current
        // when the user opens it — the push-notification handler routes
        // through here with `force: true` precisely for that purpose.
        await apiMessagePersistor?(response.data)
        _messagesDidChange.send(conversationId)
    }

    public func fetchOlderMessages(for conversationId: String, before messageId: String) async {
        let owner = await currentUserId()
        do {
            let response = try await messageService.listBefore(
                conversationId: conversationId, before: messageId, limit: 30, includeReplies: true, includeTranslations: true, languages: nil
            )
            await Self.$syncOwner.withValue(owner) {
                await absorbOlderWindow(response, into: conversationId)
            }
        } catch {
            Self.logger.error("[SyncEngine] fetchOlderMessages error: \(error.localizedDescription)")
        }
    }

    private func absorbOlderWindow(_ response: MessagesAPIResponse, into conversationId: String) async {
        guard await ownsSession() else {
            Self.logger.notice("[SyncEngine] page ancienne refusée : le compte a changé pendant la requête")
            return
        }
        let userId = await currentUserId(); let username = await currentUsername()
        let preferredLanguages = await currentPreferredLanguages()
        let olderMessages = response.data.map { $0.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: preferredLanguages) }

        // Atomic merge: prepend older messages without overwriting any
        // messages that arrived via socket between the REST fetch and now.
        await cache.messages.mergeUpdate(for: conversationId) { existing in
            let existingIds = Set(existing.map(\.id))
            let newOnly = olderMessages.filter { !existingIds.contains($0.id) }
            return newOnly + existing
        }
        await apiMessagePersistor?(response.data)
        _messagesDidChange.send(conversationId)
    }

    public func cleanupRetentionIfNeeded() async {
        if let lastCleanup = lastCleanupDate,
           Date().timeIntervalSince(lastCleanup) < 86400 {
            return
        }

        let oneYearAgo = Calendar.current.date(byAdding: .year, value: -1, to: Date()) ?? Date()
        let convs = await cache.conversations.load(for: "list").snapshot() ?? []

        for conv in convs {
            let messages = await cache.messages.load(for: conv.id).snapshot() ?? []
            guard messages.count > 600 else { continue }

            let recentByDate = messages.filter { $0.createdAt > oneYearAgo }
            let recentByCount = Array(messages.suffix(600))

            let toKeep = recentByDate.count > recentByCount.count ? recentByDate : recentByCount

            if toKeep.count < messages.count {
                do {
                    try await cache.messages.save(toKeep, for: conv.id)
                } catch {
                    Logger.cache.error("ConversationSyncEngine cleanup save failed for \(conv.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        lastCleanupDate = Date()
    }
}
