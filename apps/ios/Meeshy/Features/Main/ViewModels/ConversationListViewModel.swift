import Foundation
import SwiftUI
import Combine
import WidgetKit
import MeeshySDK

// MARK: - API Category Model

struct APICategory: Decodable {
    let id: String
    let name: String
    let color: String?
    let icon: String?
    let order: Int
    let isExpanded: Bool?
}

@MainActor
class ConversationListViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var userCategories: [ConversationSection] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true

    var totalUnreadCount: Int {
        conversations.reduce(0) { $0 + $1.unreadCount }
    }

    private let api = APIClient.shared
    private let limit = 30
    private var currentOffset = 0
    private var cancellables = Set<AnyCancellable>()

    private var lastFetchedAt: Date? = nil
    private let cacheTTL: TimeInterval = 30

    private var isCacheValid: Bool {
        guard let ts = lastFetchedAt else { return false }
        return Date().timeIntervalSince(ts) < cacheTTL
    }

    func invalidateCache() {
        lastFetchedAt = nil
    }

    init() {
        observeSocketReconnect()
        subscribeToSocketEvents()
        syncBadgeOnUnreadChange()
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
                invalidateCache()
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
                invalidateCache()
                let convId = apiMsg.conversationId
                guard let idx = self.conversations.firstIndex(where: { $0.id == convId }) else { return }

                self.conversations[idx].lastMessagePreview = apiMsg.content
                self.conversations[idx].lastMessageSenderName = apiMsg.sender?.displayName ?? apiMsg.sender?.username
                self.conversations[idx].lastMessageAt = apiMsg.createdAt

                // Move conversation to top if not already
                if idx > 0 {
                    let conv = self.conversations.remove(at: idx)
                    self.conversations.insert(conv, at: 0)
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Badge Sync

    private func syncBadgeOnUnreadChange() {
        $conversations
            .removeDuplicates { $0.map(\.id) == $1.map(\.id) && $0.map(\.unreadCount) == $1.map(\.unreadCount) }
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] conversations in
                guard self != nil else { return }
                let total = conversations.reduce(0) { $0 + $1.unreadCount }
                Task {
                    await PushNotificationManager.shared.updateBadge(totalUnread: total)
                }
                WidgetDataManager.shared.updateConversations(conversations)
                WidgetDataManager.shared.updateFavoriteContacts(conversations)
            }
            .store(in: &cancellables)
    }

    // MARK: - Load Categories

    func loadCategories() async {
        do {
            let response: APIResponse<[APICategory]> = try await api.request(
                endpoint: "/me/preferences/categories"
            )
            if response.success {
                let categories = response.data
                userCategories = categories.map { cat in
                    ConversationSection(
                        id: cat.id,
                        name: cat.name,
                        icon: cat.icon ?? "folder.fill",
                        color: cat.color?.replacingOccurrences(of: "#", with: "") ?? "45B7D1",
                        isExpanded: cat.isExpanded ?? true,
                        order: cat.order
                    )
                }.sorted { $0.order < $1.order }
            }
        } catch {
            // Categories are optional, keep empty
        }
    }

    // MARK: - Load Conversations

    func loadConversations() async {
        if isCacheValid && !conversations.isEmpty {
            return
        }

        guard !isLoading else { return }
        isLoading = true
        currentOffset = 0

        // Show cached conversations immediately while fetching from API
        if conversations.isEmpty {
            let cached = await LocalStore.shared.loadConversations()
            if !cached.isEmpty {
                conversations = cached
            }
        }

        async let categoriesTask: () = loadCategories()

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
                lastFetchedAt = Date()

                // Update cache in background
                Task.detached(priority: .utility) { [conversations] in
                    await LocalStore.shared.saveConversations(conversations)
                    await LocalStore.shared.cleanupStaleMessageCaches()
                }

                prefetchMessages(for: response.data, userId: userId)
            }
        } catch { }

        await categoriesTask
        isLoading = false
    }

    // MARK: - Force Refresh (pull-to-refresh)

    func forceRefresh() async {
        isLoading = false
        hasMore = true
        currentOffset = 0
        invalidateCache()
        await loadConversations()
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
        } catch { }

        isLoadingMore = false
    }

    // MARK: - Refresh

    func refresh() async {
        currentOffset = 0
        hasMore = true
        await loadConversations()
    }

    // MARK: - Persist Category Expansion

    func persistCategoryExpansion(id: String, isExpanded: Bool) {
        Task {
            let _: APIResponse<AnyCodable>? = try? await api.patch(
                endpoint: "/me/preferences/categories/\(id)",
                body: ["isExpanded": isExpanded]
            )
        }
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
            conversations[index].isPinned = !newValue
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
        }
    }

    // MARK: - Delete Conversation

    func deleteConversation(conversationId: String) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let removed = conversations.remove(at: index)

        do {
            let _ = try await api.delete(
                endpoint: "/conversations/\(conversationId)/delete-for-me"
            )
        } catch {
            conversations.insert(removed, at: min(index, conversations.count))
        }
    }

    // MARK: - Move to Section

    func moveToSection(conversationId: String, sectionId: String) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let previousSectionId = conversations[index].sectionId
        let newSectionId: String? = sectionId.isEmpty ? nil : sectionId
        conversations[index].sectionId = newSectionId

        Task {
            do {
                let body: [String: String?] = ["categoryId": newSectionId]
                let _: APIResponse<[String: String]> = try await api.put(
                    endpoint: "/user-preferences/conversations/\(conversationId)",
                    body: body
                )
            } catch {
                conversations[index].sectionId = previousSectionId
            }
        }
    }

    // MARK: - React to Last Message

    func reactToLastMessage(conversationId: String, messageId: String, emoji: String) async {
        do {
            let _: APIResponse<[String: AnyCodable]> = try await api.post(
                endpoint: "/conversations/\(conversationId)/messages/\(messageId)/reactions",
                body: ["emoji": emoji]
            )
        } catch { }
    }

    // MARK: - Message Prefetch

    private func prefetchMessages(for apiConversations: [APIConversation], userId: String) {
        let toFetch = Array(apiConversations.prefix(20))

        Task.detached(priority: .utility) {
            await withTaskGroup(of: Void.self) { group in
                for apiConversation in toFetch {
                    let conversationId = apiConversation.id
                    let cached = await LocalStore.shared.loadMessages(for: conversationId)
                    if !cached.isEmpty { continue }

                    group.addTask {
                        do {
                            let response = try await MessageService.shared.list(
                                conversationId: conversationId,
                                limit: 20
                            )
                            if response.success {
                                let messages = response.data.reversed().map {
                                    $0.toMessage(currentUserId: userId)
                                }
                                await LocalStore.shared.saveMessages(Array(messages), for: conversationId)
                            }
                        } catch { }
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }
}
