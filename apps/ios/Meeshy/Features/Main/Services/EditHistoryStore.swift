import Foundation

/// One revision in the edit history of a message. `content` is the value
/// BEFORE the edit that replaced it, and `editedAt` is when that replacement
/// happened. Older entries come first in the history array.
struct EditRevision: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let content: String
    let editedAt: Date

    init(content: String, editedAt: Date = Date()) {
        self.id = UUID()
        self.content = content
        self.editedAt = editedAt
    }
}

/// Persistent store of prior message contents so the `MessageDetailSheet`
/// can render an "Edit history" list even after a cold start, matching
/// WhatsApp's "View edits" affordance. The backend does not surface the
/// edit history for us, so we snapshot every old value at `editMessage`
/// time right before the optimistic replacement.
///
/// Entries are keyed by the canonical server id (resolved via
/// `ConversationViewModel.serverId(for:)`). The store keeps at most
/// `maxRevisionsPerMessage` entries per message to bound disk use on
/// long-running chats.
final class EditHistoryStore: @unchecked Sendable {
    static let shared = EditHistoryStore()

    private let defaults: UserDefaults
    private let storageKey = "meeshy_edit_history"
    private let lock = NSLock()
    private var cache: [String: [EditRevision]]

    private let maxRevisionsPerMessage = 30
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
        if let data = userDefaults.data(forKey: storageKey),
           let decoded = try? JSONDecoder.iso8601.decode([String: [EditRevision]].self, from: data) {
            self.cache = decoded
        } else {
            self.cache = [:]
        }
    }

    /// Append the previous content as a new revision for the given message.
    /// Called just before we apply the optimistic edit so the "before" state
    /// is preserved.
    func recordRevision(messageId: String, previousContent: String) {
        guard !previousContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        lock.lock()
        var revisions = cache[messageId] ?? []
        revisions.append(EditRevision(content: previousContent))
        if revisions.count > maxRevisionsPerMessage {
            revisions = Array(revisions.suffix(maxRevisionsPerMessage))
        }
        cache[messageId] = revisions
        let snapshot = cache
        lock.unlock()
        persist(snapshot: snapshot)
    }

    func revisions(for messageId: String) -> [EditRevision] {
        lock.lock()
        defer { lock.unlock() }
        return cache[messageId] ?? []
    }

    func hasHistory(for messageId: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return !(cache[messageId]?.isEmpty ?? true)
    }

    func removeHistory(for messageId: String) {
        lock.lock()
        cache.removeValue(forKey: messageId)
        let snapshot = cache
        lock.unlock()
        persist(snapshot: snapshot)
    }

    func clearAll() {
        lock.lock()
        cache.removeAll()
        lock.unlock()
        defaults.removeObject(forKey: storageKey)
    }

    // MARK: - Persistence

    private func persist(snapshot: [String: [EditRevision]]) {
        guard let data = try? encoder.encode(snapshot) else { return }
        defaults.set(data, forKey: storageKey)
    }
}

private extension JSONDecoder {
    static let iso8601: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
