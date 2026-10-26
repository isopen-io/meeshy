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
    /// Le message a été envoyé chiffré : il le reste à jamais (#12881, spec § 5.2).
    case sealedMessageUneditable
    /// La passerelle a refusé un clair (`E2EE_PLAINTEXT_REFUSED`, #11216) : la
    /// conversation est chiffrée sans que l'appareil le sût. Rien ne repart.
    case plaintextRefusedByServer
    /// La passerelle a refusé l'envoi SCELLÉ (4xx) : son enveloppe n'est pas
    /// encore acceptée (#12536). Ce n'est pas une coupure réseau.
    case envelopeRefusedByServer
    /// Le correspondant n'a aucun appareil qui chiffre (#3707) : sa version de
    /// Meeshy ne parle pas libsignal. Rien ne part, rien ne part en clair.
    case recipientWithoutEncryptedDevice
    /// Le régime de la conversation a changé depuis la rédaction
    /// (`E2EE_REGIME_CHANGED`, #12522) : le fil relit le régime, et le geste
    /// de l'utilisateur renvoie scellé sous l'époque relue — jamais en clair,
    /// le bout en bout ne se désactivant pas (#12949).
    case regimeChanged
    /// Mon compte a déjà le nombre maximal d'appareils chiffrés (#3707) : cet
    /// appareil ne peut pas s'enrôler tant qu'un autre n'est pas retiré.
    case deviceLimitReached
    /// Cet appareil a vu la conversation chiffrée de bout en bout, la passerelle
    /// la sert autrement (#12987) : elle refuserait le chiffré, l'appareil ne
    /// lui donne pas le clair. Rien ne part tant qu'un régime chiffré n'est pas
    /// de nouveau servi — ni boucle, ni renvoi automatique.
    case servedWithoutEndToEnd
    /// Un envoi hors du fil (réponse depuis une notification, refus d'appel par
    /// message) vers une conversation chiffrée : seul le fil sait le sceller
    /// (#12641). La bulle reste en échec dans le fil, d'où le renvoi se scelle.
    case sealedOnlyInConversation
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

    /// Le code stable du refus serveur d'un clair (#11216, `e2eePlaintextAdmission.ts`).
    public static let serverPlaintextRefusalCode = "E2EE_PLAINTEXT_REFUSED"

    /// La passerelle a-t-elle refusé un clair dans une conversation chiffrée ?
    /// Le refus est DÉFINITIF : rejouer le même texte par un autre canal ou
    /// par l'outbox l'émettrait de nouveau.
    public static func isServerPlaintextRefusal(_ error: any Error) -> Bool {
        guard case MeeshyError.rejected(let rejection) = error else { return false }
        return rejection.code == serverPlaintextRefusalCode
    }

    /// Un refus du CORPS de l'envoi (4xx), que le même corps ne lèvera pas :
    /// ni le délai (408), ni la cadence (429), ni le transport (statut 0).
    public static func isServerEnvelopeRefusal(_ error: any Error) -> Bool {
        switch error {
        case MeeshyError.server(let status, _): return isDefinitiveClientStatus(status)
        case MeeshyError.rejected(let rejection): return isDefinitiveClientStatus(rejection.statusCode)
        default: return false
        }
    }

    private static func isDefinitiveClientStatus(_ status: Int) -> Bool {
        (400..<500).contains(status) && ![401, 408, 429].contains(status)
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
