package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
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
    fun `joinPostRoom emits post-join with the postId`() = runTest {
        val socket: SocketManager = mockk(relaxed = true)
        val manager = SocialSocketManager(socket, json)

        manager.joinPostRoom("p1")

        val payload = slot<JSONObject>()
        verify { socket.emit("post:join", capture(payload)) }
        assertThat(payload.captured.getString("postId")).isEqualTo("p1")
    }

    @Test
    fun `leavePostRoom emits post-leave with the postId`() = runTest {
        val socket: SocketManager = mockk(relaxed = true)
        val manager = SocialSocketManager(socket, json)

        manager.leavePostRoom("p1")

        val payload = slot<JSONObject>()
        verify { socket.emit("post:leave", capture(payload)) }
        assertThat(payload.captured.getString("postId")).isEqualTo("p1")
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
    fun `story deleted payload carries the story and author ids`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.storyDeleted.test {
            handlers.getValue("story:deleted").invoke(
                arrayOf(JSONObject("""{"storyId":"s7","authorId":"u4"}""")),
            )
            val event = awaitItem()
            assertThat(event.storyId).isEqualTo("s7")
            assertThat(event.authorId).isEqualTo("u4")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `story deleted payload decodes with a defaulted author id when absent`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.storyDeleted.test {
            handlers.getValue("story:deleted").invoke(
                arrayOf(JSONObject("""{"storyId":"s8"}""")),
            )
            val event = awaitItem()
            assertThat(event.storyId).isEqualTo("s8")
            assertThat(event.authorId).isEmpty()
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
    fun `comment updated payload carries the complete edited comment`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.commentUpdated.test {
            handlers.getValue("comment:updated").invoke(
                arrayOf(
                    JSONObject(
                        """{"postId":"p1","comment":{"id":"c7","content":"Salut (edited)","likeCount":3}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.comment.id).isEqualTo("c7")
            assertThat(event.comment.content).isEqualTo("Salut (edited)")
            assertThat(event.comment.likeCount).isEqualTo(3)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `post updated payload nests the complete edited post under post`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.postUpdated.test {
            handlers.getValue("post:updated").invoke(
                arrayOf(
                    JSONObject(
                        """{"post":{"id":"p1","content":"Bonjour (edited)","likeCount":9,"isEdited":true}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.post.id).isEqualTo("p1")
            assertThat(event.post.content).isEqualTo("Bonjour (edited)")
            assertThat(event.post.likeCount).isEqualTo(9)
            assertThat(event.post.isEdited).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `post reposted payload nests the complete repost under repost`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.postReposted.test {
            handlers.getValue("post:reposted").invoke(
                arrayOf(
                    JSONObject(
                        """{"originalPostId":"p0","repost":{"id":"r1","content":"Repartagé",""" +
                            """"repostOf":{"id":"p0"},"author":{"id":"u9","username":"bob"}}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.originalPostId).isEqualTo("p0")
            assertThat(event.repost.id).isEqualTo("r1")
            assertThat(event.repost.content).isEqualTo("Repartagé")
            assertThat(event.repost.author?.id).isEqualTo("u9")
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
    fun `story translation-updated payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.storyTranslationUpdated.test {
            handlers.getValue("story:translation-updated").invoke(
                arrayOf(
                    JSONObject(
                        """{"postId":"p1","textObjectIndex":2,"translations":{"fr":"Bonjour","es":"Hola"}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.textObjectIndex).isEqualTo(2)
            assertThat(event.translations["fr"]).isEqualTo("Bonjour")
            assertThat(event.translations["es"]).isEqualTo("Hola")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a story translation-updated payload without translations decodes to an empty map`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.storyTranslationUpdated.test {
            handlers.getValue("story:translation-updated").invoke(
                arrayOf(JSONObject("""{"postId":"p1","textObjectIndex":0,"translations":{}}""")),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.translations).isEmpty()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `post translation-updated payload is decoded and emitted with its full entry`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.postTranslationUpdated.test {
            handlers.getValue("post:translation-updated").invoke(
                arrayOf(
                    JSONObject(
                        """{"postId":"p1","language":"es","translation":{"text":"Hola","translationModel":"nllb","confidenceScore":0.97}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.language).isEqualTo("es")
            assertThat(event.translation.text).isEqualTo("Hola")
            assertThat(event.translation.translationModel).isEqualTo("nllb")
            assertThat(event.translation.confidenceScore).isEqualTo(0.97)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a post translation-updated payload with only text decodes with null metadata`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.postTranslationUpdated.test {
            handlers.getValue("post:translation-updated").invoke(
                arrayOf(JSONObject("""{"postId":"p2","language":"de","translation":{"text":"Hallo"}}""")),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p2")
            assertThat(event.translation.text).isEqualTo("Hallo")
            assertThat(event.translation.translationModel).isNull()
            assertThat(event.translation.confidenceScore).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `comment translation-updated payload is decoded and emitted with its full entry`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.commentTranslationUpdated.test {
            handlers.getValue("comment:translation-updated").invoke(
                arrayOf(
                    JSONObject(
                        """{"postId":"p1","commentId":"c7","language":"es",""" +
                            """"translation":{"text":"Hola","translationModel":"nllb","confidenceScore":0.97}}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.postId).isEqualTo("p1")
            assertThat(event.commentId).isEqualTo("c7")
            assertThat(event.language).isEqualTo("es")
            assertThat(event.translation.text).isEqualTo("Hola")
            assertThat(event.translation.translationModel).isEqualTo("nllb")
            assertThat(event.translation.confidenceScore).isEqualTo(0.97)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a comment translation-updated payload with only text decodes with null metadata`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.commentTranslationUpdated.test {
            handlers.getValue("comment:translation-updated").invoke(
                arrayOf(JSONObject("""{"postId":"p2","commentId":"c9","language":"de","translation":{"text":"Hallo"}}""")),
            )
            val event = awaitItem()
            assertThat(event.commentId).isEqualTo("c9")
            assertThat(event.translation.text).isEqualTo("Hallo")
            assertThat(event.translation.translationModel).isNull()
            assertThat(event.translation.confidenceScore).isNull()
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
