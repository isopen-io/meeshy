package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import org.junit.Test

class OrderedDeliveryLaneTest {

    @Test
    fun `les travaux s'executent dans l'ordre de mise en file`() {
        val lane = OrderedDeliveryLane(Dispatchers.Default)
        val seen = java.util.Collections.synchronizedList(mutableListOf<Int>())
        val done = CountDownLatch(1)

        repeat(1_000) { n -> lane.deliver { seen += n } }
        lane.deliver { done.countDown() }

        assertThat(done.await(5, TimeUnit.SECONDS)).isTrue()
        assertThat(seen).containsExactlyElementsIn((0 until 1_000).toList()).inOrder()
        lane.close()
    }

    @Test
    fun `une seule voie, jamais deux travaux en meme temps`() {
        val lane = OrderedDeliveryLane(Dispatchers.Default)
        val running = AtomicInteger(0)
        val peak = AtomicInteger(0)
        val done = CountDownLatch(1)

        repeat(200) {
            lane.deliver {
                peak.accumulateAndGet(running.incrementAndGet()) { a, b -> maxOf(a, b) }
                Thread.yield()
                running.decrementAndGet()
            }
        }
        lane.deliver { done.countDown() }

        assertThat(done.await(5, TimeUnit.SECONDS)).isTrue()
        assertThat(peak.get()).isEqualTo(1)
        lane.close()
    }

    @Test
    fun `un travail qui leve n'arrete pas la voie`() {
        val lane = OrderedDeliveryLane(Dispatchers.Default)
        val done = CountDownLatch(1)

        lane.deliver { error("boom") }
        lane.deliver { done.countDown() }

        assertThat(done.await(5, TimeUnit.SECONDS)).isTrue()
        lane.close()
    }

    @Test
    fun `une voie fermee refuse le travail`() {
        val lane = OrderedDeliveryLane(Dispatchers.Default)

        lane.close()

        assertThat(lane.deliver { }).isFalse()
    }
}
