package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostDetailHeaderRevealTest {
    @Test
    fun `the chip stays hidden while the inline author block is on screen`() {
        assertThat(PostDetailHeaderReveal.revealed(authorBlockBottom = 180f, viewportTop = 100f)).isFalse()
    }

    @Test
    fun `the chip appears as soon as the author block leaves the top`() {
        assertThat(PostDetailHeaderReveal.revealed(authorBlockBottom = 100f, viewportTop = 100f)).isTrue()
        assertThat(PostDetailHeaderReveal.revealed(authorBlockBottom = -40f, viewportTop = 100f)).isTrue()
    }

    @Test
    fun `scrolling back up hides it again`() {
        assertThat(PostDetailHeaderReveal.revealed(authorBlockBottom = 101f, viewportTop = 100f)).isFalse()
    }
}
