package me.meeshy.app.calls

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallWaitingBannerSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private val banner = WaitingBannerUi(callerName = "Carol", isVideo = false)

    private fun show(reduceMotion: Boolean = false, onReject: () -> Unit = {}, onAnswer: () -> Unit = {}) =
        rule.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides reduceMotion) {
                    CallWaitingBanner(banner, onReject = onReject, onAnswer = onAnswer)
                }
            }
        }

    @Test
    fun `the banner is announced politely and names the caller`() {
        show()
        rule.onNodeWithContentDescription("Incoming call from Carol")
            .assertIsDisplayed()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    @Test
    fun `both capsules are labelled, at least 44dp tall and carry explicit TalkBack descriptions`() {
        show()
        rule.onNodeWithText("Decline").assertHeightIsAtLeast(44.dp)
        rule.onNodeWithText("Answer").assertHeightIsAtLeast(44.dp)
        rule.onNodeWithContentDescription("Decline call from Carol").assertIsDisplayed()
        rule.onNodeWithContentDescription("End current call and answer Carol").assertIsDisplayed()
    }

    @Test
    fun `tapping the capsules reaches the matching callback only`() {
        var rejected = 0
        var answered = 0
        show(onReject = { rejected++ }, onAnswer = { answered++ })

        rule.onNodeWithContentDescription("Decline call from Carol").performClick()
        assertThat(rejected).isEqualTo(1)
        assertThat(answered).isEqualTo(0)

        rule.onNodeWithContentDescription("End current call and answer Carol").performClick()
        assertThat(answered).isEqualTo(1)
    }

    @Test
    fun `reduce motion still shows the banner, fading only`() {
        show(reduceMotion = true)
        rule.onNodeWithText("Carol").assertIsDisplayed()
    }
}
