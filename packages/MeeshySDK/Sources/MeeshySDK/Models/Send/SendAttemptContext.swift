import Foundation

/// Ce qui est figé au début d'un envoi et lu par chacune de ses étapes.
public struct SendAttemptContext: Equatable, Sendable {
    public let clientMessageId: MessageID
    public let startedAt: Date
    public let intent: MessageProtectionIntent
    public let language: String
    public let reusesExistingRow: Bool

    public init(
        clientMessageId: MessageID,
        startedAt: Date,
        intent: MessageProtectionIntent,
        language: String,
        reusesExistingRow: Bool
    ) {
        self.clientMessageId = clientMessageId
        self.startedAt = startedAt
        self.intent = intent
        self.language = language
        self.reusesExistingRow = reusesExistingRow
    }
}

/// Ce qui quitte l'appareil : la requête composée, le contenu éventuellement
/// chiffré et son état de chiffrement.
public struct SealedOutgoingPayload: Sendable {
    public let request: SendMessageRequest
    public let content: String?
    public let isEncrypted: Bool

    public init(request: SendMessageRequest, content: String?, isEncrypted: Bool) {
        self.request = request
        self.content = content
        self.isEncrypted = isEncrypted
    }
}
