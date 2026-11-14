package me.meeshy.ui.component.focal

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.reading.focal.FocalCallParticipants
import me.meeshy.sdk.model.reading.focal.FocalSpecialRow
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalSystemRowsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun content(
        text: String = "",
        deleted: Boolean = false,
        system: Boolean = false,
        call: CallSummaryMetadata? = null,
        participants: FocalCallParticipants.Roster? = null,
    ) = BubbleContent(
        messageId = "m1", text = text, isOutgoing = false, isTranslated = false, originalText = null,
        senderName = null, showSenderName = false, isEdited = false, isDeleted = deleted, createdAtIso = null,
        isSystem = system, callSummary = call, callIsOutgoing = false, callParticipants = participants,
    )

    private fun call(outcome: CallSummaryMetadata.Outcome = CallSummaryMetadata.Outcome.MISSED) = CallSummaryMetadata(
        callId = "c1", initiatorId = "u2", callType = CallSummaryMetadata.MediaType.AUDIO, outcome = outcome,
        durationSeconds = 0, bytesTotal = null, bytesEstimated = false, networkQuality = null,
    )

    private fun show(content: BubbleContent, callbacks: BubbleCallbacks = BubbleCallbacks.None) {
        compose.setContent {
            MeeshyTheme { FocalSpecialRowView(content.focalSpecialRow(), content, Color.Blue, callbacks) }
        }
    }

    @Test fun `le routage distingue supprime avis appel et message standard`() {
        assertThat(content(text = "x").focalSpecialRow()).isEqualTo(FocalSpecialRow.None)
        assertThat(content(deleted = true).focalSpecialRow()).isEqualTo(FocalSpecialRow.Deleted)
        assertThat(content(system = true, text = "Alice a rejoint").focalSpecialRow()).isEqualTo(FocalSpecialRow.SystemNotice)
        assertThat(content(system = true, call = call()).focalSpecialRow()).isEqualTo(FocalSpecialRow.CallNotice)
    }

    @Test fun `un message supprime se dit en une ligne`() {
        show(content(deleted = true))
        compose.onNodeWithText("Message deleted").assertExists()
    }

    @Test fun `un avis systeme montre son texte`() {
        show(content(system = true, text = "Alice a rejoint le groupe"))
        compose.onNodeWithText("Alice a rejoint le groupe").assertExists()
    }

    @Test fun `la notice d'appel rappelle au double tap et ouvre les options a l'appui long`() {
        var calledBack = 0
        var longPressed = 0
        show(
            content(system = true, call = call()),
            BubbleCallbacks(onCallBack = { calledBack++ }, onLongPress = { longPressed++ }),
        )
        compose.onNodeWithText("Missed voice call").performTouchInput { doubleClick() }
        assertThat(calledBack).isEqualTo(1)
        compose.onNodeWithText("Missed voice call").performTouchInput { longClick() }
        assertThat(longPressed).isEqualTo(1)
    }

    @Test fun `la carte nomme ses participants sous son titre, moi en dernier`() {
        val roster = FocalCallParticipants.Roster(others = listOf("Awa", "Karim", "Lina"), viewerTookPart = true)
        show(content(system = true, call = call(CallSummaryMetadata.Outcome.COMPLETED), participants = roster))
        compose.onNodeWithText("Awa, Karim, Lina, and you").assertExists()
    }

    @Test fun `la ligne des participants est lue avec la carte`() {
        val roster = FocalCallParticipants.Roster(others = listOf("Awa"), viewerTookPart = true)
        show(content(system = true, call = call(CallSummaryMetadata.Outcome.COMPLETED), participants = roster))
        compose.onNode(hasContentDescriptionContaining("Awa and you")).assertExists()
    }

    @Test fun `sans participants servis la carte ne dessine aucune ligne`() {
        show(content(system = true, call = call(CallSummaryMetadata.Outcome.COMPLETED)))
        compose.onNodeWithText("you", substring = true).assertDoesNotExist()
    }

    private fun hasContentDescriptionContaining(part: String) =
        androidx.compose.ui.test.SemanticsMatcher("description contains $part") { node ->
            node.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.ContentDescription)?.any { it.contains(part) } == true
        }
}
