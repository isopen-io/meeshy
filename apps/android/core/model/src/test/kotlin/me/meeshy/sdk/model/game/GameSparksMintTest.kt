package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameSparksMintTest {

    private fun preview(
        sparks: Long,
        minted: Int = 0,
        held: Int = 0,
        glory: Int = 0,
        debt: Long = 0L,
        mythic: Boolean = false,
    ) = GameMint.sparksPreview(
        sparks = sparks, mintedLifetime = minted, held = held, glory = glory,
        levelCap = 499, steps = null, mythic = mythic, debt = debt,
    )

    @Test
    fun `la poche paie et l'apercu rejoue le prix du niveau actuel hors ligne`() {
        val p = preview(8200)
        assertThat(p.price).isEqualTo(665)
        assertThat(p.basePrice).isEqualTo(1221)
        assertThat(p.costLevel).isEqualTo(9)
        assertThat(p.canMint).isTrue()
        assertThat(p.levelBefore).isEqualTo(9)
        assertThat(p.levelAfter).isEqualTo(8)
        assertThat(p.gloryGained).isEqualTo(1000)
    }

    @Test
    fun `une pocheinsuffisante dit ce qui manque et le blocage`() {
        val p = preview(622)
        assertThat(p.canMint).isFalse()
        assertThat(p.missingPoints).isEqualTo(1L)
        assertThat(p.blocker).isEqualTo(GameMintPreview.Blocker.MissingSparks(1L))
        assertThat(p.levelAfter).isEqualTo(p.levelBefore)
    }

    @Test
    fun `la dette d'etincelles bloque la frappe avant tout`() {
        val p = preview(90_000, debt = 250)
        assertThat(p.canMint).isFalse()
        assertThat(p.blockedBy).isEqualTo(MintBlock.Debt)
        assertThat(p.blocker).isEqualTo(GameMintPreview.Blocker.SparksDebt(250L))
    }

    @Test
    fun `la reserve fermee par le rang barre la piece`() {
        val p = preview(90_000, minted = 99, held = 99)
        assertThat(p.canMint).isFalse()
        val lock = p.locked!!
        assertThat(lock.tier).isEqualTo(TreasuryTierKey.Coffre)
        assertThat(p.blocker).isEqualTo(GameMintPreview.Blocker.TreasuryLocked(lock))
        assertThat(p.edition).isEqualTo(MeeshEdition.Gold)
    }

    @Test
    fun `le rang ouvre la reserve et la frappe passe`() {
        val p = preview(90_000, minted = 99, held = 99, glory = 13_200)
        assertThat(p.canMint).isTrue()
        assertThat(p.locked).isNull()
        assertThat(p.blocker).isNull()
    }

    @Test
    fun `le Mythe ouvre toutes les reserves`() {
        assertThat(preview(4_000_000, minted = 999, held = 999, mythic = true).locked).isNull()
    }

    @Test
    fun `la dette passe avant la reserve et avant le manque`() {
        val p = preview(0, minted = 99, held = 99, debt = 5)
        assertThat(p.blocker).isEqualTo(GameMintPreview.Blocker.SparksDebt(5L))
    }
}
