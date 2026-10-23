package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSelfTileMemoryTest {
    @Test
    fun `an unknown call is at the standard scale`() {
        assertThat(CallSelfTileMemory().scale("c1")).isEqualTo(CallSelfTileScale.Standard)
        assertThat(CallSelfTileMemory().scale(null)).isEqualTo(CallSelfTileScale.Standard)
    }

    @Test
    fun `the scale is remembered for the call that set it`() {
        val memory = CallSelfTileMemory().apply { remember(CallSelfTileScale.X3, "c1") }
        assertThat(memory.scale("c1")).isEqualTo(CallSelfTileScale.X3)
    }

    @Test
    fun `another call starts again at the standard scale`() {
        val memory = CallSelfTileMemory().apply { remember(CallSelfTileScale.X1, "c1") }
        assertThat(memory.scale("c2")).isEqualTo(CallSelfTileScale.Standard)
    }

    @Test
    fun `a call without an id remembers nothing`() {
        val memory = CallSelfTileMemory().apply { remember(CallSelfTileScale.X1, "c1") }
        memory.remember(CallSelfTileScale.X3, null)
        assertThat(memory.scale("c1")).isEqualTo(CallSelfTileScale.X1)
    }
}
