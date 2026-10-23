package me.meeshy.sdk.model.game

/**
 * LE PRESTIGE (#9389) — la vie après le niveau 100. Miroir de `packages/shared/utils/game/prestige.ts` et de
 * `GamePrestige`. Le niveau retombe à 1 (le score en poche repart de zéro), une étoile se pose (cinq au plus), la
 * Gloire monte de [GloryLaws.POINTS_PRESTIGE], un trophée numéroté est gravé. Ne bouge pas : trésor, Gloire acquise
 * et rang, badges, Flamme. Le niveau RECORD retombe à 1 : la ligue (niveau 10) et le duo (niveau 20) se lisent sur
 * le record, la confirmation l'annonce.
 */
public enum class PrestigeRefusal(public val wire: String) {
    LevelTooLow("level-too-low"),
    AtMaximum("at-maximum"),
}

public data class PrestigePassage(
    val prestigeAfter: Int,
    val gloryGained: Int,
    val trophyKey: String,
) {
    val scoreAfter: Int get() = 0
    val levelAfter: Int get() = 1
    val levelRecordAfter: Int get() = 1
}

public sealed interface PrestigeTransition {
    public data class Allowed(val passage: PrestigePassage) : PrestigeTransition

    public data class Refused(val reason: PrestigeRefusal) : PrestigeTransition
}

public object GamePrestige {
    /** Le niveau d'accès à la ligue, perdu quand le record retombe à 1. */
    public const val LEAGUE_LEVEL_LOST: Int = 10

    /** Le niveau d'accès au duo, perdu quand le record retombe à 1. */
    public const val DUO_LEVEL_LOST: Int = 20

    /** Le record du cycle que le Prestige clôt : le plus haut du record gravé et du niveau, jamais sous 100. */
    public fun closedCycleRecord(levelRecord: Int?, level: Int): Int =
        maxOf(GameLevels.PRESTIGE_LEVEL, levelRecord ?: 0, level)

    /** Les records des cycles clos après un Prestige ; `null` devant un serveur qui ne les sert pas. */
    public fun pastCycleRecordsAfterPrestige(pastCycleRecords: List<Int>?, levelRecord: Int?, level: Int): List<Int>? =
        pastCycleRecords?.let { it + closedCycleRecord(levelRecord, level) }

    /** Le niveau 100 demande un million de points ET ses dix étapes : le record prouve les étapes, le score les points. */
    public fun transition(score: Long, prestige: Int, levelRecord: Int?): PrestigeTransition {
        val stars = maxOf(0, prestige)
        if (stars >= GameLevels.MAX_PRESTIGE) return PrestigeTransition.Refused(PrestigeRefusal.AtMaximum)
        if (GameLevels.levelForUnlocks(score, levelRecord) < GameLevels.PRESTIGE_LEVEL) {
            return PrestigeTransition.Refused(PrestigeRefusal.LevelTooLow)
        }
        val after = stars + 1
        return PrestigeTransition.Allowed(
            PrestigePassage(
                prestigeAfter = after,
                gloryGained = GloryLaws.POINTS_PRESTIGE,
                trophyKey = GameTrophies.key(TrophySpec.Prestige(after)),
            ),
        )
    }
}
