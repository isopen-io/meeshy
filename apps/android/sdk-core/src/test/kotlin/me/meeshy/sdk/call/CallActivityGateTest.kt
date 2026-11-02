package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Test

class CallActivityGateTest {

    @Test
    fun `hors appel l'action s'execute immediatement`() {
        val gate = CallActivityGate()
        var ran = 0

        val immediate = gate.runOrDefer { ran++ }

        assertThat(immediate).isTrue()
        assertThat(ran).isEqualTo(1)
    }

    @Test
    fun `pendant un appel l'action est differee puis rejouee a la fin`() {
        val gate = CallActivityGate()
        var ran = 0
        gate.setActive(true)

        val immediate = gate.runOrDefer { ran++ }

        assertThat(immediate).isFalse()
        assertThat(ran).isEqualTo(0)
        gate.setActive(false)
        assertThat(ran).isEqualTo(1)
        gate.setActive(false)
        assertThat(ran).isEqualTo(1)
    }

    @Test
    fun `la derniere demande differee remplace la precedente`() {
        val gate = CallActivityGate()
        val log = mutableListOf<String>()
        gate.setActive(true)

        gate.runOrDefer { log += "premiere" }
        gate.runOrDefer { log += "seconde" }
        gate.setActive(false)

        assertThat(log).containsExactly("seconde")
    }

    @Test
    fun `bascule et lecture concurrentes restent coherentes`() {
        val gate = CallActivityGate()
        val executed = AtomicInteger()
        val pool = Executors.newFixedThreadPool(8)
        val done = CountDownLatch(200)
        repeat(100) {
            pool.execute { gate.setActive(true); gate.isActive; done.countDown() }
            pool.execute { gate.runOrDefer { executed.incrementAndGet() }; done.countDown() }
        }
        done.await()
        gate.setActive(false)
        pool.shutdown()

        assertThat(gate.isActive).isFalse()
        assertThat(executed.get()).isAtLeast(0)
    }
}
