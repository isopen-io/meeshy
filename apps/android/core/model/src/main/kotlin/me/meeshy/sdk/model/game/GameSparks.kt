package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.min

/**
 * LES ÉTINCELLES (#10846) : « étincelle » est le nom des POINTS ; la monnaie reste la Meesh. Trois nombres,
 * un seul dépensable, et c'est lui qui fait le niveau (porteur 2026-10-17, #10892) :
 *
 *  - la POCHE : ce que la frappe dépense et ce que le NIVEAU lit ;
 *  - le CYCLE : accumulé depuis le dernier prestige, INDICATIF ;
 *  - le TOTAL À VIE : ne baisse ni à la frappe ni au prestige, INDICATIF aussi.
 *
 * Invariant : poche <= cycle <= total à vie. Miroirs : `sparks.ts` (fait foi), `GameSparks.swift`.
 */
public object GameSparks {

    /** Les trois nombres, la dette en plus : ce qu'un gain et un Prestige transforment (#10902). */
    public data class Ledger(val pocket: Long, val cycle: Long, val lifetime: Long, val debt: Long)

    /** `sparksOf` : un champ absent ou en retard se lit sur celui d'en dessous, jamais sous lui. */
    public fun ledgerOf(pocket: Long?, cycle: Long?, lifetime: Long?, debt: Long? = null): Ledger {
        val safePocket = max(0L, pocket ?: 0L)
        val safeCycle = max(safePocket, cycle ?: 0L)
        return Ledger(safePocket, safeCycle, max(safeCycle, lifetime ?: 0L), max(0L, debt ?: 0L))
    }

    /** La base du niveau (`levelSparksOf`, #10892) : la poche, jamais le cycle. */
    public fun levelBase(ledger: Ledger): Long = ledger.pocket

    /**
     * `sparksAfterCredit` : la dette se rembourse d'abord, seul le reste va en poche ; le cycle et le total
     * à vie montent du gain ENTIER, jamais sous la poche.
     */
    public fun afterCredit(ledger: Ledger, points: Long): Ledger {
        val gained = max(0L, points)
        val debt = max(0L, ledger.debt)
        val repaid = min(debt, gained)
        val pocket = max(0L, ledger.pocket)
        val cycle = max(max(0L, ledger.cycle), pocket)
        return Ledger(
            pocket = pocket + gained - repaid,
            cycle = cycle + gained,
            lifetime = max(max(0L, ledger.lifetime), cycle) + gained,
            debt = debt - repaid,
        )
    }

    /** `sparksAfterPrestige` : la poche et le cycle repartent de zéro ; le total à vie et la dette restent. */
    public fun afterPrestige(ledger: Ledger): Ledger = Ledger(
        pocket = 0L,
        cycle = 0L,
        lifetime = maxOf(0L, ledger.lifetime, ledger.cycle, ledger.pocket),
        debt = max(0L, ledger.debt),
    )
}

/** Les étincelles SERVIES et la dette, lues par `sparksOf` ; `null` devant un serveur d'avant les étincelles. */
public val GameLevel.sparkLedger: GameSparks.Ledger?
    get() = sparks?.let { GameSparks.ledgerOf(it, sparksCycle, sparksLifetime, sparksDebt) }
