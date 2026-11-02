package me.meeshy.app.chat

import android.os.Looper
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.model.playback.MediaSessionEvent
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState
import me.meeshy.ui.component.audio.VoicePlaybackHost
import me.meeshy.ui.component.bubble.BubbleAudio
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** Le lecteur de vocaux parle au système : carte publiée, ordres obéis, interruptions décidées par le registre partagé. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatAudioPlayerSystemTest {

    private class RecordingHost : VoicePlaybackHost {
        val published = mutableListOf<Pair<VoicePlaybackCard, VoicePlaybackTransportState>>()
        var retired = 0
        override val commands: Flow<VoicePlaybackCommand> = MutableSharedFlow()

        override fun publish(card: VoicePlaybackCard, transport: VoicePlaybackTransportState) {
            published += card to transport
        }

        override fun retire() {
            retired++
        }
    }

    private val voice = BubbleAudio(attachmentId = "a1", url = "https://cdn.meeshy.me/a1.m4a", durationSeconds = 12)
    private val source = VoiceTrackSource(
        sender = "Nour",
        avatarUrl = "https://cdn.meeshy.me/nour.jpg",
        createdAtIso = "2025-10-14T09:30:00.000Z",
        isProtected = false,
    )

    private class FakeEngine : VoiceNoteEngine {
        val loaded = mutableListOf<String>()
        var started = 0
        var playing = false
        private var prepared: () -> Unit = {}
        override val positionMs: Long = 0L
        override val durationMs: Long = 12_000L

        override fun listen(onPrepared: () -> Unit, onCompleted: () -> Unit, onError: () -> Unit) {
            prepared = onPrepared
        }

        override fun load(url: String) {
            loaded += url
        }

        fun becomesReady() = prepared()

        override fun start() {
            started++
            playing = true
        }

        override fun pause() {
            playing = false
        }

        val seeks = mutableListOf<Long>()
        override fun seekTo(positionMs: Long) {
            seeks += positionMs
        }

        override fun setSpeed(rate: Float) = Unit
        override fun reset() {
            playing = false
        }

        override fun release() = Unit
    }

    private fun playing(host: RecordingHost, engine: FakeEngine = FakeEngine()): ChatAudioPlayer {
        val player = ChatAudioPlayer(engine, host, audioManager = null, conversationTitle = "Famille")
        player.toggle(voice, source)
        engine.becomesReady()
        shadowOf(Looper.getMainLooper()).idle()
        return player
    }

    @Test
    fun `touching a voice note loads its url and starts it once the engine is ready`() {
        val engine = FakeEngine()

        playing(RecordingHost(), engine)

        assertThat(engine.loaded).containsExactly("https://cdn.meeshy.me/a1.m4a")
        assertThat(engine.playing).isTrue()
    }

    @Test
    fun `the card carries the duration the engine read`() {
        val host = RecordingHost()

        playing(host)

        assertThat(host.published.last().first.durationMs).isEqualTo(12_000L)
    }

    @Test
    fun `a touch on a word of the transcript seeks the voice note being played there`() {
        val engine = FakeEngine()
        val player = playing(RecordingHost(), engine)

        player.seek(voice, positionSeconds = 2.5)

        assertThat(engine.seeks).containsExactly(2_500L)
        assertThat(player.bubbleFor(voice)?.currentSeconds).isWithin(0.001).of(2.5)
    }

    @Test
    fun `a touch on the transcript of another voice note seeks nothing`() {
        val engine = FakeEngine()
        val player = playing(RecordingHost(), engine)

        player.seek(voice.copy(attachmentId = "other"), positionSeconds = 2.5)

        assertThat(engine.seeks).isEmpty()
    }

    @Test
    fun `a pause from the notification pauses the engine itself`() {
        val engine = FakeEngine()
        val player = playing(RecordingHost(), engine)

        player.handle(VoicePlaybackCommand.Pause)

        assertThat(engine.playing).isFalse()
    }

    @Test
    fun `touching a voice note publishes its card, author and conversation included`() {
        val host = RecordingHost()

        playing(host)

        val (card, transport) = host.published.last()
        assertThat(card.attachmentId).isEqualTo("a1")
        assertThat(card.sender).isEqualTo("Nour")
        assertThat(card.conversation).isEqualTo("Famille")
        assertThat(card.artworkUrl).isEqualTo("https://cdn.meeshy.me/nour.jpg")
        assertThat(transport.isPlaying).isTrue()
    }

    @Test
    fun `a pause ordered by the notification pauses the voice note and parks the card`() {
        val host = RecordingHost()
        val player = playing(host)

        player.handle(VoicePlaybackCommand.Pause)

        assertThat(player.playback.transport.isPlaying).isFalse()
        assertThat(host.published.last().second.isPlaying).isFalse()
        assertThat(host.retired).isEqualTo(0)
    }

    @Test
    fun `an unplugged headset pauses and nothing resumes it on its own`() {
        val host = RecordingHost()
        val player = playing(host)

        player.onSystemEvent(MediaSessionEvent.RouteChangedOldDeviceUnavailable)
        player.onSystemEvent(MediaSessionEvent.InterruptionEndedShouldResume)

        assertThat(player.playback.transport.isPlaying).isFalse()
    }

    @Test
    fun `an interruption pauses a playing voice note and its end resumes it`() {
        val host = RecordingHost()
        val player = playing(host)

        player.onSystemEvent(MediaSessionEvent.InterruptionBegan)
        assertThat(player.playback.transport.isPlaying).isFalse()
        player.onSystemEvent(MediaSessionEvent.InterruptionEndedShouldResume)

        assertThat(player.playback.transport.isPlaying).isTrue()
    }

    @Test
    fun `a voice note the user paused is not resumed by the end of an interruption`() {
        val host = RecordingHost()
        val player = playing(host)

        player.handle(VoicePlaybackCommand.Pause)
        player.onSystemEvent(MediaSessionEvent.InterruptionBegan)
        player.onSystemEvent(MediaSessionEvent.InterruptionEndedShouldResume)

        assertThat(player.playback.transport.isPlaying).isFalse()
    }

    @Test
    fun `the end of the voice note retires the card`() {
        val host = RecordingHost()
        val player = playing(host)

        player.onCompleted()

        assertThat(host.retired).isEqualTo(1)
        assertThat(player.playback.transport.isPlaying).isFalse()
    }

    @Test
    fun `stop lets the voice note go and retires the card`() {
        val host = RecordingHost()
        val player = playing(host)

        player.handle(VoicePlaybackCommand.Stop)

        assertThat(player.playback.attachmentId).isNull()
        assertThat(host.retired).isEqualTo(1)
    }

    @Test
    fun `leaving the thread retires the card`() {
        val host = RecordingHost()
        val player = playing(host)

        player.release()

        assertThat(host.retired).isEqualTo(1)
    }
}
