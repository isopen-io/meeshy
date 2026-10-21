import Foundation

/// Ce qu'un envoi réussi rend : l'identifiant client, et ce qui lui est arrivé.
public struct SentMessageReceipt: Equatable, Sendable {
    public enum Delivery: Equatable, Sendable {
        case acknowledged(serverId: MessageID, at: Date, via: SendAttemptRecord.Transport)
        case queuedOffline
    }

    public let clientMessageId: MessageID
    public let delivery: Delivery

    public init(clientMessageId: MessageID, delivery: Delivery) {
        self.clientMessageId = clientMessageId
        self.delivery = delivery
    }
}
