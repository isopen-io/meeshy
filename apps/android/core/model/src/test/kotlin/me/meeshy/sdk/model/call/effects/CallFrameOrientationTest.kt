package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameOrientationTest {
    @Test
    fun `a quarter turn clockwise sends the top-left corner to the top-right`() {
        assertThat(CallFrameOrientation.upright(0f, 0f, 90)).isEqualTo(1f to 0f)
        assertThat(CallFrameOrientation.upright(0f, 1f, 90)).isEqualTo(0f to 0f)
        assertThat(CallFrameOrientation.upright(0f, 0f, 270)).isEqualTo(0f to 1f)
        assertThat(CallFrameOrientation.upright(0f, 0f, 180)).isEqualTo(1f to 1f)
        assertThat(CallFrameOrientation.upright(0.2f, 0.7f, 0)).isEqualTo(0.2f to 0.7f)
    }

    @Test
    fun `buffer is the inverse of upright for every rotation`() {
        listOf(0, 90, 180, 270, -90, 450).forEach { rotation ->
            listOf(0.25f to 0.75f, 0f to 1f, 0.5f to 0.125f).forEach { (u, v) ->
                val (x, y) = CallFrameOrientation.upright(u, v, rotation)
                assertThat(CallFrameOrientation.buffer(x, y, rotation)).isEqualTo(u to v)
            }
        }
    }

    @Test
    fun `a quarter turn swaps the upright size`() {
        assertThat(CallFrameOrientation.uprightSize(256, 144, 90)).isEqualTo(144 to 256)
        assertThat(CallFrameOrientation.uprightSize(256, 144, 180)).isEqualTo(256 to 144)
        assertThat(CallFrameOrientation.normalised(-90)).isEqualTo(270)
    }
}

class CallFrameOrientationPixelTest {
    private fun unpack(p: Int) = (p ushr 16) to (p and 0xFFFF)

    @Test
    fun `the pixel law agrees with the normalised law on the corners`() {
        val (bw, bh) = 4 to 2
        listOf(0, 90, 180, 270).forEach { rotation ->
            val (uw, uh) = CallFrameOrientation.uprightSize(bw, bh, rotation)
            listOf(0 to 0, uw - 1 to 0, 0 to uh - 1, uw - 1 to uh - 1).forEach { (x, y) ->
                val (bx, by) = unpack(CallFrameOrientation.bufferPixel(x, y, bw, bh, rotation))
                val centre = CallFrameOrientation.buffer((x + 0.5f) / uw, (y + 0.5f) / uh, rotation)
                assertThat(bx).isEqualTo((centre.first * bw).toInt())
                assertThat(by).isEqualTo((centre.second * bh).toInt())
            }
        }
    }
}
