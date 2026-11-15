package me.meeshy.sdk.model.game

import java.time.DateTimeException
import java.time.LocalDate

/*
 * Le minuteur d'une mission (#9539) : À VENIR -> EN COURS -> FAITE / TERMINÉE / MANQUÉE. MIROIR de
 * `GameMissionClock.swift` (iOS). Pure fonction de DATES (millisecondes epoch) : aucune horloge ici,
 * l'hôte passe `now` et choisit son rythme. Les trois missions du jour se ferment à MINUIT DU FUSEAU
 * DU COMPTE (jamais celui de l'appareil) ; la mission personnelle à la fin de sa plage.
 */
public sealed interface MissionPhase {
    /** La plage n'a pas commencé : dans combien de temps. */
    public data class Upcoming(val startsInMillis: Long) : MissionPhase

    /** La plage court : ce qu'il en reste. */
    public data class Running(val remainingMillis: Long) : MissionPhase

    /** Faite avant la fin : plus rien à attendre. */
    public data object Done : MissionPhase

    /** La plage est passée et la mission était faite : « Terminée ». */
    public data object Finished : MissionPhase

    /** La plage est passée et la mission ne l'était pas : « Manquée ». */
    public data object Missed : MissionPhase

    /** L'action de la carte (changer la mission) n'existe que tant que la plage court. */
    public val allowsAction: Boolean get() = this is Running

    /** Vrai quand la carte affiche un compte à rebours. */
    public val isCounting: Boolean get() = this is Upcoming || this is Running
}

/** Une durée restante CALME, découpée en unités : jamais de secondes. */
public sealed interface CalmDuration {
    public data class DaysHours(val days: Int, val hours: Int) : CalmDuration
    public data class Hours(val hours: Int, val minutes: Int) : CalmDuration
    public data class Minutes(val minutes: Int) : CalmDuration
}

public object GameMissionClock {

    public fun phase(startMillis: Long?, endMillis: Long, completed: Boolean, nowMillis: Long): MissionPhase = when {
        nowMillis >= endMillis -> if (completed) MissionPhase.Finished else MissionPhase.Missed
        completed -> MissionPhase.Done
        startMillis != null && nowMillis < startMillis -> MissionPhase.Upcoming(startMillis - nowMillis)
        else -> MissionPhase.Running(endMillis - nowMillis)
    }

    /**
     * La fin du jour de jeu `AAAA-MM-JJ` : minuit du lendemain DANS LE FUSEAU DU COMPTE, au calendrier
     * grégorien. `null` pour une clé qui n'est pas un jour du calendrier.
     */
    public fun endOfDayMillis(dayKey: String, timezone: String?): Long? {
        if (!GameDay.isDayKey(dayKey)) return null
        return try {
            LocalDate.parse(dayKey).plusDays(1).atStartOfDay(GameDay.zone(timezone)).toInstant().toEpochMilli()
        } catch (_: DateTimeException) {
            null
        }
    }

    /** Durée restante calme : jours + heures, puis heures + minutes, puis minutes (au moins une). */
    public fun calmDuration(remainingMillis: Long): CalmDuration {
        val totalMinutes = (maxOf(0L, remainingMillis) / 60_000L).toInt()
        val days = totalMinutes / (24 * 60)
        val hours = (totalMinutes % (24 * 60)) / 60
        val minutes = totalMinutes % 60
        return when {
            days >= 1 -> CalmDuration.DaysHours(days, hours)
            hours >= 1 -> CalmDuration.Hours(hours, minutes)
            else -> CalmDuration.Minutes(maxOf(1, minutes))
        }
    }

    /** Le rythme de rafraîchissement du compte à rebours : une fois par minute au-delà d'une heure, puis plus serré. */
    public fun refreshIntervalMillis(remainingMillis: Long): Long = if (remainingMillis > 3_600_000L) 60_000L else 30_000L
}
