import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes, et ne change AUCUN
// comportement — les corps sont déplacés à l'identique.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : la RECHERCHE dans la conversation, déléguée à
// `ConversationSearchHandler` et remise en miroir sur les `@Published` que les
// vues observent encore pendant la migration vers les handlers.

extension ConversationViewModel {

    // MARK: - Search Messages (delegated to ConversationSearchHandler)

    /// First-page search. Delegates to `searchHandler`, then mirrors the
    /// store-side state back onto the legacy `@Published` so the views
    /// keep observing the ViewModel directly during the incremental
    /// split. The local `searchNextCursor` legacy field becomes dead
    /// weight (cursor lives in the handler) but is left assigned to
    /// `nil` for any reader that still peeks at it.
    func searchMessages(query: String) async {
        await searchHandler.searchMessages(query: query)
        searchResults = stateStore.searchResults
        currentSearchQuery = stateStore.currentSearchQuery
        searchHasMore = stateStore.searchHasMore
        isSearching = stateStore.isSearching
        searchNextCursor = nil
        await applySearchFilterWindow()
    }

    func loadMoreSearchResults(query: String) async {
        await searchHandler.loadMoreSearchResults(query: query)
        searchResults = stateStore.searchResults
        searchHasMore = stateStore.searchHasMore
        isSearching = stateStore.isSearching
        await applySearchFilterWindow()
    }

    /// In-situ filtered-conversation search: when a query is active with
    /// matches, the conversation window is filtered to ONLY those messages
    /// (rendered as real bubbles, term highlighted). When the query is empty or
    /// yields nothing, the full window is restored. Idempotent — safe to call
    /// after every search / pagination.
    private func applySearchFilterWindow() async {
        if currentSearchQuery != nil, !searchResults.isEmpty {
            await messageStore.enterSearchMode(ids: searchResults.map(\.id))
        } else if case .search = messageStore.windowMode {
            await messageStore.restoreLatestWindow()
        }
    }

    /// Exits in-conversation search: restores the full conversation window and
    /// clears the search state. Called when the user closes / clears the search.
    func endSearch() async {
        if case .search = messageStore.windowMode {
            await messageStore.restoreLatestWindow()
        }
        currentSearchQuery = nil
        stateStore.currentSearchQuery = nil
        searchResults = []
        stateStore.searchResults = []
        searchHasMore = false
    }
}
