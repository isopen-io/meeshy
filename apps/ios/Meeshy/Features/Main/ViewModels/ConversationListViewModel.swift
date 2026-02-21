import Foundation
import SwiftUI
import Combine
import MeeshySDK

@MainActor
class ConversationListViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true

    private let api = APIClient.shared
    private let limit = 30
    private var currentOffset = 0
    private var cancellables = Set<AnyCancellable>()

    init() {
        observeSocketReconnect()
        subscribeToSocketEvents()
    }

    // Re-seed presence when Socket.IO reconnects (online → offline → online)
    private func observeSocketReconnect() {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                Task { [weak self] in
                    await self?.loadConversations()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Real-time Socket Subscriptions

    private func subscribeToSocketEvents() {
        let socketManager = MessageSocketManager.shared

        // Unread count updates from server
        socketManager.unreadUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                if let idx = self.conversations.firstIndex(where: { $0.id == event.conversationId }) {
                    self.conversations[idx].unreadCount = event.unreadCount
                }
            }
            .store(in: &cancellables)

        // New message → update last message preview + bump to top
        socketManager.messageReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiMsg in
                guard let self else { return }
                let convId = apiMsg.conversationId
                guard let idx = self.conversations.firstIndex(where: { $0.id == convId }) else { return }

                self.conversations[idx].lastMessagePreview = apiMsg.content
                self.conversations[idx].lastMessageAt = apiMsg.createdAt

                // Move conversation to top if not already
                if idx > 0 {
                    let conv = self.conversations.remove(at: idx)
                    self.conversations.insert(conv, at: 0)
                }
            }
            .store(in: &cancellables)
    }

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
                PresenceManager.shared.seed(from: response.data, currentUserId: userId)
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
                PresenceManager.shared.seed(from: response.data, currentUserId: userId)
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

    // MARK: - Toggle Pin

    func togglePin(for conversationId: String) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let newValue = !conversations[index].isPinned

        // Optimistic local update
        conversations[index].isPinned = newValue

        do {
            let _: APIResponse<[String: AnyCodable]> = try await api.put(
                endpoint: "/user-preferences/conversations/\(conversationId)",
                body: ["isPinned": newValue]
            )
        } catch {
            // Revert on failure
            conversations[index].isPinned = !newValue
            print("[ConversationListVM] Toggle pin error: \(error)")
        }
    }

    // MARK: - Toggle Mute

    func toggleMute(for conversationId: String) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let newValue = !conversations[index].isMuted

        conversations[index].isMuted = newValue

        do {
            let _: APIResponse<[String: AnyCodable]> = try await api.put(
                endpoint: "/user-preferences/conversations/\(conversationId)",
                body: ["isMuted": newValue]
            )
        } catch {
            conversations[index].isMuted = !newValue
            print("[ConversationListVM] Toggle mute error: \(error)")
        }
    }

    // MARK: - Mark as Read

    func markAsRead(conversationId: String) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let previousCount = conversations[index].unreadCount

        conversations[index].unreadCount = 0

        do {
            let _: APIResponse<[String: AnyCodable]> = try await api.post(
                endpoint: "/conversations/\(conversationId)/mark-read",
                body: [String: String]()
            )
        } catch {
            conversations[index].unreadCount = previousCount
            print("[ConversationListVM] Mark as read error: \(error)")
        }
    }

    // MARK: - Mark as Unread

    func markAsUnread(conversationId: String) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let previousCount = conversations[index].unreadCount

        // Optimistic update
        if conversations[index].unreadCount == 0 {
            conversations[index].unreadCount = 1
        }

        do {
            let _: APIResponse<[String: AnyCodable]> = try await api.post(
                endpoint: "/conversations/\(conversationId)/mark-unread",
                body: [String: String]()
            )
        } catch {
            conversations[index].unreadCount = previousCount
            print("[ConversationListVM] Mark as unread error: \(error)")
        }
    }

    // MARK: - Archive Conversation

    func archiveConversation(conversationId: String) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let wasActive = conversations[index].isActive

        conversations[index].isActive = false

        do {
            let _: APIResponse<[String: AnyCodable]> = try await api.put(
                endpoint: "/user-preferences/conversations/\(conversationId)",
                body: ["isArchived": true]
            )
        } catch {
            conversations[index].isActive = wasActive
            print("[ConversationListVM] Archive error: \(error)")
        }
    }

    // MARK: - Delete Conversation

    func deleteConversation(conversationId: String) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let removed = conversations.remove(at: index)

        do {
            let _ = try await api.delete(endpoint: "/conversations/\(conversationId)")
        } catch {
            conversations.insert(removed, at: min(index, conversations.count))
            print("[ConversationListVM] Delete error: \(error)")
        }
    }

    // MARK: - Move to Section
    // BACKEND_NEEDED: Section/category mapping between iOS sectionId and backend categoryId
    // is not yet aligned. For now, update local state only.

    func moveToSection(conversationId: String, sectionId: String) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        conversations[index].sectionId = sectionId
    }

    // MARK: - Helpers

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }
}
