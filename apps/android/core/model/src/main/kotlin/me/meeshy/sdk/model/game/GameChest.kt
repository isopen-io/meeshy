package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.min

/*
 * Le coffre du jour (#9373, #10011) : gratuit, déterministe par utilisateur, par jour, par EFFORT des
 * missions du jour et par cours de la Meesh du compte. MIROIR de `packages/shared/utils/game/chest.ts`
 * et de `GameChest.swift` (iOS). Contenu certain 500 à 10 000 points, Gloire un pour dix, prime
 * (1/20 du prix entier, sinon 1/6 d'un cinquième), fragment d'étoile 1/6, gel 1/20, jamais de Meesh.
 */

/** Ce qu'une mission apporte à l'effort : sa difficulté, son gabarit, son objectif. */
public data class ChestMission(val templateKey: String, val difficulty: MissionDifficulty?, val target: Int)

public object GameChestLaw {

    public const val POINTS_MIN: Int = 500
    public const val POINTS_MAX: Int = 10_000
    public const val EFFORT_FLOOR: Int = 300
    public const val EFFORT_CEILING: Int = 4500
    public const val BONUS_FIFTH_DIVISOR: Int = 5
    public const val GLORY_DIVISOR: Int = 10

    public const val ODDS_FRAGMENT: Double = 1.0 / 6
    public const val ODDS_FREEZE: Double = 1.0 / 20
    public const val ODDS_BONUS_WHOLE: Double = 1.0 / 20
    public const val ODDS_BONUS_FIFTH: Double = 1.0 / 6

    public fun gloryForChest(points: Int): Int = max(0, points) / GLORY_DIVISOR

    /** L'effort d'une mission : base de sa difficulté + points par unité × objectif. Une difficulté inconnue pèse comme la facile. */
    public fun missionEffort(mission: ChestMission): Int {
        val base = GameMissionLaws.BASE_POINTS.getValue(mission.difficulty ?: MissionDifficulty.Easy)
        val unit = GameMissionCatalog.template(mission.templateKey)?.unitPoints ?: 0
        return base + unit * max(0, mission.target)
    }

    /** L'effort du jour : la somme de ses missions. */
    public fun dayEffort(missions: List<ChestMission>): Int = missions.sumOf(::missionEffort)

    /** Une droite de 500 (300 d'effort) à 10 000 (4 500), en entiers exacts, arrondie au plus proche. */
    public fun pointsForEffort(effort: Int): Int {
        val bounded = min(EFFORT_CEILING, max(EFFORT_FLOOR, effort))
        val span = (EFFORT_CEILING - EFFORT_FLOOR).toLong()
        val gain = (POINTS_MAX - POINTS_MIN).toLong()
        return POINTS_MIN + ((gain * (bounded - EFFORT_FLOOR) * 2 + span) / (2 * span)).toInt()
    }

    /** Les deux primes possibles au cours de la Meesh du compte : le prix entier, et son cinquième arrondi. */
    public fun bonusAmounts(nextMeeshPrice: Int): Pair<Int, Int> {
        val whole = max(0, nextMeeshPrice)
        return whole to ((whole.toLong() * 2 + BONUS_FIFTH_DIVISOR) / (2 * BONUS_FIFTH_DIVISOR)).toInt()
    }

    /** Le contenu certain du coffre pour cet effort, et les primes possibles au cours de la prochaine Meesh. */
    public fun contentForEffort(effort: Int, nextMeeshPrice: Int): ChestContent {
        val points = pointsForEffort(effort)
        val (whole, fifth) = bonusAmounts(nextMeeshPrice)
        return ChestContent(points = points, glory = gloryForChest(points), bonusWhole = whole, bonusFifth = fifth)
    }

    /**
     * Le cours de la prime est FIGÉ à l'ouverture du jour de jeu : le plus ancien instant d'ouverture des
     * missions, jamais après [nowMillis].
     */
    public fun priceCutoffMillis(missionsOpenedAtMillis: List<Long?>, nowMillis: Long): Long =
        missionsOpenedAtMillis.filterNotNull().fold(nowMillis) { earliest, opened -> min(earliest, opened) }

    /**
     * Le coffre du jour. Les cinq tirages sont TOUJOURS consommés, dans l'ordre : points d'avant #10011
     * (ignoré), fragment, gel, prime entière, prime d'un cinquième.
     */
    public fun daily(userId: String, dayKey: String, effort: Int, nextMeeshPrice: Int): DailyChest {
        val rng = GameRandom(GameSeedParts(userId, dayKey, "chest"))
        rng.next()
        val fragment = rng.next() < ODDS_FRAGMENT
        val freeze = rng.next() < ODDS_FREEZE
        val wholeDraw = rng.next() < ODDS_BONUS_WHOLE
        val fifthDraw = rng.next() < ODDS_BONUS_FIFTH
        val content = contentForEffort(effort, nextMeeshPrice)
        val bonus = if (wholeDraw) ChestBonus.Whole else if (fifthDraw) ChestBonus.Fifth else ChestBonus.NoBonus
        val bonusPoints = when (bonus) {
            ChestBonus.Whole -> content.bonusWhole ?: 0
            ChestBonus.Fifth -> content.bonusFifth ?: 0
            ChestBonus.NoBonus -> 0
        }
        return DailyChest(
            points = content.points + bonusPoints,
            fragment = fragment,
            freeze = freeze,
            glory = content.glory,
            bonus = bonus,
            bonusPoints = bonusPoints,
        )
    }
}
