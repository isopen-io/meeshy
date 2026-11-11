package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performTouchInput
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

    private fun line(
        key: String,
        text: String,
        isFinal: Boolean = true,
        tag: String? = "EN → FR",
        originalBelow: String? = null,
        awaitingUntilMs: Long? = null,
        speakerName: String = "Ada",
    ) = CallLiveCaptionLine(
        key = key, speakerId = "peer", speakerName = speakerName, isLocal = false, text = text, languageTag = tag,
        isFinal = isFinal, capturedAtMs = 0, isShowingOriginal = tag == null || !tag.contains("→"), canRevealOriginal = tag != null && tag.contains("→"),
        originalBelow = originalBelow, awaitingUntilMs = awaitingUntilMs,
        originLanguage = tag?.substringBefore(" →"), servedLanguage = tag?.substringAfter("→ ", "")?.takeIf { it.isNotEmpty() },
    )

    @Test
    fun `the sentence is one piece, name then text then the label, and a touch asks to flip it`() {
        val flipped = mutableListOf<String>()
        rule.setContent {
            MeeshyTheme { CallCaptionsBand(lines = listOf(line("a", "Bonjour")), onToggleOriginal = { flipped += it }, onOpenJournal = {}) }
        }

        rule.onNodeWithText("Ada · Bonjour", substring = true).assertIsDisplayed()
        rule.onNodeWithText("Ada · Bonjour", substring = true).performClick()

        assertThat(flipped).containsExactly("a")
    }

    @Test
    fun `the touched translation unfolds its original below in one more line`() {
        rule.setContent {
            MeeshyTheme { CallCaptionsBand(lines = listOf(line("a", "Bonjour", originalBelow = "Hello")), onToggleOriginal = {}, onOpenJournal = {}) }
        }

        rule.onNodeWithText("Original · Hello", substring = true).assertIsDisplayed()
        rule.onNodeWithText("Ada · Bonjour", substring = true).assertIsDisplayed()
    }

    @Test
    fun `an original awaiting its translation is labelled and says so in the foot`() {
        rule.setContent {
            MeeshyTheme {
                CallCaptionsBand(
                    lines = listOf(line("a", "Hello", tag = "EN", awaitingUntilMs = System.currentTimeMillis() + 60_000)),
                    onToggleOriginal = {},
                    onOpenJournal = {},
                )
            }
        }

        rule.onNodeWithText("Ada · Hello", substring = true).assertIsDisplayed()
        rule.onNodeWithText("EN · translating").assertIsDisplayed()
    }

    @Test
    fun `an awaited translation that is given up falls out of the foot`() {
        rule.setContent {
            MeeshyTheme {
                CallCaptionsBand(
                    lines = listOf(line("a", "Hello", tag = "EN", awaitingUntilMs = 1)),
                    onToggleOriginal = {},
                    onOpenJournal = {},
                )
            }
        }

        rule.onNodeWithText("EN · translating").assertDoesNotExist()
    }

    @Test
    fun `the band is the live region « Call captions »`() {
        rule.setContent {
            MeeshyTheme { CallCaptionsBand(lines = listOf(line("a", "Bonjour")), onToggleOriginal = {}, onOpenJournal = {}, modifier = Modifier.testTag("band")) }
        }

        val node = rule.onNodeWithTag("band").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.ContentDescription)).containsExactly("Call captions")
    }

    @Test
    fun `a touch on the band, even on its margin, never reaches the scene beneath it (#17495)`() {
        var sceneTaps = 0
        rule.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize().testTag("scene").clickable { sceneTaps++ })
                    CallCaptionsBand(
                        lines = listOf(line("a", "Hello", tag = null)),
                        onToggleOriginal = {},
                        onOpenJournal = {},
                        modifier = Modifier.testTag("band").align(Alignment.BottomCenter),
                    )
                }
            }
        }

        rule.onNodeWithTag("band").performTouchInput { click(Offset(2f, 2f)) }
        assertThat(sceneTaps).isEqualTo(0)

        rule.onNodeWithTag("scene").performTouchInput { click(Offset(2f, 2f)) }
        assertThat(sceneTaps).isEqualTo(1)
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
    fun `an original line outside the prism says nothing of touching in the foot`() {
        rule.setContent {
            MeeshyTheme { CallCaptionsBand(lines = listOf(line("a", "Hello", tag = "EN")), onToggleOriginal = {}, onOpenJournal = {}) }
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
    fun `the captions of a mode, which has no pill, take a glass of their own limited to 560 dp (#17343, G1_3)`() {
        rule.setContent {
            MeeshyTheme {
                CallCaptionsBand(
                    lines = listOf(line("a", "Bonjour")),
                    onToggleOriginal = {},
                    onOpenJournal = {},
                    modifier = Modifier.testTag("mode"),
                    hasOwnGlass = true,
                )
            }
        }

        rule.onNodeWithTag("mode").assertWidthIsEqualTo(560.dp)
        rule.onNodeWithText("Ada · Bonjour", substring = true).assertIsDisplayed()
    }

    private fun collectLabels(node: androidx.compose.ui.semantics.SemanticsNode): List<String> =
        listOfNotNull(node.config.getOrNull(SemanticsProperties.ContentDescription)?.firstOrNull()) +
            node.children.flatMap(::collectLabels)
}
