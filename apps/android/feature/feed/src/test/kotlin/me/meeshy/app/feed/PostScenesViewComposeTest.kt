package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13863 R7 — la carte d'un post composé sur la scène peint ses scènes par le moteur de la scène, à la place de ses images :
 * le carrousel ne fait jouer que sa page courante, une mosaïque pose des scènes arrêtées, toucher une scène l'ouvre en plein écran
 * sur ELLE, et un post sans scène ne monte aucun lecteur.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostScenesViewComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val painted = mutableListOf<Pair<String, Boolean>>()
    private val read = mutableListOf<Pair<String, Boolean>>()

    private val card: ReelSceneRenderer = { item, _, live, modifier -> painted += item.id to live; Box(modifier) }
    private val reader: PostSceneReaderRenderer = { item, _, playing, modifier -> read += item.id to playing; Box(modifier) }

    private fun scenePost(layout: MosaicLayoutMode, vararg ids: String) = feedPostPresentation(id = "p1").copy(
        scenes = FeedPostScenes(items = ids.map { StoryItem(id = it) }, layout = layout, accentHex = "6366F1"),
    )

    private fun show(post: FeedPostPresentation) {
        compose.setContent {
            CompositionLocalProvider(LocalReelSceneRenderer provides card, LocalPostSceneReaderRenderer provides reader) {
                FeedPostCardMediaSlot(post = post, onImageTap = {}, onOpenPost = {})
            }
        }
    }

    @Test
    fun `the carousel paints its first scene through the scene engine and opens it full screen on a tap`() {
        show(scenePost(MosaicLayoutMode.CAROUSEL, "p1#scene-0", "p1#scene-1"))

        assertThat(painted.map { it.first }).contains("p1#scene-0")
        compose.onNodeWithContentDescription("Scene 1").performClick()
        compose.waitForIdle()

        assertThat(read.last()).isEqualTo("p1#scene-0" to true)
    }

    @Test
    fun `a mosaic lays its scenes side by side, at rest, and opens the one touched`() {
        show(scenePost(MosaicLayoutMode.WAVE, "p1#scene-0", "p1#scene-1"))

        assertThat(painted.toSet()).containsExactly("p1#scene-0" to false, "p1#scene-1" to false)
        compose.onNodeWithContentDescription("Scene 2").performClick()
        compose.waitForIdle()

        assertThat(read.last()).isEqualTo("p1#scene-1" to true)
    }

    @Test
    fun `a post without scenes mounts no scene player`() {
        show(feedPostPresentation(id = "texte"))

        assertThat(painted).isEmpty()
    }
}
