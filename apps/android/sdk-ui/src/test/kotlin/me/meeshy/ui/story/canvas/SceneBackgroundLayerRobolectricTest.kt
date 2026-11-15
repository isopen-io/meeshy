package me.meeshy.ui.story.canvas

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.media.ThumbHash
import me.meeshy.sdk.model.scene.SceneBackgroundFit
import me.meeshy.sdk.model.scene.SceneBackgroundKind
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneBackgroundLayerRobolectricTest {
    @get:Rule
    val compose = createComposeRule()

    private val hash: String = java.util.Base64.getEncoder()
        .encodeToString(ThumbHash.encode(2, 2, ByteArray(16) { 128.toByte() }))
    private val floor = Brush.verticalGradient(listOf(Color.Black, Color.DarkGray))
    private val image = SceneBackgroundMedia.Image("file:///absent/fond.jpg")

    private fun count(tag: String) = compose.onAllNodesWithTag(tag).fetchSemanticsNodes().size

    @Test
    fun `un fond ajuste pose la bande flouee du ThumbHash sous l image`() {
        compose.setContent { SceneBackgroundLayer(image, floor, fit = SceneBackgroundFit.FIT, thumbHashes = listOf(hash)) }
        compose.waitForIdle()
        assertThat(count(SCENE_LETTERBOX_TAG)).isEqualTo(1)
        assertThat(count(SCENE_BACKGROUND_IMAGE_TAG)).isEqualTo(1)
    }

    @Test
    fun `un fond rempli ne peint aucune bande`() {
        compose.setContent { SceneBackgroundLayer(image, floor, fit = SceneBackgroundFit.FILL, thumbHashes = listOf(hash)) }
        compose.waitForIdle()
        compose.onAllNodesWithTag(SCENE_LETTERBOX_TAG).assertCountEquals(0)
    }

    @Test
    fun `une teinte choisie peint la bande sans aucune matiere`() {
        compose.setContent { SceneBackgroundLayer(image, floor, fit = SceneBackgroundFit.FIT, backdrop = StoryBackdrop.INDIGO) }
        compose.waitForIdle()
        assertThat(count(SCENE_LETTERBOX_TAG)).isEqualTo(1)
    }

    @Test
    fun `la bande disparait quand l hote ne presente que le rectangle de l image`() {
        compose.setContent {
            SceneBackgroundLayer(image, floor, fit = SceneBackgroundFit.FIT, thumbHashes = listOf(hash), letterboxSuppressed = true)
        }
        compose.waitForIdle()
        compose.onAllNodesWithTag(SCENE_LETTERBOX_TAG).assertCountEquals(0)
    }

    @Test
    fun `le fichier local du composer prime sur l adresse distante`() {
        val media = SceneBackgroundMedia.Image(url = "https://cdn.meeshy.me/a.jpg", localUrl = "file:///composer/a.jpg")
        assertThat(media.resolvedUrl()).isEqualTo("file:///composer/a.jpg")
        assertThat(media.kind()).isEqualTo(SceneBackgroundKind.Image("file:///composer/a.jpg"))
        assertThat(SceneBackgroundMedia.Image("https://cdn.meeshy.me/a.jpg", localUrl = "https://x/y").resolvedUrl())
            .isEqualTo("https://cdn.meeshy.me/a.jpg")
    }
}
