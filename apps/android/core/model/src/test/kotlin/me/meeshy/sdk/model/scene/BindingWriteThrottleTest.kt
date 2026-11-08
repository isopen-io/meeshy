package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BindingWriteThrottleTest {

    private class Harness {
        var now = 0L
        val written = mutableListOf<Int>()
        var scheduledDelay: Long? = null
        private var scheduledRun: (() -> Unit)? = null
        var cancelled = 0

        val throttle = BindingWriteThrottle<Int>(
            write = { written += it },
            clock = { now },
            schedule = { delay, run ->
                scheduledDelay = delay
                scheduledRun = run
                val cancel: () -> Unit = { cancelled++; scheduledRun = null }
                cancel
            },
        )

        fun fireTrailing() {
            val run = scheduledRun
            scheduledRun = null
            run?.invoke()
        }
    }

    @Test
    fun `la premiere valeur part tout de suite`() {
        val h = Harness()
        h.throttle.submit(1)
        assertThat(h.written).containsExactly(1)
    }

    @Test
    fun `une rafale ne garde que la derniere valeur pour le front descendant`() {
        val h = Harness()
        h.throttle.submit(1)
        h.now = 10
        h.throttle.submit(2)
        h.now = 20
        h.throttle.submit(3)
        assertThat(h.written).containsExactly(1)
        assertThat(h.scheduledDelay).isEqualTo(24L)
        h.now = 34
        h.fireTrailing()
        assertThat(h.written).containsExactly(1, 3).inOrder()
    }

    @Test
    fun `apres l'intervalle de 30 Hz la valeur repart immediatement`() {
        val h = Harness()
        h.throttle.submit(1)
        h.now = BindingWriteCadence.MINIMUM_INTERVAL_MS
        h.throttle.submit(2)
        assertThat(h.written).containsExactly(1, 2).inOrder()
    }

    @Test
    fun `flush ecrit la valeur en attente et rend vrai, puis rend faux`() {
        val h = Harness()
        h.throttle.submit(1)
        h.now = 5
        h.throttle.submit(2)
        assertThat(h.throttle.flush()).isTrue()
        assertThat(h.written).containsExactly(1, 2).inOrder()
        assertThat(h.throttle.flush()).isFalse()
        assertThat(h.cancelled).isEqualTo(1)
    }

    @Test
    fun `une ecriture immediate annule le front de queue arme`() {
        val h = Harness()
        h.throttle.submit(1)
        h.now = 5
        h.throttle.submit(2)
        h.now = 100
        h.throttle.submit(3)
        assertThat(h.written).containsExactly(1, 3).inOrder()
        assertThat(h.cancelled).isEqualTo(1)
    }

    @Test
    fun `la decision differe du reste de l'intervalle`() {
        assertThat(BindingWriteCadence.decide(now = 10, lastWrite = 0))
            .isEqualTo(BindingWriteCadence.Decision.Deferred(by = 24))
        assertThat(BindingWriteCadence.decide(now = 0, lastWrite = null))
            .isEqualTo(BindingWriteCadence.Decision.WriteNow)
    }
}
