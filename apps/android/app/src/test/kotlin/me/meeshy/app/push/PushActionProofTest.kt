package me.meeshy.app.push

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.core.app.RemoteInput
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.app.push.pipeline.BigTextEnricher
import me.meeshy.app.push.pipeline.MessageActionsEnricher
import me.meeshy.app.push.pipeline.MessagingStyleEnricher
import me.meeshy.app.push.pipeline.PushEnvironment
import me.meeshy.app.push.pipeline.PushNotificationPipeline
import me.meeshy.app.push.pipeline.PushSummaryNotifier
import me.meeshy.app.push.media.PushMediaFetcher
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * #13513 — le `PendingIntent` de « Répondre » est mutable : une app qui relaie le geste y fusionne ses propres extras
 * (`Intent.fillIn`). La réponse ne part que dans la conversation que la bannière nommait.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [28, 34])
class PushActionProofTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val proof = LaunchIntentProof(context)
    private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private val session = mockk<SessionRepository>(relaxed = true) { every { currentUserId } returns "me" }

    private suspend fun postedIntents(): List<Intent> {
        manager.cancelAll()
        val pipeline = PushNotificationPipeline(
            context = context,
            preferencesStore = InMemoryNotificationPreferencesStore(),
            activeConversationStore = ActiveConversationStore(),
            environment = object : PushEnvironment {
                override fun isAppInForeground() = false
                override fun isSocketConnected() = false
                override fun interruptionFilter() = 1
                override suspend fun localUnreadConversations(): Int? = null
            },
            enrichers = setOf(MessagingStyleEnricher(context, mockk<PushMediaFetcher>(relaxed = true)), BigTextEnricher(), MessageActionsEnricher(context, session, proof)),
            summaryNotifier = PushSummaryNotifier(context),
        )
        pipeline.renderNow(
            IncomingPush.of(
                mapOf(
                    "type" to "new_message", "notificationId" to "n1", "conversationId" to "6501a1b2c3d4e5f607182930",
                    "senderId" to "u1", "senderDisplayName" to "Alice", "title" to "Alice", "body" to "Salut",
                ),
            ),
        )
        return manager.activeNotifications.first { it.notification.actions != null }.notification.actions
            .map { Intent(shadowOf(it.actionIntent).savedIntent) }
    }

    private fun Intent.filledBy(relay: Intent): Intent = Intent(this).also { it.fillIn(relay, 0) }

    private fun typed(text: String) = Intent().also {
        RemoteInput.addResultsToIntent(
            arrayOf(RemoteInput.Builder(PushActionReceiver.KEY_REPLY).build()),
            it,
            Bundle().apply { putCharSequence(PushActionReceiver.KEY_REPLY, text) },
        )
    }

    @Test
    fun `une reponse saisie dans la banniere part dans la conversation de la bannière`() = runTest {
        val reply = postedIntents().first { it.action == PushActionReceiver.ACTION_REPLY }

        val request = PushActionRequest.from(reply.filledBy(typed("Salut !")), proof)

        assertThat(request?.conversationId).isEqualTo("6501a1b2c3d4e5f607182930")
        assertThat(request?.reply).isEqualTo("Salut !")
    }

    @Test
    fun `un relais qui fusionne sa conversation ne deplace pas la reponse`() = runTest {
        val reply = postedIntents().first { it.action == PushActionReceiver.ACTION_REPLY }
        val relay = typed("Salut !").putExtra(PushActionReceiver.EXTRA_CONVERSATION_ID, "autre")

        assertThat(PushActionRequest.from(reply.filledBy(relay), proof)?.conversationId).isEqualTo("6501a1b2c3d4e5f607182930")
    }

    @Test
    fun `un intent dont la conversation est reecrite n envoie rien`() = runTest {
        val reply = postedIntents().first { it.action == PushActionReceiver.ACTION_REPLY }

        val rewritten = Intent(reply).putExtra(PushActionReceiver.EXTRA_CONVERSATION_ID, "autre")

        assertThat(PushActionRequest.from(rewritten, proof)).isNull()
    }

    @Test
    fun `un intent dont le compte ou la notification est reecrit n est pas cru non plus`() = runTest {
        val reply = postedIntents().first { it.action == PushActionReceiver.ACTION_REPLY }

        assertThat(PushActionRequest.from(Intent(reply).putExtra(PushActionReceiver.EXTRA_ACCOUNT_ID, "autre"), proof)).isNull()
        assertThat(PushActionRequest.from(Intent(reply).putExtra(PushActionReceiver.EXTRA_NOTIFICATION_ID, 999), proof)).isNull()
    }

    @Test
    fun `un compte que la banniere n avait pas pose ne peut pas etre ajoute par un relais`() = runTest {
        every { session.currentUserId } returns null
        val reply = postedIntents().first { it.action == PushActionReceiver.ACTION_REPLY }
        val relay = typed("x").putExtra(PushActionReceiver.EXTRA_ACCOUNT_ID, "autre")

        assertThat(PushActionRequest.from(reply.filledBy(relay), proof)).isNull()
    }

    @Test
    fun `un intent forge sans preuve n agit pas`() {
        val forged = Intent(PushActionReceiver.ACTION_REPLY)
            .putExtra(PushActionReceiver.EXTRA_CONVERSATION_ID, "autre")

        assertThat(PushActionRequest.from(forged, proof)).isNull()
    }

    @Test
    fun `marquer comme lu porte la meme preuve et la meme conversation`() = runTest {
        val markRead = postedIntents().first { it.action == PushActionReceiver.ACTION_MARK_READ }

        assertThat(PushActionRequest.from(markRead, proof)?.conversationId).isEqualTo("6501a1b2c3d4e5f607182930")
        assertThat(PushActionRequest.from(Intent(markRead).putExtra(PushActionReceiver.EXTRA_CONVERSATION_ID, "autre"), proof)).isNull()
    }
}
