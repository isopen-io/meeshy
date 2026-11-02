package me.meeshy.ui.component.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EdgeBackGateTest {

    @Test
    fun `a fresh gate is open`() {
        assertThat(EdgeBackGate().isOpen).isTrue()
    }

    @Test
    fun `two screens that hold it do not reopen each other when one leaves`() {
        val gate = EdgeBackGate()
        gate.hold()
        gate.hold()
        gate.release()
        assertThat(gate.isOpen).isFalse()
        gate.release()
        assertThat(gate.isOpen).isTrue()
    }

    @Test
    fun `releasing more than was held never goes negative`() {
        val gate = EdgeBackGate()
        gate.release()
        gate.hold()
        assertThat(gate.isOpen).isFalse()
    }
}
