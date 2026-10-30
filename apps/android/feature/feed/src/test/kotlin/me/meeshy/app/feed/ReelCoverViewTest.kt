package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
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
        compose.onNodeWithContentDescription("Reel by Amina").performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `une scene passe par le lecteur fourni et sans lecteur retombe sur l aplat`() {
        var rendered: StoryItem? = null
        val scene = ReelCover.Scene(StoryItem(id = "r1"))
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReelSceneRenderer provides { item, _, _, _ -> rendered = item }) {
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
                    LocalReelSceneRenderer provides { item, _, live, _ -> lives[item.id] = live },
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
        compose.onNodeWithContentDescription("Reel by Origen").performClick()
        assertThat(opened).containsExactly("orig")
        assertThat(details).isEmpty()
    }

    @Test
    fun `la scene d un reel remplit le cadre de la couverture, elle ne garde pas son 9 16 de story`() {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReelSceneRenderer provides { _, _, _, modifier -> Box(modifier.testTag("scene")) }) {
                    Box(Modifier.size(200.dp, 250.dp).testTag("cadre")) {
                        ReelCoverView(ReelCover.Scene(StoryItem(id = "r1")), "Amina", {}, Modifier.fillMaxSize())
                    }
                }
            }
        }
        val frame = compose.onNodeWithTag("cadre").getBoundsInRoot()
        val scene = compose.onNodeWithTag("scene", useUnmergedTree = true).getBoundsInRoot()
        assertThat(scene.width).isEqualTo(frame.width)
        assertThat(scene.height).isEqualTo(frame.height)
    }

    @Test
    fun `la scene d un reel recoit la couleur de son auteur et la couverture porte le libelle Reel de l auteur`() {
        var accent: String? = null
        var opened = 0
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReelSceneRenderer provides { _, hex, _, _ -> accent = hex }) {
                    ReelCoverView(ReelCover.Scene(StoryItem(id = "r1"), accentHex = "FF0000"), "Amina", { opened++ }, Modifier.size(200.dp, 250.dp))
                }
            }
        }
        compose.onNodeWithContentDescription("Reel by Amina").performClick()
        assertThat(accent).isEqualTo("FF0000")
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `l aplat prend la couleur de l auteur, indigo seulement sans couleur`() {
        assertThat(ReelCover.Backdrop(isVideo = false, accentHex = "FF0000").backdropTint())
            .isEqualTo(hexColor("FF0000").copy(alpha = MeeshyOpacity.strong))
        assertThat(ReelCover.Backdrop(isVideo = false).backdropTint())
            .isEqualTo(MeeshyPalette.Indigo500.copy(alpha = MeeshyOpacity.strong))
    }
}
