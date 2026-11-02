import Foundation

extension MessagePersistenceActor {
    /// La forme appauvrie d'un message entrant, hors de l'acteur : une valeur, pas son état.
    public typealias IncomingMessageData = IncomingMessageRow
}

/// Minimal-data ingestion payload. Use ONLY when the caller genuinely has
/// nothing richer than these six fields (e.g. a NotificationServiceExtension
/// pre-persist). Any caller holding a decoded `APIMessage` MUST go through
/// `bufferIncomingAPIMessages` instead — `reconcileBatchSync` hard-codes
/// `attachmentsJson/reactionsJson/replyToJson = nil` and `messageType = "text"`,
/// so media / reply messages lose their payload here.
public struct IncomingMessageRow: Sendable {
    public let id: String
    public let conversationId: String
    public let senderId: String
    public let content: String?
    public let createdAt: Date
    public let computedState: MessageState
    /// **Ce qui décide du RENDU** — un `system` s'affiche en avis dédié,
    /// un `user` en parole avec avatar et nom.
    ///
    /// Cette forme est APPAUVRIE par nature : elle sert à réconcilier un
    /// message aperçu ailleurs, pas à le décrire entièrement. Elle écrivait
    /// donc `"user"` en dur, et un avis d'arrivée naissait en base comme
    /// une parole (régression 2026-08-24). Le défaut reste `"user"` — tous
    /// les appelants existants gardent leur comportement — mais celui qui
    /// CONNAÎT la source doit pouvoir la transmettre.
    public let messageSource: String
    public let messageType: String
    /// **La protection voyage avec la ligne** (#7552). Sans elle, un
    /// éphémère que le cache ressert renaissait en base comme un message
    /// ORDINAIRE — sans flamme, sans échéance, jamais balayé.
    public let expiresAt: Date?
    public let effectFlags: UInt32
    public let ephemeralDuration: Int?
    /// **Un message chiffré de bout en bout le reste en base** (#12916).
    /// Rattrapé sans ce drapeau, il naissait en clair déclaré, portant le
    /// littéral `[Encrypted]` : le fil n'y cherchait jamais le clair.
    public let isEncrypted: Bool
    public let encryptionMode: String?

    public init(id: String, conversationId: String, senderId: String,
                content: String?, createdAt: Date, computedState: MessageState,
                messageSource: String = "user", messageType: String = "text",
                expiresAt: Date? = nil, effectFlags: UInt32 = 0, ephemeralDuration: Int? = nil,
                isEncrypted: Bool = false, encryptionMode: String? = nil) {
        self.id = id
        self.conversationId = conversationId
        self.senderId = senderId
        self.content = content
        self.messageSource = messageSource
        self.messageType = messageType
        self.createdAt = createdAt
        self.computedState = computedState
        self.expiresAt = expiresAt
        self.effectFlags = effectFlags
        self.ephemeralDuration = ephemeralDuration
        self.isEncrypted = isEncrypted
        self.encryptionMode = encryptionMode
    }

    /// Ce que la ligne garde comme texte : jamais un clair pour un message
    /// chiffré — le clair vit dans la base scellée de libsignal.
    var persistedContent: String? {
        isEncrypted ? E2EEWire.contentPlaceholder : content
    }
}
