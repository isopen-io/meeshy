package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PendingReceiptQueueTest {
    private fun ref(n: Int, message: String = "m$n") = PushMessageRef("c$n", message)

    @Test
    fun `one entry per conversation and the latest message wins`() {
        val queue = PendingReceiptQueue().enqueue(ref(1, "a")).enqueue(ref(2)).enqueue(ref(1, "b"))

        assertThat(queue.entries).containsExactly(ref(2), PushMessageRef("c1", "b")).inOrder()
    }

    @Test
    fun `an empty conversation never enters`() {
        assertThat(PendingReceiptQueue().enqueue(PushMessageRef(" ", "m")).isEmpty).isTrue()
    }

    @Test
    fun `the cap drops the oldest entries`() {
        val queue = (1..205).fold(PendingReceiptQueue()) { q, n -> q.enqueue(ref(n)) }

        assertThat(queue.entries).hasSize(200)
        assertThat(queue.entries.first()).isEqualTo(ref(6))
        assertThat(queue.entries.last()).isEqualTo(ref(205))
    }

    @Test
    fun `drain hands back FIFO order and empties the queue`() {
        val (entries, rest) = PendingReceiptQueue().enqueue(ref(1)).enqueue(ref(2)).drain()

        assertThat(entries).containsExactly(ref(1), ref(2)).inOrder()
        assertThat(rest.isEmpty).isTrue()
    }

    @Test
    fun `failures return at the head in their order`() {
        val queue = PendingReceiptQueue().enqueue(ref(3)).requeueAtHead(listOf(ref(1), ref(2)))

        assertThat(queue.entries).containsExactly(ref(1), ref(2), ref(3)).inOrder()
    }

    @Test
    fun `a failure superseded by a newer entry of its conversation is dropped`() {
        val queue = PendingReceiptQueue().enqueue(ref(1, "new")).requeueAtHead(listOf(ref(1, "old"), ref(2)))

        assertThat(queue.entries).containsExactly(ref(2), PushMessageRef("c1", "new")).inOrder()
    }

    @Test
    fun `storage round trips and corrupt lines are purged`() {
        val raw = PendingReceiptQueue().enqueue(ref(1)).enqueue(ref(2)).encode() + "\ngarbage\n\t\nc9\t\n"

        val decoded = PendingReceiptQueue.decode(raw)

        assertThat(decoded.entries).containsExactly(ref(1), ref(2)).inOrder()
        assertThat(PendingReceiptQueue.decode(null).isEmpty).isTrue()
    }
}
