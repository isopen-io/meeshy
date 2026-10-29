package me.meeshy.app.feed

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13665 — la couverture d'un réel s'ouvre d'un appui, sur CE réel ; la scène passe par le lecteur de l'application. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelCoverViewTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `un appui sur la couverture ouvre le reel`() {
        var opened = 0
        compose.setContent {
            MeeshyTheme {
                ReelCoverView(ReelCover.Backdrop(isVideo = false), "Amina", { opened++ }, Modifier.fillMaxWidth().height(116.dp))
            }
        }
        compose.onNodeWithContentDescription("Reel").performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `une scene passe par le lecteur fourni et sans lecteur retombe sur l aplat`() {
        var rendered: StoryItem? = null
        val scene = ReelCover.Scene(StoryItem(id = "r1"))
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalRepostSceneRenderer provides { item, _, _, _, _ -> rendered = item }) {
                    ReelCoverView(scene, "Amina", {}, Modifier.fillMaxWidth())
                }
            }
        }
        compose.waitForIdle()
        assertThat(rendered).isEqualTo(scene.item)
    }

    @Test
    fun `une scene de reel ne joue que si le coordinateur l elit, sinon elle reste une image fixe`() {
        val lives = mutableMapOf<String, Boolean>()
        val coordinator = FeedSceneCoordinator()
        coordinator.update(listOf(FeedSceneFrame("elue", 100f, 600f)), 0f, 1000f)
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(
                    LocalFeedSceneCoordinator provides coordinator,
                    LocalRepostSceneRenderer provides { item, _, live, _, _ -> lives[item.id] = live },
                ) {
                    ReelCoverView(ReelCover.Scene(StoryItem(id = "r-elue")), "Amina", {}, sceneId = "elue")
                    ReelCoverView(ReelCover.Scene(StoryItem(id = "r-repos")), "Amina", {}, sceneId = "repos")
                    ReelCoverView(ReelCover.Scene(StoryItem(id = "r-hors-fil")), "Amina", {})
                }
            }
        }
        compose.waitForIdle()
        assertThat(lives).containsExactly("r-elue", true, "r-repos", false, "r-hors-fil", false)
    }

    @Test
    fun `la carte d un repost de reel ouvre le reel cite, pas le detail du post`() {
        val opened = mutableListOf<String>()
        val details = mutableListOf<String>()
        val embed = RepostEmbedPresentation(
            id = "orig", authorName = "Origen", authorAvatarUrl = null, createdAtIso = null, content = "",
            isTranslated = false, previewImageUrl = null, extraMediaCount = 0, likeCount = 0, moodEmoji = null,
            isQuote = false, isStory = false, isReel = true, reelCover = ReelCover.Backdrop(isVideo = false),
        )
        compose.setContent { MeeshyTheme { RepostEmbedCell(embed = embed, onOpen = { details += it }, onOpenReel = { opened += it }) } }
        compose.onNodeWithContentDescription("Reel").performClick()
        assertThat(opened).containsExactly("orig")
        assertThat(details).isEmpty()
    }
}
