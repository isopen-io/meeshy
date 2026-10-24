import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

@MainActor
final class NotificationListViewModel: ObservableObject, NotificationListModeling {
    private var nextCursor: String?
    @Published var notifications: [APINotification] = []
    @Published var isLoading = false
    @Published var hasMore = false
    @Published private(set) var selectedCategory: NotificationCategory = .all
    @Published var loadDidFail = false

    var unreadCount: Int { feed.unreadCount }

    private var offset = 0
    private let limit = 30
    private var cancellables = Set<AnyCancellable>()
    private nonisolated(unsafe) var refreshTask: Task<Void, Never>?
    private let service: NotificationServiceProviding
    private let feed: NotificationFeedProviding
    private let log = MeeshyLog.logger(.ui)

    nonisolated deinit {
        refreshTask?.cancel()
    }

    var filteredNotifications: [APINotification] {
        notifications.filter(selectedCategory.accepts)
    }

    init(
        service: NotificationServiceProviding = NotificationService.shared,
        feed: NotificationFeedProviding = LiveNotificationFeed()
    ) {
        self.service = service
        self.feed = feed
        subscribeToCounterAndArrivals()
        subscribeToReadAndDeleteEvents()
    }

    private func subscribeToCounterAndArrivals() {
        feed.unreadCountChanges
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)

        feed.newNotificationReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.scheduleRefresh()
            }
            .store(in: &cancellables)

        feed.notificationMarkedRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notificationId in
                self?.handleReadEvent(notificationId)
            }
            .store(in: &cancellables)

        feed.notificationReadRolledBack
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notificationId in
                self?.handleReadRollback(notificationId)
            }
            .store(in: &cancellables)

        feed.notificationWasDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notificationId in
                self?.notifications.removeAll { $0.id == notificationId }
            }
            .store(in: &cancellables)
    }

    private func subscribeToReadAndDeleteEvents() {
        feed.conversationNotificationsRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] conversationId in
                self?.markReadLocally(scope: .conversation(id: conversationId))
            }
            .store(in: &cancellables)

        feed.postNotificationsRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in
                self?.markReadLocally(scope: .post(id: postId))
            }
            .store(in: &cancellables)

        feed.typeNotificationsRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] types in
                self?.markReadLocally(scope: .types(types))
            }
            .store(in: &cancellables)

        feed.allNotificationsRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.markReadLocally(scope: .all)
            }
            .store(in: &cancellables)
    }

    private func markReadLocally(scope: NotificationReadScope) {
        notifications = NotificationCachePatch.markingRead(notifications, scope: scope)
    }

    private func scheduleRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            guard await cancellableSleep(for: .seconds(0.5)), !Task.isCancelled else { return }
            await self?.refreshFromAPI()
        }
    }

    private func handleReadEvent(_ notificationId: String) {
        guard let idx = notifications.firstIndex(where: { $0.id == notificationId }) else { return }
        notifications[idx] = notifications[idx].withReadState(true)
    }

    private func handleReadRollback(_ notificationId: String) {
        notifications = NotificationCachePatch.markingUnread(notifications, id: notificationId)
        Self.announceFailure(NotificationListCopy.markReadFailed)
    }

    static func announceFailure(_ message: String) {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"),
            object: nil,
            userInfo: ["message": message, "isSuccess": false]
        )
    }

    func loadInitial() async {
        offset = 0
        nextCursor = nil
        loadDidFail = false

        let cached = await feed.cachedFeed()
        switch cached {
        case .fresh(let data, _) where selectedCategory == .all:
            notifications = data
            offset = data.count
            hasMore = data.count >= limit
            return
        case .fresh(let data, _), .stale(let data, _):
            showCachedPreview(data)
            await refreshFromAPI()
        case .expired, .empty:
            isLoading = notifications.isEmpty
            await refreshFromAPI()
        }
    }

    func select(_ category: NotificationCategory) async {
        guard category != selectedCategory else { return }
        let preview = notifications
        selectedCategory = category
        offset = 0
        nextCursor = nil
        hasMore = false
        loadDidFail = false
        notifications = preview.filter(category.accepts)
        if notifications.isEmpty {
            switch await feed.cachedFeed() {
            case .fresh(let data, _), .stale(let data, _):
                showCachedPreview(data)
            case .expired, .empty:
                break
            }
        }
        isLoading = notifications.isEmpty
        await refreshFromAPI()
    }

    private func showCachedPreview(_ data: [APINotification]) {
        let rows = data.filter(selectedCategory.accepts)
        notifications = rows
        offset = selectedCategory == .all ? rows.count : 0
    }

    private func refreshFromAPI() async {
        let category = selectedCategory
        let query = category.serverQuery
        do {
            let response = try await service.list(
                offset: nil,
                cursor: nil,
                limit: limit,
                unreadOnly: query.unreadOnly,
                types: query.types,
                hideReadTypes: query.hideReadTypes
            )
            guard category == selectedCategory else { return }
            notifications = response.data
            hasMore = response.pagination?.hasMore ?? false
            nextCursor = response.pagination?.nextCursor
            offset = response.data.count
            loadDidFail = false
            isLoading = false
            if category == .all {
                do {
                    try await feed.storeFeed(response.data)
                } catch {
                    log.error("Notifications cache not written: \(error.localizedDescription)")
                }
            }
            await feed.refreshUnreadCount()
        } catch {
            log.error("Failed to refresh notifications: \(error.localizedDescription)")
            guard category == selectedCategory else { return }
            loadDidFail = true
            isLoading = false
        }
    }

    func loadMore() async {
        guard !isLoading, hasMore else { return }
        let category = selectedCategory
        let query = category.serverQuery
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await service.list(
                offset: nextCursor == nil ? offset : nil,
                cursor: nextCursor,
                limit: limit,
                unreadOnly: query.unreadOnly,
                types: query.types,
                hideReadTypes: query.hideReadTypes
            )
            guard category == selectedCategory else { return }
            let known = Set(notifications.map(\.id))
            notifications.append(contentsOf: response.data.filter { !known.contains($0.id) })
            hasMore = response.pagination?.hasMore ?? false
            nextCursor = response.pagination?.nextCursor
            offset += response.data.count
        } catch {
            log.error("Failed to load more notifications: \(error.localizedDescription)")
        }
    }

    func markRead(_ notification: APINotification) async {
        guard !notification.isRead else { return }
        await feed.markRead(notificationId: notification.id)
    }

    func markAllRead() async {
        guard await feed.markAllAsRead() else {
            Self.announceFailure(NotificationListCopy.markAllReadFailed)
            return
        }
        notifications = NotificationCachePatch.markingRead(notifications, scope: .all)
    }

    func deleteNotification(_ notification: APINotification) async {
        guard let index = notifications.firstIndex(where: { $0.id == notification.id }) else { return }
        let removed = notifications.remove(at: index)
        guard await feed.delete(notificationId: notification.id) else {
            if !notifications.contains(where: { $0.id == removed.id }) {
                notifications.insert(removed, at: min(index, notifications.count))
            }
            Self.announceFailure(NotificationListCopy.deleteFailed)
            return
        }
    }
}
