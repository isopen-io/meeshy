package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14285 — recette S8 : le composeur des commentaires défilait avec le fil, sous le dernier commentaire. Comme iOS, il
 * reste épinglé en bas du détail, au-dessus du clavier, quelle que soit la longueur du fil.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostDetailPinnedComposerTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the comment composer stays on screen under a thread far taller than the screen`() {
        compose.setContent {
            MeeshyTheme {
                PostDetailContent(
                    post = feedPostPresentation(id = "p1"), isReposted = false, secondaryTranslation = null,
                    detailLanguageStrip = emptyList(), translatingCodes = emptySet(), onFlagTap = {}, onSelectLanguage = {},
                    onOpenPost = {}, onOpenReel = {}, onOpenProfile = null, onOpenHashtag = {}, onOpenViewers = null,
                    onRepost = {}, onQuote = {}, onLike = {}, quickEmojis = emptyList(), onReact = {}, onBookmark = {},
                    onCommentNotice = {},
                    commentsSection = { Box(Modifier.fillMaxWidth().height(6000.dp)) },
                    commentComposer = { Box(Modifier.fillMaxWidth().height(56.dp).testTag("comment_composer")) },
                )
            }
        }

        compose.onNodeWithTag("comment_composer").assertIsDisplayed()
    }
}
