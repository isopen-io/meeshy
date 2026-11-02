package me.meeshy.app.calls

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'écran d'appel entrant sur un petit téléphone (320 × 533 dp, un écran hdpi de 480 × 800 px), tous
 * ses contrôles montés : « Activer le son », « Message », Refuser et Répondre. Les actions tiennent
 * ENTIÈRES dans l'écran, sans se chevaucher, avec des cibles de 48 dp au moins, en police normale
 * comme en très grande police ; le nom de l'appelant ne passe jamais sous les actions et reste lisible
 * (sans défiler en police normale).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w320dp-h533dp")
class IncomingCallScreenFitTest {
    @get:Rule val rule = createComposeRule()

    private val incoming = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = false, callId = "c1")

    private val decline = "Decline. Declines the incoming call"
    private val accept = "Accept. Answers the incoming call"
    private val message = "Decline with a message"
    private val sound = "Turn on sound"

    private fun smallScreen(fontScale: Float) = rule.setContent {
        val density = LocalDensity.current
        CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
            MeeshyTheme {
                IncomingCallScreen(
                    state = CallPresenter.present(CallState.Ringing(false), incoming, CallMedia()),
                    peer = CallPeerVisual.EMPTY,
                    reduceMotion = true,
                    onAccept = {},
                    onDecline = {},
                    onDeclineWithMessage = {},
                    preview = CallPreviewUi(offersSound = true),
                )
            }
        }
    }

    private fun boundsOf(description: String): Rect =
        rule.onNodeWithContentDescription(description).fetchSemanticsNode().boundsInRoot

    private fun textBounds(text: String): Rect = rule.onNodeWithText(text).fetchSemanticsNode().boundsInRoot

    private fun screen(): Rect {
        val size = rule.onRoot().fetchSemanticsNode().size
        return Rect(0f, 0f, size.width.toFloat(), size.height.toFloat())
    }

    private fun assertActionsFitWithoutOverlap() {
        val screen = screen()
        val actions = listOf(sound, message, decline, accept).map { it to boundsOf(it) }
        actions.forEach { (name, bounds) ->
            assertWithMessage("$name top").that(bounds.top).isAtLeast(screen.top)
            assertWithMessage("$name bottom").that(bounds.bottom).isAtMost(screen.bottom)
            assertWithMessage("$name left").that(bounds.left).isAtLeast(screen.left)
            assertWithMessage("$name right").that(bounds.right).isAtMost(screen.right)
            assertWithMessage("$name height").that(bounds.height).isAtLeast(with(rule.density) { 47.5.dp.toPx() })
        }
        actions.forEachIndexed { index, (name, bounds) ->
            actions.drop(index + 1).forEach { (other, otherBounds) ->
                assertWithMessage("$name overlaps $other").that(bounds.overlaps(otherBounds)).isFalse()
            }
        }
    }

    private fun highestActionTop(): Float = listOf(sound, message, decline, accept).minOf { boundsOf(it).top }

    @Test
    fun `sur un petit ecran les quatre actions tiennent entieres sans se chevaucher`() {
        smallScreen(fontScale = 1f)

        assertActionsFitWithoutOverlap()
    }

    @Test
    fun `en tres grande police les quatre actions tiennent encore entieres sans se chevaucher`() {
        smallScreen(fontScale = 2f)

        assertActionsFitWithoutOverlap()
    }

    @Test
    fun `sur un petit ecran le nom et l'etat se lisent sans defiler au-dessus des actions`() {
        smallScreen(fontScale = 1f)

        val actionsTop = highestActionTop()
        listOf("Alice", "Incoming video call").forEach { text ->
            val bounds = textBounds(text)
            assertWithMessage("$text top").that(bounds.top).isAtLeast(0f)
            assertWithMessage("$text bottom").that(bounds.bottom).isAtMost(actionsTop)
            assertWithMessage("$text height").that(bounds.height).isGreaterThan(0f)
        }
    }

    @Test
    fun `en tres grande police le nom reste atteignable et ne passe pas sous les actions`() {
        smallScreen(fontScale = 2f)

        rule.onNodeWithText("Alice").performScrollTo().assertIsDisplayed()
        assertThat(textBounds("Alice").bottom).isAtMost(highestActionTop())
    }

    @Test
    fun `les actions offrent des cibles de 48 dp au moins sur un petit ecran`() {
        smallScreen(fontScale = 2f)

        listOf(sound, message, decline, accept).forEach { description ->
            rule.onNodeWithContentDescription(description).assertHeightIsAtLeast(48.dp).assertWidthIsAtLeast(48.dp)
        }
    }
}
