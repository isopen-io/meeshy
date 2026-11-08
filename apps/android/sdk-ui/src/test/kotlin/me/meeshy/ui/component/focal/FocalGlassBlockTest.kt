package me.meeshy.ui.component.focal

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalGlassBlockTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `le bloc epouse exactement la colonne que son hote lui donne`() {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 240.dp, height = 90.dp)) { FocalGlassBlock(Modifier.fillMaxSize().testTag("glass")) }
            }
        }
        compose.onNodeWithTag("glass").assertWidthIsEqualTo(240.dp).assertHeightIsEqualTo(90.dp)
    }

    @Test
    fun `le rayon du verre est celui de la loi, 18`() {
        assertThat(ElectedMetrics.cardRadius).isEqualTo(18.dp)
        assertThat(FocalScrollPerspective.FOCUS_CARD_CORNER_RADIUS).isEqualTo(18.0)
    }

    @Test
    fun `la carte deborde la colonne de la marge de l'elu de chaque cote`() {
        val frame = FocalScrollPerspective.electedCardFrame(rowWidth = 360.0, isRightToLeft = false)
        val column = 360.0 - 2 * 16.0 - 62.0 - 6.0
        assertThat(frame.width).isEqualTo(column + 2 * FocalScrollPerspective.ELECTED_CARD_MARGIN)
    }
}
