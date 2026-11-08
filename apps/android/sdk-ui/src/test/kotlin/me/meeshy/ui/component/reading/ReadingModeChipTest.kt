package me.meeshy.ui.component.reading

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.BUBBLES
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.FOCAL
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.RIVER
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.SCRIPT
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuModel
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class ReadingModeChipTest {

    @get:Rule
    val compose = createComposeRule()

    private val selected = mutableListOf<ConversationReadingMode>()
    private var autoTaps = 0

    private fun show(
        mode: ConversationReadingMode = SCRIPT,
        isAuto: Boolean = false,
        next: ConversationReadingMode? = BUBBLES,
        preference: ConversationReadingMode? = SCRIPT,
        type: String = "direct",
        members: Int = 2,
    ) {
        val entries = ReadingModeMenuModel.forConversation(type, members, false, true, true, preference)
        compose.setContent {
            MeeshyTheme {
                ReadingModeChip(
                    mode = mode,
                    isAuto = isAuto,
                    entries = entries,
                    nextInCycle = next,
                    accentColor = Color(0xFF123456),
                    onSelect = { selected += it },
                    onAuto = { autoTaps++ },
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `a tap cycles to the next mode`() {
        show(mode = FOCAL, next = SCRIPT)
        compose.onNodeWithTag(READING_MODE_CHIP_TAG).performClick()
        assertThat(selected).containsExactly(SCRIPT)
    }

    @Test
    fun `a tap with nothing to cycle to opens the menu instead`() {
        show(next = null)
        compose.onNodeWithTag(READING_MODE_CHIP_TAG).performClick()
        compose.onNodeWithTag(readingModeEntryTestTag(ReadingModeChoice.Auto)).assertIsDisplayed()
        assertThat(selected).isEmpty()
    }

    @Test
    fun `a long press opens the menu with six entries and the river greyed with its reason`() {
        show()
        compose.onNodeWithTag(READING_MODE_CHIP_TAG).performTouchInput { longClick() }
        listOf(ReadingModeChoice.Auto) .plus(ReadingModeChoice.Mode(FOCAL)).plus(ReadingModeChoice.Mode(RIVER))
            .forEach { compose.onNodeWithTag(readingModeEntryTestTag(it)).assertIsDisplayed() }
        compose.onNodeWithTag(readingModeEntryTestTag(ReadingModeChoice.Mode(RIVER))).assertIsNotEnabled()
        compose.onNodeWithContentDescription("Never in a direct conversation", substring = true).assertIsDisplayed()
    }

    @Test
    fun `choosing automatic in the menu resets to auto`() {
        show()
        compose.onNodeWithTag(READING_MODE_CHIP_TAG).performTouchInput { longClick() }
        compose.onNodeWithTag(readingModeEntryTestTag(ReadingModeChoice.Auto)).performClick()
        assertThat(autoTaps).isEqualTo(1)
    }

    @Test
    fun `the auto prefix shows only when the decision is automatic`() {
        show(isAuto = true, preference = null)
        // La puce efface la sémantique de ses enfants (`clearAndSetSemantics`) : le « AUTO » peint n'est pas un nœud,
        // le lecteur d'écran l'entend par l'état de la puce.
        compose.onNodeWithTag(READING_MODE_CHIP_TAG)
            .assertIsDisplayed()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "AUTO"))
    }

    @Test
    fun `no auto prefix for a sticky choice`() {
        show(isAuto = false)
        compose.onNodeWithTag(READING_MODE_CHIP_TAG)
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.StateDescription))
    }

    @Test
    fun `the touch target is at least 44 dp tall`() {
        show()
        compose.onNodeWithTag(READING_MODE_CHIP_TAG).assertHeightIsAtLeast(44.dp)
    }
}
