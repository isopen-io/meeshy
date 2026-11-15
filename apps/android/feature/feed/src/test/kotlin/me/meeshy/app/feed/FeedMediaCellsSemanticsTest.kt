package me.meeshy.app.feed

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertTextEquals
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedMediaCellsSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun images(count: Int) = (1..count).map { index ->
        feedMediaItem(id = "m$index", type = FeedMediaType.IMAGE, alt = if (index == 1) "A red bicycle" else null)
    }

    private fun show(media: List<FeedMediaItem>, taps: MutableList<Int> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme {
                FeedCardMedia(media = media, accentHex = null, carrierLanguage = null, onMediaTap = { taps += it })
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `l'alt de l'auteur est lu sur une tuile seule`() {
        show(images(1))

        compose.onNodeWithContentDescription("A red bicycle").assertIsDisplayed()
    }

    @Test
    fun `sans alt ni legende la tuile seule retombe sur le libelle generique`() {
        show(listOf(feedMediaItem(id = "m1")))

        compose.onNodeWithContentDescription("Post image").assertIsDisplayed()
    }

    @Test
    fun `la legende est lue quand l'auteur n'a pas ecrit d'alt`() {
        show(listOf(feedMediaItem(id = "m1", caption = "Sunset over the bay")))

        compose.onNodeWithContentDescription("Sunset over the bay").assertIsDisplayed()
    }

    @Test
    fun `le carrousel dit la position puis l'alt de la page`() {
        show(images(3))

        compose.onNodeWithContentDescription("Media 1 of 3. A red bicycle").assertIsDisplayed()
    }

    @Test
    fun `le carrousel montre le compteur, les pastilles et la seule fleche suivante sur la premiere page`() {
        show(images(3))

        compose.onNodeWithText("1/3").assertIsDisplayed()
        compose.onNodeWithTag(FEED_CAROUSEL_DOTS_TAG).assertIsDisplayed()
        compose.onNodeWithContentDescription("Next media").assertIsDisplayed()
        compose.onNodeWithContentDescription("Previous media").assertDoesNotExist()
    }

    @Test
    fun `la fleche suivante tourne la page et offre la fleche precedente`() {
        show(images(3))

        compose.onNodeWithContentDescription("Next media").performClick()
        compose.waitForIdle()

        compose.onNodeWithText("2/3").assertIsDisplayed()
        compose.onNodeWithContentDescription("Previous media").assertIsDisplayed()
    }

    @Test
    fun `toucher une tuile ouvre la galerie sur son rang parmi les visuels`() {
        val taps = mutableListOf<Int>()
        show(listOf(feedMediaItem(id = "m1", alt = "Only one")), taps)

        compose.onNodeWithContentDescription("Only one").performTouchInput { click(Offset(8f, 8f)) }

        assertThat(taps).containsExactly(0)
    }

    @Test
    fun `une legende de plus de vingt mots est abregee puis se deplie`() {
        val long = (1..30).joinToString(" ") { "w$it" }
        show(listOf(feedMediaItem(id = "m1", caption = long)))

        compose.onNodeWithTag(FEED_CAPTION_TEXT_TAG, useUnmergedTree = true).assertTextEquals((1..20).joinToString(" ") { "w$it" } + "…")
        compose.onNodeWithTag(FEED_CAPTION_TOGGLE_TAG).assertTextEquals("more…")

        compose.onNodeWithTag(FEED_CAPTION_TOGGLE_TAG).performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(FEED_CAPTION_TEXT_TAG, useUnmergedTree = true).assertTextEquals(long)
        compose.onNodeWithTag(FEED_CAPTION_TOGGLE_TAG).assertTextEquals("less")
    }

    @Test
    fun `une legende courte n'offre pas de bouton Developper`() {
        show(listOf(feedMediaItem(id = "m1", caption = "Short one")))

        compose.onNodeWithTag(FEED_CAPTION_TEXT_TAG, useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag(FEED_CAPTION_TOGGLE_TAG).assertDoesNotExist()
    }

    @Test
    fun `la duree d'une video s'affiche en pilule`() {
        show(listOf(feedMediaItem(id = "v1", type = FeedMediaType.VIDEO, durationSeconds = 75)))

        compose.onNodeWithTag(FEED_VIDEO_DURATION_TAG, useUnmergedTree = true).assertTextEquals("1:15")
    }

    @Test
    fun `un document dit son nom, sa taille et ses pages`() {
        show(listOf(feedMediaItem(id = "d1", type = FeedMediaType.DOCUMENT, fileName = "report.pdf", fileSizeLabel = "1.2 MB", pageCount = 12)))

        compose.onNodeWithText("report.pdf", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("1.2 MB • 12 pages", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `un document sans nom retombe sur Document`() {
        show(listOf(feedMediaItem(id = "d1", type = FeedMediaType.DOCUMENT)))

        compose.onNodeWithText("Document", useUnmergedTree = true).assertIsDisplayed()
    }
}
