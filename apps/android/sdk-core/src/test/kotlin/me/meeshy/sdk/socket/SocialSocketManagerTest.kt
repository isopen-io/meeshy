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
    fun `comment deleted payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.commentDeleted.test {
            handlers.getValue("comment:deleted").invoke(
                arrayOf(JSONObject("""{"postId":"p1","commentId":"c9","commentCount":4}""")),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.commentId).isEqualTo("c9")
            assertThat(event.commentCount).isEqualTo(4)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `comment added payload carries the authoritative comment count`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.commentAdded.test {
            handlers.getValue("comment:added").invoke(
                arrayOf(
                    JSONObject(
                        """{"postId":"p1","comment":{"id":"c7","content":"Salut"},"commentCount":12}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.comment.id).isEqualTo("c7")
            assertThat(event.commentCount).isEqualTo(12)
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

    @Test
    fun `comment reaction-added payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.commentReactionAdded.test {
            handlers.getValue("comment:reaction-added").invoke(
                arrayOf(
                    JSONObject(
                        """{"commentId":"c1","postId":"p1","userId":"u7","emoji":"❤️","action":"add",""" +
                            """"aggregation":{"emoji":"❤️","count":3,"userIds":["u7"],"hasCurrentUser":true}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.commentId).isEqualTo("c1")
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.userId).isEqualTo("u7")
            assertThat(event.emoji).isEqualTo("❤️")
            assertThat(event.aggregation?.count).isEqualTo(3)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `status created payload nests the mood post under status`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.statusCreated.test {
            handlers.getValue("status:created").invoke(
                arrayOf(
                    JSONObject(
                        """{"status":{"id":"st1","type":"STATUS","moodEmoji":"😀",""" +
                            """"author":{"id":"u1","username":"alice"}},"clientMutationId":null}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.status.id).isEqualTo("st1")
            assertThat(event.status.moodEmoji).isEqualTo("😀")
            assertThat(event.status.author?.id).isEqualTo("u1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `status updated payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.statusUpdated.test {
            handlers.getValue("status:updated").invoke(
                arrayOf(
                    JSONObject(
                        """{"status":{"id":"st2","type":"STATUS","moodEmoji":"🎉",""" +
                            """"content":"edited","author":{"id":"u2"}}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.status.id).isEqualTo("st2")
            assertThat(event.status.content).isEqualTo("edited")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `status deleted payload carries the status and author ids`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.statusDeleted.test {
            handlers.getValue("status:deleted").invoke(
                arrayOf(JSONObject("""{"statusId":"st3","authorId":"u3"}""")),
            )
            val event = awaitItem()
            assertThat(event.statusId).isEqualTo("st3")
            assertThat(event.authorId).isEqualTo("u3")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `status reacted payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.statusReacted.test {
            handlers.getValue("status:reacted").invoke(
                arrayOf(JSONObject("""{"statusId":"st4","userId":"u4","emoji":"😂"}""")),
            )
            val event = awaitItem()
            assertThat(event.statusId).isEqualTo("st4")
            assertThat(event.userId).isEqualTo("u4")
            assertThat(event.emoji).isEqualTo("😂")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `status unreacted payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.statusUnreacted.test {
            handlers.getValue("status:unreacted").invoke(
                arrayOf(JSONObject("""{"statusId":"st9","userId":"u7","emoji":"😂"}""")),
            )
            val event = awaitItem()
            assertThat(event.statusId).isEqualTo("st9")
            assertThat(event.userId).isEqualTo("u7")
            assertThat(event.emoji).isEqualTo("😂")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `comment reaction-removed payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.commentReactionRemoved.test {
            handlers.getValue("comment:reaction-removed").invoke(
                arrayOf(JSONObject("""{"commentId":"c2","postId":"p1","userId":"u3","emoji":"❤️","action":"remove"}""")),
            )
            val event = awaitItem()
            assertThat(event.commentId).isEqualTo("c2")
            assertThat(event.userId).isEqualTo("u3")
            assertThat(event.emoji).isEqualTo("❤️")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
