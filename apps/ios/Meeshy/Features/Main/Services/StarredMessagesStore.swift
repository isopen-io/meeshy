import Foundation
import Combine

/// Snapshot of a starred message so we can surface it in the dedicated
/// "Starred Messages" list even after the source bubble is edited, deleted
/// for everyone, or its conversation is archived. Mirrors WhatsApp's
/// Starred Messages screen where each row renders without needing the
/// original conversation to be open or cached.
struct StarredMessageSnapshot: Codable, Identifiable, Equatable, Sendable {
    let id: String              // Server-assigned message id (canonical key)
    let conversationId: String
    let conversationName: String?
    let conversationAccentColor: String?
    let senderUserId: String?
    let senderName: String?
    var contentPreview: String
    let attachmentKind: String?  // "image" / "video" / "audio" / "file" / "location"
    let starredAt: Date
    let sentAt: Date
}

/// Persistent set of messages the user has starred (bookmarked). Local-only
/// (the backend does not yet have a message-level star endpoint), survives
/// kills via UserDefaults, and publishes a Combine stream so the
/// `StarredMessagesView` can react without polling.
@MainActor
final class StarredMessagesStore: ObservableObject {
    static let shared = StarredMessagesStore()

    @Published private(set) var snapshots: [StarredMessageSnapshot] = []

    private let defaults: UserDefaults
    private let storageKey = "meeshy_starred_messages"
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init(userDefaults: UserDefaults = .standard) {
        self.defaults = userDefaults
        self.snapshots = Self.load(from: userDefaults, decoder: decoder)
    }

    // MARK: - Public API

    func isStarred(messageId: String) -> Bool {
        snapshots.contains { $0.id == messageId }
    }

    /// Toggle and return the resulting state (`true` if starred after the call).
    @discardableResult
    func toggle(_ snapshot: StarredMessageSnapshot) -> Bool {
        if let idx = snapshots.firstIndex(where: { $0.id == snapshot.id }) {
            snapshots.remove(at: idx)
            persist()
            return false
        } else {
            // Insert sorted by `starredAt` desc so the UI doesn't have to
            // re-sort on every publish.
            let idx = snapshots.firstIndex { $0.starredAt < snapshot.starredAt } ?? snapshots.endIndex
            snapshots.insert(snapshot, at: idx)
            persist()
            return true
        }
    }

    func remove(messageId: String) {
        guard let idx = snapshots.firstIndex(where: { $0.id == messageId }) else { return }
        snapshots.remove(at: idx)
        persist()
    }

    /// Keep the starred snapshot's preview in sync after the source message is
    /// edited. The snapshot is a frozen copy (so the Starred list renders
    /// without the conversation being cached), so an edit elsewhere would
    /// otherwise leave the row showing stale content. No-op when the message
    /// isn't starred.
    func updatePreview(messageId: String, contentPreview: String) {
        guard let idx = snapshots.firstIndex(where: { $0.id == messageId }),
              snapshots[idx].contentPreview != contentPreview else { return }
        snapshots[idx].contentPreview = contentPreview
        persist()
    }

    func snapshot(for messageId: String) -> StarredMessageSnapshot? {
        snapshots.first { $0.id == messageId }
    }

    func removeAll(conversationId: String) {
        let before = snapshots.count
        snapshots.removeAll { $0.conversationId == conversationId }
        if snapshots.count != before { persist() }
    }

    func clearAll() {
        guard !snapshots.isEmpty else { return }
        snapshots.removeAll()
        defaults.removeObject(forKey: storageKey)
    }

    // MARK: - Persistence

    private func persist() {
        guard let data = try? encoder.encode(snapshots) else { return }
        defaults.set(data, forKey: storageKey)
    }

    private static func load(from defaults: UserDefaults, decoder: JSONDecoder) -> [StarredMessageSnapshot] {
        guard let data = defaults.data(forKey: "meeshy_starred_messages") else { return [] }
        return (try? decoder.decode([StarredMessageSnapshot].self, from: data)) ?? []
    }
}
