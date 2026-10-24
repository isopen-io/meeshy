package me.meeshy.app.push.pipeline

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.MessageNotificationId
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.FocusFilterSnapshot
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.model.push.PushGrouping
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The message path of the push pipeline : data-only and legacy pushes rendered once,
 * gated by the hydrated preferences, posted on the category / silent channel, enriched
 * phase by phase inside the FCM deadline, grouped with a summary.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26])
class PushNotificationPipelineTest {

    private lateinit var context: Context
    private lateinit var manager: NotificationManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancelAll()
    }

    private class FakeEnvironment(
        var foreground: Boolean = false,
        var socket: Boolean = false,
        var filter: Int = FocusFilterSnapshot.INTERRUPTION_FILTER_ALL,
        var unread: Int? = null,
        var now: Long = 1_000L,
    ) : PushEnvironment {
        override fun isAppInForeground(): Boolean = foreground
        override fun isSocketConnected(): Boolean = socket
        override fun interruptionFilter(): Int = filter
        override suspend fun localUnreadConversations(): Int? = unread
        override fun nowMillis(): Long = now
    }

    private fun pipeline(
        preferences: UserNotificationPreferences = UserNotificationPreferences(),
        environment: PushEnvironment = FakeEnvironment(),
        enrichers: Set<NotificationEnricher> = setOf(GroupAndBadgeEnricher(), EphemeralExpirationEnricher()),
        active: ActiveConversationStore = ActiveConversationStore(),
    ) = PushNotificationPipeline(
        context = context,
        preferencesStore = InMemoryNotificationPreferencesStore(preferences),
        activeConversationStore = active,
        environment = environment,
        enrichers = enrichers,
        summaryNotifier = PushSummaryNotifier(context),
    )

    private fun push(vararg pairs: Pair<String, String>) = IncomingPush.of(mapOf(*pairs))

    private fun message(id: String = "n1", vararg extra: Pair<String, String>) = push(
        "type" to "new_message",
        "notificationId" to id,
        "conversationId" to "c1",
        "title" to "Alice",
        "body" to "Salut",
        *extra,
    )

    private fun active(): List<StatusBarNotification> = manager.activeNotifications.toList()

    private fun child(): Notification = active().single { !it.notification.isSummary() }.notification

    private fun Notification.isSummary(): Boolean = (flags and Notification.FLAG_GROUP_SUMMARY) != 0

    @Test
    fun `un push data-only recu en arriere-plan est rendu sur le canal des messages`() = runTest {
        val posted = pipeline().renderNow(message())

        assertThat(posted).isTrue()
        val notification = child()
        assertThat(notification.channelId).isEqualTo(NotificationChannelIds.CHANNEL_MESSAGES)
        assertThat(notification.extras.getCharSequence(NotificationCompat.EXTRA_TITLE).toString()).isEqualTo("Alice")
        assertThat(notification.extras.getCharSequence(NotificationCompat.EXTRA_TEXT).toString()).isEqualTo("Salut")
    }

    @Test
    fun `un push legacy garde le titre de son bloc notification`() = runTest {
        val legacy = IncomingPush.of(
            data = mapOf("type" to "new_message", "notificationId" to "n1"),
            notificationTitle = "Bob",
            notificationBody = "Coucou",
            hasNotificationBlock = true,
        )

        pipeline().renderNow(legacy)

        assertThat(child().extras.getCharSequence(NotificationCompat.EXTRA_TITLE).toString()).isEqualTo("Bob")
    }

    @Test
    fun `un push sans rien a montrer est une synchronisation silencieuse`() = runTest {
        val posted = pipeline().renderNow(push("type" to "new_message", "conversationId" to "c1"))

        assertThat(posted).isFalse()
        assertThat(active()).isEmpty()
    }

    @Test
    fun `un push recu deux fois n est rendu qu une fois`() = runTest {
        val pipeline = pipeline()

        assertThat(pipeline.renderNow(message("n1"))).isTrue()
        assertThat(pipeline.renderNow(message("n1"))).isFalse()
    }

    @Test
    fun `un refus des preferences en arriere-plan livre en silence`() = runTest {
        pipeline(preferences = UserNotificationPreferences(newMessageEnabled = false)).renderNow(message())

        assertThat(child().channelId).isEqualTo(NotificationChannelIds.CHANNEL_SILENT)
    }

    @Test
    fun `le ne pas deranger systeme lu a la reception rend la livraison silencieuse`() = runTest {
        val environment = FakeEnvironment(filter = FocusFilterSnapshot.INTERRUPTION_FILTER_NONE)

        pipeline(environment = environment).renderNow(message())

        assertThat(child().channelId).isEqualTo(NotificationChannelIds.CHANNEL_SILENT)
    }

    @Test
    fun `au premier plan la socket vivante supprime la banniere systeme`() = runTest {
        val posted = pipeline(environment = FakeEnvironment(foreground = true, socket = true)).renderNow(message())

        assertThat(posted).isFalse()
        assertThat(active()).isEmpty()
    }

    @Test
    fun `la conversation ouverte au premier plan n est pas annoncee`() = runTest {
        val store = ActiveConversationStore().apply { setActive("c1") }

        val posted = pipeline(environment = FakeEnvironment(foreground = true), active = store).renderNow(message())

        assertThat(posted).isFalse()
    }

    @Test
    fun `un type social part sur le canal social`() = runTest {
        pipeline().renderNow(push("type" to "post_like", "notificationId" to "n9", "postId" to "p1", "title" to "Like"))

        assertThat(child().channelId).isEqualTo(NotificationChannelIds.CHANNEL_SOCIAL)
    }

    @Test
    fun `le push est groupe par conversation avec un recapitulatif et le badge`() = runTest {
        pipeline(environment = FakeEnvironment(unread = 5)).renderNow(message())

        val notifications = active()
        val summary = notifications.single { it.notification.isSummary() }
        assertThat(summary.id).isEqualTo(PushGrouping.summaryNotificationId("conversation:c1"))
        assertThat(child().group).isEqualTo("conversation:c1")
        assertThat(child().number).isEqualTo(5)
    }

    @Test
    fun `le badge de la charge l emporte sur le compte local`() = runTest {
        pipeline(environment = FakeEnvironment(unread = 5)).renderNow(message("n1", "unreadCount" to "2"))

        assertThat(child().number).isEqualTo(2)
    }

    @Test
    fun `un message ephemere expire avec sa duree`() = runTest {
        pipeline().renderNow(message("n1", "ephemeralDuration" to "30"))

        assertThat(child().timeoutAfter).isEqualTo(30_000L)
    }

    @Test
    fun `replacesNotificationId retire la notification remplacee`() = runTest {
        val pipeline = pipeline()
        pipeline.renderNow(push("type" to "post_like", "notificationId" to "old", "title" to "Like"))

        pipeline.renderNow(push("type" to "post_like", "notificationId" to "new", "title" to "Like", "replacesNotificationId" to "old"))

        assertThat(active().map { it.id }).doesNotContain(MessageNotificationId.forNotification("old"))
        assertThat(active().map { it.id }).contains(MessageNotificationId.forNotification("new"))
    }

    @Test
    fun `un enrichisseur qui leve ou depasse l echeance n empeche pas la publication`() = runTest {
        val failing = object : NotificationEnricher {
            override val phase: EnrichmentPhase = EnrichmentPhase.BODY
            override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
                throw IllegalStateException("boom")
            }
        }
        val slow = object : NotificationEnricher {
            override val phase: EnrichmentPhase = EnrichmentPhase.MEDIA
            override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
                delay(60_000L)
                builder.setContentTitle("trop tard")
            }
        }

        val posted = pipeline(enrichers = setOf(failing, slow, GroupAndBadgeEnricher())).renderNow(message())

        assertThat(posted).isTrue()
        assertThat(child().extras.getCharSequence(NotificationCompat.EXTRA_TITLE).toString()).isEqualTo("Alice")
    }

    @Test
    fun `les enrichisseurs s executent dans l ordre des phases`() = runTest {
        val log = mutableListOf<EnrichmentPhase>()
        fun recording(step: EnrichmentPhase) = object : NotificationEnricher {
            override val phase: EnrichmentPhase = step
            override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
                log += step
            }
        }

        pipeline(enrichers = setOf(recording(EnrichmentPhase.EXPIRATION), recording(EnrichmentPhase.BODY), recording(EnrichmentPhase.MEDIA)))
            .renderNow(message())

        assertThat(log).containsExactly(EnrichmentPhase.BODY, EnrichmentPhase.MEDIA, EnrichmentPhase.EXPIRATION).inOrder()
    }
}
