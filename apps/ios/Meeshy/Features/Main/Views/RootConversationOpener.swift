import SwiftUI
import os
import MeeshySDK

/// Ouverture d'une conversation PAR IDENTIFIANT, sortie de `RootView.swift`
/// (cohésion du fichier) : liste en mémoire, puis cache GRDB, puis réseau avec
/// une seconde tentative. Tout ce que la racine iPhone ouvre par id — lien
/// profond, notification, mini-lecteur, intention de l'app — passe par ce
/// site unique. La liste vivante est LUE par fermeture (`knownConversations`),
/// jamais copiée : le propriétaire garde son état.
struct RootConversationOpener {
    let router: Router
    let knownConversations: () -> [Conversation]

    /// #6998 — `ensureUnread` a DISPARU, et ce n'est pas un allègement : ce
    /// paramètre forçait `unreadCount = 1` hors de tout store, sur une copie
    /// locale de la ligne, à la seule ouverture par notification. La
    /// conversation s'ouvrait donc sur un non-lu FICTIF — séparateur
    /// « nouveaux messages » sur un message déjà lu, pastille inventée dans
    /// l'agrégat — et le deep link `/c/:id` du même écran ne le faisait pas,
    /// si bien que deux chemins vers la MÊME conversation ne montraient pas la
    /// même chose. Le compteur appartient au registre de lecture
    /// (`ConversationReadLedger`) ; aucune vue ne le fabrique.
    func navigateToConversationById(_ conversationId: String, highlightMessageId: String? = nil) {
        // 1. Fast path: in-memory list (post-load happy path)
        if let existing = knownConversations().first(where: { $0.id == conversationId }) {
            router.navigateToConversation(existing, highlightMessageId: highlightMessageId)
            return
        }

        Task {
            // 2. Cache-first: GRDB conversations list (cold-start deep link path).
            // Avoids forcing a network round-trip when previous-session data is
            // already on disk; the network fetch then runs silently in the
            // background to refresh the cache.
            let cachedList = await CacheCoordinator.shared.conversations.load(for: "list")
            let cachedConversations: [MeeshyConversation]? = {
                switch cachedList {
                case .fresh(let list, _), .stale(let list, _): return list
                case .expired, .empty: return nil
                }
            }()
            if let cached = cachedConversations?.first(where: { $0.id == conversationId }) {
                router.navigateToConversation(cached, highlightMessageId: highlightMessageId)
                // Background refresh — keeps the displayed conversation in sync
                // without blocking navigation. Failures are silent: the user
                // already sees the cached version.
                Task.detached(priority: .utility) {
                    let currentUserId = await AuthManager.shared.currentUser?.id ?? ""
                    if let apiConv = try? await ConversationService.shared.getById(conversationId) {
                        let refreshed = apiConv.toConversation(currentUserId: currentUserId)
                        // Fusion sur la liste DU MOMENT, pas sur l'instantané lu
                        // avant l'aller-retour : la synchro de la liste a pu en
                        // écrire une plus récente entre-temps, que ce `save`
                        // écrasait (conversations neuves et non-lus perdus).
                        await CacheCoordinator.shared.conversations.mergeUpdate(for: "list") { current in
                            var merged = current
                            if let i = merged.firstIndex(where: { $0.id == refreshed.id }) {
                                merged[i] = refreshed
                            } else {
                                merged.insert(refreshed, at: 0)
                            }
                            return merged
                        }
                        await SearchIndex.shared.indexConversations([refreshed])
                    }
                }
                return
            }

            // 3. Network fallback: cache miss + offline-aware error UX.
            //    A push notification for a freshly-created conversation can
            //    race the gateway's commit transaction (rare but observed
            //    in production) — the client sees the notification before
            //    the conversation row is fully visible to the same user
            //    via `findFirst`. Retry once after a short delay before
            //    surfacing an error to the user. This eats one extra
            //    round-trip in the worst case but turns "Impossible
            //    d'ouvrir" into a working open in the common case.
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            var lastError: Error?
            for attempt in 0..<2 {
                do {
                    let apiConv = try await ConversationService.shared.getById(conversationId)
                    let conv = apiConv.toConversation(currentUserId: currentUserId)
                    router.navigateToConversation(conv, highlightMessageId: highlightMessageId)
                    return
                } catch {
                    lastError = error
                    Logger.messages.error("[RootView] navigateToConversationById attempt=\(attempt) id=\(conversationId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
                    if attempt == 0 {
                        _ = await cancellableSleep(for: .milliseconds(600))
                    }
                }
            }
            let underlying = (lastError as? LocalizedError)?.errorDescription ?? lastError?.localizedDescription
            let detail = underlying.map { " (\($0))" } ?? ""
            FeedbackToastManager.shared.showError(
                String(localized: "link.error.open-conversation", defaultValue: "Impossible d'ouvrir la conversation") + detail
            )
        }
    }
}
