import Foundation
import MeeshySDK
import MeeshyUI

/// Conversation in-thread search. Owns the cursor for pagination so the
/// legacy ViewModel doesn't have to track it manually. Results land on
/// `ConversationStateStore.searchResults`; the legacy ViewModel mirrors
/// them back into its own `@Published` for view-side compatibility during
/// the incremental split.
@MainActor
final class ConversationSearchHandler {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private let state: ConversationStateStore
    private let conversationId: String
    private let messageService: MessageServiceProviding
    private let persistence: MessagePersistenceActor
    private let languageProvider: LanguageProviding
    private var nextCursor: String?

    init(state: ConversationStateStore, conversationId: String, messageService: MessageServiceProviding = MessageService.shared, persistence: MessagePersistenceActor, languageProvider: LanguageProviding = AuthManagerLanguageProvider()) {
        self.state = state
        self.conversationId = conversationId
        self.messageService = messageService
        self.persistence = persistence
        self.languageProvider = languageProvider
    }

    /// Fresh search: resets the cursor, hydrates `state.searchResults`
    /// from the first page. Queries under 2 chars clear the active query.
    func searchMessages(query: String) async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            state.searchResults = []
            state.currentSearchQuery = nil
            state.isSearching = false
            state.searchHasMore = false
            nextCursor = nil
            return
        }

        state.isSearching = true
        state.currentSearchQuery = trimmed
        nextCursor = nil

        do {
            let response = try await messageService.search(conversationId: conversationId, query: trimmed, limit: 20)
            // Persist the matched messages so the in-situ filtered-conversation
            // view can render them as real bubbles — including matches that fall
            // outside the currently-loaded window.
            try? await persistence.upsertFromAPIMessages(response.data, preferredLanguages: languageProvider.preferredLanguages)
            state.searchResults = response.data.map { buildSearchResult($0, query: trimmed) }
            nextCursor = response.cursorPagination?.nextCursor
            state.searchHasMore = response.cursorPagination?.hasMore ?? false
        } catch {
            state.searchResults = []
            state.searchHasMore = false
        }
        state.isSearching = false
    }

    /// Next-page hydration. No-op when there is no live cursor (legacy
    /// callers check `hasMore` before invoking, but we double-guard here).
    func loadMoreSearchResults(query: String) async {
        guard let cursor = nextCursor, state.searchHasMore, !state.isSearching else { return }
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return }

        state.isSearching = true
        do {
            let response = try await messageService.searchWithCursor(
                conversationId: conversationId,
                query: trimmed,
                cursor: cursor
            )
            try? await persistence.upsertFromAPIMessages(response.data, preferredLanguages: languageProvider.preferredLanguages)
            state.searchResults.append(contentsOf: response.data.map { buildSearchResult($0, query: trimmed) })
            nextCursor = response.cursorPagination?.nextCursor
            state.searchHasMore = response.cursorPagination?.hasMore ?? false
        } catch {
            // Transient failure — leave existing page in place, surface hasMore
            // unchanged so the next scroll trigger retries.
        }
        state.isSearching = false
    }

    private func buildSearchResult(_ apiMsg: APIMessage, query: String) -> SearchResultItem {
        let senderName = apiMsg.sender?.displayName ?? apiMsg.sender?.username ?? "?"
        let content = apiMsg.content ?? ""
        let queryLower = query.lowercased()

        // Translation match — surface the translation snippet so the user
        // sees why the message matched even if they don't speak the
        // original language. Original content match takes precedence; when
        // it already matches (or no translation matches either) the
        // untouched-content result below covers it.
        if !content.lowercased().contains(queryLower), let translations = apiMsg.translations {
            for t in translations where t.translatedContent.lowercased().contains(queryLower) {
                return SearchResultItem(
                    id: apiMsg.id, conversationId: apiMsg.conversationId,
                    content: content, matchedText: t.translatedContent, matchType: "translation",
                    senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
                )
            }
        }

        return SearchResultItem(
            id: apiMsg.id, conversationId: apiMsg.conversationId,
            content: content, matchedText: content, matchType: "content",
            senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
        )
    }
}
