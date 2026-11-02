package me.meeshy.app.calls

import android.app.Activity
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaProjectionServiceTest {
    private val originalFactory = MediaProjectionService.projectionFactory
    private val originalResolver = MediaProjectionService.entryPointResolver
    private val context: Context = RuntimeEnvironment.getApplication()
    private val launcher = object : MediaProjectionServiceLauncher {
        override fun start(purpose: MediaProjectionPurpose, consent: MediaProjectionConsent.Granted) = Unit
        override fun stop() = Unit
    }
    private val session = MediaProjectionSession(launcher)
    private val holder = ActiveCallSnapshotHolder()

    @Before
    fun prepare() {
        MediaProjectionService.entryPointResolver = {
            object : MediaProjectionEntryPoint {
                override fun session() = session
                override fun snapshotHolder() = holder
            }
        }
    }

    @After
    fun restore() {
        MediaProjectionService.projectionFactory = originalFactory
        MediaProjectionService.entryPointResolver = originalResolver
    }

    private fun snapshot(phase: CallActivityPhase) = CallActivitySnapshot(
        phase = phase,
        title = "Alice",
        statusLabel = "",
        initials = "A",
        isVideo = false,
        isMuted = false,
        connectedSinceEpochMs = null,
        showsDurationInCompact = true,
        caption = null,
    )

    private fun grant() = MediaProjectionConsent.fromResult(Activity.RESULT_OK, Intent("grant"))
        as MediaProjectionConsent.Granted

    private fun startedService(projection: MediaProjection?): org.robolectric.android.controller.ServiceController<MediaProjectionService> {
        MediaProjectionService.projectionFactory = { _, _, _ -> projection }
        holder.publish(snapshot(CallActivityPhase.Connected))
        session.request(MediaProjectionPurpose.ScreenShare)
        session.onConsent(grant())
        val intent = MediaProjectionService.startIntent(context, MediaProjectionPurpose.ScreenShare, grant())
        return Robolectric.buildService(MediaProjectionService::class.java, intent).create().startCommand(0, 1)
    }

    @Test
    fun `the notification is ongoing and offers a stop action`() {
        val notification = MediaProjectionService.buildNotification(context, MediaProjectionPurpose.ScreenShare)
        assertThat(notification.flags and Notification.FLAG_ONGOING_EVENT).isNotEqualTo(0)
        assertThat(notification.actions).hasLength(1)
        assertThat(notification.actions[0].title.toString()).isEqualTo("Stop")
    }

    @Test
    fun `the intent carries the grant and the purpose`() {
        val intent = MediaProjectionService.startIntent(context, MediaProjectionPurpose.Recording, grant())
        assertThat(intent.getStringExtra("purpose")).isEqualTo("Recording")
        assertThat(intent.getIntExtra("resultCode", 0)).isEqualTo(Activity.RESULT_OK)
    }

    @Test
    fun `the acquired projection makes the session active`() {
        startedService(mockk(relaxed = true))
        assertThat(session.state.value).isEqualTo(MediaProjectionState.Active(MediaProjectionPurpose.ScreenShare))
    }

    @Test
    fun `a consumed token fails the session instead of crashing`() {
        MediaProjectionService.projectionFactory = { _, _, _ -> throw SecurityException("token consumed") }
        session.request(MediaProjectionPurpose.ScreenShare)
        session.onConsent(grant())
        val intent = MediaProjectionService.startIntent(context, MediaProjectionPurpose.ScreenShare, grant())
        Robolectric.buildService(MediaProjectionService::class.java, intent).create().startCommand(0, 1)
        assertThat(session.state.value).isEqualTo(
            MediaProjectionState.Ended(MediaProjectionPurpose.ScreenShare, MediaProjectionEndReason.Failed),
        )
    }

    @Test
    fun `the stop action ends the session`() {
        startedService(mockk(relaxed = true))
        val stop = Intent(context, MediaProjectionService::class.java).setAction(MediaProjectionService.ACTION_STOP)
        Robolectric.buildService(MediaProjectionService::class.java, stop).create().startCommand(0, 2)
        assertThat((session.state.value as MediaProjectionState.Ended).reason).isEqualTo(MediaProjectionEndReason.UserStopped)
    }

    @Test
    fun `destroying the service releases the projection`() {
        val projection = mockk<MediaProjection>(relaxed = true)
        startedService(projection).destroy()
        verify(exactly = 1) { projection.stop() }
    }

    @Test
    fun `the end of the call stops the projection`() {
        val projection = mockk<MediaProjection>(relaxed = true)
        startedService(projection)
        holder.publish(snapshot(CallActivityPhase.Ended))
        assertThat((session.state.value as MediaProjectionState.Ended).reason).isEqualTo(MediaProjectionEndReason.CallEnded)
    }
}
