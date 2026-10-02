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

/// `viewing:snapshot` — la liste COMPLÈTE des pairs déjà là
/// (`ViewingSnapshotEvent`), adressée à un seul socket : à l'émetteur d'un
/// `viewing:start`, et juste après `authenticated`, une par conversation où
/// des pairs ont déjà l'écran ouvert (jamais une vide).
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
///
/// `sessionStarted` : une nouvelle session socket vient de s'établir. Le
/// serveur a oublié l'ancienne et ré-annonce, juste après `authenticated`, un
/// `viewing:snapshot` par conversation NON VIDE — une conversation vidée entre
/// les deux sessions n'en reçoit aucun. Tout l'état se jette donc ici, sur le
/// même canal, pour précéder à coup sûr les snapshots qui le reconstruisent.
public enum ConversationViewingEvent: Sendable, Equatable {
    case arrived(ConversationViewingChange)
    case left(ConversationViewingChange)
    case snapshot(ConversationViewingSnapshot)
    /// `viewing:activity` (#9061) : le pair ICI regarde, écoute ou agit.
    case active(ConversationViewingChange)
    case sessionStarted
}

/// Émission de `viewing:start` / `viewing:stop` / `viewing:activity`.
/// L'orchestration — QUAND émettre (écran actif, premier plan, reconnexion,
/// cadence de l'activité) — reste côté app.
public protocol ConversationViewingEmitting: AnyObject {
    func emitViewingStart(conversationId: String)
    func emitViewingStop(conversationId: String)
    func emitViewingActivity(conversationId: String)
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

    public func emitViewingActivity(conversationId: String) {
        emitActivitySignal("viewing:activity", conversationId: conversationId)
    }

    func handleViewingActivity(_ change: ConversationViewingChange) {
        conversationViewing.send(.active(change))
    }

    /// Publiée depuis le `.connect` du socket — y compris celui d'une
    /// reconnexion automatique de Socket.IO, qui ne passe pas toujours par
    /// `.disconnect` et laisse alors `isConnected` à `true` de bout en bout.
    func handleViewingSessionStarted() {
        conversationViewing.send(.sessionStarted)
    }

    private func emitActivitySignal(_ event: String, conversationId: String) {
        guard socket?.status == .connected else { return }
        socket?.emit(event, ["conversationId": conversationId])
    }

    func registerActivitySignalHandlers(on socket: SocketIOClient) {
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            self?.handleViewingSessionStarted()
        }

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

        socket.on("viewing:activity") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationViewingChange.self, from: data) { [weak self] event in
                self?.handleViewingActivity(event)
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
