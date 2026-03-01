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
    @Published var conversations: [Conversation] = [] {
        didSet { _convIdIndex = nil }
    }
    @Published var userCategories: [ConversationSection] = []
    @Published var isLoading = false
    @Published private(set) var isLoadingMore = false
    private var hasMore = true

    // MARK: - Reactive Filters & Prepared Data
    @Published var searchText: String = ""
    @Published var selectedFilter: ConversationFilter = .all
    @Published var filteredConversations: [Conversation] = []
    @Published var groupedConversations: [(section: ConversationSection, conversations: [Conversation])] = []
    @Published var typingConversationIds: Set<String> = []
    private var typingTimers: [String: Timer] = [:]

    var totalUnreadCount: Int {
        conversations.reduce(0) { $0 + $1.unreadCount }
    }

    private let api = APIClient.shared
    private let pageLimit = 100
    /// Au-delà de ce seuil le scroll infini (loadMore) reprend la main
    private let autoLoadCap = 1000
    private var currentOffset = 0
    private var cancellables = Set<AnyCancellable>()

    // O(1) conversation lookup by ID
    private var _convIdIndex: [String: Int]?
    private func convIndex(for id: String) -> Int? {
        if _convIdIndex == nil {
            var index = [String: Int](minimumCapacity: conversations.count)
            for (i, c) in conversations.enumerated() { index[c.id] = i }
            _convIdIndex = index
        }
        return _convIdIndex![id]
    }

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
        setupBackgroundProcessing()
    }

    // MARK: - Background Processing
    private func setupBackgroundProcessing() {
        // Offload filtering and grouping to a background queue to prevent Main Thread freezes
        Publishers.CombineLatest3($conversations, $searchText, $selectedFilter)
            .receive(on: DispatchQueue.global(qos: .userInitiated))
            // Only debounce if there is text to avoid delay on initial load or simple filter taps
            .debounce(for: .milliseconds(150), scheduler: DispatchQueue.global(qos: .userInitiated))
            .map { [weak self] (convs, text, filter) -> [Conversation] in
                guard self != nil else { return [] }
                return convs.filter { c in
                    let filterMatch: Bool
                    switch filter {
                    case .all: filterMatch = c.isActive
                    case .unread: filterMatch = c.unreadCount > 0
                    case .personnel: filterMatch = c.type == .direct && c.isActive
                    case .privee: filterMatch = c.type == .group && c.isActive
                    case .ouvertes: filterMatch = (c.type == .public || c.type == .community) && c.isActive
                    case .globales: filterMatch = c.type == .global && c.isActive
                    case .channels: filterMatch = c.isAnnouncementChannel && c.isActive
                    case .archived: filterMatch = !c.isActive
                    }
                    let searchMatch = text.isEmpty || c.name.localizedCaseInsensitiveContains(text)
                    return filterMatch && searchMatch
                }
            }
            .receive(on: DispatchQueue.main)
            .assign(to: &$filteredConversations)

        Publishers.CombineLatest($filteredConversations, $userCategories)
            .receive(on: DispatchQueue.global(qos: .userInitiated))
            .map { (filtered, categories) -> [(section: ConversationSection, conversations: [Conversation])] in
                var result: [(section: ConversationSection, conversations: [Conversation])] = []

                // O(1) lookup sets
                let categoryIds = Set(categories.map(\.id))

                // Groupement O(n) unique — remplace les k passes filter O(n×k)
                let bySection = Dictionary(grouping: filtered) { conv -> String in
                    if conv.isPinned && conv.sectionId == nil { return "__pinned__" }
                    return conv.sectionId ?? "__other__"
                }

                // Pinned section
                if let pinned = bySection["__pinned__"], !pinned.isEmpty {
                    result.append((ConversationSection.pinned, pinned.sorted { $0.lastMessageAt > $1.lastMessageAt }))
                }

                // User categories (order preserved)
                for category in categories {
                    if let sectionConvs = bySection[category.id], !sectionConvs.isEmpty {
                        let sorted = sectionConvs.sorted { a, b in
                            if a.isPinned != b.isPinned { return a.isPinned }
                            return a.lastMessageAt > b.lastMessageAt
                        }
                        result.append((category, sorted))
                    }
                }

                // Orphaned (catégorie supprimée) + non-catégorisées → section "other"
                let otherConvs = (bySection["__other__"] ?? []) + filtered.filter { conv in
                    guard let sid = conv.sectionId else { return false }
                    return !categoryIds.contains(sid)
                }
                if !otherConvs.isEmpty {
                    result.append((ConversationSection.other, otherConvs.sorted { $0.lastMessageAt > $1.lastMessageAt }))
                }

                return result
            }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newGroups in
                self?.groupedConversations = newGroups
            }
            .store(in: &cancellables)
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
                guard let idx = self.convIndex(for: event.conversationId) else { return }
                self.conversations[idx].unreadCount = event.unreadCount
                // Fast-path: mise à jour directe de groupedConversations (pas d'attente pipeline 150ms)
                let cid = event.conversationId
                let newCount = event.unreadCount
                for i in 0..<self.groupedConversations.count {
                    if let rowIdx = self.groupedConversations[i].conversations.firstIndex(where: { $0.id == cid }) {
                        self.groupedConversations[i].conversations[rowIdx].unreadCount = newCount
                        break
                    }
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
                guard let idx = self.convIndex(for: convId) else { return }

                let preview = apiMsg.content
                let senderName = apiMsg.sender?.displayName ?? apiMsg.sender?.username
                let msgDate = apiMsg.createdAt

                self.conversations[idx].lastMessagePreview = preview
                self.conversations[idx].lastMessageSenderName = senderName
                self.conversations[idx].lastMessageAt = msgDate
                self.conversations[idx].lastMessageId = apiMsg.id
                self.conversations[idx].lastMessageIsBlurred = apiMsg.isBlurred ?? false
                self.conversations[idx].lastMessageIsViewOnce = apiMsg.isViewOnce ?? false
                self.conversations[idx].lastMessageExpiresAt = apiMsg.expiresAt

                // Move conversation to top if not already
                if idx > 0 {
                    let conv = self.conversations.remove(at: idx)
                    self.conversations.insert(conv, at: 0)
                }

                // Fast-path: mise à jour directe de groupedConversations (pas d'attente pipeline 150ms)
                for i in 0..<self.groupedConversations.count {
                    guard let rowIdx = self.groupedConversations[i].conversations.firstIndex(where: { $0.id == convId }) else { continue }
                    self.groupedConversations[i].conversations[rowIdx].lastMessagePreview = preview
                    self.groupedConversations[i].conversations[rowIdx].lastMessageSenderName = senderName
                    self.groupedConversations[i].conversations[rowIdx].lastMessageAt = msgDate
                    self.groupedConversations[i].conversations[rowIdx].lastMessageId = apiMsg.id
                    self.groupedConversations[i].conversations[rowIdx].lastMessageIsBlurred = apiMsg.isBlurred ?? false
                    self.groupedConversations[i].conversations[rowIdx].lastMessageIsViewOnce = apiMsg.isViewOnce ?? false
                    self.groupedConversations[i].conversations[rowIdx].lastMessageExpiresAt = apiMsg.expiresAt
                    // Remonter en tête de section (sauf pinned)
                    if rowIdx > 0 && self.groupedConversations[i].section.id != "pinned" {
                        let conv = self.groupedConversations[i].conversations.remove(at: rowIdx)
                        self.groupedConversations[i].conversations.insert(conv, at: 0)
                    }
                    break
                }
            }
            .store(in: &cancellables)

        // Typing indicator — affiche "est en train d'écrire" dans le row
        socketManager.typingStarted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                typingConversationIds.insert(event.conversationId)
                scheduleTypingCleanup(for: event.conversationId)
            }
            .store(in: &cancellables)

        socketManager.typingStopped
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.clearTyping(for: event.conversationId)
            }
            .store(in: &cancellables)
    }

    // MARK: - Typing Cleanup

    private func scheduleTypingCleanup(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.clearTyping(for: conversationId)
            }
        }
    }

    private func clearTyping(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = nil
        typingConversationIds.remove(conversationId)
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

        // Afficher le cache immédiatement
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
                limit: pageLimit
            )

            if response.success {
                let userId = currentUserId
                PresenceManager.shared.seed(from: response.data, currentUserId: userId)
                conversations = response.data.map { $0.toConversation(currentUserId: userId) }
                hasMore = response.pagination?.hasMore ?? false
                currentOffset = conversations.count
                lastFetchedAt = Date()

                Task.detached(priority: .utility) { [conversations] in
                    await LocalStore.shared.saveConversations(conversations)
                    await LocalStore.shared.cleanupStaleMessageCaches()
                }

                prefetchMessages(for: response.data, userId: userId)

                // Charger les pages suivantes silencieusement en arrière-plan
                if hasMore {
                    Task { await self.loadAllRemainingBackground() }
                }
            }
        } catch { }

        await categoriesTask
        isLoading = false
    }

    // MARK: - Force Refresh (pull-to-refresh)
    // Recharge les conversations depuis l'API puis continue en arrière-plan

    func forceRefresh() async {
        isLoading = false
        hasMore = true
        currentOffset = 0
        invalidateCache()
        await loadConversations()
    }

    // MARK: - Refresh

    func refresh() async {
        currentOffset = 0
        hasMore = true
        await loadConversations()
    }

    // MARK: - Background full load (pages 2+, silencieux, cap = autoLoadCap)
    // Au-delà du cap, loadMore() public prend le relais (scroll infini pour power users)

    private func loadAllRemainingBackground() async {
        while hasMore && !isLoadingMore && conversations.count < autoLoadCap {
            isLoadingMore = true
            do {
                let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.offsetPaginatedRequest(
                    endpoint: "/conversations",
                    offset: currentOffset,
                    limit: pageLimit
                )

                if response.success {
                    let userId = currentUserId
                    PresenceManager.shared.seed(from: response.data, currentUserId: userId)
                    let incoming = response.data.map { $0.toConversation(currentUserId: userId) }
                    let deduplicated = incoming.filter { convIndex(for: $0.id) == nil }
                    if !deduplicated.isEmpty {
                        conversations.append(contentsOf: deduplicated)
                    }
                    hasMore = response.pagination?.hasMore ?? false
                    currentOffset += deduplicated.count

                    Task.detached(priority: .background) { [snapshot = self.conversations] in
                        await LocalStore.shared.saveConversations(snapshot)
                    }
                } else {
                    hasMore = false
                }
            } catch {
                hasMore = false
            }
            isLoadingMore = false
        }
    }

    // MARK: - Load More (scroll infini — uniquement pour users avec >1000 conversations)

    func loadMore() async {
        guard hasMore, !isLoadingMore, !isLoading, conversations.count >= autoLoadCap else { return }
        isLoadingMore = true

        do {
            let response: OffsetPaginatedAPIResponse<[APIConversation]> = try await api.offsetPaginatedRequest(
                endpoint: "/conversations",
                offset: currentOffset,
                limit: pageLimit
            )

            if response.success {
                let userId = currentUserId
                PresenceManager.shared.seed(from: response.data, currentUserId: userId)
                let newConversations = response.data.map { $0.toConversation(currentUserId: userId) }
                let deduplicated = newConversations.filter { convIndex(for: $0.id) == nil }
                conversations.append(contentsOf: deduplicated)
                hasMore = response.pagination?.hasMore ?? false
                currentOffset += deduplicated.count
            }
        } catch { }

        isLoadingMore = false
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
        guard let index = convIndex(for: conversationId) else { return }
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
        guard let index = convIndex(for: conversationId) else { return }
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
        guard let index = convIndex(for: conversationId) else { return }
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
        guard let index = convIndex(for: conversationId) else { return }
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
        guard let index = convIndex(for: conversationId) else { return }
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

    // MARK: - Unarchive Conversation

    func unarchiveConversation(conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let wasActive = conversations[index].isActive

        conversations[index].isActive = true

        do {
            let _: APIResponse<[String: AnyCodable]> = try await api.put(
                endpoint: "/user-preferences/conversations/\(conversationId)",
                body: ["isArchived": false]
            )
        } catch {
            conversations[index].isActive = wasActive
        }
    }

    // MARK: - Delete Conversation

    func deleteConversation(conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
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
        guard let index = convIndex(for: conversationId) else { return }
        let previousSectionId = conversations[index].sectionId
        let newSectionId: String? = sectionId.isEmpty ? nil : sectionId
        conversations[index].sectionId = newSectionId

        Task {
            do {
                let body: [String: String?] = ["categoryId": newSectionId]
                let _: APIResponse<[String: AnyCodable]> = try await api.put(
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
