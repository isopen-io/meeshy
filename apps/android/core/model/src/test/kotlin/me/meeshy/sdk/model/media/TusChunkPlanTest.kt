package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TusChunkPlanTest {

    @Test
    fun `zero bytes yields a single zero-length final chunk`() {
        val chunks = TusChunkPlan.chunks(totalBytes = 0L, chunkSize = 10L)

        assertThat(chunks).containsExactly(TusChunkRange(offset = 0L, length = 0L, isFinal = true))
    }

    @Test
    fun `body smaller than the chunk size yields a single final chunk covering it all`() {
        val chunks = TusChunkPlan.chunks(totalBytes = 3L, chunkSize = 10L)

        assertThat(chunks).containsExactly(TusChunkRange(offset = 0L, length = 3L, isFinal = true))
    }

    @Test
    fun `body exactly one chunk size yields a single final chunk, not a trailing empty one`() {
        val chunks = TusChunkPlan.chunks(totalBytes = 10L, chunkSize = 10L)

        assertThat(chunks).containsExactly(TusChunkRange(offset = 0L, length = 10L, isFinal = true))
    }

    @Test
    fun `body an exact multiple of the chunk size splits evenly, only the last is final`() {
        val chunks = TusChunkPlan.chunks(totalBytes = 20L, chunkSize = 10L)

        assertThat(chunks).containsExactly(
            TusChunkRange(offset = 0L, length = 10L, isFinal = false),
            TusChunkRange(offset = 10L, length = 10L, isFinal = true),
        ).inOrder()
    }

    @Test
    fun `body with a remainder gives the last chunk the leftover bytes`() {
        val chunks = TusChunkPlan.chunks(totalBytes = 25L, chunkSize = 10L)

        assertThat(chunks).containsExactly(
            TusChunkRange(offset = 0L, length = 10L, isFinal = false),
            TusChunkRange(offset = 10L, length = 10L, isFinal = false),
            TusChunkRange(offset = 20L, length = 5L, isFinal = true),
        ).inOrder()
    }

    @Test
    fun `ranges are contiguous and non-overlapping`() {
        val chunks = TusChunkPlan.chunks(totalBytes = 47L, chunkSize = 9L)

        chunks.zipWithNext().forEach { (current, next) ->
            assertThat(next.offset).isEqualTo(current.offset + current.length)
        }
    }

    @Test
    fun `chunk lengths sum to the total byte count`() {
        val chunks = TusChunkPlan.chunks(totalBytes = 47L, chunkSize = 9L)

        assertThat(chunks.sumOf { it.length }).isEqualTo(47L)
    }

    @Test
    fun `exactly one chunk is marked final, and it is the last one`() {
        val chunks = TusChunkPlan.chunks(totalBytes = 47L, chunkSize = 9L)

        assertThat(chunks.count { it.isFinal }).isEqualTo(1)
        assertThat(chunks.last().isFinal).isTrue()
    }

    @Test
    fun `a non-positive chunk size is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            TusChunkPlan.chunks(totalBytes = 10L, chunkSize = 0L)
        }
        assertThrows(IllegalArgumentException::class.java) {
            TusChunkPlan.chunks(totalBytes = 10L, chunkSize = -1L)
        }
    }

    @Test
    fun `a negative total byte count is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            TusChunkPlan.chunks(totalBytes = -1L, chunkSize = 10L)
        }
    }

    private fun assertThrows(expected: Class<out Throwable>, block: () -> Unit) {
        try {
            block()
            throw AssertionError("Expected ${expected.simpleName} but nothing was thrown")
        } catch (e: Throwable) {
            assertThat(e).isInstanceOf(expected)
        }
    }
}
