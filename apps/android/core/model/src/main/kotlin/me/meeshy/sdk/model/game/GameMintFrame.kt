package me.meeshy.sdk.model.game

import kotlin.math.max

/** Ce qui ferme la frappe, dit à la place du bouton : jamais un bouton grisé sans explication. */
public sealed interface MintFrameBlocker {
    /** L'Ombre : une dette d'étincelles. `0` quand le serveur n'en sert pas le montant — la phrase ne l'invente pas. */
    public data class Debt(val amount: Long) : MintFrameBlocker

    /** La réserve où entrerait la pièce, que le rang n'ouvre pas encore. */
    public data class ReserveClosed(val tier: TreasuryTierKey, val rank: GloryRank, val division5: Int?) : MintFrameBlocker
}

/** La phrase de Mee sous l'action. */
public sealed interface MintMee {
    public data object Wait : MintMee
    public data object Gold : MintMee
    public data object Prism : MintMee
    public data class NextGold(val number: Int) : MintMee
    public data class NextPrism(val number: Int) : MintMee
}

/**
 * Le cadre de la frappe (iOS `GameMintFrameModel`), PUR : chaque nombre est celui que la passerelle sert dans
 * `game.mint`. Aucune soustraction, aucun pourcentage, aucun « après » : le prix paraît UNE fois, dans la phrase.
 * [glory] est `null` quand la frappe n'est pas possible — il n'y a alors pas de bouton.
 */
public data class GameMintFrame(
    val number: Int,
    val price: Int,
    val pocket: Long,
    val missing: Long?,
    val blocker: MintFrameBlocker?,
    val glory: Int?,
    val mee: MintMee,
) {
    public companion object {
        /** [pocket] : la poche d'étincelles — `level.sparks`, ou le score devant un serveur antérieur. */
        public fun of(mint: GameMintPreview, pocket: Long): GameMintFrame = GameMintFrame(
            number = mint.number,
            price = mint.price,
            pocket = max(0L, pocket),
            missing = mint.missingPoints.takeIf { !mint.canMint && it > 0L },
            blocker = blocker(mint),
            glory = mint.gloryGained.takeIf { mint.canMint },
            mee = mee(mint),
        )

        private fun blocker(mint: GameMintPreview): MintFrameBlocker? = when (val blocker = mint.blocker) {
            is GameMintPreview.Blocker.SparksDebt -> MintFrameBlocker.Debt(blocker.amount)
            is GameMintPreview.Blocker.TreasuryLocked ->
                MintFrameBlocker.ReserveClosed(blocker.lock.tier, blocker.lock.requires.rank, blocker.lock.requires.division5)
            is GameMintPreview.Blocker.MissingSparks, null -> null
        }

        private fun mee(mint: GameMintPreview): MintMee {
            if (!mint.canMint) return MintMee.Wait
            return when (mint.edition ?: MeeshEdition.Silver) {
                MeeshEdition.Gold -> MintMee.Gold
                MeeshEdition.Prism -> MintMee.Prism
                MeeshEdition.Silver -> {
                    val special = (max(1, mint.number) + 99) / 100 * 100
                    if (GameMint.edition(special) == MeeshEdition.Prism) MintMee.NextPrism(special) else MintMee.NextGold(special)
                }
            }
        }
    }
}

/** Comment une frappe REFUSÉE se dit (iOS `GameMintCostCopy.mintFailureMessage`) : la dette, la réserve fermée, le prix changé, sinon le repli. */
public enum class MintFailureKind {
    Debt, ReserveClosed, PriceChanged, Generic;

    public companion object {
        public fun of(code: String?): MintFailureKind = when (GameErrorCode.fromWire(code)) {
            GameErrorCode.MintBlockedByDebt -> Debt
            GameErrorCode.TreasuryLocked -> ReserveClosed
            GameErrorCode.PriceChanged -> PriceChanged
            else -> Generic
        }
    }
}
