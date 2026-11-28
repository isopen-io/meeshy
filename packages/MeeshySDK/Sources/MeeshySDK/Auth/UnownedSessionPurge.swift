import Foundation

/// Ce qu'un compte laisse sur l'appareil SANS porter son nom : files rejouées
/// sous le jeton du moment, brouillons, préférences, cache HTTP. La session
/// suivante le lirait, ou l'enverrait, comme le sien. Toute sortie de session
/// passe par ici, la session fermée par le serveur comprise.
@MainActor
final class UnownedSessionPurge {
    nonisolated deinit {}
    static let shared = UnownedSessionPurge()

    /// La purge des files qu'une session fermée par le serveur a lancée.
    private var pending: Task<Void, Never>?

    /// Ce qui s'efface sans attendre.
    func dropStores() {
        APIClient.shared.clearHTTPCache()
        PackShopSnapshotStore.shared.clearAll()
        SessionSnapshotStore.wipe()
        StoryService.shared.reset()
        // E9 — le brouillon de story appartient au compte sortant.
        StoryDraftStore.shared.clear()
        UserPreferencesManager.shared.resetSession()
        FriendshipCache.shared.clear()
    }

    /// Les files et magasins rangés sans propriétaire : leur rejeu part sous
    /// le jeton de la session COURANTE (outbox-02, E9).
    func dropQueues() async {
        await SettingsActionQueue.shared.clearAll()
        await StoryPublishQueue.shared.clearAll()
        await BlockService.shared.reset()
        await ConversationStore.shared.reset()
        await UserCategoryStore.shared.reset()
        // A5 — le curseur de séquence est per-user.
        await SyncSeqTracker.shared.reset()
    }

    /// Depuis un chemin synchrone (session fermée par le serveur) : les files
    /// partent dans une tâche que `settle()` laisse finir.
    func scheduleQueueDrop() {
        let previous = pending
        pending = Task { [weak self] in
            await previous?.value
            await self?.dropQueues()
            // T15b — un store disque bufferisé peut atterrir après la première.
            APIClient.shared.clearHTTPCache()
        }
    }

    /// Attend la purge en cours : un changement de compte n'ouvre pas le
    /// compte suivant avant elle.
    func settle() async {
        await pending?.value
    }
}
