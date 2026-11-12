package me.meeshy.app.calls

import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallLiveFrameProposalSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private fun show() = rule.setContent {
        MeeshyTheme { CallLiveFrameProposalCard(text = "Bob suggests the “Néon” frame", onAccept = {}, onDecline = {}) }
    }

    @Test
    fun `Appliquer et Non merci sont deux boutons d'au moins 48 dp`() {
        show()
        listOf("Apply", "No thanks").forEach { label ->
            rule.onNodeWithText(label)
                .assert(hasClickAction())
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
                .assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun `la phrase de proposition est lue telle quelle`() {
        show()
        rule.onNodeWithText("Bob suggests the “Néon” frame").assertExists()
    }

    @Test
    fun `la carte et la ligne de reponse sont annoncees poliment par TalkBack sans voler le focus`() {
        rule.setContent {
            MeeshyTheme {
                CallLiveFrameProposalCard(text = "Bob suggests the “Néon” frame", onAccept = {}, onDecline = {})
                CallLiveFrameNotice("Bob keeps their own view")
            }
        }
        rule.onAllNodes(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite)).assertCountEquals(2)
    }
}
