import Foundation

// MARK: - Un message en clair dans une conversation chiffrée (#11380)

/// Ce qu'un message d'une conversation chiffrée de bout en bout prouve de
/// lui-même, sur CET appareil.
public enum EndToEndMessageStanding: Equatable, Sendable {
    /// Rien à signaler : conversation lisible par le serveur, clair déchiffré
    /// sur l'appareil, message encore scellé, avis système, message du lecteur.
    case ordinary
    /// Message d'un membre arrivé EN CLAIR dans une conversation chiffrée :
    /// le serveur l'a lu, et rien ne prouve qu'il vient de son auteur.
    case unencrypted

    public var isUnencrypted: Bool { self == .unencrypted }
}

/// **La loi UNIQUE qui juge un message déclaré en clair dans une conversation
/// chiffrée de bout en bout** (#11380, audit adversarial de #11378, constat H2).
///
/// Modèle de menace : une passerelle compromise injecte `isEncrypted: false`
/// et un texte sous le nom d'un membre. La provenance (#11382) prouve un clair
/// DÉCHIFFRÉ ; elle ne peut pas refuser un clair qui se déclare non chiffré.
/// Sceller ce message rendrait illisibles les envois en clair légitimes des
/// clients sans session (#8221) tant que leur usage n'est pas mesuré (#11404) :
/// la loi le SIGNALE. Ses consommateurs l'affichent marqué et n'y servent
/// AUCUNE traduction — une traduction du serveur peut dire autre chose que le
/// texte qu'elle prétend traduire.
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
    public static func standing(
        of message: MeeshyMessage,
        conversationEncryptionMode: String?
    ) -> EndToEndMessageStanding {
        guard isEndToEndConversation(conversationEncryptionMode),
              message.messageSource == .user,
              !message.isMe,
              message.deletedAt == nil,
              !message.isEncrypted,
              !message.isContentDecryptedOnDevice,
              !carriesNotice(message),
              carriesClearPayload(message)
        else { return .ordinary }
        return .unencrypted
    }

    /// Le verdict sur le DERNIER message que la ligne de liste résume. Il
    /// n'affirme rien sans la nature du message (serveur antérieur à #7545) ni
    /// sans un auteur pair connu : la ligne n'accuse pas un auteur qu'elle ne
    /// sait pas nommer, le fil juge le message entier.
    public static func lastMessageStanding(
        of conversation: MeeshyConversation,
        readerLabel: String = ConversationListAuthor.readerLabel
    ) -> EndToEndMessageStanding {
        guard isEndToEndConversation(conversation.encryptionMode),
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

    private static func carriesNotice(_ message: MeeshyMessage) -> Bool {
        message.callSummary != nil
            || message.joinNotice != nil
            || message.captureNotice != nil
            || message.arrivalsNotice != nil
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
