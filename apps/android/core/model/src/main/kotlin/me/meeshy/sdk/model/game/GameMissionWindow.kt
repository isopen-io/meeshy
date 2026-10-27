package me.meeshy.sdk.model.game

import java.time.DateTimeException
import java.time.Instant

/**
 * La plage d'une carte d'acte (iOS `GameMissionWindow`) : celle de la mission personnelle (deux heures pleines), ou la
 * fin du jour de jeu pour les trois du jour. Sans fin lisible, la carte n'a pas de minuteur (#9539).
 *
 * **Le fuseau est celui du COMPTE**, jamais celui de l'appareil : la passerelle découpe le jour de jeu à minuit de
 * `User.timezone`. Aucune horloge ici — l'hôte passe `nowMillis` et choisit son rythme.
 */
public data class MissionWindow(val startMillis: Long?, val endMillis: Long?) {

    public fun phase(completed: Boolean, nowMillis: Long): MissionPhase? =
        endMillis?.let { GameMissionClock.phase(startMillis, it, completed, nowMillis) }

    public companion object {
        /** Les trois actes du jour : pas de début, la fin du jour de jeu dans le fuseau du compte. */
        public fun ofDay(dayKey: String, timezone: String?): MissionWindow =
            MissionWindow(startMillis = null, endMillis = GameMissionClock.endOfDayMillis(dayKey, timezone))

        /** La mission personnelle : sa plage servie ; un horodatage illisible laisse la carte sans minuteur. */
        public fun of(personal: GamePersonalMission): MissionWindow =
            MissionWindow(startMillis = instant(personal.startsAt), endMillis = instant(personal.endsAt))

        private fun instant(iso: String): Long? = try {
            Instant.parse(iso).toEpochMilli()
        } catch (_: DateTimeException) {
            null
        }
    }
}

/** Ce que la carte des actes décide sur le temps (iOS `GameMissionsView.rerollShown`, `GameMissionRow.tick`). */
public object GameMissionCardLaws {

    private const val IDLE_TICK_MILLIS = 3_600_000L

    /**
     * La rangée du changement : posée tant qu'un acte du jour reste à faire DANS le jour, même quand la passerelle retire
     * le changement faute de Meesh (`rerollAvailable`) — pour dire combien il en manque. Passé minuit du compte, elle
     * disparaît : changer un acte d'un jour fini n'a plus de sens.
     */
    public fun rerollRowShown(
        missions: GameMissions,
        timezone: String?,
        affordable: Boolean,
        nowMillis: Long,
    ): Boolean {
        val end = GameMissionClock.endOfDayMillis(missions.dayKey, timezone)
        val dayOpen = end?.let { nowMillis < it } ?: true
        val pending = missions.items.any { !it.isCompleted }
        return dayOpen && pending && (missions.rerollAvailable || !affordable)
    }

    /** Le bouton « Changer » d'un acte : tant que la plage court (ou qu'aucune n'est lisible) et que l'acte n'est pas fait. */
    public fun rerollButtonShown(canReroll: Boolean, completed: Boolean, phase: MissionPhase?): Boolean =
        canReroll && !completed && (phase?.allowsAction ?: true)

    /** Le minuteur est CALME : une mise à jour par minute au-delà d'une heure, plus serrée ensuite, à l'heure une fois la plage passée. */
    public fun refreshDelayMillis(window: MissionWindow, nowMillis: Long): Long {
        val end = window.endMillis ?: return IDLE_TICK_MILLIS
        val remaining = end - nowMillis
        return if (remaining > 0) GameMissionClock.refreshIntervalMillis(remaining) else IDLE_TICK_MILLIS
    }
}
