package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14456 — recette S8 : « Erreur lors du repost » s'affichait sous le composeur épinglé et la barre de navigation, à
 * moitié caché. Le message du détail se pose juste au-dessus du composeur, entier, quelle que soit la longueur du fil.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostDetailSnackbarPlacementTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the detail message sits above the pinned comment composer, never under it`() {
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
                    snackbarHost = { Box(Modifier.fillMaxWidth().height(48.dp).testTag("detail_snackbar")) },
                )
            }
        }

        val snackbar = compose.onNodeWithTag("detail_snackbar").getBoundsInRoot()
        val composer = compose.onNodeWithTag("comment_composer").getBoundsInRoot()
        assertThat(snackbar.bottom.value).isAtMost(composer.top.value)
        assertThat(snackbar.top.value).isAtLeast(0f)
    }
}
