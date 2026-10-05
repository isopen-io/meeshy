import Combine
import Foundation
import SocketIO

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #8906
// ajoute `engagement:conversation-updated`. Responsabilité tenue ici : l'état
// « 🔥 série · N (M) » du lecteur dans une conversation, poussé au SEUL
// utilisateur crédité après chacun de ses gestes (`SERVER_EVENTS
// .ENGAGEMENT_CONVERSATION_UPDATED`, `packages/shared/types/socketio-events`).

extension MessageSocketManager {

    func registerConversationEngagementHandlers(on socket: SocketIOClient) {
        socket.on("engagement:conversation-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationEngagementSnapshot.self, from: data) { [weak self] snapshot in
                self?.conversationEngagementUpdated.send(snapshot)
            }
        }
    }
}
