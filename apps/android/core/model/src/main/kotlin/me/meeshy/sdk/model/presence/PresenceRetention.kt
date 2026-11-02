package me.meeshy.sdk.model.presence

import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Ce que la carte de présence garde sur disque (miroir de la persistance `presence_map.json` d'iOS) :
 * tant que son point se dessine, jamais le compte courant, jamais une entrée sans date lisible ni datée
 * dans le futur — on ne restitue que ce que le serveur a servi, et seule une date passée permet de dire
 * depuis quand.
 *
 * La borne est la vie du POINT (5 min), pas 24 h (#13774) : au-delà, l'entrée ne dessine plus rien dans
 * la liste et ne servirait qu'à dater la fiche profil ou l'infobulle « vu il y a X » — une date que le
 * serveur a pu retirer depuis (ami retiré, dernière activité masquée) sans qu'aucune page ne le dise.
 */
object PresenceRetention {

    /** Au-delà, le point s'est éteint : la présence n'est plus un renseignement, ni écrite, ni relue, ni gardée relue. */
    const val MAX_AGE_MS: Long = UserPresence.IDLE_WINDOW_MS

    /**
     * L'avance tolérée d'une date sur l'horloge de l'appareil (dérive entre serveur et appareil) ; au-delà,
     * la date est fausse et l'entrée, qui se lirait « en ligne » jusqu'à cette date, n'est ni écrite ni relue.
     */
    const val FUTURE_TOLERANCE_MS: Long = 2L * 60 * 1000

    /** Le sous-ensemble de [map] qui a le droit de rester sur disque à [nowMillis]. */
    fun retained(map: PresenceMap, currentUserId: String?, nowMillis: Long): PresenceMap =
        map.filter { (userId, presence) ->
            userId.isNotBlank() && userId != currentUserId && isFresh(presence, nowMillis)
        }

    /**
     * Ce qu'une relecture au démarrage restitue : les entrées de [retained], mais plus « en ligne ».
     * Le disque a été écrit par un process dont le socket n'existe plus ; `isOnline` ne vaut que tant
     * que la connexion l'atteste. La date est gardée, donc l'entrée décroît vert, orange, gris, rien.
     */
    fun restoredAtLaunch(persisted: PresenceMap, currentUserId: String?, nowMillis: Long): PresenceMap =
        PresenceMapReducer.socketDisconnected(retained(persisted, currentUserId, nowMillis))

    /** Vrai tant que [presence] a le droit d'être gardée (écrite, relue, ou gardée en mémoire après relecture). */
    fun isRetained(presence: UserPresence, nowMillis: Long): Boolean = isFresh(presence, nowMillis)

    /** L'instant où la première des entrées [readBack] de [map] (relues du disque) cesse d'être gardée ; `null` sans relue. */
    fun nextReadBackExpiry(map: PresenceMap, readBack: Set<String>): Long? =
        readBack.mapNotNull { userId -> isoToEpochMillisOrNull(map[userId]?.lastActiveAt) }.minOrNull()?.plus(MAX_AGE_MS + 1)

    private fun isFresh(presence: UserPresence, nowMillis: Long): Boolean {
        val last = isoToEpochMillisOrNull(presence.lastActiveAt) ?: return false
        val age = nowMillis - last
        return age in -FUTURE_TOLERANCE_MS..MAX_AGE_MS
    }
}
