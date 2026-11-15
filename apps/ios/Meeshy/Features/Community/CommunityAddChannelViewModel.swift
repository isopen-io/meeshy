import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class CommunityAddChannelViewModel: ObservableObject, CommunityAddChannelModeling {
    nonisolated deinit {}

    @Published private(set) var conversations: [APIConversation] = []
    @Published private(set) var titles: [String: String] = [:]
    @Published private(set) var isLoading = true
    @Published private(set) var isLoadingMore = false
    @Published private(set) var hasMore = false
    @Published private(set) var isAdding: String?
    @Published private(set) var errorMessage: String?
    @Published var searchText = ""
    @Published var showMoveConfirm = false
    @Published private(set) var pendingMoveConversation: APIConversation?

    let communityId: String
    private var currentOffset = 0
    private let pageSize = 20
    private let communityService: CommunityServiceProviding
    private let conversationService: ConversationServiceProviding
    private let currentUserId: @MainActor () -> String
    private let onAdded: () -> Void

    init(
        communityId: String,
        onAdded: @escaping () -> Void,
        communityService: CommunityServiceProviding = CommunityService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        currentUserId: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" }
    ) {
        self.communityId = communityId
        self.onAdded = onAdded
        self.communityService = communityService
        self.conversationService = conversationService
        self.currentUserId = currentUserId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await conversationService.list(offset: 0, limit: pageSize)
            conversations = response.data.filter { $0.communityId != communityId }
            titles = communityConversationTitles(conversations, readerId: currentUserId())
            currentOffset = conversations.count
            hasMore = response.data.count >= pageSize
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMore() async {
        guard !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let response = try await conversationService.list(offset: currentOffset, limit: pageSize)
            let known = Set(conversations.map(\.id))
            let newItems = response.data.filter { $0.communityId != communityId && !known.contains($0.id) }
            conversations.append(contentsOf: newItems)
            titles.merge(communityConversationTitles(newItems, readerId: currentUserId()), uniquingKeysWith: { _, latest in latest })
            currentOffset += response.data.count
            hasMore = response.data.count >= pageSize
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func handleTap(_ conversation: APIConversation) {
        if conversation.communityId != nil && conversation.communityId != communityId {
            pendingMoveConversation = conversation
            showMoveConfirm = true
        } else {
            Task { await addConversation(conversation) }
        }
    }

    func confirmMove() {
        guard let conversation = pendingMoveConversation else { return }
        pendingMoveConversation = nil
        Task { await addConversation(conversation) }
    }

    func cancelMove() {
        pendingMoveConversation = nil
    }

    private func addConversation(_ conversation: APIConversation) async {
        isAdding = conversation.id
        defer { isAdding = nil }

        do {
            _ = try await communityService.addConversation(communityId: communityId, conversationId: conversation.id)
            conversations.removeAll { $0.id == conversation.id }
            onAdded()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
