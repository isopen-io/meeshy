package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w411dp-h891dp")
class StoryCaptionOverlayComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val long = (1..40).joinToString(" ") { "mot$it" }

    private fun show(text: String, startExpanded: Boolean = false) {
        compose.setContent {
            var expanded by remember { mutableStateOf(startExpanded) }
            MeeshyTheme { StoryCaptionOverlay(text = text, expanded = expanded, onToggle = { expanded = !expanded }) }
        }
        compose.waitForIdle()
    }

    @Test
    fun `une legende longue se replie puis se deplie en entier`() {
        show(long)

        compose.onNodeWithText("see more").assertExists()
        compose.onNodeWithText("mot40", substring = true).assertDoesNotExist()
        compose.onNodeWithText("see more").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("mot40", substring = true).assertExists()
        compose.onNodeWithText("see less").assertExists()
    }

    @Test
    fun `la zone de retour en tete n'existe que depliee`() {
        show(long)
        compose.onNodeWithTag(STORY_CAPTION_SCROLL_TOP_TAG).assertDoesNotExist()
        compose.onNodeWithText("see more").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag(STORY_CAPTION_SCROLL_TOP_TAG).assertExists()
    }

    @Test
    fun `une legende courte n'a ni invite ni zone de retour`() {
        show("Bonjour", startExpanded = true)
        compose.onNodeWithText("see more").assertDoesNotExist()
        compose.onNodeWithTag(STORY_CAPTION_SCROLL_TOP_TAG).assertDoesNotExist()
    }
}
