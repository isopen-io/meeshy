import Foundation
import MeeshySDK

/// Exécute les gestes de rangée de la liste des notifications (#8105) par les
/// flux EXISTANTS : la demande d'ami de `FriendService`, la conversation
/// directe de `ConversationCreator`. Le SDK dit quels gestes existent ; ici se
/// décide ce qu'ils font.
protocol NotificationQuickActionPerforming {
    func perform(_ action: NotificationQuickAction) async -> Bool
}

@MainActor
struct NotificationQuickActionPerformer: NotificationQuickActionPerforming {
    let friends: any FriendServiceProviding
    let conversations: any ConversationCreating
    let currentUserId: () -> String
    let openConversation: (Conversation) -> Void

    init(
        friends: any FriendServiceProviding = FriendService.shared,
        conversations: any ConversationCreating = ConversationCreator(),
        currentUserId: @escaping () -> String = { AuthManager.shared.currentUser?.id ?? "" },
        openConversation: @escaping (Conversation) -> Void
    ) {
        self.friends = friends
        self.conversations = conversations
        self.currentUserId = currentUserId
        self.openConversation = openConversation
    }

    func perform(_ action: NotificationQuickAction) async -> Bool {
        switch action {
        case .connect(let userId):
            return await connect(to: userId)
        case .write(let userId):
            guard let conversation = await conversations.openDirectConversation(with: userId, currentUserId: currentUserId()) else {
                return false
            }
            openConversation(conversation)
            return true
        }
    }

    private func connect(to userId: String) async -> Bool {
        do {
            let request = try await friends.sendFriendRequest(receiverId: userId, message: nil)
            FriendshipCache.shared.didSendRequest(to: userId, requestId: request.id)
            HapticFeedback.success()
            return true
        } catch {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(
                String(localized: "notifications.quick.connect.failed", defaultValue: "La demande n'a pas pu partir. Réessaie dans un instant.", bundle: .main)
            )
            return false
        }
    }
}
