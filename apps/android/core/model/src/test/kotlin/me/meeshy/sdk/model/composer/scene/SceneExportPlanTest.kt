package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneExportPlanTest {

    @Test
    fun `le nom du fichier est neutre et porte l extension mp4`() {
        assertThat(SceneExportPlan.fileName(1_700_000_000_000L)).isEqualTo("meeshy-scene-1700000000000.mp4")
    }

    @Test
    fun `une scene fixe sort en image jpg, et chaque fichier se remet sous son type`() {
        assertThat(SceneExportPlan.stillFileName(1_700_000_000_000L)).isEqualTo("meeshy-scene-1700000000000.jpg")
        assertThat(SceneExportPlan.mimeType("/cache/meeshy-scene-1.jpg")).isEqualTo("image/jpeg")
        assertThat(SceneExportPlan.mimeType("/cache/meeshy-scene-1.mp4")).isEqualTo("video/mp4")
    }
}
