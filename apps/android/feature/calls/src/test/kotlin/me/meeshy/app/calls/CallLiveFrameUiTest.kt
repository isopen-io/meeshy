package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallLiveFrameUiTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun `la carte de proposition dit qui propose quoi et rend le choix a l'utilisateur`() {
        var accepted = 0
        var declined = 0
        rule.setContent {
            MeeshyTheme {
                CallLiveFrameProposalCard(text = "Bob suggests the “Néon” frame", onAccept = { accepted++ }, onDecline = { declined++ })
            }
        }
        rule.onNodeWithText("Bob suggests the “Néon” frame").assertExists()
        rule.onNodeWithText("No thanks").performClick()
        rule.onNodeWithText("Apply").performClick()
        assertThat(declined).isEqualTo(1)
        assertThat(accepted).isEqualTo(1)
    }

    @Test
    fun `la reponse de l'autre est une ligne d'etat, jamais un toast`() {
        rule.setContent { MeeshyTheme { CallLiveFrameNotice("Bob keeps their own view") } }
        rule.onNodeWithText("Bob keeps their own view").assertExists()
        assertThat(CallLiveFrameReply.DECLINED.wire).isEqualTo("declined")
    }

    @Test
    fun `le choix du cadre propose Aucun cadre puis les cadres en direct, et en toucher un l'applique`() {
        val social = io.mockk.mockk<me.meeshy.sdk.socket.CallSocialSignalManager> {
            io.mockk.every { frameSelected } returns kotlinx.coroutines.flow.MutableSharedFlow()
            io.mockk.coEvery { selectCallLiveFrame(any(), any(), any(), any()) } returns Result.success(Unit)
        }
        val session = io.mockk.mockk<me.meeshy.sdk.session.SessionRepository> {
            io.mockk.every { currentUser } returns kotlinx.coroutines.flow.MutableStateFlow<me.meeshy.sdk.model.MeeshyUser?>(null)
        }
        val controller = CallLiveFrameController(social, session)
        controller.onTransition(
            me.meeshy.sdk.model.call.CallState.Idle, me.meeshy.sdk.model.call.CallState.Connected,
            CallSessionInfo("call-1", CallConfig.EMPTY),
        )
        val first = me.meeshy.sdk.model.call.frames.CallLiveFrameRule.frames(
            me.meeshy.sdk.model.call.frames.CallLiveFrameRule.moods().first(),
        ).first()
        rule.setContent { MeeshyTheme { CallLiveFramePicker(controller, peerName = "Bob", onClose = {}) } }
        rule.onNodeWithText("No frame").assertExists()
        rule.onNode(androidx.compose.ui.test.hasContentDescription("Close")).assertExists()
        rule.onNode(androidx.compose.ui.test.hasContentDescription("Minimize call")).assertDoesNotExist()
        rule.onNode(androidx.compose.ui.test.hasContentDescription(first.name)).performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        rule.waitForIdle()
        assertThat(controller.state.value.frameId).isEqualTo(first.id)
        io.mockk.coVerify { social.selectCallLiveFrame("call-1", first.id, any(), null) }
        controller.onCleared()
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallFrameDeclinationPagerTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun `la vignette du cadre choisi dit sa declinaison et passe a la suivante sans souris ni glisse`() {
        val base = me.meeshy.sdk.model.call.frames.CallLiveFrameRule.frames().first { it.styles.isNotEmpty() }
        val declinations = me.meeshy.sdk.model.call.frames.CallFrameStyleRule.declinations(base.id)
        var chosen: String? = null
        rule.setContent {
            MeeshyTheme {
                CallFrameDeclinationPager(declinations, selected = base.id, onSelect = { chosen = it }) { androidx.compose.material3.Text(it.id) }
            }
        }
        rule.onNode(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "Version 1 of ${declinations.size}")).assertExists()
        val node = rule.onNode(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "Version 1 of ${declinations.size}")).fetchSemanticsNode()
        val next = node.config[androidx.compose.ui.semantics.SemanticsActions.CustomActions].first { it.label == "Next version" }
        rule.runOnIdle { next.action() }
        assertThat(chosen).isEqualTo(declinations[1].id)
    }
}
