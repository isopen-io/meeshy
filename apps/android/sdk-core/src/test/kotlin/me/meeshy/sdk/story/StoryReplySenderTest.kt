package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import org.junit.Test

class StoryReplySenderTest {

    private val me = MeeshyUser(id = "me", username = "me", systemLanguage = "fr")

    private class Fixture(
        resolution: DirectConversationResolution,
        sealedIds: Set<String> = emptySet(),
    ) {
        var flushes = 0
        val conversations: ConversationRepository = mockk(relaxed = true)
        val messages: MessageRepository = mockk(relaxed = true)
        val ledger = object : EndToEndRegimeLedger {
            override fun isSealed(conversationId: String) = conversationId in sealedIds
            override fun learn(conversationId: String) = Unit
        }
        val sender = StoryReplySender(conversations, messages, ledger) { flushes++ }

        init {
            coEvery { conversations.directConversationWith("author") } returns resolution
        }

        fun noSend() = coVerify(exactly = 0) {
            messages.sendOptimistic(
                conversationId = any(), content = any(), originalLanguage = any(), sender = any(), storyReplyToId = any(),
            )
        }
    }

    private fun found(id: String, mode: String? = null) =
        DirectConversationResolution.Found(ApiConversation(id = id, type = "direct", encryptionMode = mode), fromCache = false)

    @Test
    fun `a clear reply is written optimistically quoting the story then flushed`() = runTest {
        val f = Fixture(found("c1"))

        val outcome = f.sender.send("trop bien", storyId = "s1", authorId = "author", sender = me)

        assertThat(outcome).isEqualTo(StoryReplyOutcome.SENT)
        coVerify(exactly = 1) {
            f.messages.sendOptimistic(
                conversationId = "c1", content = "trop bien", originalLanguage = any(), sender = me, storyReplyToId = "s1",
            )
        }
        assertThat(f.flushes).isEqualTo(1)
    }

    @Test
    fun `a conversation served end to end encrypted never enters the queue`() = runTest {
        val f = Fixture(found("c1", mode = "e2ee"))

        assertThat(f.sender.send("salut", "s1", "author", me)).isEqualTo(StoryReplyOutcome.ENCRYPTED)
        f.noSend()
        assertThat(f.flushes).isEqualTo(0)
    }

    @Test
    fun `a conversation the account knows sealed is refused before any queueing`() = runTest {
        val f = Fixture(found("c1"), sealedIds = setOf("c1"))

        assertThat(f.sender.send("salut", "s1", "author", me)).isEqualTo(StoryReplyOutcome.ENCRYPTED)
        f.noSend()
    }

    @Test
    fun `no direct conversation means a complete failure and nothing is written`() = runTest {
        val f = Fixture(DirectConversationResolution.Failed(ApiError("x"), offline = true))

        assertThat(f.sender.send("salut", "s1", "author", me)).isEqualTo(StoryReplyOutcome.FAILED)
        f.noSend()
        assertThat(f.flushes).isEqualTo(0)
    }

    @Test
    fun `a thrown write is a failure, not a crash`() = runTest {
        val f = Fixture(found("c1"))
        coEvery {
            f.messages.sendOptimistic(
                conversationId = any(), content = any(), originalLanguage = any(), sender = any(), storyReplyToId = any(),
            )
        } throws IllegalStateException("db")

        assertThat(f.sender.send("salut", "s1", "author", me)).isEqualTo(StoryReplyOutcome.FAILED)
        assertThat(f.flushes).isEqualTo(0)
    }

    @Test
    fun `empty words or ids never leave`() = runTest {
        val f = Fixture(found("c1"))

        assertThat(f.sender.send("  ", "s1", "author", me)).isEqualTo(StoryReplyOutcome.FAILED)
        assertThat(f.sender.send("x", "", "author", me)).isEqualTo(StoryReplyOutcome.FAILED)
        assertThat(f.sender.send("x", "s1", "", me)).isEqualTo(StoryReplyOutcome.FAILED)
        f.noSend()
    }
}
