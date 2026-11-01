package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #13653 — le fil ne câble plus sa propre barre de statut : ni sélecteur « Amis / Découvrir », ni puce « + Statut ».
 * Le rail de stories (monté par l'application, le même qu'en tête des conversations) est son seul point d'entrée.
 */
class FeedRailContractTest {

    private val feedDir = File("src/main/kotlin/me/meeshy/app/feed")

    private fun sources(): List<File> = feedDir.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()

    @Test
    fun `le fil n a plus de barre de statut ni de selecteur Amis Decouvrir`() {
        assertThat(File(feedDir, "StatusBarView.kt").exists()).isFalse()
        val offenders = sources().filter { file ->
            file.readText().let { "StatusFeedModeToggle" in it || "StatusBarView(" in it || "status_feed_" in it || "status_bar_add" in it }
        }.map { it.name }
        assertThat(offenders).isEmpty()
    }

    @Test
    fun `le rail est le premier item de la liste du fil et defile avec elle`() {
        val screen = File(feedDir, "FeedScreen.kt").readText()
        assertThat(screen).contains("storyRail: @Composable () -> Unit")
        assertThat(screen).contains("item(key = FEED_STORY_RAIL_KEY")
    }

    @Test
    fun `comme iOS FeedView le rail precede la porte du composeur, toutes deux dans le contenu qui defile`() {
        val screen = File(feedDir, "FeedScreen.kt").readText()
        val rail = screen.indexOf("item(key = FEED_STORY_RAIL_KEY")
        val composer = screen.indexOf("item(key = FEED_COMPOSER_HEAD_KEY")
        assertThat(rail).isAtLeast(0)
        assertThat(composer).isGreaterThan(rail)
        val scaffoldColumn = screen.substringAfter("{ padding ->").substringBefore("PullToRefreshBox(")
        assertThat(scaffoldColumn).doesNotContain("FeedComposerPlaceholder(")
    }

    @Test
    fun `le rail du fil occupe toute la largeur comme celui des conversations`() {
        val screen = File(feedDir, "FeedScreen.kt").readText()
        val list = screen.substringAfter("FeedBody.POSTS -> LazyColumn(").substringBefore(") {")
        assertThat(list).doesNotContain("PaddingValues(MeeshySpacing.lg)")
        assertThat(list).doesNotContain("PaddingValues(horizontal")
        assertThat(list).contains("contentPadding = PaddingValues(bottom = MeeshySpacing.lg)")
    }

    @Test
    fun `aucune chaine de la barre retiree ne survit dans les ressources`() {
        val resources = File("src/main/res").walkTopDown().filter { it.isFile && it.extension == "xml" }.joinToString("\n") { it.readText() }
        assertThat(resources).doesNotContain("status_bar_")
        assertThat(resources).doesNotContain("status_feed_")
    }
}
