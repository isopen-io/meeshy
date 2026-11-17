package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * #18927 — the list's sweeps are shared PER ACCOUNT TICKET: a caller of the account that just signed in never joins the
 * sweep of the one that left (its fence would refuse every write of it, and the caller would get nothing); the lanes of
 * keys whose passes settled are dropped.
 */
class KeyedSharedPassTest {

    @Test
    fun `callers of two keys run one pass per key, each key's callers sharing their own`() = runTest {
        val started = mutableListOf<String>()
        val gate = CompletableDeferred<Unit>()
        val pass = KeyedSharedPass<String> { key ->
            started += key
            gate.await()
        }

        val calls = listOf("A", "A", "B", "B").map { key -> async { pass.join(key) } }
        runCurrent()
        gate.complete(Unit)
        calls.awaitAll()

        assertThat(started).containsExactly("A", "B")
    }

    @Test
    fun `the next account's caller does not wait for the pass of the account that left`() = runTest {
        val left = CompletableDeferred<Unit>()
        val started = mutableListOf<String>()
        val pass = KeyedSharedPass<String> { key ->
            started += key
            if (key == "left") left.await()
        }

        val leaving = async { pass.join("left") }
        runCurrent()
        pass.catchUp("next")

        assertThat(started).containsExactly("left", "next").inOrder()
        left.complete(Unit)
        leaving.await()
    }

    @Test
    fun `a lane whose passes settled is dropped when another key opens one`() = runTest {
        val pass = KeyedSharedPass<String> { }

        pass.join("A")
        pass.join("B")

        assertThat(pass.laneCount).isEqualTo(1)
    }

    @Test
    fun `a lane still at work is kept`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val pass = KeyedSharedPass<String> { key -> if (key == "A") gate.await() }

        val running = async { pass.join("A") }
        runCurrent()
        pass.join("B")

        assertThat(pass.laneCount).isEqualTo(2)
        gate.complete(Unit)
        running.await()
    }
}
