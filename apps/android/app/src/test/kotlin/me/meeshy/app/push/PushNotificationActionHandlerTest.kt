package me.meeshy.app.push

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.outbox.EndToEndOutboxAdmission
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PushNotificationActionHandlerTest {

    private val me = MeeshyUser(id = "me", username = "me")

    private class Fixture(user: MeeshyUser?, sealed: Boolean) {
        val messages = mockk<MessageRepository>(relaxed = true)
        val conversations = mockk<ConversationRepository>(relaxed = true)
        val session = mockk<SessionRepository>(relaxed = true) {
            every { currentUser } returns MutableStateFlow(user)
        }
        val admission = mockk<EndToEndOutboxAdmission> {
            coEvery { isConversationSealed(any()) } returns sealed
        }
        val handler = PushNotificationActionHandler(
            ApplicationProvider.getApplicationContext<Context>(), session, messages, conversations, admission,
        )
    }

    @Test
    fun `une reponse passe par la file d envoi et la banniere s en va`() = runTest {
        val f = Fixture(me, sealed = false)

        val outcome = f.handler.reply("c1", "  Je suis en route  ")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.SENT)
        assertThat(outcome.dismissesBanner).isTrue()
        coVerify { f.messages.sendOptimistic(conversationId = "c1", content = "Je suis en route", originalLanguage = any(), sender = me) }
    }

    @Test
    fun `une reponse en conversation chiffree ne part jamais en clair`() = runTest {
        val f = Fixture(me, sealed = true)

        val outcome = f.handler.reply("c1", "secret")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.END_TO_END)
        assertThat(outcome.dismissesBanner).isFalse()
        coVerify(exactly = 0) { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `une reponse vide ne part pas`() = runTest {
        val f = Fixture(me, sealed = false)

        assertThat(f.handler.reply("c1", "   ")).isEqualTo(PushNotificationActionHandler.Outcome.EMPTY)
    }

    @Test
    fun `marquer comme lu passe par la file optimiste`() = runTest {
        val f = Fixture(me, sealed = false)

        val outcome = f.handler.markRead("c1")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.MARKED_READ)
        coVerify { f.conversations.markReadOptimistic("c1") }
    }

    @Test
    fun `une erreur garde la banniere`() = runTest {
        val f = Fixture(me, sealed = false)
        coEvery { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } throws IllegalStateException("db")

        val outcome = f.handler.reply("c1", "salut")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.FAILED)
        assertThat(outcome.dismissesBanner).isFalse()
    }
}
