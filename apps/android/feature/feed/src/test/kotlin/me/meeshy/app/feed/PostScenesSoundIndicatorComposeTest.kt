package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14201 — comme iOS `PostSceneMosaic` et `PostSceneSoundHeader` : une page du fil qui joue une scène sonore dit que son son est
 * coupé, une tuile de scène animée porte le glyphe de lecture et se dit « vidéo », une scène muette et fixe ne porte rien ; la
 * barre de son de la fiche nomme le son qu'elle fait entendre.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostScenesSoundIndicatorComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val card: ReelSceneRenderer = { _, _, _, _, modifier -> Box(modifier) }

    private fun scenes(
        layout: MosaicLayoutMode,
        moving: List<Boolean>,
        offersSound: Boolean = false,
        soundCredit: SceneSoundCredit = SceneSoundCredit.None,
    ) = FeedPostScenes(
        items = moving.indices.map { StoryItem(id = "p1#scene-$it") },
        layout = layout,
        accentHex = "6366F1",
        offersSound = offersSound,
        moving = moving,
        soundCredit = soundCredit,
    )

    private fun showFeed(scenes: FeedPostScenes, live: Boolean) {
        compose.setContent {
            CompositionLocalProvider(LocalPostSceneCardRenderer provides card) { PostScenesView(scenes = scenes, live = live) }
        }
    }

    private fun showDetail(scenes: FeedPostScenes) {
        compose.setContent {
            CompositionLocalProvider(LocalPostSceneCardRenderer provides card) { PostDetailScenes(scenes) }
        }
    }

    @Test
    fun `a feed page playing a scene with sound says its sound is off`() {
        showFeed(scenes(MosaicLayoutMode.CAROUSEL, listOf(true), offersSound = true), live = true)

        compose.onNodeWithContentDescription("Sound off — open full screen to hear it", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `a silent feed page carries no sound indicator, and a playing page no play glyph`() {
        showFeed(scenes(MosaicLayoutMode.CAROUSEL, listOf(true), offersSound = false), live = true)
        compose.onNodeWithContentDescription("Sound off — open full screen to hear it", useUnmergedTree = true).assertDoesNotExist()
        compose.onAllNodesWithTag(SCENE_PLAY_GLYPH_TAG, useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun `a feed page at rest with sound shows the play glyph, never the sound indicator`() {
        showFeed(scenes(MosaicLayoutMode.CAROUSEL, listOf(true), offersSound = true), live = false)

        compose.onNodeWithContentDescription("Sound off — open full screen to hear it", useUnmergedTree = true).assertDoesNotExist()
        compose.onAllNodesWithTag(SCENE_PLAY_GLYPH_TAG, useUnmergedTree = true).assertCountEquals(1)
    }

    @Test
    fun `a mosaic tile of a moving scene carries the play glyph and says it is a video, a still tile does not`() {
        showFeed(scenes(MosaicLayoutMode.WAVE, listOf(true, false)), live = true)

        compose.onAllNodesWithTag(SCENE_PLAY_GLYPH_TAG, useUnmergedTree = true).assertCountEquals(1)
        compose.onNodeWithContentDescription("Scene 1, video").assertExists()
        compose.onNodeWithContentDescription("Scene 2").assertExists()
    }

    @Test
    fun `the post detail sound bar names the library sound it plays`() {
        showDetail(
            scenes(
                MosaicLayoutMode.CAROUSEL,
                listOf(true),
                offersSound = true,
                soundCredit = SceneSoundCredit.Library(title = "Nuits d'été", author = "belva", duration = "0:15"),
            ),
        )

        compose.onNodeWithText("Nuits d'été · @belva", useUnmergedTree = true).assertExists()
        compose.onNodeWithContentDescription("Background sound · Nuits d'été · @belva · 0:15").assertExists()
    }

    @Test
    fun `the post detail sound bar shows the waveform of an original sound, and names it as the background sound`() {
        showDetail(scenes(MosaicLayoutMode.CAROUSEL, listOf(true), offersSound = true, soundCredit = SceneSoundCredit.Original))

        compose.onNodeWithContentDescription("Background sound").assertExists()
    }

    @Test
    fun `a sound bar with nothing to credit keeps its controls and names nothing`() {
        showDetail(scenes(MosaicLayoutMode.CAROUSEL, listOf(false), offersSound = true))

        compose.onNodeWithContentDescription("Background sound").assertDoesNotExist()
        compose.onNodeWithContentDescription("Mute the sound").assertExists()
    }
}
