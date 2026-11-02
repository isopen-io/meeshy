package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * LA RARETÉ CROISSANTE DES MEESHES (#9373) : le prix monte avec le nombre de Meeshes déjà frappées.
 *
 *     prix(n) = round(1221 x 1,3 ^ floor((n - 1) / 10)), plafonné à 16 556
 *
 * Le TypeScript fait foi (`packages/shared/utils/game/mint.ts`) ; miroirs iOS `GameMint.swift` et ce fichier.
 * Le prix EFFECTIF d'une frappe lit en plus le niveau ACTUEL (`effectivePrice`, facteur de 0,5 à 1) : l'écran
 * montre celui que la passerelle sert, ces lois ne servent qu'à l'optimiste.
 */
public object GameMint {
    /** Le prix des dix premières Meeshes. */
    public const val BASE_PRICE: Int = 1221
    public const val PRICE_STEP_EVERY: Int = 10
    public const val PRICE_GROWTH: Double = 1.3

    /** Le plafond (porteur, 2026-10-10) : atteint à la 101e frappe. */
    public const val PRICE_CAP: Int = 16_556

    /** Le facteur au niveau 0, en millièmes : 50 %. */
    public const val COST_FACTOR_AT_LEVEL_ZERO_PERMILLE: Int = 500

    /** Le niveau à partir duquel la frappe est au plein tarif. */
    public const val FULL_PRICE_LEVEL: Int = 100

    private const val FULL_PERMILLE = 1000

    /**
     * Le prix de la n-ième Meesh (n commence à 1 ; une valeur < 1 vaut 1). Le plafond se pose AVANT la
     * conversion en entier : `1,3^k` finit par l'infini pour un numéro démesuré.
     */
    public fun price(number: Int): Int {
        val steps = (max(1, number) - 1) / PRICE_STEP_EVERY
        val raw = Math.round(BASE_PRICE * PRICE_GROWTH.pow(steps)).toDouble()
        return min(raw, PRICE_CAP.toDouble()).toInt()
    }

    /** Le facteur de coût en millièmes (500 à 1000) pour ce niveau ACTUEL : linéaire, plein tarif dès le niveau 100. */
    public fun costFactorPermille(level: Int): Int {
        val bounded = min(FULL_PRICE_LEVEL, max(0, level))
        return COST_FACTOR_AT_LEVEL_ZERO_PERMILLE +
            (FULL_PERMILLE - COST_FACTOR_AT_LEVEL_ZERO_PERMILLE) * bounded / FULL_PRICE_LEVEL
    }

    /** Le prix de la n-ième Meesh à ce niveau ACTUEL : `price(n)` x le facteur, arrondi, au moins 1. */
    public fun effectivePrice(number: Int, level: Int): Int =
        max(1, (price(number) * costFactorPermille(level) + FULL_PERMILLE / 2) / FULL_PERMILLE)

    /** L'édition de la LOI : or à chaque centième, prisme à chaque millième, argent sinon. */
    public fun edition(number: Int): MeeshEdition {
        val rank = max(0, number)
        return when {
            rank > 0 && rank % 1000 == 0 -> MeeshEdition.Prism
            rank > 0 && rank % 100 == 0 -> MeeshEdition.Gold
            else -> MeeshEdition.Silver
        }
    }

    /**
     * L'édition DESSINÉE (#11483) : la plus haute atteinte, argent avant le n° 100, or dès le n° 100, prisme
     * dès le n° 1000. La matière de la pièce et les poussières suivent ce dessin, la chorégraphie suit [edition].
     */
    public fun displayEdition(number: Int): MeeshEdition {
        val rank = max(0, number)
        return when {
            rank >= 1000 -> MeeshEdition.Prism
            rank >= 100 -> MeeshEdition.Gold
            else -> MeeshEdition.Silver
        }
    }

    /** Les faits des étapes APRÈS la frappe : une Meesh de plus et sa Gloire, qui peut faire passer un rang. */
    internal fun stepsAfterMint(steps: LevelStepFacts): LevelStepFacts {
        val glory = max(0, steps.glory) + GloryLaws.POINTS_MINT
        return LevelStepFacts(
            minted = max(0, steps.minted) + 1,
            missionsDone = steps.missionsDone,
            flameRecord = steps.flameRecord,
            glory = glory,
            rank = if (steps.rank == GloryRank.Mythe) GloryRank.Mythe else GloryLaws.standing(glory).rank,
        )
    }

    /**
     * La loi d'HIER (vecteurs `mint-preview`, que rejouent les clients publiés) : tout le solde paie. Les
     * étapes ([steps]) lisent leur `minted` sur [mintedLifetime]. Avec les étincelles, voir [sparksPreview].
     */
    public fun preview(
        score: Long,
        mintedLifetime: Int,
        debitablePoints: Long,
        levelCap: Int?,
        steps: LevelStepFacts? = null,
    ): GameMintPreview {
        val held = max(0L, score)
        val debitable = max(0L, debitablePoints)
        val minted = max(0, mintedLifetime)
        val number = min(minted, Int.MAX_VALUE - 1) + 1
        val cost = price(number)
        val canMint = debitable >= cost
        val before = steps?.copy(minted = minted)
        val capBefore = GameLevels.tighter(levelCap, GameLevelSteps.gate(before))
        val after = before?.let { stepsAfterMint(it) }
        val capAfter = after?.let { GameLevelSteps.cap(it.rank, it) } ?: capBefore
        val levelBefore = GameLevels.levelForScore(held, capBefore)
        val levelAfter = if (canMint) GameLevels.levelForScore(max(0L, held - cost), capAfter) else levelBefore
        return GameMintPreview(
            number = number,
            price = cost,
            edition = edition(number),
            canMint = canMint,
            missingPoints = if (canMint) 0L else cost - debitable,
            levelBefore = levelBefore,
            levelAfter = levelAfter,
            levelsLost = max(0, levelBefore - levelAfter),
            gloryGained = if (canMint) GloryLaws.POINTS_MINT else 0,
        )
    }
}
