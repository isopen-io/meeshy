package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.runTest
import org.junit.Test

class CommentHeartTransportTest {
    private class Calls {
        val socket = mutableListOf<Boolean>()
        val rest = mutableListOf<Boolean>()
    }

    private fun transport(
        calls: Calls,
        socket: suspend () -> Unit = {},
        rest: suspend () -> Boolean = { true },
    ) = CommentHeartTransport(
        socket = CommentHeartSocket { add, _, _, _ -> calls.socket += add; socket() },
        rest = CommentHeartRest { add, _, _ -> calls.rest += add; rest() },
        timeoutMillis = 1_000,
    )

    @Test
    fun `le socket livre le coeur sans toucher au REST`() = runTest {
        val calls = Calls()
        assertThat(transport(calls).deliver(wasLiked = false, commentId = "c", postId = "p")).isTrue()
        assertThat(calls.socket).containsExactly(true)
        assertThat(calls.rest).isEmpty()
    }

    @Test
    fun `retirer un coeur emet une suppression`() = runTest {
        val calls = Calls()
        transport(calls).deliver(wasLiked = true, commentId = "c", postId = "p")
        assertThat(calls.socket).containsExactly(false)
    }

    @Test
    fun `un socket suspendu passe au REST apres le delai dur`() = runTest {
        val calls = Calls()
        val delivered = transport(calls, socket = { awaitCancellation() }).deliver(false, "c", "p")
        assertThat(delivered).isTrue()
        assertThat(calls.rest).containsExactly(true)
    }

    @Test
    fun `un socket qui leve passe au REST`() = runTest {
        val calls = Calls()
        assertThat(transport(calls, socket = { error("noSocket") }).deliver(false, "c", "p")).isTrue()
        assertThat(calls.rest).containsExactly(true)
    }

    @Test
    fun `les deux chemins en echec demandent le retour arriere`() = runTest {
        val calls = Calls()
        val delivered = transport(calls, socket = { error("down") }, rest = { false }).deliver(false, "c", "p")
        assertThat(delivered).isFalse()
    }

    @Test
    fun `un REST qui leve demande aussi le retour arriere`() = runTest {
        val calls = Calls()
        val delivered = transport(calls, socket = { error("down") }, rest = { error("boom") }).deliver(true, "c", "p")
        assertThat(delivered).isFalse()
    }
}
