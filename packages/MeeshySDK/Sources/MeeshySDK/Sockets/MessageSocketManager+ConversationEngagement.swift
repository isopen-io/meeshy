import Combine
import Foundation

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #8906
// ajoute `engagement:conversation-updated`. Responsabilité tenue ici : l'état
// « 🔥 série · N (M) » du lecteur dans une conversation, poussé au SEUL
// utilisateur crédité après chacun de ses gestes (`SERVER_EVENTS
// .ENGAGEMENT_CONVERSATION_UPDATED`, `packages/shared/types/socketio-events`).

/// `engagement:post-updated` (#9569, #9571) — ce qu'un post a rapporté au
/// lecteur, poussé à sa seule room `user:<id>` après un geste crédité. Un canal
/// statique : `MessageSocketManager.swift` est hors budget.
public enum PostEngagementChannel {
    nonisolated(unsafe) public static let updates = PassthroughSubject<PostEngagementSnapshot, Never>()
}

extension MessageSocketManager {

    public var postEngagementUpdated: AnyPublisher<PostEngagementSnapshot, Never> {
        PostEngagementChannel.updates.eraseToAnyPublisher()
    }

    var conversationEngagementRoutes: [SocketInboundRoute] {
        [
            route(.engagementConversationUpdated, ConversationEngagementSnapshot.self) { $0.conversationEngagementUpdated.send($1) },
            route(.engagementPostUpdated, PostEngagementSnapshot.self) { _, snapshot in
                PostEngagementChannel.updates.send(snapshot)
            },
        ]
    }
}
