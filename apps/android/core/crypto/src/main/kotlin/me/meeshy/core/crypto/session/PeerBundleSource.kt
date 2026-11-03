package me.meeshy.core.crypto.session

/** Les deux clés PUBLIQUES d'un pair dont la dérivation de session a besoin. */
public class PeerBundle(public val identityKey: ByteArray, public val signedPreKeyPublic: ByteArray) {
    override fun toString(): String = "PeerBundle"
}

/** Ce que la passerelle répond quand on lui demande le bundle d'un pair. */
public sealed interface PeerBundleLookup {
    public class Found(public val bundle: PeerBundle) : PeerBundleLookup

    /** Le pair n'a jamais publié de clés (404) : aucune session n'est possible, pas de repli en clair. */
    public data object NotPublished : PeerBundleLookup

    /** Réponse malformée (clés de mauvaise taille) : jamais un succès partiel. */
    public data object Malformed : PeerBundleLookup

    /** Réseau, 403, 429, 503 : l'établissement échoue maintenant. */
    public data object Unavailable : PeerBundleLookup
}

/**
 * Ce que le gestionnaire de sessions demande à la passerelle. Implémentée dans `:sdk-core` par `SignalApi`
 * (le module de chiffrement ne connaît ni réseau ni DTO).
 */
public interface PeerBundleSource {
    public suspend fun fetchBundle(peerId: String): PeerBundleLookup

    /** Notifie la passerelle (`signal/session/establish`) ; `false` si elle refuse ou ne répond pas. */
    public suspend fun announceSession(peerId: String, conversationId: String): Boolean
}
