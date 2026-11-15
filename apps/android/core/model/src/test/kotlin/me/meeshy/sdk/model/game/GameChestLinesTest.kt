package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameChestLinesTest {

    @Test
    fun `les points de l effort ne comptent pas la prime qui a sa ligne`() {
        val reward = DailyChest(points = 2221, fragment = false, freeze = false, glory = 100, bonus = ChestBonus.Whole, bonusPoints = 1221)

        assertThat(GameChestLines.of(reward)).containsExactly(
            ChestLine.Points(1000),
            ChestLine.Glory(100),
            ChestLine.Bonus(ChestBonus.Whole, 1221),
        ).inOrder()
    }

    @Test
    fun `un coffre d avant la gloire et la prime ne dit que ses points`() {
        val reward = DailyChest(points = 700, fragment = false, freeze = false)

        assertThat(GameChestLines.of(reward)).containsExactly(ChestLine.Points(700))
    }

    @Test
    fun `le fragment et la Veilleuse closent la liste dans cet ordre`() {
        val reward = DailyChest(points = 500, fragment = true, freeze = true, glory = 50)

        assertThat(GameChestLines.of(reward)).containsExactly(
            ChestLine.Points(500), ChestLine.Glory(50), ChestLine.Fragment, ChestLine.Freeze,
        ).inOrder()
    }

    @Test
    fun `une prime aucune ou a zero point n a pas de ligne`() {
        val none = DailyChest(points = 500, fragment = false, freeze = false, bonus = ChestBonus.NoBonus, bonusPoints = 0)

        assertThat(GameChestLines.of(none)).containsExactly(ChestLine.Points(500))
    }

    @Test
    fun `l Offrande en vol est ouverte sans contenu tant que la passerelle n a pas repondu`() {
        assertThat(ChestPhase.of(ChestStatus.Ready, opening = true, hasReward = false)).isEqualTo(ChestPhase.Opening)
        assertThat(ChestPhase.of(ChestStatus.Ready, opening = true, hasReward = true)).isEqualTo(ChestPhase.Claimed)
    }

    @Test
    fun `l Offrande servie reclamee se lit par son contenu, prete ou verrouillee sinon`() {
        assertThat(ChestPhase.of(ChestStatus.Claimed, opening = false, hasReward = true)).isEqualTo(ChestPhase.Claimed)
        assertThat(ChestPhase.of(ChestStatus.Claimed, opening = false, hasReward = false)).isEqualTo(ChestPhase.Opening)
        assertThat(ChestPhase.of(ChestStatus.Ready, opening = false, hasReward = false)).isEqualTo(ChestPhase.Ready)
        assertThat(ChestPhase.of(ChestStatus.Locked, opening = false, hasReward = false)).isEqualTo(ChestPhase.Locked)
    }
}
