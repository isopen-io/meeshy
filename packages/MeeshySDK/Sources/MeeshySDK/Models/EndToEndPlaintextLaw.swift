import Foundation

// MARK: - Un message en clair dans une conversation chiffrée (#11380)

/// Ce qu'un message d'une conversation chiffrée de bout en bout prouve de
/// lui-même, sur CET appareil.
public enum EndToEndMessageStanding: Equatable, Sendable {
    /// Rien à signaler : conversation lisible par le serveur, historique
    /// antérieur à l'activation, clair déchiffré sur l'appareil, message encore
    /// scellé, avis système structuré, message du lecteur.
    case ordinary
    /// Message arrivé EN CLAIR dans l'ère chiffrée d'une conversation : le
    /// serveur l'a lu, et rien ne prouve qu'il vient de son auteur.
    case unencrypted

    public var isUnencrypted: Bool { self == .unencrypted }
}

/// **Le régime de chiffrement d'une conversation, tel que CET appareil le
/// tient** (#11380). Deux faits : la conversation est-elle chiffrée de bout en
/// bout, et depuis quand.
///
/// Le chiffrement ne se désactive pas (`conversation-encryption.ts` : « cannot
/// be changed »). Le régime est donc MONOTONE : `merging` garde l'E2EE dès qu'un
/// des deux côtés l'a vu, et la date d'activation la plus ANCIENNE connue — une
/// passerelle compromise qui servirait `encryptionMode: null` ou une activation
/// reculée n'élargit pas ce qu'elle peut faire lire en clair.
///
/// **Décision explicite — activation sans date** : tout le fil se lit dans
/// l'ère chiffrée (fail-closed). La passerelle sert la date sur la liste et le
/// détail ; son absence est une ligne de cache antérieure (le premier
/// rafraîchissement la pose) ou un serveur qui la retient.
public struct EndToEndRegime: Equatable, Sendable, Codable {
    public let isEndToEnd: Bool
    public let enabledAt: Date?

    public static let serverReadable = EndToEndRegime(isEndToEnd: false, enabledAt: nil)

    public init(isEndToEnd: Bool, enabledAt: Date?) {
        self.isEndToEnd = isEndToEnd
        self.enabledAt = isEndToEnd ? enabledAt : nil
    }

    public init(encryptionMode: String?, enabledAt: Date?) {
        self.init(isEndToEnd: EndToEndPlaintextLaw.isEndToEndConversation(encryptionMode), enabledAt: enabledAt)
    }

    /// Le régime que le serveur SERT pour cette conversation — sans mémoire.
    public init(conversation: MeeshyConversation?) {
        self.init(encryptionMode: conversation?.encryptionMode, enabledAt: conversation?.encryptionEnabledAt)
    }

    /// Monotone : E2EE dès qu'un côté l'a vu, et la plus ancienne activation connue.
    public func merging(_ other: EndToEndRegime?) -> EndToEndRegime {
        guard let other, other.isEndToEnd else { return self }
        guard isEndToEnd else { return other }
        let dates = [enabledAt, other.enabledAt].compactMap { $0 }
        return EndToEndRegime(isEndToEnd: true, enabledAt: dates.min())
    }

    /// Un message créé à cet instant appartient-il à l'ère chiffrée ? Un
    /// instant ou une activation inconnus s'y rangent (fail-closed).
    public func governs(createdAt: Date?) -> Bool {
        guard isEndToEnd else { return false }
        guard let enabledAt, let createdAt else { return true }
        return createdAt >= enabledAt
    }

    /// **Le serveur peut-il traduire ce message ?** Non dans l'ère chiffrée : il
    /// ne le lit pas, donc toute traduction qu'il en sert est une traduction
    /// qu'il a FORGÉE — texte comme piste audio. L'historique antérieur à
    /// l'activation, lisible par le serveur quand il a été écrit, garde les
    /// siennes. Les traductions faites sur l'appareil ne passent pas par ici.
    public func admitsWireTranslations(forMessageCreatedAt createdAt: Date?) -> Bool {
        !governs(createdAt: createdAt)
    }
}

/// **La loi UNIQUE qui juge un message déclaré en clair dans une conversation
/// chiffrée de bout en bout** (#11380, audit adversarial de #11378, constat H2).
///
/// Modèle de menace : une passerelle compromise injecte `isEncrypted: false`
/// et un texte sous le nom d'un membre. La provenance (#11382) prouve un clair
/// DÉCHIFFRÉ ; elle ne peut pas refuser un clair qui se déclare non chiffré.
/// Sceller ce message rendrait illisibles les envois en clair légitimes des
/// clients sans session (#8221) tant que leur usage n'est pas mesuré (#11404) :
/// la loi le SIGNALE. Ses consommateurs l'affichent marqué ; aucune traduction
/// du serveur n'y est servie (`EndToEndRegime.admitsWireTranslations`).
///
/// Seul un avis SYSTÈME STRUCTURÉ est exempté — son texte se compose chez le
/// lecteur depuis ses métadonnées. Se déclarer `system`, `agent` ou porter une
/// métadonnée d'avis sur un message utilisateur n'exempte de rien : ce sont des
/// champs que le serveur écrit.
///
/// Le fil, l'aperçu d'appui long et la ligne de liste la lisent ; aucun ne
/// réécrit la règle.
public enum EndToEndPlaintextLaw {

    /// La conversation est-elle chiffrée de bout en bout ? Même lecture que
    /// `DeviceTranslationEligibility.serverReadsMessage` : un régime inconnu se
    /// lit comme un régime que le serveur ne lit pas, et seuls l'absence de
    /// régime, `server` et `hybrid` le lui donnent.
    public static func isEndToEndConversation(_ encryptionMode: String?) -> Bool {
        !DeviceTranslationEligibility.serverReadsMessage(
            conversationEncryptionMode: encryptionMode, isEncrypted: false, encryptionMode: nil
        )
    }

    /// Le verdict sur un message que le client tient en entier.
    public static func standing(of message: MeeshyMessage, in regime: EndToEndRegime) -> EndToEndMessageStanding {
        guard regime.governs(createdAt: message.createdAt),
              !message.isMe,
              message.deletedAt == nil,
              !message.isEncrypted,
              !message.isContentDecryptedOnDevice,
              !isStructuredSystemNotice(message),
              carriesClearPayload(message)
        else { return .ordinary }
        return .unencrypted
    }

    /// Le verdict sur le DERNIER message que la ligne de liste résume, sous le
    /// régime servi fusionné avec celui que l'appareil retient. Il n'affirme
    /// rien sans la nature du message (serveur antérieur à #7545) ni sans un
    /// auteur pair connu : la ligne n'accuse pas un auteur qu'elle ne sait pas
    /// nommer, le fil juge le message entier. Un événement système s'y rend par
    /// son libellé de catalogue, jamais par un texte du serveur.
    public static func lastMessageStanding(
        of conversation: MeeshyConversation,
        remembered: EndToEndRegime? = nil,
        readerLabel: String = ConversationListAuthor.readerLabel
    ) -> EndToEndMessageStanding {
        let regime = EndToEndRegime(conversation: conversation).merging(remembered)
        guard regime.governs(createdAt: conversation.lastMessageAt),
              let nature = conversation.lastMessageNature,
              !nature.isEncrypted,
              nature.systemEvent == nil,
              nature.callSummary == nil,
              conversation.lastMessageId?.isEmpty == false,
              conversation.lastMessageSenderUserId?.isEmpty == false,
              conversation.lastMessageSenderName != readerLabel
        else { return .ordinary }
        return .unencrypted
    }

    private static func isStructuredSystemNotice(_ message: MeeshyMessage) -> Bool {
        message.messageSource == .system && (
            message.callSummary != nil
                || message.joinNotice != nil
                || message.captureNotice != nil
                || message.arrivalsNotice != nil
        )
    }

    /// Un texte, une pièce non chiffrée, un lieu ou un sticker : ce que le
    /// serveur a lu. Un média seul dont toutes les pièces sont chiffrées ne
    /// l'est pas.
    private static func carriesClearPayload(_ message: MeeshyMessage) -> Bool {
        !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || message.attachments.contains { !$0.isEncrypted }
            || message.location != nil
            || message.sticker != nil
    }
}
