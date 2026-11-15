package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfilePostsRenderWindowTest {

    @Test
    fun `la fenetre commence a cinq cartes`() {
        assertThat(ProfilePostsRenderWindow().size).isEqualTo(5)
    }

    @Test
    fun `elle ne montre jamais plus que ce qui existe`() {
        assertThat(ProfilePostsRenderWindow().visibleCount(filteredCount = 3)).isEqualTo(3)
        assertThat(ProfilePostsRenderWindow().visibleCount(filteredCount = 40)).isEqualTo(5)
    }

    @Test
    fun `une carte a trois ou moins de la fin declenche l'anticipation`() {
        val window = ProfilePostsRenderWindow()
        assertThat(window.isNearTail(index = 1, visibleCount = 5)).isFalse()
        assertThat(window.isNearTail(index = 2, visibleCount = 5)).isTrue()
        assertThat(window.isNearTail(index = 4, visibleCount = 5)).isTrue()
    }

    @Test
    fun `les declencheurs d'un meme instant se coalescent en une seule progression`() {
        val first = ProfilePostsRenderWindow().schedulingReveal()
        assertThat(first).isNotNull()
        assertThat(first!!.schedulingReveal()).isNull()
        assertThat(first.revealSettled().schedulingReveal()).isNotNull()
    }

    @Test
    fun `elle grandit par pas de cinq jusqu'au nombre de cartes filtrees`() {
        val grown = ProfilePostsRenderWindow().grown(filteredCount = 40)
        assertThat(grown.size).isEqualTo(10)
        assertThat(ProfilePostsRenderWindow(size = 8).grown(filteredCount = 9).size).isEqualTo(9)
    }

    @Test
    fun `il reste a reveler tant que la fenetre est sous le nombre de cartes filtrees`() {
        assertThat(ProfilePostsRenderWindow().hasMoreToRender(filteredCount = 6)).isTrue()
        assertThat(ProfilePostsRenderWindow().hasMoreToRender(filteredCount = 5)).isFalse()
    }

    @Test
    fun `le changement de filtre remet la fenetre a zero`() {
        val grown = ProfilePostsRenderWindow(size = 25, revealScheduled = true)
        assertThat(grown.reset()).isEqualTo(ProfilePostsRenderWindow())
    }
}
