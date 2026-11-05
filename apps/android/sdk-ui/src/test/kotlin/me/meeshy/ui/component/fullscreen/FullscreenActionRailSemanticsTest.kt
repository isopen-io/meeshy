package me.meeshy.ui.component.fullscreen

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.AudioFullscreenOffer
import me.meeshy.ui.R
import me.meeshy.ui.component.audio.AudioFullscreenActionRail
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le rail d'actions du plein écran audio : des cibles de 48 dp, un libellé TalkBack par bouton, l'ordre de la charte § 6 et
 * RIEN quand l'offre est vide — un bouton n'existe que si l'offre le permet.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FullscreenActionRailSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    private val react get() = context.getString(R.string.media_react_title)
    private val reply get() = context.getString(R.string.media_reply_title)
    private val forward get() = context.getString(R.string.a11y_message_actions_forward)
    private val create get() = context.getString(R.string.media_compose_title)

    private class Taps {
        val received = mutableListOf<String>()
    }

    private val everything = AudioFullscreenOffer(react = true, reply = true, forward = true, compose = true)

    private fun show(offer: AudioFullscreenOffer, taps: Taps = Taps(), reactionOpen: Boolean = false) {
        compose.setContent {
            MeeshyTheme { Rail(offer, taps, reactionOpen) }
        }
        compose.waitForIdle()
    }

    @Composable
    private fun Rail(offer: AudioFullscreenOffer, taps: Taps, reactionOpen: Boolean) {
        AudioFullscreenActionRail(
            offer = offer,
            isReactionOpen = reactionOpen,
            isReplyOpen = false,
            onReact = { taps.received += "react" },
            onReply = { taps.received += "reply" },
            onForward = { taps.received += "forward" },
            onCompose = { taps.received += "compose" },
        )
    }

    @Test
    fun `chaque bouton du rail a une cible de 48 dp et un libelle TalkBack`() {
        show(everything)

        listOf(react, reply, forward, create).forEach { label ->
            compose.onNodeWithContentDescription(label)
                .assertHasClickAction()
                .assertWidthIsAtLeast(48.dp)
                .assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun `les boutons se suivent de haut en bas - reagir, repondre, transferer, creer`() {
        show(everything)

        val tops = listOf(react, reply, forward, create).map { label ->
            compose.onNodeWithContentDescription(label).getUnclippedBoundsInRoot().top
        }

        assertThat(tops).isInStrictOrder()
    }

    @Test
    fun `une offre vide ne pose aucun bouton`() {
        show(AudioFullscreenOffer.None)

        listOf(react, reply, forward, create).forEach { label ->
            compose.onNodeWithContentDescription(label).assertDoesNotExist()
        }
    }

    @Test
    fun `une action absente de l'offre n'a pas de bouton`() {
        show(AudioFullscreenOffer(react = false, reply = true, forward = true, compose = false))

        compose.onNodeWithContentDescription(react).assertDoesNotExist()
        compose.onNodeWithContentDescription(create).assertDoesNotExist()
        compose.onNodeWithContentDescription(reply).assertExists()
        compose.onNodeWithContentDescription(forward).assertExists()
    }

    @Test
    fun `chaque bouton declenche sa seule action`() {
        val taps = Taps()
        show(everything, taps)

        listOf(react, reply, forward, create).forEach { label -> compose.onNodeWithContentDescription(label).performClick() }

        assertThat(taps.received).containsExactly("react", "reply", "forward", "compose").inOrder()
    }
}
