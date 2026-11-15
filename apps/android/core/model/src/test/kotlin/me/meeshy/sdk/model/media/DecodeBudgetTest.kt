package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DecodeBudgetTest {
    private fun phone() = DisplayMetrics(widthDp = 400f, heightDp = 800f, density = 3f)

    @Test fun `plein ecran decode a la largeur physique de l ecran`() {
        assertThat(DecodeBudget.targetWidthPx(DecodeBudget.Surface.Fullscreen, phone())).isEqualTo(1200)
    }

    @Test fun `cadre decode au plus grand cote du cadre`() {
        val surface = DecodeBudget.Surface.Fitting(widthDp = 120f, heightDp = 90f)
        assertThat(DecodeBudget.targetWidthPx(surface, phone())).isEqualTo(360)
    }

    @Test fun `cadre portrait prend la hauteur`() {
        val surface = DecodeBudget.Surface.Fitting(widthDp = 50f, heightDp = 100f)
        assertThat(DecodeBudget.targetWidthPx(surface, phone())).isEqualTo(300)
    }

    @Test fun `pleine largeur prend le plus grand de la largeur ecran et de la hauteur`() {
        assertThat(DecodeBudget.targetWidthPx(DecodeBudget.Surface.FullBleed(heightDp = 300f), phone())).isEqualTo(1200)
        assertThat(DecodeBudget.targetWidthPx(DecodeBudget.Surface.FullBleed(heightDp = 600f), phone())).isEqualTo(1800)
    }

    @Test fun `le palier arrondit au multiple de 64 superieur pour borner les cles de cache`() {
        assertThat(DecodeBudget.bucket(1)).isEqualTo(64)
        assertThat(DecodeBudget.bucket(64)).isEqualTo(64)
        assertThat(DecodeBudget.bucket(65)).isEqualTo(128)
        assertThat(DecodeBudget.bucket(360)).isEqualTo(384)
    }

    @Test fun `un cadre nul ou negatif rend un palier minimal`() {
        assertThat(DecodeBudget.bucket(0)).isEqualTo(64)
        assertThat(DecodeBudget.bucket(-5)).isEqualTo(64)
    }
}
