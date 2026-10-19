import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK

extension ConversationListViewModel {

    func observeSync() {
        let publisher = syncEngine.conversationsDidChange
        syncCancellable = publisher
            .receive(on: DispatchQueue.main)
            .debounce(for: .milliseconds(200), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                Task { @MainActor [weak self] in
                    await self?.reloadFromCache()
                    if self?.messagePrefetcher.takeReloadArm() == true { self?.prefetchTopConversationMessages() }
                }
            }
        // (Removed) ConversationPreferencesBroadcaster subscription: the options
        // sheet now mutates via ConversationStore (increment 2), so a pref change
        // reflects on the row through `observeStore` (the store merge sink) in the
        // same Combine tick — the broadcaster bridge is redundant and deleted.
    }

    // MARK: - Conversation Store Observation

    /// Subscribe to the mutation store and reconcile its per-user state back
    /// into the displayed list. The store is the source of truth for
    /// `userState` (pin/mute/archive/read/section/reaction/tags); this VM keeps
    /// ownership of metadata + ordering. A mutation from ANY surface that calls
    /// `store.apply(...)` lands here in the same Combine tick.
    func observeStore() {
        store.listPublisher()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] snapshot in
                self?.mergeUserStateFromStore(snapshot)
            }
            .store(in: &cancellables)
    }

    /// Subscribe to the category store and mirror its snapshot into
    /// `userCategories` (the grouping pipeline's section source). The store is
    /// the SoT for categories: a local expand/collapse (`setExpanded`) and a
    /// cross-device category event (`applyRemote`, routed by the socket bridge)
    /// both land here through its publisher.
    func observeCategoryStore() {
        categoryStore.publisher()
            // Drop the CurrentValueSubject's initial replay: at init the store
            // is empty and `userCategories` is already empty, so the first
            // emission is redundant. `loadCategories` re-emits via
            // `hydrateFromSnapshot` (a post-subscribe emission, not dropped) for
            // the actual paint; only real changes (hydrate / setExpanded /
            // applyRemote) drive `userCategories` thereafter.
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] categories in
                self?.applyCategories(categories)
            }
            .store(in: &cancellables)
    }

    /// Graft the store's `userState` onto the matching rows, then drop the
    /// rows the store just deleted. Ordering is untouched. Guarded so an echo
    /// of an unchanged snapshot (e.g. the publish that follows our own
    /// hydration) doesn't churn the grouping pipeline.
    ///
    /// Les métadonnées (titre/avatar/…) ne sont JAMAIS greffées depuis le
    /// store : elles ont déjà deux écrivains (le sink `conversationUpdated`
    /// direct et le rechargement du cache disque écrit par le sync engine).
    /// Le store s'hydrate en asynchrone — un snapshot en retard greffait le
    /// titre périmé PAR-DESSUS un rename fraîchement appliqué par le sink.
    private func mergeUserStateFromStore(_ snapshot: [MeeshyConversation]) {
        let ids = Set(snapshot.map(\.id))
        // Un instantané VIDE est un teardown de session (`ConversationStore.reset`
        // au logout republie `[]`), jamais N suppressions simultanées : le
        // traiter comme telles viderait la liste ET persisterait ce vide.
        let disappeared = ids.isEmpty ? [] : lastStoreSnapshotIds.subtracting(ids)
        lastStoreSnapshotIds = ids
        guard !conversations.isEmpty else { return }
        guard let merged = Self.reconciling(
            rows: conversations, with: snapshot, removing: disappeared
        ) else { return }
        conversations = merged
        schedulePersist()
    }

    /// Réconciliation pure — `nil` quand rien ne bouge.
    ///
    /// Les champs `lastMessage*` ne sont VOLONTAIREMENT pas greffés : ils sont
    /// la propriété du cache disque (écrit par `ConversationSyncEngine`), que
    /// `reloadFromCache` reverse déjà dans la liste. Les greffer depuis le
    /// store ferait régresser l'aperçu dès que le store est en retard d'un
    /// `message:new`.
    nonisolated static func reconciling(
        rows: [Conversation],
        with snapshot: [MeeshyConversation],
        removing disappeared: Set<String>
    ) -> [Conversation]? {
        let byId = Dictionary(snapshot.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var updated = rows.filter { !disappeared.contains($0.id) }
        var changed = updated.count != rows.count
        for i in updated.indices {
            guard let incoming = byId[updated[i].id] else { continue }
            if updated[i].userState != incoming.userState {
                updated[i].userState = incoming.userState
                changed = true
            }
        }
        return changed ? updated : nil
    }

    func reloadFromCache() async {
        // Restore the cursor BEFORE swapping the conversations array so
        // that any consumer reacting to `setConversations` (or a follow-
        // up `loadMore` triggered by a near-end scroll) sees a coherent
        // (cursor, items) pair rather than a fresh list paired with the
        // old cursor that may already be invalidated.
        if let cursor = await CacheCoordinator.shared.conversations.loadCursor(for: "list") {
            nextCursor = cursor.nextCursor
            hasMore = cursor.hasMore
            paginationState = cursor.hasMore ? .idle : .exhausted
        }
        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let data, _), .stale(let data, _):
            Logger.messages.debug("[ConversationListVM] reloadFromCache hit count=\(data.count)")
            setConversations(data)
        case .expired, .empty:
            // Trou silencieux historique : un signal `conversationsDidChange`
            // avec un cache expiré laissait la liste figée sans trace.
            Logger.messages.info("[ConversationListVM] reloadFromCache MISS (expired/empty) — liste non rafraîchie")
            break
        }
    }
}
