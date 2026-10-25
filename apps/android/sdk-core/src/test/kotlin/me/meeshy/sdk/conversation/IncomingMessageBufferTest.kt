package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class IncomingMessageBufferTest {

    private fun message(id: String, conversationId: String = "c1", content: String = "salut") =
        ApiMessage(id = id, conversationId = conversationId, content = content)

    private fun TestScope.buffer(batches: MutableList<List<ApiMessage>>, fail: Boolean = false) =
        IncomingMessageBuffer(backgroundScope, windowMillis = WINDOW) { batch ->
            batches += batch
            if (fail) throw IllegalStateException("disk")
        }

    private fun TestScope.closeWindow() {
        advanceTimeBy(WINDOW + 1)
        runCurrent()
    }

    @Test
    fun `a burst of 50 messages over 5 conversations is written as one batch per window`() = runTest {
        val batches = mutableListOf<List<ApiMessage>>()
        val buffer = buffer(batches)

        repeat(50) { index -> buffer.offer(message("m$index", conversationId = "c${index % 5}")) }
        closeWindow()

        assertThat(batches).hasSize(1)
        assertThat(batches.single()).hasSize(50)
        assertThat(batches.single().map { it.conversationId }.toSet()).containsExactly("c0", "c1", "c2", "c3", "c4")
    }

    @Test
    fun `nothing is written before the window closes`() = runTest {
        val batches = mutableListOf<List<ApiMessage>>()
        val buffer = buffer(batches)

        buffer.offer(message("m1"))
        advanceTimeBy(WINDOW - 1)
        runCurrent()

        assertThat(batches).isEmpty()
    }

    @Test
    fun `a message received twice in the window is written once in its last state`() = runTest {
        val batches = mutableListOf<List<ApiMessage>>()
        val buffer = buffer(batches)

        buffer.offer(message("m1", content = "v1"))
        buffer.offer(message("m2"))
        buffer.offer(message("m1", content = "v2"))
        closeWindow()

        assertThat(batches.single().map { it.id }).containsExactly("m2", "m1").inOrder()
        assertThat(batches.single().last().content).isEqualTo("v2")
    }

    @Test
    fun `a message after the flush opens the next window`() = runTest {
        val batches = mutableListOf<List<ApiMessage>>()
        val buffer = buffer(batches)

        buffer.offer(message("m1"))
        closeWindow()
        buffer.offer(message("m2"))
        closeWindow()

        assertThat(batches.map { batch -> batch.map { it.id } }).containsExactly(listOf("m1"), listOf("m2")).inOrder()
    }

    @Test
    fun `a failing write does not close the next window`() = runTest {
        val batches = mutableListOf<List<ApiMessage>>()
        val buffer = buffer(batches, fail = true)

        buffer.offer(message("m1"))
        closeWindow()
        buffer.offer(message("m2"))
        closeWindow()

        assertThat(batches).hasSize(2)
    }

    @Test
    fun `clearing drops the pending window`() = runTest {
        val batches = mutableListOf<List<ApiMessage>>()
        val buffer = buffer(batches)

        buffer.offer(message("m1"))
        buffer.clear()
        closeWindow()

        assertThat(batches).isEmpty()
    }

    private companion object {
        const val WINDOW = 100L
    }
}
