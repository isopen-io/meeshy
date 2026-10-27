package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.chrome.FloatingButtonSide
import me.meeshy.sdk.model.chrome.FloatingChromeLateralReserve.Band
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #12497 — une rangée à la hauteur d'un disque cède la largeur du disque de SON côté ; les autres ne bougent pas. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FloatingChromeLateralReserveModifierTest {

    @get:Rule
    val compose = createComposeRule()

    // La fenêtre de test peut porter une barre de titre : la bande couvre large, la rangée du dessus reste loin.
    private val trailingDiscBesideSecondRow = listOf(Band(FloatingButtonSide.TRAILING, top = 240f, bottom = 500f, reach = 60f))

    private fun render(direction: LayoutDirection, bands: List<Band>) {
        val reserve = FloatingChromeReserveState().apply { publishBands(bands) }
        compose.setContent {
            CompositionLocalProvider(LocalFloatingChromeReserve provides reserve, LocalLayoutDirection provides direction) {
                Column(Modifier.fillMaxWidth()) {
                    ReserveRow("above")
                    Spacer(Modifier.height(200.dp))
                    ReserveRow("beside")
                }
            }
        }
        compose.waitForIdle()
    }

    @androidx.compose.runtime.Composable
    private fun ReserveRow(tag: String) {
        Box(Modifier.floatingChromeLateralReserve().fillMaxWidth().height(50.dp)) {
            Box(Modifier.fillMaxSize().testTag(tag))
        }
    }

    private fun rootWidth() = compose.onRoot().getUnclippedBoundsInRoot().width.value

    private fun bounds(tag: String) = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()

    @Test
    fun `la rangee a la hauteur du disque cede sa largeur du cote de fin, celle du dessus garde toute la largeur`() {
        render(LayoutDirection.Ltr, trailingDiscBesideSecondRow)
        assertThat(bounds("beside").right.value).isWithin(0.5f).of(rootWidth() - 60f)
        assertThat(bounds("beside").left.value).isWithin(0.5f).of(0f)
        assertThat(bounds("above").right.value).isWithin(0.5f).of(rootWidth())
    }

    @Test
    fun `en RTL le cote de fin est a gauche`() {
        render(LayoutDirection.Rtl, trailingDiscBesideSecondRow)
        assertThat(bounds("beside").left.value).isWithin(0.5f).of(60f)
        assertThat(bounds("beside").right.value).isWithin(0.5f).of(rootWidth())
    }

    @Test
    fun `sans disque aucune rangee ne cede rien`() {
        render(LayoutDirection.Ltr, emptyList())
        assertThat(bounds("beside").right.value).isWithin(0.5f).of(rootWidth())
    }
}
