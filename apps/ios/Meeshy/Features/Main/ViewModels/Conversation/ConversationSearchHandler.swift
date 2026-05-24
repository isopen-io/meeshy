import Foundation
import MeeshySDK
import MeeshyUI

@MainActor
public final class ConversationSearchHandler {
    private let state: ConversationStateStore
    private let conversationId: String
    private let messageService: MessageServiceProviding

    public init(state: ConversationStateStore, conversationId: String, messageService: MessageServiceProviding = MessageService.shared) {
        self.state = state
        self.conversationId = conversationId
        self.messageService = messageService
    }

    func searchMessages(query: String) async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            state.searchResults = []
            state.currentSearchQuery = nil
            state.isSearching = false
            return
        }

        state.isSearching = true
        state.currentSearchQuery = trimmed

        do {
            let response = try await messageService.search(conversationId: conversationId, query: trimmed, limit: 20)
            state.searchResults = response.data.map { buildSearchResult($0, query: trimmed) }
            state.searchHasMore = response.cursorPagination?.hasMore ?? false
        } catch {
            state.searchResults = []
        }
        state.isSearching = false
    }

    private func buildSearchResult(_ apiMsg: APIMessage, query: String) -> SearchResultItem {
        let senderName = apiMsg.sender?.displayName ?? apiMsg.sender?.username ?? "?"
        let content = apiMsg.content ?? ""
        return SearchResultItem(
            id: apiMsg.id, conversationId: apiMsg.conversationId,
            content: content, matchedText: content, matchType: "content",
            senderName: senderName, senderAvatar: apiMsg.sender?.avatar, createdAt: apiMsg.createdAt
        )
    }
}
