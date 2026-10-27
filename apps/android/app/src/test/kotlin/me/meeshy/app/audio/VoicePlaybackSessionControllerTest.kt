package me.meeshy.app.audio

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** La carte de lecture du système : session média active, notification MediaStyle, premier plan suivi. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VoicePlaybackSessionControllerTest {

    private class RecordingForeground : VoicePlaybackForeground {
        val entered = mutableListOf<Notification>()
        var parked = 0
        var left = 0

        override fun enter(notificationId: Int, notification: Notification) {
            entered += notification
        }

        override fun park() {
            parked++
        }

        override fun leave() {
            left++
        }
    }

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val card = VoicePlaybackCard(
        attachmentId = "a1",
        sender = "Nour",
        conversation = "Famille",
        sentAtLabel = "14/10/2025 09:30",
        durationMs = 42_000,
    )

    private fun started(bridge: VoicePlaybackSessionBridge, foreground: RecordingForeground): VoicePlaybackSessionController =
        VoicePlaybackSessionController(
            context = context,
            bridge = bridge,
            foreground = foreground,
            scope = CoroutineScope(Dispatchers.Unconfined),
            loadArtwork = { null },
        ).also { it.start() }

    private fun actionTitles(notification: Notification): List<String> =
        notification.actions.map { it.title.toString() }

    @Test
    fun `a playing voice note takes the foreground with a media notification and three controls`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)

        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true))

        val notification = foreground.entered.single()
        assertThat(notification.extras.getCharSequence(Notification.EXTRA_TITLE)).isEqualTo("Famille — 14/10/2025 09:30")
        assertThat(notification.extras.getCharSequence(Notification.EXTRA_TEXT)).isEqualTo("Nour")
        assertThat(notification.extras.containsKey(Notification.EXTRA_MEDIA_SESSION)).isTrue()
        assertThat(actionTitles(notification)).containsExactly(
            context.getString(me.meeshy.app.R.string.voice_playback_back),
            context.getString(me.meeshy.app.R.string.voice_playback_pause),
            context.getString(me.meeshy.app.R.string.voice_playback_forward),
        ).inOrder()
        assertThat(notification.visibility).isEqualTo(Notification.VISIBILITY_PRIVATE)
    }

    @Test
    fun `the media session is active as soon as the service starts, so a headset button reaches it`() {
        val controller = started(VoicePlaybackSessionBridge(clock = { 0L }), RecordingForeground())

        assertThat(controller.isSessionActive).isTrue()

        controller.stop()
        assertThat(controller.isSessionActive).isFalse()
    }

    @Test
    fun `a paused voice note is parked with a play control, still on the screen, and can be swiped`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)
        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true))

        bridge.publish(card, VoicePlaybackTransportState(positionMs = 7_000, isPlaying = false))

        assertThat(foreground.parked).isEqualTo(1)
        val posted = shadowOf(context.getSystemService(NotificationManager::class.java)).allNotifications.single()
        assertThat(actionTitles(posted)).contains(context.getString(me.meeshy.app.R.string.voice_playback_play))
        assertThat(posted.flags and Notification.FLAG_ONGOING_EVENT).isEqualTo(0)
    }

    @Test
    fun `a voice note still loading keeps the foreground so the service is never left without one`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)

        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = false, isBuffering = true))

        assertThat(foreground.entered).hasSize(1)
        assertThat(foreground.parked).isEqualTo(0)
    }

    @Test
    fun `retiring the voice note gives the foreground back`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)
        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true))
        val before = foreground.left

        bridge.retire()

        assertThat(foreground.left).isEqualTo(before + 1)
    }

    @Test
    fun `a protected voice note carries no identifying metadata at all`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)

        bridge.publish(
            card.copy(isProtected = true, artworkUrl = "https://cdn.meeshy.me/nour.jpg"),
            VoicePlaybackTransportState(positionMs = 0, isPlaying = true),
        )

        val notification = foreground.entered.single()
        assertThat(notification.extras.getCharSequence(Notification.EXTRA_TITLE))
            .isEqualTo(context.getString(me.meeshy.app.R.string.voice_playback_voice_message))
        assertThat(notification.extras.getCharSequence(Notification.EXTRA_TEXT))
            .isEqualTo(context.getString(me.meeshy.app.R.string.voice_playback_protected))
        assertThat(notification.getLargeIcon()).isNull()
    }

    @Test
    fun `the lock screen shows a generic public version, never the name, the conversation or the avatar`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)

        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true))

        val notification = foreground.entered.single()
        assertThat(notification.visibility).isEqualTo(Notification.VISIBILITY_PRIVATE)
        val public = notification.publicVersion!!
        assertThat(public.extras.getCharSequence(Notification.EXTRA_TITLE))
            .isEqualTo(context.getString(me.meeshy.app.R.string.voice_playback_voice_message))
        assertThat(public.extras.getCharSequence(Notification.EXTRA_TEXT)).isNull()
        assertThat(public.getLargeIcon()).isNull()
        val channel = context.getSystemService(NotificationManager::class.java).getNotificationChannel("meeshy_voice_playback")
        assertThat(channel.lockscreenVisibility).isEqualTo(Notification.VISIBILITY_PRIVATE)
    }

    @Test
    fun `the notification buttons reach the player as commands`() = runBlocking {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val controller = started(bridge, RecordingForeground())

        bridge.commands.test {
            controller.onAction(VoicePlaybackSessionController.ACTION_PAUSE)
            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Pause)
            controller.onAction(VoicePlaybackSessionController.ACTION_FORWARD)
            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Skip(15_000))
            controller.onAction(VoicePlaybackSessionController.ACTION_BACK)
            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Skip(-15_000))
            controller.onAction(VoicePlaybackSessionController.ACTION_STOP)
            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Stop)
            controller.onAction("inconnu")
            expectNoEvents()
        }
    }
}
