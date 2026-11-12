package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPillMotionTest {
    @Test
    fun `the glass unfolds in 250 ms with its scale`() {
        assertThat(CallPillMotion.millis(reduceMotion = false)).isEqualTo(250)
        assertThat(CallPillMotion.scalesOnUnfold(reduceMotion = false)).isTrue()
    }

    @Test
    fun `reduce motion keeps a 200 ms fade of the glass and drops the scale (P13_12)`() {
        assertThat(CallPillMotion.millis(reduceMotion = true)).isEqualTo(200)
        assertThat(CallPillMotion.scalesOnUnfold(reduceMotion = true)).isFalse()
    }
}
