import Foundation
import os
import MeeshySDK

/// Ouvre la conversation (DM) de l'interlocuteur pendant l'appel. Sortie de
/// `CallView+Header.swift` : l'écran d'appel ne porte que ses vues, la
/// résolution de la conversation n'a rien d'une vue.
enum CallConversationOpener {
    private nonisolated static let logger = MeeshyLog.logger(.calls)

    /// Résout la conversation cache-first (Instant App : la conversation de
    /// l'appel est quasi toujours déjà dans la liste en cache → navigation
    /// immédiate), avec repli réseau — le socket d'appel étant vivant, le repli
    /// `getById` aboutit. La `Conversation` résolue est postée sur le canal
    /// `.navigateToConversation` que RootView/iPadRootView routent vers le DM.
    @MainActor
    static func open(conversationId: String) async {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        switch await CacheCoordinator.shared.conversations.load(for: "list") {
        case .fresh(let list, _), .stale(let list, _):
            if let conv = list.first(where: { $0.id == conversationId }) {
                NotificationCenter.default.post(name: .navigateToConversation, object: conv)
                return
            }
        case .expired, .empty:
            break
        }
        do {
            let apiConv = try await ConversationService.shared.getById(conversationId)
            let conv = apiConv.toConversation(currentUserId: currentUserId)
            NotificationCenter.default.post(name: .navigateToConversation, object: conv)
        } catch {
            logger.warning("CallView: conversation d'appel non résolue (\(conversationId)): \(error.localizedDescription)")
        }
    }
}
