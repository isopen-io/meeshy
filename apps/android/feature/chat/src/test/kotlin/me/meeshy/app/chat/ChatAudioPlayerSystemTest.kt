package me.meeshy.app.chat

import android.media.MediaPlayer
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
import org.robolectric.shadows.ShadowMediaPlayer
import org.robolectric.shadows.util.DataSource

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

    private fun playing(host: RecordingHost): ChatAudioPlayer {
        ShadowMediaPlayer.addMediaInfo(DataSource.toDataSource(voice.url!!), ShadowMediaPlayer.MediaInfo(12_000, 0))
        val player = ChatAudioPlayer(MediaPlayer(), host, audioManager = null, conversationTitle = "Famille")
        player.toggle(voice, source)
        player.onPrepared()
        shadowOf(Looper.getMainLooper()).idle()
        return player
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
