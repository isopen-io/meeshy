package me.meeshy.sdk.model.presence

import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence

/**
 * La décroissance de la présence (60 s / 3 min / 5 min) dépend du TEMPS, pas d'un événement : une
 * horloge partagée la fait recalculer. Le pas est plus fin que la plus petite marche (60 s) sans
 * coûter une recomposition : chaque surface n'observe que son état DÉRIVÉ, distinct d'un pas à
 * l'autre ([derive]) — un tick qui ne change aucun état ne recompose rien.
 */
object PresenceDecayClock {

    /** Pas de l'horloge partagée (recalcul des états dérivés). */
    const val TICK_MS: Long = 15_000L

    /** L'état de [presence] à [nowEpochMillis] ; `null` = aucune entrée servie, aucun point. */
    fun derive(presence: UserPresence?, nowEpochMillis: Long): PresenceState? =
        presence?.state(nowEpochMillis)

    /**
     * Vrai quand [state] est déjà celui que [presence] aura pour toujours (le temps seul ne le
     * changera plus) : sans date d'activité lisible l'état est figé, et OFFLINE ne se quitte que par
     * une nouvelle entrée. L'horloge cesse alors de réveiller cet abonné.
     */
    fun isSettled(presence: UserPresence, state: PresenceState?): Boolean =
        presence.state(Long.MAX_VALUE) == state
}
