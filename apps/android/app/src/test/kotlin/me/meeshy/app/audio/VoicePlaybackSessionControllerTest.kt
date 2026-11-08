package me.meeshy.app.audio

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackQueueControls
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
        val events = mutableListOf<String>()
        var parked = 0
        var left = 0

        override fun enter(notificationId: Int, notification: Notification) {
            entered += notification
            events += "enter"
        }

        override fun park() {
            parked++
            events += "park"
        }

        override fun leave() {
            left++
            events += "leave"
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

    private fun started(
        bridge: VoicePlaybackSessionBridge,
        foreground: RecordingForeground,
        appInForeground: () -> Boolean = { true },
        sdkInt: Int = 35,
        targetSdk: Int = 36,
    ): VoicePlaybackSessionController =
        VoicePlaybackSessionController(
            context = context,
            bridge = bridge,
            foreground = foreground,
            scope = CoroutineScope(Dispatchers.Unconfined),
            loadArtwork = { null },
            appInForeground = appInForeground,
            sdkInt = sdkInt,
            targetSdk = targetSdk,
        ).also { it.start() }

    /** Une carte parquée (pause de plus de 3 s), l'application hors de l'écran : ce que « Lecture » trouve sur l'écran verrouillé. */
    private fun parked(
        bridge: VoicePlaybackSessionBridge,
        foreground: RecordingForeground,
        appInForeground: () -> Boolean = { false },
        sdkInt: Int = 35,
    ): VoicePlaybackSessionController {
        val controller = started(bridge, foreground, appInForeground, sdkInt)
        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true))
        bridge.publish(card, VoicePlaybackTransportState(positionMs = 7_000, isPlaying = false))
        foreground.events.clear()
        return controller
    }

    /** Les ordres que le lecteur reçoit, rangés dans le MÊME journal que les entrées au premier plan. */
    private fun listening(bridge: VoicePlaybackSessionBridge, foreground: RecordingForeground) {
        CoroutineScope(Dispatchers.Unconfined).launch {
            bridge.commands.collect { foreground.events += "command:$it" }
        }
    }

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

    @Test
    fun `a play from a parked card on Android 15 takes the foreground before the order reaches the player`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        val controller = parked(bridge, foreground)
        listening(bridge, foreground)

        controller.onAction(VoicePlaybackSessionController.ACTION_PLAY)

        assertThat(foreground.events).containsExactly("enter", "command:${VoicePlaybackCommand.Play}").inOrder()
    }

    @Test
    fun `the foreground entered for a resume carries the parked card`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        val controller = parked(bridge, foreground)
        val before = foreground.entered.size

        controller.onAction(VoicePlaybackSessionController.ACTION_PLAY)

        val notification = foreground.entered[before]
        assertThat(notification.extras.getCharSequence(Notification.EXTRA_TITLE)).isEqualTo("Famille — 14/10/2025 09:30")
        assertThat(actionTitles(notification)).contains(context.getString(me.meeshy.app.R.string.voice_playback_play))
    }

    @Test
    fun `a play while the app is on screen asks for the focus directly`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        val controller = parked(bridge, foreground, appInForeground = { true })
        listening(bridge, foreground)

        controller.onAction(VoicePlaybackSessionController.ACTION_PLAY)

        assertThat(foreground.events).containsExactly("command:${VoicePlaybackCommand.Play}")
    }

    @Test
    fun `a play before Android 15 asks for the focus directly`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        val controller = parked(bridge, foreground, sdkInt = 28)
        listening(bridge, foreground)

        controller.onAction(VoicePlaybackSessionController.ACTION_PLAY)

        assertThat(foreground.events).containsExactly("command:${VoicePlaybackCommand.Play}")
    }

    @Test
    fun `a play while the service already holds the foreground does not enter it twice`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        val controller = started(bridge, foreground, appInForeground = { false })
        bridge.publish(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true))
        foreground.events.clear()
        listening(bridge, foreground)

        controller.onAction(VoicePlaybackSessionController.ACTION_PLAY)

        assertThat(foreground.events).containsExactly("command:${VoicePlaybackCommand.Play}")
    }

    @Test
    fun `a play with no card published has no foreground to take`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        val controller = started(bridge, foreground, appInForeground = { false })
        foreground.events.clear()
        listening(bridge, foreground)

        controller.onAction(VoicePlaybackSessionController.ACTION_PLAY)

        assertThat(foreground.events).containsExactly("command:${VoicePlaybackCommand.Play}")
    }

    @Test
    fun `a pause never takes the foreground`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        val controller = parked(bridge, foreground)
        listening(bridge, foreground)

        controller.onAction(VoicePlaybackSessionController.ACTION_PAUSE)

        assertThat(foreground.events).containsExactly("command:${VoicePlaybackCommand.Pause}")
    }

    @Test
    fun `the foreground is given back when the player refuses and publishes the card as paused`() {
        var now = 0L
        val bridge = VoicePlaybackSessionBridge(clock = { now++ })
        val foreground = RecordingForeground()
        val controller = parked(bridge, foreground)
        controller.onAction(VoicePlaybackSessionController.ACTION_PLAY)
        foreground.events.clear()

        bridge.publish(card, VoicePlaybackTransportState(positionMs = 7_000, isPlaying = false))

        assertThat(foreground.events).containsExactly("park")
    }

    private val queueControls = VoicePlaybackQueueControls(hasNext = true, hasPrevious = false)

    @Test
    fun `a queue card offers previous, back, pause, forward and next, a screen card only the three it had`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)

        bridge.publishShared(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true), queueControls)

        assertThat(actionTitles(foreground.entered.single())).containsExactly(
            context.getString(me.meeshy.app.R.string.voice_playback_previous),
            context.getString(me.meeshy.app.R.string.voice_playback_back),
            context.getString(me.meeshy.app.R.string.voice_playback_pause),
            context.getString(me.meeshy.app.R.string.voice_playback_forward),
            context.getString(me.meeshy.app.R.string.mini_player_next),
        ).inOrder()
    }

    @Test
    fun `the last voice of the queue has no next button but keeps previous`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)

        bridge.publishShared(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true), queueControls.copy(hasNext = false))

        val titles = actionTitles(foreground.entered.single())
        assertThat(titles).contains(context.getString(me.meeshy.app.R.string.voice_playback_previous))
        assertThat(titles).doesNotContain(context.getString(me.meeshy.app.R.string.mini_player_next))
    }

    @Test
    fun `the notification next and previous buttons reach the owner as commands`() = runBlocking {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val controller = started(bridge, RecordingForeground())
        bridge.publishShared(card, VoicePlaybackTransportState(positionMs = 0, isPlaying = true), queueControls)

        bridge.sharedCommands.test {
            controller.onAction(VoicePlaybackSessionController.ACTION_NEXT)
            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Next)
            controller.onAction(VoicePlaybackSessionController.ACTION_PREVIOUS)
            assertThat(awaitItem()).isEqualTo(VoicePlaybackCommand.Previous)
        }
    }

    @Test
    fun `the system media transport advertises skip to next and previous only for a queue`() {
        val none = VoicePlaybackSessionController.queueTransportActions(null)
        val queue = VoicePlaybackSessionController.queueTransportActions(queueControls)
        val last = VoicePlaybackSessionController.queueTransportActions(queueControls.copy(hasNext = false))
        val next = android.media.session.PlaybackState.ACTION_SKIP_TO_NEXT
        val previous = android.media.session.PlaybackState.ACTION_SKIP_TO_PREVIOUS

        assertThat(none).isEqualTo(0L)
        assertThat(queue).isEqualTo(next or previous)
        assertThat(last).isEqualTo(previous)
    }

    @Test
    fun `touching the card opens the conversation on the voice that plays, from a queue card too`() {
        val bridge = VoicePlaybackSessionBridge(clock = { 0L })
        val foreground = RecordingForeground()
        started(bridge, foreground)

        bridge.publishShared(
            card.copy(conversationId = "c1", messageId = "m1"),
            VoicePlaybackTransportState(positionMs = 0, isPlaying = true),
            queueControls,
        )

        val intent = shadowOf(foreground.entered.single().contentIntent).savedIntent
        assertThat(intent.getStringExtra("conversationId")).isEqualTo("c1")
        assertThat(intent.getStringExtra("messageId")).isEqualTo("m1")
    }
}
