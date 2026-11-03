package me.meeshy.app.conversations

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.search.PostSearchHit
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14671 — recette S8 (360 dp) : les trois onglets de la recherche générale tiennent sur la largeur,
 * leurs compteurs restent des pastilles d'une ligne (jamais une pilule vide et haute, jamais « 20 »
 * cassé en deux), et une publication trouvée surligne le terme et montre sa vignette.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class GlobalSearchTabsAndPostRowTest {

    @get:Rule
    val compose = createComposeRule()

    private val counts = mapOf(GlobalSearchTab.MESSAGES to 12, GlobalSearchTab.POSTS to 7, GlobalSearchTab.USERS to 20)

    private fun showTabs() = compose.setContent {
        MeeshyTheme { SearchTabRow(current = GlobalSearchTab.POSTS, countFor = { counts.getValue(it) }, onSelect = {}) }
    }

    private fun lineCountOf(text: String): Int {
        val node = compose.onNodeWithText(text, useUnmergedTree = true).fetchSemanticsNode()
        val layouts = mutableListOf<TextLayoutResult>()
        node.config[SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
        return layouts.single().lineCount
    }

    @Test
    fun `sur 360 dp, chaque compteur est une pastille d une ligne, ni vide ni haute`() {
        showTabs()

        listOf("12", "7", "20").forEach { count -> assertThat(lineCountOf(count)).isEqualTo(1) }
        val badges = compose.onAllNodesWithTag(TAB_COUNT_TAG, useUnmergedTree = true).fetchSemanticsNodes()
        assertThat(badges).hasSize(3)
        with(compose.density) {
            badges.forEach { badge ->
                assertThat(badge.size.height.toDp()).isLessThan(20.dp)
                assertThat(badge.size.width.toDp()).isAtLeast(badge.size.height.toDp() * 0.9f)
            }
        }
    }

    @Test
    fun `sur 360 dp, les trois libelles tiennent sur une ligne`() {
        showTabs()

        listOf("Messages", "Posts", "Utilisateurs").forEach { label -> assertThat(lineCountOf(label)).isEqualTo(1) }
    }

    @Test
    fun `chaque pastille reste au coin de son icone, sans recouvrir la premiere lettre du libelle`() {
        showTabs()

        val badges = compose.onAllNodesWithTag(TAB_COUNT_TAG, useUnmergedTree = true).fetchSemanticsNodes()
            .sortedBy { it.boundsInRoot.left }
        val labels = listOf("Messages", "Posts", "Utilisateurs")
            .map { compose.onNodeWithText(it, useUnmergedTree = true).fetchSemanticsNode() }
        badges.zip(labels).forEach { (badge, label) ->
            assertThat(badge.boundsInRoot.right).isAtMost(label.boundsInRoot.left)
        }
    }

    private fun hit(thumbnail: String?) = PostSearchHit(
        postId = "p1",
        kind = PostType.POST,
        authorId = "u1",
        authorName = "Ada",
        authorAvatar = null,
        text = "La recette du jour",
        thumbnailUrl = thumbnail,
        createdAtMillis = 0L,
    )

    @Test
    fun `une publication trouvee surligne le terme cherche`() {
        compose.setContent { MeeshyTheme { PostHitRow(hit = hit(null), resultsQuery = "recette", onClick = {}) } }

        val node = compose.onNodeWithText("La recette du jour", useUnmergedTree = true).fetchSemanticsNode()
        val shown = node.config.getOrNull(SemanticsProperties.Text).orEmpty().single()
        val washed = shown.spanStyles.map { shown.text.substring(it.start, it.end) }
        assertThat(washed).containsExactly("recette")
    }

    @Test
    fun `une publication avec un media montre sa vignette`() {
        compose.setContent { MeeshyTheme { PostHitRow(hit = hit("/media/p1.jpg"), resultsQuery = "recette", onClick = {}) } }
        compose.onNodeWithTag(POST_THUMBNAIL_TAG, useUnmergedTree = true).assertExists()
    }

    @Test
    fun `une publication sans media ne reserve aucune vignette`() {
        compose.setContent { MeeshyTheme { PostHitRow(hit = hit(null), resultsQuery = "recette", onClick = {}) } }
        compose.onNodeWithTag(POST_THUMBNAIL_TAG, useUnmergedTree = true).assertDoesNotExist()
    }
}
