import Foundation
import MeeshySDK

extension Router {
    /// Handles a story-reply action from any StoryViewerContainer call site.
    ///
    /// 1. Resolves the DM with the story author from the local cache (fast path).
    /// 2. Falls back to the API: `findDirectWith` then `create` if missing.
    /// 3. Sets `pendingReplyContext` and navigates to the conversation.
    ///
    /// Centralized here (vs duplicated in RootView / iPadRootView / ConversationView /
    /// RootViewComponents) so all call sites share the exact same behavior.
    ///
    /// `conversationList` est OPTIONNEL : c'est un CHEMIN RAPIDE (le DM déjà
    /// chargé), pas une dépendance. Son absence — hôte sans liste montée — fait
    /// simplement passer par l'API, qui est de toute façon le repli nominal.
    @MainActor
    func navigateToStoryReply(_ context: ReplyContext, conversationList: ConversationListViewModel?) {
        let authId: String
        switch context {
        case .story(_, let authorId, _, _, _, _, _, _): authId = authorId
        case .status(_, let authorId, _, _, _, _): authId = authorId
        }

        if let existingConv = conversationList.flatMap({ DirectConversationResolver.loaded(with: authId, in: $0.conversations) }) {
            pendingReplyContext = context
            navigateToConversation(existingConv)
            return
        }

        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        Task { @MainActor in
            do {
                let conv = try await DirectConversationResolver.resolve(with: authId)
                    .toConversation(currentUserId: currentUserId)
                pendingReplyContext = context
                navigateToConversation(conv)
            } catch {
                FeedbackToastManager.shared.showError(String(localized: "conversation.open.error", defaultValue: "Impossible d'ouvrir la conversation", bundle: .main))
            }
        }
    }
}
