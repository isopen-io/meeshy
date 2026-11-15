import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK

extension ConversationListViewModel {

    // MARK: - Message Prefetch

    /// Précharge dans GRDB les messages des premières conversations — voir
    /// `ConversationListMessagePrefetcher` (#8651 : jamais pour un autre
    /// compte que celui qui l'a lancé ; #10572 : une passe à la fois).
    func prefetchTopConversationMessages() {
        let userId = currentUserId
        messagePrefetcher.schedule(ConversationListPrefetchRequest(
            candidates: ConversationListMessagePrefetcher.targets(conversations),
            owner: ConversationPrefetchOwner(userId: userId, username: authManager.currentUser?.username),
            stillOwner: { [weak self] in
                guard let self, !userId.isEmpty else { return false }
                return self.currentUserId == userId
            }
        ))
    }

    /// Called when app returns to foreground — refresh stories if stale.
    /// `isCacheValid` means "we fetched within the last `cacheTTL`
    /// (30s)" — i.e. the useful case is precisely when it's FALSE (a long
    /// background stint just ended). The guard used to read `isCacheValid`
    /// (proceed only when still fresh), which short-circuited the one
    /// scenario this method exists for.
    func handleForegroundReturn() {
        guard !isCacheValid else { return }
        Task {
            let cached = await CacheCoordinator.shared.stories.load(for: StoryViewModel.storiesCacheKey)
            switch cached {
            case .stale, .expired, .empty:
                prefetchRecentStories()
            case .fresh:
                break
            }
        }
    }

    /// Retour au premier plan : re-trie la liste en mémoire (retour instantané),
    /// joue le delta sync (les messages reçus via APNs en arrière-plan remontent
    /// la liste), puis précharge les premières sur ces lignes à jour (#10572).
    /// Distinct de `handleForegroundReturn()`, qui ne rafraîchit que les stories.
    func handleForegroundReactivation() {
        setConversations(conversations)
        Task { [weak self] in
            await self?.refresh()
            self?.prefetchTopConversationMessages()
        }
    }
}
