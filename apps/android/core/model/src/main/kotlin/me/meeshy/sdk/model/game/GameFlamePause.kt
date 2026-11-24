package me.meeshy.sdk.model.game

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * LA FLAMME EN VEILLE (#17372, #20511). MIROIR de `packages/shared/utils/game/flame-pause.ts` et de `GameFlamePause` /
 * `GameFlamePauseLaw` (iOS, `GameFlamePause.swift`, #20510). Le joueur ANNONCE une pause de 1 à 7 jours, une fois par
 * trimestre civil : pendant la veille, la Flamme attend. La veille commence le LENDEMAIN de l'annonce. Les jours sont
 * des clés `AAAA-MM-JJ` dans le fuseau du joueur : pur, sans horloge.
 */

/** Une veille servie par le bloc `flame` : ses premier et dernier jours, inclus. */
@Serializable
public data class GameFlamePause(val from: String, val until: String) {
    /** Annoncée mais pas encore commencée : elle part toujours du lendemain de l'annonce. */
    public fun startsAfter(today: String): Boolean = (GameDay.diff(today, from) ?: 0) > 0
}

/** Pourquoi une veille est refusée — la `reason` que la passerelle pose à la racine de `FLAME_PAUSE_NOT_ALLOWED`. */
public enum class FlamePauseRefusal(public val wire: String) {
    InvalidDays("invalid-days"),
    NoFlame("no-flame"),
    AlreadyPaused("already-paused"),
    QuarterlyLimit("quarterly-limit"),
    ;

    public companion object {
        public fun fromWire(value: String?): FlamePauseRefusal? = entries.firstOrNull { it.wire == value }
    }
}

public sealed interface FlamePauseDecision {
    public data class Allowed(val pause: GameFlamePause) : FlamePauseDecision
    public data class Refused(val reason: FlamePauseRefusal) : FlamePauseDecision
}

/** Ce que la carte de la Flamme montre de la veille (iOS `GameFlamePanelView.PauseSection`). */
public sealed interface FlamePauseSection {
    /** Une veille servie, ou annoncée à l'instant : la carte dit jusqu'à quand, et l'annonce se tait. */
    public data class Paused(val pause: GameFlamePause, val startsTomorrow: Boolean) : FlamePauseSection
    /** Une Flamme vivante sans veille : le choix de la durée puis l'annonce. */
    public data object Chooser : FlamePauseSection
    /** Une Flamme absente ou éteinte : rien à garder. */
    public data object Hidden : FlamePauseSection
}

public object GameFlamePauseLaw {
    public const val MIN_DAYS: Int = 1
    public const val MAX_DAYS: Int = 7
    public val dayChoices: List<Int> = (MIN_DAYS..MAX_DAYS).toList()

    /** Le trimestre civil d'un jour : `AAAA-T1` à `AAAA-T4`. */
    public fun quarter(dayKey: String): String {
        val month = dayKey.drop(5).take(2).toIntOrNull() ?: 1
        return "${dayKey.take(4)}-T${(month - 1) / 3 + 1}"
    }

    /** Une veille vide (terminée avant son premier jour) n'existe pas. */
    private fun lasting(pause: GameFlamePause?): GameFlamePause? =
        pause?.takeIf { (GameDay.diff(it.from, it.until) ?: -1) >= 0 }

    /**
     * Annoncer une veille de [days] jours, à partir de demain. Refusée hors de 1 à 7 jours, à une Flamme absente ou
     * éteinte, pendant une veille en cours ou à venir, et une seconde fois dans le trimestre où elle commencerait.
     */
    public fun canPause(today: String, days: Int, status: FlameStatus, pause: GameFlamePause?): FlamePauseDecision {
        if (days !in MIN_DAYS..MAX_DAYS) return FlamePauseDecision.Refused(FlamePauseRefusal.InvalidDays)
        if (status == FlameStatus.None || status == FlameStatus.Out) return FlamePauseDecision.Refused(FlamePauseRefusal.NoFlame)
        val from = GameDay.add(1, today) ?: return FlamePauseDecision.Refused(FlamePauseRefusal.InvalidDays)
        val until = GameDay.add(days, today) ?: return FlamePauseDecision.Refused(FlamePauseRefusal.InvalidDays)
        val previous = lasting(pause)
        if (previous != null && (GameDay.diff(today, previous.until) ?: -1) >= 0) {
            return FlamePauseDecision.Refused(FlamePauseRefusal.AlreadyPaused)
        }
        if (previous != null && quarter(previous.from) == quarter(from)) {
            return FlamePauseDecision.Refused(FlamePauseRefusal.QuarterlyLimit)
        }
        return FlamePauseDecision.Allowed(GameFlamePause(from, until))
    }

    /** Une Flamme vivante peut s'annoncer en veille : allumée, à risque ou gardée. */
    public fun isBurning(status: FlameStatus): Boolean =
        status == FlameStatus.Lit || status == FlameStatus.AtRisk || status == FlameStatus.Covered

    /**
     * La section de la carte. [shown] est la veille que la carte doit dire : celle du bloc, ou, en attendant la
     * relecture, celle que le geste vient d'annoncer.
     */
    public fun section(flame: GameFlame, shown: GameFlamePause?, today: String): FlamePauseSection = when {
        shown != null -> FlamePauseSection.Paused(shown, startsTomorrow = shown.startsAfter(today))
        isBurning(flame.status) -> FlamePauseSection.Chooser
        else -> FlamePauseSection.Hidden
    }
}

/** La réponse de `POST /me/game/flame/pause` : `paused` | `already-paused`, et la veille servie. */
public data class FlamePauseResponse(val status: String, val pause: GameFlamePause) {
    val alreadyDone: Boolean get() = status.startsWith("already-")
}

/** Absente devant un serveur antérieur, ou illisible : rien ne se dit, et la Flamme se lit quand même (iOS `try?`). */
internal fun parseFlamePause(owner: JsonObject, key: String = "pause"): GameFlamePause? {
    val obj = owner.optObject(key) ?: return null
    val pause = try {
        GameFlamePause(from = obj.reqString("from"), until = obj.reqString("until"))
    } catch (_: GameParseException) {
        return null
    }
    return pause.takeIf { GameDay.isDayKey(it.from) && GameDay.isDayKey(it.until) }
}
