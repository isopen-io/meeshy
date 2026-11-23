package me.meeshy.ui.component.contentcard

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentCardAuthor
import me.meeshy.sdk.model.contentcard.ContentCardMedia
import me.meeshy.sdk.model.contentcard.ContentCardPage
import me.meeshy.sdk.model.contentcard.ContentCardScene
import me.meeshy.sdk.model.contentcard.ContentCardStats
import me.meeshy.sdk.model.contentcard.ContentCardVisual
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * **Le bloc visuel de la carte d'un contenu** (#20233, jumelle de #20211) : le diaporama se fait glisser sans rien ouvrir
 * et s'ouvre d'un toucher, une vidéo montre son signe lecture, un son se joue par son propre bouton sans ouvrir la carte,
 * une scène se dessine par le player de l'application — et TalkBack dit la page du diaporama et sait en changer.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ContentLinkCardVisualTest {

    @get:Rule
    val compose = createComposeRule()

    private fun media(id: String, video: Boolean = false) = ContentCardMedia(
        imageUrl = null,
        thumbHash = null,
        isVideo = video,
        durationSeconds = if (video) 12 else null,
        aspectRatio = 4f / 3f,
        maxHeightDp = 220,
        extraCount = 0,
        id = id,
    )

    private fun card(visual: ContentCardVisual, type: PostType = PostType.POST, scene: ContentCardScene? = null) = ContentCard(
        postId = "p1",
        type = type,
        author = ContentCardAuthor(id = "u1", name = "Béa", avatarUrl = null),
        text = "Au marché",
        moodEmoji = null,
        media = (visual as? ContentCardVisual.Media)?.media,
        stats = ContentCardStats(views = 12, likes = 0, comments = 0, bookmarks = 3, isBookmarkedByMe = false),
        createdAtIso = null,
        visual = visual,
        sceneCarrierId = scene?.let { "p1" },
        scene = scene,
    )

    private val slideshow = ContentCardVisual.Slideshow(listOf(ContentCardPage.Media(media("m1")), ContentCardPage.Media(media("m2", video = true))))

    private var opened = 0
    private val played = mutableListOf<String>()
    private val painted = mutableListOf<String>()

    private val soundPlayer: ContentCardSoundPlayer = { sound, modifier ->
        Text("▶ ${sound.attachmentId}", modifier = modifier.testTag("sound-play"))
        Box(Modifier.size(1.dp))
        played += sound.attachmentId
    }

    private val scenePainter: ContentCardScenePainter = { item, _, modifier ->
        Box(modifier.testTag("scene-${item.id}"))
        painted += item.id
    }

    private fun show(card: ContentCard) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(
                    LocalContentCardSoundPlayer provides soundPlayer,
                    LocalContentCardScenePainter provides scenePainter,
                ) {
                    ContentLinkCardView(card = card, onOpen = { opened += 1 })
                }
            }
        }
    }

    /** Le glissement se fait DANS le bloc visuel, en haut de la carte — jamais sur le texte. */
    private fun swipeTheSlideshow() {
        compose.onNodeWithContentDescription("Béa", substring = true).performTouchInput {
            swipe(start = Offset(right - 8f, top + 40f), end = Offset(left + 8f, top + 40f), durationMillis = 200)
        }
        compose.waitForIdle()
    }

    @Test
    fun `a slideshow pages by swiping without opening, and opens on a touch`() {
        show(card(slideshow))
        compose.onNodeWithContentDescription("Media 1 of 2", substring = true).assertExists()

        swipeTheSlideshow()

        compose.onNodeWithContentDescription("Media 2 of 2", substring = true).assertExists()
        assertThat(opened).isEqualTo(0)
        compose.onNodeWithContentDescription("Media 2 of 2", substring = true).performClick()
        assertThat(opened).isEqualTo(1)
    }

    private fun customActions(description: String) =
        compose.onNodeWithContentDescription(description, substring = true).fetchSemanticsNode().config[SemanticsActions.CustomActions]

    @Test
    fun `TalkBack hears the page of the slideshow and can turn it`() {
        show(card(slideshow))
        val next = customActions("Media 1 of 2").single { it.label == "Next media" }

        compose.runOnIdle { next.action() }
        compose.waitForIdle()

        assertThat(customActions("Media 2 of 2").map { it.label }).containsExactly("Previous media")
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `a sound alone plays by its own button, which never opens the card`() {
        show(card(ContentCardVisual.Sound(attachmentId = "a1", url = "/f/a.mp3", durationSeconds = 31), type = PostType.STATUS))

        compose.onNodeWithTag("sound-play").assertExists().performClick()

        assertThat(played).contains("a1")
        assertThat(opened).isEqualTo(0)
        compose.onNodeWithContentDescription("Mood by Béa", substring = true).performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `a composed scene is painted by the application's player and opens on a touch`() {
        val scene = ContentCardScene(items = listOf(StoryItem(id = "p1")), accentHex = "6366F1")
        show(card(ContentCardVisual.Scene(0), type = PostType.STORY, scene = scene))

        assertThat(painted).contains("p1")
        compose.onNodeWithContentDescription("Story by Béa", substring = true).performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `a slideshow of scenes paints the page it shows, then the next one`() {
        val scene = ContentCardScene(items = listOf(StoryItem(id = "p1#scene-0"), StoryItem(id = "p1#scene-1")), accentHex = "6366F1")
        show(card(ContentCardVisual.Slideshow(listOf(ContentCardPage.Scene(0), ContentCardPage.Scene(1))), type = PostType.STORY, scene = scene))

        assertThat(painted).contains("p1#scene-0")
        swipeTheSlideshow()
        assertThat(painted).contains("p1#scene-1")
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `text alone has no visual block and says no page`() {
        show(card(ContentCardVisual.None))
        compose.onNodeWithContentDescription("Post by Béa", substring = true).assertExists()
        compose.onNodeWithContentDescription("Media", substring = true).assertDoesNotExist()
        assertThat(painted).isEmpty()
        assertThat(played).isEmpty()
    }
}
