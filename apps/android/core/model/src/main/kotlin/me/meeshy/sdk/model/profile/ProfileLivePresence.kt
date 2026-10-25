package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/** La teinte du libellé « il y a X » de la fiche : vert actif, orange absent, gris au-delà. */
enum class ProfilePresenceTone { ACTIVE, AWAY, MUTED }

/** La ligne « @pseudo · il y a X » : l'instant de dernière activité et sa teinte. */
data class ProfilePresenceLine(val lastActiveAtEpochMillis: Long, val tone: ProfilePresenceTone)

/**
 * La présence d'une fiche profil (miroir de `UserProfileSheet.resolvedPresence` et `presenceColor`
 * iOS) : l'entrée temps réel (`user:status`, `presence:snapshot`, `typing:start` forcé) gagne sur le
 * cliché REST du profil chargé ; sans l'une ni l'autre, aucune présence (aucun point). Le client ne
 * fabrique ni ne prolonge rien : tout passe par [UserPresence.state].
 */
object ProfileLivePresence {

    /** L'état du point de l'avatar ; `null` = la passerelle n'a rien servi, aucun point. */
    fun state(
        live: UserStatusEvent?,
        restIsOnline: Boolean?,
        restLastActiveAt: String?,
        nowEpochMillis: Long,
    ): PresenceState? = presence(live, restIsOnline, restLastActiveAt)?.state(nowEpochMillis)

    /**
     * La ligne datée après le pseudo, rendue seulement si un instant de dernière activité est connu
     * (la passerelle le tait aux observateurs non autorisés) : rien hors ligne sans date.
     */
    fun line(
        live: UserStatusEvent?,
        restIsOnline: Boolean?,
        restLastActiveAt: String?,
        nowEpochMillis: Long,
    ): ProfilePresenceLine? {
        val presence = presence(live, restIsOnline, restLastActiveAt) ?: return null
        val lastActive = isoToEpochMillisOrNull(presence.lastActiveAt) ?: return null
        val tone = when (presence.state(nowEpochMillis)) {
            PresenceState.ONLINE -> ProfilePresenceTone.ACTIVE
            PresenceState.AWAY -> ProfilePresenceTone.AWAY
            PresenceState.IDLE, PresenceState.OFFLINE -> ProfilePresenceTone.MUTED
        }
        return ProfilePresenceLine(lastActive, tone)
    }

    private fun presence(live: UserStatusEvent?, restIsOnline: Boolean?, restLastActiveAt: String?): UserPresence? {
        val restLast = restLastActiveAt?.takeIf { it.isNotBlank() }
        if (live != null) {
            return UserPresence(isOnline = live.isOnline, lastActiveAt = live.lastActiveAt?.takeIf { it.isNotBlank() } ?: restLast)
        }
        if (restIsOnline == null && restLast == null) return null
        return UserPresence(isOnline = restIsOnline == true, lastActiveAt = restLast)
    }
}
