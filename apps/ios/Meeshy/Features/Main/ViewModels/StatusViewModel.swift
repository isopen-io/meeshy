import Foundation
import SwiftUI
import Combine

enum StatusFeedMode {
    case friends    // /posts/feed/statuses
    case discover   // /posts/feed/statuses/discover

    var endpoint: String {
        switch self {
        case .friends: return "/posts/feed/statuses"
        case .discover: return "/posts/feed/statuses/discover"
        }
    }
}

@MainActor
class StatusViewModel: ObservableObject {
    @Published var statuses: [StatusEntry] = []
    @Published var myStatus: StatusEntry?
    @Published var isLoading = false
    @Published var isLoadingMore = false

    let mode: StatusFeedMode
    private let api = APIClient.shared
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket = SocialSocketManager.shared

    // Cursor pagination
    private var nextCursor: String?
    private var hasMore = true

    static let moodOptions: [String] = [
        "😴", "🎉", "💪", "☕", "🔥",
        "💭", "🎵", "📚", "✈️", "❤️"
    ]

    init(mode: StatusFeedMode = .friends) {
        self.mode = mode
    }

    // MARK: - Load Statuses

    func loadStatuses() async {
        guard !isLoading else { return }
        isLoading = true
        nextCursor = nil
        hasMore = true

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                endpoint: mode.endpoint,
                limit: 20
            )

            if response.success {
                statuses = response.data.compactMap { $0.toStatusEntry() }
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
                if mode == .friends {
                    myStatus = statuses.first
                }
            } else {
                if mode == .friends { fallbackToSampleData() }
            }
        } catch {
            if mode == .friends { fallbackToSampleData() }
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
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                endpoint: mode.endpoint,
                cursor: nextCursor,
                limit: 20
            )

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
        let request = StatusCreateRequest(moodEmoji: emoji, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds)

        do {
            let response: APIResponse<APIPost> = try await api.post(
                endpoint: "/posts",
                body: request
            )

            if response.success, let entry = response.data.toStatusEntry() {
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
            let _ = try await api.delete(endpoint: "/posts/\(status.id)")
        } catch {
            // Silent failure
        }

        statuses.removeAll { $0.id == status.id }
        myStatus = nil
    }

    // MARK: - Lookup Methods

    func statusForUser(userId: String) -> StatusEntry? {
        statuses.first { $0.userId == userId }
    }

    // MARK: - Socket.IO Real-Time Updates

    func subscribeToSocketEvents() {
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

        socialSocket.statusReacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                // Could update reaction counts on the status if needed
                _ = self // suppress unused warning
            }
            .store(in: &cancellables)
    }

    // MARK: - React to Status

    func reactToStatus(_ statusId: String, emoji: String) async {
        let body: [String: String] = ["emoji": emoji]
        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: APIResponse<[String: AnyCodable]> = try await api.request(
                endpoint: "/posts/\(statusId)/like",
                method: "POST",
                body: bodyData
            )
        } catch {
            // Silent failure
        }
    }

    // MARK: - Sample Data Fallback

    private func fallbackToSampleData() {
        if statuses.isEmpty {
            statuses = Self.sampleStatuses
        }
    }

    static let sampleStatuses: [StatusEntry] = {
        let now = Date()
        return [
            StatusEntry(id: "st1", userId: "user_alice", username: "Alice", avatarColor: DynamicColorGenerator.colorForName("Alice"),
                        moodEmoji: "🎉", content: "Weekend mode!", audioUrl: nil,
                        createdAt: now.addingTimeInterval(-600), expiresAt: now.addingTimeInterval(3000)),
            StatusEntry(id: "st2", userId: "user_bob", username: "Bob", avatarColor: DynamicColorGenerator.colorForName("Bob"),
                        moodEmoji: "💪", content: nil, audioUrl: nil,
                        createdAt: now.addingTimeInterval(-1200), expiresAt: now.addingTimeInterval(2400)),
            StatusEntry(id: "st3", userId: "user_sarah", username: "Sarah", avatarColor: DynamicColorGenerator.colorForName("Sarah"),
                        moodEmoji: "☕", content: "Coffee break", audioUrl: nil,
                        createdAt: now.addingTimeInterval(-1800), expiresAt: now.addingTimeInterval(1800)),
            StatusEntry(id: "st4", userId: "user_emma", username: "Emma", avatarColor: DynamicColorGenerator.colorForName("Emma"),
                        moodEmoji: "📚", content: "Deep in a book", audioUrl: nil,
                        createdAt: now.addingTimeInterval(-2400), expiresAt: now.addingTimeInterval(1200)),
            StatusEntry(id: "st5", userId: "user_hugo", username: "Hugo", avatarColor: DynamicColorGenerator.colorForName("Hugo"),
                        moodEmoji: "🔥", content: nil, audioUrl: nil,
                        createdAt: now.addingTimeInterval(-900), expiresAt: now.addingTimeInterval(2700)),
        ]
    }()
}
