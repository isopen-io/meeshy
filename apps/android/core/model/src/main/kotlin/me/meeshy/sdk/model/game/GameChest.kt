package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.min

/*
 * Le coffre du jour (#9373, #10011) : gratuit, déterministe par utilisateur, par jour, par EFFORT des
 * missions du jour et par cours de la Meesh du compte. MIROIR de `packages/shared/utils/game/chest.ts`
 * et de `GameChest.swift` (iOS). Contenu certain 500 à 10 000 points, Gloire 1 250 à 3 000 sur l'effort plus une
 * précocité de 2 800 à 0 selon l'heure ENTIÈRE du jour de jeu (#16414, lue et gravée par la passerelle), prime
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

    /** La Gloire du coffre (#16414) : la base de 1 250 à 3 000 sur l'effort, puis la précocité de 2 800 à 0. */
    public const val GLORY_MIN: Int = 1250
    public const val GLORY_BASE_MAX: Int = 3000
    public const val EARLY_GLORY_MAX: Int = 2800
    public const val GLORY_MAX: Int = GLORY_BASE_MAX + EARLY_GLORY_MAX

    /** La dernière heure entière du jour de jeu : la précocité y vaut 0, et au-delà. */
    public const val EARLY_LAST_HOUR: Int = 23

    public const val ODDS_FRAGMENT: Double = 1.0 / 6
    public const val ODDS_FREEZE: Double = 1.0 / 20
    public const val ODDS_BONUS_WHOLE: Double = 1.0 / 20
    public const val ODDS_BONUS_FIFTH: Double = 1.0 / 6

    /** L'effort d'une mission : base de sa difficulté + points par unité × objectif. Une difficulté inconnue pèse comme la facile. */
    public fun missionEffort(mission: ChestMission): Int {
        val base = GameMissionLaws.BASE_POINTS.getValue(mission.difficulty ?: MissionDifficulty.Easy)
        val unit = GameMissionCatalog.template(mission.templateKey)?.unitPoints ?: 0
        return base + unit * max(0, mission.target)
    }

    /** L'effort du jour : la somme de ses missions. */
    public fun dayEffort(missions: List<ChestMission>): Int = missions.sumOf(::missionEffort)

    /** Une droite de [low] (300 d'effort) à [high] (4 500), en entiers exacts, arrondie au plus proche. */
    private fun effortLine(effort: Int, low: Int, high: Int): Int {
        val bounded = min(EFFORT_CEILING, max(EFFORT_FLOOR, effort))
        val span = (EFFORT_CEILING - EFFORT_FLOOR).toLong()
        val gain = (high - low).toLong()
        return low + ((gain * (bounded - EFFORT_FLOOR) * 2 + span) / (2 * span)).toInt()
    }

    /** Une droite de 500 (300 d'effort) à 10 000 (4 500), en entiers exacts, arrondie au plus proche. */
    public fun pointsForEffort(effort: Int): Int = effortLine(effort, POINTS_MIN, POINTS_MAX)

    /** La Gloire de base pour cet effort : une droite de 1 250 (300 d'effort) à 3 000 (4 500). */
    public fun baseGloryForEffort(effort: Int): Int = effortLine(effort, GLORY_MIN, GLORY_BASE_MAX)

    /**
     * La précocité après [elapsedHours] heures ENTIÈRES du jour de jeu : 2 800 dans la première, 0 dans la dernière
     * (la 24e) et au-delà, arrondie au plus proche ; une heure négative vaut la première.
     */
    public fun earlyGlory(elapsedHours: Int): Int {
        val hour = min(EARLY_LAST_HOUR, max(0, elapsedHours))
        return (EARLY_GLORY_MAX * (EARLY_LAST_HOUR - hour) * 2 + EARLY_LAST_HOUR) / (2 * EARLY_LAST_HOUR)
    }

    /** Les deux primes possibles au cours de la Meesh du compte : le prix entier, et son cinquième arrondi. */
    public fun bonusAmounts(nextMeeshPrice: Int): Pair<Int, Int> {
        val whole = max(0, nextMeeshPrice)
        return whole to ((whole.toLong() * 2 + BONUS_FIFTH_DIVISOR) / (2 * BONUS_FIFTH_DIVISOR)).toInt()
    }

    /**
     * Le contenu certain du coffre pour cet effort, ouvert après [elapsedHours] heures du jour de jeu, et les primes
     * possibles au cours de la prochaine Meesh.
     */
    public fun contentForEffort(effort: Int, nextMeeshPrice: Int, elapsedHours: Int): ChestContent {
        val (whole, fifth) = bonusAmounts(nextMeeshPrice)
        val early = earlyGlory(elapsedHours)
        return ChestContent(
            points = pointsForEffort(effort),
            glory = baseGloryForEffort(effort) + early,
            bonusWhole = whole,
            bonusFifth = fifth,
            earlyGlory = early,
        )
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
    public fun daily(userId: String, dayKey: String, effort: Int, nextMeeshPrice: Int, elapsedHours: Int): DailyChest {
        val rng = GameRandom(GameSeedParts(userId, dayKey, "chest"))
        rng.next()
        val fragment = rng.next() < ODDS_FRAGMENT
        val freeze = rng.next() < ODDS_FREEZE
        val wholeDraw = rng.next() < ODDS_BONUS_WHOLE
        val fifthDraw = rng.next() < ODDS_BONUS_FIFTH
        val content = contentForEffort(effort, nextMeeshPrice, elapsedHours)
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
            earlyGlory = content.earlyGlory,
        )
    }
}
