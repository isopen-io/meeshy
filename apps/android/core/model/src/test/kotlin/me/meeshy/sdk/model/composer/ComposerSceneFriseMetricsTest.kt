package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerSceneFriseMetricsTest {

    @Test
    fun `la colonne des noms fait 72 dp et la poignée 24 dp`() {
        assertThat(ComposerSceneFriseMetrics.LABEL_LANE_DP).isEqualTo(72f)
        assertThat(ComposerSceneFriseMetrics.HANDLE_HIT_DP).isEqualTo(24f)
    }

    @Test
    fun `le pas du lecteur d'ecran est une demi-seconde`() {
        assertThat(ComposerSceneFriseMetrics.ACCESSIBILITY_STEP).isEqualTo(0.5f)
    }

    @Test
    fun `le libelle du temps ecrit la tete au dixieme et la duree entiere`() {
        assertThat(ComposerSceneFriseMetrics.timeLabel(1.2f, 6f)).isEqualTo("1.2 s / 6 s")
        assertThat(ComposerSceneFriseMetrics.timeLabel(0f, 6.5f)).isEqualTo("0.0 s / 6.5 s")
    }

    @Test
    fun `le libelle de fenetre retire la decimale nulle`() {
        assertThat(ComposerSceneFriseMetrics.windowLabel(1f, 3.5f)).isEqualTo("1 s – 3.5 s")
    }

    @Test
    fun `une valeur non finie se lit zero`() {
        assertThat(ComposerSceneFriseMetrics.timeLabel(Float.NaN, 6f)).isEqualTo("0.0 s / 6 s")
        assertThat(ComposerSceneFriseMetrics.fraction(Float.NaN, 6f)).isEqualTo(0f)
    }

    @Test
    fun `la fraction reste dans la duree`() {
        assertThat(ComposerSceneFriseMetrics.fraction(3f, 6f)).isEqualTo(0.5f)
        assertThat(ComposerSceneFriseMetrics.fraction(9f, 6f)).isEqualTo(1f)
        assertThat(ComposerSceneFriseMetrics.fraction(1f, 0f)).isEqualTo(0f)
    }
}
