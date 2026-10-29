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
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.net.InMemoryTokenStore
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
    private val tokenStore = InMemoryTokenStore(jwt = "jwt", userId = "me")

    private val locks = InMemoryConversationLockStore()

    private suspend fun postedIntents(
        data: Map<String, String> = mapOf(
            "type" to "new_message", "notificationId" to "n1", "conversationId" to "6501a1b2c3d4e5f607182930",
            "messageId" to "6501a1b2c3d4e5f607182999",
            "senderId" to "u1", "senderDisplayName" to "Alice", "title" to "Alice", "body" to "Salut",
        ),
    ): List<Intent> {
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
            enrichers = setOf(MessagingStyleEnricher(context, mockk<PushMediaFetcher>(relaxed = true)), BigTextEnricher(), MessageActionsEnricher(context, session, proof, tokenStore, locks)),
            summaryNotifier = PushSummaryNotifier(context),
        )
        pipeline.renderNow(IncomingPush.of(data))
        return manager.activeNotifications.firstOrNull { it.notification.actions != null }?.notification?.actions
            .orEmpty()
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
        tokenStore.userId = null
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

    /**
     * Un push réveille d'ordinaire un processus FROID, où la session en mémoire n'est pas encore restaurée
     * (`currentUserId` nul) : la bannière doit quand même nommer son compte, lu dans le miroir persisté
     * (`TokenStore.userId`). Sans lui, la réponse partirait sous le compte connecté au moment du toucher,
     * quel qu'il soit.
     */
    @Test
    fun `une banniere posee par un processus froid nomme quand meme son compte`() = runTest {
        every { session.currentUserId } returns null
        val actions = postedIntents()

        actions.forEach { assertThat(PushActionRequest.from(it, proof)?.accountId).isEqualTo("me") }
    }

    private val commentPush = mapOf(
        "type" to "post_comment", "notificationId" to "n2", "postId" to "6501a1b2c3d4e5f607182931",
        "commentId" to "6501a1b2c3d4e5f607182932", "title" to "Bob", "body" to "a commenté votre post",
    )

    @Test
    fun `la reponse porte le message cite sous la meme preuve`() = runTest {
        val reply = postedIntents().first { it.action == PushActionReceiver.ACTION_REPLY }

        assertThat(PushActionRequest.from(reply.filledBy(typed("ok")), proof)?.messageId).isEqualTo("6501a1b2c3d4e5f607182999")
        assertThat(PushActionRequest.from(Intent(reply).putExtra(PushActionReceiver.EXTRA_MESSAGE_ID, "autre"), proof)).isNull()
    }

    @Test
    fun `un relais ne peut pas greffer un message cite a une bannière qui n en citait pas`() = runTest {
        val reply = postedIntents(
            mapOf("type" to "new_message", "notificationId" to "n3", "conversationId" to "6501a1b2c3d4e5f607182930", "title" to "Alice", "body" to "Salut"),
        ).first { it.action == PushActionReceiver.ACTION_REPLY }
        val relay = typed("x").putExtra(PushActionReceiver.EXTRA_MESSAGE_ID, "autre")

        assertThat(PushActionRequest.from(reply, proof)?.messageId).isNull()
        assertThat(PushActionRequest.from(reply.filledBy(relay), proof)).isNull()
    }

    @Test
    fun `une conversation verrouillee par code n offre aucune action`() = runTest {
        locks.setLock("6501a1b2c3d4e5f607182930", "1234")

        assertThat(postedIntents()).isEmpty()
    }

    @Test
    fun `une notification de commentaire offre commenter avec un champ de saisie, sous preuve`() = runTest {
        val actions = postedIntents(commentPush)
        val comment = actions.single()

        assertThat(comment.action).isEqualTo(PushActionReceiver.ACTION_COMMENT)
        val notification = manager.activeNotifications.first { it.notification.actions != null }.notification
        assertThat(notification.actions.single().title.toString()).isEqualTo(context.getString(me.meeshy.app.R.string.push_action_comment))
        assertThat(notification.actions.single().remoteInputs).hasLength(1)
        val request = PushActionRequest.from(comment.filledBy(typed("Bravo")), proof)
        assertThat(request?.postId).isEqualTo("6501a1b2c3d4e5f607182931")
        assertThat(request?.commentId).isEqualTo("6501a1b2c3d4e5f607182932")
        assertThat(request?.type).isEqualTo("post_comment")
        assertThat(request?.serverNotificationId).isEqualTo("n2")
        assertThat(request?.conversationId).isNull()
        assertThat(request?.reply).isEqualTo("Bravo")
        assertThat(request?.accountId).isEqualTo("me")
    }

    @Test
    fun `un intent de commentaire dont le post le type ou le commentaire est reecrit n agit pas`() = runTest {
        val comment = postedIntents(commentPush).single()

        listOf(
            PushActionReceiver.EXTRA_POST_ID, PushActionReceiver.EXTRA_COMMENT_ID, PushActionReceiver.EXTRA_TYPE,
            PushActionReceiver.EXTRA_SERVER_NOTIFICATION_ID, PushActionReceiver.EXTRA_ACCOUNT_ID,
        ).forEach {
            assertThat(PushActionRequest.from(Intent(comment).putExtra(it, "autre"), proof)).isNull()
        }
    }

    @Test
    fun `une reaction a un post n offre aucune action`() = runTest {
        assertThat(postedIntents(commentPush + mapOf("type" to "post_like", "notificationId" to "n4"))).isEmpty()
    }
}
