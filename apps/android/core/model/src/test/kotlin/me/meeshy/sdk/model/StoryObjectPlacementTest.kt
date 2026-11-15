package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryObjectPlacement.Point
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryObjectPlacementTest {

    private fun cascade(count: Int): List<Point> =
        (1..count).fold(emptyList()) { placed, _ -> placed + StoryObjectPlacement.next(placed) }

    @Test
    fun `le premier objet d une scene vide reste au centre`() {
        assertThat(StoryObjectPlacement.next(emptyList())).isEqualTo(Point(0.5, 0.5))
    }

    @Test
    fun `les suivants cascadent par pas de 0,06`() {
        val placed = cascade(3)
        assertThat(placed[1].x).isWithin(1e-9).of(0.56)
        assertThat(placed[1].y).isWithin(1e-9).of(0.56)
        assertThat(placed[2].x).isWithin(1e-9).of(0.62)
    }

    @Test
    fun `un objet loin du centre ne decale pas le suivant`() {
        assertThat(StoryObjectPlacement.next(listOf(Point(0.2, 0.9)))).isEqualTo(Point(0.5, 0.5))
    }

    @Test
    fun `au bord la cascade revient en diagonale vers le haut gauche`() {
        val placed = cascade(8)
        assertThat(placed[5].x).isWithin(1e-9).of(0.8)
        assertThat(placed[6].x).isWithin(1e-9).of(0.44)
        assertThat(placed[6].y).isWithin(1e-9).of(0.44)
        assertThat(placed[7].x).isWithin(1e-9).of(0.38)
    }

    @Test
    fun `aucune position ne sort de la marge meme tres charge`() {
        cascade(40).forEach {
            assertThat(it.x).isAtLeast(StoryObjectPlacement.MARGIN)
            assertThat(it.x).isAtMost(1 - StoryObjectPlacement.MARGIN)
            assertThat(it.y).isAtLeast(StoryObjectPlacement.MARGIN)
            assertThat(it.y).isAtMost(1 - StoryObjectPlacement.MARGIN)
        }
    }
}
