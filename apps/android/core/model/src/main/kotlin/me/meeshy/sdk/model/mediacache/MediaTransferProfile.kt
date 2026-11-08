package me.meeshy.sdk.model.mediacache

/**
 * Ce qu'un transfert média attend du réseau (miroir de `MediaTransferProfile`, iOS).
 * `IMMEDIATE` : quelqu'un regarde ou attend l'octet (lecture, tap, montage). `DEFERRABLE` : on prépare pour plus tard
 * (préchargement) — le système peut le différer, et il peut s'interdire le réseau facturé.
 */
public enum class MediaTransferPriority { IMMEDIATE, DEFERRABLE }

public data class MediaTransferProfile(
    val priority: MediaTransferPriority,
    val allowsMeteredNetwork: Boolean,
) {
    public val isDeferrable: Boolean get() = priority == MediaTransferPriority.DEFERRABLE

    /**
     * `true` quand un transfert ouvert avec ce profil peut servir un appelant qui demande [requested] : au moins aussi
     * prioritaire, au moins autant de réseau. Un préchargement différé interdit de réseau facturé ne couvre pas une
     * lecture au premier plan.
     */
    public fun covers(requested: MediaTransferProfile): Boolean {
        val networkCovers = allowsMeteredNetwork || !requested.allowsMeteredNetwork
        val priorityCovers = priority == MediaTransferPriority.IMMEDIATE || requested.priority == MediaTransferPriority.DEFERRABLE
        return networkCovers && priorityCovers
    }

    /** Le plus petit profil qui couvre à la fois `this` et [other]. */
    public fun merged(other: MediaTransferProfile): MediaTransferProfile = MediaTransferProfile(
        priority = if (priority == MediaTransferPriority.IMMEDIATE || other.priority == MediaTransferPriority.IMMEDIATE) {
            MediaTransferPriority.IMMEDIATE
        } else {
            MediaTransferPriority.DEFERRABLE
        },
        allowsMeteredNetwork = allowsMeteredNetwork || other.allowsMeteredNetwork,
    )

    public companion object {
        public val STANDARD: MediaTransferProfile = MediaTransferProfile(MediaTransferPriority.IMMEDIATE, allowsMeteredNetwork = true)

        /**
         * Le profil d'un préchargement silencieux : toujours différable ; le réseau facturé n'est permis que si le
         * réglage de données mobiles du type de média l'autorise ([meteredAllowed]).
         */
        public fun prefetch(meteredAllowed: Boolean): MediaTransferProfile =
            MediaTransferProfile(MediaTransferPriority.DEFERRABLE, meteredAllowed)
    }
}
