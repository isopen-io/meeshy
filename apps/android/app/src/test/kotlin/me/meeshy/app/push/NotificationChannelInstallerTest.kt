package me.meeshy.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Behavioural spec for eager, process-start channel creation (`MeeshyApplication.onCreate`,
 * ARCHITECTURE.md §18 — the notification-channel taxonomy). Since `MeeshyFcmService.handleIntent`
 * hands every push to the pipeline (#13394), the system never renders on the v1 id the gateway
 * still names (`meeshy_notifications`) : one v2 channel per category, the v1 deleted after its
 * user-set mute is carried over, and the manifest's FCM default channel is the messages v2.
 */
// Pinned to the app's own `minSdk = 26` floor (`NotificationChannel` requires O+, and
// every device this code ships to is guaranteed to be at least that) rather than
// relying on Robolectric's ambient default SDK resolution.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26])
class NotificationChannelInstallerTest {

    private lateinit var context: Context
    private lateinit var manager: NotificationManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notificationChannels.forEach { manager.deleteNotificationChannel(it.id) }
    }

    private fun installer() = NotificationChannelInstaller(context)

    @Test
    fun `install creates the messages channel the pipeline posts to`() {
        installer().install()

        val channel = manager.getNotificationChannel(NotificationChannelIds.CHANNEL_MESSAGES_V2)

        assertThat(channel).isNotNull()
        assertThat(channel.importance).isEqualTo(NotificationManager.IMPORTANCE_HIGH)
    }

    @Test
    fun `the system settings list one messages channel, never the v1 next to the v2`() {
        manager.createNotificationChannel(
            NotificationChannel(NotificationChannelIds.CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH),
        )

        installer().install()

        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_MESSAGES)).isNull()
        assertThat(manager.notificationChannels.count { it.name.toString() == context.getString(me.meeshy.app.R.string.push_channel_messages_name) })
            .isEqualTo(1)
    }

    @Test
    fun `a v1 channel the user had muted or blocked stays quiet under its v2`() {
        manager.createNotificationChannel(
            NotificationChannel(NotificationChannelIds.CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_NONE),
        )
        manager.createNotificationChannel(
            NotificationChannel(NotificationChannelIds.CHANNEL_SOCIAL, "Social", NotificationManager.IMPORTANCE_LOW),
        )

        installer().install()

        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_MESSAGES_V2).importance)
            .isEqualTo(NotificationManager.IMPORTANCE_NONE)
        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_SOCIAL_V2).importance)
            .isEqualTo(NotificationManager.IMPORTANCE_LOW)
        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_SYSTEM_V2).importance)
            .isEqualTo(NotificationManager.IMPORTANCE_HIGH)
    }

    @Test
    fun `install deletes the stale pre-drift legacy channel`() {
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.LEGACY_CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )

        installer().install()

        assertThat(manager.getNotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_MESSAGES)).isNull()
    }

    @Test
    fun `install is idempotent across repeated app starts`() {
        installer().install()
        installer().install()

        assertThat(manager.notificationChannels.count { it.id == NotificationChannelIds.CHANNEL_MESSAGES_V2 })
            .isEqualTo(1)
    }

    @Test
    fun `install never touches the calls channel`() {
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_CALLS,
                "Calls",
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )

        installer().install()

        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_CALLS)).isNotNull()
    }

    @Test
    fun `install creates one channel per category`() {
        installer().install()

        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_SOCIAL_V2)).isNotNull()
        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_SYSTEM_V2)).isNotNull()
        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_MESSAGES_V2)).isNotNull()
    }

    @Test
    fun `the channels that ring vibrate and the silent one does not`() {
        installer().install()

        listOf(
            NotificationChannelIds.CHANNEL_MESSAGES_V2,
            NotificationChannelIds.CHANNEL_SOCIAL_V2,
            NotificationChannelIds.CHANNEL_SYSTEM_V2,
        ).forEach { id -> assertThat(manager.getNotificationChannel(id).shouldVibrate()).isTrue() }
        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_SILENT).shouldVibrate()).isFalse()
    }

    @Test
    fun `the messages channel is named and described by the app strings, not hardcoded English`() {
        installer().install()

        val channel = manager.getNotificationChannel(NotificationChannelIds.CHANNEL_MESSAGES_V2)

        assertThat(channel.name.toString()).isEqualTo(context.getString(me.meeshy.app.R.string.push_channel_messages_name))
        assertThat(channel.description).isEqualTo(context.getString(me.meeshy.app.R.string.push_channel_messages_description))
    }

    @Test
    fun `the vibration-less pre-v2 social and system channels are deleted`() {
        listOf(NotificationChannelIds.CHANNEL_SOCIAL, NotificationChannelIds.CHANNEL_SYSTEM).forEach {
            manager.createNotificationChannel(NotificationChannel(it, "old", NotificationManager.IMPORTANCE_DEFAULT))
        }

        installer().install()

        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_SOCIAL)).isNull()
        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_SYSTEM)).isNull()
    }

    @Test
    fun `install creates the silent channel without sound nor heads-up`() {
        installer().install()

        val silent = manager.getNotificationChannel(NotificationChannelIds.CHANNEL_SILENT)

        assertThat(silent).isNotNull()
        assertThat(silent.importance).isEqualTo(NotificationManager.IMPORTANCE_LOW)
        assertThat(silent.sound).isNull()
    }

    @Test
    fun `every category lands on its v2 channel`() {
        installer().install()

        assertThat(NotificationChannelIds.forCategory(me.meeshy.sdk.model.push.PushChannelCategory.MESSAGES))
            .isEqualTo(NotificationChannelIds.CHANNEL_MESSAGES_V2)
        assertThat(manager.getNotificationChannel(NotificationChannelIds.forCategory(me.meeshy.sdk.model.push.PushChannelCategory.SOCIAL)))
            .isNotNull()
    }

    @Test
    fun `every channel of the plan is created at start in its group`() {
        installer().install()

        me.meeshy.sdk.model.NotificationChannelPlan.channels.forEach { spec ->
            val channel = manager.getNotificationChannel(spec.id)
            assertThat(channel).isNotNull()
            assertThat(channel.group).isEqualTo(spec.group.id)
            assertThat(channel.importance).isEqualTo(spec.importance.androidLevel)
        }
        assertThat(manager.notificationChannelGroups.map { it.id })
            .containsExactlyElementsIn(me.meeshy.sdk.model.NotificationChannelGroup.entries.map { it.id })
    }

    @Test
    fun `the incoming calls channel rings and vibrates while missed calls have their own channel`() {
        installer().install()

        val calls = manager.getNotificationChannel(NotificationChannelIds.CHANNEL_CALLS)
        assertThat(calls.sound).isNotNull()
        assertThat(calls.shouldVibrate()).isTrue()
        assertThat(manager.getNotificationChannel(NotificationChannelIds.CHANNEL_CALLS_MISSED)).isNotNull()
        assertThat(NotificationChannelIds.CHANNEL_CALLS_MISSED).isNotEqualTo(NotificationChannelIds.CHANNEL_CALLS)
    }

    @Test
    fun `the ephemeral channel is discreet`() {
        installer().install()

        val channel = manager.getNotificationChannel(NotificationChannelIds.CHANNEL_EPHEMERAL)

        assertThat(channel.importance).isEqualTo(NotificationManager.IMPORTANCE_LOW)
        assertThat(channel.sound).isNull()
        assertThat(channel.shouldVibrate()).isFalse()
    }

    @Test
    fun `the obsolete calls v1 channel is deleted`() {
        manager.createNotificationChannel(
            NotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_CALLS, "Calls", NotificationManager.IMPORTANCE_HIGH),
        )

        installer().install()

        assertThat(manager.getNotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_CALLS)).isNull()
    }

    @Test
    fun `a second start changes nothing`() {
        installer().install()
        val first = manager.notificationChannels.map { it.id }.sorted()

        installer().install()

        assertThat(manager.notificationChannels.map { it.id }.sorted()).isEqualTo(first)
    }

    @Test
    fun `a push routes to the channel of its category and an unknown type is never lost`() {
        fun channelOf(type: String?, ephemeral: Int? = null) = NotificationChannelIds.forPayload(
            me.meeshy.sdk.model.push.PushPayload(type = type, ephemeralDuration = ephemeral),
        )

        assertThat(channelOf("user_mentioned")).isEqualTo(NotificationChannelIds.CHANNEL_MENTIONS)
        assertThat(channelOf("friend_request")).isEqualTo(NotificationChannelIds.CHANNEL_FRIENDS)
        assertThat(channelOf("missed_call")).isEqualTo(NotificationChannelIds.CHANNEL_CALLS_MISSED)
        assertThat(channelOf("new_message", ephemeral = 30)).isEqualTo(NotificationChannelIds.CHANNEL_EPHEMERAL)
        assertThat(channelOf("type_from_the_future")).isEqualTo(NotificationChannelIds.CHANNEL_MESSAGES_V2)
        assertThat(channelOf(null)).isEqualTo(NotificationChannelIds.CHANNEL_MESSAGES_V2)
    }
}
