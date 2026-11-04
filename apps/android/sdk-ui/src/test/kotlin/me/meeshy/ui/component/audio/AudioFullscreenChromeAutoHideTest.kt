package me.meeshy.ui.component.audio

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.test.core.app.ApplicationProvider
import me.meeshy.ui.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le chrome du plein écran audio s'efface après trois secondes d'écoute, jamais à l'arrêt, et revient à la pause. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioFullscreenChromeAutoHideTest {

    @get:Rule
    val compose = createComposeRule()

    private val close get() = ApplicationProvider.getApplicationContext<android.content.Context>().getString(R.string.fullscreen_close)

    private fun show(player: FakeAudioFullscreenPlayer) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            AudioFullscreenScreen(
                sources = listOf(audioSource("a", 1_000L)),
                startAttachmentId = "a",
                player = player,
                accent = Color.Magenta,
                onDismiss = {},
            )
        }
        elapse(50)
    }

    private fun elapse(millis: Long) {
        val until = compose.mainClock.currentTime + millis
        while (compose.mainClock.currentTime < until) compose.mainClock.advanceTimeByFrame()
    }

    @Test
    fun `pendant l ecoute le chrome s efface apres trois secondes, pas avant`() {
        val player = FakeAudioFullscreenPlayer()
        show(player)

        elapse(2_500)
        compose.onNodeWithContentDescription(close).assertExists()

        elapse(1_000)
        compose.onNodeWithContentDescription(close).assertDoesNotExist()
    }

    @Test
    fun `a l arret le chrome reste`() {
        val player = FakeAudioFullscreenPlayer()
        show(player)
        compose.runOnUiThread { player.togglePlayPause() }

        elapse(10_000)

        compose.onNodeWithContentDescription(close).assertExists()
    }

    @Test
    fun `la pause ramene le chrome efface`() {
        val player = FakeAudioFullscreenPlayer()
        show(player)
        elapse(3_500)
        compose.onNodeWithContentDescription(close).assertDoesNotExist()

        compose.runOnUiThread { player.togglePlayPause() }
        elapse(500)

        compose.onNodeWithContentDescription(close).assertExists()
    }
}
