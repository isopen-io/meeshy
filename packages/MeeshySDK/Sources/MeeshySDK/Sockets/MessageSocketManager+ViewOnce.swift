import Combine
import Foundation
import SocketIO

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #7579
// ajoute `message:view-once-purged`, on extrait d'abord la vue unique, on
// ajoute ensuite. Responsabilité tenue ici : les événements de la vue unique
// par personne (contrat serveur #7578).

/// `message:consumed` — dit QUI a ouvert une vue unique. Seul le lecteur dont
/// c'est l'identité passe la bulle en « déjà ouvert » ; les autres ne retirent
/// rien et tiennent au plus le compteur.
public struct MessageConsumedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let viewOnceCount: Int
    public let maxViewOnceCount: Int
    public let isFullyConsumed: Bool
}

/// `message:view-once-purged` — le serveur a purgé le CONTENU d'une vue unique
/// (tous les destinataires l'ont ouverte, ou le plafond de rétention est
/// atteint). Ce n'est pas un retrait : chaque client vide son contenu local et
/// garde la bulle, en « déjà ouvert ».
public struct ViewOncePurgedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
    }
}

extension MessageSocketManager {

    func registerViewOnceHandlers(on socket: SocketIOClient) {
        socket.on("message:consumed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageConsumedEvent.self, from: data) { [weak self] event in
                self?.messageConsumed.send(event)
            }
        }

        socket.on("message:view-once-purged") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ViewOncePurgedEvent.self, from: data) { [weak self] event in
                self?.viewOncePurged.send(event)
            }
        }
    }
}
