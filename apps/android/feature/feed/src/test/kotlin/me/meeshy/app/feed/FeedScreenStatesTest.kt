package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertCountEquals
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedScreenStatesTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(content: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme { content() } }
        compose.waitForIdle()
    }

    @Test
    fun `l erreur est une carte avec son titre et Reessayer`() {
        var retries = 0
        show { FeedErrorCard(onRetry = { retries += 1 }, detail = "Timeout") }

        compose.onNodeWithText("Couldn't load the feed").assertIsDisplayed()
        compose.onNodeWithText("Timeout").assertIsDisplayed()
        compose.onNodeWithText("Try again").performClick()
        assertThat(retries).isEqualTo(1)
    }

    @Test
    fun `sans detail la carte d erreur ne montre que le titre`() {
        show { FeedErrorCard(onRetry = {}) }

        compose.onNodeWithText("Couldn't load the feed").assertIsDisplayed()
    }

    @Test
    fun `le fil vide est un etat illustre d'une seule ligne (epure 18090)`() {
        show { FeedEmptyState() }

        compose.onNodeWithText("No posts yet").assertIsDisplayed()
        compose.onAllNodesWithText("Posts from your contacts will appear here").assertCountEquals(0)
    }

    @Test
    fun `le froid dessine des squelettes de fil sans indicateur de progression`() {
        show { FeedSkeleton() }

        compose.onAllNodes(hasProgress).assertCountEquals(0)
    }

    @Test
    fun `la pagination dessine des squelettes et jamais un cercle de progression`() {
        show { FeedLoadingMoreCards() }

        compose.onAllNodes(hasProgress).assertCountEquals(0)
    }

    @Test
    fun `le menu plus propose les cinq entrees dans l ordre et ouvre le composeur sur celle choisie`() {
        val chosen = mutableListOf<FeedComposerEntry>()
        show { FeedComposerPlaceholder(onClick = {}, userName = "Amina", onEntry = { chosen += it }) }

        compose.onNodeWithContentDescription("Add to your post").performClick()
        listOf("Photo or video", "Camera", "Audio recording", "File", "Location").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
        compose.onNodeWithText("Audio recording").performClick()

        assertThat(chosen).containsExactly(FeedComposerEntry.AUDIO)
        assertThat(FeedComposerEntry.entries).containsExactly(
            FeedComposerEntry.PHOTO_VIDEO, FeedComposerEntry.CAMERA, FeedComposerEntry.AUDIO,
            FeedComposerEntry.FILE, FeedComposerEntry.LOCATION,
        ).inOrder()
    }

    @Test
    fun `la capsule de nouveaux posts annonce le compte et remonte au toucher`() {
        var taps = 0
        show { NewPostsBanner(count = 3, onClick = { taps += 1 }) }

        compose.onNodeWithText("3 new posts").performClick()
        assertThat(taps).isEqualTo(1)
    }

    private val hasProgress = SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo)
}
