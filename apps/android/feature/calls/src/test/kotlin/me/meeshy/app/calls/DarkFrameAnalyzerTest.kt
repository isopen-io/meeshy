package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.nio.ByteBuffer

class DarkFrameAnalyzerTest {

    private fun plane(luma: Int, side: Int = 16): ByteBuffer =
        ByteBuffer.allocateDirect(side * side).also { buffer -> repeat(side * side) { buffer.put(it, luma.toByte()) } }

    private fun rig(): Pair<DarkFrameAnalyzer, MutableList<Boolean>> {
        val events = mutableListOf<Boolean>()
        return DarkFrameAnalyzer(onDarkChanged = { events += it }) to events
    }

    @Test
    fun `a few dark frames do not trip the detector`() {
        val (analyzer, events) = rig()
        repeat(29) { analyzer.onFrame(plane(2), 16, 16) }
        assertThat(events).isEmpty()
    }

    @Test
    fun `thirty dark frames report the dark once, a bright frame releases it at once`() {
        val (analyzer, events) = rig()
        repeat(45) { analyzer.onFrame(plane(2), 16, 16) }
        analyzer.onFrame(plane(180), 16, 16)
        assertThat(events).containsExactly(true, false).inOrder()
    }

    @Test
    fun `a degenerate frame is skipped instead of reading pitch black`() {
        val (analyzer, events) = rig()
        repeat(40) { analyzer.onFrame(ByteBuffer.allocateDirect(4), 16, 16) }
        assertThat(events).isEmpty()
    }

    @Test
    fun `reset hands the light back when the camera stops`() {
        val (analyzer, events) = rig()
        repeat(30) { analyzer.onFrame(plane(0), 16, 16) }
        analyzer.reset()
        assertThat(events).containsExactly(true, false).inOrder()
    }
}
