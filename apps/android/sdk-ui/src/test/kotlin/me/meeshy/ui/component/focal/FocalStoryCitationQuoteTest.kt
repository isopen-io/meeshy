package me.meeshy.ui.component.focal

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleStoryReply
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalStoryCitationQuoteTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(story: BubbleStoryReply, onOpen: () -> Unit) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                FocalStoryCitationQuote(story = story, railColor = Color.Red, accentColor = Color.Blue, onOpen = onOpen)
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `toucher la scene citee ouvre la story`() {
        var opened = 0
        show(BubbleStoryReply(previewText = "Coucher de soleil", postId = "p1"), onOpen = { opened++ })

        compose.onNodeWithText("Coucher de soleil", useUnmergedTree = true).performClick()

        assertThat(opened).isEqualTo(1)
    }
}
