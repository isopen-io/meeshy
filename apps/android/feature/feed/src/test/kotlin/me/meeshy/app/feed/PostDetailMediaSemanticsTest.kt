package me.meeshy.app.feed

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostDetailMediaSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val owner = DetailMediaAuthor(id = "p1", name = "Amina", avatarUrl = null, createdAtIso = null, originalLanguage = "fr", userId = "u1")

    private fun show(media: List<FeedMediaItem>, opened: MutableList<Int> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme {
                PostDetailMedia(media = media, owner = owner, accentHex = null, onOpenVisual = { opened += it })
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `une cellule image de la grille est nommee Image partagee`() {
        show(listOf(feedMediaItem(id = "a"), feedMediaItem(id = "b", type = FeedMediaType.VIDEO)))

        compose.onNodeWithContentDescription("Shared video").assertIsDisplayed()
        compose.onNodeWithContentDescription("Shared image").assertIsDisplayed()
    }

    @Test
    fun `la quatrieme cellule d'un post de six visuels dit Voir les 6 medias et ouvre sur elle`() {
        val opened = mutableListOf<Int>()
        show((1..6).map { feedMediaItem(id = "m$it") }, opened)

        compose.onNodeWithContentDescription("View all 6 media").performClick()

        assertThat(opened).containsExactly(3)
    }

    @Test
    fun `un document garde son nom lisible`() {
        show(
            listOf(
                feedMediaItem(id = "i1"),
                feedMediaItem(id = "d", type = FeedMediaType.DOCUMENT, fileName = "Rapport.pdf"),
            ),
        )

        compose.onNodeWithContentDescription("Rapport.pdf", substring = true).assertIsDisplayed()
    }
}
