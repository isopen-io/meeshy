package me.meeshy.ui.layout

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.layout.WindowPosture
import me.meeshy.sdk.model.layout.WindowWidthClass
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La bulle se mesure a sa rangee (gouttiere comprise), jamais a un plafond fixe de 300 dp. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleWidthCapTest {

    @get:Rule
    val compose = createComposeRule()

    private fun showBubble(rowWidth: Int, widthClass: WindowWidthClass, gutter: Int = 0) {
        compose.setContent {
            // requiredWidth : l'ecran Robolectric par defaut (~320 dp) bornerait un simple width() et
            // la rangee mesuree ne serait plus celle que le test declare.
            Box(Modifier.requiredWidth(rowWidth.dp)) {
                Box(
                    Modifier
                        .bubbleWidthCap(widthClass, windowWidthDp = 1000f, horizontalGutter = gutter.dp)
                        .fillMaxWidth()
                        .height(20.dp)
                        .testTag(TAG),
                )
            }
        }
    }

    @Test
    fun `a compact row gives the bubble seventy percent of its width`() {
        showBubble(rowWidth = 400, widthClass = WindowWidthClass.COMPACT)
        compose.onNodeWithTag(TAG).assertWidthIsEqualTo(280.dp)
    }

    @Test
    fun `the row gutter counts in the container width`() {
        showBubble(rowWidth = 328, widthClass = WindowWidthClass.COMPACT, gutter = 32)
        compose.onNodeWithTag(TAG).assertWidthIsEqualTo(252.dp)
    }

    @Test
    fun `an expanded window caps the bubble at five hundred sixty dp`() {
        showBubble(rowWidth = 1200, widthClass = WindowWidthClass.EXPANDED)
        compose.onNodeWithTag(TAG).assertWidthIsEqualTo(560.dp)
    }

    @Test
    fun `a window of a given size classifies itself`() {
        val tablet = MeeshyWindowInfo.of(widthDp = 1280f, heightDp = 800f)
        assertThat(tablet.widthClass).isEqualTo(WindowWidthClass.EXPANDED)
        assertThat(tablet.posture).isEqualTo(WindowPosture.NORMAL)
        assertThat(tablet.safeZone.width).isEqualTo(1280f)
    }

    private companion object {
        const val TAG = "bubble"
    }
}
