package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13653 — la tête du fil (rail de stories, puis porte du composeur) précède les posts dans la MÊME liste :
 * l'index d'une ligne de la liste n'est plus celui du post. Le préchargement des médias lisait
 * `posts[firstVisibleItemIndex]` et annonçait donc le post SUIVANT comme visible.
 */
class FeedListLayoutTest {

    @Test
    fun `la tete du fil visible designe le premier post`() {
        (0 until FeedListLayout.HEAD_ITEMS).forEach { headIndex ->
            assertThat(FeedListLayout.postIndexAt(headIndex)).isEqualTo(0)
        }
    }

    @Test
    fun `une ligne de post designe son post, jamais le suivant`() {
        assertThat(FeedListLayout.postIndexAt(FeedListLayout.HEAD_ITEMS)).isEqualTo(0)
        assertThat(FeedListLayout.postIndexAt(FeedListLayout.HEAD_ITEMS + 3)).isEqualTo(3)
    }

    @Test
    fun `la tete du fil est le rail puis la porte du composeur`() {
        assertThat(FeedListLayout.HEAD_ITEMS).isEqualTo(2)
    }
}
