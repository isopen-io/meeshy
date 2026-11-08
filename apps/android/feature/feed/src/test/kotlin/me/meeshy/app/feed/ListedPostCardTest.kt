package me.meeshy.app.feed

import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13244 — dans les favoris, « À proximité », les publications d'un auteur et un hashtag, la carte d'un post ET celle d'un
 * réel portent la rangée du fil, et chaque bouton touché atteint le modèle de la liste : rien n'y est sans effet.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ListedPostCardTest {

    @get:Rule
    val compose = createComposeRule()

    private val recorder = RecordingCardActions()
    private val sheets = ListedPostSheets()
    private val shared = mutableListOf<String>()

    private val post = feedPostPresentation(id = "p1")
    private val reel = feedPostPresentation(id = "r1").copy(isReel = true, reelCover = ReelCover.Backdrop(isVideo = false))

    private fun show(card: FeedPostPresentation) {
        compose.setContent {
            val share = recordingShare(shared)
            MeeshyTheme {
                ListedPostCard(
                    post = card,
                    actions = recorder,
                    sheets = sheets,
                    share = share,
                    onOpenPost = { recorder.calls += "open-post:$it" },
                    onOpenReel = { recorder.calls += "open-reel:$it" },
                    onOpenProfile = null,
                    onOpenHashtag = {},
                )
            }
        }
        compose.waitForIdle()
    }

    private fun choice(label: String) =
        compose.onNode(hasText(label) and hasClickAction() and hasAnyAncestor(hasTestTag(REPOST_CHOICE_DIALOG_TAG)))

    @Test fun `le coeur d un post aime le post`() = touching(post, "Like", "like:p1")
    @Test fun `le coeur d un reel aime le reel`() = touching(reel, "Like", "like:r1")
    @Test fun `enregistrer un post l enregistre`() = touching(post, "Bookmark", "bookmark:p1")
    @Test fun `enregistrer un reel l enregistre`() = touching(reel, "Bookmark", "bookmark:r1")

    @Test
    fun `la bulle d un post ouvre ses commentaires sur place`() {
        show(post)
        compose.onNodeWithContentDescription("Comments").performClick()
        assertThat(sheets.commentsOf).isEqualTo("p1")
    }

    @Test
    fun `la bulle d un reel ouvre ses commentaires sur place`() {
        show(reel)
        compose.onNodeWithContentDescription("Comments").performClick()
        assertThat(sheets.commentsOf).isEqualTo("r1")
    }

    @Test
    fun `Repartager republie depuis la carte d un reel`() {
        show(reel)
        compose.onNodeWithContentDescription("Reposts").performClick()
        choice("Repost").performClick()
        assertThat(recorder.calls).containsExactly("repost:r1")
    }

    @Test
    fun `Citer ouvre la citation depuis la carte d un post`() {
        show(post)
        compose.onNodeWithContentDescription("Reposts").performClick()
        choice("Quote").performClick()
        assertThat(recorder.calls).containsExactly("quote:p1")
    }

    @Test
    fun `Envoyer partage la carte`() {
        show(post)
        compose.onNodeWithContentDescription("Send").performClick()
        assertThat(shared).isNotEmpty()
    }

    @Test
    fun `le menu d un post d autrui partage, copie le lien et signale`() {
        show(post)
        compose.onNodeWithContentDescription("Post options").performClick()
        compose.onNodeWithText("Copy link").performClick()
        assertThat(shared).containsExactly("link:p1", "copied").inOrder()

        compose.onNodeWithContentDescription("Post options").performClick()
        compose.onNodeWithText("Report").performClick()
        assertThat(sheets.reporting).isEqualTo("p1")
    }

    @Test
    fun `le menu de son propre post epingle et supprime`() {
        show(post.copy(isAuthor = true))
        compose.onNodeWithContentDescription("Post options").performClick()
        compose.onNodeWithText("Pin").performClick()
        assertThat(recorder.calls).containsExactly("pin:p1")

        compose.onNodeWithContentDescription("Post options").performClick()
        compose.onNodeWithText("Delete").performClick()
        assertThat(sheets.deleting).isEqualTo("p1")
    }

    private fun touching(card: FeedPostPresentation, label: String, expected: String) {
        show(card)
        compose.onNodeWithContentDescription(label).performClick()
        assertThat(recorder.calls).containsExactly(expected)
    }
}
