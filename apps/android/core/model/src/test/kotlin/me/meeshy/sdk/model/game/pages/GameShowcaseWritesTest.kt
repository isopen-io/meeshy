package me.meeshy.sdk.model.game.pages

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameVisibility
import me.meeshy.sdk.model.game.ShowcaseVisibility
import org.junit.Test

class GameShowcaseWritesTest {

    private val order = listOf("a", "b", "c")

    @Test
    fun `monter ou descendre echange deux voisins`() {
        assertThat(GameShowcaseRules.moved(order, index = 1, delta = -1)).containsExactly("b", "a", "c").inOrder()
        assertThat(GameShowcaseRules.moved(order, index = 1, delta = 1)).containsExactly("a", "c", "b").inOrder()
    }

    @Test
    fun `au bord de la vitrine le geste n a pas de sens et rend la meme suite`() {
        assertThat(GameShowcaseRules.moved(order, index = 0, delta = -1)).isSameInstanceAs(order)
        assertThat(GameShowcaseRules.moved(order, index = 2, delta = 1)).isSameInstanceAs(order)
        assertThat(GameShowcaseRules.moved(order, index = 9, delta = -1)).isSameInstanceAs(order)
    }

    @Test
    fun `le nom de joute choisi reste ferme tant que le contrat ne l ouvre pas`() {
        assertThat(GameLeagueRules.CHOSEN_PSEUDONYM_OPEN).isFalse()
    }

    @Test
    fun `une facette ne porte que son niveau et laisse les trois autres absentes`() {
        VisibilityField.entries.forEach { field ->
            val request = GameVisibilityEdit.request("req-12345678", field, ShowcaseVisibility.Everyone)
            val sent = listOf(request.showcase, request.rank, request.treasury, request.atlas)
            assertThat(sent.count { it != null }).isEqualTo(1)
            assertThat(sent.single { it != null }).isEqualTo(ShowcaseVisibility.Everyone)
        }
    }

    @Test
    fun `lire et poser une facette ne touchent que celle-la`() {
        val me = ShowcaseVisibility.Me
        val visibility = GameVisibility(showcase = me, rank = me, treasury = me, atlas = me)

        val next = GameVisibilityEdit.with(visibility, VisibilityField.Atlas, ShowcaseVisibility.Friends)

        assertThat(GameVisibilityEdit.read(next, VisibilityField.Atlas)).isEqualTo(ShowcaseVisibility.Friends)
        assertThat(next.copy(atlas = me)).isEqualTo(visibility)
    }
}
