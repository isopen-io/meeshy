package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import java.util.Collections
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Test

class OrderedEventLaneTest {
    private fun scope() = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Test
    fun `une voie execute ses travaux un par un dans l'ordre de soumission`() = runBlocking {
        val scope = scope()
        val lane = OrderedEventLane(scope)
        val log = Collections.synchronizedList(mutableListOf<String>())
        val gate = CompletableDeferred<Unit>()
        lane.submit(OrderedEventLane.Family.MESSAGES) { gate.await(); log += "new" }
        lane.submit(OrderedEventLane.Family.MESSAGES) { log += "edited" }
        gate.complete(Unit)
        lane.barrier(OrderedEventLane.Family.MESSAGES)
        assertThat(log).containsExactly("new", "edited").inOrder()
        scope.cancel()
    }

    @Test
    fun `une famille bloquee ne retient pas les autres`() = runBlocking {
        val scope = scope()
        val lane = OrderedEventLane(scope)
        val blocked = CompletableDeferred<Unit>()
        lane.submit(OrderedEventLane.Family.CATCH_UP) { blocked.await() }
        val ran = CompletableDeferred<Unit>()
        lane.submit(OrderedEventLane.Family.MESSAGES) { ran.complete(Unit) }
        ran.await()
        blocked.complete(Unit)
        scope.cancel()
    }

    @Test
    fun `un travail qui leve n'arrete pas la voie`() = runBlocking {
        val scope = scope()
        val lane = OrderedEventLane(scope)
        val ran = CompletableDeferred<Unit>()
        lane.submit(OrderedEventLane.Family.MESSAGES) { error("boom") }
        lane.submit(OrderedEventLane.Family.MESSAGES) { ran.complete(Unit) }
        ran.await()
        scope.cancel()
    }

    @Test
    fun `apres close plus rien ne s'accepte`() = runBlocking {
        val scope = scope()
        val lane = OrderedEventLane(scope)
        lane.close()
        assertThat(lane.submit(OrderedEventLane.Family.MESSAGES) {}).isFalse()
        lane.barrier(OrderedEventLane.Family.MESSAGES)
        scope.cancel()
    }
}
