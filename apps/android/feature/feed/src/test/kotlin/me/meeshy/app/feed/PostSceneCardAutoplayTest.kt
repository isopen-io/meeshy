package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Une scène ne joue que si sa carte est élue, que c'est la page courante, ET qu'elle bouge (iOS `PostSceneMosaic.scenePlayer`). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
class PostSceneCardAutoplayTest {

    @get:Rule
    val compose = createComposeRule()

    private fun scenes(moving: List<Boolean>) = FeedPostScenes(
        items = moving.indices.map { StoryItem(id = "p1#scene-$it") },
        layout = MosaicLayoutMode.CAROUSEL,
        accentHex = "6366F1",
        moving = moving,
    )

    private fun played(scenes: FeedPostScenes, live: Boolean): List<Pair<String, Boolean>> {
        val seen = LinkedHashMap<String, Boolean>()
        val card: ReelSceneRenderer = { item, _, isLive, _, modifier ->
            seen[item.id] = isLive
            Box(modifier)
        }
        compose.setContent {
            CompositionLocalProvider(LocalPostSceneCardRenderer provides card) { PostScenesView(scenes = scenes, live = live) }
        }
        compose.waitForIdle()
        return seen.toList()
    }

    @Test
    fun `une scene fixe n'est jamais lancee, meme dans la carte elue`() {
        assertThat(played(scenes(listOf(false, false)), live = true).map { it.second }).doesNotContain(true)
    }

    @Test
    fun `la page courante d'une carte elue qui bouge est lancee`() {
        assertThat(played(scenes(listOf(true, true)), live = true).first()).isEqualTo("p1#scene-0" to true)
    }

    @Test
    fun `une carte non elue ne lance rien`() {
        assertThat(played(scenes(listOf(true, true)), live = false).map { it.second }).doesNotContain(true)
    }
}
