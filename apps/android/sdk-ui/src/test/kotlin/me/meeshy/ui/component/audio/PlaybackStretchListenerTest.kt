package me.meeshy.ui.component.audio

import androidx.media3.common.Player
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import me.meeshy.sdk.model.media.PlaybackStretch
import me.meeshy.sdk.model.media.StretchEnd
import org.junit.Test

class PlaybackStretchListenerTest {

    private class Harness {
        var positionMs = 0L
        var volume = 1f
        var state = Player.STATE_READY
        var playing = false
        val reported = mutableListOf<PlaybackStretch>()
        val player: Player = mockk(relaxed = true) {
            every { currentPosition } answers { positionMs }
            every { duration } returns 10_000L
            every { volume } answers { this@Harness.volume }
            every { playbackState } answers { state }
            every { isPlaying } answers { playing }
        }
        val listener = PlaybackStretchListener(player) { stretches, _, _ -> reported += stretches }

        fun play(at: Long) { positionMs = at; playing = true; listener.onIsPlayingChanged(true) }
        fun pause(at: Long) { positionMs = at; playing = false; listener.onIsPlayingChanged(false) }
        fun seek(from: Long, to: Long) {
            listener.onPositionDiscontinuity(info(from), info(to), Player.DISCONTINUITY_REASON_SEEK)
            positionMs = to
        }
        fun info(ms: Long) = Player.PositionInfo(null, 0, null, null, 0, ms, ms, -1, -1)
    }

    @Test fun `pause, saut de curseur puis fin du media produisent trois plages`() {
        val h = Harness()

        h.play(0)
        h.pause(2_000)
        h.play(2_000)
        h.seek(4_000, 8_000)
        h.positionMs = 10_000; h.playing = false; h.state = Player.STATE_ENDED
        h.listener.onIsPlayingChanged(false)

        assertThat(h.reported).containsExactly(
            PlaybackStretch(0, 2_000, StretchEnd.PAUSE),
            PlaybackStretch(2_000, 4_000, StretchEnd.SEEK),
            PlaybackStretch(8_000, 10_000, StretchEnd.COMPLETED),
        ).inOrder()
    }

    @Test fun `couper le son clot la plage et la remettre en rouvre une`() {
        val h = Harness()
        h.play(0)

        h.positionMs = 1_000; h.volume = 0f; h.listener.onVolumeChanged(0f)
        h.positionMs = 3_000; h.volume = 1f; h.listener.onVolumeChanged(1f)
        h.positionMs = 4_000
        h.listener.dismiss()

        assertThat(h.reported.first()).isEqualTo(PlaybackStretch(0, 1_000, StretchEnd.MUTED))
        assertThat(h.reported.last().endedBy).isEqualTo(StretchEnd.DISMISSED)
    }

    @Test fun `lire avec le volume a zero n'ouvre aucune plage`() {
        val h = Harness()
        h.volume = 0f

        h.play(0)
        h.listener.dismiss()

        assertThat(h.reported).isEmpty()
    }

    @Test fun `quitter l'ecran cloture la plage ouverte`() {
        val h = Harness()
        h.play(500)
        h.positionMs = 3_000

        h.listener.dismiss()

        assertThat(h.reported).containsExactly(PlaybackStretch(500, 3_000, StretchEnd.DISMISSED))
    }

    @Test fun `la fin signalee deux fois ne produit qu'une plage`() {
        val h = Harness()
        h.play(0)
        h.positionMs = 9_000; h.state = Player.STATE_ENDED; h.playing = false

        h.listener.onPlaybackStateChanged(Player.STATE_ENDED)
        h.listener.onIsPlayingChanged(false)

        assertThat(h.reported).containsExactly(PlaybackStretch(0, 9_000, StretchEnd.COMPLETED))
    }

    @Test fun `le bouclage clot la plage par la fin et en ouvre une nouvelle`() {
        val h = Harness()
        h.play(0)

        h.listener.onPositionDiscontinuity(h.info(9_000), h.info(0), Player.DISCONTINUITY_REASON_AUTO_TRANSITION)
        h.positionMs = 2_000
        h.listener.dismiss()

        assertThat(h.reported).containsExactly(
            PlaybackStretch(0, 9_000, StretchEnd.COMPLETED),
            PlaybackStretch(0, 2_000, StretchEnd.DISMISSED),
        ).inOrder()
    }

    @Test fun `remplacer la source conserve la plage ouverte`() {
        val h = Harness()
        h.play(0)
        h.positionMs = 1_500

        h.listener.onMediaItemTransition(null, Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED)

        assertThat(h.reported).containsExactly(PlaybackStretch(0, 1_500, StretchEnd.SUPERSEDED))
    }
}
