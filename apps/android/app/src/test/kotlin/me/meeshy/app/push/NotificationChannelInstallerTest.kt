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
 * ARCHITECTURE.md §18 — the notification-channel taxonomy). The channel this installer
 * creates MUST carry the exact id the gateway already sends for Android non-call pushes
 * (`services/gateway/src/services/PushNotificationService.ts` `sendViaFCM`,
 * `message.android.notification.channelId = 'meeshy_notifications'`): when the OS
 * auto-renders a push while the app is backgrounded/killed (every non-call push today
 * carries both a `notification` and a `data` block), `MeeshyFcmService.onMessageReceived`
 * never runs — the system posts directly against that channel id. A client that only ever
 * created a differently-named channel (the former `meeshy_messages`, lazily, inside a
 * handler that doesn't run in this exact scenario) leaves that id unregistered on the
 * device precisely when push delivery matters most.
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
    fun `install creates the messages channel under the id the gateway targets`() {
        installer().install()

        val channel = manager.getNotificationChannel(NotificationChannelIds.CHANNEL_MESSAGES)

        assertThat(channel).isNotNull()
        assertThat(channel.importance).isEqualTo(NotificationManager.IMPORTANCE_HIGH)
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

        assertThat(manager.notificationChannels.count { it.id == NotificationChannelIds.CHANNEL_MESSAGES })
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
}
