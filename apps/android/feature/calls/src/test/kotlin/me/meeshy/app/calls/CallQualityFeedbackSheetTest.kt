package me.meeshy.app.calls

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallFeedbackIssue
import me.meeshy.sdk.model.call.CallQualityFeedback
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CallQualityFeedbackSheetTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun `send is disabled until a rating is chosen then submits rating and issues`() {
        var sent: CallQualityFeedback? = null
        rule.setContent { MeeshyTheme { CallQualityFeedbackSheet("c1", onSubmit = { sent = it }, onSkip = {}) } }
        rule.onNodeWithText("Send").assertIsNotEnabled()
        rule.onNodeWithContentDescription("4 of 5 stars").performClick()
        rule.onNodeWithText("Echo").performClick()
        rule.onNodeWithText("Send").assertIsEnabled().performClick()
        assertThat(sent?.rating).isEqualTo(4)
        assertThat(sent?.issues).containsExactly(CallFeedbackIssue.ECHO)
        assertThat(sent?.callId).isEqualTo("c1")
    }

    @Test
    fun `skip does not submit`() {
        var skipped = false
        var sent = false
        rule.setContent { MeeshyTheme { CallQualityFeedbackSheet("c1", onSubmit = { sent = true }, onSkip = { skipped = true }) } }
        rule.onNodeWithText("Not now").performClick()
        assertThat(skipped).isTrue()
        assertThat(sent).isFalse()
    }
}
