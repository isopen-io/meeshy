import Foundation
import SwiftUI
import Combine
import MeeshySDK

@MainActor
class StatusViewModel: ObservableObject {
    @Published var statuses: [StatusEntry] = []
    @Published var myStatus: StatusEntry?
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var error: String?

    let mode: StatusService.Mode
    private let statusService: StatusServiceProviding
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let authManager: AuthManaging
    private let offlineQueue: OfflineQueueing
    private let isOffline: () -> Bool

    /// A mood is "stuck offline" (recoverable as a draft) once it has been
    /// unsent for longer than this — the "pas envoyé dans la minute → offline"
    /// rule shared by every composer. `nonisolated` so it can be read from any
    /// isolation (matches `SyncPillViewModel.staleInflightThreshold`).
    nonisolated static let offlineStuckThreshold: TimeInterval = 60

    // Cursor pagination
    private var nextCursor: String?
    private var hasMore = true

    static let moodOptions: [String] = [
        "😴", "🎉", "💪", "☕", "🔥",
        "💭", "🎵", "📚", "✈️", "❤️"
    ]

    init(
        mode: StatusService.Mode = .friends,
        statusService: StatusServiceProviding = StatusService.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        authManager: AuthManaging = AuthManager.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        isOffline: @escaping () -> Bool = { NetworkMonitor.shared.isOffline }
    ) {
        self.mode = mode
        self.statusService = statusService
        self.socialSocket = socialSocket
        self.authManager = authManager
        self.offlineQueue = offlineQueue
        self.isOffline = isOffline
    }

    // MARK: - Load Statuses

    func loadStatuses() async {
        guard !isLoading else { return }
        error = nil

        let cacheKey = "statuses_\(mode)"
        let cached = await CacheCoordinator.shared.statuses.load(for: cacheKey)

        switch cached {
        case .fresh(let data, _):
            statuses = data
            if mode == .friends { myStatus = statuses.first }
            return

        case .stale(let data, _):
            statuses = data
            if mode == .friends { myStatus = statuses.first }
            Task { [weak self] in
                await self?.fetchStatusesFromNetwork(cacheKey: cacheKey)
            }
            return

        case .expired, .empty:
            isLoading = statuses.isEmpty
        }

        await fetchStatusesFromNetwork(cacheKey: cacheKey)
        isLoading = false
    }

    private func fetchStatusesFromNetwork(cacheKey: String) async {
        nextCursor = nil
        hasMore = true

        do {
            let response = try await statusService.list(mode: mode, cursor: nil, limit: 20)

            if response.success {
                let entries = response.data.compactMap { $0.toStatusEntry() }
                statuses = entries
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
                if mode == .friends { myStatus = statuses.first }
                try? await CacheCoordinator.shared.statuses.save(entries, for: cacheKey)
            } else {
                if statuses.isEmpty {
                    error = String(localized: "Impossible de charger les statuts", defaultValue: "Impossible de charger les statuts")
                }
            }
        } catch {
            if statuses.isEmpty {
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Load More (infinite scroll)

    func loadMoreIfNeeded(currentStatus: StatusEntry) async {
        guard hasMore, !isLoadingMore, !isLoading else { return }

        // Trigger when within last 3 items
        let thresholdIndex = max(0, statuses.count - 3)
        guard let currentIndex = statuses.firstIndex(where: { $0.id == currentStatus.id }),
              currentIndex >= thresholdIndex else { return }

        isLoadingMore = true

        do {
            let response = try await statusService.list(mode: mode, cursor: nextCursor, limit: 20)

            if response.success {
                let newStatuses = response.data.compactMap { $0.toStatusEntry() }
                let existingIds = Set(statuses.map(\.id))
                let deduplicated = newStatuses.filter { !existingIds.contains($0.id) }
                statuses.append(contentsOf: deduplicated)
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
            }
        } catch {
            // Silent failure
        }

        isLoadingMore = false
    }

    // MARK: - Refresh

    func refresh() async {
        let cacheKey = "statuses_\(mode)"
        await CacheCoordinator.shared.statuses.invalidate(for: cacheKey)
        nextCursor = nil
        hasMore = true
        await loadStatuses()
    }

    // MARK: - Set Status

    func setStatus(emoji: String, content: String?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, viaUsername: String? = nil, audioUrl: String? = nil, repostOfId: String? = nil) async {
        // Offline: persist the mood durably through the SAME `.createPost` outbox
        // row as posts/reels (type STATUS) so it is not lost, and survives an app
        // kill. We do NOT insert an optimistic entry — unlike posts, the gateway
        // does not echo the clientMutationId on `status:created`, so the mood is
        // reconciled when it actually lands (via the socket) on reconnect. The
        // composer can recover this stuck row as a draft (recoverUnsentStatus).
        if isOffline() {
            let payload = CreatePostPayload(
                clientMutationId: ClientMutationId.generate(),
                content: content ?? "",
                attachmentIds: [],
                visibility: visibility,
                type: "STATUS",
                moodEmoji: emoji,
                visibilityUserIds: visibilityUserIds
            )
            do {
                try await offlineQueue.enqueue(.createPost, payload: payload, conversationId: nil)
                FeedbackToastManager.shared.showSuccess(String(localized: "status.queuedOffline", defaultValue: "Mood en attente d'envoi", bundle: .main))
            } catch {
                FeedbackToastManager.shared.showError(String(localized: "status.publishError", defaultValue: "Error publishing status", bundle: .main))
            }
            return
        }

        do {
            let post = try await statusService.create(moodEmoji: emoji, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds, viaUsername: viaUsername, audioUrl: audioUrl, repostOfId: repostOfId)

            if let entry = post.toStatusEntry() {
                myStatus = entry
                statuses.insert(entry, at: 0)
                await saveCacheSnapshot()
            }
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "status.publishError", defaultValue: "Error publishing status", bundle: .main))
        }
    }

    // MARK: - Offline Draft Recovery

    /// Returns the last mood that got stuck offline (unsent for more than
    /// `offlineStuckThreshold`) so the composer can pre-fill it as a draft.
    func recoverUnsentStatus() async -> RecoveredOfflinePost? {
        await offlineQueue.recoverLastUnsentPost(
            matchingTypes: ["STATUS"],
            olderThan: Self.offlineStuckThreshold
        )
    }

    /// Supersedes a recovered mood when the user re-sends it from the composer,
    /// so the resend replaces the stuck row instead of duplicating it.
    func supersedeRecoveredStatus(clientMutationId: String) async {
        await offlineQueue.cancelCreatePost(clientMutationId: clientMutationId)
    }

    // MARK: - Clear Status

    func clearStatus() async {
        guard let status = myStatus else { return }

        let snapshot = statuses
        let previousStatus = myStatus
        statuses.removeAll { $0.id == status.id }
        myStatus = nil

        do {
            try await statusService.delete(statusId: status.id)
            await saveCacheSnapshot()
        } catch {
            statuses = snapshot
            myStatus = previousStatus
            FeedbackToastManager.shared.showError(String(localized: "status.deleteError", defaultValue: "Error deleting status", bundle: .main))
        }
    }

    private func saveCacheSnapshot() async {
        let cacheKey = "statuses_\(mode)"
        try? await CacheCoordinator.shared.statuses.save(statuses, for: cacheKey)
    }

    // MARK: - Current User Info (for preview)

    var currentUserDisplayName: String {
        let user = authManager.currentUser
        return user?.displayName ?? user?.username ?? "Moi"
    }

    var currentUserInitial: String {
        let user = authManager.currentUser
        return user?.firstName?.prefix(1).uppercased()
            ?? user?.username.prefix(1).uppercased()
            ?? "M"
    }

    // MARK: - Lookup Methods

    func statusForUser(userId: String) -> StatusEntry? {
        statuses.first { $0.userId == userId }
    }

    // MARK: - Mood Tap Handler

    /// - Parameter repliesInline: vrai quand le mood est affiché dans la barre de
    ///   la conversation directe de son auteur — toucher son contenu répond alors
    ///   immédiatement (sans pop-up de confirmation).
    func moodTapHandler(for userId: String, repliesInline: Bool = false) -> ((CGPoint) -> Void)? {
        guard statusForUser(userId: userId) != nil else { return nil }
        return { [weak self] point in
            guard let entry = self?.statusForUser(userId: userId) else { return }
            Task { @MainActor in
                StatusBubbleController.shared.show(entry: entry, anchor: point, repliesInline: repliesInline)
            }
        }
    }

    // MARK: - Socket.IO Real-Time Updates

    func subscribeToSocketEvents() {
        guard cancellables.isEmpty else { return }

        socialSocket.statusCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                if let entry = apiPost.toStatusEntry() {
                    if !self.statuses.contains(where: { $0.id == entry.id }) {
                        self.statuses.insert(entry, at: 0)
                    }
                }
            }
            .store(in: &cancellables)

        socialSocket.statusDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] statusId in
                self?.statuses.removeAll { $0.id == statusId }
            }
            .store(in: &cancellables)

        socialSocket.statusUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                if let entry = apiPost.toStatusEntry(),
                   let index = self.statuses.firstIndex(where: { $0.id == entry.id }) {
                    self.statuses[index] = entry
                }
            }
            .store(in: &cancellables)

        // Reception temps reel des reactions de statut (le REST /posts/:id/like
        // emet `status:reacted` cote gateway). La propre reaction de l'utilisateur
        // est deja posee optimistiquement par reactToStatus ; on n'applique donc
        // que celles des AUTRES. Le payload ne porte pas de compte agrege, on
        // incremente prudemment (meme garde d'echo que la reaction de conversation).
        socialSocket.statusReacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self, payload.userId != self.authManager.currentUser?.id,
                      let index = self.statuses.firstIndex(where: { $0.id == payload.statusId }) else { return }
                var summary = self.statuses[index].reactionSummary ?? [:]
                summary[payload.emoji, default: 0] += 1
                self.statuses[index].reactionSummary = summary
            }
            .store(in: &cancellables)
    }

    // MARK: - React to Status

    func reactToStatus(_ statusId: String, emoji: String) async {
        // Optimistic : refleter la reaction dans reactionSummary avant le reseau
        // (parite avec les reactions de post/commentaire). Snapshot pour rollback.
        let previousSummary = statuses.first(where: { $0.id == statusId })?.reactionSummary
        if let index = statuses.firstIndex(where: { $0.id == statusId }) {
            var summary = statuses[index].reactionSummary ?? [:]
            summary[emoji, default: 0] += 1
            statuses[index].reactionSummary = summary
        }
        do {
            try await statusService.react(statusId: statusId, emoji: emoji)
        } catch {
            // Rollback de l'optimisme + toast. (Sur succes, le broadcast
            // `status:reacted` reconcilie l'etat autoritaire cote serveur.)
            if let index = statuses.firstIndex(where: { $0.id == statusId }) {
                statuses[index].reactionSummary = previousSummary
            }
            FeedbackToastManager.shared.showError(String(localized: "status.reactError", defaultValue: "Error reacting to status", bundle: .main))
        }
    }

}
