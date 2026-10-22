package me.meeshy.ui.component.fullscreen

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le contrat d'accessibilité et de toucher du chrome plein écran : des cibles de 48 dp, un chrome
 * qui s'efface et n'intercepte plus rien, mais dont TalkBack garde UN relais pour le ramener.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FullscreenChromeSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private class Taps {
        var media = 0
        var close = 0
        var reveal = 0
        var action = 0
    }

    private fun showChromeOverMedia(chromeVisible: Boolean, taps: Taps) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize().testTag(MEDIA_TAG).clickable { taps.media++ })
                    FullscreenChromeVisibility(visible = chromeVisible, onReveal = { taps.reveal++ }) {
                        FullscreenCloseButton(
                            onClick = { taps.close++ },
                            modifier = Modifier.align(Alignment.TopStart),
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    private fun showAction(content: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme { content() } }
        compose.waitForIdle()
    }

    // --- cibles et sémantique du chrome visible --------------------------------------------

    @Test
    fun `le bouton de fermeture d'un chrome visible est cliquable avec une cible de 48 dp`() {
        showChromeOverMedia(chromeVisible = true, taps = Taps())

        compose.onNodeWithContentDescription(CLOSE)
            .assertHasClickAction()
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `un toucher sur la croix visible ferme, il n'atteint pas le media`() {
        val taps = Taps()
        showChromeOverMedia(chromeVisible = true, taps = taps)

        compose.onNodeWithContentDescription(CLOSE).performClick()

        assertThat(taps.close).isEqualTo(1)
        assertThat(taps.media).isEqualTo(0)
    }

    // --- le chrome qui s'efface ------------------------------------------------------------

    @Test
    fun `un chrome efface n'intercepte plus les touches - le media les recoit`() {
        val taps = Taps()
        showChromeOverMedia(chromeVisible = false, taps = taps)

        compose.onNodeWithTag(MEDIA_TAG).performTouchInput { click(Offset(24f, 24f)) }

        assertThat(taps.media).isEqualTo(1)
        assertThat(taps.close).isEqualTo(0)
        assertThat(taps.reveal).isEqualTo(0)
    }

    @Test
    fun `un chrome efface sort de l'arbre d'accessibilite - TalkBack ne lit plus des boutons invisibles`() {
        showChromeOverMedia(chromeVisible = false, taps = Taps())

        compose.onNodeWithContentDescription(CLOSE).assertDoesNotExist()
    }

    @Test
    fun `un chrome efface laisse un relais d'accessibilite qui le ramene`() {
        val taps = Taps()
        showChromeOverMedia(chromeVisible = false, taps = taps)

        compose.onNodeWithContentDescription(SHOW_CONTROLS)
            .assertHasClickAction()
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
            .performSemanticsAction(SemanticsActions.OnClick)

        assertThat(taps.reveal).isEqualTo(1)
    }

    @Test
    fun `un chrome visible n'a pas de relais - ses boutons parlent d'eux-memes`() {
        showChromeOverMedia(chromeVisible = true, taps = Taps())

        compose.onNodeWithContentDescription(SHOW_CONTROLS).assertDoesNotExist()
    }

    // --- les actions du rail ---------------------------------------------------------------

    @Test
    fun `reagir ouvert s'annonce selectionne, ferme il n'annonce rien`() {
        showAction {
            Box {
                FullscreenReactAction(isOpen = true, onClick = {}, label = "React")
                FullscreenReplyAction(onClick = {}, isOpen = false, label = "Reply")
            }
        }

        compose.onNodeWithContentDescription("React").assertIsSelected()
        compose.onNodeWithContentDescription("Reply")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
    }

    @Test
    fun `une action flottante lit son compteur comme une valeur et ecrit sa legende`() {
        showAction {
            FullscreenActionButton(
                icon = FullscreenChromeSymbol.Like.icon,
                label = "Like",
                onClick = {},
                style = FullscreenActionStyle.Floating(),
                caption = "12",
                accessibilityValue = "12 likes",
            )
        }

        compose.onNodeWithContentDescription("Like")
            .assertHasClickAction()
            .assertHeightIsAtLeast(48.dp)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "12 likes"))
        compose.onNodeWithText("12", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `une action en disque garde une cible de 48 dp et declenche son clic`() {
        val taps = Taps()
        showAction {
            FullscreenActionButton(
                icon = FullscreenChromeSymbol.Share.icon,
                label = "Share",
                onClick = { taps.action++ },
                style = FullscreenActionStyle.Disc(),
            )
        }

        compose.onNodeWithContentDescription("Share")
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
            .performClick()

        assertThat(taps.action).isEqualTo(1)
    }

    @Test
    fun `une action qui porte un geste sequence de l'hote reste cliquable pour TalkBack`() {
        val taps = Taps()
        showAction {
            FullscreenActionButton(
                icon = FullscreenChromeSymbol.Like.icon,
                label = "Like",
                onClick = { taps.action++ },
                handlesTapViaGesture = true,
            )
        }

        compose.onNodeWithContentDescription("Like")
            .assertHasClickAction()
            .performSemanticsAction(SemanticsActions.OnClick)

        assertThat(taps.action).isEqualTo(1)
    }

    @Test
    fun `la rangee d'emojis pose l'emoji touche`() {
        val reacted = mutableListOf<String>()
        val first = EmojiCatalog.defaultQuickReactions.first()
        showAction { FullscreenReactionStrip(onReact = { reacted += it }) }

        compose.onNodeWithContentDescription("React with $first").performClick()

        assertThat(reacted).containsExactly(first)
    }

    @Test
    fun `les voiles ne prennent aucun toucher`() {
        val taps = Taps()
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize().testTag(MEDIA_TAG).clickable { taps.media++ })
                    FullscreenScrims(topInset = 24.dp, chromeVisible = true)
                }
            }
        }
        compose.waitForIdle()

        compose.onNodeWithTag(MEDIA_TAG).performTouchInput { click(Offset(10f, 10f)) }

        assertThat(taps.media).isEqualTo(1)
    }

    private companion object {
        const val MEDIA_TAG = "media"
        const val CLOSE = "Close"
        const val SHOW_CONTROLS = "Show controls"
    }
}
