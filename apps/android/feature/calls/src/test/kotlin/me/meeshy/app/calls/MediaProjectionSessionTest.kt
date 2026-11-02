package me.meeshy.app.calls

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjection
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

private class FakeLauncher : MediaProjectionServiceLauncher {
    val started = mutableListOf<MediaProjectionPurpose>()
    var stops = 0
    override fun start(purpose: MediaProjectionPurpose, consent: MediaProjectionConsent.Granted) {
        started += purpose
    }
    override fun stop() {
        stops++
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaProjectionSessionTest {

    private fun granted() = MediaProjectionConsent.fromResult(Activity.RESULT_OK, Intent("grant"))
        as MediaProjectionConsent.Granted

    private fun fixture() = FakeLauncher().let { it to MediaProjectionSession(it) }

    @Test
    fun `a granted consent starts the service and the projection makes it active`() {
        val (launcher, session) = fixture()
        assertThat(session.request(MediaProjectionPurpose.ScreenShare)).isTrue()
        session.onConsent(granted())
        assertThat(launcher.started).containsExactly(MediaProjectionPurpose.ScreenShare)
        assertThat(session.state.value).isEqualTo(MediaProjectionState.Starting(MediaProjectionPurpose.ScreenShare))
        val projection = mockk<MediaProjection>(relaxed = true)
        session.onProjectionAcquired(projection)
        assertThat(session.state.value).isEqualTo(MediaProjectionState.Active(MediaProjectionPurpose.ScreenShare))
        assertThat(session.projection()).isSameInstanceAs(projection)
    }

    @Test
    fun `a refused consent captures nothing and reports the denial`() {
        val (launcher, session) = fixture()
        session.request(MediaProjectionPurpose.Recording)
        session.onConsent(MediaProjectionConsent.fromResult(Activity.RESULT_CANCELED, null))
        assertThat(launcher.started).isEmpty()
        assertThat(session.state.value).isEqualTo(MediaProjectionState.Denied(MediaProjectionPurpose.Recording))
        session.acknowledgeDenied()
        assertThat(session.state.value).isEqualTo(MediaProjectionState.Idle)
    }

    @Test
    fun `an OK result without data is a denial`() {
        assertThat(MediaProjectionConsent.fromResult(Activity.RESULT_OK, null)).isEqualTo(MediaProjectionConsent.Denied)
    }

    @Test
    fun `a consent nobody asked for starts nothing`() {
        val (launcher, session) = fixture()
        session.onConsent(granted())
        assertThat(launcher.started).isEmpty()
        assertThat(session.state.value).isEqualTo(MediaProjectionState.Idle)
    }

    @Test
    fun `the system stopping the projection ends the session and the token cannot be reused`() {
        val (launcher, session) = fixture()
        session.request(MediaProjectionPurpose.ScreenShare)
        session.onConsent(granted())
        session.onProjectionAcquired(mockk(relaxed = true))
        session.onSystemStop()
        assertThat(session.state.value).isEqualTo(
            MediaProjectionState.Ended(MediaProjectionPurpose.ScreenShare, MediaProjectionEndReason.SystemStopped),
        )
        assertThat(session.projection()).isNull()
        assertThat(launcher.stops).isEqualTo(1)
        session.onConsent(granted())
        assertThat(launcher.started).hasSize(1)
        assertThat(session.request(MediaProjectionPurpose.ScreenShare)).isTrue()
    }

    @Test
    fun `a second request while one is live is refused`() {
        val (_, session) = fixture()
        session.request(MediaProjectionPurpose.ScreenShare)
        assertThat(session.request(MediaProjectionPurpose.Recording)).isFalse()
    }

    @Test
    fun `the end of the call stops a live projection but not an idle session`() {
        val (launcher, session) = fixture()
        session.onCallEnded()
        assertThat(launcher.stops).isEqualTo(0)
        session.request(MediaProjectionPurpose.Recording)
        session.onConsent(granted())
        session.onProjectionAcquired(mockk(relaxed = true))
        session.onCallEnded()
        assertThat(session.state.value).isEqualTo(
            MediaProjectionState.Ended(MediaProjectionPurpose.Recording, MediaProjectionEndReason.CallEnded),
        )
        assertThat(launcher.stops).isEqualTo(1)
    }

    @Test
    fun `a failed acquisition ends the session as failed`() {
        val (_, session) = fixture()
        session.request(MediaProjectionPurpose.ScreenShare)
        session.onConsent(granted())
        session.onProjectionFailed()
        assertThat(session.state.value).isEqualTo(
            MediaProjectionState.Ended(MediaProjectionPurpose.ScreenShare, MediaProjectionEndReason.Failed),
        )
    }
}
