package me.meeshy.sdk.e2ee.libsignal

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * #18970 (ANDX-01), audit de #19077 P9 — la file de travail de la session E2EE survit à tout travail qui échoue, `Error`
 * comprise : une enveloppe qui fait paniquer libsignal, déborder une pile ou refuser le coffre n'arrête jamais celles qui
 * la suivent, et ne fait pas tomber le processus.
 */
class EndToEndWorkQueueTest {

    @Test
    fun aTaskThatThrowsAnError_neverStopsTheTasksQueuedAfterIt() = runTest {
        val queue = Channel<suspend () -> Unit>(Channel.UNLIMITED)
        val done = mutableListOf<String>()
        queue.trySend { throw StackOverflowError("deep plaintext") }
        queue.trySend { throw AssertionError("libsignal panic") }
        queue.trySend { throw IllegalStateException("vault refused") }
        queue.trySend { done += "after" }
        queue.close()

        drainGuarded(queue).join()

        assertThat(done).containsExactly("after")
    }
}
