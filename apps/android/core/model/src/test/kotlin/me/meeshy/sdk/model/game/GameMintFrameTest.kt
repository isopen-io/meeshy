package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameMintFrameTest {

    private fun preview(
        number: Int = 92,
        price: Int = 1221,
        canMint: Boolean = true,
        missing: Long = 0,
        edition: MeeshEdition? = MeeshEdition.Silver,
        debt: Long? = null,
        locked: GameMintLock? = null,
    ) = GameMintPreview(
        number = number, price = price, edition = edition, canMint = canMint, missingPoints = missing,
        levelBefore = 9, levelAfter = 8, levelsLost = 1, gloryGained = 1000,
        locked = locked, sparksDebt = debt, blockedBy = if ((debt ?: 0) > 0) MintBlock.Debt else null,
    )

    @Test
    fun `une frappe possible porte sa gloire et rien ne manque`() {
        val frame = GameMintFrame.of(preview(), pocket = 108_233)

        assertThat(frame.glory).isEqualTo(1000)
        assertThat(frame.missing).isNull()
        assertThat(frame.blocker).isNull()
        assertThat(frame.pocket).isEqualTo(108_233L)
        assertThat(frame.price).isEqualTo(1221)
    }

    @Test
    fun `une frappe impossible dit ce qui manque et n a pas de gloire`() {
        val frame = GameMintFrame.of(preview(canMint = false, missing = 1839), pocket = 100)

        assertThat(frame.glory).isNull()
        assertThat(frame.missing).isEqualTo(1839L)
        assertThat(frame.mee).isEqualTo(MintMee.Wait)
    }

    @Test
    fun `l Ombre passe avant tout et dit son montant`() {
        val frame = GameMintFrame.of(preview(canMint = false, debt = 300), pocket = 5)

        assertThat(frame.blocker).isEqualTo(MintFrameBlocker.Debt(300))
    }

    @Test
    fun `la reserve fermee par le rang nomme la reserve et le rang`() {
        val lock = GameMintLock(TreasuryTierKey.Coffre, 100, RankRequirement(GloryRank.Voix, 1, 1))

        val frame = GameMintFrame.of(preview(canMint = false, locked = lock), pocket = 5)

        assertThat(frame.blocker).isEqualTo(MintFrameBlocker.ReserveClosed(TreasuryTierKey.Coffre, GloryRank.Voix, 1))
    }

    @Test
    fun `Mee annonce la prochaine piece d or ou de prisme`() {
        assertThat(GameMintFrame.of(preview(number = 92), 1).mee).isEqualTo(MintMee.NextGold(100))
        assertThat(GameMintFrame.of(preview(number = 901), 1).mee).isEqualTo(MintMee.NextPrism(1000))
        assertThat(GameMintFrame.of(preview(number = 100, edition = MeeshEdition.Gold), 1).mee).isEqualTo(MintMee.Gold)
        assertThat(GameMintFrame.of(preview(number = 1000, edition = MeeshEdition.Prism), 1).mee).isEqualTo(MintMee.Prism)
    }

    @Test
    fun `une edition inconnue se lit argent`() {
        assertThat(GameMintFrame.of(preview(number = 5, edition = null), 1).mee).isEqualTo(MintMee.NextGold(100))
    }

    @Test
    fun `un refus de frappe se range par son code, tout le reste est generique`() {
        assertThat(MintFailureKind.of("MINT_BLOCKED_BY_DEBT")).isEqualTo(MintFailureKind.Debt)
        assertThat(MintFailureKind.of("TREASURY_LOCKED")).isEqualTo(MintFailureKind.ReserveClosed)
        assertThat(MintFailureKind.of("PRICE_CHANGED")).isEqualTo(MintFailureKind.PriceChanged)
        assertThat(MintFailureKind.of("INSUFFICIENT_POINTS")).isEqualTo(MintFailureKind.Generic)
        assertThat(MintFailureKind.of(null)).isEqualTo(MintFailureKind.Generic)
    }
}
