package me.meeshy.ui.component.audio

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le pager du plein écran audio (iOS `AudioFullscreenView`) : l'ordre est celui de la réception, la fin d'un vocal
 * tourne la page avec la piste, les pages seulement traversées ne jouent jamais, et fermer rend la file de la conversation.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioFullscreenPagerTest {

    @get:Rule
    val compose = createComposeRule()

    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    private val sources = listOf(audioSource("c", 3_000L, "Cy"), audioSource("a", 1_000L, "Ada"), audioSource("b", 2_000L, "Bea"))

    private fun show(player: FakeAudioFullscreenPlayer, start: String, opened: androidx.compose.runtime.MutableState<Boolean>? = null) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            if (opened == null || opened.value) {
                AudioFullscreenScreen(
                    sources = sources,
                    startAttachmentId = start,
                    player = player,
                    accent = Color.Magenta,
                    onDismiss = {},
                    conversationTail = { id -> listOf(audioSource("tail-after-$id", 9_000L).queuedAudio()) },
                )
            }
        }
        elapse(100)
    }

    private fun elapse(millis: Long) {
        val until = compose.mainClock.currentTime + millis
        while (compose.mainClock.currentTime < until) compose.mainClock.advanceTimeByFrame()
    }

    private fun next(author: String) {
        val label = context.getString(R.string.feed_carousel_next)
        val action = compose.onNodeWithContentDescription(author).fetchSemanticsNode()
            .config[SemanticsActions.CustomActions].first { it.label == label }
        compose.runOnUiThread { action.action() }
    }

    @Test
    fun `les vocaux sont ranges par reception et la page d entree joue tout de suite avec sa suite`() {
        val player = FakeAudioFullscreenPlayer()
        show(player, start = "b")

        compose.onNodeWithText("2 / 3").assertExists()
        assertThat(player.starts).containsExactly("b")
        assertThat(player.upcomings.single()).containsExactly("c")
    }

    @Test
    fun `la fin d un vocal enchaine sur la page voisine, que l ecran suit`() {
        val player = FakeAudioFullscreenPlayer()
        show(player, start = "a")

        player.mutableActive.value = "b"
        elapse(2_000)

        compose.onNodeWithText("2 / 3").assertExists()
    }

    @Test
    fun `une page seulement traversee ne joue jamais`() {
        val player = FakeAudioFullscreenPlayer()
        show(player, start = "a")

        next("Ada")
        compose.mainClock.advanceTimeByFrame()
        next("Bea")
        elapse(2_000)

        assertThat(player.starts).containsExactly("a", "c").inOrder()
        compose.onNodeWithText("3 / 3").assertExists()
    }

    @Test
    fun `fermer rend la file de la conversation sans arreter la lecture`() {
        val player = FakeAudioFullscreenPlayer()
        val opened = androidx.compose.runtime.mutableStateOf(true)
        show(player, start = "a", opened = opened)

        compose.runOnUiThread { opened.value = false }
        elapse(100)

        assertThat(player.replaced.single()).containsExactly("tail-after-a")
        assertThat(player.mutablePlayback.value.isPlaying).isTrue()
    }
}
