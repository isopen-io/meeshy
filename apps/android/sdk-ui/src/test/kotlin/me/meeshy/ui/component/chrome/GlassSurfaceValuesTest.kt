package me.meeshy.ui.component.chrome

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

class GlassSurfaceValuesTest {

    @Test
    fun `le remplissage translucide est a 60 pour cent en sombre et 72 en clair`() {
        assertThat(GlassSurfaceValues.FILL_ALPHA_DARK).isEqualTo(0.60f)
        assertThat(GlassSurfaceValues.FILL_ALPHA_LIGHT).isEqualTo(0.72f)
    }

    @Test
    fun `l'ombre est noire a 20 pour cent rayon 10 decalee de 5`() {
        assertThat(GlassSurfaceValues.SHADOW_ALPHA).isEqualTo(0.2f)
        assertThat(GlassSurfaceValues.SHADOW_RADIUS_DP).isEqualTo(10f)
        assertThat(GlassSurfaceValues.SHADOW_OFFSET_Y_DP).isEqualTo(5f)
    }

    @Test
    fun `l'encre du verre est blanche en sombre et indigo950 en clair`() {
        assertThat(glassControlForegroundColor(isDark = true)).isEqualTo(Color.White)
        assertThat(glassControlForegroundColor(isDark = false)).isEqualTo(MeeshyPalette.Indigo950)
    }

    @Test
    fun `la rampe de fondu du haut de barre suit iOS`() {
        assertThat(TopBarBottomFade.TRANSPARENT_FRACTION).isEqualTo(0.06f)
        assertThat(TopBarBottomFade.GRADIENT_FRACTION).isEqualTo(0.24f)
        assertThat(TopBarBottomFade.fadeStartLocation).isWithin(1e-6f).of(0.70f)
        assertThat(TopBarBottomFade.fullyTransparentLocation).isWithin(1e-6f).of(0.94f)
    }
}
