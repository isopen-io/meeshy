package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.story.StoryNavigationDirection.BACKWARD
import me.meeshy.sdk.model.story.StoryNavigationDirection.FORWARD
import org.junit.Test

class StoryNeighborWindowTest {
    private fun pos(g: Int, s: Int) = StorySlidePosition(g, s)
    private fun shapes(vararg counts: Int) = counts.map { StoryGroupShape(it, 0) }
    private fun order(from: StorySlidePosition, groups: List<StoryGroupShape>, dir: StoryNavigationDirection) =
        StoryNeighborWindow.preparations(from, groups, dir).map { it.position }

    @Test
    fun `la voisine du sens du geste passe d'abord dans l'anneau`() {
        val groups = shapes(10)
        assertThat(order(pos(0, 5), groups, FORWARD).take(4)).containsExactly(pos(0, 6), pos(0, 4), pos(0, 7), pos(0, 3)).inOrder()
        assertThat(order(pos(0, 5), groups, BACKWARD).take(4)).containsExactly(pos(0, 4), pos(0, 6), pos(0, 3), pos(0, 7)).inOrder()
    }

    @Test
    fun `l'anneau porte les distances 1 puis 2 et le reste n'en a pas`() {
        val prep = StoryNeighborWindow.preparations(pos(0, 5), shapes(10), FORWARD)
        assertThat(prep.take(4).map { it.distance }).containsExactly(1, 1, 2, 2).inOrder()
        assertThat(prep.drop(4).map { it.distance }.toSet()).containsExactly(null)
    }

    @Test
    fun `avancer depuis la derniere slide atterrit sur l'entree du groupe suivant`() {
        val groups = listOf(StoryGroupShape(2, 0), StoryGroupShape(4, 2))
        assertThat(order(pos(0, 1), groups, FORWARD).first()).isEqualTo(pos(1, 2))
    }

    @Test
    fun `reculer depuis la premiere atterrit sur la derniere du groupe precedent`() {
        val groups = shapes(3, 4)
        assertThat(order(pos(1, 0), groups, BACKWARD).first()).isEqualTo(pos(0, 2))
    }

    @Test
    fun `le budget borne la fenetre et les groupes suivants donnent deux slides chacun`() {
        val groups = shapes(20, 5, 5, 5)
        val result = order(pos(0, 0), groups, FORWARD)
        assertThat(result.size).isAtMost(StoryNeighborWindow.Budget.Standard.maximumCount - 1)
        assertThat(result).containsAtLeast(pos(1, 0), pos(1, 1), pos(2, 0), pos(2, 1))
        assertThat(result).doesNotContain(pos(3, 0))
        assertThat(result.count { it.group == 0 }).isEqualTo(8)
    }

    @Test
    fun `aucune slide n'est rendue deux fois ni la courante`() {
        val result = order(pos(1, 1), shapes(3, 3, 3), BACKWARD)
        assertThat(result).containsNoDuplicates()
        assertThat(result).doesNotContain(pos(1, 1))
    }

    @Test
    fun `un groupe vide est enjambe et une position invalide ne rend rien`() {
        assertThat(order(pos(0, 0), shapes(1, 0, 2), FORWARD).first()).isEqualTo(pos(2, 0))
        assertThat(order(pos(5, 0), shapes(1), FORWARD)).isEmpty()
        assertThat(order(pos(0, 3), shapes(1), FORWARD)).isEmpty()
    }

    @Test
    fun `la direction se lit dans le deplacement`() {
        assertThat(StoryNeighborWindow.direction(pos(0, 2), pos(0, 3), BACKWARD)).isEqualTo(FORWARD)
        assertThat(StoryNeighborWindow.direction(pos(1, 0), pos(0, 4), FORWARD)).isEqualTo(BACKWARD)
        assertThat(StoryNeighborWindow.direction(pos(0, 2), pos(0, 2), BACKWARD)).isEqualTo(BACKWARD)
        assertThat(StoryNeighborWindow.direction(null, pos(0, 2), FORWARD)).isEqualTo(FORWARD)
    }

    @Test
    fun `les atterrissages d'auteur sont l'entree du suivant puis la derniere du precedent`() {
        val groups = listOf(StoryGroupShape(2, 0), StoryGroupShape(3, 1), StoryGroupShape(4, 0))
        assertThat(StoryNeighborWindow.authorSwipeLandings(1, groups)).containsExactly(pos(2, 0), pos(0, 1)).inOrder()
    }
}
