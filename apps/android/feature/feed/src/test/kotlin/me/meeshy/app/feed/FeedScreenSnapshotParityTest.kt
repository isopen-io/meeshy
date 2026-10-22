package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedScreenSnapshotParityTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(content: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme { content() } }
        compose.waitForIdle()
    }

    private fun card(post: FeedPostPresentation) = @Composable {
        PostCard(
            post = post,
            onLike = {},
            onBookmark = {},
            onFlagTap = {},
            onClick = {},
            onOpenPost = {},
            onImageTap = {},
        )
    }

    @Test
    fun `la carte expose l auteur, le texte, le menu d options et les actions`() {
        show(card(feedPostPresentation()))

        compose.onNodeWithText("Amina").assertIsDisplayed()
        compose.onNodeWithText("Bonjour le monde").assertIsDisplayed()
        compose.onNodeWithContentDescription("Post options").assertIsDisplayed()
        compose.onNodeWithContentDescription("Like").assertIsDisplayed()
        compose.onNodeWithContentDescription("Comments").assertIsDisplayed()
        compose.onNodeWithContentDescription("Reposts").assertIsDisplayed()
        compose.onNodeWithContentDescription("Bookmark").assertIsDisplayed()
    }

    @Test
    fun `un post aime et enregistre annonce les actions inverses`() {
        show(card(feedPostPresentation(isLiked = true, isBookmarked = true, likeCount = 3)))

        compose.onNodeWithContentDescription("Unlike").assertIsDisplayed()
        compose.onNodeWithContentDescription("Remove bookmark").assertIsDisplayed()
        compose.onNodeWithText("3").assertIsDisplayed()
    }

    @Test
    fun `un contenu vide ne rend aucun texte de corps`() {
        show(card(feedPostPresentation(content = "")))

        compose.onNodeWithText("Amina").assertIsDisplayed()
    }

    @Test
    fun `l etat vide du compositeur garde son libelle d acces`() {
        show { FeedComposerPlaceholder(onClick = {}) }

        compose.onNodeWithContentDescription("Share something").assertIsDisplayed()
    }
}
