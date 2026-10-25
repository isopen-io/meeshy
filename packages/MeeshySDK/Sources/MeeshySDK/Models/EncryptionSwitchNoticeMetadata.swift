import Foundation

/// **L'avis d'une bascule du chiffrement** (#12522, #12846) — la ligne système
/// que la passerelle pose dans le fil à chaque activation ou désactivation
/// (`metadata.kind` `encryption-enabled` / `encryption-disabled`), datée de
/// l'ÉPOQUE du régime qu'elle ouvre.
///
/// Même contrat que `JoinNoticeMetadata` : le sens voyage dans
/// `Message.metadata`, jamais dans le texte. Une activation du bout en bout
/// affichée dans le fil SCELLE l'envoi suivant. Le bout en bout ne se
/// désactivant plus (#12949), un avis `encryption-disabled` d'une conversation
/// chiffrée de bout en bout n'existe que dans les fils d'avant la décision
/// (staging) : il s'affiche comme un historique et ne rouvre RIEN, ni l'envoi
/// en clair, ni la lecture. Il est écrit par le serveur : il rend la bascule
/// visible, il ne l'authentifie pas.
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

    /// L'avis dit-il la désactivation d'un bout en bout (historique d'avant
    /// #12949) ? Un mode quitté absent ne le dit pas ; quitter `server` ou
    /// `hybrid` ne retire rien au serveur. Sert au seul TEXTE de l'avis.
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

    /// L'avis se dit-il depuis sa métadonnée (`text`), jamais depuis le texte
    /// du serveur ? Seul un tel avis s'exempte du marqueur « non chiffré » (#12917).
    public var composesItsText: Bool {
        disablesEndToEnd || kind == Self.enabledKind
    }

    /// La phrase de l'avis dans la langue du lecteur, composée depuis la
    /// métadonnée et non depuis le texte que le serveur a écrit : ce que
    /// l'utilisateur LIT est ce que l'envoi compte. Les clés sont celles de la
    /// ligne de liste (`system.encryption.*`). `nil` pour la désactivation d'un
    /// mode lisible par le serveur, que la ligne de liste ne dit pas non plus.
    public func text(_ strings: ConversationPreviewStrings) -> String? {
        guard composesItsText else { return nil }
        if disablesEndToEnd {
            return strings(.systemEncryptionDisabled, ["actor": CaptureNoticeText.sanitizedName(actorName ?? "")])
        }
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
