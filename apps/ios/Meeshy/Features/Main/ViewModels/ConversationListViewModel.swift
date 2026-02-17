import Foundation
import SwiftUI

@MainActor
class ConversationListViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true

    private let api = APIClient.shared
    private let limit = 15
    private var currentOffset = 0

    // MARK: - Load Conversations

    func loadConversations() async {
        guard !isLoading else { return }
        isLoading = true
        currentOffset = 0

        do {
            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.offsetPaginatedRequest(
                endpoint: "/conversations",
                offset: 0,
                limit: limit
            )

            if response.success {
                let userId = currentUserId
                conversations = response.data.map { $0.toConversation(currentUserId: userId) }
                hasMore = response.pagination?.hasMore ?? false
                currentOffset = conversations.count
            }
        } catch {
            // Keep existing data or empty
            print("[ConversationListVM] Load error: \(error)")
        }

        isLoading = false
    }

    // MARK: - Load More

    func loadMore() async {
        guard hasMore, !isLoadingMore, !isLoading else { return }
        isLoadingMore = true

        do {
            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.offsetPaginatedRequest(
                endpoint: "/conversations",
                offset: currentOffset,
                limit: limit
            )

            if response.success {
                let userId = currentUserId
                let newConversations = response.data.map { $0.toConversation(currentUserId: userId) }
                let existingIds = Set(conversations.map(\.id))
                let deduplicated = newConversations.filter { !existingIds.contains($0.id) }
                conversations.append(contentsOf: deduplicated)
                hasMore = response.pagination?.hasMore ?? false
                currentOffset += deduplicated.count
            }
        } catch {
            print("[ConversationListVM] Load more error: \(error)")
        }

        isLoadingMore = false
    }

    // MARK: - Refresh

    func refresh() async {
        currentOffset = 0
        hasMore = true
        await loadConversations()
    }

    // MARK: - Helpers

    private var currentUserId: String {
        // Extract from JWT token or use placeholder
        // In production, this would come from auth state
        UserDefaults.standard.string(forKey: "meeshy_user_id") ?? ""
    }
}
