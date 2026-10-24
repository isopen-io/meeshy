import Foundation

/// Pourquoi un envoi d'une conversation chiffrée de bout en bout ne quitte pas
/// l'appareil (#11379). Chaque cas est une raison de NE RIEN émettre : aucun
/// n'ouvre de repli en clair.
public enum EndToEndSendRefusal: String, Error, Equatable, Sendable, CaseIterable {
    /// La session Signal du pair n'a pas pu s'établir : aucun chiffré ne naît.
    case sessionUnavailable
    /// Pas une directe avec un pair connu : l'appareil ne sait pas encore
    /// chiffrer pour un groupe (Sender Keys, MLS).
    case recipientUnsealable
    /// Pièce jointe, lieu, sticker, citation de pièce ou transfert : le serveur
    /// les lirait en clair, l'appareil ne sait pas encore les chiffrer (#10789, #12526).
    case contentUnsealable
    /// La file hors ligne ne garde que du clair : rien de chiffré ne s'y dépose.
    case outboxUnsealable
    /// L'édition d'un message chiffré n'a pas encore d'enveloppe (#12541).
    case editUnsealable
}

/// La loi PURE de l'envoi sous chiffrement de bout en bout (#11379, directives
/// #9224 et #9229) : dans une conversation `e2ee`, le serveur ne reçoit jamais
/// le clair — il le refuse d'ailleurs (`E2EE_PLAINTEXT_REFUSED`, #11216), mais
/// le refus serveur arrive APRÈS que le clair a traversé le réseau. Le client
/// échoue donc fermé, avant tout octet émis.
///
/// Modèle de menace couvert : serveur compromis ou curieux, et toute copie du
/// clair qu'il pourrait garder (journaux, base, file de traduction). Le
/// chiffrement lui-même reste celui de `DirectMessageEncrypting` ; cette loi
/// ne décide que de ce qui a le DROIT de partir.
public enum EndToEndSendGate {

    /// Le régime retire-t-il au serveur le clair ? Même loi que le menu et la
    /// traduction (`DeviceTranslationEligibility.serverReadsMessage`) : seuls
    /// l'absence de mode, `server` et `hybrid` laissent le serveur lire ; un
    /// mode inconnu se lit comme `e2ee`. Plusieurs sources du mode (la ligne
    /// qui a ouvert le fil, la conversation relue du cache) : il suffit qu'UNE
    /// dise bout en bout — l'activation ne se défait pas, le doute non plus.
    public static func requiresSeal(conversationEncryptionModes modes: [String?]) -> Bool {
        modes.contains { mode in
            !DeviceTranslationEligibility.serverReadsMessage(
                conversationEncryptionMode: mode, isEncrypted: false, encryptionMode: nil
            )
        }
    }

    /// Ce qui interdit de sceller cet envoi, AVANT toute tentative de
    /// chiffrement. `nil` ⇒ un texte seul, vers un pair connu : il se scelle.
    public static func refusal(
        for outgoing: OutgoingMessage,
        isDirect: Bool,
        peerUserId: String?
    ) -> EndToEndSendRefusal? {
        if carriesUnsealableContent(outgoing) { return .contentUnsealable }
        guard isDirect, let peerUserId, !peerUserId.isEmpty else { return .recipientUnsealable }
        return nil
    }

    /// Tout ce qui partirait À CÔTÉ du texte chiffré et que le serveur lirait :
    /// les pièces, le lieu, le sticker, l'ancre d'une pièce citée, la source
    /// d'un transfert — et un texte vide, qui ne laisserait rien à sceller.
    public static func carriesUnsealableContent(_ outgoing: OutgoingMessage) -> Bool {
        !(outgoing.attachments.ids ?? []).isEmpty
            || !(outgoing.attachments.previews ?? []).isEmpty
            || outgoing.location != nil
            || outgoing.sticker != nil
            || outgoing.relation.attachmentReplyTo != nil
            || outgoing.relation.forwardedFromId != nil
            || outgoing.text.isEmpty
    }
}
