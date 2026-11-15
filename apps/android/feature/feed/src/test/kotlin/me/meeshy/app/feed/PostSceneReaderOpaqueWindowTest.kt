package me.meeshy.app.feed

import android.content.Context
import android.view.ViewGroup
import android.view.WindowManager
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDialog

/**
 * #14200 — recette S8 : dans le plein écran d'un post à scène, les boutons de l'écran du dessous transparaissaient en haut,
 * derrière ⋯ et ✕. La fenêtre du lecteur était une fenêtre de dialogue FLOTTANTE : bornée sous la barre d'état et voilée d'un
 * assombrissement, elle laissait voir l'écran du dessous là où elle ne s'étendait pas. Le plein écran couvre l'écran entier,
 * sous les barres système, et n'assombrit rien : il est opaque sur toute sa surface.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostSceneReaderOpaqueWindowTest {

    @get:Rule
    val compose = createComposeRule()

    private val card: ReelSceneRenderer = { _, _, _, _, modifier -> Box(modifier) }
    private val reader: PostSceneReaderRenderer = { _, _, _, modifier -> Box(modifier) }

    private fun openTheReader(): WindowManager.LayoutParams {
        val scenes = FeedPostScenes(
            items = listOf(StoryItem(id = "p1#scene-0"), StoryItem(id = "p1#scene-1")),
            layout = MosaicLayoutMode.WAVE,
            accentHex = "6366F1",
            captions = listOf(null, null),
            carrierText = null,
        )
        compose.setContent {
            CompositionLocalProvider(LocalPostSceneCardRenderer provides card, LocalPostSceneReaderRenderer provides reader) {
                FeedPostCardMediaSlot(post = feedPostPresentation(id = "p1").copy(scenes = scenes), onImageTap = {}, onOpenPost = {})
            }
        }
        compose.onNodeWithContentDescription("Scene 1").performClick()
        compose.waitForIdle()
        return requireNotNull(ShadowDialog.getLatestDialog()?.window).attributes
    }

    @Test
    fun `the full screen reader spans the whole screen, under the system bars`() {
        val window = openTheReader()

        val screen = ApplicationProvider.getApplicationContext<Context>().resources.displayMetrics
        assertThat(window.width == ViewGroup.LayoutParams.MATCH_PARENT || window.width >= screen.widthPixels).isTrue()
        assertThat(window.height == ViewGroup.LayoutParams.MATCH_PARENT || window.height >= screen.heightPixels).isTrue()
        assertThat(window.flags and WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS).isNotEqualTo(0)
    }

    @Test
    fun `the full screen reader lets nothing of the screen below show through`() {
        val window = openTheReader()

        assertThat(window.flags and WindowManager.LayoutParams.FLAG_DIM_BEHIND == 0 || window.dimAmount == 0f).isTrue()
    }
}
