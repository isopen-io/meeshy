package me.meeshy.ui.component.imageedit

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LatestWinsRenderLoopTest {
    private class Rig(scope: TestScope) {
        val rendered = java.util.Collections.synchronizedList(mutableListOf<Int>())
        val delivered = mutableListOf<Pair<Int, String>>()
        val loop = LatestWinsRenderLoop<Int, String>(
            scope = scope,
            renderDispatcher = StandardTestDispatcher(scope.testScheduler),
            render = { request -> rendered += request; "look-$request" },
            deliver = { request, output -> delivered += request to output },
        )
    }

    @Test
    fun `une demande seule est rendue puis livree`() = runTest {
        val rig = Rig(this)
        rig.loop.submit(1)
        advanceUntilIdle()
        assertThat(rig.delivered).containsExactly(1 to "look-1")
        assertThat(rig.loop.isBusy).isFalse()
    }

    @Test
    fun `les demandes arrivees pendant un rendu en vol se replient sur la derniere`() = runTest {
        val rendered = java.util.Collections.synchronizedList(mutableListOf<Int>())
        val delivered = mutableListOf<Int>()
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        val executor = Executors.newSingleThreadExecutor()
        val loop = LatestWinsRenderLoop<Int, Int>(
            scope = this,
            renderDispatcher = executor.asCoroutineDispatcher(),
            render = { r ->
                rendered += r
                if (r == 1) {
                    started.countDown()
                    release.await(5, TimeUnit.SECONDS)
                }
                r
            },
            deliver = { _, out -> delivered += out },
        )
        loop.submit(1)
        testScheduler.runCurrent()
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue()
        loop.submit(2)
        loop.submit(3)
        loop.submit(4)
        assertThat(loop.isBusy).isTrue()
        release.countDown()
        val deadline = System.currentTimeMillis() + 5_000
        while (delivered.size < 2 && System.currentTimeMillis() < deadline) {
            testScheduler.advanceUntilIdle()
            Thread.sleep(5)
        }
        executor.shutdown()
        assertThat(rendered).containsExactly(1, 4).inOrder()
        assertThat(delivered).containsExactly(1, 4).inOrder()
    }

    @Test
    fun `la livraison respecte l ordre de demande`() = runTest {
        val rig = Rig(this)
        rig.loop.submit(10)
        advanceUntilIdle()
        rig.loop.submit(20)
        advanceUntilIdle()
        assertThat(rig.delivered.map { it.first }).containsExactly(10, 20).inOrder()
    }

    @Test
    fun `discardPending abandonne la demande en attente`() = runTest {
        val rig = Rig(this)
        rig.loop.submit(1)
        rig.loop.submit(2)
        rig.loop.discardPending()
        advanceUntilIdle()
        assertThat(rig.delivered).isEmpty()
        assertThat(rig.loop.isBusy).isFalse()
    }

    @Test
    fun `un rendu en echec ne bloque pas la boucle`() = runTest {
        val delivered = mutableListOf<Int>()
        val loop = LatestWinsRenderLoop<Int, Int>(
            scope = this,
            renderDispatcher = StandardTestDispatcher(testScheduler),
            render = { if (it == 1) error("boom") else it },
            deliver = { _, out -> delivered += out },
        )
        loop.submit(1)
        advanceUntilIdle()
        loop.submit(2)
        advanceUntilIdle()
        assertThat(delivered).containsExactly(2)
        assertThat(loop.isBusy).isFalse()
    }
}
