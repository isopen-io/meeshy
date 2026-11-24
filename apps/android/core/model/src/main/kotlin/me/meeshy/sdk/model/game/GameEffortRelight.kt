package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Le rallumage par l'effort encore possible (#20455, #20474) : deux rêves complets rallument la Flamme éteinte sans
 * payer. La passerelle le sert sur `flame.effortRelight` tant que c'est possible (`servedEffortRelight`,
 * `packages/shared/utils/game/flame-effort.ts`). MIROIR d'`effortRelightSchema` (`packages/shared/types/game.ts`) et de
 * `GameEffortRelight` (iOS, `GameFlame.swift`).
 */
@Serializable
public data class GameEffortRelight(
    /** Les jours de la Flamme qui reviennent avec elle. */
    val lostDays: Int,
    val dreamsDone: Int,
    val dreamsNeeded: Int,
    /** Le dernier jour où le rallumage par l'effort est possible, `AAAA-MM-JJ`. */
    val closesOn: String,
    /** `0` : aujourd'hui seulement ; `1` : jusqu'à demain soir. */
    val daysLeft: Int,
) {
    /** Les rêves complets qui manquent : jamais moins d'un, puisque la Flamme est encore éteinte. */
    val dreamsMissing: Int get() = max(1, dreamsNeeded - dreamsDone)

    internal val isLawful: Boolean
        get() = lostDays >= 1 && dreamsDone >= 0 && dreamsNeeded >= 1 && daysLeft >= 0 && GameDay.isDayKey(closesOn)
}

/**
 * Absent devant un serveur antérieur, illisible ou hors de la loi : rien ne se dit, et la Flamme se lit quand même
 * (iOS le lit en `try?`).
 */
internal fun parseEffortRelight(flame: JsonObject): GameEffortRelight? {
    val obj = flame.optObject("effortRelight") ?: return null
    val effort = try {
        GameEffortRelight(
            lostDays = obj.reqInt("lostDays"),
            dreamsDone = obj.reqInt("dreamsDone"),
            dreamsNeeded = obj.reqInt("dreamsNeeded"),
            closesOn = obj.reqString("closesOn"),
            daysLeft = obj.reqInt("daysLeft"),
        )
    } catch (_: GameParseException) {
        return null
    }
    return effort.takeIf { it.isLawful }
}

/**
 * « Ne peut plus être rallumée » se tait tant que l'effort la rallume encore (#20474) — miroir de
 * `GameFlamePanelView.saysRelightClosed` (iOS).
 */
public fun GameFlame.saysRelightClosed(cannotPayRelight: Boolean): Boolean =
    status == FlameStatus.Out && !canRelight && !cannotPayRelight && effortRelight == null
