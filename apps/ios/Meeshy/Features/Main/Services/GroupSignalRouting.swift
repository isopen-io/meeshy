import Foundation

/// À qui appartient un `call:signal` reçu pendant un appel (#3585).
///
/// `CallManager` tient UN pair — le principal ; le maillage d'un appel de
/// groupe tient les autres. Sans ce tri, l'offre d'un troisième membre
/// tombait dans l'unique `RTCPeerConnection` du principal et écrasait sa
/// négociation.
enum GroupSignalDestination: Equatable, Sendable {
    /// Le pair que `CallManager` négocie déjà.
    case primary
    /// Un autre membre : la connexion du maillage qui lui correspond.
    case mesh(userId: String)
    /// Un signal qui ne concerne pas cet appareil (écho de soi).
    case ignore
}

enum GroupSignalRouting {

    /// Un `from` absent vient d'une passerelle ancienne : il reste au
    /// principal, comme avant ce lot. Mon propre identifiant en `from` n'est
    /// jamais un pair. Le `to` n'est pas relu : la passerelle ne relaie qu'à
    /// son destinataire, qu'elle résout parfois par `participantId`. Tant que
    /// le principal n'est pas désigné (l'appelant d'un groupe, avant le premier
    /// arrivant), tout reste au principal : c'est `CallManager` qui le désigne.
    ///
    /// Un appel DIRECT ne passe jamais par le maillage : son unique pair peut
    /// signer `from` d'un `participantId` (invité anonyme) différent du
    /// `remoteUserId` connu, et le 1:1 ne doit rien perdre à ce lot.
    ///
    /// Le siège du principal libéré (#9085) : tout membre passe par le maillage.
    static func destination(
        from: String?,
        localUserId: String,
        primaryUserId: String?,
        isGroupCall: Bool,
        primaryVacated: Bool = false
    ) -> GroupSignalDestination {
        guard isGroupCall, let from, !from.isEmpty else { return .primary }
        if from == localUserId { return .ignore }
        if primaryVacated { return .mesh(userId: from) }
        guard let primaryUserId, !primaryUserId.isEmpty else { return .primary }
        return from == primaryUserId ? .primary : .mesh(userId: from)
    }

    /// Qui offre à qui — la loi du web (`engine.ts` `onJoined`) et de
    /// `CallManager` : le membre DÉJÀ dans l'appel offre au nouveau venu,
    /// qui ne fait que répondre. Le principal est négocié par `CallManager`,
    /// jamais par le maillage.
    static func shouldOfferToArrival(
        arrivalUserId: String,
        localUserId: String,
        primaryUserId: String?,
        isInCall: Bool,
        primaryVacated: Bool = false
    ) -> Bool {
        guard isInCall, !arrivalUserId.isEmpty, arrivalUserId != localUserId else { return false }
        if primaryVacated { return true }
        guard let primaryUserId, !primaryUserId.isEmpty else { return false }
        return arrivalUserId != primaryUserId
    }
}
