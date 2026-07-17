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
class SocialSocketManagerTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun managerWithHandlers(): Pair<SocialSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers {
            handlers[firstArg()] = secondArg()
        }
        val manager = SocialSocketManager(socket, json)
        manager.attach()
        return manager to handlers
    }

    @Test
    fun `story reacted payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.storyReacted.test {
            handlers.getValue("story:reacted").invoke(
                arrayOf(JSONObject("""{"storyId":"s1","userId":"u9","emoji":"🔥"}""")),
            )
            val event = awaitItem()
            assertThat(event.storyId).isEqualTo("s1")
            assertThat(event.userId).isEqualTo("u9")
            assertThat(event.emoji).isEqualTo("🔥")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `story unreacted payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.storyUnreacted.test {
            handlers.getValue("story:unreacted").invoke(
                arrayOf(JSONObject("""{"storyId":"s2","userId":"u3","emoji":"❤️"}""")),
            )
            val event = awaitItem()
            assertThat(event.storyId).isEqualTo("s2")
            assertThat(event.userId).isEqualTo("u3")
            assertThat(event.emoji).isEqualTo("❤️")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `post bookmarked payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.postBookmarked.test {
            handlers.getValue("post:bookmarked").invoke(
                arrayOf(JSONObject("""{"postId":"p1","bookmarked":true,"bookmarkCount":7}""")),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.bookmarked).isTrue()
            assertThat(event.bookmarkCount).isEqualTo(7)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a malformed reaction payload is ignored without emitting`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.storyReacted.test {
            handlers.getValue("story:reacted").invoke(
                arrayOf(JSONObject("""{"storyId":"s1"}""")),
            )
            expectNoEvents()
        }
    }
}
