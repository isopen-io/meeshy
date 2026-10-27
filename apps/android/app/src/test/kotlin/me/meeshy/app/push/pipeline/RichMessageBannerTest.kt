package me.meeshy.app.push.pipeline

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.app.R
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.PushTapExtras
import me.meeshy.app.push.media.PushMediaFetcher
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.app.push.PushActionReceiver
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La bannière d'un message comme celle d'iOS : icône Meeshy, expéditeur, actions, jamais sur un message protégé. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class RichMessageBannerTest {

    private lateinit var context: Context
    private lateinit var manager: NotificationManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancelAll()
    }

    private val fetcher = mockk<PushMediaFetcher>().also {
        coEvery { it.fetch(any(), any(), any(), any(), any()) } returns null
    }

    private val session = mockk<SessionRepository>(relaxed = true) {
        every { currentUserId } returns "me"
    }

    private fun pipeline(): PushNotificationPipeline {
        return PushNotificationPipeline(
            context = context,
            preferencesStore = InMemoryNotificationPreferencesStore(),
            activeConversationStore = ActiveConversationStore(),
            environment = object : PushEnvironment {
                override fun isAppInForeground() = false
                override fun isSocketConnected() = false
                override fun interruptionFilter() = 1
                override suspend fun localUnreadConversations(): Int? = null
            },
            enrichers = setOf(MessagingStyleEnricher(context, fetcher), BigTextEnricher(), MessageActionsEnricher(context, session)),
            summaryNotifier = PushSummaryNotifier(context),
        )
    }

    private fun push(vararg extra: Pair<String, String>) = IncomingPush.of(
        mapOf(
            "type" to "new_message",
            "notificationId" to "n1",
            "conversationId" to "6501a1b2c3d4e5f607182930",
            "senderId" to "u1",
            "senderDisplayName" to "Alice",
            "title" to "Alice",
            "body" to "Salut",
            *extra,
        ),
    )

    private fun child(): Notification =
        manager.activeNotifications.single { (it.notification.flags and Notification.FLAG_GROUP_SUMMARY) == 0 }.notification

    private fun StatusBarNotification.titles() = notification.actions.orEmpty().map { it.title.toString() }

    @Test
    fun `la petite icone est le symbole Meeshy et non l enveloppe du systeme`() = runTest {
        pipeline().renderNow(push())

        assertThat(child().smallIcon.resId).isEqualTo(R.drawable.ic_stat_meeshy)
    }

    @Test
    fun `la banniere nomme l expediteur dans un style de conversation`() = runTest {
        pipeline().renderNow(push("conversationType" to "direct"))

        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(child())!!
        assertThat(style.messages.single().text.toString()).isEqualTo("Salut")
        assertThat(style.messages.single().person?.name.toString()).isEqualTo("Alice")
        assertThat(style.isGroupConversation).isFalse()
    }

    @Test
    fun `un groupe porte le nom de la conversation`() = runTest {
        pipeline().renderNow(push("conversationType" to "group", "conversationTitle" to "Équipe"))

        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(child())!!
        assertThat(style.isGroupConversation).isTrue()
        assertThat(style.conversationTitle.toString()).isEqualTo("Équipe")
    }

    @Test
    fun `le message suivant de la meme conversation s ajoute a l historique`() = runTest {
        val pipeline = pipeline()
        pipeline.renderNow(push())
        pipeline.renderNow(push("notificationId" to "n2", "body" to "Tu es là ?"))

        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(child())!!
        assertThat(style.messages.map { it.text.toString() }).containsExactly("Salut", "Tu es là ?").inOrder()
    }

    @Test
    fun `un message offre repondre et marquer comme lu`() = runTest {
        pipeline().renderNow(push())

        val actions = manager.activeNotifications.first { it.notification.actions != null }
        assertThat(actions.titles()).containsExactly(
            context.getString(R.string.push_action_reply),
            context.getString(R.string.push_action_mark_read),
        ).inOrder()
        assertThat(actions.notification.actions[0].remoteInputs).hasLength(1)
    }

    @Test
    fun `un message chiffre ou ephemere n offre aucune action`() = runTest {
        val pipeline = pipeline()
        pipeline.renderNow(push("notificationLocKey" to "message.encrypted"))
        assertThat(child().actions).isNull()

        manager.cancelAll()
        pipeline.renderNow(push("notificationId" to "n3", "ephemeralDuration" to "30"))
        assertThat(child().actions).isNull()
    }

    @Test
    fun `le toucher transmet type et identifiants du contenu`() = runTest {
        pipeline().renderNow(
            IncomingPush.of(
                mapOf(
                    "type" to "post_comment", "notificationId" to "n4", "postId" to "p1",
                    "postType" to "REEL", "commentId" to "k1", "senderId" to "u9", "title" to "Bob", "body" to "Bravo",
                ),
            ),
        )

        val tap = child().contentIntent
        val intent = org.robolectric.Shadows.shadowOf(tap).savedIntent
        val (payload, _) = PushTapExtras.read(intent)
        assertThat(payload.type).isEqualTo("post_comment")
        assertThat(payload.postId).isEqualTo("p1")
        assertThat(payload.postType).isEqualTo("REEL")
        assertThat(payload.commentId).isEqualTo("k1")
        assertThat(payload.senderId).isEqualTo("u9")
        assertThat(intent.component?.className).isEqualTo("me.meeshy.app.MainActivity")
        assertThat(intent.flags and Intent.FLAG_ACTIVITY_SINGLE_TOP).isNotEqualTo(0)
    }

    @Test
    fun `la photo de l expediteur d un message protege n est jamais telechargee`() = runTest {
        val avatar = "https://gate.meeshy.me/u/alice.jpg"
        val pipeline = pipeline()
        pipeline.renderNow(push("senderAvatar" to avatar, "notificationLocKey" to "message.viewOnce"))
        pipeline.renderNow(push("notificationId" to "n5", "senderAvatar" to avatar, "ephemeralDuration" to "30"))

        coVerify(exactly = 0) { fetcher.fetch(avatar, any(), any(), any(), any()) }

        pipeline.renderNow(push("notificationId" to "n6", "senderAvatar" to avatar))
        coVerify(exactly = 1) { fetcher.fetch(avatar, any(), any(), any(), any()) }
    }

    @Test
    fun `les boutons portent le compte connecte au rendu`() = runTest {
        pipeline().renderNow(push())

        val reply = manager.activeNotifications.first { it.notification.actions != null }.notification.actions[0].actionIntent
        val intent = org.robolectric.Shadows.shadowOf(reply).savedIntent
        assertThat(intent.getStringExtra(PushActionReceiver.EXTRA_ACCOUNT_ID)).isEqualTo("me")
    }
}
