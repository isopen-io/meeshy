package me.meeshy.sdk.model.game

import kotlin.math.max

/** Le nombre de Meeshes gardées à partir duquel la réserve s'ouvre. */
public val TreasuryTierKey.minHeld: Int
    get() = when (this) {
        TreasuryTierKey.Bourse -> 1
        TreasuryTierKey.Escarcelle -> 10
        TreasuryTierKey.Coffret -> 50
        TreasuryTierKey.Coffre -> 100
        TreasuryTierKey.Tresor -> 500
        TreasuryTierKey.Reserve -> 1000
    }

/**
 * LE TRÉSOR (#9373) : les Meeshes GARDÉES, six paliers, qui baissent quand on dépense, et les réserves que
 * le rang ouvre (#10848). Miroirs : `treasury.ts` (fait foi), `GameTreasury.swift`.
 */
public object GameTreasury {

    private data class RankStep(val rank: GloryRank, val division5: Int)

    /** Les réserves fermées par le rang ; les autres paliers sont ouverts à tous. */
    private val rankRequirements: Map<TreasuryTierKey, RankStep> = mapOf(
        TreasuryTierKey.Coffre to RankStep(GloryRank.Voix, 1),
        TreasuryTierKey.Tresor to RankStep(GloryRank.Polyglotte, 3),
        TreasuryTierKey.Reserve to RankStep(GloryRank.Ambassadeur, 3),
    )

    /** Le palier courant et le suivant pour [held] Meeshes gardées. */
    public fun standing(held: Int): TreasuryStanding {
        val count = max(0, held)
        val reached = TreasuryTierKey.entries.lastOrNull { count >= it.minHeld }
        val upcoming = TreasuryTierKey.entries.firstOrNull { count < it.minHeld }
        return TreasuryStanding(
            held = count,
            tier = reached,
            next = upcoming?.let { TreasuryNext(it, it.minHeld, it.minHeld - count) },
        )
    }

    /** Le rang qu'exige la réserve, `null` : ouverte à tous. */
    public fun requirement(tier: TreasuryTierKey): RankRequirement? = rankRequirements[tier]?.let { step ->
        RankRequirement(step.rank, GloryLaws.legacyDivision(step.division5), step.division5)
    }

    /** FAIL-CLOSED : une marche introuvable ne s'ouvre pour personne. Le Mythe, servi par le serveur, ouvre tout. */
    private fun reaches(glory: Int, mythic: Boolean, required: RankRequirement): Boolean {
        if (mythic) return true
        val step = GloryLaws.ladder.firstOrNull { it.rank == required.rank && it.division5 == required.division5 }
            ?: return false
        return glory >= step.minGlory
    }

    /** Pour chaque réserve, son état et le rang qu'elle exige : `treasuryReserveAccess`. */
    public fun reserveAccess(glory: Int, mythic: Boolean = false): List<TreasuryAccess> =
        TreasuryTierKey.entries.map { tier ->
            val required = requirement(tier)
            TreasuryAccess(
                key = tier,
                minHeld = tier.minHeld,
                locked = required != null && !reaches(glory, mythic, required),
                requires = required,
            )
        }

    /** La réserve qui barre la prochaine Meesh gardée : `treasuryLockFor`. `null` : la frappe est libre. */
    public fun lock(held: Int, glory: Int, mythic: Boolean = false): GameMintLock? {
        val after = max(0, held) + 1
        return TreasuryTierKey.entries.firstNotNullOfOrNull { tier ->
            if (tier.minHeld > after) return@firstNotNullOfOrNull null
            val required = requirement(tier) ?: return@firstNotNullOfOrNull null
            if (reaches(glory, mythic, required)) null else GameMintLock(tier, tier.minHeld, required)
        }
    }
}
