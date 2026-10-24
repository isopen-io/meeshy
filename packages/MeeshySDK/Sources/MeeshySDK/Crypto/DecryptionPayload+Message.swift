import Foundation

extension DecryptionPayload {
    /// La SEULE construction d'une demande de déchiffrement depuis un message
    /// (#11232) : le fil et l'aperçu d'appui long l'appellent tous deux, et
    /// une évolution de la règle ne peut plus toucher l'un sans l'autre.
    ///
    /// La session d'un pair est rangée sous son identifiant UTILISATEUR
    /// (`senderUserId`) ; `senderId` désigne le Participant de l'expéditeur et
    /// ne trouve jamais de session. `nil` : rien à déchiffrer — message en
    /// clair, supprimé, déjà prouvé déchiffré sur l'appareil, sans
    /// cryptogramme base64, ou d'un expéditeur sans utilisateur connu.
    public init?(decrypting message: MeeshyMessage) {
        guard message.isEncrypted, message.deletedAt == nil,
              !message.isContentDecryptedOnDevice,
              let senderUserId = message.senderUserId, !senderUserId.isEmpty,
              let ciphertext = Data(base64Encoded: message.content), !ciphertext.isEmpty else { return nil }
        self.init(messageId: message.id, senderId: senderUserId, ciphertext: ciphertext)
    }
}
