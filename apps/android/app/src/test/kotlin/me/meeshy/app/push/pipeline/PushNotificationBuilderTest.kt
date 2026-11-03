package me.meeshy.app.push.pipeline

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.app.R
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.PushDisplayGate
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26])
class PushNotificationBuilderTest {

    private lateinit var context: Context
    private lateinit var manager: NotificationManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancelAll()
    }

    private class Env : PushEnvironment {
        override fun isAppInForeground() = false
        override fun isSocketConnected() = false
        override fun interruptionFilter() = 1
        override suspend fun localUnreadConversations(): Int? = null
    }

    private fun pipeline(
        preferences: UserNotificationPreferences = UserNotificationPreferences(),
        gates: Set<PushDisplayGate> = emptySet(),
    ) = PushNotificationPipeline(
        context = context,
        preferencesStore = InMemoryNotificationPreferencesStore(preferences),
        activeConversationStore = ActiveConversationStore(),
        environment = Env(),
        enrichers = emptySet(),
        summaryNotifier = PushSummaryNotifier(context),
        displayGates = gates,
    )

    private fun group(vararg extra: Pair<String, String>) = IncomingPush.of(
        mapOf(
            "type" to "new_message", "notificationId" to "n1", "conversationId" to "c1",
            "title" to "served", "body" to "Salut", "senderDisplayName" to "Ana",
            "conversationTitle" to "Team", "conversationType" to "group",
            *extra,
        ),
    )

    private fun child(): Notification =
        manager.activeNotifications.single { (it.notification.flags and Notification.FLAG_GROUP_SUMMARY) == 0 }.notification

    private fun title(n: Notification) = n.extras.getCharSequence(NotificationCompat.EXTRA_TITLE).toString()
    private fun text(n: Notification) = n.extras.getCharSequence(NotificationCompat.EXTRA_TEXT).toString()

    @Test
    fun `un groupe est titre Nom dans Groupe avec le corps servi`() = runTest {
        pipeline().renderNow(group())

        assertThat(title(child())).contains("Ana")
        assertThat(title(child())).contains("Team")
        assertThat(text(child())).isEqualTo("Salut")
    }

    @Test
    fun `Apercu coupe donne le libelle Nouveau message`() = runTest {
        pipeline(UserNotificationPreferences(showPreview = false)).renderNow(group())

        assertThat(text(child())).isEqualTo(context.getString(R.string.push_new_message))
    }

    @Test
    fun `Nom coupe ne dit plus l expediteur`() = runTest {
        pipeline(UserNotificationPreferences(showSenderName = false)).renderNow(group())

        assertThat(title(child())).doesNotContain("Ana")
    }

    @Test
    fun `un message protege affiche le substitut localise`() = runTest {
        pipeline().renderNow(group("notificationLocKey" to "notification.view_once_message", "body" to "secret"))

        assertThat(text(child())).isEqualTo(context.getString(R.string.push_placeholder_view_once))
    }

    @Test
    fun `un vocal vide dit Message vocal et la duree`() = runTest {
        pipeline().renderNow(
            group("body" to "", "attachmentMimeType" to "audio/mp4", "attachmentDurationMs" to "12000", "title" to "Ana"),
        )

        assertThat(text(child())).isEqualTo("${context.getString(R.string.push_voice_message)} · 0:12")
    }

    @Test
    fun `une porte d affichage peut refuser la banniere`() = runTest {
        val posted = pipeline(gates = setOf(object : PushDisplayGate {
            override fun allows(push: IncomingPush) = false
        })).renderNow(group())

        assertThat(posted).isFalse()
        assertThat(manager.activeNotifications).isEmpty()
    }

    @Test
    fun `groupNotifications coupe pas de resume`() = runTest {
        pipeline(UserNotificationPreferences(groupNotifications = false)).renderNow(group())

        assertThat(manager.activeNotifications).hasLength(1)
    }
}
