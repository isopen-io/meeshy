package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.share.OutgoingShare
import org.junit.Test

class MessageForwardServiceTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "pt")

    private fun share(
        content: String = "salut",
        from: String? = null,
        fromConversation: String? = null,
        pieces: List<String>? = null,
        language: String? = null,
        flags: Long = 0L,
        duration: Int? = null,
    ) = OutgoingShare(content, language, from, fromConversation, flags, duration, pieces)

    private fun repository(): MessageRepository = mockk<MessageRepository>().also {
        coEvery { it.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns "cid_x"
    }

    @Test
    fun `an internal forward keeps its origin and the chosen pieces`() = runTest {
        val repo = repository()
        val service = MessageForwardService(repo)

        service.post(share(from = "m1", fromConversation = "src", pieces = listOf("a1")), "c1", sender)

        assertThat(service.isInternal(share(from = "m1"))).isTrue()
        coVerify {
            repo.sendOptimistic(
                conversationId = "c1", content = "salut", originalLanguage = "pt", sender = sender,
                forwardedFromId = "m1", forwardedFromConversationId = "src", forwardedAttachmentIds = listOf("a1"),
                effects = MessageEffects(flags = 0L, ephemeralDuration = null), clientMessageId = null,
            )
        }
    }

    @Test
    fun `an external text carries no forward mark at all`() = runTest {
        val repo = repository()
        val service = MessageForwardService(repo)

        service.post(share(from = null, fromConversation = "ignored", pieces = listOf("a1")), "c1", sender)

        assertThat(service.isInternal(share())).isFalse()
        coVerify {
            repo.sendOptimistic(
                conversationId = "c1", content = "salut", originalLanguage = "pt", sender = sender,
                forwardedFromId = null, forwardedFromConversationId = null, forwardedAttachmentIds = null,
                effects = MessageEffects(flags = 0L, ephemeralDuration = null), clientMessageId = null,
            )
        }
    }

    @Test
    fun `an unknown source conversation is omitted, never sent blank`() = runTest {
        val repo = repository()

        MessageForwardService(repo).post(share(from = "m1", fromConversation = ""), "c1", sender)

        coVerify { repo.sendOptimistic(conversationId = "c1", content = any(), originalLanguage = any(), sender = any(), forwardedFromId = "m1", forwardedFromConversationId = null, forwardedAttachmentIds = null, effects = any(), clientMessageId = null) }
    }

    @Test
    fun `the copy keeps the protection of its source and the given client id`() = runTest {
        val repo = repository()

        MessageForwardService(repo).post(share(from = "m1", flags = MessageEffectFlags.BLURRED, duration = 30), "c1", sender, "cid_given")

        coVerify {
            repo.sendOptimistic(
                conversationId = "c1", content = any(), originalLanguage = any(), sender = any(), forwardedFromId = "m1",
                forwardedFromConversationId = null, forwardedAttachmentIds = null,
                effects = MessageEffects(flags = MessageEffectFlags.BLURRED, ephemeralDuration = 30), clientMessageId = "cid_given",
            )
        }
    }

    @Test
    fun `the language falls back from the share to the sender to the default`() = runTest {
        val repo = repository()
        val service = MessageForwardService(repo)

        service.post(share(language = "es"), "c1", sender)
        service.post(share(), "c1", MeeshyUser(id = "me", username = "x"))

        coVerify { repo.sendOptimistic(conversationId = any(), content = any(), originalLanguage = "es", sender = any(), forwardedFromId = any(), forwardedFromConversationId = any(), forwardedAttachmentIds = any(), effects = any(), clientMessageId = any()) }
        coVerify { repo.sendOptimistic(conversationId = any(), content = any(), originalLanguage = "fr", sender = any(), forwardedFromId = any(), forwardedFromConversationId = any(), forwardedAttachmentIds = any(), effects = any(), clientMessageId = any()) }
    }
}
