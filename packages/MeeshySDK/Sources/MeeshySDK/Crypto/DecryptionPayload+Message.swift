import Foundation

/// Les deux bouts d'une conversation DIRECTE tels que l'appareil les connaît
/// LOCALEMENT (#11232, #12757) : le pair qu'élit la conversation et le lecteur
/// connecté. La clé de session se cherche toujours sous le PAIR, jamais sous
/// un expéditeur que le serveur affirme message par message.
public struct DirectSessionPeer: Sendable, Equatable {
    public let peerUserId: String
    public let readerUserId: String

    /// `nil` quand l'un des deux bouts est inconnu, ou quand la conversation a
    /// été gravée sous le lecteur lui-même (`isInterlocutorTheReader`) : aucune
    /// clé ne se cherche, et l'appelant scelle.
    public init?(peerUserId: String?, readerUserId: String?) {
        guard let peerUserId, !peerUserId.isEmpty,
              let readerUserId, !readerUserId.isEmpty,
              peerUserId != readerUserId else { return nil }
        self.peerUserId = peerUserId
        self.readerUserId = readerUserId
    }
}

extension MeeshyMessage {
    /// Un cryptogramme que cet appareil n'a pas encore ouvert : chiffré, non
    /// supprimé, sans clair prouvé, porteur d'un base64 non vide.
    public var awaitsOnDeviceDecryption: Bool {
        ciphertextAwaitingDecryption != nil
    }

    var ciphertextAwaitingDecryption: Data? {
        guard isEncrypted, deletedAt == nil, !isContentDecryptedOnDevice,
              let ciphertext = Data(base64Encoded: content), !ciphertext.isEmpty else { return nil }
        return ciphertext
    }

    /// L'auteur que le message ANNONCE, quel que soit son chemin d'arrivée.
    /// REST et socket : `senderUserId`, le `senderId` y désignant le
    /// Participant. Ligne GRDB d'un pair : `senderUserId` est absent
    /// (`MessageRecord.toMessage` ne le pose que pour le lecteur) et `senderId`
    /// porte déjà l'utilisateur résolu à l'ingestion (`resolvedSenderUserId`).
    var announcedAuthorUserId: String {
        guard let senderUserId, !senderUserId.isEmpty else { return senderId }
        return senderUserId
    }
}

extension DecryptionPayload {
    /// La SEULE construction d'une demande de déchiffrement depuis un message
    /// (#11232) : le fil et l'aperçu d'appui long l'appellent tous deux.
    ///
    /// La clé se cherche sous `peer.peerUserId`, que la conversation connaît
    /// localement. L'auteur annoncé ne choisit jamais la clé : il ne sert qu'à
    /// REFUSER. Un message qui se dit d'un tiers, ni le pair ni le lecteur,
    /// n'est pas ouvert et reste scellé (correction minimale du constat M1,
    /// #12757). Un message du lecteur s'ouvre sous la session du pair : c'est
    /// la clé symétrique sous laquelle `SessionManager.encryptMessage(_:for:)`
    /// l'a scellé.
    ///
    /// `nil` : rien à déchiffrer — message en clair, supprimé, déjà prouvé
    /// déchiffré, sans cryptogramme base64, ou d'un auteur hors de la paire.
    public init?(decrypting message: MeeshyMessage, under peer: DirectSessionPeer) {
        guard let ciphertext = message.ciphertextAwaitingDecryption else { return nil }
        let author = message.announcedAuthorUserId
        guard author == peer.peerUserId || author == peer.readerUserId else { return nil }
        self.init(messageId: message.id, senderId: peer.peerUserId, ciphertext: ciphertext)
    }
}
