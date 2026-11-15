package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class StoryCanvasAccessibilityTest {
    @get:Rule val rule = createComposeRule()

    private val slide = StorySlideView(id = "s1", text = "", isTranslated = false, imageUrl = null, accentHex = "1A7F4B")
    private val calls = mutableListOf<String>()

    private fun show(paused: Boolean = false) = rule.setContent {
        Box(
            Modifier.size(100.dp).testTag("canvas").storyCanvasAccessibility(
                slide = slide, index = 1, count = 5, authorName = "Alice", transcript = "Bonjour",
                paused = paused, fullscreen = false,
                actions = StoryCanvasA11yActions(
                    onNext = { calls += "next" }, onPrevious = { calls += "previous" }, onTogglePause = { calls += "pause" },
                    onToggleFullscreen = { calls += "fullscreen" }, onClose = { calls += "close" },
                ),
            ),
        )
    }

    @Test
    fun `le canvas est un seul element qui dit la position l'auteur et la transcription`() {
        show()
        val description = rule.onNodeWithTag("canvas").fetchSemanticsNode().config
            .getOrNull(SemanticsProperties.ContentDescription).orEmpty().joinToString()
        assertThat(description).contains("2")
        assertThat(description).contains("5")
        assertThat(description).contains("Alice")
        assertThat(description.indexOf("Alice")).isLessThan(description.indexOf("Bonjour"))
    }

    @Test
    fun `cinq actions nommees remplacent tout geste glisse ou zone tactile`() {
        show()
        val actions = rule.onNodeWithTag("canvas").fetchSemanticsNode().config
            .getOrNull(androidx.compose.ui.semantics.SemanticsActions.CustomActions).orEmpty()
        assertThat(actions).hasSize(5)
        actions.first().action()
        actions.last().action()
        assertThat(calls).containsExactly("next", "close").inOrder()
    }
}
