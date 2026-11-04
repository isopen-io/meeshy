package me.meeshy.sdk.model.composer.timeline.engine

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.scene.SceneAudioTrack
import org.junit.Test

/** Chaque clip audio tombe à sa position exacte, pas à l'heure de démarrage du moteur (#6580). */
class TimelineAudioMixerTest {

    private val second = 1_000_000_000L
    private val file = AudioFileInfo(sampleRate = 1000.0, lengthFrames = 10_000)

    private fun track(id: String, start: Double = 0.0, window: StorySourceWindowMs? = null) =
        SceneAudioTrack(id = id, url = "u/$id", isBackground = false, startTime = start, window = window)

    private fun starts(vararg tracks: SceneAudioTrack, playhead: Double, anchor: Long = 100 * second) =
        TimelineAudioMixerPlan.starts(tracks.toList(), tracks.associate { it.id to file }, playhead, anchor)

    @Test
    fun `un clip a venir part a l'instant exact compte depuis l'ancre`() {
        val start = starts(track("a", start = 4.0), playhead = 1.0).single()
        assertThat(start.atNanos).isEqualTo(100 * second + 3 * second)
        assertThat(start.segment).isNull()
    }

    @Test
    fun `un clip qui commence pile a la tete part a l'ancre`() {
        assertThat(starts(track("a", start = 2.0), playhead = 2.0).single().atNanos).isEqualTo(100 * second)
    }

    @Test
    fun `un clip deja commence entre en cours de fichier, immediatement`() {
        val start = starts(track("a", start = 1.0), playhead = 3.5).single()
        assertThat(start.atNanos).isNull()
        assertThat(start.segment).isEqualTo(AudioSegment(startingFrame = 2_500, frameCount = 7_500))
    }

    @Test
    fun `un clip rogne demarre au bon frame meme quand il est a venir`() {
        val window = StorySourceWindowMs(startMs = 2_000, endMs = 6_000)
        val start = starts(track("a", start = 5.0, window = window), playhead = 0.0).single()
        assertThat(start.segment).isEqualTo(AudioSegment(startingFrame = 2_000, frameCount = 4_000))
    }

    @Test
    fun `un clip rogne deja entame ajoute l'ecoule au debut de la fenetre`() {
        val window = StorySourceWindowMs(startMs = 2_000, endMs = 6_000)
        val start = starts(track("a", start = 0.0, window = window), playhead = 1.0).single()
        assertThat(start.segment).isEqualTo(AudioSegment(startingFrame = 3_000, frameCount = 3_000))
    }

    @Test
    fun `aucune lecture si l'ouverture est apres la fin du clip`() {
        val window = StorySourceWindowMs(startMs = 0, endMs = 2_000)
        assertThat(starts(track("a", window = window), playhead = 5.0)).isEmpty()
        assertThat(starts(track("b"), playhead = 20.0)).isEmpty()
    }

    @Test
    fun `une piste sans fichier charge est ecartee sans consommer de place`() {
        val tracks = listOf(track("a"), track("b"))
        val result = TimelineAudioMixerPlan.starts(tracks, mapOf("b" to file), 0.0, 0L, maxActiveTracks = 1)
        assertThat(result.map { it.trackId }).containsExactly("b")
    }

    @Test
    fun `le plafond de pistes simultanees est respecte dans l'ordre`() {
        val tracks = (1..8).map { track("t$it") }
        val result = TimelineAudioMixerPlan.starts(tracks, tracks.associate { it.id to file }, 0.0, 0L)
        assertThat(result.map { it.trackId }).containsExactly("t1", "t2", "t3", "t4", "t5", "t6").inOrder()
    }

    @Test
    fun `une tete negative est ramenee a zero`() {
        assertThat(starts(track("a", start = 1.0), playhead = -4.0).single().atNanos).isEqualTo(100 * second + second)
    }
}
