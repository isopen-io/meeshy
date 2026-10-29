package me.meeshy.sdk.model.call.group

/**
 * À qui appartient un `call:signal` reçu pendant un appel — iOS `GroupSignalDestination`. La connexion de
 * l'appel tient UN pair, le principal ; le maillage tient les autres. Sans ce tri, l'offre d'un troisième
 * membre tombait dans l'unique connexion du principal et écrasait sa négociation.
 */
sealed interface GroupSignalDestination {
    /** Le pair que la connexion de l'appel négocie déjà. */
    data object Primary : GroupSignalDestination

    /** Un autre membre : la connexion du maillage qui lui correspond. */
    data class Mesh(val userId: String) : GroupSignalDestination

    /** Un signal qui ne concerne pas cet appareil (écho de soi). */
    data object Ignore : GroupSignalDestination
}

/** Les lois du maillage d'un appel de groupe, miroir exact de iOS `GroupSignalRouting` (et du web `engine.ts`). */
object GroupSignalRouting {

    /**
     * Un `from` absent vient d'une passerelle ancienne : il reste au principal. Mon propre identifiant n'est
     * jamais un pair. Tant que le principal n'est pas désigné, tout reste au principal. Un appel DIRECT ne
     * passe jamais par le maillage. Le siège du principal libéré, tout membre passe par le maillage.
     */
    fun destination(
        from: String?,
        localUserId: String,
        primaryUserId: String?,
        isGroupCall: Boolean,
        primaryVacated: Boolean = false,
    ): GroupSignalDestination {
        if (!isGroupCall || from.isNullOrBlank()) return GroupSignalDestination.Primary
        if (from == localUserId) return GroupSignalDestination.Ignore
        if (primaryVacated) return GroupSignalDestination.Mesh(from)
        if (primaryUserId.isNullOrBlank()) return GroupSignalDestination.Primary
        return if (from == primaryUserId) GroupSignalDestination.Primary else GroupSignalDestination.Mesh(from)
    }

    /**
     * Qui offre à qui : le membre DÉJÀ dans l'appel offre au nouveau venu, qui ne fait que répondre. Le
     * principal est négocié par la connexion de l'appel, jamais par le maillage.
     */
    fun shouldOfferToArrival(
        arrivalUserId: String,
        localUserId: String,
        primaryUserId: String?,
        isInCall: Boolean,
        primaryVacated: Boolean = false,
    ): Boolean {
        if (!isInCall || arrivalUserId.isBlank() || arrivalUserId == localUserId) return false
        if (primaryVacated) return true
        if (primaryUserId.isNullOrBlank()) return false
        return arrivalUserId != primaryUserId
    }

    /**
     * Négociation parfaite (W3C) : le plus petit identifiant, en ordre lexicographique, est le pair POLI. La
     * règle est symétrique, les deux côtés s'accordent sans signal de plus ; un identifiant manquant rend
     * impoli, pour qu'un côté mal configuré ne cède jamais à l'aveugle — iOS `CallManager.isPolitePeer`.
     */
    fun isPolitePeer(localUserId: String, remoteUserId: String): Boolean {
        if (localUserId.isBlank() || remoteUserId.isBlank() || localUserId == remoteUserId) return false
        return localUserId < remoteUserId
    }
}

/**
 * Ce qui prouve qu'un appel réunit plus de deux personnes. iOS le lit dans l'offre (`isGroup`,
 * `conversationType`) ; la poussée Android ne le porte pas, alors deux preuves de terrain suffisent, et
 * chacune est impossible dans un duo : un TIERS rejoint la salle (iOS, `handleParticipantJoined`), ou un
 * TIERS m'offre une connexion alors que mon principal est déjà désigné (rejoindre un appel à plusieurs).
 * Un tiers n'est ni moi, ni le principal, ni un inconnu (`from` absent).
 */
object GroupCallEvidence {
    fun isThirdParty(userId: String?, localUserId: String, primaryUserId: String?): Boolean =
        !userId.isNullOrBlank() && userId != localUserId && !primaryUserId.isNullOrBlank() && userId != primaryUserId

    fun fromArrival(arrivalUserId: String?, localUserId: String, primaryUserId: String?): Boolean =
        isThirdParty(arrivalUserId, localUserId, primaryUserId)

    fun fromSignal(type: String, from: String?, localUserId: String, primaryUserId: String?): Boolean =
        type == OFFER && isThirdParty(from, localUserId, primaryUserId)

    private const val OFFER = "offer"
}

/**
 * La reprise d'une connexion du maillage — iOS `WebRTCGroupPeerLink` et web `peer-link.ts` : `disconnected`
 * attend [DISCONNECT_GRACE_MS], `failed` relance tout de suite ; puis 2, 4, 8, 16 s entre deux tentatives,
 * [MAX_RESTART_ATTEMPTS] au plus, avant que le membre ne soit retiré (l'appel continue).
 */
object GroupPeerLinkRestart {
    const val DISCONNECT_GRACE_MS: Long = 3_000
    const val MAX_RESTART_ATTEMPTS: Int = 5

    fun backoffMs(attempt: Int): Long {
        if (attempt <= 1) return 0
        return minOf(2_000L * (1L shl (attempt - 2)), 16_000L)
    }

    fun isExhausted(attempt: Int): Boolean = attempt > MAX_RESTART_ATTEMPTS
}
