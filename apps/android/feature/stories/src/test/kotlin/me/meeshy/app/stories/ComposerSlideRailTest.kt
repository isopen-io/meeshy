package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundValue
import org.junit.Test

class ComposerSlideRailTest {
    @Test
    fun `while a tile is carried right the tiles it crosses step one slot left, the others stay`() {
        val shifts = (0..4).map { slotShift(index = it, dragFrom = 1, target = 3, slotPx = 33f, rtl = false) }
        assertThat(shifts).containsExactly(0f, 0f, -33f, -33f, 0f).inOrder()
    }

    @Test
    fun `while a tile is carried left the tiles it crosses step one slot right`() {
        val shifts = (0..4).map { slotShift(index = it, dragFrom = 3, target = 1, slotPx = 33f, rtl = false) }
        assertThat(shifts).containsExactly(0f, 33f, 33f, 0f, 0f).inOrder()
    }

    @Test
    fun `the steps mirror in a right to left layout and nothing moves when no tile is carried`() {
        assertThat(slotShift(index = 2, dragFrom = 1, target = 2, slotPx = 33f, rtl = true)).isEqualTo(33f)
        assertThat(slotShift(index = 2, dragFrom = -1, target = -1, slotPx = 33f, rtl = false)).isEqualTo(0f)
    }

    @Test
    fun `a scene asks before it is deleted only when it holds something`() {
        assertThat(StorySlide(id = "a").holdsMatter()).isFalse()
        assertThat(StorySlide(id = "a", text = "  ").holdsMatter()).isFalse()
        assertThat(StorySlide(id = "a", text = "Hi").holdsMatter()).isTrue()
        assertThat(StorySlide(id = "a", mediaIds = listOf("m")).holdsMatter()).isTrue()
        assertThat(StorySlide(id = "a", background = StoryBackgroundValue.Hex("#FF0000")).holdsMatter()).isTrue()
    }
}
