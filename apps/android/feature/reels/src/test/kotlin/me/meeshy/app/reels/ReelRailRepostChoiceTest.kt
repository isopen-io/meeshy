package me.meeshy.app.reels

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.feed.REPOST_CHOICE_DIALOG_TAG
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #12234 — le Repost du rail du lecteur de réels ne republie plus au premier toucher : il offre le même choix
 * « Repartager / Citer » que la carte du fil (iOS `ReelsPlayerView+ActionRail`, #15869), « Citer » n'existant que si
 * le lecteur sait ouvrir le compositeur de citation.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class ReelRailRepostChoiceTest {

    @get:Rule
    val compose = createComposeRule()

    private val reel = ReelPresentation(
        id = "r1", videoUrl = null, posterUrl = null, authorId = "a", authorName = "Ana", authorAvatarUrl = null, caption = null,
        likeCount = 0, isLiked = false, commentCount = 0, repostCount = 0, isBookmarked = false, bookmarkCount = 0,
    )

    private val reposted = mutableListOf<String>()
    private val quoted = mutableListOf<String>()

    private fun show(canQuote: Boolean = true) {
        val actions = ReelRailActions(
            onLike = {}, onReact = { _, _ -> }, onComments = {}, onBookmark = {},
            onRepost = { reposted += it },
            onQuote = if (canQuote) { id: String -> quoted += id } else null,
        )
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
                    ReelRail(reel = reel, quickEmojis = emptyList(), actions = actions)
                }
            }
        }
        compose.waitForIdle()
    }

    private fun choice(label: String) =
        compose.onNode(hasText(label) and hasClickAction() and hasAnyAncestor(hasTestTag(REPOST_CHOICE_DIALOG_TAG)))

    @Test
    fun `a touch on Repost offers the choice and reposts nothing yet`() {
        show()

        compose.onNodeWithContentDescription("Repartager").performClick()

        compose.onNodeWithTag(REPOST_CHOICE_DIALOG_TAG).assertExists()
        choice("Repartager").assertExists()
        choice("Citer").assertExists()
        choice("Annuler").assertExists()
        assertThat(reposted).isEmpty()
    }

    @Test
    fun `choosing Repartager reposts the reel`() {
        show()

        compose.onNodeWithContentDescription("Repartager").performClick()
        choice("Repartager").performClick()

        assertThat(reposted).containsExactly("r1")
        assertThat(quoted).isEmpty()
        compose.onNodeWithTag(REPOST_CHOICE_DIALOG_TAG).assertDoesNotExist()
    }

    @Test
    fun `choosing Citer opens the quote of the reel`() {
        show()

        compose.onNodeWithContentDescription("Repartager").performClick()
        choice("Citer").performClick()

        assertThat(quoted).containsExactly("r1")
        assertThat(reposted).isEmpty()
    }

    @Test
    fun `without a quote door the choice never offers Citer`() {
        show(canQuote = false)

        compose.onNodeWithContentDescription("Repartager").performClick()

        compose.onNodeWithTag(REPOST_CHOICE_DIALOG_TAG).assertExists()
        choice("Repartager").assertExists()
        choice("Citer").assertDoesNotExist()
    }
}
