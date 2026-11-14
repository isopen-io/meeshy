package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir des cas de `packages/shared/__tests__/game/attention.test.ts` (#17796). */
class GameAttentionTest {

    private fun law(
        unlocked: Boolean = true,
        chest: ChestStatus = ChestStatus.Locked,
        flame: FlameStatus = FlameStatus.Lit,
        days: Int = 4,
    ) = GameAttention.of(unlocked, chest, flame, days)

    @Test
    fun `l'Offrande servie prete se signale`() {
        assertThat(law(chest = ChestStatus.Ready)).isEqualTo(GameAttention(chestReady = true, flameAtRisk = false))
    }

    @Test
    fun `une Offrande voilee ou deja ouverte ne se signale pas`() {
        assertThat(law(chest = ChestStatus.Locked).chestReady).isFalse()
        assertThat(law(chest = ChestStatus.Claimed).chestReady).isFalse()
    }

    @Test
    fun `avant le niveau 5 aucune Offrande ne se signale, meme servie prete`() {
        assertThat(law(unlocked = false, chest = ChestStatus.Ready).chestReady).isFalse()
    }

    @Test
    fun `la Flamme servie a risque se signale`() {
        assertThat(law(flame = FlameStatus.AtRisk)).isEqualTo(GameAttention(chestReady = false, flameAtRisk = true))
    }

    @Test
    fun `une Flamme allumee, couverte, eteinte ou absente ne se signale pas`() {
        listOf(FlameStatus.None, FlameStatus.Lit, FlameStatus.Covered, FlameStatus.Out).forEach { status ->
            assertThat(law(flame = status).flameAtRisk).isFalse()
        }
    }

    @Test
    fun `une Flamme sans jour ne se dit pas a risque`() {
        assertThat(law(flame = FlameStatus.AtRisk, days = 0).flameAtRisk).isFalse()
    }

    @Test
    fun `sans bloc de jeu rien ne se signale, et Jeu masque non plus`() {
        assertThat(GameAttention.of(null, hidden = false)).isEqualTo(GameAttention.None)
        assertThat(GameAttention.of(null, hidden = true)).isEqualTo(GameAttention.None)
    }

    @Test
    fun `le bloc servi est lu tel quel, et Jeu masque le fait taire`() {
        val base = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))
        val served = base.copy(
            missions = base.missions.copy(unlocked = true),
            chest = base.chest.copy(status = ChestStatus.Ready),
            flame = base.flame.copy(status = FlameStatus.AtRisk, days = 4),
        )
        assertThat(GameAttention.of(served, hidden = false)).isEqualTo(GameAttention(chestReady = true, flameAtRisk = true))
        assertThat(GameAttention.of(served, hidden = true)).isEqualTo(GameAttention.None)
    }

    @Test
    fun `les deux signaux coexistent ; isRaised des qu'un signal est leve`() {
        assertThat(law(chest = ChestStatus.Ready, flame = FlameStatus.AtRisk))
            .isEqualTo(GameAttention(chestReady = true, flameAtRisk = true))
        assertThat(GameAttention.None.isRaised).isFalse()
        assertThat(GameAttention(chestReady = true, flameAtRisk = false).isRaised).isTrue()
        assertThat(GameAttention(chestReady = false, flameAtRisk = true).isRaised).isTrue()
    }
}
