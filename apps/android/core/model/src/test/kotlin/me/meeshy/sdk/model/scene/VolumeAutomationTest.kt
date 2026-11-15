package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import org.junit.Test

class VolumeAutomationTest {
    private fun kf(time: Float, volume: Float?, easing: StoryEasing? = null) =
        StoryKeyframe(id = "k$time", time = time, volume = volume, easing = easing)

    @Test fun `sans point de volume le volume statique est rendu`() {
        assertThat(VolumeAutomation.effectiveVolume(0.8f, null, 3f)).isEqualTo(0.8f)
        assertThat(VolumeAutomation.effectiveVolume(0.8f, listOf(StoryKeyframe(id = "p", time = 1f, x = 0.2)), 3f))
            .isEqualTo(0.8f)
    }

    @Test fun `avant le premier point le volume statique est conserve`() {
        val points = listOf(kf(2f, 0f), kf(4f, 1f))
        assertThat(VolumeAutomation.effectiveVolume(0.5f, points, 1f)).isEqualTo(0.5f)
    }

    @Test fun `rampe lineaire entre deux points`() {
        val points = listOf(kf(0f, 0f), kf(4f, 1f))
        assertThat(VolumeAutomation.effectiveVolume(1f, points, 1f)).isWithin(1e-6f).of(0.25f)
    }

    @Test fun `apres le dernier point la derniere valeur tient`() {
        val points = listOf(kf(0f, 1f), kf(2f, 0.2f))
        assertThat(VolumeAutomation.effectiveVolume(1f, points, 99f)).isWithin(1e-6f).of(0.2f)
    }

    @Test fun `l'ordre d'auteur non chronologique est tolere`() {
        val points = listOf(kf(4f, 1f), kf(0f, 0f))
        assertThat(VolumeAutomation.effectiveVolume(1f, points, 2f)).isWithin(1e-6f).of(0.5f)
    }

    @Test fun `le resultat est plafonne au gain maximum et plancher a 0`() {
        assertThat(VolumeAutomation.effectiveVolume(1f, listOf(kf(0f, 9f)), 1f)).isEqualTo(StoryVolume.MAX_GAIN)
        assertThat(VolumeAutomation.effectiveVolume(7f, null, 1f)).isEqualTo(StoryVolume.MAX_GAIN)
        assertThat(VolumeAutomation.effectiveVolume(-1f, null, 1f)).isEqualTo(0f)
    }

    @Test fun `ducking multiplie par le facteur et ne persiste rien`() {
        assertThat(VolumeAutomation.ducked(1f, true)).isEqualTo(0.25f)
        assertThat(VolumeAutomation.ducked(1f, false)).isEqualTo(1f)
    }

    @Test fun `isDucking absent vaut actif et la coupe par clip prime`() {
        assertThat(VolumeAutomation.isDucking(slideDucks = true, isDuckingDisabled = null)).isTrue()
        assertThat(VolumeAutomation.isDucking(slideDucks = true, isDuckingDisabled = true)).isFalse()
        assertThat(VolumeAutomation.isDucking(slideDucks = false, isDuckingDisabled = false)).isFalse()
    }

    @Test fun `rampe de fondu lue sur le temps ecoule`() {
        assertThat(VolumeRamp.volume(0f, 1f, 2.0, 0.5)).isWithin(1e-6f).of(0.25f)
        assertThat(VolumeRamp.volume(0f, 1f, 2.0, 5.0)).isEqualTo(1f)
        assertThat(VolumeRamp.volume(0f, 1f, 2.0, -1.0)).isEqualTo(0f)
        assertThat(VolumeRamp.volume(0.3f, 0.9f, 0.0, 0.0)).isEqualTo(0.9f)
        assertThat(VolumeRamp.volume(0f, 1f, Double.NaN, 1.0)).isEqualTo(1f)
    }

    @Test fun `la rampe est complete quand l'ecoule atteint la duree`() {
        assertThat(VolumeRamp.isComplete(1.0, 0.5)).isFalse()
        assertThat(VolumeRamp.isComplete(1.0, 1.0)).isTrue()
        assertThat(VolumeRamp.isComplete(1.0, Double.NaN)).isTrue()
    }
}
