import Foundation

/// Le régime de chiffrement d'une conversation, tel que
/// `GET /conversations/:id/encryption-status` et l'activation le servent
/// (#12522, #12949, spec E2EE libsignal iOS/macOS § 5). `epoch` et `canToggleEncryption` sont nuls
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
    /// Le tête-à-tête chiffré de bout en bout de la même paire, quand celui-ci
    /// est le lisible (#12966) ; `nil` sinon, ou d'une passerelle antérieure.
    public let pairEndToEndConversationId: String?

    public init(
        isEncrypted: Bool, mode: String?, enabledAt: Date? = nil, enabledBy: String? = nil,
        canTranslate: Bool = false, epoch: Int? = nil, canToggleEncryption: Bool? = nil,
        pairEndToEndConversationId: String? = nil
    ) {
        self.isEncrypted = isEncrypted
        self.mode = mode
        self.enabledAt = enabledAt
        self.enabledBy = enabledBy
        self.canTranslate = canTranslate
        self.epoch = epoch
        self.canToggleEncryption = canToggleEncryption
        self.pairEndToEndConversationId = pairEndToEndConversationId
    }

    /// Le serveur ne lit plus les messages : bout en bout.
    public var isEndToEnd: Bool { mode?.lowercased() == E2EEWire.mode }
}

/// `conversation:encryption-changed` (#12522) : le régime a basculé, avec sa
/// nouvelle époque. Aucun contenu de message n'y voyage. Une annonce qui
/// quitterait le bout en bout est ignorée (#12949).
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
    /// autre conversation, ne change rien de ce qu'elle dit, ou ferait quitter
    /// le bout en bout — qui ne se désactive pas (#12949) : une annonce servie
    /// vers le clair ne repeint jamais une conversation chiffrée de bout en
    /// bout. Activer ouvre l'ère chiffrée à l'instant de la bascule, borné par
    /// l'horloge de l'appareil (`EndToEndRegime`, #12936).
    func adoptingEncryption(_ event: ConversationEncryptionChangedEvent, now: Date = Date()) -> MeeshyConversation? {
        guard event.conversationId == id, encryptionMode != event.mode,
              !EndToEndPlaintextLaw.isEndToEndConversation(encryptionMode) || EndToEndPlaintextLaw.isEndToEndConversation(event.mode)
        else { return nil }
        var adopted = self
        adopted.encryptionMode = event.mode
        adopted.encryptionEnabledAt = event.mode == nil ? nil : min(event.changedAtDate ?? now, now)
        return adopted
    }
}
