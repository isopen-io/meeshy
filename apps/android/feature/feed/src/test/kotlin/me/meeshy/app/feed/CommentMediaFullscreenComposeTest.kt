package me.meeshy.app.feed

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.export.StoryExportMode
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13915 — toucher le média d'un commentaire l'ouvre en plein écran (la visionneuse d'images ou la vidéo plein écran, qui se
 * ferment d'un glissement vers le bas), avec Enregistrer et Partager : une photo s'enregistre et se partage comme image,
 * une vidéo sort entière par le moteur des stories ; lancer un export referme la visionneuse, l'export se suivant hors
 * d'elle. « Imager » n'y figure pas : sur iOS il compose la carte du commentaire, depuis son menu (#13922).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class CommentMediaFullscreenComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val exported = mutableListOf<Pair<String, StoryExportMode>>()
    private val host: SceneItemExportHost = { _ -> { item, mode -> exported += item.id to mode } }

    private val media = listOf(
        CommentMediaPreview(id = "p", thumbnailUrl = "file:///p.jpg", isVideo = false, url = "file:///p.jpg"),
        CommentMediaPreview(id = "v", thumbnailUrl = null, isVideo = true, url = "file:///v.mp4", durationMillis = 8_000),
    )

    private fun show(exportHost: SceneItemExportHost? = host) {
        compose.setContent {
            CompositionLocalProvider(LocalSceneItemExportHost provides exportHost) {
                CommentMediaFullscreen { CommentMediaStrip(media) }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `touching a photo opens it full screen with save and share as an image, and no imager`() {
        show()

        compose.onNodeWithContentDescription("Comment image").performClick()
        compose.onNodeWithContentDescription("More").performClick()
        compose.onNodeWithText("Save").assertExists()
        compose.onNodeWithText("Share").assertExists()
        compose.onNodeWithText("Picture it").assertDoesNotExist()

        assertThat(exported).isEmpty()
    }

    @Test
    fun `touching a video opens the player whose save renders the whole video and closes it`() {
        show()

        compose.onNodeWithContentDescription("Video").performClick()
        compose.onNodeWithContentDescription("More").performClick()
        compose.onNodeWithText("Share").assertExists()
        compose.onNodeWithText("Picture it").assertDoesNotExist()
        compose.onNodeWithText("Save").performClick()
        compose.waitForIdle()

        assertThat(exported).containsExactly("comment-media-v" to StoryExportMode.SAVE)
        compose.onAllNodesWithContentDescription("Close").fetchSemanticsNodes().let { assertThat(it).isEmpty() }
    }

    @Test
    fun `without the export engine the photo keeps save and share, and the video has no menu`() {
        show(exportHost = null)

        compose.onNodeWithContentDescription("Comment image").performClick()
        compose.onNodeWithContentDescription("More").performClick()
        compose.onNodeWithText("Save").assertExists()
        compose.onAllNodesWithContentDescription("Close").onFirst().performClick()
        compose.waitForIdle()

        compose.onNodeWithContentDescription("Video").performClick()
        compose.onNodeWithContentDescription("More").assertDoesNotExist()
        assertThat(exported).isEmpty()
    }
}
