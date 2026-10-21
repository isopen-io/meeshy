import Foundation
import MeeshySDK

/// L'écriture du cache disque de la liste (instantané + curseur + `hasMore`).
/// Extrait de `ConversationListViewModel` : la tâche en vol et son compteur de
/// test ne servent qu'à elle ; l'hôte lui passe l'état à graver au moment de
/// l'appel (lecture synchrone sur le MainActor, avant la tâche détachée).
@MainActor
final class ConversationListPersister {
    nonisolated deinit {}

    /// Fire-and-forget persistence of the list + cursor. Stored so
    /// `pullToRefresh()` (and `loadMore` itself) can cancel any in-flight save
    /// before invalidating the cache — otherwise an orphaned task could
    /// re-save the pre-refresh blob *after* `invalidateAll()` wiped L2,
    /// leaving stale data on disk for the next cold start.
    private var task: Task<Void, Never>?

    /// Test-only counter: incremented every time `schedule`'s task
    /// actually completes a save (i.e. survived the debounce window). Used
    /// by unit tests to assert coalescing without mocking the GRDB-backed
    /// `CacheCoordinator` actor. Production code never reads this.
    #if DEBUG
    var persistCallCount = 0
    #endif

    func cancel() {
        task?.cancel()
    }

    /// Coalesced persistence after a short debounce so a burst of mutations
    /// produces ONE GRDB write rather than N. Cancels any prior in-flight
    /// persist task so the latest snapshot always wins.
    func schedule(snapshot: [Conversation], cursor: String?, hasMore more: Bool, debounce: TimeInterval) {
        task?.cancel()
        task = Task { [weak self] in
            try? await Task.sleep(for: .seconds(debounce))
            guard !Task.isCancelled else { return }
            // Un seul écrivain du groupe « dernier message », le moteur (#7548) :
            // voir `ConversationListLastMessage.persisting`.
            let store = await CacheCoordinator.shared.conversations
            if await store.load(for: "list").snapshot() == nil {
                await bestEffort("conversationListPersister.store.savePreservingFreshness", category: .cache) { try await store.savePreservingFreshness(snapshot, for: "list") }
            } else {
                await store.update(for: "list") { ConversationListLastMessage.persisting(snapshot, over: $0) }
            }
            await store.saveCursor(nextCursor: cursor, hasMore: more, for: "list")
            #if DEBUG
            self?.persistCallCount += 1
            #endif
        }
    }

    /// Immediate save after a successful `loadMore`.
    func persistNow(snapshot: [Conversation], cursor persistedCursor: String?, hasMore persistedHasMore: Bool) {
        // Cancel any prior persist still in flight so we never race
        // a stale blob over a fresher one — the latest snapshot is
        // always the one that should win.
        task?.cancel()
        task = Task {
            // try? : Wave 1 Local-First a rendu .save() throwing.
            // Best-effort persist — l'erreur est loggee en aval.
            await bestEffort("conversationListPersister.conversations.savePreservingFreshness", category: .cache) { try await CacheCoordinator.shared.conversations.savePreservingFreshness(snapshot, for: "list") }
            await CacheCoordinator.shared.conversations.saveCursor(
                nextCursor: persistedCursor,
                hasMore: persistedHasMore,
                for: "list"
            )
        }
    }
}
