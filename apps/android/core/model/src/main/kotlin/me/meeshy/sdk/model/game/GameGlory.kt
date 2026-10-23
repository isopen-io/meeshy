package me.meeshy.sdk.model.game

import kotlin.math.max

/** Les marches de Gloire, la Gloire d'une source ponctuelle et la lecture du rang : voir [GloryLaws]. */
public data class GloryStanding(
    val glory: Int,
    val rank: GloryRank,
    /** Projection héritée (1-3), `null` pour Mythe. */
    val division: Int?,
    /** V (5) à I (1), `null` pour Mythe. */
    val division5: Int?,
    /** Gloire où commence la division courante, `null` pour Mythe. */
    val divisionMinGlory: Int?,
    /** La division suivante, `null` en Légende I et pour Mythe. */
    val next: GloryStep?,
    val gloryMissing: Int?,
    /** Fraction parcourue dans la division ; 1 quand il n'y a pas de suite. */
    val progress: Double,
    /** La place du Mythe et son émission, quand le serveur les a servies. */
    val mythic: MythicSeatRef?,
)

/**
 * GLOIRE ET RANGS : dix rangs de Murmure (0) à Légende (600 000), chacun coupé en cinq divisions
 * (V au départ, I juste avant le rang suivant) ; Légende I jusqu'à 1 000 000, puis le Mythe, que le
 * serveur attribue et que le client ne calcule jamais. Le TypeScript fait foi
 * (`packages/shared/utils/game/glory.ts`) ; miroir iOS `GameGlory.swift`.
 */
public object GloryLaws {
    /** Le seuil du Mythe, et la borne haute de Légende. */
    public const val MYTHE_GLORY: Int = 1_000_000

    /** Le nombre de places du Mythe. */
    public const val MYTHE_SIZE: Int = 100

    public const val DIVISION_COUNT: Int = 5
    public const val CHEST_GLORY_DIVISOR: Int = 10

    public const val POINTS_MINT: Int = 1000
    public const val POINTS_FIRST_LEVEL: Int = 100
    public const val POINTS_LEVEL_DECADE: Int = 1000
    public const val POINTS_LEAGUE_UP: Int = 300
    public const val POINTS_LEAGUE_CUP: Int = 1000
    public const val POINTS_SEASON: Int = 5000
    public const val POINTS_PRESTIGE: Int = 10_000

    /** Le seuil de Gloire de chacun des dix rangs gagnés ; le Mythe n'en a pas. */
    private val rankMinGlory: List<Int> =
        listOf(0, 2000, 6000, 15_000, 35_000, 70_000, 130_000, 230_000, 380_000, 600_000)

    /** Les dix rangs gagnés par la Gloire, du plus bas au plus haut. */
    public val earnedRanks: List<GloryRank> = GloryRank.entries.filter { it != GloryRank.Mythe }

    public fun minGlory(rank: GloryRank): Int? = rankMinGlory.getOrNull(rank.ordinal)

    /** La Gloire d'une mission du jour, par difficulté. */
    public fun gloryForMission(difficulty: MissionDifficulty): Int = when (difficulty) {
        MissionDifficulty.Easy -> 40
        MissionDifficulty.Medium -> 100
        MissionDifficulty.Hard -> 250
        MissionDifficulty.Gold -> 500
    }

    /** La Gloire du coffre du jour : un point pour dix points du coffre. */
    public fun gloryForChest(points: Int): Int = max(0, points) / CHEST_GLORY_DIVISOR

    public enum class AchievementRarity { Common, Rare, Epic, Legendary, Mythic }

    public fun gloryForAchievement(rarity: AchievementRarity): Int = when (rarity) {
        AchievementRarity.Common -> 100
        AchievementRarity.Rare -> 250
        AchievementRarity.Epic -> 600
        AchievementRarity.Legendary -> 1500
        AchievementRarity.Mythic -> 4000
    }

    /**
     * La Gloire du PREMIER passage d'un niveau : 100 pour chacun jusqu'au 100, puis 1 000 tous les dix
     * niveaux, rien entre deux dizaines. Le niveau 1 est acquis d'office.
     */
    public fun gloryForLevel(level: Int): Int = when {
        level <= GameLevels.MIN_LEVEL -> 0
        level <= GameLevels.LEGACY_MAX_LEVEL -> POINTS_FIRST_LEVEL
        level % 10 == 0 -> POINTS_LEVEL_DECADE
        else -> 0
    }

    /** La Gloire des niveaux franchis pour la première fois : la somme de [gloryForLevel], en forme close. */
    public fun gloryForNewLevels(level: Int, previousRecord: Int?): Int {
        val reached = GameLevels.newLevelsReached(level, previousRecord)
        if (reached.count == 0) return 0
        val lowTo = minOf(reached.to, GameLevels.LEGACY_MAX_LEVEL)
        val lowLevels = max(0, lowTo - reached.from + 1)
        val highFrom = max(reached.from, GameLevels.LEGACY_MAX_LEVEL + 1)
        val decades = if (reached.to < highFrom) 0 else reached.to / 10 - (highFrom - 1) / 10
        return lowLevels * POINTS_FIRST_LEVEL + decades * POINTS_LEVEL_DECADE
    }

    /** Records de Flamme (jours de série) et leur Gloire. */
    public val flameRecordGlory: List<Pair<Int, Int>> = listOf(7 to 500, 30 to 1500, 100 to 5000, 365 to 20_000)

    public fun gloryForFlameRecords(previousLongest: Int, longest: Int): Int =
        flameRecordGlory.filter { (days, _) -> previousLongest < days && longest >= days }.sumOf { it.second }

    /** La projection d'une division à cinq crans sur les trois que lisent les clients publiés. */
    public fun legacyDivision(division5: Int): Int = when (division5) {
        5, 4 -> 3
        3, 2 -> 2
        else -> 1
    }

    public fun isMythicNumber(value: Int): Boolean = value in 1..MYTHE_SIZE

    /** Un numéro d'émission : un entier à partir de 1, sans borne haute. */
    public fun isMythicEdition(value: Int): Boolean = value >= 1

    private fun divisionStart(rankIndex: Int, divisionIndex: Int): Int {
        val lower = rankMinGlory[rankIndex]
        val upper = rankMinGlory.getOrNull(rankIndex + 1) ?: MYTHE_GLORY
        return lower + (upper - lower) * divisionIndex / DIVISION_COUNT
    }

    /** Toutes les marches, du plus bas au plus haut : 10 rangs x 5 divisions. */
    public val ladder: List<GloryStep> = earnedRanks.flatMapIndexed { rankIndex, rank ->
        (0 until DIVISION_COUNT).map { divisionIndex ->
            val division5 = DIVISION_COUNT - divisionIndex
            GloryStep(
                rank = rank,
                division = legacyDivision(division5),
                division5 = division5,
                minGlory = divisionStart(rankIndex, divisionIndex),
            )
        }
    }

    /**
     * Le rang lu sur la Gloire. Mythe vient du SERVEUR, jamais du seuil : [mythicSeat] (la place et son
     * émission, lisibles) ou [mythic] pour un appelant qui ne connaît que le rang servi.
     */
    public fun standing(glory: Int, mythic: Boolean = false, mythicSeat: MythicSeatRef? = null): GloryStanding {
        val g = max(0, glory)
        val seat = mythicSeat?.takeIf { it.isValid }
        if (seat != null || mythic) {
            return GloryStanding(g, GloryRank.Mythe, null, null, null, null, null, 1.0, seat)
        }
        val index = ladder.indexOfLast { g >= it.minGlory }.coerceAtLeast(0)
        val step = ladder[index]
        val next = ladder.getOrNull(index + 1)
        return GloryStanding(
            glory = g,
            rank = step.rank,
            division = step.division,
            division5 = step.division5,
            divisionMinGlory = step.minGlory,
            next = next,
            gloryMissing = next?.let { it.minGlory - g },
            progress = next?.let { (g - step.minGlory).toDouble() / (it.minGlory - step.minGlory) } ?: 1.0,
            mythic = null,
        )
    }

    /**
     * LE RANG OUVRE LES NIVEAUX : 499 au plus sous Ambassadeur, 1000 pour Ambassadeur et Orateur, sans
     * limite (`null`) à partir d'Oracle, Légende et Mythe compris.
     */
    public fun levelCap(rank: GloryRank): Int? = when {
        rank == GloryRank.Mythe || rank.ordinal >= GloryRank.Oracle.ordinal -> null
        rank.ordinal >= GloryRank.Ambassadeur.ordinal -> GameLevels.CAP_AMBASSADOR
        else -> GameLevels.CAP_BASE
    }

    /** Le plafond de niveau que cette Gloire cumulée ouvre. */
    public fun levelCap(glory: Int): Int? = levelCap(standing(glory).rank)
}
