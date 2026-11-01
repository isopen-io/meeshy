package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.SceneRect
import me.meeshy.sdk.model.SceneShape
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14199 — comme iOS `SceneFraming.cardFocus` : la carte d'un post à scène se cadre sur ce que la scène MONTRE. Un objet posé
 * dans le haut d'une scène reste visible dans la grande tuile d'un hero, là où le cadrage au centre le coupe ; une page de
 * carrousel prend le rapport de sa zone, la scène posée à son échelle.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostScenesFramingComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val laid = mutableMapOf<String, Rect>()

    /** La scène telle que posée, AVANT le rognage de sa tuile : sa position et sa taille entières. */
    private val card: ReelSceneRenderer = { item, _, _, _, modifier ->
        Box(
            modifier.onGloballyPositioned { coordinates ->
                val origin = coordinates.positionInRoot()
                laid[item.id] = Rect(origin.x, origin.y, origin.x + coordinates.size.width, origin.y + coordinates.size.height)
            },
        )
    }

    private val haut = SceneRect(0.0, 0.0, 1.0, 0.42)

    private fun scenes(layout: MosaicLayoutMode, count: Int, frames: List<SceneCardFraming>) = FeedPostScenes(
        items = (0 until count).map { StoryItem(id = "p1#scene-$it") },
        layout = layout,
        accentHex = "6366F1",
        frames = frames,
    )

    private fun show(scenes: FeedPostScenes) {
        compose.setContent {
            CompositionLocalProvider(LocalReelSceneRenderer provides card) {
                FeedPostCardMediaSlot(post = feedPostPresentation(id = "p1").copy(scenes = scenes), onImageTap = {}, onOpenPost = {})
            }
        }
    }

    private fun sceneOf(id: String): Rect {
        compose.waitForIdle()
        return requireNotNull(laid[id])
    }

    private fun tile(label: String): Rect = compose.onNodeWithContentDescription(label).fetchSemanticsNode().boundsInRoot

    /** Où tombe, dans la racine, le point de la scène posé à [y] (fraction de sa hauteur). */
    private fun Rect.pointAt(y: Float) = top + height * y

    @Test
    fun `an object in the top of a scene stays visible in the big hero tile`() {
        show(scenes(MosaicLayoutMode.HERO, 3, listOf(SceneCardFraming(focus = haut, pageAspect = null))))

        val tuile = tile("Scene 1")
        val scene = sceneOf("p1#scene-0")
        assertThat(scene.height / scene.width).isWithin(0.01f).of(16f / 9f)
        assertThat(scene.pointAt(0.1f)).isAtLeast(tuile.top)
        assertThat(scene.width).isWithin(2f).of(tuile.width)
        assertThat(scene.bottom).isAtLeast(tuile.bottom - 2f)
    }

    @Test
    fun `without a focus the hero tile crops at the center, and cuts that same object`() {
        show(scenes(MosaicLayoutMode.HERO, 3, emptyList()))

        val tuile = tile("Scene 1")
        val scene = sceneOf("p1#scene-0")
        assertThat(scene.height / scene.width).isWithin(0.01f).of(16f / 9f)
        assertThat(scene.pointAt(0.1f)).isLessThan(tuile.top)
    }

    @Test
    fun `a carousel page takes the shape of its focus, and lays the scene at its own width`() {
        val bande = SceneRect(0.0, 0.3, 1.0, 0.7)
        val rapport = SceneShape.ASPECT / bande.height
        show(scenes(MosaicLayoutMode.CAROUSEL, 1, listOf(SceneCardFraming(focus = bande, pageAspect = rapport))))

        val page = tile("Scene 1")
        val scene = sceneOf("p1#scene-0")
        assertThat(page.width / page.height).isWithin(0.02f).of(rapport.toFloat())
        assertThat(scene.width).isWithin(2f).of(page.width)
        assertThat(scene.pointAt(0.3f)).isWithin(2f).of(page.top)
        assertThat(scene.pointAt(0.7f)).isWithin(2f).of(page.bottom)
    }

    @Test
    fun `a whole 9 by 16 scene in the feed is fitted under the height cap, never cropped`() {
        show(scenes(MosaicLayoutMode.CAROUSEL, 1, listOf(SceneCardFraming(focus = null, pageAspect = SceneShape.ASPECT))))

        val page = tile("Scene 1")
        val scene = sceneOf("p1#scene-0")
        assertThat(page.height / page.width).isWithin(0.02f).of(1.4f)
        assertThat(scene.height).isWithin(2f).of(page.height)
        assertThat(scene.width / scene.height).isWithin(0.01f).of(SceneShape.ASPECT.toFloat())
    }
}
