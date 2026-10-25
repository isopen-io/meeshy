import Foundation

/// **L'avis d'une bascule du chiffrement** (#12522, #12846) — la ligne système
/// que la passerelle pose dans le fil à chaque activation ou désactivation
/// (`metadata.kind` `encryption-enabled` / `encryption-disabled`), datée de
/// l'ÉPOQUE du régime qu'elle ouvre.
///
/// Même contrat que `JoinNoticeMetadata` : le sens voyage dans
/// `Message.metadata`, jamais dans le texte. Son rôle de sécurité : une
/// conversation chiffrée de bout en bout ne repasse en clair, à l'envoi, que
/// lorsque l'utilisateur a VU la bascule — cet avis affiché dans le fil, ou
/// son propre geste. Il est écrit par le serveur : il rend la bascule visible,
/// il ne l'authentifie pas (la bascule scellée par son auteur est un suivi).
///
/// Producteur : `services/gateway/src/routes/conversation-encryption.ts`
/// (`announceSwitch`) ; lecteur TypeScript de la clé :
/// `services/gateway/src/routes/conversations/utils/last-message-nature.ts`.
public struct EncryptionSwitchNoticeMetadata: Codable, Sendable, Equatable {

    public static let enabledKind = "encryption-enabled"
    public static let disabledKind = "encryption-disabled"

    public let kind: String
    /// L'époque du régime que la bascule ouvre.
    public let epoch: Int
    /// Le mode activé (`encryption-enabled`).
    public let mode: String?
    /// Le mode quitté (`encryption-disabled`).
    public let previousMode: String?
    /// Le nom de l'auteur de la bascule, nettoyé (`CaptureNoticeText.sanitizedName`).
    public let actorName: String?

    public init(kind: String, epoch: Int, mode: String? = nil, previousMode: String? = nil, actorName: String? = nil) {
        self.kind = kind
        self.epoch = epoch
        self.mode = mode
        self.previousMode = previousMode
        self.actorName = actorName
    }

    /// La bascule rend-elle au serveur le clair d'une conversation chiffrée de
    /// bout en bout ? Un mode quitté absent ne CONFIRME rien (cet avis sert à
    /// rendre le clair : dans le doute, il ne le rend pas) ; quitter `server` ou
    /// `hybrid` ne retire rien au serveur.
    public var disablesEndToEnd: Bool {
        guard kind == Self.disabledKind, let previousMode else { return false }
        return !DeviceTranslationEligibility.serverReadsMessage(
            conversationEncryptionMode: previousMode, isEncrypted: false, encryptionMode: nil
        )
    }

    /// L'activation ouvre-t-elle le bout en bout ? Un mode inconnu se lit comme
    /// tel : cet avis sert à sceller, dans le doute il scelle.
    public var enablesEndToEnd: Bool {
        kind == Self.enabledKind && !DeviceTranslationEligibility.serverReadsMessage(
            conversationEncryptionMode: mode ?? E2EEWire.mode, isEncrypted: false, encryptionMode: nil
        )
    }

    /// La phrase de l'avis dans la langue du lecteur, composée depuis la
    /// métadonnée et non depuis le texte que le serveur a écrit : ce que
    /// l'utilisateur LIT est ce que l'envoi compte. Les clés sont celles de la
    /// ligne de liste (`system.encryption.*`). `nil` pour la désactivation d'un
    /// mode lisible par le serveur, que la ligne de liste ne dit pas non plus.
    public func text(_ strings: ConversationPreviewStrings) -> String? {
        if disablesEndToEnd {
            return strings(.systemEncryptionDisabled, ["actor": CaptureNoticeText.sanitizedName(actorName ?? "")])
        }
        guard kind == Self.enabledKind else { return nil }
        return strings(enablesEndToEnd ? .systemEncryptionE2EE : .systemEncryptionEnabled, [:])
    }

    private enum CodingKeys: String, CodingKey {
        case kind, epoch, mode, previousMode, actor, actorName
    }

    private struct Actor: Decodable {
        let displayName: String?
    }

    /// VALIDE plutôt que caste : `metadata` est partagé par toutes les familles d'avis.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        guard kind == Self.enabledKind || kind == Self.disabledKind else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "metadata.kind is not an encryption switch")
        }
        let epoch = try c.decode(Int.self, forKey: .epoch)
        guard epoch >= 0 else {
            throw DecodingError.dataCorruptedError(forKey: .epoch, in: c, debugDescription: "époque illisible")
        }
        self.kind = kind
        self.epoch = epoch
        mode = try c.decodeIfPresent(String.self, forKey: .mode)
        previousMode = try c.decodeIfPresent(String.self, forKey: .previousMode)
        let served = (try? c.decodeIfPresent(Actor.self, forKey: .actor))??.displayName
        actorName = try served ?? c.decodeIfPresent(String.self, forKey: .actorName)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(epoch, forKey: .epoch)
        try c.encodeIfPresent(mode, forKey: .mode)
        try c.encodeIfPresent(previousMode, forKey: .previousMode)
        try c.encodeIfPresent(actorName, forKey: .actorName)
    }
}
