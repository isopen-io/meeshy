import Foundation
import MeeshySDK
import os

/// **Le préchargement des messages des premières conversations de la liste.**
///
/// Extrait de `ConversationListViewModel` (#8651, fichier hors budget).
///
/// La tâche est DÉTACHÉE : elle survit à la vue et au modèle qui l'ont lancée,
/// et chaque requête part sous le jeton COURANT d'`APIClient`, pas sous celui
/// de son lancement. Incident de production du 2026-09-29 : juste après un
/// changement de compte, ~30 `GET /conversations/:id/messages` → 404 — les
/// conversations du compte QUITTÉ, demandées sous le compte suivant. Elle ne
/// demande donc rien, et n'écrit rien, dès que `stillOwner()` dit que le compte
/// qui l'a lancée n'est plus le compte actif — ni pour un identifiant vide.
enum ConversationListMessagePrefetcher {

    nonisolated static let maxConversations = 20

    /// Les identifiants à précharger : les premiers NON VIDES, dans l'ordre.
    nonisolated static func targets(_ conversations: [Conversation]) -> [String] {
        Array(conversations.map(\.id).filter { !$0.isEmpty }.prefix(maxConversations))
    }

    static func start(
        conversationIds: [String],
        messageService: MessageServiceProviding,
        userId: String,
        username: String?,
        prism: [String],
        stillOwner: @escaping @MainActor @Sendable () -> Bool
    ) {
        Task.detached(priority: .utility) {
            await withTaskGroup(of: Void.self) { group in
                for conversationId in conversationIds {
                    guard await stillOwner() else { return }
                    // SWR: prefetch only when the cache cannot already serve a
                    // preview. `.fresh` / `.stale` both surface usable data
                    // (the row's preview path reads them directly), so we
                    // skip the network round-trip. `.expired` / `.empty`
                    // mean the row would render an empty preview — fetch.
                    let result = await CacheCoordinator.shared.messages.load(for: conversationId)
                    switch result {
                    case .fresh(let cached, _) where !cached.isEmpty,
                         .stale(let cached, _) where !cached.isEmpty:
                        continue
                    case .fresh, .stale, .expired, .empty:
                        break
                    }

                    group.addTask {
                        guard await stillOwner() else { return }
                        do {
                            let response = try await messageService.list(
                                conversationId: conversationId,
                                offset: 0,
                                limit: 20,
                                includeReplies: true,
                                includeTranslations: true
                            )
                            guard response.success, await stillOwner() else { return }
                            let messages = response.data.reversed().map {
                                $0.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: prism)
                            }
                            try? await CacheCoordinator.shared.messages.save(messages, for: conversationId)
                        } catch {
                            Logger.messages.warning("[ConversationList] prefetch failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                        }
                    }
                }
            }
        }
    }
}
