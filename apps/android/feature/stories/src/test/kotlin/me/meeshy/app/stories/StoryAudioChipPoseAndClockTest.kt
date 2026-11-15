package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.scene.SceneAudioChipTiming
import org.junit.Test

/**
 * La puce d'un son posé (#16293) : le lecteur peint la pose que l'auteur lui a donnée, comme pour tout objet de la scène, et
 * son chrono lit la passe de la piste — la même projection au compositeur et au lecteur (loi 6).
 */
class StoryAudioChipPoseAndClockTest {

    private fun track(
        scale: Double? = null,
        rotation: Double? = null,
        sourceEnd: Float? = null,
        loop: Boolean? = null,
        name: String? = null,
    ) = StoryAudioPlayerObject(id = "a", scale = scale, rotation = rotation, sourceEnd = sourceEnd, loop = loop, name = name)

    @Test
    fun `the reader paints the scale and the rotation the author pinched`() {
        val chip = StorySceneObjectsProjection.audioChip(track(scale = 2.5, rotation = -30.0))

        assertThat(chip.scale).isEqualTo(2.5)
        assertThat(chip.rotation).isEqualTo(-30.0)
    }

    @Test
    fun `a chip posed before poses existed is painted at one, upright`() {
        val chip = StorySceneObjectsProjection.audioChip(track())

        assertThat(chip.scale).isEqualTo(1.0)
        assertThat(chip.rotation).isEqualTo(0.0)
    }

    @Test
    fun `the chip carries the pass its chrono loops on`() {
        val chip = StorySceneObjectsProjection.audioChip(track(sourceEnd = 6f, loop = true))

        assertThat(chip.timing).isEqualTo(SceneAudioChipTiming(passSeconds = 6.0, loop = true))
        assertThat(chip.timing.positionSeconds(slideElapsed = 7.0)).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `the chip keeps the name its author gave the track, never a blank one`() {
        assertThat(StorySceneObjectsProjection.audioChip(track(name = "Intro")).name).isEqualTo("Intro")
        assertThat(StorySceneObjectsProjection.audioChip(track(name = "  ")).name).isNull()
    }
}
