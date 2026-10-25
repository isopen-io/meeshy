import Foundation

/// Le régime de chiffrement d'une conversation, tel que
/// `GET /conversations/:id/encryption-status` et ses deux bascules le servent
/// (#12522, spec E2EE libsignal iOS/macOS § 5). `epoch` et `canToggleEncryption` sont nuls
/// quand la passerelle est antérieure à la commutation : le client retombe
/// alors sur la politique de rôle (`ConversationEncryptionActivationPolicy`).
public struct ConversationEncryptionStatus: Decodable, Equatable, Sendable {
    public let isEncrypted: Bool
    public let mode: String?
    public let enabledAt: Date?
    public let enabledBy: String?
    public let canTranslate: Bool
    public let epoch: Int?
    public let canToggleEncryption: Bool?

    public init(
        isEncrypted: Bool, mode: String?, enabledAt: Date? = nil, enabledBy: String? = nil,
        canTranslate: Bool = false, epoch: Int? = nil, canToggleEncryption: Bool? = nil
    ) {
        self.isEncrypted = isEncrypted
        self.mode = mode
        self.enabledAt = enabledAt
        self.enabledBy = enabledBy
        self.canTranslate = canTranslate
        self.epoch = epoch
        self.canToggleEncryption = canToggleEncryption
    }

    /// Le serveur ne lit plus les messages : bout en bout.
    public var isEndToEnd: Bool { mode?.lowercased() == E2EEWire.mode }
}

/// `conversation:encryption-changed` (#12522) : le régime a basculé, avec sa
/// nouvelle époque. Aucun contenu de message n'y voyage.
public struct ConversationEncryptionChangedEvent: Decodable, Equatable, Sendable {
    public let conversationId: String
    public let isEncrypted: Bool
    public let mode: String?
    public let epoch: Int
    public let changedByUserId: String
    public let changedAt: String

    public init(conversationId: String, isEncrypted: Bool, mode: String?, epoch: Int, changedByUserId: String, changedAt: String) {
        self.conversationId = conversationId
        self.isEncrypted = isEncrypted
        self.mode = mode
        self.epoch = epoch
        self.changedByUserId = changedByUserId
        self.changedAt = changedAt
    }

    public var changedAtDate: Date? { WireDate.date(from: changedAt) }
    public var isEndToEnd: Bool { mode?.lowercased() == E2EEWire.mode }
}

public extension MeeshyConversation {
    /// La conversation sous le régime annoncé ; `nil` quand l'annonce vise une
    /// autre conversation ou ne change rien de ce qu'elle dit. Activer ouvre
    /// l'ère chiffrée à l'instant de la bascule (`EndToEndPlaintextLaw`) ;
    /// désactiver la ferme.
    func adoptingEncryption(_ event: ConversationEncryptionChangedEvent) -> MeeshyConversation? {
        guard event.conversationId == id, encryptionMode != event.mode else { return nil }
        var adopted = self
        adopted.encryptionMode = event.mode
        adopted.encryptionEnabledAt = event.mode == nil ? nil : (event.changedAtDate ?? Date())
        return adopted
    }
}
