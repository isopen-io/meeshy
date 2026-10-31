package me.meeshy.app.feed

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13922, recette S8 rejouée par l'écran : la section des commentaires du détail, sous l'atelier que l'application
 * fournit, offre « Imager » dans le menu ⋯ d'un commentaire racine public à emoji, et l'ouvre sur sa carte.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostCommentsSectionImagingComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private fun text(id: Int): String = ApplicationProvider.getApplicationContext<android.content.Context>().getString(id)

    @Test
    fun `the menu of a public root comment offers Imager and opens its card`() {
        val opened = mutableListOf<Pair<String, PostCommentCardSubject>>()
        val exporter: CommentCardExporter = { key, card, _ -> opened += key to card }
        val vm = RecetteCommentThread.loadedViewModel()
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalCommentCardExporter provides exporter) {
                    PostCommentsSection(viewModel = vm, support = RecetteCommentThread.support)
                }
            }
        }
        compose.waitForIdle()

        compose.onAllNodesWithContentDescription(text(R.string.post_comments_more_options))[0].performClick()
        compose.onNodeWithText(text(R.string.feed_comment_imagine)).performClick()
        compose.waitForIdle()

        assertThat(opened.map { it.first }).contains("c-grace")
        assertThat(opened.last().second.reply.text).isEqualTo(RecetteCommentThread.GRACE_TEXT)
    }
}
