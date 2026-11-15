import Foundation
import Combine
import MeeshySDK

/// Persistent set of message ids the user explicitly hid via "Delete for me"
/// (WhatsApp-style local deletion that does NOT reach the server). Backed by
/// UserDefaults so the set survives kills, restores across reinstalls via
/// iCloud backup, and stays consistent with the rest of the offline-first
/// stack.
///
/// "Delete for everyone" remains a server round-trip via
/// `MessageService.delete` — this store only covers the local-only variant.
final class LocallyHiddenMessagesStore: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = LocallyHiddenMessagesStore()

    private let defaults: UserDefaults
    private let storageKey = "meeshy_locally_hidden_messages"
    private let cache: Locked<Set<String>>
    private var cancellables = Set<AnyCancellable>()

    init(userDefaults: UserDefaults = .standard) {
        self.defaults = userDefaults
        let raw = userDefaults.stringArray(forKey: storageKey) ?? []
        self.cache = Locked(Set(raw))
        wireAuthLogoutHook()
    }

    /// cache-09 (#7146) — pattern calqué sur `ConversationLockManager` : à la
    /// déconnexion, les masquages locaux du compte sortant partent.
    ///
    /// Ce sont des identifiants de messages que le compte A a choisi de ne plus
    /// voir. Conservés sous une clé commune, ils filtraient les conversations du
    /// compte B — un message parfaitement visible y disparaissait sans que rien
    /// ne l'explique.
    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.clearAll() }
            .store(in: &cancellables)
    }

    /// Returns `true` when the message should be filtered out of the
    /// ConversationView's display.
    func isHidden(_ messageId: String) -> Bool {
        cache.read { $0.contains(messageId) }
    }

    /// Hide a message locally. Safe to call repeatedly.
    func hide(_ messageId: String) {
        let (inserted, snapshot) = cache.mutate { ids -> (Bool, [String]) in
            let result = ids.insert(messageId)
            return (result.inserted, Array(ids))
        }
        guard inserted else { return }
        defaults.set(snapshot, forKey: storageKey)
    }

    /// Unhide (used by "Undo" affordances and by tests).
    func unhide(_ messageId: String) {
        let (removed, snapshot) = cache.mutate { ids -> (Bool, [String]) in
            (ids.remove(messageId) != nil, Array(ids))
        }
        guard removed else { return }
        defaults.set(snapshot, forKey: storageKey)
    }

    /// Re-key a hidden id when an optimistic message's id reconciles temp→server.
    /// Without this the hidden-set would still hold the pre-ack temp id while the
    /// row's display id becomes the server id, so the "Delete for me" filter
    /// (keyed on `message.id`) would stop matching and the hidden message would
    /// reappear. No-op when `oldId` was not hidden or equals `newId`.
    func migrate(from oldId: String, to newId: String) {
        guard oldId != newId else { return }
        let snapshot = cache.mutate { ids -> [String]? in
            guard ids.remove(oldId) != nil else { return nil }
            ids.insert(newId)
            return Array(ids)
        }
        guard let snapshot else { return }
        defaults.set(snapshot, forKey: storageKey)
    }

    /// Filter an array of message ids to those still visible to the user.
    func visibleIds(from ids: [String]) -> [String] {
        cache.read { hidden in ids.filter { !hidden.contains($0) } }
    }

    /// Raw snapshot for the ConversationViewModel to pre-compute its
    /// filtered `messagesByDate` without hitting the lock per row.
    var allHiddenIds: Set<String> {
        cache.read { $0 }
    }

    func clearAll() {
        cache.mutate { $0.removeAll() }
        defaults.removeObject(forKey: storageKey)
    }
}
