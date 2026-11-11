package me.meeshy.app.calls

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionFamily
import me.meeshy.sdk.model.call.CallActionFamilyRow
import me.meeshy.sdk.model.call.CallRailsLayout
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #17327 — les deux rails du duo : « Mon image » au début, « L'appel » à la fin, des cibles de 48 dp, chaque bouton passe
 * par le même rappel que les rangées de la pilule, et un rail qui n'a plus de rangée repart.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class CallActionRailsTest {
    private companion object {
        const val RAILS_TOP_DP = 56f
    }

    @get:Rule val rule = createComposeRule()

    private fun item(action: CallAction, label: Int, kind: CallPillKind = CallPillKind.Normal) =
        CallPillItem(action = action, icon = MeeshyIcons.MagicWand, labelRes = label, kind = kind, isToggle = kind != CallPillKind.Normal)

    private val items = mapOf(
        CallAction.Camera to item(CallAction.Camera, R.string.call_action_camera, CallPillKind.Active),
        CallAction.Effects to item(CallAction.Effects, R.string.call_control_effects),
        CallAction.Captions to item(CallAction.Captions, R.string.call_action_speaker),
    )

    private val both = listOf(
        CallActionFamilyRow(CallActionFamily.MyImage, listOf(CallAction.Camera, CallAction.Effects)),
        CallActionFamilyRow(CallActionFamily.TheCall, listOf(CallAction.Captions)),
    )

    private fun show(
        rows: List<CallActionFamilyRow>,
        dimmed: Set<CallAction> = emptySet(),
        onAction: (CallAction) -> Unit = {},
    ) {
        rule.setContent { MeeshyTheme { CallActionRails(rows, items, dimmed, onAction, bottomClearance = 0.dp) } }
    }

    @Test
    fun `each rail is named by its family and holds its buttons in order`() {
        show(both)
        rule.onNodeWithContentDescription("My image").assertExists()
        rule.onNodeWithContentDescription("The call").assertExists()
        val camera = rule.onNodeWithContentDescription("Camera").fetchSemanticsNode().boundsInRoot
        val effects = rule.onNodeWithContentDescription("Effects").fetchSemanticsNode().boundsInRoot
        assertThat(camera.top).isLessThan(effects.top)
    }

    @Test
    fun `a button of a rail runs the same callback as a row of the pill`() {
        val actions = mutableListOf<CallAction>()
        show(both) { actions += it }
        rule.onNodeWithContentDescription("Effects").assertHasClickAction().performClick()
        rule.onNodeWithContentDescription("Speaker").performClick()
        assertThat(actions).containsExactly(CallAction.Effects, CallAction.Captions).inOrder()
    }

    @Test
    fun `every rail button is a 48 dp target`() {
        show(both)
        listOf("Camera", "Effects", "Speaker").forEach {
            val node = rule.onNodeWithContentDescription(it).fetchSemanticsNode()
            assertThat(node.size.width).isAtLeast(CallRailsLayout.BUTTON_SIDE_DP.toInt())
            assertThat(node.size.height).isAtLeast(CallRailsLayout.BUTTON_SIDE_DP.toInt())
        }
    }

    @Test
    fun `my image sits on the leading edge and the call on the trailing edge`() {
        show(both)
        val mine = rule.onNodeWithContentDescription("My image").fetchSemanticsNode().boundsInRoot
        val call = rule.onNodeWithContentDescription("The call").fetchSemanticsNode().boundsInRoot
        assertThat(mine.right).isLessThan(call.left)
        assertThat(mine.left).isAtMost(CallRailsLayout.EDGE_INSET_DP + 1f)
    }

    @Test
    fun `right to left turns the rails round with the rest of the screen`() {
        rule.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    CallActionRails(both, items, emptySet(), {}, bottomClearance = 0.dp)
                }
            }
        }
        val mine = rule.onNodeWithContentDescription("My image").fetchSemanticsNode().boundsInRoot
        val call = rule.onNodeWithContentDescription("The call").fetchSemanticsNode().boundsInRoot
        assertThat(mine.left).isGreaterThan(call.right)
    }

    @Test
    fun `the rails are centered on the free height`() {
        show(both)
        val rail = rule.onNodeWithContentDescription("My image").fetchSemanticsNode().boundsInRoot
        val screen = rule.onRoot().fetchSemanticsNode().boundsInRoot.height
        assertThat((rail.top + rail.bottom) / 2).isWithin(1f).of((RAILS_TOP_DP + screen) / 2)
    }

    @Test
    fun `without rows no rail is drawn, and a rail that loses its rows leaves`() {
        var rows by mutableStateOf(both)
        rule.setContent { MeeshyTheme { CallActionRails(rows, items, emptySet(), {}, bottomClearance = 0.dp) } }
        rule.onNodeWithContentDescription("The call").assertExists()
        rows = emptyList()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("The call").assertDoesNotExist()
        rule.onNodeWithContentDescription("My image").assertDoesNotExist()
    }

    @Test
    fun `a rail button touched while its rail leaves relights the controls first (G2_7)`() {
        var rows by mutableStateOf(both)
        var revived = 0
        val actions = mutableListOf<CallAction>()
        rule.setContent {
            MeeshyTheme {
                CallActionRails(rows, items, emptySet(), { actions += it }, bottomClearance = 0.dp, onRevive = { revived++ })
            }
        }
        rule.mainClock.autoAdvance = false
        rows = emptyList()
        rule.waitForIdle()
        rule.mainClock.advanceTimeBy(100)

        rule.onNodeWithContentDescription("Effects").performClick()

        assertThat(revived).isAtLeast(1)
        assertThat(actions).containsExactly(CallAction.Effects)
    }

    @Test
    fun `a rail that stays does not ask for the controls, they are already there`() {
        var revived = 0
        rule.setContent {
            MeeshyTheme { CallActionRails(both, items, emptySet(), {}, bottomClearance = 0.dp, onRevive = { revived++ }) }
        }
        rule.onNodeWithContentDescription("Effects").performClick()
        assertThat(revived).isEqualTo(0)
    }
}
