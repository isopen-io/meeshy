package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Miroir des cas de `packages/shared/__tests__/game/acts-ring.test.ts` et de `GameActsRingTests` iOS (#17768) :
 * l'anneau des actes du jour autour du bouton du menu se LIT dans le bloc servi.
 */
class GameActsRingTest {

    private val doneAt = "2026-11-13T09:00:00.000Z"

    private fun missions(unlocked: Boolean = true, done: List<Boolean> = listOf(false, false, false)): GameMissions {
        val base = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block())).missions
        val template = base.items.first()
        return base.copy(
            unlocked = unlocked,
            items = done.mapIndexed { index, isDone -> template.copy(id = "m$index", completedAt = if (isDone) doneAt else null) },
        )
    }

    @Test
    fun `compte les actes du jour realises sur ceux du jour`() {
        assertThat(GameActsRing.of(missions(done = listOf(true, false, true)), hidden = false)).isEqualTo(GameActsRing(done = 2, total = 3))
    }

    @Test
    fun `aucun acte realise, l'anneau existe, eteint`() {
        assertThat(GameActsRing.of(missions(), hidden = false)).isEqualTo(GameActsRing(done = 0, total = 3))
    }

    @Test
    fun `les trois actes realises, l'anneau est plein`() {
        val ring = GameActsRing.of(missions(done = listOf(true, true, true)), hidden = false)
        assertThat(ring).isEqualTo(GameActsRing(done = 3, total = 3))
        assertThat(ring!!.isComplete).isTrue()
    }

    @Test
    fun `avant le niveau 5 les actes ne sont pas ouverts, aucun anneau`() {
        assertThat(GameActsRing.of(missions(unlocked = false, done = listOf(true, false, false)), hidden = false)).isNull()
    }

    @Test
    fun `un jour servi sans acte, aucun anneau`() {
        assertThat(GameActsRing.of(missions(done = emptyList()), hidden = false)).isNull()
    }

    @Test
    fun `Jeu masque, aucun anneau`() {
        assertThat(GameActsRing.of(missions(done = listOf(true, true, false)), hidden = true)).isNull()
    }

    @Test
    fun `sans bloc de jeu (cache vide, ancien serveur), aucun anneau`() {
        assertThat(GameActsRing.of(null as GameBlock?, hidden = false)).isNull()
    }

    @Test
    fun `le bloc servi est lu tel quel`() {
        val base = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))
        val served = base.copy(missions = missions(done = listOf(false, true, false)))
        assertThat(GameActsRing.of(served, hidden = false)).isEqualTo(GameActsRing(done = 1, total = 3))
        assertThat(GameActsRing.of(served, hidden = true)).isNull()
    }

    @Test
    fun `un segment par acte, depuis le haut, separes du meme jour que le web et iOS`() {
        val segments = MenuActsRingGeometry.segments(GameActsRing(done = 2, total = 3))
        val gap = 14.0 / 300.0
        assertThat(segments).hasSize(3)
        assertThat(segments.map { it.isDone }).containsExactly(true, true, false).inOrder()
        assertThat(segments[0].from).isWithin(1e-9).of(gap / 2)
        assertThat(segments[0].to).isWithin(1e-9).of(1.0 / 3 - gap / 2)
        assertThat(segments[2].to).isWithin(1e-9).of(1.0 - gap / 2)
    }

    @Test
    fun `un anneau sans acte ne dessine rien`() {
        assertThat(MenuActsRingGeometry.segments(GameActsRing(done = 0, total = 0))).isEmpty()
    }
}
