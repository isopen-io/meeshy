package me.meeshy.sdk.model.game

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Où se tient un score sur la courbe des niveaux, sous le plafond du rang et le palier des étapes.
 * Miroir de `levelProgress` (`packages/shared/utils/game/levels.ts`) et de `GameLevelProgress` (iOS).
 */
public data class LevelProgress(
    val level: Int,
    val tier: LevelTierKey,
    val score: Long,
    /** Score où la barre du niveau commence : 0 au niveau 1, sinon le seuil du niveau. */
    val floorScore: Long,
    /** Seuil du niveau suivant, `null` au plafond. */
    val nextThreshold: Long?,
    val pointsToNext: Long,
    /** Fraction de la barre du niveau, de 0 à 1 ; 1 au plafond. */
    val progress: Double,
    /** Le niveau est au plafond du rang : il ne monte plus tant que le rang ne change pas. */
    val isMax: Boolean,
    /** Le plafond appliqué, `null` : sans limite. */
    val cap: Int?,
    /** Les points sont là, une ÉTAPE manque : le niveau attend au palier précédent. */
    val held: Boolean,
)

/** Les niveaux franchis pour la première fois : de [from] à [to], [count] niveaux (tout à 0 : aucun). */
public data class GameNewLevels(val from: Int, val to: Int, val count: Int)

/**
 * LES NIVEAUX du Jeu Meeshy : seuil(N) = 100 x N², plafonds par rang, niveau 100 = Prestige.
 * Fonctions pures sur « un score » ; l'appelant passe la poche d'étincelles. Le TypeScript fait foi
 * (`packages/shared/utils/game/levels.ts`) ; miroir iOS `GameLevels.swift`.
 *
 * Un plafond (`cap`) ou un palier d'étapes (`gate`) `null` signifie « sans limite ».
 */
public object GameLevels {
    public const val MIN_LEVEL: Int = 1

    /** Le niveau où le Prestige s'offre : un seuil, plus un maximum. */
    public const val PRESTIGE_LEVEL: Int = 100

    /** Le plafond de l'ancienne loi : la borne des champs que lisent les clients publiés. */
    public const val LEGACY_MAX_LEVEL: Int = 100

    /** Le Prestige remet le niveau à 1 et ajoute une étoile ; cinq au plus. */
    public const val MAX_PRESTIGE: Int = 5

    /** Le plafond d'un compte sous Ambassadeur. */
    public const val CAP_BASE: Int = 499

    /** Le plafond d'Ambassadeur et d'Orateur ; Oracle et au-delà n'en ont plus. */
    public const val CAP_AMBASSADOR: Int = 1000

    /** Une étape tous les dix niveaux… */
    public const val STEP_INTERVAL: Int = 10

    /** …jusqu'au niveau 100 : au-delà, seuls les plafonds du rang. */
    public const val STEP_LAST: Int = 100

    private const val SINGULARITY_LEVEL = 1000
    private const val LEGACY_TIER_COUNT = 10

    /** Score minimal du niveau N : 100 x N². */
    public fun threshold(level: Int): Long = 100L * level * level

    private fun sanitizeScore(score: Long): Long = max(0L, score)

    /** Un plafond fixé reste au moins au niveau 1 ; `null` ne borne rien. */
    private fun sanitizeBound(bound: Int?): Int? = bound?.let { max(MIN_LEVEL, it) }

    /** Le plus serré de deux plafonds : `null` ne borne rien. */
    public fun tighter(a: Int?, b: Int?): Int? = when {
        a == null -> b
        b == null -> a
        else -> min(a, b)
    }

    /**
     * Le plus haut niveau qu'on lit sans relire les étapes, depuis le record : la dizaine qui suit le
     * record, moins un ; `null` au-delà de la dernière étape.
     */
    public fun stepCeiling(record: Int?): Int? {
        val r = max(MIN_LEVEL, record ?: MIN_LEVEL)
        if (r >= STEP_LAST) return null
        return (r / STEP_INTERVAL + 1) * STEP_INTERVAL - 1
    }

    /** Le niveau que porte ce score, borné par le plafond. */
    public fun levelForScore(score: Long, cap: Int?): Int {
        val s = sanitizeScore(score)
        val guess = floor(sqrt(s / 100.0)).toLong()
        val exact = (guess - 1..guess + 1)
            .filter { it >= 0 && 100L * it * it <= s }
            .maxOrNull() ?: 0L
        val bound = sanitizeBound(cap)
        val level = if (bound == null) exact else min(bound.toLong(), exact)
        return max(MIN_LEVEL.toLong(), level).toInt()
    }

    /**
     * Le niveau lu sur le score et le RECORD seuls, pour une décision qui ne le compare qu'à un seuil de
     * 100 au plus (ouverture des missions, de la ligue, du duo, du Prestige, Vent arrière).
     */
    public fun levelForUnlocks(score: Long, levelRecord: Int?): Int =
        levelForScore(score, stepCeiling(levelRecord))

    /** L'indice du palier (0 à 19) : 1-9 -> 0 … 90-100 -> 9, 101-199 -> 10 … 900-999 -> 18, 1000+ -> 19. */
    public fun tierIndex(level: Int): Int {
        val n = max(0, level)
        return when {
            n <= LEGACY_MAX_LEVEL -> min(LEGACY_TIER_COUNT - 1, n / 10)
            n >= SINGULARITY_LEVEL -> LevelTierKey.entries.size - 1
            else -> LEGACY_TIER_COUNT - 1 + n / 100
        }
    }

    public fun tier(level: Int): LevelTierKey = LevelTierKey.entries[tierIndex(level)]

    /** Le premier niveau d'un palier : 1, 10, 20 … 90, puis 101, 200 … 900, et 1000. */
    public fun tierStart(tier: LevelTierKey): Int {
        val index = tier.ordinal
        return when {
            index <= 0 -> MIN_LEVEL
            index < LEGACY_TIER_COUNT -> index * 10
            index == LEGACY_TIER_COUNT -> LEGACY_MAX_LEVEL + 1
            index == LevelTierKey.entries.size - 1 -> SINGULARITY_LEVEL
            else -> (index - LEGACY_TIER_COUNT + 1) * 100
        }
    }

    /** Le niveau tel que l'ancienne loi le lit : borné à 100. */
    public fun legacyLevel(level: Int): Int = min(LEGACY_MAX_LEVEL, max(MIN_LEVEL, level))

    /** Le palier tel que l'ancienne loi le lit : l'un des dix premiers. */
    public fun legacyTier(level: Int): LevelTierKey = LevelTierKey.entries[tierIndex(legacyLevel(level))]

    /**
     * Où se tient ce score sur la courbe, sous le plafond du rang et le palier des étapes. Au plafond du
     * rang, la barre est pleine et sans suite ([LevelProgress.isMax]) ; retenue par une étape, elle est
     * pleine et la suite reste dite ([LevelProgress.held], `pointsToNext` à 0).
     */
    public fun progress(score: Long, cap: Int?, gate: Int? = null): LevelProgress {
        val s = sanitizeScore(score)
        val bound = sanitizeBound(cap)
        val hold = sanitizeBound(gate)
        val level = levelForScore(s, tighter(bound, hold))
        val floorScore = if (level == MIN_LEVEL) 0L else threshold(level)
        val isMax = bound != null && level >= bound
        val held = !isMax && hold != null && level >= hold && levelForScore(s, bound) > level
        val nextThreshold = if (isMax) null else threshold(level + 1)
        return LevelProgress(
            level = level,
            tier = tier(level),
            score = s,
            floorScore = floorScore,
            nextThreshold = nextThreshold,
            pointsToNext = nextThreshold?.let { max(0L, it - s) } ?: 0L,
            progress = nextThreshold?.let { min(1.0, (s - floorScore).toDouble() / (it - floorScore)) } ?: 1.0,
            isMax = isMax,
            cap = bound,
            held = held,
        )
    }

    /** La lecture de l'ANCIENNE loi : le niveau borné à 100, le palier parmi les dix premiers. */
    public fun legacyProgress(score: Long, gate: Int? = null): LevelProgress {
        val p = progress(score, LEGACY_MAX_LEVEL, gate)
        return p.copy(tier = legacyTier(p.level))
    }

    /** Le plus haut niveau atteint depuis le prestige. */
    public fun record(level: Int, previousRecord: Int?): Int = max(level, previousRecord ?: MIN_LEVEL)

    /** Les niveaux franchis POUR LA PREMIÈRE FOIS ; le niveau 1 est acquis d'office. */
    public fun newLevelsReached(level: Int, previousRecord: Int?): GameNewLevels {
        val record = previousRecord ?: MIN_LEVEL
        return if (level > record) GameNewLevels(from = record + 1, to = level, count = level - record) else GameNewLevels(0, 0, 0)
    }

    /** Le Prestige s'offre à partir du niveau 100, tant qu'il reste une étoile à poser. */
    public fun canPrestige(level: Int, prestige: Int): Boolean = level >= PRESTIGE_LEVEL && prestige < MAX_PRESTIGE
}
