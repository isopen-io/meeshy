import Foundation
import SwiftUI

@MainActor
class StatusViewModel: ObservableObject {
    @Published var statuses: [StatusEntry] = []
    @Published var myStatus: StatusEntry?
    @Published var isLoading = false

    private let api = APIClient.shared

    static let moodOptions: [String] = [
        "😴", "🎉", "💪", "☕", "🔥",
        "💭", "🎵", "📚", "✈️", "❤️"
    ]

    // MARK: - Load Statuses

    func loadStatuses() async {
        guard !isLoading else { return }
        isLoading = true

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                endpoint: "/posts/feed/statuses",
                limit: 50
            )

            if response.success {
                statuses = response.data.compactMap { $0.toStatusEntry() }
                // Find my status (first one with matching userId, once auth provides it)
                myStatus = statuses.first
            } else {
                fallbackToSampleData()
            }
        } catch {
            fallbackToSampleData()
        }

        isLoading = false
    }

    // MARK: - Set Status

    func setStatus(emoji: String, content: String?) async {
        let request = StatusCreateRequest(moodEmoji: emoji, content: content)

        do {
            let response: APIResponse<APIPost> = try await api.post(
                endpoint: "/posts",
                body: request
            )

            if response.success, let entry = response.data.toStatusEntry() {
                myStatus = entry
                // Insert at beginning
                statuses.insert(entry, at: 0)
            }
        } catch {
            // Optimistic local update
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
            StatusEntry(id: "st6", userId: "user_marie", username: "Marie", avatarColor: DynamicColorGenerator.colorForName("Marie"),
                        moodEmoji: "🎵", content: "Listening to jazz", audioUrl: nil,
                        createdAt: now.addingTimeInterval(-3000), expiresAt: now.addingTimeInterval(600)),
            StatusEntry(id: "st7", userId: "user_lucas", username: "Lucas", avatarColor: DynamicColorGenerator.colorForName("Lucas"),
                        moodEmoji: "✈️", content: "En route!", audioUrl: nil,
                        createdAt: now.addingTimeInterval(-300), expiresAt: now.addingTimeInterval(3300)),
            StatusEntry(id: "st8", userId: "user_diana", username: "Diana", avatarColor: DynamicColorGenerator.colorForName("Diana"),
                        moodEmoji: "💭", content: nil, audioUrl: nil,
                        createdAt: now.addingTimeInterval(-1500), expiresAt: now.addingTimeInterval(2100))
        ]
    }()
}
