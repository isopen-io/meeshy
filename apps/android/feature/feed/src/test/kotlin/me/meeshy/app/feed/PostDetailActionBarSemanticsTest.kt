package me.meeshy.app.feed

import android.content.Context
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La barre d'actions du detail : zone tactile de 48 dp, palette atteignable au lecteur d'ecran, republier en dialogue. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostDetailActionBarSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private fun text(id: Int) = context.getString(id)

    private var reposted = 0
    private var quoted = 0

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                DetailStatsRow(
                    post = feedPostPresentation(id = "p1"),
                    isReposted = false,
                    onRepost = { reposted++ },
                    onQuote = { quoted++ },
                    onLike = {},
                    quickEmojis = emptyList(),
                    onReact = {},
                    onBookmark = {},
                )
            }
        }
    }

    @Test
    fun `every actionable stat has a 48 dp touch area`() {
        show()

        listOf(R.string.feed_like, R.string.feed_reposts, R.string.feed_bookmark).forEach { label ->
            val bounds = compose.onNodeWithContentDescription(text(label)).assertHasClickAction().getBoundsInRoot()
            assertThat(bounds.width).isAtLeast(48.dp)
            assertThat(bounds.height).isAtLeast(48.dp)
        }
    }

    @Test
    fun `the heart offers the more-reactions action to a screen reader`() {
        show()

        compose.onNodeWithContentDescription(text(R.string.feed_like))
            .assert(SemanticsMatcher.keyIsDefined(SemanticsActions.CustomActions))
    }

    @Test
    fun `reposting asks to repost or quote in a dialog`() {
        show()

        compose.onNodeWithContentDescription(text(R.string.feed_reposts)).performClick()
        compose.onNodeWithText(text(R.string.feed_action_quote)).performClick()

        assertThat(quoted).isEqualTo(1)
        assertThat(reposted).isEqualTo(0)
    }
}
