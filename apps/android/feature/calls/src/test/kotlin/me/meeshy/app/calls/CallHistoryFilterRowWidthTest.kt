package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13379 — sur 360 dp (S8), en français, « Vidéo » tient entière à gauche de « Tout effacer ». */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallHistoryFilterRowWidthTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a 360 dp les trois puces sont entieres et Tout effacer ne les recouvre pas`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.requiredWidth(360.dp)) {
                    CallHistoryFilterRow(
                        missedOnly = false,
                        videoOnly = false,
                        canClear = true,
                        onMissed = {},
                        onVideo = {},
                        onClearAll = {},
                    )
                }
            }
        }
        val video = compose.onNodeWithText("Vidéo")
        val clear = compose.onNodeWithText("Tout effacer").getBoundsInRoot()
        val shown = video.getBoundsInRoot()
        val full = video.getUnclippedBoundsInRoot()

        assertThat(shown.right).isEqualTo(full.right)
        assertThat(full.right).isAtMost(clear.left)
    }
}
