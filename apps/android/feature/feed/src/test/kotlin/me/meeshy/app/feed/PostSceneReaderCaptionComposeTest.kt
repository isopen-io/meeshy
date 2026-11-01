package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14200 — comme iOS (`SceneCaption.resolve`, `carrierFallback: true`) : le plein écran d'un post à scène montre la légende de la
 * scène LUE, et, pour une scène dont le média n'en porte pas, le texte du post, que rien d'autre n'y affiche.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostSceneReaderCaptionComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val card: ReelSceneRenderer = { _, _, _, _, modifier -> Box(modifier) }
    private val reader: PostSceneReaderRenderer = { _, _, _, modifier -> Box(modifier) }

    private fun scenes(captions: List<String?>, carrierText: String?) = FeedPostScenes(
        items = captions.indices.map { StoryItem(id = "p1#scene-$it") },
        layout = MosaicLayoutMode.WAVE,
        accentHex = "6366F1",
        captions = captions,
        carrierText = carrierText,
    )

    private fun open(scenes: FeedPostScenes, label: String) {
        compose.setContent {
            CompositionLocalProvider(LocalReelSceneRenderer provides card, LocalPostSceneReaderRenderer provides reader) {
                FeedPostCardMediaSlot(post = feedPostPresentation(id = "p1").copy(scenes = scenes), onImageTap = {}, onOpenPost = {})
            }
        }
        compose.onNodeWithContentDescription(label).performClick()
        compose.waitForIdle()
    }

    @Test
    fun `the full screen of a scene shows the caption of the media it shows`() {
        open(scenes(listOf("Le port au matin", "La plage"), carrierText = "Deux vues de la côte"), "Scene 2")

        compose.onNodeWithText("La plage").assertIsDisplayed()
        compose.onNodeWithText("Le port au matin").assertDoesNotExist()
        compose.onNodeWithText("Deux vues de la côte").assertDoesNotExist()
    }

    @Test
    fun `a scene whose media has no caption shows the post text, under the controls it leaves visible`() {
        open(scenes(listOf("Le port au matin", null), carrierText = "Deux vues de la côte"), "Scene 2")

        compose.onNodeWithText("Deux vues de la côte").assertIsDisplayed()
        compose.onNodeWithContentDescription("Close").assertIsDisplayed()
    }

    @Test
    fun `a scene with neither a caption nor a post text paints no caption band`() {
        open(scenes(listOf("Le port au matin", null), carrierText = null), "Scene 2")

        compose.onNodeWithText("Le port au matin").assertDoesNotExist()
    }
}
