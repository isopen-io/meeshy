package me.meeshy.app.ongoing

import android.content.Context
import android.app.NotificationManager
import android.content.Intent
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VoiceRecordingOngoingNotificationsTest {

    private class FakeLauncher(private val accepts: Boolean) : RecordingServiceLauncher {
        val started = mutableListOf<VoiceRecordingSnapshot>()
        var stops = 0
        override fun start(snapshot: VoiceRecordingSnapshot): Boolean { started += snapshot; return accepts }
        override fun stop() { stops++ }
    }

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val snapshot = VoiceRecordingSnapshot(42L, "Voice recording", isFinished = false)

    @Test
    fun `a take opens the foreground service and tells the bridge the mic survives the background`() {
        val bridge = VoiceRecordingActivityBridge()
        val launcher = FakeLauncher(accepts = true)

        VoiceRecordingOngoingNotifications(context, bridge, launcher, ProcessForegroundState()).show(snapshot)

        assertThat(launcher.started).containsExactly(snapshot)
        assertThat(bridge.keepsRecordingInBackground).isTrue()
    }

    @Test
    fun `a refused service leaves the take to the old foreground-only behaviour`() {
        val bridge = VoiceRecordingActivityBridge()

        VoiceRecordingOngoingNotifications(context, bridge, FakeLauncher(accepts = false), ProcessForegroundState()).show(snapshot)

        assertThat(bridge.keepsRecordingInBackground).isFalse()
    }

    @Test
    fun `the service starts once per take, later updates only refresh the notification`() {
        val launcher = FakeLauncher(accepts = true)
        val sink = VoiceRecordingOngoingNotifications(context, VoiceRecordingActivityBridge(), launcher, ProcessForegroundState())

        sink.show(snapshot)
        sink.show(snapshot.copy(statusLabel = "Autre"))

        assertThat(launcher.started).hasSize(1)
    }

    @Test
    fun `ending the take stops the service and forgets the keep-alive`() {
        val bridge = VoiceRecordingActivityBridge()
        val launcher = FakeLauncher(accepts = true)
        val sink = VoiceRecordingOngoingNotifications(context, bridge, launcher, ProcessForegroundState())
        sink.show(snapshot)

        sink.cancel()

        assertThat(launcher.stops).isEqualTo(1)
        assertThat(bridge.keepsRecordingInBackground).isFalse()
    }

    @Test
    fun `the notification buttons reach the composer as stop and cancel requests`() = runTest {
        val bridge = VoiceRecordingActivityBridge()
        val seen = mutableListOf<String>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { bridge.stopRequests.collect { seen += "stop" } }
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { bridge.cancelRequests.collect { seen += "cancel" } }
        VoiceRecordingOngoingNotifications(context, bridge, FakeLauncher(accepts = true), ProcessForegroundState()).show(snapshot)

        context.sendBroadcast(Intent(VoiceRecordingOngoingNotifications.ACTION_CANCEL).setPackage(context.packageName))
        context.sendBroadcast(Intent(VoiceRecordingOngoingNotifications.ACTION_STOP).setPackage(context.packageName))
        shadowOf(Looper.getMainLooper()).idle()

        assertThat(seen).containsExactly("cancel", "stop").inOrder()
    }

    private fun foreground(visible: Boolean) = ProcessForegroundState().apply { onVisibilityChanged(visible) }

    private fun posted(id: Int) = shadowOf(context.getSystemService(NotificationManager::class.java)).getNotification(id)

    @Test
    fun `a service lost after the app left stops the take into the tray and says so`() = runTest {
        val bridge = VoiceRecordingActivityBridge()
        val stops = mutableListOf<Unit>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { bridge.stopRequests.collect { stops += it } }
        VoiceRecordingOngoingNotifications(context, bridge, FakeLauncher(accepts = true), foreground(visible = false)).show(snapshot)

        VoiceRecordingService.refusal?.invoke()

        assertThat(stops).hasSize(1)
        assertThat(bridge.keepsRecordingInBackground).isFalse()
        assertThat(posted(VoiceRecordingOngoingNotifications.KEPT_IN_TRAY_ID)).isNotNull()
    }

    @Test
    fun `a service lost while the app is on screen keeps the take and puts the notification back`() = runTest {
        val bridge = VoiceRecordingActivityBridge()
        val stops = mutableListOf<Unit>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { bridge.stopRequests.collect { stops += it } }
        VoiceRecordingOngoingNotifications(context, bridge, FakeLauncher(accepts = true), foreground(visible = true)).show(snapshot)

        VoiceRecordingService.refusal?.invoke()

        assertThat(stops).isEmpty()
        assertThat(bridge.keepsRecordingInBackground).isFalse()
        assertThat(posted(VoiceRecordingOngoingNotifications.NOTIFICATION_ID)).isNotNull()
        assertThat(posted(VoiceRecordingOngoingNotifications.KEPT_IN_TRAY_ID)).isNull()
    }

    @Test
    fun `a late refusal after the take ended stops nothing`() = runTest {
        val bridge = VoiceRecordingActivityBridge()
        val stops = mutableListOf<Unit>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { bridge.stopRequests.collect { stops += it } }
        val sink = VoiceRecordingOngoingNotifications(context, bridge, FakeLauncher(accepts = true), foreground(visible = false))
        sink.show(snapshot)
        sink.cancel()

        VoiceRecordingService.refusal?.invoke()

        assertThat(stops).isEmpty()
        assertThat(posted(VoiceRecordingOngoingNotifications.KEPT_IN_TRAY_ID)).isNull()
    }

    @Test
    fun `with the app's notifications turned off the microphone is never kept in the background unseen`() {
        shadowOf(context.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)
        val bridge = VoiceRecordingActivityBridge()
        val launcher = FakeLauncher(accepts = true)

        VoiceRecordingOngoingNotifications(context, bridge, launcher, ProcessForegroundState()).show(snapshot)

        assertThat(launcher.started).isEmpty()
        assertThat(bridge.keepsRecordingInBackground).isFalse()
    }

    @Test
    fun `a blocked ongoing channel keeps the take on screen only`() {
        OngoingChannel.ensure(context)
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = manager.getNotificationChannel(me.meeshy.app.push.NotificationChannelIds.CHANNEL_ONGOING)
        channel.importance = NotificationManager.IMPORTANCE_NONE
        manager.createNotificationChannel(channel)
        val launcher = FakeLauncher(accepts = true)

        VoiceRecordingOngoingNotifications(context, VoiceRecordingActivityBridge(), launcher, ProcessForegroundState()).show(snapshot)

        assertThat(launcher.started).isEmpty()
    }
}
