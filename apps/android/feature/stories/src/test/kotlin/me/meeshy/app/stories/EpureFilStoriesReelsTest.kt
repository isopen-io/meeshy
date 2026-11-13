package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import me.meeshy.sdk.model.MyStoriesTab
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.w3c.dom.Element

/**
 * Épure #18090, règle 5 : le rail de la story ne redit pas le nom de ses boutons sous le glyphe (le nom reste lu par le
 * lecteur d'écran) et n'écrit jamais un compteur nul ; règle 4 : un état vide tient en une ligne.
 */
class StoryRailCaptionTest {
    @Test
    fun `a null count writes nothing`() {
        assertThat(StoryRailCaption.of(0)).isNull()
    }

    @Test
    fun `a count is written as is`() {
        assertThat(StoryRailCaption.of(7)).isEqualTo("7")
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h900dp")
class StoryRailNoLegendTest {

    @get:Rule
    val compose = createComposeRule()

    private val viewerPlan = StoryRailPlan.resolve(
        isOwnStory = false,
        hasTranslatableContent = false,
        canReply = true,
        canCompose = false,
        commentCount = 0,
        hasAudibleSound = true,
    )

    private fun show(counts: StoryRailCounts = StoryRailCounts()) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 900.dp)) {
                    StoryActionRail(
                        plan = viewerPlan,
                        reactionCount = 0,
                        hasReacted = false,
                        languageBadgeCode = null,
                        heartBouncePulse = 0,
                        onTapHeart = {},
                        onTapLanguage = {},
                        onTapReply = {},
                        onScrubEvent = {},
                        onHeartBounds = {},
                        onLanguageBounds = {},
                        counts = counts,
                    )
                }
            }
        }
    }

    @Test
    fun `no button writes its name under the glyph, the names stay as content descriptions`() {
        show()
        listOf("Sound", "React", "Reply", "Send", "Repost").forEach { name ->
            compose.onAllNodesWithText(name).assertCountEquals(0)
        }
        listOf("React", "Reply", "Send").forEach { name ->
            assertWithMessage(name).that(compose.onAllNodesWithContentDescription(name).fetchSemanticsNodes()).isNotEmpty()
        }
    }

    @Test
    fun `a null counter is not rendered`() {
        show(StoryRailCounts(comments = 0, shares = 0, reposts = 0))
        compose.onAllNodesWithText("0").assertCountEquals(0)
    }

    @Test
    fun `a counter above zero is rendered`() {
        show(StoryRailCounts(shares = 4))
        compose.onNodeWithText("4").assertExists()
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoriesEmptyStatesOneLineTest {

    @get:Rule
    val compose = createComposeRule()

    private val textNodes = SemanticsMatcher.keyIsDefined(SemanticsProperties.Text)

    private fun assertOneLine(tab: MyStoriesTab) {
        compose.setContent { MeeshyTheme { MyStoriesEmpty(tab) } }
        compose.onAllNodes(textNodes).assertCountEquals(1)
    }

    @Test
    fun `my published stories say their emptiness in one line`() = assertOneLine(MyStoriesTab.PUBLISHED)

    @Test
    fun `my queue says its emptiness in one line`() = assertOneLine(MyStoriesTab.QUEUE)

    @Test
    fun `my drafts say their emptiness in one line`() = assertOneLine(MyStoriesTab.DRAFTS)

    @Test
    fun `my archive says its emptiness in one line`() = assertOneLine(MyStoriesTab.ARCHIVE)

    @Test
    fun `the story that cannot be found keeps its title and its two actions, nothing else`() {
        compose.setContent { MeeshyTheme { StoryViewerNotFound(onRetry = {}, onClose = {}) } }
        compose.onAllNodes(textNodes).assertCountEquals(3)
    }

    @Test
    fun `the story of a newer format reads in one short line`() {
        compose.setContent { StorySentinelView(onUpdate = {}, onSkip = {}) }
        compose.onNodeWithText("Update the app to see it.").assertExists()
    }
}

/** Les libellés qui ont quitté l'écran quittent aussi les sept langues, et ceux qui raccourcissent le font partout. */
class StoriesEpureStringsContractTest {

    private val folders = listOf("values", "values-ar", "values-de", "values-es", "values-fr", "values-it", "values-pt")
    private val res = File("src/main/res")

    private fun names(folder: String): Map<String, String> =
        File(res, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).getElementsByTagName("string")
            (0 until nodes.length).map { nodes.item(it) as Element }.map { it.getAttribute("name") to it.textContent.replace("\\'", "'") }
        }.toMap()

    @Test
    fun `a subtitle that no screen reads is gone from the seven languages`() {
        val gone = listOf(
            "stories_comments_empty_subtitle", "stories_viewers_empty_subtitle", "stories_viewer_not_found_description",
            "story_notification_expired_subtitle", "my_stories_empty_subtitle", "my_stories_queue_empty_subtitle",
            "my_stories_drafts_empty_subtitle", "my_stories_archive_empty_subtitle",
        )
        folders.forEach { folder ->
            val present = names(folder).keys.intersect(gone.toSet())
            assertWithMessage(folder).that(present).isEmpty()
        }
    }

    @Test
    fun `the shortened labels are translated, never copied from the French`() {
        val short = listOf("stories_comments_empty_title", "stories_viewers_empty_title", "my_stories_queue_empty_title", "story_sentinel_body", "story_place_denied")
        val french = names("values-fr")
        folders.filter { it != "values-fr" }.forEach { folder ->
            val values = names(folder)
            short.forEach { key ->
                assertWithMessage("$folder/$key").that(values[key]).isNotNull()
                assertWithMessage("$folder/$key").that(values[key]).isNotEqualTo(french[key])
            }
        }
    }

    @Test
    fun `the French labels are the short ones`() {
        val french = names("values-fr")
        assertThat(french["stories_comments_empty_title"]).isEqualTo("Aucun commentaire")
        assertThat(french["stories_viewers_empty_title"]).isEqualTo("Aucune vue")
        assertThat(french["my_stories_queue_empty_title"]).isEqualTo("Aucune publication en cours ou en échec")
        assertThat(french["story_sentinel_body"]).isEqualTo("Mettez l'application à jour pour la voir.")
        assertThat(french["story_place_denied"]).isEqualTo("Position désactivée. Cherchez un lieu par son nom.")
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h900dp")
class StoryLanguageOriginalHintTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the Prism sentence sits under Original, on the full width, never cut`() {
        compose.setContent { MeeshyTheme { OriginalRow(selected = false, onClick = {}) } }
        val label = compose.onNodeWithText("Original", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val hint = compose.onNodeWithText("Each text in its own language", useUnmergedTree = true).fetchSemanticsNode()
        assertThat(hint.boundsInRoot.top).isAtLeast(label.bottom - 1f)
        assertThat(hint.layoutInfo.width).isGreaterThan((150 * 1.0).toInt())
        val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        hint.config[androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
        assertThat(layouts.single().hasVisualOverflow).isFalse()
    }
}
