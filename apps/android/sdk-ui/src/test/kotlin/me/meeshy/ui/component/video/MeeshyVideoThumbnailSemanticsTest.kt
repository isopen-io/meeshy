package me.meeshy.ui.component.video

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.onNodeWithContentDescription
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyVideoThumbnailSemanticsTest {
    @get:Rule val compose = createComposeRule()

    private fun show(
        durationMillis: Long? = 65_000,
        showPlay: Boolean = true,
        showDuration: Boolean = true,
        onClick: (() -> Unit)? = {},
    ) {
        compose.setContent {
            MeeshyTheme {
                MeeshyVideoThumbnail(
                    thumbnailUrl = null, extractedFrame = null, thumbHash = null,
                    placeholderColor = Color.Gray, accent = Color.Blue, durationMillis = durationMillis,
                    showPlayBadge = showPlay, showDurationBadge = showDuration, onClick = onClick,
                )
            }
        }
        compose.waitForIdle()
    }

    @Test fun `les deux badges s'affichent et la duree est au format m ss`() {
        show()
        compose.onNodeWithTag(VideoPlayBadgeTestTag, useUnmergedTree = true).assertExists()
        compose.onNodeWithTag(VideoDurationBadgeTestTag, useUnmergedTree = true).assertTextEquals("1:05")
    }

    @Test fun `les badges sont optionnels`() {
        show(showPlay = false, showDuration = false)
        compose.onAllNodesWithTag(VideoPlayBadgeTestTag, useUnmergedTree = true).assertCountEquals(0)
        compose.onAllNodesWithTag(VideoDurationBadgeTestTag, useUnmergedTree = true).assertCountEquals(0)
    }

    @Test fun `sans duree connue aucun badge de duree`() {
        show(durationMillis = null)
        compose.onAllNodesWithTag(VideoDurationBadgeTestTag, useUnmergedTree = true).assertCountEquals(0)
    }

    @Test fun `tappable porte le libelle Lire la video`() {
        show(onClick = {})
        compose.onNodeWithContentDescription("Play video").assertExists()
    }

    @Test fun `non tappable ne porte aucune action`() {
        show(onClick = null)
        compose.onAllNodes(hasClickAction()).assertCountEquals(0)
    }
}
