package me.meeshy.ui.component.location

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.ui.component.viewer.LocalViewerTopOverlay
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * S1.8 (#17766) — la carte plein écran d'un lieu partagé est une fenêtre à part : la pastille de l'appel réduit s'y
 * redessine, au-dessus de ✕, pour que l'appel reste atteignable pendant qu'on regarde la carte.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class LocationFullscreenCallPillTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la pastille de l'appel reduit reste posee au-dessus de la carte plein ecran`() {
        val pill: @Composable () -> Unit = { Text("pastille d'appel") }
        compose.setContent {
            CompositionLocalProvider(LocalViewerTopOverlay provides pill) {
                LocationFullscreen(place = SharedPlace(48.85, 2.35, name = "Paris"), accentColor = "6366F1", senderName = null, onDismiss = {})
            }
        }
        compose.waitForIdle()

        val bottomOfPill = compose.onNodeWithText("pastille d'appel").getUnclippedBoundsInRoot().bottom.value
        val topOfClose = compose.onNodeWithContentDescription("Close").getUnclippedBoundsInRoot().top.value
        assertThat(topOfClose).isAtLeast(bottomOfPill)
    }
}
