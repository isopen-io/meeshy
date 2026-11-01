package me.meeshy.app.reels

import androidx.compose.ui.test.junit4.createComposeRule
import me.meeshy.sdk.model.PresenceState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'auteur d'un réel porte le point de présence vivant, comme iOS
 * (#13745). Rien servi, aucun point ; mon propre réel n'en a jamais.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelPresenceSurfacesTest {

    @get:Rule
    val compose = createComposeRule()

    private fun reel(authorId: String?) = ReelPresentation(
        id = "r1",
        videoUrl = null,
        posterUrl = null,
        authorId = authorId,
        authorName = "Ana",
        authorAvatarUrl = null,
        caption = null,
        likeCount = 0,
        isLiked = false,
        commentCount = 0,
        repostCount = 0,
        isBookmarked = false,
        bookmarkCount = 0,
    )

    @Test
    fun `l'auteur d'un reel a le point que la carte vivante sert`() {
        compose.showWithPresence(presenceStore(live = mapOf("u1" to PresenceState.ONLINE))) {
            ReelAuthorRow(reel("u1"), isOwn = false, onOpenAuthor = null)
        }

        compose.assertDot(PresenceState.ONLINE)
    }

    @Test
    fun `un auteur de reel dont rien n'est servi n'a aucun point`() {
        compose.showWithPresence(presenceStore()) { ReelAuthorRow(reel("u1"), isOwn = false, onOpenAuthor = null) }

        compose.assertNoDot()
    }

    @Test
    fun `mon propre reel n'a jamais de point`() {
        compose.showWithPresence(presenceStore(live = mapOf("me" to PresenceState.ONLINE))) {
            ReelAuthorRow(reel("me"), isOwn = true, onOpenAuthor = null)
        }

        compose.assertNoDot()
    }
}
