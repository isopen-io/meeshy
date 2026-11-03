package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SeenMessageAccumulatorTest {

    @Test
    fun `a message is not read before its dwell`() {
        val acc = SeenMessageAccumulator(dwellMs = 300)
        acc.appeared("a", 0)
        acc.disappeared("a", 299)
        assertThat(acc.drain(300)).isEmpty()
    }

    @Test
    fun `a message displayed continuously for the dwell is read once leaving`() {
        val acc = SeenMessageAccumulator(dwellMs = 300)
        acc.appeared("a", 0)
        acc.disappeared("a", 300)
        assertThat(acc.drain(300)).containsExactly("a")
    }

    @Test
    fun `a message still on screen past the dwell is acquired by drain`() {
        val acc = SeenMessageAccumulator(dwellMs = 300)
        acc.appeared("a", 0)
        assertThat(acc.drain(400)).containsExactly("a")
    }

    @Test
    fun `a reappearance restarts from zero`() {
        val acc = SeenMessageAccumulator(dwellMs = 300)
        acc.appeared("a", 0)
        acc.disappeared("a", 200)
        acc.appeared("a", 1000)
        acc.disappeared("a", 1200)
        assertThat(acc.drain(1300)).isEmpty()
    }

    @Test
    fun `the batch is ready at the size threshold`() {
        val acc = SeenMessageAccumulator(dwellMs = 10, batchSize = 2)
        acc.appeared("a", 0)
        assertThat(acc.isBatchReady(20)).isFalse()
        acc.appeared("b", 0)
        assertThat(acc.isBatchReady(20)).isTrue()
    }

    @Test
    fun `a reported id is never returned twice`() {
        val acc = SeenMessageAccumulator(dwellMs = 0)
        acc.appeared("a", 0)
        assertThat(acc.drain(1)).containsExactly("a")
        acc.appeared("a", 2)
        assertThat(acc.drain(3)).isEmpty()
    }

    @Test
    fun `promoteAndDrain returns what is pending below the dwell`() {
        val acc = SeenMessageAccumulator(dwellMs = 300)
        acc.appeared("a", 0)
        assertThat(acc.promoteAndDrain(5)).containsExactly("a")
    }

    @Test
    fun `the anti duplicate guard is bounded and forgets at the cap`() {
        val acc = SeenMessageAccumulator(dwellMs = 0, reportedCap = 2)
        listOf("a", "b").forEach { acc.appeared(it, 0) }
        assertThat(acc.drain(1)).containsExactly("a", "b").inOrder()
        acc.appeared("c", 2)
        assertThat(acc.drain(3)).containsExactly("c")
        // "a" et "b" ont été oubliés au plafond : un nouveau signalement est tolérable, pas un blocage.
        acc.appeared("a", 4)
        assertThat(acc.drain(5)).containsExactly("a")
    }
}
