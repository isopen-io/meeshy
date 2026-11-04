package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
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
 * Comme iOS `PostDetailView+Canvas` : le bouton muet n'existe que si un canvas est rendu et porte du son (même prédicat que le
 * rendu), le son est actif par défaut, la scène se met en pause hors écran, et sans canvas à rendre la fiche dit « indisponible ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostDetailSceneSectionTest {

    @get:Rule
    val compose = createComposeRule()

    private val lives = mutableListOf<Boolean>()
    private val mutes = mutableListOf<Boolean>()

    private val card: ReelSceneRenderer = { _, _, live, muted, modifier ->
        lives += live
        mutes += muted
        Box(modifier)
    }

    private fun scenes(offersSound: Boolean) = FeedPostScenes(
        items = listOf(StoryItem(id = "p1#scene-0")),
        layout = MosaicLayoutMode.CAROUSEL,
        accentHex = "6366F1",
        offersSound = offersSound,
        // Une scène qui offre du son est cinématique (SceneMotion.isCinematic : un son de fond compte) ; depuis
        // c0ad210b3f seule une scène qui BOUGE reçoit l'ordre de jouer.
        moving = listOf(offersSound),
        soundCredit = if (offersSound) SceneSoundCredit.Original else SceneSoundCredit.None,
    )

    @Test
    fun `a scene with sound plays unmuted by default and offers the mute control`() {
        compose.setContent {
            CompositionLocalProvider(LocalPostSceneCardRenderer provides card) { PostDetailSceneSection(scenes(offersSound = true)) }
        }

        compose.onNodeWithContentDescription("Mute the sound").assertExists()
        assertThat(mutes.last()).isFalse()
        assertThat(lives.last()).isTrue()
    }

    @Test
    fun `a silent scene shows no mute control`() {
        compose.setContent {
            CompositionLocalProvider(LocalPostSceneCardRenderer provides card) { PostDetailSceneSection(scenes(offersSound = false)) }
        }

        compose.onNodeWithContentDescription("Mute the sound").assertDoesNotExist()
        compose.onNodeWithContentDescription("Stops the scene playback").assertDoesNotExist()
    }

    @Test
    fun `no canvas to render gives the placeholder and no sound control`() {
        compose.setContent { PostDetailSceneSection(scenes(offersSound = true)) }

        compose.onNodeWithText("Story unavailable").assertExists()
        compose.onNodeWithContentDescription("Mute the sound").assertDoesNotExist()
    }

    @Test
    fun `the scene pauses once scrolled off screen and plays again when it comes back`() {
        val viewport = mutableStateOf(PostDetailViewport(top = 0f, bottom = 1600f, scrollOffset = 0f, composerFocused = false))
        compose.setContent {
            CompositionLocalProvider(LocalPostSceneCardRenderer provides card) {
                PostDetailSceneSection(scenes(offersSound = true), viewport = { viewport.value })
            }
        }
        compose.waitForIdle()
        assertThat(lives.last()).isTrue()

        viewport.value = PostDetailViewport(top = 5000f, bottom = 6600f, scrollOffset = 0f, composerFocused = false)
        compose.waitForIdle()
        assertThat(lives.last()).isFalse()

        viewport.value = PostDetailViewport(top = 0f, bottom = 1600f, scrollOffset = 0f, composerFocused = false)
        compose.waitForIdle()
        assertThat(lives.last()).isTrue()
    }

    @Test
    fun `stopping the playback from the header pauses the scene`() {
        compose.setContent {
            CompositionLocalProvider(LocalPostSceneCardRenderer provides card) { PostDetailSceneSection(scenes(offersSound = true)) }
        }

        compose.onNodeWithContentDescription("Stops the scene playback").performClick()
        compose.waitForIdle()

        assertThat(lives.last()).isFalse()
    }
}
