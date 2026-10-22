package me.meeshy.app.navigation

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationOpener
import me.meeshy.sdk.conversation.ConversationOpenerStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class ConversationOpenerHostTest {
    private class Store(val result: NetworkResult<ApiConversation>) : ConversationOpenerStore {
        override suspend fun cached(id: String): ApiConversation? = null
        override suspend fun fetch(id: String) = result
        override suspend fun remember(conversation: ApiConversation) = Unit
    }

    private fun host(result: NetworkResult<ApiConversation>) =
        ConversationOpenerHost(ConversationOpener(Store(result), { }), { "Impossible d'ouvrir la conversation" })

    @Test
    fun `a failure shows the same error toast with the underlying detail`() = runTest {
        val host = host(NetworkResult.Failure(ApiError("HTTP 404")))
        host.events.test {
            host.open("c1")
            assertThat(awaitItem()).isEqualTo(
                ConversationOpenEvent.ShowError("Impossible d'ouvrir la conversation (HTTP 404)"),
            )
        }
    }

    @Test
    fun `a success navigates to the chat route carrying the message to highlight`() = runTest {
        val host = host(NetworkResult.Success(ApiConversation(id = "c1")))
        host.events.test {
            host.open("c1", "m2")
            assertThat(awaitItem()).isEqualTo(ConversationOpenEvent.Navigate("chat/c1?messageId=m2"))
        }
    }
}
