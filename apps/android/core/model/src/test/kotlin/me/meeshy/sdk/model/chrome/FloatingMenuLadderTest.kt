package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir de `RootFloatingChrome.menuLadder` et de `menuAnimation` iOS. */
class FloatingMenuLadderTest {

    @Test
    fun `the first rung sits just past the button, the next ones a disc and a gap further`() {
        val first = FloatingMenuLadder.itemCenterY(0, menuCenterY = 300f, opensDownward = true)
        val second = FloatingMenuLadder.itemCenterY(1, menuCenterY = 300f, opensDownward = true)
        assertThat(first).isEqualTo(300f + 26f + 12f + 23f)
        assertThat(second - first).isEqualTo(46f + 12f)
    }

    @Test
    fun `an upward ladder mirrors the downward one`() {
        val up = FloatingMenuLadder.itemCenterY(2, menuCenterY = 600f, opensDownward = false)
        val down = FloatingMenuLadder.itemCenterY(2, menuCenterY = 600f, opensDownward = true)
        assertThat(600f - up).isEqualTo(down - 600f)
    }

    @Test
    fun `the extent is one disc and one gap per rung`() {
        assertThat(FloatingMenuLadder.extent(6)).isEqualTo(6 * 58f)
        assertThat(FloatingMenuLadder.extent(-1)).isEqualTo(0f)
    }

    @Test
    fun `rungs appear staggered by 40 ms on opening and close all at once`() {
        assertThat((0 until 6).map { FloatingMenuLadder.delayMillis(it, opening = true) })
            .containsExactly(0L, 40L, 80L, 120L, 160L, 200L).inOrder()
        assertThat(FloatingMenuLadder.delayMillis(5, opening = false)).isEqualTo(0L)
    }

    @Test
    fun `a hidden rung is small, transparent and turned by minus 30 degrees`() {
        val hidden = FloatingMenuLadder.frame(0f, reduceMotion = false)
        assertThat(hidden).isEqualTo(FloatingMenuLadder.ItemFrame(scale = 0.3f, alpha = 0f, rotationDegrees = -30f))
        assertThat(FloatingMenuLadder.frame(1f, reduceMotion = false))
            .isEqualTo(FloatingMenuLadder.ItemFrame(scale = 1f, alpha = 1f, rotationDegrees = 0f))
    }

    @Test
    fun `the spring overshoot grows the rung but never its opacity`() {
        val overshoot = FloatingMenuLadder.frame(1.1f, reduceMotion = false)
        assertThat(overshoot.scale).isGreaterThan(1f)
        assertThat(overshoot.alpha).isEqualTo(1f)
    }

    @Test
    fun `reduce motion opens with a plain fade - no rotation, no scale`() {
        val halfway = FloatingMenuLadder.frame(0.5f, reduceMotion = true)
        assertThat(halfway).isEqualTo(FloatingMenuLadder.ItemFrame(scale = 1f, alpha = 0.5f, rotationDegrees = 0f))
    }
}
