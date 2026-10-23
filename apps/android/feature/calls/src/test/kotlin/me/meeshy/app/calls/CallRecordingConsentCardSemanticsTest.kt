package me.meeshy.app.calls

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingNotice
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallRecordingConsentCardSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private fun showCard(name: String = "Ana", kind: CallRecordingKind = CallRecordingKind.AUDIO, onAnswer: (Boolean) -> Unit = {}) =
        rule.setContent {
            MeeshyTheme { CallRecordingConsentCard(name, kind, accent = Color(0xFF6366F1), onAnswer = onAnswer) }
        }

    @Test
    fun `the card names the requester and explains the consent`() {
        showCard()
        rule.onNodeWithText("Ana wants to record the call").assertIsDisplayed()
        rule.onNodeWithText("Recording only starts if everyone agrees, and it is then added to the conversation.").assertIsDisplayed()
    }

    @Test
    fun `a video request says so`() {
        showCard(kind = CallRecordingKind.VIDEO)
        rule.onNodeWithText("Ana wants to record the call on video").assertIsDisplayed()
    }

    @Test
    fun `an unnamed requester reads as a participant`() {
        showCard(name = "")
        rule.onNodeWithText("A participant wants to record the call").assertIsDisplayed()
    }

    @Test
    fun `both answers are at least 48dp tall and reach the callback`() {
        val answers = mutableListOf<Boolean>()
        showCard(onAnswer = { answers += it })

        rule.onNodeWithText("Decline").assertHeightIsAtLeast(48.dp).performClick()
        rule.onNodeWithText("Accept").assertHeightIsAtLeast(48.dp).performClick()

        assertThat(answers).containsExactly(false, true).inOrder()
    }

    @Test
    fun `the status pill stops from a labelled button`() {
        var stopped = 0
        rule.setContent {
            MeeshyTheme { CallRecordingStatusPill("Recording in progress", "Stop recording", onStop = { stopped++ }) }
        }
        rule.onNodeWithText("Recording in progress").assertIsDisplayed()
        rule.onNodeWithContentDescription("Stop recording").performClick()
        assertThat(stopped).isEqualTo(1)
    }

    @Test
    fun `a notice pill can be closed`() {
        var dismissed = 0
        rule.setContent {
            MeeshyTheme { CallRecordingNoticePill(CallRecordingNotice.Stopped("refused", false), onDismiss = { dismissed++ }) }
        }
        rule.onNodeWithText("Recording declined").assertIsDisplayed()
        rule.onNodeWithContentDescription("Close").performClick()
        assertThat(dismissed).isEqualTo(1)
    }

    @Test
    fun `the kind panel offers audio only and audio and video`() {
        val picked = mutableListOf<CallRecordingKind>()
        rule.setContent { MeeshyTheme { CallRecordingKindPanel(onPick = { picked += it }) } }
        rule.onNodeWithContentDescription("Audio and video").performClick()
        rule.onNodeWithContentDescription("Audio only").performClick()
        assertThat(picked).containsExactly(CallRecordingKind.VIDEO, CallRecordingKind.AUDIO).inOrder()
    }
}
