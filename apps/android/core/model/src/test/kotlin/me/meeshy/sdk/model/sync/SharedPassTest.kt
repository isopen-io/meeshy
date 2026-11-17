package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * #18927 — one pass at a time, shared: a caller that arrives during a pass joins it; a catch-up asked during a pass gets
 * exactly ONE more pass, started after it; a caller cancelled while it waits leaves the pass to finish.
 */
class SharedPassTest {

    /** A work the test releases pass by pass, counting how many passes started. */
    private class GatedWork {
        var started = 0
        val gates = mutableListOf<CompletableDeferred<Unit>>()

        suspend fun run() {
            started += 1
            val gate = CompletableDeferred<Unit>().also { gates += it }
            gate.await()
        }

        fun releaseAll() = gates.forEach { it.complete(Unit) }
    }

    @Test
    fun `two concurrent callers share one pass`() = runTest {
        val work = GatedWork()
        val pass = SharedPass(work::run)

        val first = async { pass.join() }
        val second = async { pass.join() }
        runCurrent()
        work.releaseAll()
        first.await()
        second.await()

        assertThat(work.started).isEqualTo(1)
    }

    @Test
    fun `a catch-up asked during a pass gets exactly one more pass, shared by every catch-up`() = runTest {
        val work = GatedWork()
        val pass = SharedPass(work::run)

        val running = async { pass.join() }
        runCurrent()
        val catchUps = List(3) { async { pass.catchUp() } }
        runCurrent()
        assertThat(work.started).isEqualTo(1)

        work.releaseAll()
        runCurrent()
        assertThat(work.started).isEqualTo(2)
        work.releaseAll()
        running.await()
        catchUps.forEach { it.await() }

        assertThat(work.started).isEqualTo(2)
    }

    @Test
    fun `a plain caller during a pass joins it, no extra pass`() = runTest {
        val work = GatedWork()
        val pass = SharedPass(work::run)

        val running = async { pass.join() }
        runCurrent()
        val joining = async { pass.join() }
        runCurrent()
        work.releaseAll()
        running.await()
        joining.await()

        assertThat(work.started).isEqualTo(1)
    }

    @Test
    fun `a caller cancelled while it waits leaves the shared pass to finish`() = runTest {
        val work = GatedWork()
        var finished = false
        val pass = SharedPass {
            work.run()
            finished = true
        }

        val waiting = launch { pass.join() }
        runCurrent()
        waiting.cancel()
        runCurrent()
        work.releaseAll()
        runCurrent()

        assertThat(finished).isTrue()
    }

    @Test
    fun `once settled, the next call starts a new pass`() = runTest {
        val work = GatedWork()
        val pass = SharedPass(work::run)

        val first = async { pass.join() }
        runCurrent()
        work.releaseAll()
        first.await()
        val second = async { pass.join() }
        runCurrent()
        work.releaseAll()
        second.await()

        assertThat(work.started).isEqualTo(2)
    }

    @Test
    fun `a failed pass reaches every caller that waits for it`() = runTest {
        val pass = SharedPass { error("réseau") }

        val outcome = runCatching { pass.join() }

        assertThat(outcome.exceptionOrNull()).hasMessageThat().isEqualTo("réseau")
    }
}
