package me.meeshy.sdk.model.composer.live

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaTrimBounds
import org.junit.Test

/**
 * La scène du compositeur joue en continu (#13863, loi 6 : le player est l'aperçu) : chaque vidéo et chaque son de la diapo,
 * dans SA fenêtre, à SON volume, sélectionné ou non ; la sélection ne fait que désigner ce qu'on édite, et chaque image du
 * geste de Couper déplace la tête là où l'on regarde.
 */
class ComposerLivePlaybackTest {

    private fun video(id: String, background: Boolean = false) = ComposerLiveSubject(id, ComposerLiveKind.VIDEO, background)

    private fun sound(id: String) = ComposerLiveSubject(id, ComposerLiveKind.AUDIO, background = false)

    @Test
    fun `the scene plays every video and every sound of the slide, selected or not`() {
        val slide = listOf(video("bg", background = true), video("p1"), sound("s1"), sound("s2"))

        assertThat(ComposerLivePlayback.playing(slide, selectedId = null)).isEqualTo(slide)
    }

    @Test
    fun `an empty slide plays nothing`() {
        assertThat(ComposerLivePlayback.playing(emptyList(), selectedId = "p1")).isEmpty()
    }

    @Test
    fun `beyond the decoders a device holds, the background and then the order of placing keep their reading`() {
        val slide = listOf(video("bg", background = true), video("p1"), video("p2"), video("p3"), sound("s1"))

        assertThat(ComposerLivePlayback.playing(slide, selectedId = null))
            .containsExactly(video("bg", background = true), video("p1"), video("p2"), sound("s1")).inOrder()
    }

    @Test
    fun `the video being edited always plays, even beyond the decoders`() {
        val slide = listOf(video("p1"), video("p2"), video("p3"), video("bg", background = true))

        assertThat(ComposerLivePlayback.playing(slide, selectedId = "p3"))
            .containsExactly(video("p1"), video("p3"), video("bg", background = true)).inOrder()
    }

    @Test
    fun `sounds are never held back by the video cap`() {
        val slide = List(4) { video("v$it") } + List(5) { sound("s$it") }

        assertThat(ComposerLivePlayback.playing(slide, selectedId = null).count { it.kind == ComposerLiveKind.AUDIO }).isEqualTo(5)
    }

    @Test
    fun `the window is read in milliseconds, whole when not cut`() {
        assertThat(ComposerLivePlayback.window(MediaTrimBounds(1.25, 4.5))).isEqualTo(ComposerLiveWindow(1_250, 4_500))
        assertThat(ComposerLivePlayback.window(null)).isEqualTo(ComposerLiveWindow.WHOLE)
    }

    @Test
    fun `the first cue starts at the start of the window`() {
        assertThat(ComposerLivePlayback.seekOnChange(null, ComposerLiveWindow(2_000, 6_000))).isEqualTo(2_000)
    }

    @Test
    fun `an unchanged window does not move the head`() {
        assertThat(ComposerLivePlayback.seekOnChange(ComposerLiveWindow(2_000, 6_000), ComposerLiveWindow(2_000, 6_000))).isNull()
    }

    @Test
    fun `dragging the start handle shows the new start`() {
        assertThat(ComposerLivePlayback.seekOnChange(ComposerLiveWindow(2_000, 6_000), ComposerLiveWindow(2_400, 6_000))).isEqualTo(2_400)
    }

    @Test
    fun `sliding the whole window replays from its new start`() {
        assertThat(ComposerLivePlayback.seekOnChange(ComposerLiveWindow(2_000, 6_000), ComposerLiveWindow(3_000, 7_000))).isEqualTo(3_000)
    }

    @Test
    fun `dragging the end handle replays the last moments before the new end`() {
        assertThat(ComposerLivePlayback.seekOnChange(ComposerLiveWindow(2_000, 6_000), ComposerLiveWindow(2_000, 5_000)))
            .isEqualTo(5_000 - ComposerLivePlayback.END_PREVIEW_MS)
    }

    @Test
    fun `a short window replays from its start when the end moves`() {
        assertThat(ComposerLivePlayback.seekOnChange(ComposerLiveWindow(2_000, 6_000), ComposerLiveWindow(2_000, 2_900))).isEqualTo(2_000)
    }

    @Test
    fun `the head loops inside the window`() {
        val window = ComposerLiveWindow(2_000, 6_000)

        assertThat(ComposerLivePlayback.rewindTo(3_000, window)).isNull()
        assertThat(ComposerLivePlayback.rewindTo(6_000, window)).isEqualTo(2_000)
        assertThat(ComposerLivePlayback.rewindTo(6_400, window)).isEqualTo(2_000)
        assertThat(ComposerLivePlayback.rewindTo(0, window)).isEqualTo(2_000)
        assertThat(ComposerLivePlayback.rewindTo(2_000 - ComposerLivePlayback.LOOP_SLACK_MS + 1, window)).isNull()
    }

    @Test
    fun `a whole source loops by itself`() {
        assertThat(ComposerLivePlayback.rewindTo(90_000, ComposerLiveWindow.WHOLE)).isNull()
    }

    @Test
    fun `the volume is the track's, silent when muted, held in the player's range`() {
        assertThat(ComposerLivePlayback.volume(trackVolume = 0.4f, muted = false)).isEqualTo(0.4f)
        assertThat(ComposerLivePlayback.volume(trackVolume = 0.4f, muted = true)).isEqualTo(0f)
        assertThat(ComposerLivePlayback.volume(trackVolume = 1.8f, muted = false)).isEqualTo(1f)
        assertThat(ComposerLivePlayback.volume(trackVolume = Float.NaN, muted = false)).isEqualTo(1f)
    }

    @Test
    fun `the scene plays while the screen is in front and the sound shelf closed, whatever is selected`() {
        assertThat(ComposerLivePlayback.plays(screenResumed = true, shelfOpen = false)).isTrue()
        assertThat(ComposerLivePlayback.plays(screenResumed = false, shelfOpen = false)).isFalse()
        assertThat(ComposerLivePlayback.plays(screenResumed = true, shelfOpen = true)).isFalse()
    }
}
