package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameTreasuryTest {

    @Test
    fun `les six paliers ouvrent a 1 10 50 100 500 et 1000`() {
        assertThat(TreasuryTierKey.entries.map { it.minHeld })
            .containsExactly(1, 10, 50, 100, 500, 1000).inOrder()
    }

    @Test
    fun `sans Meesh gardee aucun palier et la Bourse est la suivante`() {
        val s = GameTreasury.standing(0)
        assertThat(s.tier).isNull()
        assertThat(s.next).isEqualTo(TreasuryNext(TreasuryTierKey.Bourse, 1, 1))
    }

    @Test
    fun `palier courant et suivant`() {
        val s = GameTreasury.standing(9)
        assertThat(s.tier).isEqualTo(TreasuryTierKey.Bourse)
        assertThat(s.next).isEqualTo(TreasuryNext(TreasuryTierKey.Escarcelle, 10, 1))
        assertThat(GameTreasury.standing(10).tier).isEqualTo(TreasuryTierKey.Escarcelle)
    }

    @Test
    fun `a la Reserve il n'y a plus de suivant`() {
        val s = GameTreasury.standing(5000)
        assertThat(s.tier).isEqualTo(TreasuryTierKey.Reserve)
        assertThat(s.next).isNull()
    }

    @Test
    fun `le rang n'ouvre que Coffre Tresor et Reserve`() {
        val access = GameTreasury.reserveAccess(glory = 0).associateBy { it.key }
        assertThat(access.getValue(TreasuryTierKey.Coffret).locked).isFalse()
        assertThat(access.getValue(TreasuryTierKey.Coffret).requires).isNull()
        assertThat(access.getValue(TreasuryTierKey.Coffre).locked).isTrue()
        assertThat(access.getValue(TreasuryTierKey.Coffre).requires)
            .isEqualTo(RankRequirement(GloryRank.Voix, 1, 1))
        assertThat(access.getValue(TreasuryTierKey.Reserve).requires)
            .isEqualTo(RankRequirement(GloryRank.Ambassadeur, 2, 3))
    }

    @Test
    fun `la Gloire suffisante ouvre la reserve`() {
        val access = GameTreasury.reserveAccess(glory = 170_000).associateBy { it.key }
        assertThat(access.getValue(TreasuryTierKey.Reserve).locked).isFalse()
    }

    @Test
    fun `le verrou vise la reserve d'arrivee de la prochaine piece`() {
        assertThat(GameTreasury.lock(held = 98, glory = 0)).isNull()
        assertThat(GameTreasury.lock(held = 99, glory = 0)!!.tier).isEqualTo(TreasuryTierKey.Coffre)
        assertThat(GameTreasury.lock(held = 999, glory = 170_000)).isNull()
    }
}
