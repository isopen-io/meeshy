package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
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
 * #13893 — comme iOS `PostSceneMosaic` : chaque scène porte SA légende là où la place le permet (une page du carrousel, la
 * grande tuile d'un hero), jamais sur les petites tuiles ni sur le « +N » ; la fiche du post fait entendre ses scènes, coupables
 * et arrêtables par sa barre de son, quand le fil, lui, reste muet par construction.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostScenesCaptionAndSoundComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private data class Painted(val id: String, val live: Boolean, val muted: Boolean)

    private val painted = mutableListOf<Painted>()
    private val card: ReelSceneRenderer = { item, _, live, muted, modifier -> painted += Painted(item.id, live, muted); Box(modifier) }

    private fun scenes(layout: MosaicLayoutMode, captions: List<String?>, offersSound: Boolean = false) = FeedPostScenes(
        items = captions.indices.map { StoryItem(id = "p1#scene-$it") },
        layout = layout,
        accentHex = "6366F1",
        captions = captions,
        offersSound = offersSound,
    )

    private fun showCard(scenes: FeedPostScenes) {
        compose.setContent {
            CompositionLocalProvider(LocalReelSceneRenderer provides card) {
                FeedPostCardMediaSlot(post = feedPostPresentation(id = "p1").copy(scenes = scenes), onImageTap = {}, onOpenPost = {})
            }
        }
    }

    private fun showDetail(scenes: FeedPostScenes) {
        compose.setContent {
            CompositionLocalProvider(LocalReelSceneRenderer provides card) { PostDetailScenes(scenes) }
        }
    }

    @Test
    fun `a carousel page carries the caption of its own scene`() {
        showCard(scenes(MosaicLayoutMode.CAROUSEL, listOf("Le port au matin", "La plage")))

        compose.onNodeWithText("Le port au matin", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("La plage", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `a single scene carries its caption, and a scene without one paints no band`() {
        showCard(scenes(MosaicLayoutMode.CAROUSEL, listOf("Seule")))
        compose.onNodeWithText("Seule", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `a hero lays the caption on its big tile only, never on the small tiles nor on the +N`() {
        showCard(scenes(MosaicLayoutMode.HERO, listOf("Grande", "Petite 2", "Petite 3", "Petite 4", "Cachée 5", "Cachée 6")))

        compose.onNodeWithText("Grande", useUnmergedTree = true).assertExists()
        listOf("Petite 2", "Petite 3", "Petite 4", "Cachée 5", "Cachée 6").forEach {
            compose.onNodeWithText(it, useUnmergedTree = true).assertDoesNotExist()
        }
    }

    @Test
    fun `a continuous reel captions every tile it shows, and never the +N that hides the rest`() {
        showCard(scenes(MosaicLayoutMode.REEL, listOf("Défile 1", "Défile 2", "Défile 3", "Défile 4", "Cachée 5", "Cachée 6")))

        listOf("Défile 1", "Défile 2", "Défile 3").forEach { compose.onNodeWithText(it, useUnmergedTree = true).assertExists() }
        listOf("Défile 4", "Cachée 5", "Cachée 6").forEach { compose.onNodeWithText(it, useUnmergedTree = true).assertDoesNotExist() }
    }

    @Test
    fun `a wave tile is too narrow to carry a caption`() {
        showCard(scenes(MosaicLayoutMode.WAVE, listOf("Vague 1", "Vague 2")))

        listOf("Vague 1", "Vague 2").forEach { compose.onNodeWithText(it, useUnmergedTree = true).assertDoesNotExist() }
    }

    @Test
    fun `the feed card plays its scene muted, always, and offers no sound control`() {
        showCard(scenes(MosaicLayoutMode.CAROUSEL, listOf(null), offersSound = true))

        assertThat(painted).isNotEmpty()
        assertThat(painted.all { it.muted }).isTrue()
        compose.onNodeWithContentDescription("Mute the sound").assertDoesNotExist()
    }

    @Test
    fun `the post detail plays its scene with sound, and its sound bar mutes it`() {
        showDetail(scenes(MosaicLayoutMode.CAROUSEL, listOf(null), offersSound = true))
        assertThat(painted.last()).isEqualTo(Painted("p1#scene-0", live = true, muted = false))

        compose.onNodeWithContentDescription("Mute the sound").performClick()
        compose.waitForIdle()
        assertThat(painted.last()).isEqualTo(Painted("p1#scene-0", live = true, muted = true))

        compose.onNodeWithContentDescription("Turn the sound back on").performClick()
        compose.waitForIdle()
        assertThat(painted.last().muted).isFalse()
    }

    @Test
    fun `the post detail sound bar stops and resumes the whole scene`() {
        showDetail(scenes(MosaicLayoutMode.CAROUSEL, listOf(null), offersSound = true))

        compose.onNodeWithContentDescription("Stops the scene playback").performClick()
        compose.waitForIdle()
        assertThat(painted.last().live).isFalse()

        compose.onNodeWithContentDescription("Resumes the scene playback").performClick()
        compose.waitForIdle()
        assertThat(painted.last().live).isTrue()
    }

    @Test
    fun `a post detail whose scenes have nothing to hear shows no sound bar`() {
        showDetail(scenes(MosaicLayoutMode.CAROUSEL, listOf(null), offersSound = false))

        compose.onNodeWithContentDescription("Mute the sound").assertDoesNotExist()
        compose.onNodeWithContentDescription("Stops the scene playback").assertDoesNotExist()
    }
}
