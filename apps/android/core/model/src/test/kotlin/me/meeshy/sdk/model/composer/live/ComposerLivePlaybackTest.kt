package me.meeshy.sdk.model.composer.live

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaTrimBounds
import org.junit.Test

/**
 * La lecture en direct du compositeur (grammaire d'édition, lot A-E3, #13973) : la sélection fait jouer SON média, dans
 * SA fenêtre, à SON volume, et chaque image du geste de Couper déplace la tête là où l'on regarde.
 */
class ComposerLivePlaybackTest {

    private fun selection(
        backgroundVideoId: String? = null,
        mediaId: String? = null,
        mediaIsVideo: Boolean = false,
        soundId: String? = null,
        soundPlayable: Boolean = true,
    ) = ComposerLivePlayback.Selection(backgroundVideoId, mediaId, mediaIsVideo, soundId, soundPlayable)

    @Test
    fun `nothing selected plays nothing`() {
        assertThat(ComposerLivePlayback.subject(selection())).isNull()
    }

    @Test
    fun `the selected background video plays as the background`() {
        val subject = ComposerLivePlayback.subject(selection(backgroundVideoId = "v1", mediaId = "v1", mediaIsVideo = true))

        assertThat(subject).isEqualTo(ComposerLiveSubject("v1", ComposerLiveKind.VIDEO, background = true))
    }

    @Test
    fun `a selected placed video plays on the scene, not as the background`() {
        val subject = ComposerLivePlayback.subject(selection(backgroundVideoId = "v1", mediaId = "p2", mediaIsVideo = true))

        assertThat(subject).isEqualTo(ComposerLiveSubject("p2", ComposerLiveKind.VIDEO, background = false))
    }

    @Test
    fun `a selected image has no player`() {
        assertThat(ComposerLivePlayback.subject(selection(mediaId = "i1", mediaIsVideo = false))).isNull()
    }

    @Test
    fun `a selected sound plays as audio, and a sound without address plays nothing`() {
        assertThat(ComposerLivePlayback.subject(selection(soundId = "s1"))).isEqualTo(ComposerLiveSubject("s1", ComposerLiveKind.AUDIO, background = false))
        assertThat(ComposerLivePlayback.subject(selection(soundId = "s1", soundPlayable = false))).isNull()
    }

    @Test
    fun `the background sound yields to a selected sound, one reading at a time`() {
        assertThat(ComposerLivePlayback.backgroundSoundYields(ComposerLiveSubject("s1", ComposerLiveKind.AUDIO, background = false))).isTrue()
        assertThat(ComposerLivePlayback.backgroundSoundYields(ComposerLiveSubject("v1", ComposerLiveKind.VIDEO, background = true))).isFalse()
        assertThat(ComposerLivePlayback.backgroundSoundYields(null)).isFalse()
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
    fun `it plays only while the screen is in front and no sheet covers the reading`() {
        val subject = ComposerLiveSubject("v1", ComposerLiveKind.VIDEO, background = true)

        assertThat(ComposerLivePlayback.plays(subject, screenResumed = true, shelfOpen = false)).isTrue()
        assertThat(ComposerLivePlayback.plays(subject, screenResumed = false, shelfOpen = false)).isFalse()
        assertThat(ComposerLivePlayback.plays(subject, screenResumed = true, shelfOpen = true)).isFalse()
        assertThat(ComposerLivePlayback.plays(null, screenResumed = true, shelfOpen = false)).isFalse()
    }
}
