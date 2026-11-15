package me.meeshy.ui.component.chrome

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.assertIsDisplayed
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.PostViewerEngagement
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationEngagementPillSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun snap(total: Int, streak: Int, today: Int = 10) =
        ConversationEngagementSnapshot("c1", total, today, streak, "2026-10-27")

    private fun show(content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent { MeeshyTheme { content() } }
        compose.waitForIdle()
    }

    @Test
    fun `une serie qui court est lue en une phrase pluriel`() {
        show { ConversationEngagementPill(snap(total = 120, streak = 3)) }
        compose.onNodeWithContentDescription("3 days · Sparks: 120 · Today: 10").assertIsDisplayed()
    }

    @Test
    fun `une serie d'un jour est au singulier`() {
        show { ConversationEngagementPill(snap(total = 120, streak = 1)) }
        compose.onNodeWithContentDescription("1 day · Sparks: 120 · Today: 10").assertIsDisplayed()
    }

    @Test
    fun `sans serie le cumul seul est lu, au singulier a un point`() {
        show { ConversationEngagementPill(snap(total = 1, streak = 0)) }
        compose.onNodeWithContentDescription("1 spark earned in this conversation").assertIsDisplayed()
    }

    @Test
    fun `un cumul nul ou aucun instantane ne rend rien`() {
        show {
            ConversationEngagementPill(snap(total = 0, streak = 0))
            ConversationStreakMark(null)
        }
        compose.onAllNodesWithContentDescription("0 sparks earned in this conversation").assertCountEquals(0)
    }

    @Test
    fun `la marque de ligne porte la meme phrase que la pastille`() {
        show { ConversationStreakMark(snap(total = 120, streak = 3)) }
        compose.onNodeWithContentDescription("3 days · Sparks: 120 · Today: 10").assertIsDisplayed()
    }

    @Test
    fun `la marque de points d'un post se tait a zero et lit sa phrase sinon`() {
        show {
            PostPointsMark(viewerPoints = 0, color = Color.Gray)
            PostPointsMark(viewerPoints = 99, color = Color.Gray)
        }
        compose.onNodeWithContentDescription("This post earned you 99 sparks").assertIsDisplayed()
    }

    @Test
    fun `la rangee des marques d'un lecteur est decorative et vide sans marque`() {
        show { ViewerEngagementStrip(PostViewerEngagement()) }
        compose.onAllNodesWithContentDescription("0 comments").assertCountEquals(0)
    }
}
