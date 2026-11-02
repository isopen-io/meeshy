package me.meeshy.app.conversations

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationReportSheetTest {

    @get:Rule
    val compose = createComposeRule()

    private var submitted: Pair<ReportReason, String?>? = null
    private var cancelled = false

    private fun render() {
        compose.setContent {
            MeeshyTheme {
                ConversationReportForm(
                    accent = MeeshyPalette.Indigo500,
                    onSubmit = { reason, details -> submitted = reason to details },
                    onCancel = { cancelled = true },
                )
            }
        }
    }

    @Test
    fun `the sheet asks why the conversation is reported`() {
        render()

        compose.onNodeWithText("Why are you reporting this conversation?").assertIsDisplayed()
    }

    @Test
    fun `send carries the chosen reason and no details when none are typed`() {
        render()

        compose.onNodeWithText("Harassment").performScrollTo().performClick()
        compose.onNodeWithText("Send").performClick()

        assertThat(submitted).isEqualTo(ReportReason.HARASSMENT to null)
    }

    @Test
    fun `send carries the trimmed details`() {
        render()

        compose.onNode(hasSetTextAction()).performScrollTo().performTextInput("  spam links  ")
        compose.onNodeWithText("Send").performScrollTo().performClick()

        assertThat(submitted).isEqualTo(ReportReason.SPAM to "spam links")
    }

    @Test
    fun `cancel closes without sending`() {
        render()

        compose.onNodeWithText("Cancel").performClick()

        assertThat(cancelled).isTrue()
        assertThat(submitted).isNull()
    }
}
