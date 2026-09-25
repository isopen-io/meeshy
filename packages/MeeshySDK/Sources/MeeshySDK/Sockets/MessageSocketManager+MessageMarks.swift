import Combine
import Foundation
import SocketIO

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #7939
// ajoute `message:starred`, on extrait d'abord l'épinglage, on ajoute ensuite.
// Responsabilité tenue ici : les MARQUES posées sur un message — l'épingle,
// partagée par la conversation, et l'étoile, personnelle au lecteur.

public struct MessagePinnedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let pinnedBy: String?
    public let pinnedAt: String?

    public init(messageId: String, conversationId: String, pinnedBy: String? = nil, pinnedAt: String? = nil) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.pinnedBy = pinnedBy
        self.pinnedAt = pinnedAt
    }
}

public struct MessageUnpinnedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
    }
}

/// `message:starred` (#7377, #7939) — l'étoile PERSONNELLE du lecteur, posée
/// ou retirée depuis un autre de ses appareils. La passerelle l'émet vers la
/// seule room `user:<id>`, jamais vers la conversation : un favori est privé.
/// La charge ne porte aucun contenu du message ; `starredAt` est l'instant de
/// pose, `nil` quand `starred` vaut `false`.
public struct MessageStarredEvent: Decodable, Sendable, Equatable {
    public let messageId: String
    public let conversationId: String
    public let starred: Bool
    public let starredAt: Date?

    public init(messageId: String, conversationId: String, starred: Bool, starredAt: Date?) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.starred = starred
        self.starredAt = starredAt
    }
}

extension MessageSocketManager {

    func registerMessageMarkHandlers(on socket: SocketIOClient) {
        socket.on("message:pinned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessagePinnedEvent.self, from: data) { [weak self] event in
                self?.messagePinned.send(event)
            }
        }

        socket.on("message:unpinned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageUnpinnedEvent.self, from: data) { [weak self] event in
                self?.messageUnpinned.send(event)
            }
        }

        socket.on("message:starred") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageStarredEvent.self, from: data) { [weak self] event in
                self?.messageStarred.send(event)
            }
        }
    }
}
