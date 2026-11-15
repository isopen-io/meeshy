package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.runtime.remember
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13897 — la légende d'une story (`slide.text`) entre dans la vidéo exportée, posée comme le lecteur l'ouvre : en bas à
 * gauche, repliée au-delà de trente mots, sans le « voir plus » qu'aucune vidéo ne peut toucher.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class StoryExportSceneComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private fun slide(text: String) = StorySlideView(id = "s1", text = text, isTranslated = false, imageUrl = null, accentHex = "6366F1")

    private fun show(text: String) {
        compose.setContent {
            StoryExportScene(
                slide = slide(text),
                withBackground = true,
                progress = remember { Animatable(0f) },
                slideDurationMs = 6_000,
                onImageResolved = {},
            )
        }
        compose.waitForIdle()
    }

    @Test
    fun `the exported scene carries the slide caption`() {
        show("Bonjour à tous")

        compose.onNodeWithText("Bonjour à tous").assertExists()
    }

    @Test
    fun `a long caption is baked folded as the reader opens it, without its see more`() {
        val words = (1..40).map { "mot$it" }
        show(words.joinToString(" "))

        compose.onNodeWithText(words.take(15).joinToString(" ") + "…").assertExists()
        compose.onNodeWithText("See more", ignoreCase = true).assertDoesNotExist()
    }

    @Test
    fun `a slide without caption bakes no caption`() {
        show("   ")

        compose.onNodeWithTag(STORY_EXPORT_CAPTION_TAG).assertDoesNotExist()
    }
}
