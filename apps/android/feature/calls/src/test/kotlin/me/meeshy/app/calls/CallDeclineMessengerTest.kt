package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import org.junit.Test

class CallDeclineMessengerTest {
    private val me = MeeshyUser(id = "me", username = "me", systemLanguage = "fr")
    private val user = MutableStateFlow<MeeshyUser?>(me)
    private val session = mockk<SessionRepository> { every { currentUser } returns user }
    private val messages = mockk<MessageRepository>(relaxed = true)
    private val conversations = mockk<ConversationRepository>(relaxed = true)
    private var sealedByLedger = false
    private val ledger = object : EndToEndRegimeLedger {
        override fun isSealed(conversationId: String) = sealedByLedger
        override fun learn(conversationId: String) = Unit
    }
    private var flushed = 0
    private val flush = OutboxFlushScheduler { flushed++ }

    private fun messenger() = CallDeclineMessenger(
        messages, conversations, session, ledger, flush, CoroutineScope(Job()),
    )

    @Test
    fun `le message part par la file d'envoi de la conversation de l'appel et reveille l'outbox`() = runTest {
        coEvery { conversations.cachedById("c1") } returns ApiConversation(id = "c1")

        val outcome = messenger().send("peer", "c1", "  Je te rappelle.  ")

        assertThat(outcome).isEqualTo(CallDeclineOutcome.Queued)
        coVerify(exactly = 1) {
            messages.sendOptimistic(
                conversationId = "c1", content = "Je te rappelle.", originalLanguage = any(), sender = me,
            )
        }
        assertThat(flushed).isEqualTo(1)
    }

    @Test
    fun `sans conversation portee par l'appel, le direct avec l'appelant est resolu`() = runTest {
        coEvery { conversations.directConversationWith("peer") } returns
            DirectConversationResolution.Found(ApiConversation(id = "direct1"), fromCache = true)
        coEvery { conversations.cachedById("direct1") } returns ApiConversation(id = "direct1")

        val outcome = messenger().send("peer", "", "Je suis en réunion.")

        assertThat(outcome).isEqualTo(CallDeclineOutcome.Queued)
        coVerify { messages.sendOptimistic(conversationId = "direct1", content = any(), originalLanguage = any(), sender = me) }
    }

    @Test
    fun `vers une conversation chiffree de bout en bout, rien n'est ecrit ni mis en file`() = runTest {
        coEvery { conversations.cachedById("c1") } returns ApiConversation(id = "c1", encryptionMode = "e2ee")

        val outcome = messenger().send("peer", "c1", "Salut")

        assertThat(outcome).isEqualTo(CallDeclineOutcome.EndToEndRefused)
        coVerify(exactly = 0) { messages.sendOptimistic(any(), any(), any(), any()) }
        assertThat(flushed).isEqualTo(0)
    }

    @Test
    fun `le registre du compte scelle une conversation absente du cache`() = runTest {
        sealedByLedger = true

        val outcome = messenger().send("peer", "c1", "Salut")

        assertThat(outcome).isEqualTo(CallDeclineOutcome.EndToEndRefused)
        coVerify(exactly = 0) { messages.sendOptimistic(any(), any(), any(), any()) }
    }

    @Test
    fun `sans session, sans destination ou texte vide rien ne part`() = runTest {
        assertThat(messenger().send("peer", "c1", "   ")).isEqualTo(CallDeclineOutcome.Failed)
        assertThat(messenger().send("", "", "Salut")).isEqualTo(CallDeclineOutcome.Failed)
        user.value = null
        assertThat(messenger().send("peer", "c1", "Salut")).isEqualTo(CallDeclineOutcome.Failed)
        coVerify(exactly = 0) { messages.sendOptimistic(any(), any(), any(), any()) }
    }

    @Test
    fun `un echec de mise en file est rendu sans plantage`() = runTest {
        coEvery { conversations.cachedById("c1") } returns ApiConversation(id = "c1")
        coEvery { messages.sendOptimistic(any(), any(), any(), any()) } throws IllegalStateException("db")

        assertThat(messenger().send("peer", "c1", "Salut")).isEqualTo(CallDeclineOutcome.Failed)
        assertThat(flushed).isEqualTo(0)
    }
}
