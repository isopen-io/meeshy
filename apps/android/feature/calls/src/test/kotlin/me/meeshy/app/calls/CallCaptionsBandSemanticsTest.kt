package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
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

    @Test
    fun `the foot tells what the line says of its translation (#17343)`() {
        rule.setContent {
            MeeshyTheme { CallCaptionsBand(lines = listOf(line("a", "Bonjour")), onToggleOriginal = {}, onOpenJournal = {}) }
        }

        rule.onNodeWithText("EN → FR · tap = original").assertIsDisplayed()
    }

    @Test
    fun `an original line says nothing in the foot`() {
        rule.setContent {
            MeeshyTheme { CallCaptionsBand(lines = listOf(line("a", "Hello", tag = null)), onToggleOriginal = {}, onOpenJournal = {}) }
        }

        rule.onNodeWithText("tap = original", substring = true).assertDoesNotExist()
    }

    @Test
    fun `the Journal button is a 48 dp target that opens the journal`() {
        var opened = 0
        rule.setContent {
            MeeshyTheme { CallCaptionsBand(lines = listOf(line("a", "Bonjour")), onToggleOriginal = {}, onOpenJournal = { opened++ }) }
        }

        rule.onNodeWithText("Journal").assertHeightIsAtLeast(48.dp).performClick()

        assertThat(opened).isEqualTo(1)
    }

    @Test
    @Config(sdk = [34], qualifiers = "w1000dp-h800dp")
    fun `the stowed captions take a glass of their own, limited to 560 dp (#17343)`() {
        rule.setContent {
            MeeshyTheme {
                CallCaptionsBand(
                    lines = listOf(line("a", "Bonjour")),
                    onToggleOriginal = {},
                    onOpenJournal = {},
                    modifier = Modifier.testTag("stowed"),
                    hasOwnGlass = true,
                )
            }
        }

        rule.onNodeWithTag("stowed").assertWidthIsEqualTo(560.dp)
        rule.onNodeWithText("Bonjour").assertIsDisplayed()
    }

    private fun collectLabels(node: androidx.compose.ui.semantics.SemanticsNode): List<String> =
        listOfNotNull(node.config.getOrNull(SemanticsProperties.ContentDescription)?.firstOrNull()) +
            node.children.flatMap(::collectLabels)
}
