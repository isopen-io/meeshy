package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #14827 — le menu « ⋯ » d'une carte : ses entrées et leurs libellés selon l'auteur, et « Ouvrir » ouvre la carte. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedPostOptionsMenuSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private var opened = 0

    private fun card(isOwn: Boolean) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.width(360.dp)) {
                    PostCard(
                        post = feedPostPresentation(),
                        onLike = {}, onBookmark = {}, onFlagTap = {}, onClick = { opened++ },
                        onOpenPost = {}, onOpenReel = {}, onImageTap = {}, isOwn = isOwn,
                        onShare = {}, onPin = {}, onReport = {}, onDelete = {},
                    )
                }
            }
        }
        compose.onNodeWithContentDescription("Post options").performClick()
        compose.waitForIdle()
    }

    @Test
    fun `someone else's post lists open, share and report, never pin or delete`() {
        card(isOwn = false)

        listOf("Open", "Share", "Report").forEach { compose.onAllNodesWithText(it).assertCountEquals(1) }
        listOf("Pin", "Delete").forEach { compose.onAllNodesWithText(it).assertCountEquals(0) }
    }

    @Test
    fun `your own post lists pin and delete, never report`() {
        card(isOwn = true)

        listOf("Open", "Pin", "Delete").forEach { compose.onAllNodesWithText(it).assertCountEquals(1) }
        compose.onAllNodesWithText("Report").assertCountEquals(0)
    }

    @Test
    fun `open leads to the post`() {
        card(isOwn = false)

        compose.onNodeWithText("Open").performClick()

        assertThat(opened).isEqualTo(1)
    }
}
