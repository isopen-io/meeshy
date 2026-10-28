package me.meeshy.app.ongoing

import android.content.Context
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

        VoiceRecordingOngoingNotifications(context, bridge, launcher).show(snapshot)

        assertThat(launcher.started).containsExactly(snapshot)
        assertThat(bridge.keepsRecordingInBackground).isTrue()
    }

    @Test
    fun `a refused service leaves the take to the old foreground-only behaviour`() {
        val bridge = VoiceRecordingActivityBridge()

        VoiceRecordingOngoingNotifications(context, bridge, FakeLauncher(accepts = false)).show(snapshot)

        assertThat(bridge.keepsRecordingInBackground).isFalse()
    }

    @Test
    fun `the service starts once per take, later updates only refresh the notification`() {
        val launcher = FakeLauncher(accepts = true)
        val sink = VoiceRecordingOngoingNotifications(context, VoiceRecordingActivityBridge(), launcher)

        sink.show(snapshot)
        sink.show(snapshot.copy(statusLabel = "Autre"))

        assertThat(launcher.started).hasSize(1)
    }

    @Test
    fun `ending the take stops the service and forgets the keep-alive`() {
        val bridge = VoiceRecordingActivityBridge()
        val launcher = FakeLauncher(accepts = true)
        val sink = VoiceRecordingOngoingNotifications(context, bridge, launcher)
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
        VoiceRecordingOngoingNotifications(context, bridge, FakeLauncher(accepts = true)).show(snapshot)

        context.sendBroadcast(Intent(VoiceRecordingOngoingNotifications.ACTION_CANCEL).setPackage(context.packageName))
        context.sendBroadcast(Intent(VoiceRecordingOngoingNotifications.ACTION_STOP).setPackage(context.packageName))
        shadowOf(Looper.getMainLooper()).idle()

        assertThat(seen).containsExactly("cancel", "stop").inOrder()
    }
}
