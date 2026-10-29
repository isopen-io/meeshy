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
