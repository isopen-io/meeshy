package me.meeshy.ui.component.audio

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.AudioFullscreenOffer
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les actions du plein écran audio montées sur l'écran : Réagir ouvre la bande des 15 réactions et son « + », une réaction
 * part au port puis referme la bande, Répondre monte la barre de l'hôte, tourner la page la referme — et la LECTURE n'est
 * jamais arrêtée par aucun de ces gestes.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioFullscreenActionsScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    private val sources = listOf(audioSource("a", 1_000L, "Ada"), audioSource("b", 2_000L, "Bea"))

    private class RecordingPort(var offer: AudioFullscreenOffer) : AudioFullscreenActionPort {
        val reacted = mutableListOf<Pair<String, String>>()
        val forwarded = mutableListOf<String>()
        val composed = mutableListOf<String>()
        val imaged = mutableListOf<String>()
        val replyBars = mutableListOf<String>()

        override fun offer(source: AudioFullscreenSource): AudioFullscreenOffer = offer

        override fun react(source: AudioFullscreenSource, emoji: String) {
            reacted += source.id to emoji
        }

        override fun forward(source: AudioFullscreenSource) {
            forwarded += source.id
        }

        override fun compose(source: AudioFullscreenSource) {
            composed += source.id
        }

        override fun imager(source: AudioFullscreenSource) {
            imaged += source.id
        }

        @Composable
        override fun ReplyBar(source: AudioFullscreenSource, accent: Color, onClose: () -> Unit) {
            replyBars += source.id
            androidx.compose.material3.Text("barre ${source.id}")
        }
    }

    private val everything = AudioFullscreenOffer(react = true, reply = true, forward = true, compose = true)

    private var dismissed = 0

    private fun show(player: FakeAudioFullscreenPlayer, port: AudioFullscreenActionPort?) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme {
                AudioFullscreenScreen(
                    sources = sources,
                    startAttachmentId = "a",
                    player = player,
                    accent = Color.Magenta,
                    onDismiss = { dismissed++ },
                    actions = port,
                )
            }
        }
        elapse(100)
    }

    private fun elapse(millis: Long) {
        val until = compose.mainClock.currentTime + millis
        while (compose.mainClock.currentTime < until) compose.mainClock.advanceTimeByFrame()
    }

    private fun tap(label: String) {
        compose.onNodeWithContentDescription(label).performClick()
        elapse(400)
    }

    private val laugh get() = context.getString(R.string.emoji_react_with, "\uD83D\uDE02")
    private val react get() = context.getString(R.string.media_react_title)
    private val reply get() = context.getString(R.string.media_reply_title)
    private val forward get() = context.getString(R.string.a11y_message_actions_forward)
    private val imager get() = context.getString(R.string.media_imager_title)

    @Test
    fun `sans port, le plein ecran n'a aucun rail`() {
        show(FakeAudioFullscreenPlayer(), port = null)

        compose.onAllNodesWithContentDescription(react).assertCountEquals(0)
    }

    @Test
    fun `avec une offre pleine le rail pose reagir, repondre et transferer`() {
        show(FakeAudioFullscreenPlayer(), RecordingPort(everything))

        compose.onNodeWithContentDescription(react).assertExists()
        compose.onNodeWithContentDescription(reply).assertExists()
        compose.onNodeWithContentDescription(forward).assertExists()
    }

    @Test
    fun `reagir ouvre la bande des reactions rapides, sans arreter la lecture`() {
        val player = FakeAudioFullscreenPlayer()
        show(player, RecordingPort(everything))

        tap(react)

        compose.onNodeWithContentDescription(laugh).assertExists()
        assertThat(player.toggles).isEqualTo(0)
    }

    @Test
    fun `choisir une reaction la passe au port et referme la bande`() {
        val port = RecordingPort(everything)
        show(FakeAudioFullscreenPlayer(), port)
        tap(react)

        compose.onNodeWithContentDescription(laugh).performClick()
        elapse(400)

        assertThat(port.reacted).containsExactly("a" to "😂")
        compose.onAllNodesWithContentDescription(laugh).assertCountEquals(0)
    }

    @Test
    fun `repondre monte la barre de l'hote pour la page posee, sans arreter la lecture`() {
        val player = FakeAudioFullscreenPlayer()
        val port = RecordingPort(everything)
        show(player, port)

        tap(reply)

        compose.onNodeWithText("barre a").assertExists()
        assertThat(player.toggles).isEqualTo(0)
        assertThat(player.mutablePlayback.value.isPlaying).isTrue()
    }

    @Test
    fun `transferer passe la page posee au port`() {
        val port = RecordingPort(everything)
        show(FakeAudioFullscreenPlayer(), port)

        tap(forward)

        assertThat(port.forwarded).containsExactly("a")
    }

    @Test
    fun `tourner la page referme la barre de reponse`() {
        val port = RecordingPort(everything)
        show(FakeAudioFullscreenPlayer(), port)
        tap(reply)
        val action = compose.onNodeWithContentDescription("Ada").fetchSemanticsNode()
            .config[SemanticsActions.CustomActions].first { it.label == context.getString(R.string.feed_carousel_next) }

        compose.runOnUiThread { action.action() }
        elapse(1_000)

        compose.onNodeWithText("barre a").assertDoesNotExist()
    }

    @Test
    fun `une offre vide ne pose ni rail ni bande`() {
        show(FakeAudioFullscreenPlayer(), RecordingPort(AudioFullscreenOffer.None))

        compose.onAllNodesWithContentDescription(react).assertCountEquals(0)
    }

    @Test
    fun `la baguette du rail image le message porteur de la page posee, puis ferme le plein ecran (#16334)`() {
        val port = RecordingPort(everything.copy(imager = true))
        show(FakeAudioFullscreenPlayer(), port)

        tap(imager)

        assertThat(port.imaged).containsExactly("a")
        assertThat(dismissed).isEqualTo(1)
    }

    @Test
    fun `sans verdict de la carte, le rail ne pose pas la baguette (#16334)`() {
        show(FakeAudioFullscreenPlayer(), RecordingPort(everything))

        compose.onAllNodesWithContentDescription(imager).assertCountEquals(0)
    }
}
