package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleFailedRetryBarRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(onRetry: () -> Unit) {
        compose.setContent {
            Box(Modifier.height(80.dp)) {
                BubbleFailedRetryBar(
                    failure = BubbleFailure.RETRY,
                    onRetry = onRetry,
                    modifier = Modifier.testTag("bar"),
                )
            }
        }
    }

    @Test
    fun `la bande couvre toute la hauteur avec une cible d'au moins 48 dp`() {
        show {}
        compose.onNodeWithTag("bar").assertHeightIsEqualTo(80.dp).assertWidthIsAtLeast(48.dp)
    }

    @Test
    fun `toucher la bande appelle onRetry une seule fois meme repete`() {
        var calls = 0
        show { calls++ }
        compose.onNodeWithTag("bar").performClick()
        compose.onNodeWithTag("bar").performClick()
        assertThat(calls).isEqualTo(1)
    }
}
