import Foundation
import MeeshySDK
import os

nonisolated enum HistoryRefresh {
    case page([APIMessage])
    case accessRevoked(reason: String?)
    case unavailable
}

nonisolated struct HistoryPage {
    let messages: [APIMessage]
    let nextCursor: String?
    let hasMore: Bool
}

nonisolated enum CachePlacement {
    case authoritative
    case older
    case newer
}

@MainActor
protocol ConversationHistoryLoading: AnyObject, Sendable {
    func reconcileBeforeOpening() async
    func refreshLatest(warmCache: Bool, readerPrism: [String]) async -> HistoryRefresh
    func fetchOlder(before cursor: String) async throws -> HistoryPage
    func persist(_ messages: [APIMessage], readerPrism: [String]) async
    func fetchMissed(after watermark: Date) async throws -> [APIMessage]
    func restoreAround(ids: [String], limit: Int, readerPrism: [String]) async -> [APIMessage]
    func forgetConversation() async
    func mergeIntoMessageCache(_ messages: [Message], placement: CachePlacement) async
}

@MainActor
final class ConversationHistoryLoader: ConversationHistoryLoading {
    nonisolated deinit {}

    private static let olderPageLimit = 50

    private let conversationId: String
    private let messageService: MessageServiceProviding
    private let persistence: MessagePersistenceActor

    init(conversationId: String, messageService: MessageServiceProviding, persistence: MessagePersistenceActor) {
        self.conversationId = conversationId
        self.messageService = messageService
        self.persistence = persistence
    }

    /// Les trois réconciliations qui précèdent la lecture de la fenêtre : aucune ne lit ce qu'une
    /// autre écrit, elles se recouvrent donc. Outbox épuisé → `.failed`, orphelines `.sending` →
    /// `.failed`, messages poussés par la NSE → GRDB.
    func reconcileBeforeOpening() async {
        async let failedReconciled: Void = persistence.reconcileFailedFromOutbox(conversationId: conversationId)
        async let orphansReconciled: Void = persistence.reconcileOrphanedSendingRows(conversationId: conversationId)
        async let nsePendingDrained: Void = NSEPendingMessageConsumer.shared.consumeAll()
        await failedReconciled
        await orphansReconciled
        await nsePendingDrained
    }

    /// Cache chaud : on demande au gateway d'omettre `translations`, déjà en GRDB et rattrapées par le socket.
    func refreshLatest(warmCache: Bool, readerPrism: [String]) async -> HistoryRefresh {
        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 30,
                includeReplies: true, includeTranslations: !warmCache, languages: nil
            )
            await persist(response.data, readerPrism: readerPrism)
            return .page(response.data)
        } catch let error as MeeshyError {
            return Self.refreshOutcome(for: error)
        } catch {
            return .unavailable
        }
    }

    /// 403 : plus autorisé sur cette ressource. 404/410 : la conversation n'existe plus. Dans les deux
    /// cas les messages en cache ne peuvent plus s'afficher ; le reste est transitoire.
    private static func refreshOutcome(for error: MeeshyError) -> HistoryRefresh {
        switch error {
        case .forbidden(let reason, _):
            return .accessRevoked(reason: reason)
        case .server(404, let message), .server(410, let message):
            return .accessRevoked(reason: message.isEmpty
                ? String(localized: "conversation.error.gone", defaultValue: "Cette conversation n'existe plus")
                : message)
        default:
            return .unavailable
        }
    }

    func fetchOlder(before cursor: String) async throws -> HistoryPage {
        let response = try await messageService.listBefore(
            conversationId: conversationId, before: cursor, limit: Self.olderPageLimit,
            includeReplies: true, includeTranslations: true
        )
        return HistoryPage(
            messages: response.data,
            nextCursor: response.cursorPagination?.nextCursor,
            hasMore: response.cursorPagination?.hasMore ?? (response.data.count >= Self.olderPageLimit)
        )
    }

    func persist(_ messages: [APIMessage], readerPrism: [String]) async {
        try? await persistence.upsertFromAPIMessages(messages, preferredLanguages: readerPrism)
    }

    func fetchMissed(after watermark: Date) async throws -> [APIMessage] {
        let service = messageService
        let convId = conversationId
        return try await ConversationCatchUpGate.shared.pages(conversationId: convId, after: watermark) {
            try await ConversationHistoryLoader.fetchMissedPages(service: service, conversationId: convId, after: watermark)
        }
    }

    /// Chaque adresse est relue indépendamment ; une adresse déjà couverte par une fenêtre
    /// précédente n'a rien à redemander.
    func restoreAround(ids: [String], limit: Int, readerPrism: [String]) async -> [APIMessage] {
        var covered: Set<String> = []
        var served: [APIMessage] = []
        for messageId in ids where !covered.contains(messageId) {
            do {
                let response = try await messageService.listAround(
                    conversationId: conversationId, around: messageId, limit: limit,
                    includeReplies: true, includeTranslations: true, languages: nil
                )
                guard !response.data.isEmpty else { continue }
                await persist(response.data, readerPrism: readerPrism)
                served.append(contentsOf: response.data)
                covered.formUnion(response.data.map(\.id))
            } catch {
                Logger.socket.error("Failed to restore hidden message \(messageId): \(error.localizedDescription)")
            }
        }
        return served
    }

    func forgetConversation() async {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        await CacheCoordinator.shared.conversations.invalidate(for: conversationId)
        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
        try? await persistence.deleteAll(conversationId: conversationId)
    }

    func mergeIntoMessageCache(_ messages: [Message], placement: CachePlacement) async {
        await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { cached in
            Self.merged(messages, into: cached, placement: placement)
        }
    }

    nonisolated static func merged(_ messages: [Message], into cached: [Message], placement: CachePlacement) -> [Message] {
        let incomingIds = Set(messages.map(\.id))
        let cachedIds = Set(cached.map(\.id))
        let sorted: ([Message]) -> [Message] = { $0.sorted { $0.createdAt < $1.createdAt } }
        switch placement {
        case .authoritative:
            return sorted(messages + cached.filter { !incomingIds.contains($0.id) })
        case .older:
            return sorted(messages.filter { !cachedIds.contains($0.id) } + cached)
        case .newer:
            let newOnly = messages.filter { !cachedIds.contains($0.id) }
            return newOnly.isEmpty ? cached : sorted(cached + newOnly)
        }
    }

    /// Les pages `listAfter` depuis un curseur, jusqu'au trou comblé (page de 100, plafond de 1 000).
    nonisolated static func fetchMissedPages(
        service: MessageServiceProviding, conversationId: String, after newestLocal: Date
    ) async throws -> [APIMessage] {
        let pageSize = 100
        let maxTotal = 1000
        // Un cran sous le filigrane : un message du même instant exact n'est pas exclu par le
        // `createdAt > after` strict du gateway ; il resurgit et se dédoublonne par id.
        var cursor = newestLocal.addingTimeInterval(-0.001)
        var collected: [APIMessage] = []
        while collected.count < maxTotal {
            let response = try await service.listAfter(
                conversationId: conversationId, after: cursor, limit: pageSize,
                includeReplies: true, includeTranslations: true, languages: nil
            )
            let page = response.data
            guard !page.isEmpty else { break }
            collected.append(contentsOf: page)
            guard let pageNewest = page.compactMap(\.createdAt).max() else { break }
            cursor = pageNewest
            if page.count < pageSize { break }
        }
        return collected
    }

    /// D'où le rattrapage d'ouverture repart — `nil` quand il n'y a rien à rattraper : rien n'était
    /// détenu (GRDB froid), ou la page du refresh remonte jusqu'au bloc détenu.
    nonisolated static func openingGapCursor(heldUpTo: Date?, refreshReachedBackTo: Date?) -> Date? {
        guard let heldUpTo else { return nil }
        guard let reachedBack = refreshReachedBackTo, reachedBack <= heldUpTo else { return heldUpTo }
        return nil
    }
}
