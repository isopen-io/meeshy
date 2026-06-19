import Foundation
import MeeshySDK

extension Router {
    /// Initiates a call with a specific user, resolving the direct conversation first.
    /// Used by CallKit redialing (INStartCallIntent) and other deep-link entry points.
    @MainActor
    func startCallWithUser(userId: String, isVideo: Bool, conversationListViewModel: ConversationListViewModel) {
        // 1. Fast path: find direct conversation in local cache
        if let existingConv = conversationListViewModel.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == userId
        }) {
            CallManager.shared.startCall(
                conversationId: existingConv.id,
                userId: userId,
                displayName: existingConv.name,
                isVideo: isVideo
            )
            return
        }

        // 2. Network path: find or create direct conversation
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        Task { @MainActor in
            do {
                let conv: Conversation
                if let existingApi = try await ConversationService.shared.findDirectWith(userId: userId) {
                    conv = existingApi.toConversation(currentUserId: currentUserId)
                } else {
                    let created = try await ConversationService.shared.create(
                        type: "direct",
                        participantIds: [userId]
                    )
                    let apiConv = try await ConversationService.shared.getById(created.id)
                    conv = apiConv.toConversation(currentUserId: currentUserId)
                }

                // Start the call
                CallManager.shared.startCall(
                    conversationId: conv.id,
                    userId: userId,
                    displayName: conv.name,
                    isVideo: isVideo
                )
            } catch {
                FeedbackToastManager.shared.showError("Impossible de démarrer l'appel")
            }
        }
    }
}
