import Combine
import Foundation
import SocketIO

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #8892
// ajoute « est dans la conversation », on extrait d'abord la frappe, on ajoute
// ensuite. Responsabilité tenue ici : les signaux d'ACTIVITÉ qui voyagent dans
// la room d'une conversation — la frappe (`typing:*`) et la présence à l'écran
// (`viewing:*`). Aucun des deux n'expose `isOnline` ni `lastActiveAt`.

/// `viewing:start` / `viewing:stop` reçus — un pair arrive dans la conversation
/// ou la quitte (`ViewingEvent`, `packages/shared/types/socketio-events/presence.ts`).
public struct ConversationViewingChange: Decodable, Sendable, Equatable {
    public let userId: String
    public let conversationId: String

    public init(userId: String, conversationId: String) {
        self.userId = userId
        self.conversationId = conversationId
    }
}

/// `viewing:snapshot` — adressé au seul émetteur d'un `viewing:start` : la
/// liste COMPLÈTE des pairs déjà là (`ViewingSnapshotEvent`).
public struct ConversationViewingSnapshot: Decodable, Sendable, Equatable {
    public let conversationId: String
    public let userIds: [String]

    public init(conversationId: String, userIds: [String]) {
        self.conversationId = conversationId
        self.userIds = userIds
    }
}

/// Les trois événements serveur de « est dans la conversation », sur UN canal :
/// leur ordre relatif compte (un `snapshot` remplace ce qu'un `arrived`
/// antérieur avait posé), deux sujets séparés ne le garantiraient pas.
public enum ConversationViewingEvent: Sendable, Equatable {
    case arrived(ConversationViewingChange)
    case left(ConversationViewingChange)
    case snapshot(ConversationViewingSnapshot)
}

/// Émission de `viewing:start` / `viewing:stop`. L'orchestration — QUAND
/// émettre (écran actif, premier plan, reconnexion) — reste côté app.
public protocol ConversationViewingEmitting: AnyObject {
    func emitViewingStart(conversationId: String)
    func emitViewingStop(conversationId: String)
}

extension MessageSocketManager: ConversationViewingEmitting {

    /// Perdue si le socket n'est pas connecté : l'app la ré-émet à la
    /// connexion suivante (le serveur oublie tout à la déconnexion).
    public func emitViewingStart(conversationId: String) {
        emitActivitySignal("viewing:start", conversationId: conversationId)
    }

    public func emitViewingStop(conversationId: String) {
        emitActivitySignal("viewing:stop", conversationId: conversationId)
    }

    private func emitActivitySignal(_ event: String, conversationId: String) {
        guard socket?.status == .connected else { return }
        socket?.emit(event, ["conversationId": conversationId])
    }

    func registerActivitySignalHandlers(on socket: SocketIOClient) {
        socket.on("typing:start") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TypingEvent.self, from: data) { [weak self] event in
                self?.typingStarted.send(event)
            }
        }

        socket.on("typing:stop") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TypingEvent.self, from: data) { [weak self] event in
                self?.typingStopped.send(event)
            }
        }

        socket.on("viewing:start") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationViewingChange.self, from: data) { [weak self] event in
                self?.conversationViewing.send(.arrived(event))
            }
        }

        socket.on("viewing:stop") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationViewingChange.self, from: data) { [weak self] event in
                self?.conversationViewing.send(.left(event))
            }
        }

        socket.on("viewing:snapshot") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationViewingSnapshot.self, from: data) { [weak self] event in
                self?.conversationViewing.send(.snapshot(event))
            }
        }
    }
}
