package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryExportVideoSettingsTest {
    @Test fun `portrait 1080x1920 vise environ 5 Mbps`() {
        val rate = StoryExportVideoSettings.averageBitRate(StoryExportVideoSettings.outputSize(landscape = false))
        assertThat(rate).isEqualTo(4_976_640)
    }

    @Test fun `paysage 1080x607 remonte au plancher`() {
        val size = StoryExportVideoSettings.outputSize(landscape = true)
        assertThat(size).isEqualTo(StoryExportSize(1080, 607))
        assertThat(StoryExportVideoSettings.averageBitRate(size)).isEqualTo(2_000_000)
    }

    @Test fun `un gabarit geant est plafonne`() {
        assertThat(StoryExportVideoSettings.averageBitRate(StoryExportSize(4000, 4000))).isEqualTo(9_000_000)
    }

    @Test fun `taille nulle ne plante pas et vaut le plancher`() {
        assertThat(StoryExportVideoSettings.averageBitRate(StoryExportSize(0, 0))).isEqualTo(2_000_000)
    }

    @Test fun `30 fps et image-cle toutes les 2 s`() {
        assertThat(StoryExportFrameRate.FPS).isEqualTo(30)
        assertThat(StoryExportVideoSettings.keyFrameIntervalFrames).isEqualTo(60)
        assertThat(StoryExportVideoSettings.AUDIO_BIT_RATE).isEqualTo(128_000)
    }
}
