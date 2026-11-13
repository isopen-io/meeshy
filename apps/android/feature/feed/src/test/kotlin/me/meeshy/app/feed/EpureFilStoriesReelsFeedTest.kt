package me.meeshy.app.feed

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.w3c.dom.Element

/** Épure #18090 : le fil, ses états vides et son bandeau hors ligne n'écrivent que ce qui apprend quelque chose. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedEpureStatesTest {

    @get:Rule
    val compose = createComposeRule()

    private val textNodes = SemanticsMatcher.keyIsDefined(SemanticsProperties.Text)

    @Test
    fun `the empty feed is one line`() {
        compose.setContent { MeeshyTheme { FeedEmptyState() } }
        compose.onAllNodes(textNodes).assertCountEquals(1)
    }

    @Test
    fun `the offline band says Offline and nothing else`() {
        compose.setContent { MeeshyTheme { FeedOfflineBand(visible = true) } }
        compose.onNodeWithText("Offline").assertExists()
        compose.onAllNodes(textNodes).assertCountEquals(1)
    }

    @Test
    fun `the offline empty feed is one short line and Retry, the band already says Offline`() {
        compose.setContent { MeeshyTheme { FeedOfflineEmptyState(onRetry = {}) } }
        compose.onNodeWithText("The feed will appear when the network is back.").assertExists()
        compose.onAllNodesWithText("Offline").assertCountEquals(0)
        compose.onAllNodes(textNodes).assertCountEquals(2)
    }

    @Test
    fun `the composer hook is short`() {
        compose.setContent { MeeshyTheme { FeedComposerPlaceholder(onClick = {}) } }
        compose.onNodeWithText("Share something…").assertExists()
    }

    @Test
    fun `a republished reel nobody liked writes no zero`() {
        compose.setContent { MeeshyTheme { ReelRepostEmbedCell(embed = reelEmbed(likes = 0), containingPostId = "outer", onOpen = {}) } }
        compose.onAllNodesWithText("0").assertCountEquals(0)
    }

    @Test
    fun `a republished reel with likes writes the count`() {
        compose.setContent { MeeshyTheme { ReelRepostEmbedCell(embed = reelEmbed(likes = 3), containingPostId = "outer", onOpen = {}) } }
        compose.onNodeWithText("3").assertExists()
    }

    private fun reelEmbed(likes: Int) = RepostEmbedPresentation(
        id = "reel-1",
        authorName = "Origen",
        authorAvatarUrl = null,
        createdAtIso = null,
        content = "",
        isTranslated = false,
        previewImageUrl = null,
        extraMediaCount = 0,
        likeCount = likes,
        moodEmoji = null,
        isQuote = false,
        isStory = false,
        isReel = true,
        authorId = "u9",
        authorUsername = "orig",
        reelCover = ReelCover.Backdrop(isVideo = false),
    )
}

/** Les libellés qui ont quitté l'écran quittent aussi les sept langues, et ceux qui raccourcissent le font partout. */
class FeedEpureStringsContractTest {

    private val folders = listOf("values", "values-ar", "values-de", "values-es", "values-fr", "values-it", "values-pt")
    private val res = File("src/main/res")

    private fun names(folder: String): Map<String, String> =
        File(res, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).getElementsByTagName("string")
            (0 until nodes.length).map { nodes.item(it) as Element }.map { it.getAttribute("name") to it.textContent.replace("\\'", "'") }
        }.toMap()

    @Test
    fun `a line that no screen reads is gone from the seven languages`() {
        val gone = setOf(
            "feed_empty_subtitle", "profile_posts_empty_subtitle", "profile_posts_empty_filter_subtitle",
            "profile_posts_end_of_content", "nearby_permission_title", "nearby_denied_title",
            "status_composer_placeholder",
        )
        folders.forEach { folder ->
            assertWithMessage(folder).that(names(folder).keys.intersect(gone)).isEmpty()
        }
    }

    @Test
    fun `the shortened labels are translated, never copied from the French`() {
        val short = listOf(
            "feed_offline_banner", "feed_offline_empty_detail", "nearby_permission_message", "nearby_denied_detail",
            "nearby_location_unavailable", "nearby_empty", "post_comments_empty", "feed_composer_open_placeholder",
            "status_composer_emoji_too_long", "status_repost_audience_refused",
        )
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
        assertThat(french["feed_offline_banner"]).isEqualTo("Hors ligne")
        assertThat(french["feed_offline_empty_detail"]).isEqualTo("Le fil s'affichera au retour du réseau.")
        assertThat(french["nearby_permission_message"]).isEqualTo("Autorisez la position pour voir les publications proches.")
        assertThat(french["nearby_denied_detail"]).isEqualTo("Autorisez la position dans les Réglages.")
        assertThat(french["nearby_location_unavailable"]).isEqualTo("Position indisponible")
        assertThat(french["nearby_empty"]).isEqualTo("Aucune publication à proximité")
        assertThat(french["post_comments_empty"]).isEqualTo("Aucun commentaire")
        assertThat(french["feed_composer_open_placeholder"]).isEqualTo("Partager quelque chose…")
        assertThat(french["status_composer_emoji_too_long"]).isEqualTo("Emoji trop long")
    }

    @Test
    fun `the refusal to republish wider is one short line without the English typo`() {
        val french = names("values-fr")
        assertThat(french["status_repost_audience_refused"]).isEqualTo("Même audience ou plus restreinte.")
        folders.forEach { folder ->
            assertWithMessage(folder).that(names(folder)["status_repost_audience_refused"]).doesNotContain("can'")
        }
    }
}
