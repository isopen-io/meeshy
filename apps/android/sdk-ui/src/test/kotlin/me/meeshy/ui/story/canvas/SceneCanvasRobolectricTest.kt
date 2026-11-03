package me.meeshy.ui.story.canvas

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.SceneLists
import me.meeshy.sdk.model.scene.SceneReaderLanguages
import me.meeshy.sdk.model.scene.SceneRenderMode
import me.meeshy.sdk.model.scene.SceneRenderPlanner
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneCanvasRobolectricTest {
    @get:Rule
    val compose = createComposeRule()

    private fun plan(lists: SceneLists, time: Double = 0.0) =
        SceneRenderPlanner.plan(lists, time, SceneRenderMode.PLAY, SceneReaderLanguages.NONE)

    @Test
    fun `un sticker emoji, un texte et un lieu sont peints`() {
        val lists = SceneLists(
            texts = listOf(StoryTextObject(id = "t", text = "Salut")),
            stickers = listOf(StorySticker(id = "s", emoji = "🔥")),
            places = listOf(StoryLocationObject(id = "p", place = SharedPlace(1.0, 2.0, name = "Paris"))),
        )
        compose.setContent { SceneCanvas(items = plan(lists)) }
        compose.onAllNodesWithTag(SCENE_STICKER_TAG).assertCountEquals(1)
        compose.onAllNodesWithTag(SCENE_TEXT_TAG).assertCountEquals(1)
        compose.onAllNodesWithTag(SCENE_LOCATION_TAG).assertCountEquals(1)
    }

    @Test
    fun `un sticker hors de sa fenetre n est pas peint`() {
        val lists = SceneLists(stickers = listOf(StorySticker(id = "s", emoji = "🔥", startTime = 2.0, duration = 1.0)))
        compose.setContent { SceneCanvas(items = plan(lists, time = 0.0)) }
        compose.onAllNodesWithTag(SCENE_STICKER_TAG).assertCountEquals(0)
    }

    @Test
    fun `deux noeuds de meme signature sont egaux et un changement de pose les distingue`() {
        val lists = SceneLists(stickers = listOf(StorySticker(id = "s", emoji = "🔥", x = 0.2)))
        val a = SceneNode(plan(lists).single())
        val b = SceneNode(plan(lists).single())
        val moved = SceneNode(plan(SceneLists(stickers = listOf(StorySticker(id = "s", emoji = "🔥", x = 0.8)))).single())
        assertThat(a).isEqualTo(b)
        assertThat(a).isNotEqualTo(moved)
    }
}
