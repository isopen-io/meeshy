package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.component.viewer.LocalViewerTopOverlay
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * S1.8 (#17766) — le plein écran des scènes d'un post est une fenêtre à part : la pastille de l'appel réduit s'y redessine,
 * au-dessus de ✕, pour que l'appel reste atteignable pendant qu'on lit un post.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostSceneReaderCallPillTest {

    @get:Rule
    val compose = createComposeRule()

    private val card: ReelSceneRenderer = { _, _, _, _, modifier -> Box(modifier) }
    private val reader: PostSceneReaderRenderer = { _, _, _, modifier -> Box(modifier) }

    @Test
    fun `la pastille de l'appel reduit reste posee au-dessus du plein ecran des scenes`() {
        val pill: @Composable () -> Unit = { Text("pastille d'appel") }
        val scenes = FeedPostScenes(
            items = listOf(StoryItem(id = "p1#scene-0"), StoryItem(id = "p1#scene-1")),
            layout = MosaicLayoutMode.WAVE,
            accentHex = "6366F1",
            captions = listOf(null, null),
            carrierText = null,
        )
        compose.setContent {
            CompositionLocalProvider(
                LocalPostSceneCardRenderer provides card,
                LocalPostSceneReaderRenderer provides reader,
                LocalViewerTopOverlay provides pill,
            ) {
                FeedPostCardMediaSlot(post = feedPostPresentation(id = "p1").copy(scenes = scenes), onImageTap = {}, onOpenPost = {})
            }
        }
        compose.onNodeWithContentDescription("Scene 1").performClick()
        compose.waitForIdle()

        val bottomOfPill = compose.onNodeWithText("pastille d'appel").getUnclippedBoundsInRoot().bottom.value
        val topOfClose = compose.onNodeWithContentDescription("Close").getUnclippedBoundsInRoot().top.value
        assertThat(topOfClose).isAtLeast(bottomOfPill)
    }
}
