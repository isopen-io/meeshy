import Foundation
import MeeshySDK

/// L'écriture du cache disque de la liste (instantané + curseur + `hasMore`).
/// Extrait de `ConversationListViewModel` : la tâche en vol et son compteur de
/// test ne servent qu'à elle ; l'hôte lui passe l'état à graver au moment de
/// l'appel (lecture synchrone sur le MainActor, avant la tâche détachée).
///
/// Elle ne REMPLACE jamais le cache par l'instantané, elle le fusionne sur le
/// cache COURANT (#18933) : le moteur garde le groupe « dernier message » et
/// les lignes qu'il a ajoutées pendant l'attente ; seules les lignes que la
/// liste a retirées s'effacent (`ConversationListLastMessage.persisting`).
@MainActor
final class ConversationListPersister {
    nonisolated deinit {}

    /// Fire-and-forget persistence of the list + cursor. Stored so
    /// `pullToRefresh()` (and `loadMore` itself) can cancel any in-flight save
    /// before invalidating the cache — otherwise an orphaned task could
    /// re-save the pre-refresh blob *after* `invalidateAll()` wiped L2,
    /// leaving stale data on disk for the next cold start.
    private var task: Task<Void, Never>?

    /// Les lignes que la liste a retirées et que le cache garde peut-être
    /// encore. Lues au moment d'ÉCRIRE, pas de planifier : un retrait survenu
    /// pendant l'anti-rebond (un rechargement depuis le cache sans la ligne)
    /// l'emporte sur l'instantané planifié avant lui. Oubliées une fois écrites.
    private var retired: Set<String> = []

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

    /// Tient le registre des retraits à chaque changement de la liste : une
    /// ligne qui la quitte y entre, une ligne qui y revient en sort.
    func noteRows(from previous: [Conversation], to current: [Conversation]) {
        let shown = Set(current.map(\.id))
        retired.subtract(shown)
        retired.formUnion(previous.lazy.map(\.id).filter { !shown.contains($0) })
    }

    /// Coalesced persistence after a short debounce so a burst of mutations
    /// produces ONE GRDB write rather than N. Cancels any prior in-flight
    /// persist task so the latest snapshot always wins.
    func schedule(snapshot: [Conversation], cursor: String?, hasMore more: Bool, debounce: TimeInterval) {
        task?.cancel()
        task = Task { [weak self] in
            guard await cancellableSleep(for: .seconds(debounce)), !Task.isCancelled else { return }
            await self?.write(snapshot, cursor: cursor, hasMore: more)
            #if DEBUG
            self?.persistCallCount += 1
            #endif
        }
    }

    /// Immediate save after a successful `loadMore` — same merge as `schedule`
    /// (#18933 : l'instantané brut effaçait les lignes et les facettes du moteur).
    func persistNow(snapshot: [Conversation], cursor persistedCursor: String?, hasMore persistedHasMore: Bool) {
        // Cancel any prior persist still in flight so we never race
        // a stale blob over a fresher one — the latest snapshot is
        // always the one that should win.
        task?.cancel()
        task = Task { [weak self] in
            await self?.write(snapshot, cursor: persistedCursor, hasMore: persistedHasMore)
        }
    }

    private func write(_ snapshot: [Conversation], cursor: String?, hasMore: Bool) async {
        let retiring = retired
        let store = await CacheCoordinator.shared.conversations
        if await store.loadIgnoringExpiry(for: "list") == nil {
            await bestEffort("conversationListPersister.store.savePreservingFreshness", category: .cache) { try await CacheCoordinator.shared.conversations.savePreservingFreshness(snapshot, for: "list") }
        } else {
            await store.update(for: "list") { ConversationListLastMessage.persisting(snapshot, over: $0, retiring: retiring) }
        }
        await store.saveCursor(nextCursor: cursor, hasMore: hasMore, for: "list")
        retired.subtract(retiring)
    }
}
