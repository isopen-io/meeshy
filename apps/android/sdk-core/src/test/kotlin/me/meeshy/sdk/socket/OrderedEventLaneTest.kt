package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Test

class OrderedEventLaneTest {

    @Test
    fun `works of one conversation run one at a time in submission order`() = runTest {
        val lane = OrderedEventLane(backgroundScope)
        val seen = mutableListOf<String>()

        lane.submit("c1") {
            delay(100)
            seen += "message:new"
        }
        lane.submit("c1") { seen += "countdown-started" }
        lane.submit("c1") { seen += "attachment:reaction-added" }
        lane.barrier("c1")

        assertThat(seen).containsExactly("message:new", "countdown-started", "attachment:reaction-added").inOrder()
    }

    @Test
    fun `an enrichment never overtakes a slow message arrival`() = runTest {
        val lane = OrderedEventLane(backgroundScope)
        val rowLanded = CompletableDeferred<Unit>()
        val seen = mutableListOf<String>()

        lane.submit("c1") {
            rowLanded.await()
            seen += "row"
        }
        lane.submit("c1") { seen += "delta" }
        advanceUntilIdle()
        assertThat(seen).isEmpty()

        rowLanded.complete(Unit)
        lane.barrier("c1")
        assertThat(seen).containsExactly("row", "delta").inOrder()
    }

    @Test
    fun `two conversations do not wait for each other`() = runTest {
        val lane = OrderedEventLane(backgroundScope)
        val blocked = CompletableDeferred<Unit>()
        val seen = mutableListOf<String>()

        lane.submit("c1") {
            blocked.await()
            seen += "c1"
        }
        lane.submit("c2") { seen += "c2" }
        lane.barrier("c2")

        assertThat(seen).containsExactly("c2")
        blocked.complete(Unit)
        lane.barrier("c1")
        assertThat(seen).containsExactly("c2", "c1").inOrder()
    }

    @Test
    fun `a failing work is isolated and the lane keeps going`() = runTest {
        val lane = OrderedEventLane(backgroundScope)
        val seen = mutableListOf<String>()

        lane.submit("c1") { error("boom") }
        lane.submit("c1") { seen += "after" }
        lane.barrier("c1")

        assertThat(seen).containsExactly("after")
    }

    @Test
    fun `a cancelled scope refuses new works`() = runTest {
        val lane = OrderedEventLane(CoroutineScope(Job().apply { cancel() }))

        assertThat(lane.submit("c1") { }).isFalse()
    }
}
