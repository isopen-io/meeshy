package me.meeshy.ui.story.canvas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.scene.SceneLists
import me.meeshy.sdk.model.scene.SceneReaderLanguages
import me.meeshy.sdk.model.scene.SceneRenderMode
import me.meeshy.sdk.model.scene.SceneRenderPlanner
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneLocationLayerRobolectricTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(place: StoryLocationObject, time: Double = 0.0) {
        val items = SceneRenderPlanner.plan(SceneLists(places = listOf(place)), time, SceneRenderMode.PLAY, SceneReaderLanguages.NONE)
        compose.setContent { MeeshyTheme { Box(Modifier.size(360.dp, 640.dp)) { SceneCanvas(items = items) } } }
    }

    @Test
    fun `la capsule porte Lieu suivi du nom servi`() {
        show(StoryLocationObject(id = "p", place = SharedPlace(1.0, 2.0, name = "Paris")))
        compose.onNodeWithContentDescription("Place: Paris").assertIsDisplayed()
    }

    @Test
    fun `un lieu sans nom ni adresse retombe sur le repli Ici`() {
        show(StoryLocationObject(id = "p", place = SharedPlace(1.0, 2.0)))
        compose.onNodeWithContentDescription("Place: Here").assertIsDisplayed()
    }

    @Test
    fun `un style inconnu ou d une autre famille retombe sur la capsule native`() {
        show(StoryLocationObject(id = "p", place = SharedPlace(1.0, 2.0, name = "Paris"), styleId = "time.digital"))
        compose.onNodeWithTag(SCENE_LOCATION_TAG).assertIsDisplayed()
    }

    @Test
    fun `la pastille suit sa fenetre de temps`() {
        val place = StoryLocationObject(id = "p", place = SharedPlace(1.0, 2.0, name = "Paris"), startTime = 2.0, duration = 1.0)
        show(place, time = 0.0)
        compose.onAllNodesWithTag(SCENE_LOCATION_TAG).assertCountEquals(0)
    }
}
