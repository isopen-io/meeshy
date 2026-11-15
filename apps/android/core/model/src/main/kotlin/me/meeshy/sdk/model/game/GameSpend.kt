package me.meeshy.sdk.model.game

import kotlin.math.max

/**
 * Ce qu'un geste dépense (#9705), montré AVANT le geste : ce qu'on a, ce que ça coûte, ce qui restera ou,
 * quand le solde ne suffit pas, ce qui manque. [gesture] nomme le geste visé (clé neutre : le libellé se
 * résout côté écran). `0` pour [missing] quand le geste est possible ; [after] vaut [held] sinon.
 */
public data class SpendPreview(
    val held: Long,
    val cost: Long,
    val after: Long,
    val missing: Long,
    val affordable: Boolean,
    val gesture: String? = null,
)

/** Une exigence (un niveau requis) : où l'on en est, le seuil, l'écart (`0` quand elle est remplie). */
public data class RequirementPreview(
    val current: Long,
    val required: Long,
    val missing: Long,
    val met: Boolean,
    val gesture: String? = null,
)

/**
 * Pur et sans prix : le prix et le seuil viennent de la loi du geste ou du bloc servi. [spendable]
 * distingue le SOLDE de la PART qui paie. Miroirs : `spend.ts` (fait foi), `GameSpend.swift`.
 */
public object GameSpend {
    public fun preview(held: Long, cost: Long, spendable: Long? = null, gesture: String? = null): SpendPreview {
        val safeHeld = max(0L, held)
        val safeCost = max(0L, cost)
        val paying = spendable?.let { max(0L, it) } ?: safeHeld
        val affordable = paying >= safeCost
        return SpendPreview(
            held = safeHeld,
            cost = safeCost,
            after = if (affordable) max(0L, safeHeld - safeCost) else safeHeld,
            missing = if (affordable) 0L else safeCost - paying,
            affordable = affordable,
            gesture = gesture,
        )
    }

    public fun requirement(current: Long, required: Long, gesture: String? = null): RequirementPreview {
        val safeCurrent = max(0L, current)
        val safeRequired = max(0L, required)
        val met = safeCurrent >= safeRequired
        return RequirementPreview(safeCurrent, safeRequired, if (met) 0L else safeRequired - safeCurrent, met, gesture)
    }
}
