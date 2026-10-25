package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.layout.PointDp
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'echelle du bouton avatar (miroir de `RootFloatingChrome.menuLadder`) : sens d'ouverture,
 * voile de fermeture, barreaux annonces et actionnables seulement une fois ouverts. L'echelon
 * de 0,04 s et l'aspect des barreaux sont prouves par `FloatingMenuLadderTest` (core:model).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyMenuFabTest {

    @get:Rule
    val compose = createComposeRule()

    private class Taps {
        var dismissed = 0
        var notifications = 0
        var calls = 0
    }

    private fun items(taps: Taps) = listOf(
        RadialMenuItem(MeeshyIcons.BellFilled, "Notifications", Color.Red, badgeCount = 3) { taps.notifications++ },
        RadialMenuItem(MeeshyIcons.Call, "Calls", Color.Blue) { taps.calls++ },
        RadialMenuItem(MeeshyIcons.SettingsFilled, "Settings", Color.Gray) {},
    )

    private fun showLadder(taps: Taps, expanded: Boolean, center: PointDp, opensDownward: Boolean) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.requiredSize(400.dp, 800.dp).testTag(HOST_TAG)) {
                    MeeshyMenuVeil(expanded = expanded, onDismiss = { taps.dismissed++ })
                    MeeshyMenuLadder(
                        items = items(taps),
                        expanded = expanded,
                        menuCenter = center,
                        opensDownward = opensDownward,
                        itemHint = "Open this section",
                        onDismiss = { taps.dismissed++ },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    /**
     * Les bornes d'un barreau dans le repere de l'ecran simule (le Box de 400 x 800 dp). Sous
     * Robolectric la fenetre fait ~320 dp : le Box impose par `requiredSize` y deborde et se
     * centre, donc ses bornes dans la racine sont decalees — on les retranche.
     */
    private fun rungBounds(index: Int): DpRect {
        val host = compose.onNodeWithTag(HOST_TAG).getBoundsInRoot()
        val rung = compose.onNodeWithTag(menuLadderRungTag(index)).getBoundsInRoot()
        return DpRect(rung.left - host.left, rung.top - host.top, rung.right - host.left, rung.bottom - host.top)
    }

    @Test
    fun `a downward ladder stacks its rungs below the button, first rung nearest`() {
        showLadder(Taps(), expanded = true, center = PointDp(300f, 200f), opensDownward = true)
        val first = rungBounds(0)
        val second = rungBounds(1)
        assertThat(first.top.value).isGreaterThan(200f)
        assertThat(second.top.value).isGreaterThan(first.top.value)
    }

    @Test
    fun `an upward ladder stacks its rungs above the button, first rung nearest`() {
        showLadder(Taps(), expanded = true, center = PointDp(300f, 600f), opensDownward = false)
        val first = rungBounds(0)
        val second = rungBounds(1)
        assertThat(first.bottom.value).isLessThan(600f)
        assertThat(second.top.value).isLessThan(first.top.value)
    }

    @Test
    fun `the rungs stand on the button's vertical`() {
        showLadder(Taps(), expanded = true, center = PointDp(300f, 200f), opensDownward = true)
        val rung = rungBounds(2)
        assertThat((rung.left.value + rung.right.value) / 2f).isWithin(0.5f).of(300f)
    }

    @Test
    fun `a tap on the transparent veil closes the ladder`() {
        val taps = Taps()
        showLadder(taps, expanded = true, center = PointDp(300f, 200f), opensDownward = true)
        compose.onNodeWithTag(MENU_LADDER_VEIL_TAG).performClick()
        assertThat(taps.dismissed).isEqualTo(1)
    }

    @Test
    fun `a closed ladder has no veil and announces no rung`() {
        showLadder(Taps(), expanded = false, center = PointDp(300f, 200f), opensDownward = true)
        compose.onNodeWithTag(MENU_LADDER_VEIL_TAG).assertDoesNotExist()
        compose.onNodeWithContentDescription("Notifications").assertDoesNotExist()
    }

    @Test
    fun `an open rung is announced by its label and opens its section, closing the ladder`() {
        val taps = Taps()
        showLadder(taps, expanded = true, center = PointDp(300f, 200f), opensDownward = true)
        compose.onNodeWithContentDescription("Calls").assertHasClickAction().performClick()
        assertThat(taps.calls).isEqualTo(1)
        assertThat(taps.dismissed).isEqualTo(1)
    }

    @Test
    fun `a rung badge shows its count`() {
        showLadder(Taps(), expanded = true, center = PointDp(300f, 200f), opensDownward = true)
        compose.onNodeWithText("3", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `opening a closed ladder brings every rung, the last one included`() {
        val taps = Taps()
        var expanded by mutableStateOf(false)
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.requiredSize(400.dp, 800.dp).testTag(HOST_TAG)) {
                    MeeshyMenuLadder(
                        items = items(taps),
                        expanded = expanded,
                        menuCenter = PointDp(300f, 200f),
                        opensDownward = true,
                        itemHint = "Open this section",
                        onDismiss = { taps.dismissed++ },
                    )
                }
            }
        }
        compose.onNodeWithContentDescription("Settings").assertDoesNotExist()
        expanded = true
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Settings").assertHasClickAction()
    }

    private companion object {
        const val HOST_TAG = "ladder-host"
    }
}
