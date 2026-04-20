import Foundation

/// Persistent set of message ids the user explicitly hid via "Delete for me"
/// (WhatsApp-style local deletion that does NOT reach the server). Backed by
/// UserDefaults so the set survives kills, restores across reinstalls via
/// iCloud backup, and stays consistent with the rest of the offline-first
/// stack.
///
/// "Delete for everyone" remains a server round-trip via
/// `MessageService.delete` — this store only covers the local-only variant.
final class LocallyHiddenMessagesStore: @unchecked Sendable {
    static let shared = LocallyHiddenMessagesStore()

    private let defaults: UserDefaults
    private let storageKey = "meeshy_locally_hidden_messages"
    private let lock = NSLock()
    private var cache: Set<String>

    init(userDefaults: UserDefaults = .standard) {
        self.defaults = userDefaults
        let raw = userDefaults.stringArray(forKey: storageKey) ?? []
        self.cache = Set(raw)
    }

    /// Returns `true` when the message should be filtered out of the
    /// ConversationView's display.
    func isHidden(_ messageId: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return cache.contains(messageId)
    }

    /// Hide a message locally. Safe to call repeatedly.
    func hide(_ messageId: String) {
        lock.lock()
        let (inserted, _) = cache.insert(messageId)
        let snapshot = Array(cache)
        lock.unlock()
        guard inserted else { return }
        defaults.set(snapshot, forKey: storageKey)
    }

    /// Unhide (used by "Undo" affordances and by tests).
    func unhide(_ messageId: String) {
        lock.lock()
        let removed = cache.remove(messageId) != nil
        let snapshot = Array(cache)
        lock.unlock()
        guard removed else { return }
        defaults.set(snapshot, forKey: storageKey)
    }

    /// Filter an array of message ids to those still visible to the user.
    func visibleIds(from ids: [String]) -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return ids.filter { !cache.contains($0) }
    }

    /// Raw snapshot for the ConversationViewModel to pre-compute its
    /// filtered `messagesByDate` without hitting the lock per row.
    var allHiddenIds: Set<String> {
        lock.lock()
        defer { lock.unlock() }
        return cache
    }

    func clearAll() {
        lock.lock()
        cache.removeAll()
        lock.unlock()
        defaults.removeObject(forKey: storageKey)
    }
}
