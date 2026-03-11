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
        authManager: AuthManaging = AuthManager.shared
    ) {
        self.mode = mode
        self.statusService = statusService
        self.socialSocket = socialSocket
        self.authManager = authManager
    }

    // MARK: - Load Statuses

    func loadStatuses() async {
        guard !isLoading else { return }
        isLoading = true
        error = nil
        nextCursor = nil
        hasMore = true

        do {
            let response = try await statusService.list(mode: mode, cursor: nil, limit: 20)

            if response.success {
                statuses = response.data.compactMap { $0.toStatusEntry() }
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
                if mode == .friends {
                    myStatus = statuses.first
                }
            } else {
                if statuses.isEmpty {
                    statuses = []
                }
                error = String(localized: "Impossible de charger les statuts", defaultValue: "Impossible de charger les statuts")
            }
        } catch {
            if statuses.isEmpty {
                self.statuses = []
            }
            self.error = error.localizedDescription
        }

        isLoading = false
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
        nextCursor = nil
        hasMore = true
        await loadStatuses()
    }

    // MARK: - Set Status

    func setStatus(emoji: String, content: String?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil) async {
        do {
            let post = try await statusService.create(moodEmoji: emoji, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds)

            if let entry = post.toStatusEntry() {
                myStatus = entry
                statuses.insert(entry, at: 0)
            }
        } catch {
            let entry = StatusEntry(
                id: UUID().uuidString,
                userId: "me",
                username: "Moi",
                avatarColor: "FF2E63",
                moodEmoji: emoji,
                content: content,
                audioUrl: nil,
                createdAt: Date(),
                expiresAt: Date().addingTimeInterval(3600)
            )
            myStatus = entry
            statuses.insert(entry, at: 0)
        }
    }

    // MARK: - Clear Status

    func clearStatus() async {
        guard let status = myStatus else { return }

        do {
            try await statusService.delete(statusId: status.id)
        } catch {
            // Silent failure
        }

        statuses.removeAll { $0.id == status.id }
        myStatus = nil
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

    func moodTapHandler(for userId: String) -> ((CGPoint) -> Void)? {
        guard statusForUser(userId: userId) != nil else { return nil }
        return { [weak self] point in
            guard let entry = self?.statusForUser(userId: userId) else { return }
            Task { @MainActor in
                StatusBubbleController.shared.show(entry: entry, anchor: point)
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

    }

    // MARK: - React to Status

    func reactToStatus(_ statusId: String, emoji: String) async {
        do {
            try await statusService.react(statusId: statusId, emoji: emoji)
        } catch {
            // Silent failure
        }
    }

}
