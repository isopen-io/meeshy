package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SocialSocketManagerReactionEventsTest {

    private fun managerWithHandlers(): Pair<SocialSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val manager = SocialSocketManager(socket, Json { ignoreUnknownKeys = true; isLenient = true })
        manager.attach()
        return manager to handlers
    }

    @Test
    fun `post reaction-added porte le compte absolu`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.postReactionAdded.test {
            handlers.getValue("post:reaction-added").invoke(
                arrayOf(JSONObject("""{"postId":"p1","userId":"u","emoji":"x","action":"add","aggregation":{"emoji":"x","count":4}}""")),
            )
            assertThat(awaitItem().aggregation!!.count).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `comment media-updated est recu`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        assertThat(handlers.keys).contains("comment:media-updated")
        assertThat(manager.commentMediaUpdated).isNotNull()
    }

    @Test
    fun `conversation deleted, closed et obsoleted alimentent le meme flux social`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.conversationDeleted.test {
            listOf("conversation:deleted", "conversation:closed", "conversation:obsoleted").forEachIndexed { i, event ->
                handlers.getValue(event).invoke(arrayOf(JSONObject("""{"conversationId":"c$i"}""")))
                assertThat(awaitItem().conversationId).isEqualTo("c$i")
            }
            cancelAndIgnoreRemainingEvents()
        }
    }
}
