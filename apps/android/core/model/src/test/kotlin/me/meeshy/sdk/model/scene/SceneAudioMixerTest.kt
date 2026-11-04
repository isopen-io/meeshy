package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.scene.SceneAudioTrackFrame.Ended
import me.meeshy.sdk.model.scene.SceneAudioTrackFrame.Sounding
import me.meeshy.sdk.model.scene.SceneAudioTrackFrame.Waiting
import org.junit.Test

class SceneAudioMixerTest {

    private fun track(
        id: String = "a",
        start: Double = 0.0,
        duration: Double? = 10.0,
        volume: Float = 1f,
        fadeIn: Double = 0.0,
        fadeOut: Double = 0.0,
        loop: Boolean? = false,
        background: Boolean = false,
        window: StorySourceWindowMs? = null,
    ) = SceneAudioTrack(id, "https://m/$id.m4a", background, start, duration, volume, null, fadeIn, fadeOut, loop, window)

    private fun frame(track: SceneAudioTrack, at: Double, pass: Double? = 20.0, edit: Boolean = false, muted: Boolean = false) =
        SceneAudioMixerPlan.frame(track, at, pass, edit, muted)

    @Test
    fun `a clip waits until its start time and says in how long`() {
        assertThat(frame(track(start = 2.5), 1.0)).isEqualTo(Waiting(1500))
    }

    @Test
    fun `entering mid slide lands inside the clip - never back at zero`() {
        val sounding = frame(track(start = 2.0), 5.0) as Sounding
        assertThat(sounding.positionMs).isEqualTo(3000)
    }

    @Test
    fun `a trimmed source positions inside its window - the player carries the window start`() {
        val sounding = frame(track(window = StorySourceWindowMs(4000, 9000)), 1.0, pass = 5.0) as Sounding
        assertThat(sounding.positionMs).isEqualTo(1000)
    }

    @Test
    fun `a clip ends after its occupied duration`() {
        assertThat(frame(track(duration = 3.0), 3.0)).isEqualTo(Ended)
    }

    @Test
    fun `a clip with no duration ends with its source pass`() {
        assertThat(frame(track(duration = null), 6.0, pass = 5.0)).isEqualTo(Ended)
    }

    @Test
    fun `a loop folds on the pass and never goes silent after two laps`() {
        val looping = track(duration = null, loop = true)
        val third = frame(looping, 13.0, pass = 5.0) as Sounding
        assertThat(third.positionMs).isEqualTo(3000)
        assertThat(frame(looping, 500.0, pass = 5.0)).isInstanceOf(Sounding::class.java)
    }

    @Test
    fun `a declared loop stops at its occupied duration`() {
        assertThat(frame(track(duration = 12.0, loop = true), 12.5, pass = 5.0)).isEqualTo(Ended)
    }

    @Test
    fun `a background track loops unless it refuses`() {
        val bg = track(id = "bg", loop = null, background = true, duration = null)
        assertThat((frame(bg, 30.0, pass = 4.0) as Sounding).loops).isTrue()
        assertThat(frame(bg.copy(loop = false), 30.0, pass = 4.0)).isEqualTo(Ended)
    }

    @Test
    fun `the edit preview loops every clip and never ends`() {
        val clip = track(duration = 3.0, loop = false)
        assertThat(frame(clip, 100.0, pass = 3.0, edit = true)).isInstanceOf(Sounding::class.java)
    }

    @Test
    fun `fades are read on the clock - entering mid fade in starts at the right level`() {
        val faded = track(fadeIn = 4.0)
        assertThat((frame(faded, 2.0) as Sounding).volume).isWithin(1e-5f).of(0.5f)
        assertThat((frame(faded, 6.0) as Sounding).volume).isEqualTo(1f)
    }

    @Test
    fun `the fade out brings the clip to silence at its end`() {
        val faded = track(fadeOut = 2.0)
        assertThat((frame(faded, 9.0) as Sounding).volume).isWithin(1e-5f).of(0.5f)
    }

    @Test
    fun `a loop replays its fades at every lap`() {
        val looping = track(duration = null, loop = true, fadeIn = 1.0)
        val lapStart = frame(looping, 10.25, pass = 5.0) as Sounding
        assertThat(lapStart.volume).isWithin(1e-5f).of(0.25f)
    }

    @Test
    fun `mute silences the track without ending it`() {
        val sounding = frame(track(), 1.0, muted = true) as Sounding
        assertThat(sounding.volume).isEqualTo(0f)
    }

    @Test
    fun `the gain never exceeds the gateway ceiling`() {
        val loud = frame(track(volume = 9f), 1.0) as Sounding
        assertThat(loud.volume).isEqualTo(StoryVolume.MAX_GAIN)
    }

    @Test
    fun `a non finite playhead plans nothing`() {
        assertThat(frame(track(), Double.NaN)).isEqualTo(Ended)
    }

    @Test
    fun `N tracks plan independently from one shared anchor`() {
        val tracks = listOf(track("m", background = true, loop = null, duration = null), track("v", start = 4.0, duration = 2.0))
        val frames = tracks.map { frame(it, 5.0, pass = 8.0) }
        assertThat(frames[0]).isInstanceOf(Sounding::class.java)
        assertThat((frames[1] as Sounding).positionMs).isEqualTo(1000)
    }

    @Test
    fun `every audio player object of a slide becomes a track - background first - and one without a url is not planned`() {
        val effects = me.meeshy.sdk.model.StoryEffects(
            audioPlayerObjects = listOf(
                me.meeshy.sdk.model.StoryAudioPlayerObject(id = "v1", isBackground = false, startTime = 2f, fadeIn = 1f),
                me.meeshy.sdk.model.StoryAudioPlayerObject(id = "m", isBackground = true, volume = 0.4f),
                me.meeshy.sdk.model.StoryAudioPlayerObject(id = "gone", isBackground = false),
            ),
        )
        val tracks = SceneAudioMixerPlan.tracks(effects) { if (it.id == "gone") null else "https://m/${it.id}.m4a" }
        assertThat(tracks.map { it.id }).containsExactly("m", "v1").inOrder()
        assertThat(tracks[0].isBackground).isTrue()
        assertThat(tracks[1].startTime).isEqualTo(2.0)
        assertThat(tracks[1].fadeIn).isEqualTo(1.0)
    }
}
