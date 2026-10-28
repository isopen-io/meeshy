package me.meeshy.app.ongoing

import android.app.Application
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** Le service de premier plan « microphone » : il tient la prise vivante quand l'app quitte l'écran. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28, 34])
class VoiceRecordingServiceTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun startIntent(startedAt: Long = 1_700_000_000_000L) =
        VoiceRecordingService.startIntent(context, VoiceRecordingSnapshot(startedAt, "Voice recording", isFinished = false))

    @Test
    fun `starting enters the foreground with a chronometer anchored on the take`() {
        val controller = Robolectric.buildService(VoiceRecordingService::class.java, startIntent()).create().startCommand(0, 1)
        val shadow = shadowOf(controller.get())

        val notification = shadow.lastForegroundNotification
        assertThat(shadow.lastForegroundNotificationId).isEqualTo(VoiceRecordingOngoingNotifications.NOTIFICATION_ID)
        assertThat(notification.`when`).isEqualTo(1_700_000_000_000L)
        assertThat(notification.extras.getBoolean(android.app.Notification.EXTRA_SHOW_CHRONOMETER)).isTrue()
        assertThat(notification.flags and android.app.Notification.FLAG_ONGOING_EVENT).isNotEqualTo(0)
    }

    @Test
    fun `the notification offers Stop and Cancel through immutable intents`() {
        val controller = Robolectric.buildService(VoiceRecordingService::class.java, startIntent()).create().startCommand(0, 1)
        val actions = shadowOf(controller.get()).lastForegroundNotification.actions

        assertThat(actions.map { it.title.toString() }).containsExactly("Stop", "Cancel").inOrder()
        actions.forEach { action ->
            assertThat(shadowOf(action.actionIntent).flags and PendingIntent.FLAG_IMMUTABLE).isNotEqualTo(0)
            assertThat(shadowOf(action.actionIntent).savedIntent.`package`).isEqualTo(context.packageName)
        }
        val broadcasts = actions.map { shadowOf(it.actionIntent).savedIntent.action }
        assertThat(broadcasts).containsExactly(VoiceRecordingOngoingNotifications.ACTION_STOP, VoiceRecordingOngoingNotifications.ACTION_CANCEL).inOrder()
    }

    @Test
    fun `the lock screen only sees a neutral public version`() {
        val controller = Robolectric.buildService(VoiceRecordingService::class.java, startIntent()).create().startCommand(0, 1)
        val notification = shadowOf(controller.get()).lastForegroundNotification

        assertThat(notification.visibility).isEqualTo(android.app.Notification.VISIBILITY_PRIVATE)
        assertThat(notification.publicVersion).isNotNull()
        assertThat(notification.publicVersion.extras.getCharSequence(android.app.Notification.EXTRA_TEXT).toString())
            .isEqualTo(context.getString(me.meeshy.app.R.string.ongoing_activity_public))
        assertThat(notification.extras.keySet().filter { it.contains("conversation", ignoreCase = true) }).isEmpty()
    }

    @Test
    fun `a restart without a take stops itself rather than hold the microphone for nothing`() {
        val controller = Robolectric.buildService(VoiceRecordingService::class.java, Intent(context, VoiceRecordingService::class.java))
            .create().startCommand(0, 1)

        assertThat(shadowOf(controller.get()).isStoppedBySelf).isTrue()
    }

    @Test
    fun `destroying the service removes its notification`() {
        val controller = Robolectric.buildService(VoiceRecordingService::class.java, startIntent()).create().startCommand(0, 1)
        val service = controller.get()

        controller.destroy()

        assertThat(shadowOf(service).isForegroundStopped).isTrue()
        assertThat(shadowOf(service).isLastForegroundNotificationAttached).isFalse()
    }

    @Test
    fun `the manifest declares it as a non exported microphone foreground service`() {
        org.junit.Assume.assumeTrue(android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q)
        val info = context.packageManager.getServiceInfo(android.content.ComponentName(context, VoiceRecordingService::class.java), 0)

        assertThat(info.exported).isFalse()
        assertThat(info.foregroundServiceType and android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE).isNotEqualTo(0)
    }
}
