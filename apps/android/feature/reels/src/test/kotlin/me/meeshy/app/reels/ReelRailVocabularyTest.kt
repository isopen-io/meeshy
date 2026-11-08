package me.meeshy.app.reels

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14615 — recette S8 (360 dp) : sous la bulle des commentaires, le rail des réels lisait « ommentaire ». iOS
 * (`ReelsPlayerView+ActionRail`) nomme ses actions d'un verbe court — « Commenter », « Repartager » — et le rail Android
 * reprend son vocabulaire, chaque légende lue en entier.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReelRailVocabularyTest {

    @get:Rule
    val compose = createComposeRule()

    private val reel = ReelPresentation(
        id = "r1", videoUrl = null, posterUrl = null, authorId = "a", authorName = "Ana", authorAvatarUrl = null, caption = null,
        likeCount = 0, isLiked = false, commentCount = 0, repostCount = 0, isBookmarked = false, bookmarkCount = 0,
    )

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize().padding(end = 24.dp), contentAlignment = Alignment.CenterEnd) {
                    ReelRail(reel = reel, quickEmojis = emptyList(), actions = ReelRailActions({}, { _, _ -> }, {}, {}, {}))
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the comment button says Commenter like iOS`() {
        show()
        compose.onNodeWithContentDescription("Commenter").assertExists()
    }

    @Test
    fun `the repost button says Repartager like iOS`() {
        show()
        compose.onNodeWithContentDescription("Repartager").assertExists()
    }

    @Test
    fun `no caption of the rail is cut by its cell at 360 dp`() {
        show()
        val captions = compose.onAllNodesWithTag(CAPTION_TAG, useUnmergedTree = true)
        val count = captions.fetchSemanticsNodes().size
        assertThat(count).isEqualTo(5)
        (0 until count).forEach { index ->
            val shown = captions[index].getBoundsInRoot()
            val full = captions[index].getUnclippedBoundsInRoot()
            assertWithMessage("légende n°$index rognée par sa cellule").that(shown.width).isEqualTo(full.width)
        }
    }

    private companion object {
        const val CAPTION_TAG = "fullscreen-floating-caption"
    }
}
