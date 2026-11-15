package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryKeyframe
import org.junit.Test

class StoryKeyframeVolumeTest {
    private val kfs = listOf(StoryKeyframe(id = "a", time = 0f, volume = 0f), StoryKeyframe(id = "b", time = 2f, volume = 1f))

    @Test fun `le canal volume s'interpole lineairement`() =
        assertThat(VolumeAutomation.effectiveVolume(0.5f, kfs, 1f)).isWithin(1e-4f).of(0.5f)

    @Test fun `un point sans volume ne crée aucune automation`() =
        assertThat(VolumeAutomation.effectiveVolume(0.7f, listOf(StoryKeyframe(id = "a", time = 0f, x = 0.1)), 1f)).isEqualTo(0.7f)

    @Test fun `avant le premier point le volume de base est servi`() =
        assertThat(VolumeAutomation.effectiveVolume(0.7f, listOf(StoryKeyframe(id = "a", time = 1f, volume = 0f)), 0.5f)).isEqualTo(0.7f)
}
