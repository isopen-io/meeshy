package me.meeshy.app.game

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProgressionBarTest {

    @get:Rule val compose = createComposeRule()

    @Test
    fun `la fraction est bornee entre zero et un`() {
        assertThat(ProgressionBarValue.fraction(-0.4)).isEqualTo(0f)
        assertThat(ProgressionBarValue.fraction(0.25)).isEqualTo(0.25f)
        assertThat(ProgressionBarValue.fraction(7.0)).isEqualTo(1f)
        assertThat(ProgressionBarValue.fraction(Double.NaN)).isEqualTo(0f)
    }

    @Test
    fun `le pourcentage dit est celui de la locale`() {
        assertThat(ProgressionBarValue.spokenPercent(0.5f, Locale.US)).isEqualTo("50%")
        assertThat(ProgressionBarValue.spokenPercent(0.5f, Locale.FRANCE)).contains("50")
        assertThat(ProgressionBarValue.spokenPercent(0.5f, Locale.FRANCE)).contains("%")
    }

    @Test
    fun `la barre expose sa progression et le libelle de l echelle`() {
        compose.setContent { MeeshyTheme { ProgressionBar(progress = 0.4, tint = Color.Red, label = "Ta Flamme") } }

        compose.onNodeWithContentDescription("Ta Flamme").assert(
            SemanticsMatcher("plage de progression 0.4 sur 0..1") {
                val info = it.config.getOrNull(SemanticsProperties.ProgressBarRangeInfo)
                info != null && info.current == 0.4f && info.range == 0f..1f
            },
        )
    }

    @Test
    fun `une valeur hors bornes est ramenee dans la plage`() {
        compose.setContent { MeeshyTheme { ProgressionBar(progress = 3.0, tint = Color.Red, label = "Plein") } }

        compose.onNodeWithContentDescription("Plein").assert(
            SemanticsMatcher("current vaut 1") { it.config.getOrNull(SemanticsProperties.ProgressBarRangeInfo)?.current == 1f },
        )
    }
}
