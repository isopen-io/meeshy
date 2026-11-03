package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallCaptionsBandSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private fun line(key: String, text: String, isFinal: Boolean = true, tag: String? = "EN → FR") = CallLiveCaptionLine(
        key = key, speakerId = "peer", speakerName = "Ada", isLocal = false, text = text, languageTag = tag,
        isFinal = isFinal, capturedAtMs = 0, isShowingOriginal = tag == null, canRevealOriginal = tag != null,
    )

    @Test
    fun `the band shows the translated tag and a touch asks to flip the sentence`() {
        val flipped = mutableListOf<String>()
        rule.setContent {
            MeeshyTheme { CallCaptionsBand(lines = listOf(line("a", "Bonjour")), onToggleOriginal = { flipped += it }, onOpenJournal = {}) }
        }

        rule.onNodeWithText("EN → FR").assertIsDisplayed()
        rule.onNodeWithText("Bonjour").performClick()

        assertThat(flipped).containsExactly("a")
    }

    @Test
    fun `an empty band says captions will appear`() {
        rule.setContent { MeeshyTheme { CallCaptionsBand(lines = emptyList(), onToggleOriginal = {}, onOpenJournal = {}) } }

        rule.onNodeWithText("Captions will appear here as soon as someone speaks.").assertIsDisplayed()
    }

    @Test
    fun `TalkBack reads final sentences and skips the partial one`() {
        rule.setContent {
            MeeshyTheme {
                CallCaptionsBand(
                    lines = listOf(line("a", "Bonjour"), line("b", "Comment", isFinal = false, tag = null)),
                    onToggleOriginal = {},
                    onOpenJournal = {},
                )
            }
        }

        val described = rule.onRoot(useUnmergedTree = false).fetchSemanticsNode()
        val labels = collectLabels(described)
        assertThat(labels).contains("Ada : Bonjour")
        assertThat(labels).doesNotContain("Ada : Comment")
    }

    private fun collectLabels(node: androidx.compose.ui.semantics.SemanticsNode): List<String> =
        listOfNotNull(node.config.getOrNull(SemanticsProperties.ContentDescription)?.firstOrNull()) +
            node.children.flatMap(::collectLabels)
}
