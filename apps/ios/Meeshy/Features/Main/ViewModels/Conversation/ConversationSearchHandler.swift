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
    private let state: ConversationStateStore
    private let conversationId: String
    private let messageService: MessageServiceProviding
    private var nextCursor: String?

    init(state: ConversationStateStore, conversationId: String, messageService: MessageServiceProviding = MessageService.shared) {
        self.state = state
        self.conversationId = conversationId
        self.messageService = messageService
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

        // Original content match takes precedence — that's what the bubble
        // ultimately renders.
        if content.lowercased().contains(queryLower) {
            return SearchResultItem(
                id: apiMsg.id, conversationId: apiMsg.conversationId,
                content: content, matchedText: content, matchType: "content",
                senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
            )
        }

        // Translation match — surface the translation snippet so the user
        // sees why the message matched even if they don't speak the
        // original language.
        if let translations = apiMsg.translations {
            for t in translations where t.translatedContent.lowercased().contains(queryLower) {
                return SearchResultItem(
                    id: apiMsg.id, conversationId: apiMsg.conversationId,
                    content: content, matchedText: t.translatedContent, matchType: "translation",
                    senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
                )
            }
        }

        // Defensive fallback (the gateway shouldn't return a non-matching
        // hit, but if it does we still render the content untouched).
        return SearchResultItem(
            id: apiMsg.id, conversationId: apiMsg.conversationId,
            content: content, matchedText: content, matchType: "content",
            senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
        )
    }
}
