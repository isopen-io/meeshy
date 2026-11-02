package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13663 — l'élection mesure la SCÈNE elle-même (iOS), pas la carte qui l'enveloppe : une carte haute dont la scène ne
 * dépasse que d'un bord de l'écran n'est pas visible à moitié.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class FeedSceneReportedFramesTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `une carte haute dont la scene depasse a peine de l ecran n elit pas sa scene`() {
        val coordinator = FeedSceneCoordinator()
        coordinator.reportViewport(top = 0f, bottom = 1000f)
        // La carte occupe tout l'écran (0..1400) ; sa scène, en bas de carte, n'en montre que 100 px sur 500.
        coordinator.report("p1", top = 900f, bottom = 1400f)

        coordinator.electReported()

        assertThat(coordinator.activeId).isNull()
    }

    @Test
    fun `une scene a moitie visible est elue sur son propre cadre`() {
        val coordinator = FeedSceneCoordinator()
        coordinator.reportViewport(top = 0f, bottom = 1000f)
        coordinator.report("p1", top = 500f, bottom = 1000f)

        coordinator.electReported()

        assertThat(coordinator.activeId).isEqualTo("p1")
    }

    @Test
    fun `une scene retiree du fil n est plus candidate`() {
        val coordinator = FeedSceneCoordinator()
        coordinator.reportViewport(top = 0f, bottom = 1000f)
        coordinator.report("p1", top = 200f, bottom = 700f)
        coordinator.forget("p1")

        coordinator.electReported()

        assertThat(coordinator.activeId).isNull()
    }

    private fun scenePost(id: String) = feedPostPresentation(id = id).copy(isReel = true, reelCover = ReelCover.Scene(StoryItem(id = id)))

    @Test
    fun `dans un vrai fil la scene la plus centree est elue sur les cadres qu elle rapporte, puis la suivante apres defilement`() {
        val posts = listOf(feedPostPresentation(id = "texte")) + (1..4).map { scenePost("p$it") }
        val coordinator = FeedSceneCoordinator()
        lateinit var scrollTo: (Int) -> Unit
        compose.setContent {
            val listState = rememberLazyListState()
            val scope = rememberCoroutineScope()
            scrollTo = { index -> scope.launch { listState.scrollToItem(index) } }
            val sceneIds = feedSceneIds(posts)
            CompositionLocalProvider(LocalFeedSceneCoordinator provides coordinator) {
                FeedSceneElectionEffect(coordinator = coordinator, listState = listState, sceneIds = sceneIds)
                LazyColumn(state = listState, modifier = Modifier.height(500.dp).sceneViewport()) {
                    items(posts, key = FeedPostPresentation::listKey) { post ->
                        Box(Modifier.fillMaxWidth().height(if (post.id in sceneIds) 400.dp else 100.dp).sceneFrame(post.id.takeIf { it in sceneIds }))
                    }
                }
            }
        }
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(400)
        compose.waitForIdle()

        assertThat(coordinator.activeId).isEqualTo("p1")

        compose.runOnIdle { scrollTo(3) }
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(400)
        compose.waitForIdle()

        assertThat(coordinator.activeId).isEqualTo("p3")
    }

    @Test
    fun `les ids de scene sont exactement les cles de la liste du fil`() {
        val posts = listOf(feedPostPresentation(id = "texte"), scenePost("p1"), scenePost("p2"))

        assertThat(feedSceneIds(posts)).containsExactly("p1", "p2")
        assertThat(posts.map(FeedPostPresentation::listKey)).containsAtLeastElementsIn(feedSceneIds(posts))
    }

    @Test
    fun `l ecran du fil donne a sa liste la cle que l election lit`() {
        val screen = File("src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt").readText()
        assertThat(screen).contains("items(state.posts, key = FeedPostPresentation::listKey")
        assertThat(screen).contains("feedSceneIds(state.posts)")
    }
}
