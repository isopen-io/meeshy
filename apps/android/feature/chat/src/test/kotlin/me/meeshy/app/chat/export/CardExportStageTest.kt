package me.meeshy.app.chat.export

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14537 — l'invite « Touchez une partie de la carte » se pose SOUS la carte, dans une place qui lui est gardée : elle ne
 * recouvre jamais le pied de la carte (la dernière ligne, la signature, le filigrane), et son départ ne fait pas sauter
 * la carte.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h640dp")
class CardExportStageTest {

    @get:Rule
    val compose = createComposeRule()

    private fun image(height: Double) = CardImage(Bitmap.createBitmap(108, (height / 10).toInt(), Bitmap.Config.ARGB_8888), 1080.0, height, emptyList(), false)

    private fun stage(hint: Boolean, height: Double = 1350.0): MutableState<Boolean> {
        val shown = mutableStateOf(hint)
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Box(Modifier.size(360.dp, 420.dp)) {
                    CardExportStage(image(height), failed = false, hint = shown.value, focus = null, onPick = {})
                }
            }
        }
        compose.waitForIdle()
        return shown
    }

    @Test
    fun `the hint sits below the card, never over its foot`() {
        stage(hint = true)

        val card = compose.onNodeWithTag(CardExportStage.CARD_TAG).getUnclippedBoundsInRoot()
        val hint = compose.onNodeWithTag(CardExportStage.HINT_TAG).getUnclippedBoundsInRoot()

        assertThat(hint.top).isAtLeast(card.bottom)
        assertThat(hint.bottom).isAtMost(420.dp)
    }

    @Test
    fun `a card taller than the stage still leaves the hint its place`() {
        stage(hint = true, height = 1920.0)

        val card = compose.onNodeWithTag(CardExportStage.CARD_TAG).getUnclippedBoundsInRoot()
        val hint = compose.onNodeWithTag(CardExportStage.HINT_TAG).getUnclippedBoundsInRoot()

        assertThat(hint.top).isAtLeast(card.bottom)
    }

    @Test
    fun `the card keeps its size when the hint leaves`() {
        val shown = stage(hint = true)
        val withHint = compose.onNodeWithTag(CardExportStage.CARD_TAG).getUnclippedBoundsInRoot()
        shown.value = false
        compose.waitForIdle()
        val without = compose.onNodeWithTag(CardExportStage.CARD_TAG).getUnclippedBoundsInRoot()

        assertThat(without.height).isEqualTo(withHint.height)
        compose.onNodeWithTag(CardExportStage.HINT_TAG).assertDoesNotExist()
    }
}
