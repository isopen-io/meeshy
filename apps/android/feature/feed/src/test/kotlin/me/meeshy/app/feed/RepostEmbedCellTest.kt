package me.meeshy.app.feed

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13654 — la carte de repost du fil, comme iOS : citation, scène de story, original disparu. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RepostEmbedCellTest {

    @get:Rule
    val compose = createComposeRule()

    private fun embed(
        isUnavailable: Boolean = false,
        storyItem: StoryItem? = null,
        isStory: Boolean = false,
        authorId: String? = null,
        id: String = "orig-1",
    ) = RepostEmbedPresentation(
        id = id,
        authorName = "Origen",
        authorAvatarUrl = null,
        createdAtIso = null,
        content = "Le texte d'origine",
        isTranslated = false,
        previewImageUrl = null,
        extraMediaCount = 0,
        likeCount = 0,
        moodEmoji = null,
        isQuote = false,
        isStory = isStory,
        isReel = false,
        storyItem = storyItem,
        isUnavailable = isUnavailable,
        authorId = authorId,
    )

    @Test
    fun `la citation montre son en-tete, son auteur et le texte d origine`() {
        compose.setContent { MeeshyTheme { RepostEmbedCell(embed = embed(), onOpen = {}) } }
        compose.onNodeWithText("Reposted").assertIsDisplayed()
        compose.onNodeWithText("Origen").assertIsDisplayed()
        compose.onNodeWithText("Le texte d'origine").assertIsDisplayed()
    }

    @Test
    fun `un appui sur la citation ouvre l original, jamais la carte du reposteur`() {
        val opened = mutableListOf<String>()
        compose.setContent { MeeshyTheme { RepostEmbedCell(embed = embed(), onOpen = { opened += it }) } }
        compose.onNodeWithContentDescription("Open reposted post").performClick()
        assertThat(opened).containsExactly("orig-1")
    }

    @Test
    fun `un original disparu est un etat dessine qui n ouvre rien`() {
        val opened = mutableListOf<String>()
        compose.setContent { MeeshyTheme { RepostEmbedCell(embed = embed(isUnavailable = true), onOpen = { opened += it }) } }
        compose.onNodeWithText("This content is no longer available").assertIsDisplayed()
        compose.onNodeWithText("Reposted").assertIsDisplayed()
        compose.onNodeWithText("Le texte d'origine").assertDoesNotExist()
        assertThat(opened).isEmpty()
    }

    @Test
    fun `une story reposte passe par le lecteur de scene fourni par l application`() {
        var rendered: StoryItem? = null
        val story = StoryItem(id = "s1")
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalRepostSceneRenderer provides { item, _, _, _, _ -> rendered = item },
                ) { RepostEmbedCell(embed = embed(isStory = true, storyItem = story), onOpen = {}) }
            }
        }
        compose.waitForIdle()
        assertThat(rendered).isEqualTo(story)
        compose.onNodeWithText("Le texte d'origine").assertDoesNotExist()
    }

    @Test
    fun `sans lecteur de scene une story reposte retombe sur la citation`() {
        compose.setContent { MeeshyTheme { RepostEmbedCell(embed = embed(isStory = true, storyItem = StoryItem(id = "s1")), onOpen = {}) } }
        compose.onNodeWithText("Le texte d'origine").assertIsDisplayed()
    }

    @Test
    fun `une story reposte ne joue que si le coordinateur l elit`() {
        val lives = mutableListOf<Boolean>()
        val coordinator = FeedSceneCoordinator()
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalFeedSceneCoordinator provides coordinator,
                    LocalRepostSceneRenderer provides { _, _, live, _, _ -> lives += live },
                ) { RepostEmbedCell(embed = embed(isStory = true, storyItem = StoryItem(id = "s1")), onOpen = {}, sceneId = "post-1") }
            }
        }
        compose.waitForIdle()
        assertThat(lives.last()).isFalse()
        coordinator.update(listOf(FeedSceneFrame("post-1", 100f, 600f)), 0f, 1000f)
        compose.waitForIdle()
        assertThat(lives.last()).isTrue()
    }

    private fun tapOnStory(embed: RepostEmbedPresentation, withOpener: Boolean = true): Pair<List<Pair<String, String>>, List<String>> {
        val stories = mutableListOf<Pair<String, String>>()
        val posts = mutableListOf<String>()
        var open: () -> Unit = {}
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalStoryOpener provides if (withOpener) ({ author, story -> stories += author to story }) else null,
                    LocalRepostSceneRenderer provides { _, _, _, onOpen, _ -> open = onOpen },
                ) { RepostEmbedCell(embed = embed, onOpen = { posts += it }) }
            }
        }
        compose.waitForIdle()
        open()
        return stories to posts
    }

    @Test
    fun `toucher une story reposte vivante l ouvre en plein ecran, sur CETTE story et pas sur la premiere de son auteur`() {
        val story = StoryItem(id = "orig-1", expiresAt = "2999-01-01T00:00:00Z")
        val (stories, posts) = tapOnStory(embed(isStory = true, storyItem = story, authorId = "author-1"))
        assertThat(stories).containsExactly("author-1" to "orig-1")
        assertThat(posts).isEmpty()
    }

    @Test
    fun `une story reposte sans echeance connue reste ouvrable`() {
        val (stories, posts) = tapOnStory(embed(isStory = true, storyItem = StoryItem(id = "orig-1"), authorId = "author-1"))
        assertThat(stories).containsExactly("author-1" to "orig-1")
        assertThat(posts).isEmpty()
    }

    @Test
    fun `une story reposte expiree ouvre la fiche du post, pas un lecteur sans story`() {
        val story = StoryItem(id = "orig-1", expiresAt = "2020-01-01T00:00:00Z")
        val (stories, posts) = tapOnStory(embed(isStory = true, storyItem = story, authorId = "author-1"))
        assertThat(stories).isEmpty()
        assertThat(posts).containsExactly("orig-1")
    }

    @Test
    fun `une story reposte sans auteur connu ouvre la fiche du post meme avec un lecteur de stories`() {
        val story = StoryItem(id = "orig-1", expiresAt = "2999-01-01T00:00:00Z")
        val (stories, posts) = tapOnStory(embed(isStory = true, storyItem = story, authorId = null))
        assertThat(stories).isEmpty()
        assertThat(posts).containsExactly("orig-1")
    }

    @Test
    fun `sans lecteur de stories ou sans auteur, la story reposte retombe sur la fiche du post`() {
        val posts = mutableListOf<String>()
        var open: () -> Unit = {}
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalRepostSceneRenderer provides { _, _, _, onOpen, _ -> open = onOpen }) {
                    RepostEmbedCell(
                        embed = embed(isStory = true, storyItem = StoryItem(id = "s1"), authorId = "author-1"),
                        onOpen = { posts += it },
                    )
                }
            }
        }
        compose.waitForIdle()
        open()
        assertThat(posts).containsExactly("orig-1")
    }
}
