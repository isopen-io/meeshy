package me.meeshy.app.calls

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjection
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import me.meeshy.sdk.model.call.CallRecordingPhase
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallRecordingCaptureControllerTest {

    private class Launcher : MediaProjectionServiceLauncher {
        var stops = 0
        override fun start(purpose: MediaProjectionPurpose, consent: MediaProjectionConsent.Granted) = Unit
        override fun stop() { stops++ }
    }

    private class Rig(purpose: MediaProjectionPurpose?, initial: CallRecordingPhase = CallRecordingPhase.Idle) {
        val launcher = Launcher()
        val session = MediaProjectionSession(launcher)
        val projection: MediaProjection = mockk(relaxed = true)
        val phases = MutableStateFlow(initial)
        val controller = CallRecordingCaptureController(
            session, phases, { 2560 to 1600 }, { 320 }, CoroutineScope(UnconfinedTestDispatcher()),
        )

        init {
            if (purpose != null) {
                session.request(purpose)
                session.onConsent(MediaProjectionConsent.fromResult(Activity.RESULT_OK, Intent("grant")))
                session.onProjectionAcquired(projection)
            }
        }
    }

    private val recording = CallRecordingPhase.Recording("c1", "r1", "me", mine = true)

    @Test
    fun `without a granted projection there is nothing to film`() {
        assertThat(Rig(purpose = null).controller.current()).isNull()
    }

    @Test
    fun `a recording projection is handed over with the size of the captured frames`() {
        val rig = Rig(MediaProjectionPurpose.Recording, recording)

        val frame = rig.controller.current()!!

        assertThat(frame.projection).isSameInstanceAs(rig.projection)
        assertThat(frame.width).isEqualTo(2560)
        assertThat(frame.height).isEqualTo(1600)
        assertThat(frame.densityDpi).isEqualTo(320)
    }

    @Test
    fun `the projection of a screen share is never lent to the recording`() {
        assertThat(Rig(MediaProjectionPurpose.ScreenShare, recording).controller.current()).isNull()
    }

    @Test
    fun `the projection is returned when the recording ends`() {
        val rig = Rig(MediaProjectionPurpose.Recording, recording)

        rig.phases.value = CallRecordingPhase.Idle

        assertThat(rig.launcher.stops).isEqualTo(1)
    }

    @Test
    fun `a screen share survives the end of a recording`() {
        val rig = Rig(MediaProjectionPurpose.ScreenShare, recording)

        rig.phases.value = CallRecordingPhase.Idle

        assertThat(rig.launcher.stops).isEqualTo(0)
    }

    @Test
    fun `a projection granted before the recording asks is not dropped by the idle phase`() {
        val rig = Rig(MediaProjectionPurpose.Recording, CallRecordingPhase.Idle)

        assertThat(rig.launcher.stops).isEqualTo(0)
        assertThat(rig.controller.current()).isNotNull()
    }
}
