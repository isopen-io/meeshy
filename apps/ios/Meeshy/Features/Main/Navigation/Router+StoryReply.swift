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
    @MainActor
    func navigateToStoryReply(_ context: ReplyContext, conversationListViewModel: ConversationListViewModel) {
        let authId: String
        switch context {
        case .story(_, let authorId, _, _, _, _, _, _): authId = authorId
        case .status(_, let authorId, _, _, _): authId = authorId
        }

        if let existingConv = conversationListViewModel.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == authId
        }) {
            pendingReplyContext = context
            navigateToConversation(existingConv)
            return
        }

        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        Task { @MainActor in
            do {
                let conv: Conversation
                if let existingApi = try await ConversationService.shared.findDirectWith(userId: authId) {
                    conv = existingApi.toConversation(currentUserId: currentUserId)
                } else {
                    let created = try await ConversationService.shared.create(
                        type: "direct",
                        participantIds: [authId]
                    )
                    let apiConv = try await ConversationService.shared.getById(created.id)
                    conv = apiConv.toConversation(currentUserId: currentUserId)
                }
                pendingReplyContext = context
                navigateToConversation(conv)
            } catch {
                ToastManager.shared.showError("Impossible d'ouvrir la conversation")
            }
        }
    }
}
