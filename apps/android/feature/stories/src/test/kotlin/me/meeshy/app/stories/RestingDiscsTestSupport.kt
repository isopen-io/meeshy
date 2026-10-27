package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.FloatingButtonGeometry
import me.meeshy.sdk.model.chrome.FloatingChromeLateralReserve
import me.meeshy.sdk.model.layout.EdgeInsetsDp
import me.meeshy.ui.component.chrome.FloatingChromeReserveState
import me.meeshy.ui.component.chrome.LocalFloatingChromeReserve
import me.meeshy.ui.theme.MeeshyTheme

/** Les deux disques flottants à leur position PAR DÉFAUT sur 360 × 740 dp (#12497) : bord de chaque disque, en dp. */
internal object RestingDiscs {
    private val geometry = FloatingButtonGeometry(360f, 740f, EdgeInsetsDp(top = 24f))
    private val layout = geometry.layout(FloatingButtonGeometry.DEFAULT_FEED_STORAGE, FloatingButtonGeometry.DEFAULT_MENU_STORAGE)
    val bands = FloatingChromeLateralReserve.bands(layout, 360f)
    val leadingEdge: Float = layout.feed.x + FloatingButtonGeometry.BUTTON_SIZE / 2f
    val trailingEdge: Float = layout.menu.x - FloatingButtonGeometry.BUTTON_SIZE / 2f
    val top: Float = layout.feed.y - FloatingButtonGeometry.BUTTON_SIZE / 2f
}

/** Pose [content] à la hauteur des disques au repos, fenêtre de 360 dp. */
internal fun ComposeContentTestRule.setContentBesideRestingDiscs(content: @Composable () -> Unit) {
    val reserve = FloatingChromeReserveState().apply { publishBands(RestingDiscs.bands) }
    setContent {
        MeeshyTheme(darkTheme = false) {
            CompositionLocalProvider(LocalFloatingChromeReserve provides reserve) {
                // La fenêtre d'essai porte une barre d'état : la rangée se pose à la hauteur des disques DANS LA FENÊTRE.
                var windowOffset by remember { mutableFloatStateOf(0f) }
                val density = LocalDensity.current.density
                Column(
                    Modifier
                        .requiredWidth(360.dp)
                        .onGloballyPositioned { windowOffset = it.positionInWindow().y / density },
                ) {
                    Spacer(Modifier.height((RestingDiscs.top + 4f - windowOffset).coerceAtLeast(0f).dp))
                    content()
                }
            }
        }
    }
    waitForIdle()
}

internal fun ComposeContentTestRule.scrollerBounds() = onNode(hasScrollAction()).getBoundsInRoot()
