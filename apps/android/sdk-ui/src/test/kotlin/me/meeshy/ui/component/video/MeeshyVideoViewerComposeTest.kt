package me.meeshy.ui.component.video

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.viewer.ImageViewerExit
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13915 — la vidéo plein écran se ferme d'un glissement vers le bas, comme la visionneuse d'images, et porte le menu ⋯
 * des sorties que son hôte lui confie (Enregistrer, Partager).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class MeeshyVideoViewerComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private var closed = 0
    private val picked = mutableListOf<ImageViewerExit>()

    private fun show(exits: List<ImageViewerExit> = emptyList()) {
        compose.setContent {
            MeeshyVideoViewer(
                mediaUrl = "file:///sdcard/clip.mp4",
                onDismiss = { closed++ },
                exits = exits,
                onExit = { picked += it },
            )
        }
        compose.waitForIdle()
    }

    @Test
    fun `a swipe down closes the video`() {
        show()

        compose.onNodeWithTag(VIDEO_VIEWER_STAGE_TAG).performTouchInput {
            swipeDown(startY = top + 40f, endY = bottom - 40f, durationMillis = 300)
        }
        compose.waitForIdle()

        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `a short drag springs back and keeps the video open`() {
        show()

        compose.onNodeWithTag(VIDEO_VIEWER_STAGE_TAG).performTouchInput {
            swipeDown(startY = centerY, endY = centerY + 60f, durationMillis = 300)
        }
        compose.waitForIdle()

        assertThat(closed).isEqualTo(0)
    }

    @Test
    fun `the more menu offers the exits of its host and hands back the one touched`() {
        show(exits = listOf(ImageViewerExit.Save, ImageViewerExit.Share))

        compose.onNodeWithContentDescription("More").performClick()
        compose.onNodeWithText("Save").assertExists()
        compose.onNodeWithText("Share").performClick()
        compose.waitForIdle()

        assertThat(picked).containsExactly(ImageViewerExit.Share)
    }

    @Test
    fun `without exits the video has no more menu`() {
        show()

        compose.onNodeWithContentDescription("More").assertDoesNotExist()
    }
}
