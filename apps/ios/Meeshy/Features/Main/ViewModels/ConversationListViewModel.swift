import Foundation
import SwiftUI
import Combine
import WidgetKit
import os
import MeeshySDK

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
    /// Typing usernames indexed by conversationId. NOT @Published to avoid triggering
    /// a full list re-render on every typing event from any conversation.
    /// Rows read this during natural re-renders (scroll, message arrival).
    var typingUsernames: [String: String] = [:]  // conversationId → displayName
    var previewMessages: [String: [Message]] = [:]  // conversationId → recent messages (non-Published — only used in context menu preview)
    private var previewLoadingInFlight: Set<String> = []
    private var typingTimers: [String: Timer] = [:]

    var totalUnreadCount: Int {
        conversations.reduce(0) { $0 + $1.unreadCount }
    }

    private let api: APIClientProviding
    private let conversationService: ConversationServiceProviding
    private let preferenceService: PreferenceServiceProviding
    private let messageSocket: MessageSocketProviding
    private let messageService: MessageServiceProviding
    private let authManager: AuthManaging
    private let storyService: StoryServiceProviding
    private let syncEngine: ConversationSyncEngineProviding
    private let pageLimit = 100
    /// Au-delà de ce seuil le scroll infini (loadMore) reprend la main
    private let autoLoadCap = 1000
    private var currentOffset = 0
    private var cancellables = Set<AnyCancellable>()
    private var storyPrefetchTask: Task<Void, Never>?

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
        Task.detached { await CacheCoordinator.shared.conversations.invalidateAll() }
    }

    init(
        api: APIClientProviding = APIClient.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        preferenceService: PreferenceServiceProviding = PreferenceService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        authManager: AuthManaging = AuthManager.shared,
        storyService: StoryServiceProviding = StoryService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared
    ) {
        self.api = api
        self.conversationService = conversationService
        self.preferenceService = preferenceService
        self.messageSocket = messageSocket
        self.messageService = messageService
        self.authManager = authManager
        self.storyService = storyService
        self.syncEngine = syncEngine
        subscribeToSocketEvents()
        syncBadgeOnUnreadChange()
        setupBackgroundProcessing()
        observeMarkAsRead()
    }

    private var groupingTask: Task<Void, Never>?

    // MARK: - Background Processing
    private func setupBackgroundProcessing() {
        // Pipeline 1: Filtrage (debounce 150ms sur main thread — filter est O(n) rapide)
        Publishers.CombineLatest3($conversations, $searchText, $selectedFilter)
            .debounce(for: .milliseconds(150), scheduler: DispatchQueue.main)
            .sink { [weak self] (convs, text, filter) in
                self?.filteredConversations = Self.filterConversations(convs, searchText: text, filter: filter)
            }
            .store(in: &cancellables)

        // Pipeline 2: Groupement en arrière-plan
        Publishers.CombineLatest($filteredConversations, $userCategories)
            .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
            .sink { [weak self] (filtered, categories) in
                guard let self else { return }
                self.groupingTask?.cancel()
                self.groupingTask = Task.detached(priority: .userInitiated) {
                    guard !Task.isCancelled else { return }
                    let grouped = Self.groupConversations(filtered, categories: categories)
                    guard !Task.isCancelled else { return }
                    await MainActor.run { [weak self] in
                        self?.groupedConversations = grouped
                    }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Static Processing Methods (thread-safe)

    /// Filtre les conversations selon le texte de recherche et le filtre sélectionné
    /// - Peut s'exécuter sur n'importe quel thread (pas d'accès à self)
    nonisolated private static func filterConversations(
        _ conversations: [Conversation],
        searchText: String,
        filter: ConversationFilter
    ) -> [Conversation] {
        return conversations.filter { c in
            let filterMatch: Bool
            switch filter {
            case .all: filterMatch = c.isActive
            case .unread: filterMatch = c.unreadCount > 0
            case .personnel: filterMatch = c.type == .direct && c.isActive
            case .privee: filterMatch = c.type == .group && c.isActive
            case .ouvertes: filterMatch = (c.type == .public || c.type == .community) && c.isActive
            case .globales: filterMatch = c.type == .global && c.isActive
            case .channels: filterMatch = c.isAnnouncementChannel && c.isActive
            case .favoris: filterMatch = c.reaction != nil && c.isActive
            case .archived: filterMatch = !c.isActive
            }
            let searchMatch = searchText.isEmpty || c.name.localizedCaseInsensitiveContains(searchText)
            return filterMatch && searchMatch
        }
    }

    /// Groupe les conversations par section et les trie
    /// - Peut s'exécuter sur n'importe quel thread (pas d'accès à self)
    nonisolated private static func groupConversations(
        _ filtered: [Conversation],
        categories: [ConversationSection]
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
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

    // MARK: - Sync Engine Observation

    func observeSync() {
        let publisher = syncEngine.conversationsDidChange
        publisher
            .receive(on: DispatchQueue.main)
            .debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                Task { @MainActor [weak self] in
                    await self?.reloadFromCache()
                }
            }
            .store(in: &cancellables)
    }

    private func reloadFromCache() async {
        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let data, _), .stale(let data, _):
            conversations = data
        case .expired, .empty:
            break
        }
    }

    // MARK: - Real-time Socket Subscriptions

    private func subscribeToSocketEvents() {
        // Typing indicator — affiche "<Auteur> écrit..." dans le row
        messageSocket.typingStarted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                typingUsernames[event.conversationId] = event.username
                scheduleTypingCleanup(for: event.conversationId)
            }
            .store(in: &cancellables)

        messageSocket.typingStopped
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.clearTyping(for: event.conversationId)
            }
            .store(in: &cancellables)

        messageSocket.userPreferencesUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let convId = event.conversationId else { return }
                if let idx = conversations.firstIndex(where: { $0.id == convId }) {
                    var conv = conversations[idx]
                    if let isPinned = event.isPinned { conv.isPinned = isPinned }
                    if let isMuted = event.isMuted { conv.isMuted = isMuted }
                    conversations[idx] = conv
                }
            }
            .store(in: &cancellables)

        messageSocket.conversationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                if let title = event.title { self.conversations[index].title = title }
                if let description = event.description { self.conversations[index].description = description }
                if let avatar = event.avatar { self.conversations[index].avatar = avatar }
                if let banner = event.banner { self.conversations[index].banner = banner }
                if let isAnnouncement = event.isAnnouncementChannel {
                    self.conversations[index].isAnnouncementChannel = isAnnouncement
                }
            }
            .store(in: &cancellables)

        messageSocket.participantSelfLeft
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount -= 1
            }
            .store(in: &cancellables)

        messageSocket.participantBanned
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount -= 1
            }
            .store(in: &cancellables)

        messageSocket.participantUnbanned
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount += 1
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
        typingUsernames.removeValue(forKey: conversationId)
    }

    // MARK: - Badge Sync

    private func syncBadgeOnUnreadChange() {
        $conversations
            .map { convs in convs.reduce(0) { $0 + $1.unreadCount } }
            .removeDuplicates()
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] total in
                guard let self else { return }
                Task {
                    await PushNotificationManager.shared.updateBadge(totalUnread: total)
                }
                WidgetDataManager.shared.updateConversations(self.conversations)
                WidgetDataManager.shared.updateFavoriteContacts(self.conversations)
            }
            .store(in: &cancellables)
    }

    // MARK: - Load Categories

    func loadCategories() async {
        do {
            let categories = try await preferenceService.getCategories()
            userCategories = categories.map { cat in
                ConversationSection(
                    id: cat.id,
                    name: cat.name,
                    icon: cat.icon ?? "folder.fill",
                    color: cat.color?.replacingOccurrences(of: "#", with: "") ?? "45B7D1",
                    isExpanded: cat.isExpanded ?? true,
                    order: cat.order ?? 0
                )
            }.sorted { $0.order < $1.order }
        } catch {
            // Categories are optional, keep empty
        }
    }

    // MARK: - Load Conversations

    func loadConversations() async {
        guard !isLoading else { return }

        async let categoriesTask: () = loadCategories()

        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let data, _):
            conversations = data
            lastFetchedAt = Date()
        case .stale(let data, _):
            conversations = data
            lastFetchedAt = Date()
            Task { [weak self] in await self?.syncEngine.syncSinceLastCheckpoint() }
        case .expired, .empty:
            isLoading = true
            await syncEngine.fullSync()
            let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
            if let data = reloaded.value {
                conversations = data
            }
            lastFetchedAt = Date()
            isLoading = false
        }

        // Précharger en arrière-plan
        prefetchRecentStories()
        prefetchTopConversationMessages()

        await categoriesTask
    }

    // MARK: - Force Refresh (pull-to-refresh)
    // Recharge les conversations depuis l'API puis continue en arrière-plan

    func forceRefresh() async {
        invalidateCache()
        isLoading = true
        await syncEngine.fullSync()
        let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
        if let data = reloaded.value {
            conversations = data
        }
        lastFetchedAt = Date()
        isLoading = false
        prefetchRecentStories()
    }

    // MARK: - Refresh

    func refresh() async {
        await syncEngine.syncSinceLastCheckpoint()
        await reloadFromCache()
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

        conversations[index].isPinned = newValue

        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(isPinned: newValue)
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
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(isMuted: newValue)
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
        await syncEngine.markConversationReadLocally(conversationId)

        guard UserPreferencesManager.shared.privacy.showReadReceipts else { return }
        do {
            try await conversationService.markRead(conversationId: conversationId)
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
            try await conversationService.markUnread(conversationId: conversationId)
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
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(isArchived: true)
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
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(isArchived: false)
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
            try await conversationService.deleteForMe(conversationId: conversationId)
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
                try await preferenceService.updateConversationPreferences(
                    conversationId: conversationId,
                    request: .init(categoryId: newSectionId)
                )
            } catch {
                conversations[index].sectionId = previousSectionId
            }
        }
    }

    // MARK: - Favorite Reaction

    func setFavoriteReaction(conversationId: String, emoji: String?) async {
        guard let index = convIndex(for: conversationId) else { return }
        let previous = conversations[index].reaction
        conversations[index].reaction = emoji
        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(reaction: emoji)
            )
        } catch {
            conversations[index].reaction = previous
        }
    }

    // MARK: - Message Prefetch

    func loadPreviewMessages(for conversationId: String) async {
        guard previewMessages[conversationId] == nil,
              !previewLoadingInFlight.contains(conversationId) else { return }
        previewLoadingInFlight.insert(conversationId)
        defer { previewLoadingInFlight.remove(conversationId) }
        let cached = await CacheCoordinator.shared.messages.load(for: conversationId).value ?? []
        if !cached.isEmpty {
            previewMessages[conversationId] = Array(cached.suffix(5))
            return
        }
        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 5, includeReplies: false
            )
            let userId = currentUserId
            let msgs = response.data.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: AuthManager.shared.currentUser?.username) }
            previewMessages[conversationId] = msgs
        } catch { }
    }

    private func prefetchMessages(for apiConversations: [APIConversation], userId: String) {
        let toFetch = Array(apiConversations.prefix(20))
        let messageService = self.messageService
        let username = AuthManager.shared.currentUser?.username

        Task.detached(priority: .utility) {
            await withTaskGroup(of: Void.self) { group in
                for apiConversation in toFetch {
                    let conversationId = apiConversation.id
                    let cached = await CacheCoordinator.shared.messages.load(for: conversationId).value ?? []
                    if !cached.isEmpty { continue }

                    group.addTask {
                        do {
                            let response = try await messageService.list(
                                conversationId: conversationId,
                                offset: 0,
                                limit: 20,
                                includeReplies: true
                            )
                            if response.success {
                                let messages = response.data.reversed().map {
                                    $0.toMessage(currentUserId: userId, currentUsername: username)
                                }
                                await CacheCoordinator.shared.messages.save(Array(messages), for: conversationId)
                            }
                        } catch { }
                    }
                }
            }
        }
    }

    // MARK: - Message Prefetch

    /// Précharge les messages des top 20 conversations qui n'ont pas encore de cache.
    private func prefetchTopConversationMessages() {
        let topConversations = Array(conversations.prefix(20))
        let messageService = self.messageService
        let userId = AuthManager.shared.currentUser?.id ?? ""
        let username = AuthManager.shared.currentUser?.username

        Task.detached(priority: .utility) {
            await withTaskGroup(of: Void.self) { group in
                for conversation in topConversations {
                    let conversationId = conversation.id
                    let cached = await CacheCoordinator.shared.messages.load(for: conversationId).value ?? []
                    if !cached.isEmpty { continue }

                    group.addTask {
                        do {
                            let response = try await messageService.list(
                                conversationId: conversationId,
                                offset: 0,
                                limit: 20,
                                includeReplies: true
                            )
                            if response.success {
                                let messages = response.data.reversed().map {
                                    $0.toMessage(currentUserId: userId, currentUsername: username)
                                }
                                await CacheCoordinator.shared.messages.save(Array(messages), for: conversationId)
                            }
                        } catch { }
                    }
                }
            }
        }
    }

    // MARK: - Story Prefetch

    /// Précharge les stories : 2 premières de chaque groupe + 3 premiers groupes complets.
    /// Utilise les DiskCacheStore existants (images/video) avec cache-hit check.
    private func prefetchRecentStories() {
        storyPrefetchTask?.cancel()

        storyPrefetchTask = Task.detached(priority: .utility) { [storyService = self.storyService] in
            do {
                let response = try await storyService.list(cursor: nil, limit: 30)
                guard response.success, !Task.isCancelled else { return }

                let storyGroups = response.data.toStoryGroups()
                guard !storyGroups.isEmpty else { return }

                // Collecter les URLs à précharger (2 par groupe + reste des 3 premiers)
                var imageURLs: [String] = []
                var videoURLs: [String] = []
                for (i, group) in storyGroups.enumerated() {
                    let limit = i < 3 ? group.stories.count : min(2, group.stories.count)
                    for story in group.stories.prefix(limit) {
                        for media in story.media {
                            guard let url = media.url, !url.isEmpty else { continue }
                            switch media.type {
                            case .video:
                                videoURLs.append(url)
                            default:
                                imageURLs.append(url)
                            }
                        }
                    }
                }

                // Précharger images par lots de 8
                let imageStore = await CacheCoordinator.shared.images
                let uniqueImageURLs = Array(Set(imageURLs))
                for chunk in stride(from: 0, to: uniqueImageURLs.count, by: 8) {
                    guard !Task.isCancelled else { return }
                    let end = min(chunk + 8, uniqueImageURLs.count)
                    await withTaskGroup(of: Void.self) { taskGroup in
                        for urlString in uniqueImageURLs[chunk..<end] {
                            taskGroup.addTask {
                                _ = await imageStore.image(for: urlString)
                            }
                        }
                    }
                }

                // Précharger vidéos par lots de 4 (plus lourds)
                let videoStore = await CacheCoordinator.shared.video
                let uniqueVideoURLs = Array(Set(videoURLs))
                for chunk in stride(from: 0, to: uniqueVideoURLs.count, by: 4) {
                    guard !Task.isCancelled else { return }
                    let end = min(chunk + 4, uniqueVideoURLs.count)
                    await withTaskGroup(of: Void.self) { taskGroup in
                        for urlString in uniqueVideoURLs[chunk..<end] {
                            taskGroup.addTask {
                                _ = try? await videoStore.data(for: urlString)
                            }
                        }
                    }
                }

                await CacheCoordinator.shared.stories.save(storyGroups, for: "recent_tray")
                Logger.messages.info("[ConversationListVM] Stories prefetched: \(storyGroups.count) groups, \(uniqueImageURLs.count) images, \(uniqueVideoURLs.count) videos")
            } catch {
                Logger.messages.error("[ConversationListVM] Story prefetch failed: \(error.localizedDescription)")
            }
        }
    }

    func refreshStoriesPrefetch() {
        prefetchRecentStories()
    }

    /// Called when app returns to foreground — refresh stories if stale
    func handleForegroundReturn() {
        guard isCacheValid else { return }
        Task {
            let cached = await CacheCoordinator.shared.stories.load(for: "recent_tray")
            switch cached {
            case .stale, .expired, .empty:
                prefetchRecentStories()
            case .fresh:
                break
            }
        }
    }

    // MARK: - Mark as Read (local update from ConversationView)

    private func observeMarkAsRead() {
        NotificationCenter.default.addObserver(
            forName: .conversationMarkedRead,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let cid = notification.object as? String else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard let idx = self.convIndex(for: cid) else { return }
                self.conversations[idx].unreadCount = 0
                for i in 0..<self.groupedConversations.count {
                    if let rowIdx = self.groupedConversations[i].conversations.firstIndex(where: { $0.id == cid }) {
                        self.groupedConversations[i].conversations[rowIdx].unreadCount = 0
                        break
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private var currentUserId: String {
        authManager.currentUser?.id ?? ""
    }
}

extension Notification.Name {
    static let conversationMarkedRead = Notification.Name("conversationMarkedRead")
}
