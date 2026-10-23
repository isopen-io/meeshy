package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.min

/**
 * La frappe selon les étincelles (#10847, #10848, #10892) : `previewSparksMint` de `sparks.ts` (fait foi),
 * rejoué cas pour cas sur `sparks.vectors.json`. La POCHE paie et fait le niveau ; le prix est celui de la
 * pièce x le facteur du niveau ACTUEL (lu au moins au niveau 1) ; une pièce qui ferait entrer dans une
 * réserve que le rang n'ouvre pas est barrée ; une dette d'étincelles bloque toute frappe.
 *
 * L'écran montre ce que la passerelle SERT : cette loi ne sert qu'à l'optimiste, pour ne jamais peindre un
 * prix, un niveau ou un « Frapper » que la passerelle refuserait. Les niveaux rendus sont BRUTS (sans la
 * borne de 100 du fil).
 */
public fun GameMint.sparksPreview(
    sparks: Long,
    mintedLifetime: Int,
    held: Int,
    glory: Int,
    levelCap: Int?,
    steps: LevelStepFacts?,
    mythic: Boolean = false,
    debt: Long = 0L,
): GameMintPreview {
    val pocket = max(0L, sparks)
    val minted = min(max(0, mintedLifetime), Int.MAX_VALUE - 1)
    val number = minted + 1
    val before = steps?.copy(minted = minted)
    val after = before?.let { stepsAfterMint(it) }
    val capBefore = GameLevels.tighter(levelCap, GameLevelSteps.gate(before))
    val capAfter = after?.let { GameLevelSteps.cap(it.rank, it) } ?: capBefore

    val levelBefore = GameLevels.levelForScore(pocket, capBefore)
    val costLevel = max(GameLevels.MIN_LEVEL, levelBefore)
    val cost = effectivePrice(number, costLevel)
    val locked = GameTreasury.lock(held, glory, mythic)
    val owed = max(0L, debt)
    val affordable = pocket >= cost
    val canMint = affordable && locked == null && owed == 0L
    val levelAfter = if (canMint) GameLevels.levelForScore(pocket - cost, capAfter) else levelBefore
    return GameMintPreview(
        number = number,
        price = cost,
        edition = edition(number),
        canMint = canMint,
        missingPoints = if (affordable) 0L else cost - pocket,
        levelBefore = levelBefore,
        levelAfter = levelAfter,
        levelsLost = max(0, levelBefore - levelAfter),
        gloryGained = if (canMint) GloryLaws.POINTS_MINT else 0,
        basePrice = price(number),
        costFactor = costFactorPermille(costLevel) / 1000.0,
        costLevel = costLevel,
        locked = locked,
        sparksDebt = owed,
        blockedBy = if (owed > 0L) MintBlock.Debt else null,
    )
}
