package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneExportPlanTest {

    @Test
    fun `une scene sort en portrait 1080x1920 a 30 images par seconde`() {
        val plan = SceneExportPlan.of(durationSeconds = 5.0)
        assertThat(plan.width).isEqualTo(1080)
        assertThat(plan.height).isEqualTo(1920)
        assertThat(plan.fps).isEqualTo(30)
        assertThat(plan.durationMillis).isEqualTo(5_000L)
        assertThat(plan.bitRate).isEqualTo(4_976_640)
    }

    @Test
    fun `la duree est bornee, une scene vide ne produit jamais un fichier de zero seconde`() {
        assertThat(SceneExportPlan.of(0.0).durationMillis).isEqualTo(SceneExportPlan.MIN_DURATION_MILLIS)
        assertThat(SceneExportPlan.of(Double.NaN).durationMillis).isEqualTo(SceneExportPlan.MIN_DURATION_MILLIS)
        assertThat(SceneExportPlan.of(9_999.0).durationMillis).isEqualTo(SceneExportPlan.MAX_DURATION_MILLIS)
    }

    @Test
    fun `une scene paysage garde sa petite hauteur`() {
        val plan = SceneExportPlan.of(3.0, landscape = true)
        assertThat(plan.height).isEqualTo(607)
    }

    @Test
    fun `le nom du fichier est neutre et porte l extension mp4`() {
        assertThat(SceneExportPlan.fileName(1_700_000_000_000L)).isEqualTo("meeshy-scene-1700000000000.mp4")
    }
}
