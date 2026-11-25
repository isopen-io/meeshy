package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * L'OBJECTIF DE FLAMME (#17379, #20523). MIROIR de `packages/shared/utils/game/flame-goal.ts`, de `GameServedFlameGoal`
 * / `GameFlameGoalLaw` (iOS, `GameFlameGoal.swift`, #20522) et de `flameGoalView` (web, `flame-goal-copy.ts`, #20521).
 * Au premier jour d'une Flamme, le joueur choisit 7, 14 ou 30 jours, ou rien. L'objectif atteint déclenche un signe des
 * aïeux et propose la marche suivante (les formes de la Flamme au-delà : 100 puis 365 jours). Rater ne retire rien : la
 * passerelle cesse de servir l'objectif.
 */

/** Ce que le bloc `flame` sert de l'objectif : ce qui se propose aujourd'hui, et l'objectif en cours ou atteint. */
@Serializable
public data class GameServedFlameGoal(val offer: List<Int>, val current: Current?) {
    @Serializable
    public data class Current(
        val target: Int,
        val remaining: Int,
        val reached: Boolean,
        /** La marche suivante une fois l'objectif atteint ; `null` après la dernière, ou tant qu'il court. */
        val next: Int?,
    )
}

/** Pourquoi un objectif est refusé — la `reason` que la passerelle pose sur `FLAME_GOAL_NOT_ALLOWED`. */
public enum class FlameGoalRefusal(public val wire: String) {
    NoFlame("no-flame"),
    NotOffered("not-offered"),
    ;

    public companion object {
        public fun fromWire(value: String?): FlameGoalRefusal? = entries.firstOrNull { it.wire == value }
    }
}

/** Ce que la carte de la Flamme montre de l'objectif (iOS `GameFlamePanelView.GoalSection`). */
public sealed interface FlameGoalSection {
    /** Les choix du jour, chacun envoyé d'un seul toucher. */
    public data class Choose(val offer: List<Int>) : FlameGoalSection
    /** L'objectif court : ce qu'il reste. */
    public data class Running(val target: Int, val remaining: Int) : FlameGoalSection
    /** Le signe des aïeux, et la marche suivante s'il en reste une. */
    public data class Reached(val target: Int, val next: Int?) : FlameGoalSection
}

public object GameFlameGoalLaw {
    public val firstChoices: List<Int> = listOf(7, 14, 30)

    /** Les choix du premier jour, puis les formes de la Flamme au-delà : 7, 14, 30, 100, 365. */
    public val ladder: List<Int> = firstChoices + GameFlameLaw.formThresholds.filter { it > firstChoices.max() }

    /** La marche au-dessus de [after] ; `null` après la dernière. */
    public fun next(after: Int): Int? = ladder.firstOrNull { it > max(0, after) }

    /**
     * Ce que le bloc dirait de l'objectif choisi aujourd'hui, Flamme à [streak] jours — la projection de
     * `servedFlameGoal(chooseFlameGoal(...))` : en cours tant que la Flamme est sous la cible, atteint sinon.
     */
    public fun servedAfterChoosing(target: Int, streak: Int): GameServedFlameGoal? {
        val goal = max(0, target)
        val days = max(0, streak)
        if (goal == 0 || days == 0) return null
        if (days < goal) return GameServedFlameGoal(emptyList(), GameServedFlameGoal.Current(goal, goal - days, false, null))
        val next = next(after = goal)
        return GameServedFlameGoal(listOfNotNull(next), GameServedFlameGoal.Current(goal, 0, true, next))
    }

    /** La clé de guide qui ferme le signe des aïeux, une fois par objectif atteint (`game.guideSeen`). */
    public fun nextSeenKey(reachedTarget: Int): String = "flame-goal-next-${max(0, reachedTarget)}"

    /** La section de la carte ; `null` quand il n'y a rien à dire, ou que le signe a été fermé. */
    public fun section(goal: GameServedFlameGoal?, guideSeen: Collection<String>): FlameGoalSection? {
        goal ?: return null
        val current = goal.current ?: return goal.offer.takeIf { it.isNotEmpty() }?.let(FlameGoalSection::Choose)
        if (!current.reached) return FlameGoalSection.Running(current.target, current.remaining)
        if (nextSeenKey(current.target) in guideSeen) return null
        return FlameGoalSection.Reached(current.target, current.next)
    }
}

/** La réponse de `POST /me/game/flame/goal` : `chosen` | `already-chosen`, et l'objectif servi. */
public data class FlameGoalResponse(val status: String, val goal: GameServedFlameGoal) {
    val alreadyDone: Boolean get() = status.startsWith("already-")
}

/** Absent devant un serveur antérieur, ou illisible : rien ne se dit, et la Flamme se lit quand même (iOS `try?`). */
internal fun parseFlameGoal(owner: JsonObject, key: String = "goal"): GameServedFlameGoal? {
    val obj = owner.optObject(key) ?: return null
    return try {
        val offer = obj.reqArray("offer").ints("offer")
        val current = obj.nullableObject("current")?.let { raw ->
            GameServedFlameGoal.Current(
                target = raw.reqInt("target"),
                remaining = raw.reqInt("remaining"),
                reached = raw.reqBool("reached"),
                next = raw.nullableInt("next"),
            )
        }
        GameServedFlameGoal(offer, current).takeIf { it.isLawful }
    } catch (_: GameParseException) {
        null
    }
}

private val GameServedFlameGoal.isLawful: Boolean
    get() = offer.all { it >= 0 } && (current == null || (current.target >= 0 && current.remaining >= 0 && (current.next ?: 0) >= 0))
