package me.meeshy.app.notifications

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.FloatingButtonGeometry
import me.meeshy.sdk.model.layout.EdgeInsetsDp
import me.meeshy.ui.component.chrome.FLOATING_BUTTON_LEFT_TAG
import me.meeshy.ui.component.chrome.FLOATING_BUTTON_RIGHT_TAG
import me.meeshy.ui.component.chrome.FloatingButtonSemantics
import me.meeshy.ui.component.chrome.MeeshyFloatingButtons
import me.meeshy.ui.layout.currentMeeshyWindowInfo
import me.meeshy.ui.theme.MeeshyTheme

/** Les deux disques flottants à leur position PAR DÉFAUT sur 360 × 740 dp : bord de chaque disque, en dp. */
internal object RestingDiscs {
    private val geometry = FloatingButtonGeometry(360f, 740f, EdgeInsetsDp(top = 24f))
    private val layout = geometry.layout(FloatingButtonGeometry.DEFAULT_FEED_STORAGE, FloatingButtonGeometry.DEFAULT_MENU_STORAGE)
    val leadingEdge: Float = layout.feed.x + FloatingButtonGeometry.BUTTON_SIZE / 2f
    val top: Float = layout.feed.y - FloatingButtonGeometry.BUTTON_SIZE / 2f
}

/**
 * Pose [content] à la hauteur des disques au repos, fenêtre de 360 dp, SOUS les vrais disques flottants (#13671) :
 * un calque pur, comme iOS — le contenu ne cède rien, il passe dessous.
 */
internal fun ComposeContentTestRule.setContentBesideRestingDiscs(content: @Composable () -> Unit) {
    setContent {
        MeeshyTheme(darkTheme = false) {
            BoxWithConstraints(Modifier.requiredWidth(360.dp).fillMaxSize()) {
                // La géométrie même du calque (sa boîte, la zone sûre de la fenêtre) : la rangée se pose à la hauteur RÉELLE du disque.
                val safeInsets = currentMeeshyWindowInfo().safeInsets
                val discTop = FloatingButtonGeometry(maxWidth.value, maxHeight.value, safeInsets)
                    .layout(FloatingButtonGeometry.DEFAULT_FEED_STORAGE, FloatingButtonGeometry.DEFAULT_MENU_STORAGE)
                    .feed.y - FloatingButtonGeometry.BUTTON_SIZE / 2f
                Column {
                    Spacer(Modifier.height((discTop + 4f).coerceAtLeast(0f).dp))
                    content()
                }
                MeeshyFloatingButtons(
                    leftStorage = FloatingButtonGeometry.DEFAULT_FEED_STORAGE,
                    rightStorage = FloatingButtonGeometry.DEFAULT_MENU_STORAGE,
                    onLeftStorageChange = {},
                    onRightStorageChange = {},
                    onLeftTap = {},
                    onLeftLongPress = {},
                    onRightTap = {},
                    onRightLongPress = {},
                    leftSemantics = FloatingButtonSemantics(label = "Flux"),
                    rightSemantics = FloatingButtonSemantics(label = "Menu"),
                    leftContent = {},
                    rightContent = {},
                )
            }
        }
    }
    waitForIdle()
}

internal fun ComposeContentTestRule.scrollerBounds() = onNode(hasScrollAction()).getBoundsInRoot()

/** Le disque de gauche, puis celui de droite, tels que le calque les pose réellement. */
internal fun ComposeContentTestRule.restingDiscBounds() =
    onNodeWithTag(FLOATING_BUTTON_LEFT_TAG).getBoundsInRoot() to onNodeWithTag(FLOATING_BUTTON_RIGHT_TAG).getBoundsInRoot()

/** Vrai quand les deux rectangles partagent une bande de hauteur : le contenu passe bien à la hauteur du disque. */
internal fun DpRect.sharesHeightWith(other: DpRect): Boolean = top < other.bottom && bottom > other.top
